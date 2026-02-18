/**
 * Browser-side parsers for MCP tool results.
 *
 * These parsers intentionally avoid importing the Zod schemas defined in
 * types/types.ts (e.g. DepartmentsSchema, SearchMuseumObjectsStructuredContentSchema).
 * Importing those schemas would pull the entire Zod library (~110 kb) into the
 * browser bundle. The server already validates structuredContent with Zod before
 * it reaches the UI, so lightweight runtime shape-checks are sufficient here.
 */
import type { ToolResult } from '../shared/types.js';
import { extractText, isNonNullObject } from '../shared/utils.js';

export interface Department {
  departmentId: number;
  displayName: string;
}

export interface ParsedSearchResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  objectIDs: number[];
}

export interface ExplorerLaunchState {
  q?: string;
  hasImages?: boolean;
  title?: boolean;
  departmentId?: number;
}

function getStructuredValue(result: ToolResult): Record<string, unknown> | null {
  const value = result?.structuredContent;
  if (isNonNullObject(value)) {
    return value;
  }
  return null;
}

export function parseDepartments(result: ToolResult): Department[] {
  const structured = getStructuredValue(result);
  if (structured && Array.isArray(structured.departments)) {
    const departments: Department[] = [];
    for (const dept of structured.departments) {
      if (
        isNonNullObject(dept)
        && typeof dept.departmentId === 'number'
        && typeof dept.displayName === 'string'
      ) {
        departments.push({
          departmentId: dept.departmentId,
          displayName: dept.displayName,
        });
      }
    }
    if (departments.length > 0) {
      return departments;
    }
  }

  const text = extractText(result);
  return text
    .split('\n')
    .map((line) => {
      const match = line.match(/^Department ID:\s*(\d+),\s*Display Name:\s*(\S(?:.*\S)?)$/);
      if (!match) {
        return null;
      }
      return {
        departmentId: Number(match[1]),
        displayName: match[2],
      };
    })
    .filter((item): item is Department => item !== null);
}

export function parseSearchResult(
  result: ToolResult,
  requestedPage: number,
  requestedPageSize: number,
): ParsedSearchResult {
  const structured = getStructuredValue(result);
  if (structured) {
    const { total, page, pageSize, totalPages, objectIDs } = structured;
    if (
      typeof total === 'number'
      && typeof page === 'number'
      && typeof pageSize === 'number'
      && typeof totalPages === 'number'
      && Array.isArray(objectIDs)
      && objectIDs.every(id => typeof id === 'number')
    ) {
      return { total, page, pageSize, totalPages, objectIDs };
    }
  }

  const text = extractText(result);
  if (text.includes('No objects found')) {
    return { total: 0, page: 1, pageSize: requestedPageSize, totalPages: 0, objectIDs: [] };
  }

  const totalMatch = text.match(/Total objects found:\s*(\d+)/);
  const pageMatch = text.match(/Page:\s*(\d+)\s*\/\s*(\d+)/);
  const idsMatch = text.match(/Object IDs:\s*([\d,\s]+)/);
  const ids = idsMatch
    ? idsMatch[1]
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .map(id => Number(id))
        .filter(id => Number.isFinite(id))
    : [];
  const total = totalMatch ? Number(totalMatch[1]) : ids.length;
  const page = pageMatch ? Number(pageMatch[1]) : requestedPage;
  const totalPages = pageMatch
    ? Number(pageMatch[2])
    : total > 0
      ? Math.ceil(total / requestedPageSize)
      : 0;
  const start = (page - 1) * requestedPageSize;
  const objectIDs = pageMatch ? ids : ids.slice(start, start + requestedPageSize);

  return {
    total,
    page,
    pageSize: requestedPageSize,
    totalPages,
    objectIDs,
  };
}

export function parseExplorerLaunchState(result: ToolResult): ExplorerLaunchState | undefined {
  const structured = getStructuredValue(result);
  if (!structured || !isNonNullObject(structured.initialState)) {
    return undefined;
  }

  const state = structured.initialState;
  const launch: ExplorerLaunchState = {};

  if (typeof state.q === 'string') {
    launch.q = state.q;
  }
  if (typeof state.hasImages === 'boolean') {
    launch.hasImages = state.hasImages;
  }
  if (typeof state.title === 'boolean') {
    launch.title = state.title;
  }
  if (typeof state.departmentId === 'number') {
    launch.departmentId = state.departmentId;
  }

  return launch;
}
