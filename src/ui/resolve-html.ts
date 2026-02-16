import { readFile } from 'node:fs/promises';
import path from 'node:path';

const APP_SCRIPT_TAG = '<script src="mcp-app.js"></script>';
const SHARED_THEME_TOKENS_PLACEHOLDER = '/* @shared-theme-tokens */';

function inlineSharedThemeTokens(
  html: string,
  sharedThemeTokens: string,
  htmlPath: string,
): string {
  const placeholderSections = html.split(SHARED_THEME_TOKENS_PLACEHOLDER);
  if (placeholderSections.length === 1) {
    return html;
  }

  if (placeholderSections.length !== 2) {
    throw new Error(`Expected exactly one shared theme placeholder in ${htmlPath}.`);
  }

  return `${placeholderSections[0]}${sharedThemeTokens.trim()}${placeholderSections[1]}`;
}

function toSafeInlineScript(script: string): string {
  return script.replace(/<\/script/gi, '<\\/script');
}

/**
 * Resolves an MCP app HTML template by inlining the bundled JS.
 *
 * Lookup order:
 * 1. Read the sibling `mcp-app.js` next to `htmlPath` and inline it.
 * 2. Fall back to the pre-built HTML in `distHtmlPath` (already inlined by esbuild).
 * 3. Throw if neither source is available.
 */
export async function resolveAppHtml(
  htmlPath: string,
  distHtmlPath: string,
): Promise<string> {
  const htmlTemplate = await readFile(htmlPath, 'utf-8');
  let html = htmlTemplate;
  if (htmlTemplate.includes(SHARED_THEME_TOKENS_PLACEHOLDER)) {
    const sharedThemePath = path.join(path.dirname(htmlPath), '..', 'shared', 'theme-tokens.css');
    const sharedThemeTokens = await readFile(sharedThemePath, 'utf-8');
    html = inlineSharedThemeTokens(htmlTemplate, sharedThemeTokens, htmlPath);
  }

  if (!html.includes(APP_SCRIPT_TAG)) {
    return html;
  }

  const scriptPath = path.join(path.dirname(htmlPath), 'mcp-app.js');

  try {
    const appScript = await readFile(scriptPath, 'utf-8');
    return html.replace(APP_SCRIPT_TAG, `<script>\n${toSafeInlineScript(appScript)}</script>`);
  }
  catch {
    // In source-mode runs, the JS bundle may not exist yet.
  }

  if (path.resolve(distHtmlPath) !== path.resolve(htmlPath)) {
    try {
      const distHtml = await readFile(distHtmlPath, 'utf-8');
      if (!distHtml.includes(APP_SCRIPT_TAG)) {
        return distHtml;
      }
    }
    catch {
      // Ignore and throw a focused error below.
    }
  }

  throw new Error(
    'UI bundle is missing. Run "pnpm run build" to generate an inline mcp-app bundle for CSP-safe loading.',
  );
}
