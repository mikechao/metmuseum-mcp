/**
 * Met Explorer MCP App - TypeScript Entry Point
 *
 * This module provides the interactive UI for browsing the Metropolitan Museum
 * of Art collection using the MCP Apps runtime.
 */

// ============================================================================
// Types
// ============================================================================

interface LaunchParams {
  q?: string;
  hasImages?: boolean;
  title?: boolean;
  departmentId?: number;
  objectId?: number;
}

interface AppState {
  launch: LaunchParams;
  results: ResultCard[];
  selectedObject: ObjectData | null;
  selectedImageData: string | null;
  latestSearchToken: number;
  searchRequest: SearchRequest | null;
  currentPage: number;
  totalResults: number;
  totalPages: number;
  pageSize: number;
  isBusy: boolean;
  isResultsLoading: boolean;
}

interface SearchRequest {
  q: string;
  hasImages: boolean;
  title: boolean;
  departmentId?: number;
}

interface ResultCard {
  objectID: number;
  title: string;
  artistDisplayName: string;
  department: string;
  primaryImageSmall: string;
}

interface ObjectData {
  objectID?: number | string;
  title?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  department?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  creditLine?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  tags?: Array<{ term?: string }>;
}

interface Department {
  departmentId: number;
  displayName: string;
}

interface ParsedSearchResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  objectIDs: number[];
}

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
}

interface ToolResult {
  isError?: boolean;
  content?: ContentBlock[];
  structuredContent?: Record<string, unknown>;
}

interface HostContext {
  theme?: string;
  styles?: {
    variables?: Record<string, string>;
    css?: {
      fonts?: string;
    };
  };
}

// MCP Apps Runtime types
interface MCPApp {
  connect: () => Promise<void>;
  getHostContext: () => HostContext | null;
  callServerTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<ToolResult>;
  sendSizeChanged: (size: { height: number }) => void;
  onhostcontextchanged: ((context: HostContext) => void) | null;
  ontoolinput: ((params: { arguments: Record<string, unknown> }) => void) | null;
  ontoolresult: ((params: ToolResult) => void) | null;
  onteardown: (() => Promise<Record<string, unknown>>) | null;
}

interface MCPAppsRuntime {
  App: new (
    info: { name: string; version: string },
    options: Record<string, unknown>,
    config: { autoResize: boolean }
  ) => MCPApp;
  applyDocumentTheme: (theme: string) => void;
  applyHostFonts: (fonts: string) => void;
  applyHostStyleVariables: (variables: Record<string, string>) => void;
}

