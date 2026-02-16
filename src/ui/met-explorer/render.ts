import type { AppState } from './state.js';
import { errorToMessage, stringOrFallback } from '../shared/utils.js';

export interface RenderState {
  state: Pick<
    AppState,
    | 'results'
    | 'searchRequest'
    | 'selectedObject'
    | 'selectedImageData'
    | 'selectedImageMimeType'
    | 'isImageExpanded'
    | 'isResultsLoading'
    | 'isDetailsLoading'
  >;
}

export interface RenderElements {
  resultsEl: HTMLDivElement;
  detailsEl: HTMLDivElement;
}

export interface RenderCallbacks {
  loadObjectDetails: (objectId: number) => Promise<void>;
  setStatus: (message: string, isError: boolean) => void;
  updateAddContextButton: () => void;
}

export function renderResults(
  renderState: RenderState,
  elements: RenderElements,
  callbacks: RenderCallbacks,
): void {
  const { state } = renderState;
  const { resultsEl } = elements;
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
      callbacks.loadObjectDetails(result.objectID).catch((error: unknown) => {
        callbacks.setStatus(errorToMessage(error), true);
      });
    });

    if (result.primaryImageSmall) {
      const img = document.createElement('img');
      img.src = result.primaryImageSmall;
      img.alt = result.title;
      img.addEventListener('error', () => {
        replaceCardImageWithPlaceholder(card, img);
      }, { once: true });
      card.append(img);
    }
    else {
      card.append(createResultImagePlaceholder());
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

export function renderDetails(
  renderState: RenderState,
  elements: RenderElements,
  callbacks: RenderCallbacks,
): void {
  const { state } = renderState;
  const { detailsEl } = elements;
  detailsEl.innerHTML = '';

  if (!state.selectedObject) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Select an object to see details.';
    detailsEl.append(empty);
    callbacks.updateAddContextButton();
    return;
  }

  callbacks.updateAddContextButton();

  const objectData = state.selectedObject;
  const imageUrl = getSelectedImageUrl(state, objectData);

  if (imageUrl) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'detail-image-wrap';

    const image = document.createElement('img');
    image.className = 'detail-image';
    image.classList.toggle('expanded', state.isImageExpanded);
    image.alt = stringOrFallback(objectData.title, 'Artwork image');
    image.src = imageUrl;

    const viewFullButton = document.createElement('button');
    viewFullButton.type = 'button';
    viewFullButton.className = 'image-view-btn';
    viewFullButton.textContent = state.isImageExpanded ? 'Collapse image' : 'Expand image';
    viewFullButton.setAttribute('aria-expanded', state.isImageExpanded ? 'true' : 'false');
    viewFullButton.addEventListener('click', () => {
      state.isImageExpanded = !state.isImageExpanded;
      image.classList.toggle('expanded', state.isImageExpanded);
      viewFullButton.textContent = state.isImageExpanded ? 'Collapse image' : 'Expand image';
      viewFullButton.setAttribute('aria-expanded', state.isImageExpanded ? 'true' : 'false');
    });

    const imageActions = document.createElement('div');
    imageActions.className = 'detail-image-actions';
    imageActions.append(viewFullButton);

    const imageFallback = document.createElement('div');
    imageFallback.className = 'detail-image-placeholder';
    imageFallback.textContent = 'Image unavailable for this object.';
    imageFallback.hidden = true;

    image.addEventListener('error', () => {
      state.isImageExpanded = false;
      image.remove();
      imageFallback.hidden = false;
      imageActions.hidden = true;
      callbacks.setStatus('Image unavailable for this object. Metadata is still available.', false);
    }, { once: true });

    imageWrap.append(image, imageFallback, imageActions);
    detailsEl.append(imageWrap);
  }
  else {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'detail-image-wrap';
    const imageFallback = document.createElement('div');
    imageFallback.className = 'detail-image-placeholder';
    imageFallback.textContent = 'No image available for this object.';
    imageWrap.append(imageFallback);
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
}

function appendDetailRow(
  table: HTMLDListElement,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === undefined || value === null || value === '') {
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

function getSelectedImageUrl(
  state: RenderState['state'],
  objectData: NonNullable<RenderState['state']['selectedObject']>,
): string | null {
  if (state.selectedImageData && state.selectedImageMimeType) {
    return `data:${state.selectedImageMimeType};base64,${state.selectedImageData}`;
  }
  if (objectData.primaryImage) {
    return objectData.primaryImage;
  }
  if (objectData.primaryImageSmall) {
    return objectData.primaryImageSmall;
  }
  return null;
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

function createResultImagePlaceholder(): HTMLDivElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'result-image-placeholder';
  placeholder.textContent = 'No image available';
  return placeholder;
}

function replaceCardImageWithPlaceholder(
  card: HTMLButtonElement,
  image: HTMLImageElement,
): void {
  image.remove();
  if (card.querySelector('.result-image-placeholder')) {
    return;
  }

  card.prepend(createResultImagePlaceholder());
}
