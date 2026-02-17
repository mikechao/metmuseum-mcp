/**
 * Centralized constants for the Met Museum MCP server.
 * Update values here instead of hunting through files.
 */

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Default timeout for requests to the Met Museum Collection API.
 * Can be overridden via MET_API_TIMEOUT_MS environment variable.
 */
export const DEFAULT_MET_API_TIMEOUT_MS = 10_000;

/**
 * Maximum requests per second to send to the Met Museum API.
 * The rate limiter enforces this ceiling to avoid being throttled.
 */
export const MET_API_RATE_LIMIT_PER_SECOND = 80;

/**
 * Default cache TTL for the departments list.
 * Departments change rarely, so keeping this warm reduces explorer cold starts.
 */
export const DEFAULT_DEPARTMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Search & Pagination Defaults
// ============================================================================

/**
 * Default page size for search results in the UI.
 * This balances UI responsiveness with API efficiency.
 */
export const DEFAULT_SEARCH_PAGE_SIZE = 12;

/**
 * Default page size for the search-museum-objects tool.
 * This is exposed to users as the default `pageSize` parameter.
 */
export const DEFAULT_SEARCH_TOOL_PAGE_SIZE = 24;

/**
 * Maximum page size allowed by the Met Museum API.
 */
export const MAX_SEARCH_PAGE_SIZE = 100;

// ============================================================================
// UI Concurrency
// ============================================================================

/**
 * Number of object detail requests to run concurrently when hydrating search results.
 * Higher values = faster loading but more simultaneous requests.
 */
export const OBJECT_HYDRATION_CONCURRENCY = 4;