declare const globalThis: {
  __MCP_APPS_RUNTIME__?: MCPAppsRuntime;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 24;

// ============================================================================
// State
// ============================================================================

const state: AppState = {
  launch: {},
  results: [],
  selectedObject: null,
  selectedImageData: null,
  latestSearchToken: 0,
  searchRequest: null,
  currentPage: 1,
  totalResults: 0,
  totalPages: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  isBusy: false,
  isResultsLoading: false,
};

// ============================================================================
// DOM Elements
// ============================================================================

const queryInput = document.getElementById('query') as HTMLInputElement;
const departmentSelect = document.getElementById('department') as HTMLSelectElement;
const hasImagesInput = document.getElementById('has-images') as HTMLInputElement;
const titleOnlyInput = document.getElementById('title-only') as HTMLInputElement;
const searchButton = document.getElementById('search-btn') as HTMLButtonElement;
const searchForm = document.getElementById('search-form') as HTMLFormElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const resultsTitleEl = document.getElementById('results-title') as HTMLDivElement;
const resultsEl = document.getElementById('results') as HTMLDivElement;
const resultsPaginationEl = document.getElementById('results-pagination') as HTMLDivElement;
const prevPageButton = document.getElementById('prev-page') as HTMLButtonElement;
const nextPageButton = document.getElementById('next-page') as HTMLButtonElement;
const pageInfoEl = document.getElementById('page-info') as HTMLDivElement;
const detailsEl = document.getElementById('details') as HTMLDivElement;

// ============================================================================
// MCP Runtime Setup
// ============================================================================

const runtime = globalThis.__MCP_APPS_RUNTIME__;
if (!runtime) {
  setStatus('Could not load MCP Apps runtime in this host.', true);
  throw new Error('Failed to load @modelcontextprotocol/ext-apps runtime');
}

const { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } = runtime;

// Hosts handle width differently; sync height only to avoid narrow-width lock-in.
const app = new App({ name: 'met-explorer-app', version: '0.1.0' }, {}, { autoResize: false });
let stopHeightSync: (() => void) | null = null;

app.onhostcontextchanged = (contextUpdate: HostContext) => {
  applyContext(contextUpdate);
};

app.ontoolinput = (params: { arguments: Record<string, unknown> }) => {
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

hasImagesInput.addEventListener('change', () => {
  if (hasImagesInput.checked && titleOnlyInput.checked) {
    titleOnlyInput.checked = false;
  }
});

titleOnlyInput.addEventListener('change', () => {
  if (titleOnlyInput.checked && hasImagesInput.checked) {
    hasImagesInput.checked = false;
  }
});

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  try {
    await app.connect();
    applyContext(app.getHostContext());
    stopHeightSync = startHeightSync();

    await loadDepartments();
    updatePagination();

    if (state.launch.q) {
      queryInput.value = state.launch.q;
      await runSearch();
    }
    else if (state.launch.objectId) {
      await loadObjectDetails(state.launch.objectId);
    }
    else {
      setStatus('Ready. Enter a query and search the collection.', false);
    }
  }
  catch (error) {
    setStatus(errorToMessage(error), true);
  }
}

// ============================================================================
// Context & Launch State
// ============================================================================

function applyContext(context: HostContext | null): void {
  if (!context) {
    return;
  }

  if (context.theme) {
    applyDocumentTheme(context.theme);
  }

  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }

  if (context.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }
}

function applyLaunchState(rawState: unknown): void {
  if (!rawState || typeof rawState !== 'object') {
    return;
  }

  const launch = rawState as Record<string, unknown>;

  if (typeof launch.q === 'string') {
    state.launch.q = launch.q;
    queryInput.value = launch.q;
  }

  if (typeof launch.hasImages === 'boolean') {
    state.launch.hasImages = launch.hasImages;
    hasImagesInput.checked = launch.hasImages;
  }

  if (typeof launch.title === 'boolean') {
    state.launch.title = launch.title;
    titleOnlyInput.checked = launch.title;
  }

  if (typeof launch.departmentId === 'number') {
    state.launch.departmentId = launch.departmentId;
    departmentSelect.value = String(launch.departmentId);
  }

  if (typeof launch.objectId === 'number') {
    state.launch.objectId = launch.objectId;
  }
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
  state.pageSize = DEFAULT_PAGE_SIZE;
  state.currentPage = 1;
  state.totalResults = 0;
  state.totalPages = 0;
  state.selectedObject = null;
  state.selectedImageData = null;
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
    const hydrated = await hydrateObjects(parsed.objectIDs, token);

    if (token !== state.latestSearchToken) {
      return;
    }

    state.results = hydrated;
    state.isResultsLoading = false;
    renderResults();
    setStatus(
      `Loaded ${hydrated.length} previews (page ${state.currentPage} of ${state.totalPages}).`,
      false,
    );

    if (state.launch.objectId) {
      const target = state.launch.objectId;
      state.launch.objectId = undefined;
      await loadObjectDetails(target);
    }
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
    }
  }
}

// ============================================================================
// Object Hydration
// ============================================================================

