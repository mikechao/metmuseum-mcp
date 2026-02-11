/**
 * Syncs the version from package.json into manifest.json.
 * Run with: node scripts/sync-versions.mjs
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const pkgPath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'manifest.json')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

if (pkg.version === manifest.version) {
    console.log(`✅ Versions already in sync (${pkg.version})`)
}
else {
    console.log(`🔄 Syncing version: ${manifest.version} → ${pkg.version}`)
    manifest.version = pkg.version
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log('✅ manifest.json updated')
}
