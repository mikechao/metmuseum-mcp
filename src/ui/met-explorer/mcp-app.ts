import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';

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
  selectedImageMimeType: string | null;
  lastAddedContextObjectId: string | null;
  isImageZoomed: boolean;
  latestSearchToken: number;
  latestDetailsToken: number;
  searchRequest: SearchRequest | null;
  currentPage: number;
  totalResults: number;
  totalPages: number;
  pageSize: number;
  isBusy: boolean;
  isResultsLoading: boolean;
  isDetailsLoading: boolean;
  isAddingToContext: boolean;
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

interface HydrationResult {
  cards: ResultCard[];
  failedCount: number;
}

type ToolInputParams = Parameters<NonNullable<App['ontoolinput']>>[0];
type ToolResult = Awaited<ReturnType<App['callServerTool']>>;
type ToolContentBlock = NonNullable<ToolResult['content']>[number];
type HostContext = ReturnType<App['getHostContext']>;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 12;

// ============================================================================
// State
// ============================================================================

const state: AppState = {
  launch: {},
  results: [],
  selectedObject: null,
  selectedImageData: null,
  selectedImageMimeType: null,
  lastAddedContextObjectId: null,
  isImageZoomed: false,
  latestSearchToken: 0,
  latestDetailsToken: 0,
  searchRequest: null,
  currentPage: 1,
  totalResults: 0,
  totalPages: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  isBusy: false,
  isResultsLoading: false,
  isDetailsLoading: false,
  isAddingToContext: false,
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
const modalOverlay = document.getElementById('modal-overlay') as HTMLDivElement;
const modalCloseBtn = document.getElementById('modal-close') as HTMLButtonElement;
const addContextBtn = document.getElementById('add-context-btn') as HTMLButtonElement;

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

modalCloseBtn.addEventListener('click', () => {
  closeModal();
});

addContextBtn.addEventListener('click', () => {
  void addSelectedObjectToContext();
});

modalOverlay.addEventListener('click', (event: Event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && modalOverlay.classList.contains('open')) {
    closeModal();
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
    updateAddContextButton();

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
// Modal Functions
// ============================================================================

function openModal(): void {
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(): void {
  const hadSelection = state.selectedObject !== null;
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';

  if (hadSelection) {
    state.selectedObject = null;
    state.selectedImageData = null;
    state.selectedImageMimeType = null;
    state.isImageZoomed = false;
    renderResults();
  }
  updateAddContextButton();
}

// ============================================================================
// Context & Launch State
// ============================================================================

function applyContext(context: HostContext): void {
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
  // Invalidate in-flight details requests so stale responses cannot re-open the modal.
  state.latestDetailsToken += 1;
  state.pageSize = DEFAULT_PAGE_SIZE;
  state.currentPage = 1;
  state.totalResults = 0;
  state.totalPages = 0;
  state.selectedObject = null;
  state.selectedImageData = null;
  state.selectedImageMimeType = null;
  state.isImageZoomed = false;
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
  resultsEl.innerHTML = '';
  resultsEl.setAttribute('aria-busy', state.isResultsLoading || state.isDetailsLoading ? 'true' : 'false');

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
    card.className = `result-card${objectIdEquals(state.selectedObject?.objectID, result.objectID) ? ' active' : ''}`;
    card.disabled = state.isDetailsLoading;
    card.addEventListener('click', () => {
      if (state.isDetailsLoading) {
        return;
      }
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
    title.title = result.title;
    card.title = result.title;

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

  if (state.isDetailsLoading) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'results-details-loading';
    loadingOverlay.setAttribute('role', 'status');
    loadingOverlay.setAttribute('aria-live', 'polite');

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = 'Loading details...';

    loadingOverlay.append(spinner, text);
    resultsEl.append(loadingOverlay);
  }
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
    state.isImageZoomed = false;

    renderDetails();
    setStatus(`Loaded object ${objectId}.`, false);
  }
  finally {
    state.isDetailsLoading = false;
    renderResults();
  }
}

function renderDetails(): void {
  detailsEl.innerHTML = '';
  detailsEl.classList.remove('zoomed');

  if (!state.selectedObject) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Select an object to see details.';
    detailsEl.append(empty);
    closeModal();
    return;
  }

  updateAddContextButton();

  const objectData = state.selectedObject;
  const imageUrl = getSelectedImageUrl(objectData);

  if (state.isImageZoomed) {
    renderZoomedImage(imageUrl, objectData);
    openModal();
    return;
  }

  if (imageUrl) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'detail-image-wrap';

    const image = document.createElement('img');
    image.className = 'detail-image';
    image.alt = stringOrFallback(objectData.title, 'Artwork image');
    image.src = imageUrl;

    const zoomIntoImage = (): void => {
      state.isImageZoomed = true;
      renderDetails();
    };

    const viewFullButton = document.createElement('button');
    viewFullButton.type = 'button';
    viewFullButton.className = 'image-view-btn';
    viewFullButton.textContent = 'View full image';
    viewFullButton.addEventListener('click', zoomIntoImage);

    const imageActions = document.createElement('div');
    imageActions.className = 'detail-image-actions';
    imageActions.append(viewFullButton);

    imageWrap.append(image, imageActions);
    detailsEl.append(imageWrap);
  }

  const title = document.createElement('h2');
  title.className = 'detail-title';
  title.textContent = stringOrFallback(objectData.title, 'Untitled');
  detailsEl.append(title);

  const table = document.createElement('dl');
  table.className = 'detail-meta';

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
  openModal();
}

function renderZoomedImage(imageUrl: string | null, objectData: ObjectData): void {
  detailsEl.classList.add('zoomed');

  if (!imageUrl) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No image available for this object.';
    detailsEl.append(empty);
    return;
  }

  const image = document.createElement('img');
  image.className = 'detail-image detail-image-zoomed';
  image.alt = stringOrFallback(objectData.title, 'Artwork image');
  image.src = imageUrl;

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'zoom-back-btn';
  backButton.textContent = 'Back to details';
  backButton.addEventListener('click', () => {
    state.isImageZoomed = false;
    renderDetails();
  });

  detailsEl.append(image, backButton);
}

function getSelectedImageUrl(objectData: ObjectData): string | null {
  if (state.selectedImageData && state.selectedImageMimeType) {
    return `data:${state.selectedImageMimeType};base64,${state.selectedImageData}`;
  }
  if (objectData.primaryImage) {
    return objectData.primaryImage;
  }
  return null;
}

function getObjectContextId(objectData: ObjectData | null): string | null {
  if (!objectData) {
    return null;
  }

  const { objectID } = objectData;
  if (typeof objectID !== 'number' && typeof objectID !== 'string') {
    return null;
  }

  const normalized = String(objectID).trim();
  return normalized || null;
}

function updateAddContextButton(): void {
  const selectedObjectId = getObjectContextId(state.selectedObject);
  const isAdded = Boolean(
    selectedObjectId
    && state.lastAddedContextObjectId
    && selectedObjectId === state.lastAddedContextObjectId,
  );
  const canAdd = state.selectedObject !== null && !state.isAddingToContext && !isAdded;

  addContextBtn.disabled = !canAdd;
  addContextBtn.classList.toggle('added', isAdded && !state.isAddingToContext);
  addContextBtn.textContent = state.isAddingToContext
    ? 'Adding...'
    : isAdded
      ? 'Added'
      : 'Add to context';
}

function buildObjectContextText(objectData: ObjectData): string {
  const lines = [
    'Met Museum object added from Met Explorer:',
    `- Object ID: ${stringOrFallback(
      objectData.objectID === undefined ? undefined : String(objectData.objectID),
      'Unknown',
    )}`,
    `- Title: ${stringOrFallback(objectData.title, 'Untitled')}`,
    `- Artist: ${stringOrFallback(objectData.artistDisplayName, 'Unknown artist')}`,
    objectData.artistDisplayBio ? `- Artist Bio: ${objectData.artistDisplayBio}` : '',
    objectData.department ? `- Department: ${objectData.department}` : '',
    objectData.objectDate ? `- Date: ${objectData.objectDate}` : '',
    objectData.medium ? `- Medium: ${objectData.medium}` : '',
    objectData.dimensions ? `- Dimensions: ${objectData.dimensions}` : '',
    objectData.creditLine ? `- Credit Line: ${objectData.creditLine}` : '',
    objectData.primaryImage ? `- Primary Image URL: ${objectData.primaryImage}` : '',
  ].filter(Boolean);

  const tags = Array.isArray(objectData.tags)
    ? objectData.tags
        .map(tag => tag?.term)
        .filter((term): term is string => typeof term === 'string' && term.length > 0)
    : [];

  if (tags.length) {
    lines.push(`- Tags: ${tags.join(', ')}`);
  }

  return lines.join('\n');
}

function supportsTextModality(modalities: { text?: object } | undefined): boolean {
  if (!modalities) {
    return false;
  }

  return Object.keys(modalities).length === 0 || Boolean(modalities.text);
}

function parseObjectId(objectData: ObjectData): number | null {
  const { objectID } = objectData;
  if (typeof objectID === 'number' && Number.isFinite(objectID)) {
    return objectID;
  }

  if (typeof objectID === 'string') {
    const parsed = Number(objectID.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

async function sendToolCallMessageForImageContext(
  objectData: ObjectData,
  objectDetailsText: string,
): Promise<boolean> {
  const messageCapabilities = app.getHostCapabilities()?.message;
  if (!supportsTextModality(messageCapabilities)) {
    return false;
  }

  const objectId = parseObjectId(objectData);
  const instruction = objectId === null
    ? 'Please call the "get-museum-object" tool with returnImage=true for this item so you can view its image.'
    : `Please call the "get-museum-object" tool with {"objectId": ${objectId}, "returnImage": true} so you can view its image.`;

  const result = await app.sendMessage({
    role: 'user',
    content: [{
      type: 'text',
      text: `${instruction}\n\nReference details:\n${objectDetailsText}`,
    }],
  });

  if (result.isError) {
    throw new Error('Host rejected app message delivery.');
  }

  state.lastAddedContextObjectId = getObjectContextId(objectData);
  return true;
}

async function addSelectedObjectToContext(): Promise<void> {
  const objectData = state.selectedObject;
  if (!objectData || state.isAddingToContext) {
    return;
  }

  const capabilities = app.getHostCapabilities()?.updateModelContext;

  state.isAddingToContext = true;
  updateAddContextButton();

  try {
    const objectDetailsText = buildObjectContextText(objectData);
    const imageData = state.selectedImageData;
    const imageMimeType = state.selectedImageMimeType;
    const hasImagePayload = Boolean(imageData && imageMimeType);
    const canSendImagePayload = hasImagePayload
      && (capabilities ? Boolean(capabilities.image) : true);
    const canSendStructuredContent = Boolean(capabilities?.structuredContent);
    const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
      { type: 'text', text: objectDetailsText },
    ];

    if (imageData && imageMimeType && canSendImagePayload) {
      content.push({
        type: 'image',
        data: imageData,
        mimeType: imageMimeType,
      });
    }

    await app.updateModelContext({
      content,
      structuredContent: canSendStructuredContent
        ? {
            source: 'met-explorer-app',
            object: objectData,
            hasEmbeddedImage: canSendImagePayload,
          }
        : undefined,
    });

    state.lastAddedContextObjectId = getObjectContextId(objectData);

    if (canSendImagePayload) {
      setStatus('Object details and image were added to model context.', false);
      return;
    }

    if (hasImagePayload && !canSendImagePayload) {
      try {
        const sentMessage = await sendToolCallMessageForImageContext(objectData, objectDetailsText);
        if (sentMessage) {
          setStatus('Object details were added. Sent a follow-up chat message so the model can fetch image context via tool call.', false);
          return;
        }
      }
      catch (messageError) {
        setStatus(errorToMessage(messageError), true);
        return;
      }

      setStatus('Object details were added, but this host does not accept image context blocks.', false);
      return;
    }

    setStatus('Object details were added to model context.', false);
  }
  catch (error) {
    const objectDetailsText = buildObjectContextText(objectData);
    const canRetryTextOnly = Boolean(state.selectedImageData && state.selectedImageMimeType);

    const tryToolCallMessageFallback = async (): Promise<boolean> => {
      try {
        const sentMessage = await sendToolCallMessageForImageContext(objectData, objectDetailsText);
        if (!sentMessage) {
          return false;
        }

        setStatus('Sent a follow-up chat message so the model can fetch image context via tool call.', false);
        return true;
      }
      catch (messageError) {
        setStatus(errorToMessage(messageError), true);
        return true;
      }
    };

    if (!canRetryTextOnly) {
      if (await tryToolCallMessageFallback()) {
        return;
      }

      setStatus(errorToMessage(error), true);
      return;
    }

    try {
      await app.updateModelContext({
        content: [{ type: 'text', text: objectDetailsText }],
      });
      state.lastAddedContextObjectId = getObjectContextId(objectData);

      if (await tryToolCallMessageFallback()) {
        return;
      }

      setStatus('Object details were added, but image context was rejected by this host.', false);
    }
    catch (retryError) {
      if (await tryToolCallMessageFallback()) {
        return;
      }

      setStatus(errorToMessage(retryError), true);
    }
  }
  finally {
    state.isAddingToContext = false;
    updateAddContextButton();
  }
}

function appendDetailRow(
  table: HTMLDListElement,
  key: string,
  value: string | number | undefined,
): void {
  if (!value) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'detail-row';

  const keyEl = document.createElement('dt');
  keyEl.className = 'detail-key';
  keyEl.textContent = key;

  const valueEl = document.createElement('dd');
  valueEl.className = 'detail-value';
  valueEl.textContent = String(value);

  row.append(keyEl, valueEl);
  table.append(row);
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
  let hasParsedField = false;

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
      case 'Object ID': {
        const numericId = Number(value);
        parsed.objectID = Number.isFinite(numericId) ? numericId : value;
        hasParsedField = true;
        break;
      }
      case 'Title':
        parsed.title = value;
        hasParsedField = true;
        break;
      case 'Artist':
        parsed.artistDisplayName = value;
        hasParsedField = true;
        break;
      case 'Artist Bio':
        parsed.artistDisplayBio = value;
        hasParsedField = true;
        break;
      case 'Department':
        parsed.department = value;
        hasParsedField = true;
        break;
      case 'Date':
      case 'Object Date':
        parsed.objectDate = value;
        hasParsedField = true;
        break;
      case 'Credit Line':
        parsed.creditLine = value;
        hasParsedField = true;
        break;
      case 'Medium':
        parsed.medium = value;
        hasParsedField = true;
        break;
      case 'Dimensions':
        parsed.dimensions = value;
        hasParsedField = true;
        break;
      case 'Primary Image URL':
        parsed.primaryImage = value;
        hasParsedField = true;
        break;
      case 'Tags':
        parsed.tags = value
          .split(',')
          .map(term => ({ term: term.trim() }))
          .filter(tag => tag.term);
        hasParsedField = true;
        break;
      default:
        break;
    }
  }

  return hasParsedField ? parsed : null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractText(result: ToolResult): string {
  if (!Array.isArray(result?.content)) {
    return '';
  }

  return result.content
    .filter(isTextContentBlock)
    .map(block => block.text)
    .join('\n')
    .trim();
}

function getImageContent(
  result: ToolResult,
): Extract<ToolContentBlock, { type: 'image' }> | null {
  if (!Array.isArray(result?.content)) {
    return null;
  }

  const block = result.content.find(isImageContentBlock);
  return block ?? null;
}

function getStructuredValue(result: ToolResult): Record<string, unknown> | null {
  const value = result?.structuredContent;
  if (value && typeof value === 'object') {
    return value;
  }
  return null;
}

function isTextContentBlock(block: ToolContentBlock): block is Extract<ToolContentBlock, { type: 'text' }> {
  return block.type === 'text';
}

function isImageContentBlock(
  block: ToolContentBlock,
): block is Extract<ToolContentBlock, { type: 'image' }> {
  return block.type === 'image';
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

function objectIdEquals(
  left: number | string | undefined,
  right: number | string | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  return String(left) === String(right);
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