async function hydrateObjects(objectIds: number[], token: number): Promise<ResultCard[]> {
  const results: ResultCard[] = [];

  await runWithConcurrency(objectIds, 4, async (objectId: number) => {
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
      results.push({
        objectID: Number(parsedObject.objectID ?? objectId),
        title: stringOrFallback(parsedObject.title, 'Untitled'),
        artistDisplayName: stringOrFallback(parsedObject.artistDisplayName, 'Unknown artist'),
        department: stringOrFallback(parsedObject.department, ''),
        primaryImageSmall: stringOrFallback(parsedObject.primaryImageSmall, ''),
      });
    }
    catch {
      // Swallow per-object failures so one bad object does not block the whole grid.
    }
  });

  return results;
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
  resultsEl.innerHTML = '';

  if (state.isResultsLoading) {
    const loading = document.createElement('div');
    loading.className = 'results-loading';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = 'Loading results...';

    loading.append(spinner, text);
    resultsEl.append(loading);
    return;
  }

  if (!state.results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.searchRequest
      ? 'No objects found for this search.'
      : 'Run a search to explore objects.';
    resultsEl.append(empty);
    return;
  }

  for (const result of state.results) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `result-card${state.selectedObject?.objectID === result.objectID ? ' active' : ''}`;
    card.addEventListener('click', () => {
      loadObjectDetails(result.objectID).catch((error: unknown) => {
        setStatus(errorToMessage(error), true);
      });
    });

    if (result.primaryImageSmall) {
      const img = document.createElement('img');
      img.src = result.primaryImageSmall;
      img.alt = result.title;
      card.append(img);
    }
    else {
      const placeholder = document.createElement('div');
      placeholder.className = 'skeleton';
      placeholder.style.height = '120px';
      card.append(placeholder);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = result.title;

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = result.artistDisplayName;

    const sub2 = document.createElement('div');
    sub2.className = 'sub';
    sub2.textContent = result.department;

    meta.append(title, sub, sub2);
    card.append(meta);
    resultsEl.append(card);
  }
}

async function loadObjectDetails(objectId: number): Promise<void> {
  detailsEl.innerHTML = '<div class="skeleton" style="height: 260px; border-radius: 8px;"></div>';
  setStatus(`Loading object ${objectId}...`, false);

  const result = await callTool('get-museum-object', {
    objectId,
    returnImage: true,
  });

  const objectData = parseObjectResult(result);
  state.selectedObject = objectData;
  state.selectedImageData = getImageData(result);

  renderResults();
  renderDetails();
  setStatus(`Loaded object ${objectId}.`, false);
}

function renderDetails(): void {
  detailsEl.innerHTML = '';

  if (!state.selectedObject) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Select an object to see details.';
    detailsEl.append(empty);
    return;
  }

  const objectData = state.selectedObject;

  if (state.selectedImageData || objectData.primaryImage) {
    const image = document.createElement('img');
    image.className = 'detail-image';
    image.alt = stringOrFallback(objectData.title, 'Artwork image');
    image.src = state.selectedImageData
      ? `data:image/jpeg;base64,${state.selectedImageData}`
      : objectData.primaryImage!;
    detailsEl.append(image);
  }

  const title = document.createElement('h2');
  title.className = 'detail-title';
  title.textContent = stringOrFallback(objectData.title, 'Untitled');
  detailsEl.append(title);

  const table = document.createElement('div');
  table.className = 'detail-table';

  appendDetailRow(table, 'Object ID', objectData.objectID);
  appendDetailRow(table, 'Artist', objectData.artistDisplayName);
  appendDetailRow(table, 'Artist Bio', objectData.artistDisplayBio);
  appendDetailRow(table, 'Department', objectData.department);
  appendDetailRow(table, 'Date', objectData.objectDate);
  appendDetailRow(table, 'Medium', objectData.medium);
  appendDetailRow(table, 'Dimensions', objectData.dimensions);
  appendDetailRow(table, 'Credit Line', objectData.creditLine);

  const tagText = Array.isArray(objectData.tags)
    ? objectData.tags
        .map(tag => tag?.term)
        .filter(Boolean)
        .join(', ')
    : '';
  appendDetailRow(table, 'Tags', tagText);

  detailsEl.append(table);
}

function appendDetailRow(
  table: HTMLDivElement,
  key: string,
  value: string | number | undefined,
): void {
  if (!value) {
    return;
  }

  const keyEl = document.createElement('div');
  keyEl.className = 'detail-key';
  keyEl.textContent = key;

  const valueEl = document.createElement('div');
  valueEl.textContent = String(value);

  table.append(keyEl, valueEl);
}

// ============================================================================
// Tool Calls & Parsing
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(extractText(result) || `Tool call failed: ${name}`);
  }
  return result;
}

