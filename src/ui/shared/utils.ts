import {
    applyDocumentTheme,
    applyHostFonts,
    applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import type { HostContext, ObjectData, ToolContentBlock, ToolResult } from './types.js';

// ============================================================================
// Context Helpers
// ============================================================================

export function applyContext(context: HostContext): void {
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

// ============================================================================
// Content Block Helpers
// ============================================================================

export function isTextContentBlock(
    block: ToolContentBlock,
): block is Extract<ToolContentBlock, { type: 'text' }> {
    return block.type === 'text';
}

export function isImageContentBlock(
    block: ToolContentBlock,
): block is Extract<ToolContentBlock, { type: 'image' }> {
    return block.type === 'image';
}

export function extractText(result: ToolResult): string {
    if (!Array.isArray(result?.content)) {
        return '';
    }

    return result.content
        .filter(isTextContentBlock)
        .map(block => block.text)
        .join('\n')
        .trim();
}

export function getImageContent(
    result: ToolResult,
): Extract<ToolContentBlock, { type: 'image' }> | null {
    if (!Array.isArray(result?.content)) {
        return null;
    }

    const block = result.content.find(isImageContentBlock);
    return block ?? null;
}

// ============================================================================
// Object Parsing
// ============================================================================

export function parseObjectResult(result: ToolResult): ObjectData | null {
    const structured = result?.structuredContent;
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

// ============================================================================
// General Utilities
// ============================================================================

export function stringOrFallback(value: string | undefined, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

export function errorToMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return String(error);
}

// ============================================================================
// Height Sync
// ============================================================================

/**
 * Sets up a ResizeObserver-driven height sync loop.
 *
 * @param sendSizeChanged - callback to report the new height (typically `app.sendSizeChanged`)
 * @param rootSelector    - optional CSS selector for the measurement target;
 *                          defaults to `document.documentElement`
 * @returns a cleanup function, or `null` if ResizeObserver is unavailable.
 */
export function startHeightSync(
    sendSizeChanged: (size: { height: number }) => void,
    rootSelector?: string,
): (() => void) | null {
    if (typeof ResizeObserver === 'undefined') {
        return null;
    }

    const measureTarget = rootSelector
        ? document.querySelector(rootSelector) as HTMLElement | null
        : document.documentElement;

    if (!measureTarget) {
        return null;
    }

    let raf = 0;
    let lastHeight = 0;

    const reportHeight = (): void => {
        raf = 0;
        const nextHeight = Math.ceil(measureTarget.getBoundingClientRect().height);
        if (!nextHeight || nextHeight === lastHeight) {
            return;
        }
        lastHeight = nextHeight;
        sendSizeChanged({ height: nextHeight });
    };

    const scheduleReport = (): void => {
        if (raf) {
            return;
        }
        raf = requestAnimationFrame(reportHeight);
    };

    const observer = new ResizeObserver(scheduleReport);
    if (measureTarget !== document.documentElement) {
        observer.observe(measureTarget);
    }
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
