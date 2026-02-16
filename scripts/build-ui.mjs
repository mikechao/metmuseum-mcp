/**
 * Build script for MCP apps.
 *
 * Bundles TypeScript and injects it into each HTML template.
 */

import * as fs from 'node:fs';
import process from 'node:process';
import * as esbuild from 'esbuild';

const APP_SCRIPT_TAG_PATTERN = /<script[^>]*\ssrc=(["'])mcp-app\.js\1[^>]*>\s*<\/script>/gi;
const SHARED_THEME_TOKENS_PATH = 'src/ui/shared/theme-tokens.css';
const SHARED_THEME_TOKENS_PLACEHOLDER = '/* @shared-theme-tokens */';

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

function inlineSharedThemeTokens(htmlTemplate, sharedThemeTokens, templatePath) {
  const placeholderSections = htmlTemplate.split(SHARED_THEME_TOKENS_PLACEHOLDER);
  if (placeholderSections.length !== 2) {
    throw new Error(
      `Expected exactly one shared theme placeholder in ${templatePath}, found ${placeholderSections.length - 1}.`,
    );
  }

  return `${placeholderSections[0]}${sharedThemeTokens.trim()}${placeholderSections[1]}`;
}

async function buildApp({ srcDir, distDir }) {
  fs.mkdirSync(distDir, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [`${srcDir}/mcp-app.ts`],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
  });

  const bundledCode = result.outputFiles[0].text;
  const safeBundledCode = bundledCode.replace(/<\/script/gi, '<\\/script');

  const sharedThemeTokens = fs.readFileSync(SHARED_THEME_TOKENS_PATH, 'utf-8');
  const templatePath = `${srcDir}/mcp-app.html`;
  const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
  const htmlWithSharedTheme = inlineSharedThemeTokens(htmlTemplate, sharedThemeTokens, templatePath);
  const scriptTagMatches = [...htmlWithSharedTheme.matchAll(APP_SCRIPT_TAG_PATTERN)];
  if (scriptTagMatches.length !== 1) {
    throw new Error(
      `Expected exactly one mcp-app.js script placeholder in ${templatePath}, found ${scriptTagMatches.length}.`,
    );
  }

  const finalHtml = htmlWithSharedTheme.replace(
    APP_SCRIPT_TAG_PATTERN,
    () => `<script>\n${safeBundledCode}</script>`,
  );

  fs.writeFileSync(`${distDir}/mcp-app.html`, finalHtml);

  console.log(`✅ Built ${distDir}/mcp-app.html (${(finalHtml.length / 1024).toFixed(1)}kb)`);
}

async function build() {
  for (const appConfig of APP_CONFIGS) {
    await buildApp(appConfig);
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
