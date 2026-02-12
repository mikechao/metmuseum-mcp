import type { ToolResult } from '../shared/types.js';
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

export function getStructuredValue(result: ToolResult): Record<string, unknown> | null {
  const value = result?.structuredContent;
  if (value && typeof value === 'object') {
    return value;
  }
  return null;
}

export function parseDepartments(result: ToolResult): Department[] {
  const structured = getStructuredValue(result);
  if (Array.isArray(structured?.departments)) {
    return structured.departments as Department[];
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
  if (structured && typeof structured.total === 'number' && Array.isArray(structured.objectIDs)) {
    const total = structured.total as number;
    const pageSize
      = typeof structured.pageSize === 'number' && structured.pageSize > 0
        ? structured.pageSize
        : requestedPageSize;
    const page
      = typeof structured.page === 'number' && structured.page > 0
        ? structured.page
        : requestedPage;
    const totalPages
      = typeof structured.totalPages === 'number' && structured.totalPages >= 0
        ? structured.totalPages
        : total > 0
          ? Math.ceil(total / pageSize)
          : 0;
    const hasServerPagination
      = typeof structured.page === 'number'
        && typeof structured.pageSize === 'number'
        && typeof structured.totalPages === 'number';
    const start = (page - 1) * pageSize;
    const objectIDs = hasServerPagination
      ? (structured.objectIDs as number[])
      : (structured.objectIDs as number[]).slice(start, start + pageSize);

    return {
      total,
      page,
      pageSize,
      totalPages,
      objectIDs,
    };
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
