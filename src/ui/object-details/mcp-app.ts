import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';

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
  objectURL?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  tags?: Array<{ term?: string }>;
}

interface AppState {
  object: ObjectData | null;
  imageData: string | null;
  imageMimeType: string | null;
  errorMessage: string | null;
  isImageExpanded: boolean;
}

type ToolInputParams = Parameters<NonNullable<App['ontoolinput']>>[0];
type ToolResult = Awaited<ReturnType<App['callServerTool']>>;
type ToolContentBlock = NonNullable<ToolResult['content']>[number];
type HostContext = ReturnType<App['getHostContext']>;

const state: AppState = {
  object: null,
  imageData: null,
  imageMimeType: null,
  errorMessage: null,
  isImageExpanded: false,
};

const titleEl = document.getElementById('title') as HTMLHeadingElement;
const highlightsEl = document.getElementById('highlights') as HTMLUListElement;
const metaDetailsEl = document.getElementById('meta-details') as HTMLDetailsElement;
const metaSummaryEl = document.getElementById('meta-summary') as HTMLElement;
const metaEl = document.getElementById('meta') as HTMLDListElement;
const imageWrapEl = document.getElementById('image-wrap') as HTMLDivElement;
const imageAmbientEl = document.getElementById('image-ambient') as HTMLDivElement;
const imageEl = document.getElementById('object-image') as HTMLImageElement;
const imageToggleBtnEl = document.getElementById('image-toggle-btn') as HTMLButtonElement;
const objectLinkEl = document.getElementById('object-link') as HTMLAnchorElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const emptyEl = document.getElementById('empty') as HTMLDivElement;

// Hosts handle width differently; sync height only to avoid narrow-width lock-in.
const app = new App({ name: 'met-object-details-app', version: '0.1.0' }, {}, { autoResize: false });
let stopHeightSync: (() => void) | null = null;

app.onhostcontextchanged = (contextUpdate) => {
  applyContext(contextUpdate);
};

app.ontoolinput = (params: ToolInputParams) => {
  applyInputState(params.arguments);
};

app.ontoolresult = (result: ToolResult) => {
  applyToolResult(result);
};

app.onteardown = async () => {
  if (stopHeightSync) {
    stopHeightSync();
    stopHeightSync = null;
  }
  return {};
};

imageToggleBtnEl.addEventListener('click', () => {
  state.isImageExpanded = !state.isImageExpanded;
  imageEl.classList.toggle('expanded', state.isImageExpanded);
  updateImageToggleButton();
});
metaDetailsEl.addEventListener('toggle', updateMetaSummary);

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !state.isImageExpanded) {
    return;
  }

  state.isImageExpanded = false;
  imageEl.classList.remove('expanded');
  updateImageToggleButton();
});

async function init(): Promise<void> {
  try {
    await app.connect();
    applyContext(app.getHostContext());
    stopHeightSync = startHeightSync();
    render();
    setStatus('Waiting for object details...', false);
  }
  catch (error) {
    setStatus(errorToMessage(error), true);
  }
}

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

function applyInputState(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== 'object') {
    return;
  }

  const input = rawInput as Record<string, unknown>;
  const objectId = input.objectId;
  if (typeof objectId === 'number' && Number.isFinite(objectId)) {
    state.isImageExpanded = false;
    setStatus(`Loading object ${objectId}...`, false);
    titleEl.textContent = 'Loading object details...';
    updateImageToggleButton();
  }
}

function applyToolResult(result: ToolResult): void {
  if (result.isError) {
    state.errorMessage = extractText(result) || 'Failed to load object details.';
    state.object = null;
    state.imageData = null;
    state.imageMimeType = null;
    state.isImageExpanded = false;
    render();
    setStatus(state.errorMessage, true);
    return;
  }

  const object = parseObjectResult(result);
  const imageBlock = getImageContent(result);
  state.object = object;
  state.imageData = imageBlock?.data ?? null;
  state.imageMimeType = imageBlock?.mimeType ?? null;
  state.errorMessage = null;
  state.isImageExpanded = false;
  render();

  const objectId = getObjectIdLabel(object);
  if (objectId) {
    setStatus(`Loaded object ${objectId}.`, false);
    return;
  }
  setStatus('Loaded object details.', false);
}

