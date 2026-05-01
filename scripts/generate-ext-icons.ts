/**
 * Generates extension icons from the root public/favicon.svg.
 * Run with: npx tsx scripts/generate-ext-icons.ts
 *
 * Requires: sharp  (npm install -D sharp)
 * Output: extension/public/icons/icon-{16,32,48,128}.png
 */
import { createCanvas, loadImage } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcIcon = path.join(rootDir, 'public', 'pwa-192x192.png')
const outDir = path.join(rootDir, 'extension', 'public', 'icons')

fs.mkdirSync(outDir, { recursive: true })

const sizes = [16, 32, 48, 128]

async function run() {
  // Try using sharp if available
  try {
    const sharp = (await import('sharp')).default
    for (const size of sizes) {
      await sharp(srcIcon)
        .resize(size, size)
        .png()
        .toFile(path.join(outDir, `icon-${size}.png`))
      console.log(`✓ icon-${size}.png`)
    }
    console.log('Done! Icons written to extension/public/icons/')
  } catch {
    // Fallback: just copy the 192x192 for all sizes (Chrome will scale)
    console.warn('sharp not found — copying pwa-192x192.png as all icon sizes.')
    console.warn('Install sharp for proper resizing: npm install -D sharp')
    for (const size of sizes) {
      fs.copyFileSync(srcIcon, path.join(outDir, `icon-${size}.png`))
      console.log(`✓ icon-${size}.png (unresized copy)`)
    }
  }
}

run().catch(console.error)
