import type { App } from '@modelcontextprotocol/ext-apps';

interface SearchResultContextItem {
  objectID: number;
  title: string;
  artistDisplayName: string;
  department: string;
}

interface SearchRequestContext {
  q: string;
  hasImages: boolean;
  title: boolean;
  departmentId?: number;
}

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
  results: SearchResultContextItem[];
}

interface OpenAIWidgetApi {
  widgetState?: unknown;
  setWidgetState: (nextState: unknown) => void;
}

export interface SearchResultsContextSyncState {
  searchRequest: SearchRequestContext | null;
  results: SearchResultContextItem[];
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize: number;
  lastResultsContextSignature: string | null;
}

function buildSearchResultsContextText(state: SearchResultsContextSyncState): string | null {
  if (!state.searchRequest || !state.results.length) {
    return null;
  }

  const queryLine = `Query: "${state.searchRequest.q}"`;
  const pageLine = `Page: ${state.currentPage}/${Math.max(state.totalPages, 1)} (${state.totalResults} total results)`;
  const resultLines = state.results
    .map(result => `- ${result.objectID} | ${result.title} | ${result.artistDisplayName}`)
    .join('\n');

  return [
    `Met Explorer results for ${queryLine}`,
    pageLine,
    '',
    resultLines,
    '',
    'These results are already available — no need to call search-museum-objects for this data.',
  ].join('\n');
}

function buildSearchResultsStructuredPayload(
  state: SearchResultsContextSyncState,
): SearchResultsContextPayload | null {
  if (!state.searchRequest || !state.results.length) {
    return null;
  }

  return {
    source: 'met-explorer-app',
    type: 'visible-results-page',
    query: state.searchRequest.q,
    hasImages: state.searchRequest.hasImages,
    titleOnly: state.searchRequest.title,
    departmentId: state.searchRequest.departmentId ?? null,
    page: state.currentPage,
    pageSize: state.pageSize,
    totalPages: Math.max(state.totalPages, 1),
    totalResults: state.totalResults,
    results: state.results.map(result => ({
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
  return `${state.searchRequest?.q ?? ''}|${state.currentPage}|${text}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
  try {
    await app.updateModelContext({
      content: [{ type: 'text', text }],
      structuredContent,
    });
    return true;
  }
  catch {
    // Retry with plain text only for hosts that reject structured content.
  }

  try {
    await app.updateModelContext({
      content: [{ type: 'text', text }],
    });
    return true;
  }
  catch {
    // Retry with structured only for hosts that reject text blocks.
  }

  try {
    await app.updateModelContext({
      structuredContent,
    });
    return true;
  }
  catch {
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
    return state.lastResultsContextSignature;
  }

  const signature = getSearchResultsContextSignature(state, text);
  if (signature === state.lastResultsContextSignature) {
    return state.lastResultsContextSignature;
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
    return state.lastResultsContextSignature;
  }
  catch (error) {
    console.warn('Failed to sync search results via updateModelContext:', error);
    return state.lastResultsContextSignature;
  }
}