function render(): void {
  metaEl.innerHTML = '';
  highlightsEl.innerHTML = '';
  emptyEl.hidden = true;
  statusEl.classList.toggle('error', Boolean(state.errorMessage));
  metaDetailsEl.hidden = false;

  if (state.errorMessage) {
    titleEl.textContent = 'Unable to load object details';
    state.isImageExpanded = false;
    imageEl.classList.remove('expanded');
    imageWrapEl.hidden = true;
    highlightsEl.hidden = true;
    metaDetailsEl.hidden = true;
    objectLinkEl.hidden = true;
    emptyEl.textContent = state.errorMessage;
    emptyEl.hidden = false;
    updateImageToggleButton();
    updateMetaSummary();
    return;
  }

  if (!state.object) {
    titleEl.textContent = 'Waiting for object details...';
    state.isImageExpanded = false;
    imageEl.classList.remove('expanded');
    imageWrapEl.hidden = true;
    highlightsEl.hidden = true;
    metaDetailsEl.hidden = true;
    objectLinkEl.hidden = true;
    emptyEl.textContent = 'No object data is available for this result.';
    emptyEl.hidden = false;
    updateImageToggleButton();
    updateMetaSummary();
    return;
  }

  const objectData = state.object;
  const title = stringOrFallback(objectData.title, 'Untitled');
  titleEl.textContent = title;
  imageEl.alt = stringOrFallback(objectData.title, 'Artwork image');

  const imageUrl = getImageUrl(objectData);
  if (imageUrl) {
    imageEl.src = imageUrl;
    imageEl.classList.toggle('expanded', state.isImageExpanded);
    imageAmbientEl.style.backgroundImage = `url("${imageUrl}")`;
    imageWrapEl.hidden = false;
    metaDetailsEl.open = false;
    updateImageToggleButton();
  }
  else {
    state.isImageExpanded = false;
    imageEl.removeAttribute('src');
    imageEl.classList.remove('expanded');
    imageAmbientEl.style.backgroundImage = '';
    imageWrapEl.hidden = true;
    metaDetailsEl.open = true;
    updateImageToggleButton();
  }

  appendHighlight('Artist', objectData.artistDisplayName);
  appendHighlight('Date', objectData.objectDate);
  appendHighlight('Department', objectData.department);
  appendHighlight('Medium', objectData.medium);
  highlightsEl.hidden = highlightsEl.childElementCount === 0;

  appendMetaRow('Object ID', getObjectIdLabel(objectData));
  appendMetaRow('Artist', objectData.artistDisplayName);
  appendMetaRow('Artist Bio', objectData.artistDisplayBio);
  appendMetaRow('Department', objectData.department);
  appendMetaRow('Date', objectData.objectDate);
  appendMetaRow('Medium', objectData.medium);
  appendMetaRow('Dimensions', objectData.dimensions);
  appendMetaRow('Credit Line', objectData.creditLine);
  appendMetaRow('Tags', getTagsLabel(objectData.tags));
  metaDetailsEl.hidden = metaEl.childElementCount === 0;
  if (!metaDetailsEl.hidden) {
    updateMetaSummary();
  }

  const objectLink = getObjectLinkUrl(objectData);
  if (objectLink) {
    objectLinkEl.href = objectLink;
    objectLinkEl.hidden = false;
  }
  else {
    objectLinkEl.hidden = true;
  }
}

function appendMetaRow(label: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'meta-row';

  const key = document.createElement('dt');
  key.className = 'meta-key';
  key.textContent = label;

  const content = document.createElement('dd');
  content.className = 'meta-value';
  content.textContent = value;

  row.append(key, content);
  metaEl.append(row);
}

function appendHighlight(label: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  const item = document.createElement('li');
  item.textContent = `${label}: ${value}`;
  highlightsEl.append(item);
}

function getObjectIdLabel(objectData: ObjectData | null): string | undefined {
  if (!objectData) {
    return undefined;
  }

  const { objectID } = objectData;
  if (typeof objectID === 'number' && Number.isFinite(objectID)) {
    return String(objectID);
  }

  if (typeof objectID === 'string') {
    const trimmed = objectID.trim();
    return trimmed || undefined;
  }

  return undefined;
}

function getTagsLabel(tags: Array<{ term?: string }> | undefined): string | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const values = tags
    .map(tag => tag?.term?.trim())
    .filter((term): term is string => Boolean(term));
  if (!values.length) {
    return undefined;
  }
  return values.join(', ');
}

function getImageUrl(objectData: ObjectData): string | null {
  if (state.imageData && state.imageMimeType) {
    return `data:${state.imageMimeType};base64,${state.imageData}`;
  }

  if (objectData.primaryImage) {
    return objectData.primaryImage;
  }

  if (objectData.primaryImageSmall) {
    return objectData.primaryImageSmall;
  }

  return null;
}

function getObjectLinkUrl(objectData: ObjectData): string | null {
  if (typeof objectData.objectURL === 'string' && objectData.objectURL.trim()) {
    return objectData.objectURL.trim();
  }

  const objectId = getObjectIdLabel(objectData);
  if (!objectId) {
    return null;
  }

  return `https://www.metmuseum.org/art/collection/search/${objectId}`;
}

function extractText(result: ToolResult): string {
  if (!Array.isArray(result.content)) {
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
  if (!Array.isArray(result.content)) {
    return null;
  }

  const block = result.content.find(isImageContentBlock);
  return block ?? null;
}

function parseObjectResult(result: ToolResult): ObjectData | null {
  const structured = result.structuredContent;
  if (structured && typeof structured === 'object') {
    const candidate = (structured as Record<string, unknown>).object;
    if (candidate && typeof candidate === 'object') {
      return candidate as ObjectData;
    }
  }

  const text = extractText(result);
  if (!text) {
    return null;
  }

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
      case 'Object URL':
        parsed.objectURL = value;
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

function isTextContentBlock(
  block: ToolContentBlock,
): block is Extract<ToolContentBlock, { type: 'text' }> {
  return block.type === 'text';
}

function isImageContentBlock(
  block: ToolContentBlock,
): block is Extract<ToolContentBlock, { type: 'image' }> {
  return block.type === 'image';
}

function stringOrFallback(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function setStatus(message: string, isError: boolean): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function updateImageToggleButton(): void {
  imageToggleBtnEl.textContent = state.isImageExpanded ? 'Collapse image' : 'Expand image';
  imageToggleBtnEl.setAttribute('aria-expanded', state.isImageExpanded ? 'true' : 'false');
}

function updateMetaSummary(): void {
  metaSummaryEl.textContent = metaDetailsEl.open
    ? 'Hide full object details'
    : 'Show full object details';
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function startHeightSync(): (() => void) | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }

  const appRoot = document.querySelector('.app') as HTMLElement | null;
  if (!appRoot) {
    return null;
  }

  let raf = 0;
  let lastHeight = 0;

  const reportHeight = (): void => {
    raf = 0;
    const nextHeight = Math.ceil(appRoot.getBoundingClientRect().height);
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
  observer.observe(appRoot);
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

init().catch((error: unknown) => {
  setStatus(errorToMessage(error), true);
});
