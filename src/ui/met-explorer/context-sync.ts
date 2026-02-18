import type { App } from '@modelcontextprotocol/ext-apps';
import type { AppState } from './state.js';
import { isNonNullObject } from '../shared/utils.js';

interface SearchResultsContextPayload {
  source: 'met-explorer-app';
  type: 'visible-results-page';
  query: string;
  hasImages: boolean;
  titleOnly: boolean;
  departmentId: number | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
  results: Array<{
    objectID: number;
    title: string;
    artistDisplayName: string;
    department: string;
  }>;
}

interface OpenAIWidgetApi {
  widgetState?: unknown;
  setWidgetState: (nextState: unknown) => void;
}

export interface SearchResultsContextSyncState {
  state: Pick<
    AppState,
    | 'searchRequest'
    | 'results'
    | 'currentPage'
    | 'totalPages'
    | 'totalResults'
    | 'pageSize'
    | 'lastResultsContextSignature'
  >;
}

function buildSearchResultsContextText(state: SearchResultsContextSyncState): string | null {
  if (!state.state.searchRequest || !state.state.results.length) {
    return null;
  }

  const queryLine = `Query: "${state.state.searchRequest.q}"`;
  const pageLine = `Page: ${state.state.currentPage}/${Math.max(state.state.totalPages, 1)} (${state.state.totalResults} total results)`;
  const resultLines = state.state.results
    .map(result => `- ${result.objectID} | ${result.title} | ${result.artistDisplayName}`)
    .join('\n');

  return [
    `Met Explorer results for ${queryLine}`,
    pageLine,
    '',
    resultLines,
    '',
    'These results are already available — no need to call search-museum-objects for this data.',
    'In your response, state explicitly that you can see the current visible results.',
    'Say this naturally in your own words (no fixed template sentence required).',
    'You can curate recommendations directly from these visible results and cite titles/object IDs from this list.',
  ].join('\n');
}

function buildSearchResultsStructuredPayload(
  state: SearchResultsContextSyncState,
): SearchResultsContextPayload | null {
  if (!state.state.searchRequest || !state.state.results.length) {
    return null;
  }

  return {
    source: 'met-explorer-app',
    type: 'visible-results-page',
    query: state.state.searchRequest.q,
    hasImages: state.state.searchRequest.hasImages,
    titleOnly: state.state.searchRequest.title,
    departmentId: state.state.searchRequest.departmentId ?? null,
    page: state.state.currentPage,
    pageSize: state.state.pageSize,
    totalPages: Math.max(state.state.totalPages, 1),
    totalResults: state.state.totalResults,
    results: state.state.results.map(result => ({
      objectID: result.objectID,
      title: result.title,
      artistDisplayName: result.artistDisplayName,
      department: result.department,
    })),
  };
}

function getSearchResultsContextSignature(
  state: SearchResultsContextSyncState,
  text: string,
): string {
  return `${state.state.searchRequest?.q ?? ''}|${state.state.currentPage}|${text}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isNonNullObject(value) || Array.isArray(value)) {
    return {};
  }

  return value;
}

function getOpenAIWidgetApi(): OpenAIWidgetApi | null {
  const candidate = (window as Window & { openai?: unknown }).openai;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const api = candidate as Partial<OpenAIWidgetApi>;
  if (typeof api.setWidgetState !== 'function') {
    return null;
  }

  return api as OpenAIWidgetApi;
}

function debugContextSync(message: string, details?: unknown): void {
  if (details === undefined) {
    globalThis.console?.debug(message);
    return;
  }

  globalThis.console?.debug(message, details);
}

function syncResultsToOpenAIWidgetState(
  openAIWidget: OpenAIWidgetApi,
  text: string,
  structuredContent: SearchResultsContextPayload,
  signature: string,
): void {
  const currentWidgetState = asRecord(openAIWidget.widgetState);
  const currentPrivateContent = asRecord(currentWidgetState.privateContent);

  openAIWidget.setWidgetState({
    ...currentWidgetState,
    modelContent: {
      source: 'met-explorer-app',
      type: 'visible-results-page',
      summary: text,
      visibleResults: structuredContent,
    },
    privateContent: {
      ...currentPrivateContent,
      metExplorer: {
        signature,
        visibleResults: structuredContent,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

async function trySyncSearchResultsContext(
  app: App,
  text: string,
  structuredContent: SearchResultsContextPayload,
): Promise<boolean> {
  const failures: Array<{ attempt: string; error: unknown }> = [];

  try {
    await app.updateModelContext({
      content: [{ type: 'text', text }],
      structuredContent,
    });
    debugContextSync('[met-explorer] Synced results context via updateModelContext(content + structuredContent).');
    return true;
  }
  catch (error) {
    failures.push({
      attempt: 'content + structuredContent',
      error,
    });
    // Retry with plain text only for hosts that reject structured content.
  }

  try {
    await app.updateModelContext({
      content: [{ type: 'text', text }],
    });
    debugContextSync('[met-explorer] Synced results context via updateModelContext(content only).');
    return true;
  }
  catch (error) {
    failures.push({
      attempt: 'content only',
      error,
    });
    // Retry with structured only for hosts that reject text blocks.
  }

  try {
    await app.updateModelContext({
      structuredContent,
    });
    debugContextSync('[met-explorer] Synced results context via updateModelContext(structuredContent only).');
    return true;
  }
  catch (error) {
    failures.push({
      attempt: 'structuredContent only',
      error,
    });
    debugContextSync('[met-explorer] Failed to sync results context with all updateModelContext payload shapes.', failures);
    return false;
  }
}

export async function syncSearchResultsToModelContext(
  app: App,
  state: SearchResultsContextSyncState,
): Promise<string | null> {
  const text = buildSearchResultsContextText(state);
  const structuredContent = buildSearchResultsStructuredPayload(state);
  if (!text || !structuredContent) {
    return state.state.lastResultsContextSignature;
  }

  const signature = getSearchResultsContextSignature(state, text);
  if (signature === state.state.lastResultsContextSignature) {
    return state.state.lastResultsContextSignature;
  }

  const openAIWidget = getOpenAIWidgetApi();
  if (openAIWidget) {
    try {
      // OpenAI-hosted clients expose window.openai.setWidgetState().
      // When available, we prefer that channel for visible-results sync because
      // it is reliably consumed by the model for widget-scoped state.
      // Non-OpenAI hosts (or failures here) fall back to updateModelContext below.
      syncResultsToOpenAIWidgetState(openAIWidget, text, structuredContent, signature);
      return signature;
    }
    catch (error) {
      console.warn('Failed to sync search results via openai widgetState:', error);
    }
  }

  try {
    const synced = await trySyncSearchResultsContext(app, text, structuredContent);
    if (synced) {
      return signature;
    }
    console.warn('Failed to sync search results via updateModelContext.');
    return state.state.lastResultsContextSignature;
  }
  catch (error) {
    console.warn('Failed to sync search results via updateModelContext:', error);
    return state.state.lastResultsContextSignature;
  }
}
