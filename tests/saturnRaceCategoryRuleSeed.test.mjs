import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const seed = '20261007140000_race_category_rules_fresh_install_v1.sql'
const consumer = '20261007140500_tour_of_tutuila_category_entry_rules_v2.sql'
const sql = readFileSync(new URL('../supabase/migrations/' + seed, import.meta.url),'utf8')
test('the complete production race-class catalog is seeded before Tutuila rules', () => {
  assert.ok(seed < consumer)
  assert.match(sql,/insert into public\.race_category_rules\(/i)
  for (const code of ['1.1','1.2','1.HC','1.Pro','1.UWT',
                       '2.1','2.2','2.HC','2.Pro','2.UWT'])
    assert.ok(sql.includes("'"+code+"'"), 'missing '+code)
  assert.match(sql,/on conflict \(race_class_code\) do nothing/i)
})
