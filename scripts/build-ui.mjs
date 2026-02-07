/**
 * Build script for met-explorer MCP app
 *
 * Bundles the TypeScript and injects it into the HTML template.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = 'src/ui/met-explorer';
const DIST_DIR = 'dist/ui/met-explorer';

async function build() {
    // Ensure output directory exists
    fs.mkdirSync(DIST_DIR, { recursive: true });

    // Bundle the TypeScript to a string
    const result = await esbuild.build({
        entryPoints: [`${SRC_DIR}/mcp-app.ts`],
        bundle: true,
        format: 'iife',
        write: false,
        minify: false,
    });

    const bundledCode = result.outputFiles[0].text;

    // Read the HTML template
    const htmlTemplate = fs.readFileSync(`${SRC_DIR}/mcp-app.html`, 'utf-8');

    // Replace the external script reference with inline script
    const finalHtml = htmlTemplate.replace(
        '<script src="mcp-app.js"></script>',
        `<script>\n${bundledCode}</script>`
    );

    // Write the output HTML
    fs.writeFileSync(`${DIST_DIR}/mcp-app.html`, finalHtml);

    console.log(`✅ Built ${DIST_DIR}/mcp-app.html (${(finalHtml.length / 1024).toFixed(1)}kb)`);
}

build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
