import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const path = '20261007133000_country_catalog_fresh_install_v1.sql'
const source = readFileSync(new URL('../supabase/migrations/'+path,import.meta.url),'utf8')
test('full production country catalog is available before October 7 hidden race seeds',()=>{
  assert.ok(path < '20261007134500_american_samoa_tour_of_tutuila_hidden_race_v1.sql')
  assert.match(source,/insert into public\.countries\(code,name,is_selectable\)/i)
  for(const [code,name] of [['AS','American Samoa'],['BS','Bahamas']])
    assert.ok(source.includes("'"+code+"','"+name+"'"),code+" missing")
  const values=source.match(/^  \('[A-Z]{2}',/gm) || []
  assert.equal(values.length,180)
  assert.match(source,/on conflict\(code\) do nothing/i)
})
