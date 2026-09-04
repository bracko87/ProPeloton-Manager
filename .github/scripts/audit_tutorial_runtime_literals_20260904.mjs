import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const root = process.cwd()
const locales = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

function flatten(value, prefix = '', out = new Map()) {
  if (typeof value === 'string') {
    if (prefix) out.set(prefix, value)
    return out
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, nested] of Object.entries(value)) {
    flatten(nested, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

function literalToKey(flat) {
  const map = new Map()
  for (const [key, value] of flat) {
    if (!map.has(value)) map.set(value, key)
  }
  return map
}

const bundles = {}
const flat = {}
for (const locale of locales) {
  bundles[locale] = JSON.parse(await fs.readFile(path.join(root, 'src/i18n/locales', locale, 'tutorials.json'), 'utf8'))
  flat[locale] = flatten(bundles[locale])
}

const outfile = path.join('/tmp', `tutorials-audit-${process.pid}.mjs`)
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/tutorials.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent',
})
const mod = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`)

const sourceStrings = new Set()
const seen = new Set()
function collect(value) {
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach(collect)
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    if (['title', 'body', 'primaryAction', 'secondaryAction'].includes(key) && typeof nested === 'string') {
      sourceStrings.add(nested)
    }
    collect(nested)
  }
}
Object.values(mod).forEach(collect)

const englishLiteralKeys = literalToKey(flat.en)
const missingEnglish = [...sourceStrings].filter(value => !englishLiteralKeys.has(value)).sort()
if (missingEnglish.length) {
  console.error(`Tutorial source literals missing from English resource (${missingEnglish.length}):`)
  for (const value of missingEnglish) console.error(`  - ${JSON.stringify(value)}`)
  process.exit(1)
}

const requiredOverlayKeys = ['common.closeTutorial', 'common.previous', 'common.previousTutorial']
const errors = []
for (const locale of locales) {
  for (const key of requiredOverlayKeys) {
    const value = flat[locale].get(key)
    if (typeof value !== 'string' || !value.trim()) errors.push(`${locale}: missing ${key}`)
  }
  for (const sourceValue of sourceStrings) {
    const key = englishLiteralKeys.get(sourceValue)
    const translated = flat[locale].get(key)
    if (typeof translated !== 'string' || !translated.trim()) errors.push(`${locale}: missing ${key}`)
  }
}

if (errors.length) {
  console.error(`Tutorial runtime localization audit failed (${errors.length}):`)
  errors.forEach(error => console.error(`  - ${error}`))
  process.exit(1)
}

console.log(`Tutorial runtime localization audit PASSED`)
console.log(`Source tutorial literals checked: ${sourceStrings.size}`)
console.log(`Locales checked: ${locales.join(', ')}`)
console.log(`Overlay navigation keys checked: ${requiredOverlayKeys.join(', ')}`)
