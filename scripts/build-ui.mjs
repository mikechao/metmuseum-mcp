/**
 * Build script for MCP apps.
 *
 * Bundles TypeScript and injects it into each HTML template.
 */

import * as fs from 'node:fs';
import process from 'node:process';
import * as esbuild from 'esbuild';

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

async function buildApp({ srcDir, distDir }) {
  fs.mkdirSync(distDir, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [`${srcDir}/mcp-app.ts`],
    bundle: true,
    format: 'iife',
    write: false,
    minify: false,
  });

  const bundledCode = result.outputFiles[0].text;
  const safeBundledCode = bundledCode.replace(/<\/script/gi, '<\\/script');

  const htmlTemplate = fs.readFileSync(`${srcDir}/mcp-app.html`, 'utf-8');

  const finalHtml = htmlTemplate.replace(
    '<script src="mcp-app.js"></script>',
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
