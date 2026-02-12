import type { ToolInputParams, ToolResult } from '../shared/types.js';
import type { AppState, LaunchParams } from './state.js';
import type { ResultCard, SearchRequest } from './types.js';
import { App } from '@modelcontextprotocol/ext-apps';
import {
  applyContext,
  errorToMessage,
  extractText,
  getElementById,
  getImageContent,
  parseObjectResult,
  startHeightSync,
  stringOrFallback,
} from '../shared/utils.js';
import { syncSearchResultsToModelContext } from './context-sync.js';
import {
  addSelectedObjectToContext as addSelectedObjectToContextAction,
  updateAddContextButton as updateAddContextButtonState,
} from './object-context.js';
import { getStructuredValue, parseDepartments, parseSearchResult } from './parsers.js';
import { renderDetails as renderDetailsView, renderResults as renderResultsView } from './render.js';
import {
  createInitialState,
  DEFAULT_PAGE_SIZE,
  getLaunchSearchSignature as getLaunchSearchSignatureFromState,
  setBusy as setBusyState,
  setStatus as setStatusState,
  setViewMode as setViewModeState,
  updatePagination as updatePaginationState,
  updateResultsTitle as updateResultsTitleState,
} from './state.js';

/**
 * Met Explorer MCP App - TypeScript Entry Point
 *
 * This module provides the interactive UI for browsing the Metropolitan Museum
 * of Art collection using the MCP Apps runtime.
 */

interface HydrationResult {
  cards: ResultCard[];
  failedCount: number;
}

// ============================================================================
// State
// ============================================================================

const state: AppState = createInitialState();

// ============================================================================
// DOM Elements
// ============================================================================

const queryInput = getElementById('query', HTMLInputElement);
const departmentSelect = getElementById('department', HTMLSelectElement);
const hasImagesInput = getElementById('has-images', HTMLInputElement);
const titleOnlyInput = getElementById('title-only', HTMLInputElement);
const searchButton = getElementById('search-btn', HTMLButtonElement);
const searchForm = getElementById('search-form', HTMLFormElement);
const statusEl = getElementById('status', HTMLDivElement);
const resultsPanelEl = getElementById('results-panel', HTMLElement);
const resultsTitleEl = getElementById('results-title', HTMLDivElement);
const resultsEl = getElementById('results', HTMLDivElement);
const resultsPaginationEl = getElementById('results-pagination', HTMLDivElement);
const prevPageButton = getElementById('prev-page', HTMLButtonElement);
const nextPageButton = getElementById('next-page', HTMLButtonElement);
const pageInfoEl = getElementById('page-info', HTMLDivElement);
const detailPanelEl = getElementById('detail-panel', HTMLElement);
const detailsEl = getElementById('details', HTMLDivElement);
const backToResultsBtn = getElementById('back-to-results-btn', HTMLButtonElement);
const addContextBtn = getElementById('add-context-btn', HTMLButtonElement);
const viewModeElements = { resultsPanelEl, detailPanelEl };
const busyControls = {
  queryInput,
  departmentSelect,
  hasImagesInput,
  titleOnlyInput,
  searchButton,
};
const paginationElements = {
  resultsPaginationEl,
  pageInfoEl,
  prevPageButton,
  nextPageButton,
};

// ============================================================================
// MCP Runtime Setup
// ============================================================================

// Hosts handle width differently; sync height only to avoid narrow-width lock-in.
const app = new App({ name: 'met-explorer-app', version: '0.1.0' }, {}, { autoResize: false });
let stopHeightSync: (() => void) | null = null;

app.onhostcontextchanged = (contextUpdate) => {
  applyContext(contextUpdate);
};

app.ontoolinput = (params: ToolInputParams) => {
  applyLaunchState(params.arguments);
};

app.ontoolresult = (params: ToolResult) => {
  const initialState = getStructuredValue(params)?.initialState as LaunchParams | undefined;
  applyLaunchState(initialState);
};

app.onteardown = async () => {
  if (stopHeightSync) {
    stopHeightSync();
    stopHeightSync = null;
  }
  return {};
};

// ============================================================================
// Event Listeners
// ============================================================================

searchForm.addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  await runSearch();
});

prevPageButton.addEventListener('click', () => {
  void goToPage(state.currentPage - 1);
});

nextPageButton.addEventListener('click', () => {
  void goToPage(state.currentPage + 1);
});

backToResultsBtn.addEventListener('click', () => {
  state.isImageExpanded = false;
  setViewMode('results');
});

addContextBtn.addEventListener('click', () => {
  void addSelectedObjectToContext();
});

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || state.viewMode !== 'detail') {
    return;
  }

  if (state.isImageExpanded) {
    state.isImageExpanded = false;
    renderDetails();
    return;
  }

  setViewMode('results');
});

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  try {
    await app.connect();
    applyContext(app.getHostContext());
    stopHeightSync = startHeightSync(s => app.sendSizeChanged(s));
    setViewMode('results');
    updateAddContextButton();

    await loadDepartments();
    state.departmentsLoaded = true;
    state.isInitialized = true;
    updatePagination();
    await maybeRunPendingLaunchSearch();
    if (!state.searchRequest) {
      setStatus('Ready. Enter a query and search the collection.', false);
    }
  }
  catch (error) {
    setStatus(errorToMessage(error), true);
  }
}

