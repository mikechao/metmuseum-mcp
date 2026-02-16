/**
 * Build script for MCP apps.
 *
 * Bundles TypeScript and injects it into each HTML template.
 */

import * as fs from 'node:fs';
import process from 'node:process';
import * as esbuild from 'esbuild';
import { buildAppHtmlTemplate } from './ui-template-build.mjs';

const SHARED_THEME_TOKENS_PATH = 'src/ui/shared/theme-tokens.css';

const APP_CONFIGS = [
  {
    srcDir: 'src/ui/met-explorer',
    distDir: 'dist/ui/met-explorer',
  },
  {
    srcDir: 'src/ui/object-details',
    distDir: 'dist/ui/object-details',
  },
];

async function buildApp({ srcDir, distDir }, sharedThemeTokens) {
  fs.mkdirSync(distDir, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [`${srcDir}/mcp-app.ts`],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
  });

  const templatePath = `${srcDir}/mcp-app.html`;
  const finalHtml = buildAppHtmlTemplate({
    templatePath,
    sharedThemeTokens,
    bundledCode: result.outputFiles[0].text,
  });

  fs.writeFileSync(`${distDir}/mcp-app.html`, finalHtml);

  console.log(`✅ Built ${distDir}/mcp-app.html (${(finalHtml.length / 1024).toFixed(1)}kb)`);
}

async function build() {
  const sharedThemeTokens = fs.readFileSync(SHARED_THEME_TOKENS_PATH, 'utf-8');
  for (const appConfig of APP_CONFIGS) {
    await buildApp(appConfig, sharedThemeTokens);
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
