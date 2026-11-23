import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
const baseline = read('supabase/migrations/20260929211000_baseline_17_nations_runtime_seed.sql')
const equipment = read('supabase/migrations/20260930082645_national_association_activation_and_equipment_sets_v33.sql')

function seedArray(marker) {
  const delim = '$'+marker+'$'
  const from = baseline.indexOf(delim)
  const to = baseline.indexOf(delim,from+delim.length)
  assert.ok(from>=0&&to>from,marker+' seed boundaries')
  return JSON.parse(baseline.slice(from+delim.length,to).trim())
}

test('new-install baseline provides all 54 real national equipment catalog keys',()=>{
  const group = equipment.match(/with seed\(equipment_category, specialization, choice_rank, item_key\) as \(\s*values([\s\S]*?)\n\)\ninsert into public\.national_team_equipment_options/)
  assert.ok(group,'national equipment seed contract')
  const keys = [...group[1].matchAll(/\('(?:frame|wheelset|tires|groupset|helmet|shoes)','(?:flat|mountain|time_trial)',[123],'([^']+)'\)/g)].map(x=>x[1])
  const catalog = seedArray('catalog')
  assert.equal(keys.length,54)
  assert.equal(new Set(keys).size,54)
  assert.equal(catalog.length,54)
  assert.equal(new Set(catalog.map(x=>x.item_key)).size,54)
  for(const key of keys) assert.ok(catalog.some(c=>c.item_key===key&&c.is_active===true),'missing active '+key)
})

test('all National Team equipment items have canonical original sponsor and market group',()=>{
  const catalog = seedArray('catalog')
  const sponsors = seedArray('companies')
  const groups = seedArray('groups')
  const brandIds = new Set(sponsors.map(x=>x.id))
  const groupCodes = new Set(groups.map(x=>x.code))
  assert.ok(groups.some(x=>x.code==='iberia'))
  assert.equal(sponsors.length,31)
  assert.equal(new Set(sponsors.map(x=>x.id)).size,sponsors.length)
  for (const c of catalog) assert.ok(brandIds.has(c.brand_company_id),c.item_key+' missing brand')
  for (const s of sponsors) if(s.home_group_code) assert.ok(groupCodes.has(s.home_group_code),s.name+' unknown market group')
})

test('reference-data repair is safe for already-applied production migrations',()=>{
  assert.match(baseline,/insert into public\.country_market_groups/)
  assert.match(baseline,/insert into public\.sponsor_companies/)
  assert.match(baseline,/insert into public\.equipment_catalog/)
  assert.ok((baseline.match(/on conflict do nothing;/g)||[]).length>=3)
  assert.doesNotMatch(baseline,/delete from public\.equipment_catalog|truncate public\.equipment_catalog/i)
})
