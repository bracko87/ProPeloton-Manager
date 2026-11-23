import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const seedFile='20261007134000_american_samoa_country_reference_v1.sql'
const raceFile='20261007134500_american_samoa_tour_of_tutuila_hidden_race_v1.sql'
const sql=readFileSync(new URL('../supabase/migrations/'+seedFile,import.meta.url),'utf8')
test('Tutuila race country FK exists before the historical seed',()=>{
  assert.ok(seedFile<raceFile)
  assert.match(sql,/insert into public\.countries\(code,name,is_selectable\)/i)
  assert.match(sql,/values \('AS','American Samoa',true\)/)
  assert.match(sql,/on conflict\(code\) do nothing/i)
})
