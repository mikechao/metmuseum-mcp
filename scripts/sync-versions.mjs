/**
 * Checks that package.json and manifest.json versions match.
 * Run with: node scripts/sync-versions.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pkgPath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'manifest.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

const packageVersion = typeof pkg.version === 'string' ? pkg.version.trim() : '';
const manifestVersion = typeof manifest.version === 'string' ? manifest.version.trim() : '';

if (!packageVersion) {
  console.error('❌ package.json is missing a valid "version" field.');
  process.exit(1);
}

if (!manifestVersion) {
  console.error('❌ manifest.json is missing a valid "version" field.');
  process.exit(1);
}

if (packageVersion !== manifestVersion) {
  console.error('❌ Version mismatch detected.');
  console.error(`   package.json version:  ${packageVersion}`);
  console.error(`   manifest.json version: ${manifestVersion}`);
  console.error('   Update manifest.json to match package.json before releasing.');
  process.exit(1);
}

console.log(`✅ Version check passed (${packageVersion})`);