function setViewMode(mode: 'results' | 'detail'): void {
  setViewModeState(state, viewModeElements, mode);
}

// ============================================================================
// Context & Launch State
// ============================================================================

function applyLaunchState(rawState: unknown): void {
  if (!rawState || typeof rawState !== 'object') {
    return;
  }

  const launch = rawState as Record<string, unknown>;
  const normalizedLaunch: LaunchParams = {
    hasImages: typeof launch.hasImages === 'boolean' ? launch.hasImages : true,
    title: typeof launch.title === 'boolean' ? launch.title : false,
  };

  if (typeof launch.q === 'string') {
    normalizedLaunch.q = launch.q;
  }

  if (typeof launch.departmentId === 'number') {
    normalizedLaunch.departmentId = launch.departmentId;
  }

  state.launch = normalizedLaunch;
  queryInput.value = normalizedLaunch.q ?? '';
  hasImagesInput.checked = normalizedLaunch.hasImages ?? true;
  titleOnlyInput.checked = normalizedLaunch.title ?? false;
  departmentSelect.value = normalizedLaunch.departmentId === undefined
    ? ''
    : String(normalizedLaunch.departmentId);

  state.pendingLaunchSearchSignature = getLaunchSearchSignature();
  void maybeRunPendingLaunchSearch();
}

// ============================================================================
// Department Loading
// ============================================================================

async function loadDepartments(): Promise<void> {
  const result = await callTool('list-departments', {});
  const departments = parseDepartments(result);

  for (const department of departments) {
    const option = document.createElement('option');
    option.value = String(department.departmentId);
    option.textContent = department.displayName;
    departmentSelect.append(option);
  }

  if (state.launch.departmentId) {
    departmentSelect.value = String(state.launch.departmentId);
  }
}

// ============================================================================
// Search Functions
// ============================================================================

async function runSearch(): Promise<void> {
  const q = queryInput.value.trim();
  if (!q) {
    setStatus('Enter a search query first.', true);
    return;
  }

  const departmentRaw = departmentSelect.value;
  const args: SearchRequest = {
    q,
    hasImages: hasImagesInput.checked,
    title: titleOnlyInput.checked,
  };

  if (departmentRaw) {
    args.departmentId = Number(departmentRaw);
  }

  state.searchRequest = args;
  // Invalidate in-flight details requests so stale responses cannot change selection.
  state.latestDetailsToken += 1;
  state.pageSize = DEFAULT_PAGE_SIZE;
  state.currentPage = 1;
  state.totalResults = 0;
  state.totalPages = 0;
  state.selectedObject = null;
  state.selectedImageData = null;
  state.selectedImageMimeType = null;
  state.isImageExpanded = false;
  setViewMode('results');
  updateResultsTitle();
  renderDetails();
  updatePagination();

  await loadSearchPage(1);
}

async function goToPage(page: number): Promise<void> {
  if (!state.searchRequest) {
    return;
  }
  if (page < 1 || (state.totalPages > 0 && page > state.totalPages)) {
    return;
  }
  await loadSearchPage(page);
}

async function loadSearchPage(page: number): Promise<void> {
  if (!state.searchRequest) {
    return;
  }

  const token = ++state.latestSearchToken;
  state.results = [];
  state.isResultsLoading = true;
  renderResults();
  setStatus(`Searching The Met collection (page ${page})...`, false);
  setBusy(true);

  try {
    const searchResult = await callTool('search-museum-objects', {
      ...state.searchRequest,
      page,
      pageSize: state.pageSize,
    });
    const parsed = parseSearchResult(searchResult, page, state.pageSize);

    state.totalResults = parsed.total;
    state.currentPage = parsed.page;
    state.pageSize = parsed.pageSize;
    state.totalPages = parsed.totalPages;
    updateResultsTitle();
    updatePagination();

    if (!parsed.objectIDs.length) {
      state.results = [];
      state.isResultsLoading = false;
      renderResults();
      setStatus('No objects found for this query.', false);
      return;
    }

    setStatus(`Loading object previews for page ${state.currentPage}...`, false);
    const hydration = await hydrateObjects(parsed.objectIDs, token);

    if (token !== state.latestSearchToken) {
      return;
    }

    state.results = hydration.cards;
    state.isResultsLoading = false;
    renderResults();
    if (!hydration.cards.length) {
      setStatus('Could not load object previews for this page. Please try again.', true);
      return;
    }

    const baseMessage = `Loaded ${hydration.cards.length} previews (page ${state.currentPage} of ${state.totalPages}).`;
    setStatus(
      hydration.failedCount > 0
        ? `${baseMessage} ${hydration.failedCount} preview(s) failed to load.`
        : baseMessage,
      false,
    );
    state.lastResultsContextSignature = await syncSearchResultsToModelContext(app, { state });
  }
  catch (error) {
    if (token !== state.latestSearchToken) {
      return;
    }
    state.isResultsLoading = false;
    renderResults();
    setStatus(errorToMessage(error), true);
  }
  finally {
    if (token === state.latestSearchToken) {
      setBusy(false);
      void maybeRunPendingLaunchSearch();
    }
  }
}

