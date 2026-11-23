import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = (f) => readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8')
const path = '20261005155145_youth_stage_runtime_helpers_fresh_install_v1.sql'
const later = '20261005155647_youth_stage_routes_same_country_v3.sql'

test('fresh Youth stage helper compatibility preserves existing functions', () => {
  assert.ok(path < '20261005155151_youth_stage_route_cities_v3.sql')
  const sql = load(path)
  for (const signature of [
    'private.youth_stage_type_v1(uuid,text,integer,integer)',
    'private.youth_stage_distance_km_v1(uuid,integer,text,integer,integer)',
    'private.youth_stage_route_city_v1(uuid,integer,text)',
  ]) assert.ok(sql.includes("to_regprocedure('" + signature + "') is null"))
  assert.match(sql, /select coalesce\(nullif\(p_terrain_type,''\),'flat'\)/i)
  assert.match(sql, /select greatest\(1,coalesce\(p_distance_km,1\)\)/i)
  const downstream = load(later)
  const authoritative = downstream.slice(
    downstream.indexOf('create or replace function private.youth_stage_route_city_v1'),
    downstream.indexOf('$function$;') + '$function$;'.length
  ).replace(/^create or replace function /, 'create function ')
  assert.ok(sql.includes(authoritative), 'route-city helper must exactly match the later version')
})
