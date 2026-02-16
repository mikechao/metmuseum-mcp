import type { ObjectData } from '../shared/types.js';
import type { ResultCard, SearchRequest } from './types.js';
import { DEFAULT_SEARCH_PAGE_SIZE } from '../../constants.js';

export interface LaunchParams {
  q?: string;
  hasImages?: boolean;
  title?: boolean;
  departmentId?: number;
}

export type { ResultCard, SearchRequest } from './types.js';

export interface AppState {
  launch: LaunchParams;
  results: ResultCard[];
  selectedObject: ObjectData | null;
  selectedImageData: string | null;
  selectedImageMimeType: string | null;
  addedContextObjectIds: Set<string>;
  isImageExpanded: boolean;
  viewMode: 'results' | 'detail';
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
  isInitialized: boolean;
  departmentsLoaded: boolean;
  pendingLaunchSearchSignature: string | null;
  lastLaunchSearchSignature: string | null;
  lastResultsContextSignature: string | null;
}

export const DEFAULT_PAGE_SIZE = DEFAULT_SEARCH_PAGE_SIZE;

export function createInitialState(): AppState {
  return {
    launch: {},
    results: [],
    selectedObject: null,
    selectedImageData: null,
    selectedImageMimeType: null,
    addedContextObjectIds: new Set<string>(),
    isImageExpanded: false,
    viewMode: 'results',
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
    isInitialized: false,
    departmentsLoaded: false,
    pendingLaunchSearchSignature: null,
    lastLaunchSearchSignature: null,
    lastResultsContextSignature: null,
  };
}

export interface ViewModeElements {
  resultsPanelEl: HTMLElement;
  detailPanelEl: HTMLElement;
}

export function setViewMode(
  state: AppState,
  elements: ViewModeElements,
  mode: 'results' | 'detail',
): void {
  state.viewMode = mode;
  elements.resultsPanelEl.hidden = mode !== 'results';
  elements.detailPanelEl.hidden = mode !== 'detail';
}

export function getLaunchSearchSignature(state: AppState): string | null {
  const q = state.launch.q?.trim();
  if (!q) {
    return null;
  }

  const hasImages = Boolean(state.launch.hasImages);
  const title = Boolean(state.launch.title);
  const departmentId
    = typeof state.launch.departmentId === 'number'
      ? state.launch.departmentId
      : null;

  return [q, hasImages ? '1' : '0', title ? '1' : '0', departmentId ?? ''].join('|');
}

export interface BusyControls {
  queryInput: HTMLInputElement;
  departmentSelect: HTMLSelectElement;
  hasImagesInput: HTMLInputElement;
  titleOnlyInput: HTMLInputElement;
  searchButton: HTMLButtonElement;
}

export function setBusy(
  state: AppState,
  controls: BusyControls,
  updatePagination: () => void,
  isBusy: boolean,
): void {
  state.isBusy = isBusy;
  controls.queryInput.disabled = isBusy;
  controls.departmentSelect.disabled = isBusy;
  controls.hasImagesInput.disabled = isBusy;
  controls.titleOnlyInput.disabled = isBusy;
  controls.searchButton.disabled = isBusy;
  updatePagination();
}

export function updateResultsTitle(
  state: AppState,
  resultsTitleEl: HTMLDivElement,
): void {
  resultsTitleEl.textContent
    = state.totalResults > 0 ? `Results (${state.totalResults} total)` : 'Results';
}

export interface PaginationElements {
  resultsPaginationEl: HTMLDivElement;
  pageInfoEl: HTMLDivElement;
  prevPageButton: HTMLButtonElement;
  nextPageButton: HTMLButtonElement;
}

export function updatePagination(
  state: AppState,
  elements: PaginationElements,
): void {
  const hasResults = state.totalResults > 0 && state.totalPages > 0;
  elements.resultsPaginationEl.style.display = hasResults ? 'flex' : 'none';
  elements.pageInfoEl.textContent = hasResults
    ? `Page ${state.currentPage} of ${state.totalPages}`
    : 'Page 0 of 0';
  elements.prevPageButton.disabled = !hasResults || state.isBusy || state.currentPage <= 1;
  elements.nextPageButton.disabled = !hasResults || state.isBusy || state.currentPage >= state.totalPages;
}

export function setStatus(
  statusEl: HTMLDivElement,
  message: string,
  isError: boolean,
): void {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}
