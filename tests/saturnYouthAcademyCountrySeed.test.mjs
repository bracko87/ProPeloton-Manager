import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../supabase/migrations/20261002173500_youth_academy_phase1_core_v1.sql', import.meta.url),
  'utf8',
)
test('Youth Academy candidates use valid country FK and never default to nonexistent GB', () => {
  assert.match(sql, /join public\.countries c on c\.code=f\.country_code/i)
  assert.match(sql, /if v_country is null then[\s\S]*?exit;[\s\S]*?end if;/i)
  assert.match(sql, /coalesce\(v_first,'Alex'\),coalesce\(v_last,'Staff'\),v_country,/i)
  assert.doesNotMatch(sql, /coalesce\(v_country,'GB'\)/i)
})
