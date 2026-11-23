import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = (f) => readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8')
const path = '20261005155145_youth_stage_runtime_helpers_fresh_install_v1.sql'

test('fresh Youth stage helpers preserve the production-derived deterministic algorithms', () => {
  assert.ok(path < '20261005155151_youth_stage_route_cities_v3.sql')
  const sql = load(path)
  for (const signature of [
    'private.youth_stage_type_v1(uuid,text,integer,integer)',
    'private.youth_stage_distance_km_v1(uuid,integer,text,integer,integer)',
    'private.youth_stage_route_city_v1(uuid,integer,text)',
  ]) assert.ok(sql.includes("to_regprocedure('" + signature + "') is null"))

  // Preserves six-day TT stage and occasional 4-5-day TT from production.
  assert.match(sql, /v_days>=6 and v_stage=3/)
  assert.match(sql, /v_days between 4 and 5/)
  assert.match(sql, /return 'time_trial';/)

  // Preserves hashed day-specific distances and the youth TT distance range.
  assert.match(sql, /:distance'\)\)/)
  assert.match(sql, /return 18\+mod\(v_hash,18\)/)
  assert.match(sql, /greatest\(35,least\(130,coalesce\(p_base_distance,75\)\)\)/)

  // Route city selection is deterministic, limited to the host country.
  assert.match(sql, /from public\.youth_race_host_cities/)
  assert.match(sql, /country_code=v_race\.host_country_code/)
  assert.match(sql, /mod\(v_seed\+greatest\(p_stage_number,1\)-1,v_count\)/)
})