async function maybeRunPendingLaunchSearch(): Promise<void> {
  if (!state.isInitialized || !state.departmentsLoaded) {
    return;
  }
  if (!state.pendingLaunchSearchSignature) {
    return;
  }
  if (state.pendingLaunchSearchSignature === state.lastLaunchSearchSignature) {
    state.pendingLaunchSearchSignature = null;
    return;
  }
  if (state.isBusy || state.isResultsLoading) {
    return;
  }

  const signature = state.pendingLaunchSearchSignature;
  state.pendingLaunchSearchSignature = null;
  state.lastLaunchSearchSignature = signature;
  await runSearch();
}

function getLaunchSearchSignature(): string | null {
  return getLaunchSearchSignatureFromState(state);
}

// ============================================================================
// Object Hydration
// ============================================================================

async function hydrateObjects(objectIds: number[], token: number): Promise<HydrationResult> {
  const ordered: Array<ResultCard | null> = Array.from({ length: objectIds.length }, () => null);
  let failedCount = 0;

  await runWithConcurrency(
    objectIds.map((objectId, index) => ({ objectId, index })),
    4,
    async ({ objectId, index }: { objectId: number; index: number }) => {
      if (token !== state.latestSearchToken) {
        return;
      }

      try {
        const result = await callTool('get-museum-object', {
          objectId,
          returnImage: false,
        });
        const parsedObject = parseObjectResult(result);
        if (!parsedObject) {
          return;
        }
        ordered[index] = {
          objectID: Number(parsedObject.objectID ?? objectId),
          title: stringOrFallback(parsedObject.title, 'Untitled'),
          artistDisplayName: stringOrFallback(parsedObject.artistDisplayName, 'Unknown artist'),
          department: stringOrFallback(parsedObject.department, ''),
          primaryImageSmall: stringOrFallback(parsedObject.primaryImageSmall, ''),
        };
      }
      catch {
        failedCount += 1;
      }
    },
  );

  return {
    cards: ordered.filter((item): item is ResultCard => item !== null),
    failedCount,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i += 1) {
    workers.push(
      (async () => {
        while (queue.length) {
          const item = queue.shift();
          if (item === undefined) {
            return;
          }
          await worker(item);
        }
      })(),
    );
  }

  await Promise.all(workers);
}

// ============================================================================
// Rendering Functions
// ============================================================================

function renderResults(): void {
  renderResultsView(
    { state },
    { resultsEl, detailsEl },
    {
      loadObjectDetails,
      setStatus,
      updateAddContextButton,
    },
  );
}

async function loadObjectDetails(objectId: number): Promise<void> {
  if (state.isDetailsLoading) {
    return;
  }

  const token = ++state.latestDetailsToken;
  state.isDetailsLoading = true;
  renderResults();
  detailsEl.innerHTML = '<div class="skeleton" style="height: 260px; border-radius: 8px;"></div>';
  setStatus(`Loading object ${objectId}...`, false);

  try {
    const result = await callTool('get-museum-object', {
      objectId,
      returnImage: true,
    });

    const objectData = parseObjectResult(result);
    if (token !== state.latestDetailsToken) {
      return;
    }

    const imageBlock = getImageContent(result);
    state.selectedObject = objectData;
    state.selectedImageData = imageBlock?.data ?? null;
    state.selectedImageMimeType = imageBlock?.mimeType ?? null;
    state.isImageExpanded = false;

    renderDetails();
    setViewMode('detail');
    setStatus(`Loaded object ${objectId}.`, false);
  }
  finally {
    state.isDetailsLoading = false;
    renderResults();
  }
}

function renderDetails(): void {
  renderDetailsView(
    { state },
    { resultsEl, detailsEl },
    {
      loadObjectDetails,
      setStatus,
      updateAddContextButton,
    },
  );
}

function updateAddContextButton(): void {
  updateAddContextButtonState(state, addContextBtn);
}

async function addSelectedObjectToContext(): Promise<void> {
  await addSelectedObjectToContextAction(app, state, addContextBtn, { setStatus });
}

// ============================================================================
// Tool Calls
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(extractText(result) || `Tool call failed: ${name}`);
  }
  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

function setBusy(isBusy: boolean): void {
  setBusyState(state, busyControls, updatePagination, isBusy);
}

function updateResultsTitle(): void {
  updateResultsTitleState(state, resultsTitleEl);
}

function updatePagination(): void {
  updatePaginationState(state, paginationElements);
}

function setStatus(message: string, isError: boolean): void {
  setStatusState(statusEl, message, isError);
}

// ============================================================================
// Start Application
// ============================================================================

init().catch((error: unknown) => {
  setStatus(errorToMessage(error), true);
});
