import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppHtml } from './resolve-html.js';

const uiBaseDir = path.dirname(fileURLToPath(import.meta.url));
const uiHtmlPath = path.join(uiBaseDir, 'met-explorer', 'mcp-app.html');
const distUiHtmlPath = path.join(uiBaseDir, '..', '..', 'dist', 'ui', 'met-explorer', 'mcp-app.html');

export class OpenMetExplorerAppResource {
  public readonly name: string = 'Met Explorer';
  public readonly uri: string = 'ui://met/explorer.html';
  public readonly mimeType: string = 'text/html;profile=mcp-app';

  private htmlCache?: string;

  public async getHtml(): Promise<string> {
    if (this.htmlCache) {
      return this.htmlCache;
    }

    this.htmlCache = await resolveAppHtml(uiHtmlPath, distUiHtmlPath);
    return this.htmlCache;
  }
}
