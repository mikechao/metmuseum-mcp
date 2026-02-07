import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appWithDepsPath = require.resolve('@modelcontextprotocol/ext-apps/app-with-deps');

const APP_RUNTIME_TOKEN = '__APP_WITH_DEPS_RUNTIME_CODE__';
const RUNTIME_GLOBAL_NAME = '__MCP_APPS_RUNTIME__';
const REQUIRED_RUNTIME_EXPORTS = [
  'App',
  'applyDocumentTheme',
  'applyHostFonts',
  'applyHostStyleVariables',
] as const;
const uiHtmlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'met-explorer',
  'mcp-app.html',
);

export interface OpenMetExplorerLaunchState {
  q?: string;
  hasImages?: boolean;
  title?: boolean;
  departmentId?: number;
  objectId?: number;
}

export class OpenMetExplorerAppResource {
  public readonly name: string = 'Met Explorer';
  public readonly uri: string = 'ui://met/explorer.html';
  public readonly mimeType: string = 'text/html;profile=mcp-app';

  private htmlCache?: string;

  public async getHtml(): Promise<string> {
    if (this.htmlCache) {
      return this.htmlCache;
    }

    const [htmlTemplate, appWithDepsCode] = await Promise.all([
      readFile(uiHtmlPath, 'utf-8'),
      readFile(appWithDepsPath, 'utf-8'),
    ]);

    const runtimeScript = buildRuntimeScript(appWithDepsCode);
    if (!htmlTemplate.includes(APP_RUNTIME_TOKEN)) {
      throw new Error(`UI template missing token: ${APP_RUNTIME_TOKEN}`);
    }

    this.htmlCache = htmlTemplate.replace(APP_RUNTIME_TOKEN, () => runtimeScript);
    return this.htmlCache;
  }
}

function buildRuntimeScript(appWithDepsCode: string): string {
  const exportMatch = appWithDepsCode.match(/export\s*\{([\s\S]*?)\};?\s*$/);
  if (!exportMatch) {
    throw new Error('Could not find export block in @modelcontextprotocol/ext-apps/app-with-deps.');
  }

  const exportMap = new Map<string, string>();
  const exportEntries = exportMatch[1]
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  for (const entry of exportEntries) {
    const match = entry.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (!match) {
      continue;
    }
    const local = match[1];
    const exported = match[2] ?? local;
    exportMap.set(exported, local);
  }

  const missing = REQUIRED_RUNTIME_EXPORTS.filter(name => !exportMap.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing required runtime exports: ${missing.join(', ')}`);
  }

  const runtimeEntries = REQUIRED_RUNTIME_EXPORTS.map((name) => {
    const local = exportMap.get(name)!;
    return `  ${name}: ${local}`;
  }).join(',\n');
  const runtimeAssignment = `\n;globalThis.${RUNTIME_GLOBAL_NAME} = {\n${runtimeEntries}\n};\n`;

  const withoutExportBlock = appWithDepsCode.replace(/export\s*\{[\s\S]*?\};?\s*$/, runtimeAssignment);
  return withoutExportBlock.replace(/<\/script/gi, '<\\/script');
}
