import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uiBaseDir = path.dirname(fileURLToPath(import.meta.url));
const uiHtmlPath = path.join(
  uiBaseDir,
  'object-details',
  'mcp-app.html',
);
const uiScriptPath = path.join(
  uiBaseDir,
  'object-details',
  'mcp-app.js',
);
const distUiHtmlPath = path.join(
  uiBaseDir,
  '..',
  '..',
  'dist',
  'ui',
  'object-details',
  'mcp-app.html',
);
const APP_SCRIPT_TAG = '<script src="mcp-app.js"></script>';

export class GetMuseumObjectAppResource {
  public readonly name: string = 'Met Object Details';
  public readonly uri: string = 'ui://met/object-details.html';
  public readonly mimeType: string = 'text/html;profile=mcp-app';

  private htmlCache?: string;

  public async getHtml(): Promise<string> {
    if (this.htmlCache) {
      return this.htmlCache;
    }

    const html = await readFile(uiHtmlPath, 'utf-8');
    this.htmlCache = await resolveAppHtml(html);
    return this.htmlCache;
  }
}

async function resolveAppHtml(html: string): Promise<string> {
  if (!html.includes(APP_SCRIPT_TAG)) {
    return html;
  }

  try {
    const appScript = await readFile(uiScriptPath, 'utf-8');
    return html.replace(APP_SCRIPT_TAG, `<script>\n${toSafeInlineScript(appScript)}</script>`);
  }
  catch {
    // In source-mode runs, the JS bundle may not exist yet.
  }

  if (path.resolve(distUiHtmlPath) !== path.resolve(uiHtmlPath)) {
    try {
      const distHtml = await readFile(distUiHtmlPath, 'utf-8');
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

function toSafeInlineScript(script: string): string {
  return script.replace(/<\/script/gi, '<\\/script');
}
