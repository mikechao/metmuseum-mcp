import type { App } from '@modelcontextprotocol/ext-apps';
import type { ObjectData } from '../shared/types.js';
import type { AppState } from './state.js';
import { errorToMessage, stringOrFallback } from '../shared/utils.js';

interface StatusCallback {
  setStatus: (message: string, isError: boolean) => void;
}

type ContextContentBlock
  = { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string };

interface ContextUpdatePayload {
  objectDetailsText: string;
  content: ContextContentBlock[];
  hasImagePayload: boolean;
  canSendImagePayload: boolean;
  canSendStructuredContent: boolean;
}

interface MessageFallbackOutcome {
  handled: boolean;
  error?: unknown;
}

type AddContextButtonState = Pick<
  AppState,
  'selectedObject' | 'addedContextObjectIds' | 'isAddingToContext'
>;

type AddSelectedObjectToContextState = Pick<
  AppState,
  | 'selectedObject'
  | 'isAddingToContext'
  | 'selectedImageData'
  | 'selectedImageMimeType'
  | 'addedContextObjectIds'
>;

export function getObjectContextId(objectData: ObjectData | null): string | null {
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

export function updateAddContextButton(
  state: AddContextButtonState,
  addContextBtn: HTMLButtonElement,
): void {
  const selectedObjectId = getObjectContextId(state.selectedObject);
  const isAdded = Boolean(
    selectedObjectId
    && state.addedContextObjectIds.has(selectedObjectId),
  );
  const canAdd = state.selectedObject !== null && !state.isAddingToContext && !isAdded;

  addContextBtn.disabled = !canAdd;
  addContextBtn.classList.toggle('added', isAdded && !state.isAddingToContext);
  addContextBtn.textContent = state.isAddingToContext
    ? 'Adding...'
    : isAdded
      ? 'Added'
      : 'Add to conversation';
}

function markObjectAsAdded(
  state: AddSelectedObjectToContextState,
  objectData: ObjectData,
): void {
  const objectId = getObjectContextId(objectData);
  if (!objectId) {
    return;
  }

  state.addedContextObjectIds.add(objectId);
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
  app: App,
  state: AddSelectedObjectToContextState,
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

  markObjectAsAdded(state, objectData);
  return true;
}

function buildContextUpdatePayload(
  state: AddSelectedObjectToContextState,
  objectData: ObjectData,
  capabilities: ReturnType<App['getHostCapabilities']>['updateModelContext'] | undefined,
): ContextUpdatePayload {
  const objectDetailsText = buildObjectContextText(objectData);
  const imageData = state.selectedImageData;
  const imageMimeType = state.selectedImageMimeType;
  const hasImagePayload = Boolean(imageData && imageMimeType);
  const canSendImagePayload = hasImagePayload
    && (capabilities ? Boolean(capabilities.image) : true);
  const canSendStructuredContent = Boolean(capabilities?.structuredContent);
  const content: ContextContentBlock[] = [{ type: 'text', text: objectDetailsText }];

  if (imageData && imageMimeType && canSendImagePayload) {
    content.push({
      type: 'image',
      data: imageData,
      mimeType: imageMimeType,
    });
  }

  return {
    objectDetailsText,
    content,
    hasImagePayload,
    canSendImagePayload,
    canSendStructuredContent,
  };
}

async function updateContextFromPayload(
  app: App,
  objectData: ObjectData,
  payload: ContextUpdatePayload,
): Promise<void> {
  await app.updateModelContext({
    content: payload.content,
    structuredContent: payload.canSendStructuredContent
      ? {
          source: 'met-explorer-app',
          object: objectData,
          hasEmbeddedImage: payload.canSendImagePayload,
        }
      : undefined,
  });
}

async function tryMessageFallback(
  app: App,
  state: AddSelectedObjectToContextState,
  objectData: ObjectData,
  objectDetailsText: string,
): Promise<MessageFallbackOutcome> {
  try {
    const handled = await sendToolCallMessageForImageContext(app, state, objectData, objectDetailsText);
    return { handled };
  }
  catch (error) {
    return { handled: true, error };
  }
}

async function handleMessageFallbackAfterContextAdd(
  app: App,
  state: AddSelectedObjectToContextState,
  callbacks: StatusCallback,
  objectData: ObjectData,
  objectDetailsText: string,
): Promise<void> {
  const outcome = await tryMessageFallback(app, state, objectData, objectDetailsText);
  if (outcome.error) {
    callbacks.setStatus(errorToMessage(outcome.error), true);
    return;
  }

  if (outcome.handled) {
    callbacks.setStatus('Object details were added. Sent a follow-up chat message so the model can fetch image context via tool call.', false);
    return;
  }

  callbacks.setStatus('Object details were added, but this host does not accept image context blocks.', false);
}

async function tryUpdateTextOnly(
  app: App,
  objectDetailsText: string,
): Promise<{ success: true } | { success: false; error: unknown }> {
  try {
    await app.updateModelContext({
      content: [{ type: 'text', text: objectDetailsText }],
    });
    return { success: true };
  }
  catch (error) {
    return { success: false, error };
  }
}

async function tryMessageFallbackAfterFailure(
  app: App,
  state: AddSelectedObjectToContextState,
  callbacks: StatusCallback,
  objectData: ObjectData,
  objectDetailsText: string,
): Promise<boolean> {
  const outcome = await tryMessageFallback(app, state, objectData, objectDetailsText);
  if (!outcome.handled) {
    return false;
  }

  if (outcome.error) {
    callbacks.setStatus(errorToMessage(outcome.error), true);
    return true;
  }

  callbacks.setStatus('Sent a follow-up chat message so the model can fetch image context via tool call.', false);
  return true;
}

async function handleContextUpdateFailure(
  app: App,
  state: AddSelectedObjectToContextState,
  callbacks: StatusCallback,
  objectData: ObjectData,
  initialError: unknown,
): Promise<void> {
  const objectDetailsText = buildObjectContextText(objectData);
  const canRetryTextOnly = Boolean(state.selectedImageData && state.selectedImageMimeType);

  if (!canRetryTextOnly) {
    if (await tryMessageFallbackAfterFailure(app, state, callbacks, objectData, objectDetailsText)) {
      return;
    }

    callbacks.setStatus(errorToMessage(initialError), true);
    return;
  }

  const retryResult = await tryUpdateTextOnly(app, objectDetailsText);
  if (!retryResult.success) {
    if (await tryMessageFallbackAfterFailure(app, state, callbacks, objectData, objectDetailsText)) {
      return;
    }

    callbacks.setStatus(errorToMessage(retryResult.error), true);
    return;
  }

  markObjectAsAdded(state, objectData);
  if (await tryMessageFallbackAfterFailure(app, state, callbacks, objectData, objectDetailsText)) {
    return;
  }

  callbacks.setStatus('Object details were added, but image context was rejected by this host.', false);
}

export async function addSelectedObjectToContext(
  app: App,
  state: AddSelectedObjectToContextState,
  addContextBtn: HTMLButtonElement,
  callbacks: StatusCallback,
): Promise<void> {
  const objectData = state.selectedObject;
  if (!objectData || state.isAddingToContext) {
    return;
  }

  const capabilities = app.getHostCapabilities()?.updateModelContext;

  state.isAddingToContext = true;
  updateAddContextButton(state, addContextBtn);

  try {
    const payload = buildContextUpdatePayload(state, objectData, capabilities);
    await updateContextFromPayload(app, objectData, payload);

    markObjectAsAdded(state, objectData);

    if (payload.canSendImagePayload) {
      callbacks.setStatus('Object details and image were added to model context.', false);
      return;
    }

    if (payload.hasImagePayload && !payload.canSendImagePayload) {
      await handleMessageFallbackAfterContextAdd(
        app,
        state,
        callbacks,
        objectData,
        payload.objectDetailsText,
      );
      return;
    }

    callbacks.setStatus('Object details were added to model context.', false);
  }
  catch (error) {
    await handleContextUpdateFailure(app, state, callbacks, objectData, error);
  }
  finally {
    state.isAddingToContext = false;
    updateAddContextButton(state, addContextBtn);
  }
}
