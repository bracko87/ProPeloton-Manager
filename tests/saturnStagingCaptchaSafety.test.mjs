import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const path = new URL('../scripts/saturn-verify-staging-auth-captcha.mjs', import.meta.url)
const source = readFileSync(path, 'utf8')
const productionRef = 'okuravitxocyevkexfgi'

function runWith(overrides = {}) {
  // No real endpoint is contacted. Both test fixtures are rejected before
  // invoking createClient or sending a single request.
  const env = {
    ...process.env,
    SATURN_STAGING_PROJECT_REF: '',
    SATURN_STAGING_SUPABASE_URL: '',
    SATURN_STAGING_PUBLISHABLE_KEY: '',
    SATURN_ACK_NONPROD_AUTH_MUTATIONS: '',
    ...overrides,
  }
  return spawnSync(process.execPath, [fileURLToPath(path)], {
    env, encoding: 'utf8', timeout: 15000,
  })
}

test('staging CAPTCHA tester refuses to run without explicit acknowledgement', () => {
  const p = runWith()
  assert.notEqual(p.status, 0)
  assert.match(p.stderr, /explicit nonproduction test acknowledgement is required/)
})

test('even a deliberate acknowledgement can NEVER target production', () => {
  const p = runWith({
    SATURN_ACK_NONPROD_AUTH_MUTATIONS: 'YES_NONPRODUCTION_ONLY',
    SATURN_STAGING_PROJECT_REF: productionRef,
    SATURN_STAGING_SUPABASE_URL: 'https://' + productionRef + '.supabase.co',
    SATURN_STAGING_PUBLISHABLE_KEY: 'not-a-real-key',
  })
  assert.notEqual(p.status, 0)
  assert.match(p.stderr, /never the production ref/)
})

test('negative checks fail on accepted identity or inconclusive rate-limit errors', () => {
  assert.match(source, /if \(result\.data\?\.user \|\| result\.data\?\.session \|\| !result\.error\)/)
  assert.match(source, /code !== 'captcha_failed'/)
  assert.match(source, /INCONCLUSIVE:/)
  assert.match(source, /FAIL: .* was accepted/)
  assert.match(source, /signInAnonymously\(\)/)
  assert.match(source, /signInAnonymously\(\{ options \}\)/)
})

test('script never leaks staging keys or response identities and requires exact HTTPS hostname', () => {
  assert.match(source, /parsed\.hostname !== projectRef \+ '\.supabase\.co'/)
  assert.match(source, /parsed\.protocol !== 'https:'/)
  assert.match(source, /publishableKey/)
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:publishableKey|result\.data|projectUrl)/)
})
