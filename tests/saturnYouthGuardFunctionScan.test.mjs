import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL(
  '../supabase/migrations/20261007091500_development_services_access_pricing_v23.sql',
  import.meta.url), 'utf8')

test('Youth access guard rewrite only scans normal PostgreSQL functions', () => {
  const index = sql.indexOf('pg_get_functiondef(p.oid)')
  assert.ok(index >= 0)
  const scan = sql.slice(Math.max(0, index - 750), index)
  assert.match(scan, /p\.prokind = 'f'/)
  assert.match(scan, /n\.nspname in \('public', 'private'\)/)
})
