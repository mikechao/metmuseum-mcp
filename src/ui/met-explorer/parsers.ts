import type z from 'zod';
import type { ToolResult } from '../shared/types.js';
import {
  DepartmentsSchema,
  OpenMetExplorerStructuredContentSchema,
  SearchMuseumObjectsStructuredContentSchema,
} from '../../types/types.js';
import { extractText } from '../shared/utils.js';

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

export type ExplorerLaunchState = z.infer<typeof OpenMetExplorerStructuredContentSchema>['initialState'];

export function getStructuredValue(result: ToolResult): Record<string, unknown> | null {
  const value = result?.structuredContent;
  if (value && typeof value === 'object') {
    return value;
  }
  return null;
}

export function parseDepartments(result: ToolResult): Department[] {
  const structured = getStructuredValue(result);
  if (structured) {
    const parsed = DepartmentsSchema.safeParse(structured);
    if (parsed.success) {
      return parsed.data.departments;
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
    const parsed = SearchMuseumObjectsStructuredContentSchema.safeParse(structured);
    if (parsed.success) {
      return parsed.data;
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
  if (!structured) {
    return undefined;
  }

  const parsed = OpenMetExplorerStructuredContentSchema.safeParse(structured);
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data.initialState;
}
