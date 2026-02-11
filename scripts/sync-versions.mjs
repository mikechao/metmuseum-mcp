/**
 * Syncs the version from package.json into manifest.json and MetMuseumServer.ts.
 * Run with: node scripts/sync-versions.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pkgPath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'manifest.json');
const serverPath = path.join(root, 'src', 'MetMuseumServer.ts');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// --- manifest.json ---
if (pkg.version === manifest.version) {
  console.log(`✅ manifest.json already in sync (${pkg.version})`);
}
else {
  console.log(`🔄 Syncing manifest.json: ${manifest.version} → ${pkg.version}`);
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('✅ manifest.json updated');
}

// --- MetMuseumServer.ts ---
const serverSrc = fs.readFileSync(serverPath, 'utf-8');
const versionRegex = /(name:\s*'met-museum-mcp',[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*version:\s*')([^']+)(')/;
const match = serverSrc.match(versionRegex);

if (match && match[2] === pkg.version) {
  console.log(`✅ MetMuseumServer.ts already in sync (${pkg.version})`);
}
else if (match) {
  console.log(`🔄 Syncing MetMuseumServer.ts: ${match[2]} → ${pkg.version}`);
  const updated = serverSrc.replace(versionRegex, `$1${pkg.version}$3`);
  fs.writeFileSync(serverPath, updated);
  console.log('✅ MetMuseumServer.ts updated');
}
else {
  console.warn('⚠️  Could not find version string in MetMuseumServer.ts — skipping');
}
