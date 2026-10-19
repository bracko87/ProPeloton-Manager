/**
 * Read-only search-indexing checks for the public pages.
 * Run after `npm run build`; no Supabase, race-engine or deployment calls.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(path, 'utf8')

const pages = [
  ['/', 'index.html'],
  ['/how-to-play/', 'public/how-to-play/index.html'],
  ['/game-guide/', 'public/game-guide/index.html'],
  ['/demo/', 'public/demo/index.html'],
  ['/about/', 'public/about/index.html'],
  ['/support/', 'public/support/index.html'],
  ['/contact/', 'public/contact/index.html'],
  ['/privacy-policy/', 'public/privacy-policy/index.html'],
  ['/terms/', 'public/terms/index.html'],
]

const sitemap = read('public/sitemap.xml')
assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
assert.equal(locations.length, pages.length, 'Expected exactly nine sitemap URLs')
assert.equal(new Set(locations).size, pages.length, 'Duplicate sitemap URL')

for (const [urlPath, sourcePath] of pages) {
  const content = read(sourcePath)
  const canonical = `https://propelotonmanager.com${urlPath}`
  assert.ok(locations.includes(canonical), `${urlPath}: not found in sitemap`)
  assert.match(content, /^<!doctype html>/i, `${urlPath}: invalid opening doctype`)
  assert.match(content, /<\/html>\s*$/i, `${urlPath}: trailing non-HTML content`)
  assert.match(content, /<title>[^<]+<\/title>/i, `${urlPath}: missing title`)
  assert.match(content, /<meta\s+name="description"/i, `${urlPath}: missing description`)
  assert.ok(content.includes(`rel="canonical" href="${canonical}"`), `${urlPath}: wrong canonical`)
  assert.match(content, /<h1(?:\s|>)/i, `${urlPath}: missing H1`)
  assert.ok(!content.includes('<![CDATA[') && !content.includes(']]>'), `${urlPath}: stray CDATA`)
}
assert.ok(!read('public/terms/index.html').includes('&lt;ProPeloton Manager'), 'Malformed Terms brand')

const landing = read('index.html')
const jsonLdMatch = landing.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)
assert.ok(jsonLdMatch, 'Missing structured data')
const structured = JSON.parse(jsonLdMatch[1])
const org = structured['@graph'].find(entry => entry['@type'] === 'Organization')
assert.equal(org.url, 'https://www.nextqueststudio.net/')
assert.equal(org['@id'], 'https://www.nextqueststudio.net/#organization')
for (const entry of structured['@graph']) {
  if (entry.publisher) assert.equal(entry.publisher['@id'], org['@id'])
}

const built = read('dist/index.html')
assert.ok(!built.includes("new EventSource('/esbuild')"), 'Dev reload leaked into production')
assert.ok(!built.includes('data-dev-reload'), 'Development marker leaked into production')
assert.ok(built.includes('https://propelotonmanager.com/'), 'Missing production canonical')
assert.ok(read('dist/main.js').length > 0, 'Missing compiled app')
assert.ok(read('dist/main.css').length > 0, 'Missing compiled stylesheet')

console.log(`SEO public-pages validation passed: ${pages.length} pages, sitemap, schema, production assets.`)
