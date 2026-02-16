import type { ObjectData, ToolInputParams, ToolResult } from '../shared/types.js';
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

interface AppState {
  object: ObjectData | null;
  imageData: string | null;
  imageMimeType: string | null;
  errorMessage: string | null;
}

const state: AppState = {
  object: null,
  imageData: null,
  imageMimeType: null,
  errorMessage: null,
};

const titleEl = getElementById('title', HTMLHeadingElement);
const highlightsEl = getElementById('highlights', HTMLUListElement);
const metaDetailsEl = getElementById('meta-details', HTMLDetailsElement);
const metaSummaryEl = getElementById('meta-summary', HTMLElement);
const metaEl = getElementById('meta', HTMLDListElement);
const imageWrapEl = getElementById('image-wrap', HTMLDivElement);
const imageAmbientEl = getElementById('image-ambient', HTMLDivElement);
const imageEl = getElementById('object-image', HTMLImageElement);
const imageFallbackEl = getElementById('image-fallback', HTMLDivElement);
const objectLinkEl = getElementById('object-link', HTMLAnchorElement);
const statusEl = getElementById('status', HTMLDivElement);
const emptyEl = getElementById('empty', HTMLDivElement);
const APP_VERSION = '__MET_MUSEUM_APP_VERSION__';

// Hosts handle width differently; sync height only to avoid narrow-width lock-in.
const app = new App({ name: 'met-object-details-app', version: APP_VERSION }, {}, { autoResize: false });
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

metaDetailsEl.addEventListener('toggle', updateMetaSummary);
imageEl.addEventListener('error', handleImageLoadError);
imageEl.addEventListener('load', () => {
  imageEl.hidden = false;
  imageFallbackEl.hidden = true;
});

async function init(): Promise<void> {
  try {
    await app.connect();
    applyContext(app.getHostContext());
    stopHeightSync = startHeightSync(s => app.sendSizeChanged(s), '.app');
    render();
    setStatus('Waiting for object details...', false);
  }
  catch (error) {
    setStatus(errorToMessage(error), true);
  }
}

function applyInputState(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== 'object') {
    return;
  }

  const input = rawInput as Record<string, unknown>;
  const objectId = input.objectId;
  if (typeof objectId === 'number' && Number.isFinite(objectId)) {
    setStatus(`Loading object ${objectId}...`, false);
    titleEl.textContent = 'Loading object details...';
  }
}

function applyToolResult(result: ToolResult): void {
  if (result.isError) {
    state.errorMessage = extractText(result) || 'Failed to load object details.';
    state.object = null;
    state.imageData = null;
    state.imageMimeType = null;
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
    hideImagePresentation();
    highlightsEl.hidden = true;
    metaDetailsEl.hidden = true;
    objectLinkEl.hidden = true;
    emptyEl.textContent = state.errorMessage;
    emptyEl.hidden = false;
    updateMetaSummary();
    return;
  }

  if (!state.object) {
    titleEl.textContent = 'Waiting for object details...';
    hideImagePresentation();
    highlightsEl.hidden = true;
    metaDetailsEl.hidden = true;
    objectLinkEl.hidden = true;
    emptyEl.textContent = 'No object data is available for this result.';
    emptyEl.hidden = false;
    updateMetaSummary();
    return;
  }

  const objectData = state.object;
  const title = stringOrFallback(objectData.title, 'Untitled');
  titleEl.textContent = title;
  imageEl.alt = stringOrFallback(objectData.title, 'Artwork image');

  const imageUrl = getImageUrl(objectData);
  if (imageUrl) {
    showImage(imageUrl);
    metaDetailsEl.open = false;
  }
  else {
    showImageFallback('No image available for this object.');
    metaDetailsEl.open = true;
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

function hideImagePresentation(): void {
  imageEl.hidden = true;
  imageEl.removeAttribute('src');
  imageFallbackEl.hidden = true;
  imageWrapEl.hidden = true;
  imageAmbientEl.style.backgroundImage = '';
}

function showImage(imageUrl: string): void {
  imageFallbackEl.hidden = true;
  imageEl.hidden = false;
  imageEl.src = imageUrl;
  imageWrapEl.hidden = false;
  imageAmbientEl.style.backgroundImage = `url("${imageUrl}")`;
}

function showImageFallback(message: string): void {
  imageEl.hidden = true;
  imageEl.removeAttribute('src');
  imageFallbackEl.textContent = message;
  imageFallbackEl.hidden = false;
  imageWrapEl.hidden = false;
  imageAmbientEl.style.backgroundImage = '';
}

function handleImageLoadError(): void {
  showImageFallback('Image unavailable for this object.');
  const objectId = getObjectIdLabel(state.object);
  if (objectId) {
    setStatus(`Loaded object ${objectId}, but image is unavailable.`, false);
    return;
  }

  setStatus('Object details loaded, but image is unavailable.', false);
}

function setStatus(message: string, isError: boolean): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function updateMetaSummary(): void {
  metaSummaryEl.textContent = metaDetailsEl.open
    ? 'Hide full object details'
    : 'Show full object details';
}

init().catch((error: unknown) => {
  setStatus(errorToMessage(error), true);
});