function parseDepartments(result: ToolResult): Department[] {
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

function parseSearchResult(
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

function parseObjectResult(result: ToolResult): ObjectData | null {
  const structured = getStructuredValue(result);
  if (structured?.object && typeof structured.object === 'object') {
    return structured.object as ObjectData;
  }

  const text = extractText(result);
  const lines = text.split('\n');
  const parsed: ObjectData = {};

  for (const line of lines) {
    const dividerIndex = line.indexOf(':');
    if (dividerIndex <= 0) {
      continue;
    }

    const rawKey = line.slice(0, dividerIndex).trim();
    const value = line.slice(dividerIndex + 1).trim();
    if (!value) {
      continue;
    }

    switch (rawKey) {
      case 'Title':
        parsed.title = value;
        break;
      case 'Artist':
        parsed.artistDisplayName = value;
        break;
      case 'Artist Bio':
        parsed.artistDisplayBio = value;
        break;
      case 'Department':
        parsed.department = value;
        break;
      case 'Credit Line':
        parsed.creditLine = value;
        break;
      case 'Medium':
        parsed.medium = value;
        break;
      case 'Dimensions':
        parsed.dimensions = value;
        break;
      case 'Primary Image URL':
        parsed.primaryImage = value;
        break;
      case 'Tags':
        parsed.tags = value
          .split(',')
          .map(term => ({ term: term.trim() }))
          .filter(tag => tag.term);
        break;
      default:
        break;
    }
  }

  return parsed;
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractText(result: ToolResult): string {
  if (!Array.isArray(result?.content)) {
    return '';
  }

  return result.content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text!)
    .join('\n')
    .trim();
}

function getImageData(result: ToolResult): string | null {
  if (!Array.isArray(result?.content)) {
    return null;
  }

  const block = result.content.find(
    item => item.type === 'image' && typeof item.data === 'string',
  );
  return block ? block.data! : null;
}

function getStructuredValue(result: ToolResult): Record<string, unknown> | null {
  const value = result?.structuredContent;
  if (value && typeof value === 'object') {
    return value;
  }
  return null;
}

function setBusy(isBusy: boolean): void {
  state.isBusy = isBusy;
  queryInput.disabled = isBusy;
  departmentSelect.disabled = isBusy;
  hasImagesInput.disabled = isBusy;
  titleOnlyInput.disabled = isBusy;
  searchButton.disabled = isBusy;
  updatePagination();
}

function updateResultsTitle(): void {
  resultsTitleEl.textContent
    = state.totalResults > 0 ? `Results (${state.totalResults} total)` : 'Results';
}

function updatePagination(): void {
  const hasResults = state.totalResults > 0 && state.totalPages > 0;
  resultsPaginationEl.style.display = hasResults ? 'flex' : 'none';
  pageInfoEl.textContent = hasResults
    ? `Page ${state.currentPage} of ${state.totalPages}`
    : 'Page 0 of 0';
  prevPageButton.disabled = !hasResults || state.isBusy || state.currentPage <= 1;
  nextPageButton.disabled = !hasResults || state.isBusy || state.currentPage >= state.totalPages;
}

function setStatus(message: string, isError: boolean): void {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function stringOrFallback(value: string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallback;
}

function startHeightSync(): (() => void) | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }

  let raf = 0;
  let lastHeight = 0;

  const reportHeight = (): void => {
    raf = 0;
    const nextHeight = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (!nextHeight || nextHeight === lastHeight) {
      return;
    }
    lastHeight = nextHeight;
    app.sendSizeChanged({ height: nextHeight });
  };

  const scheduleReport = (): void => {
    if (raf) {
      return;
    }
    raf = requestAnimationFrame(reportHeight);
  };

  const observer = new ResizeObserver(scheduleReport);
  observer.observe(document.documentElement);
  observer.observe(document.body);
  window.addEventListener('load', scheduleReport);
  scheduleReport();

  return () => {
    observer.disconnect();
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    window.removeEventListener('load', scheduleReport);
  };
}

// ============================================================================
// Start Application
// ============================================================================

init();
