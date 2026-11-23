import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
 '../supabase/migrations/20261117114500_preserve_150_national_routes_for_season1_reset_v1.sql',
 import.meta.url),'utf8')
test('national route capture skips empty worlds but still requires 150 routes for populated Season 2',()=>{
 assert.match(sql,/IF n=0 AND NOT EXISTS \(\s*SELECT 1 FROM public\.national_championship_editions\s+WHERE season_number=2/i)
 assert.match(sql,/ELSIF n<>150 OR valid_n<>150 THEN/)
 assert.match(sql,/RAISE EXCEPTION 'Season 1 national source map incomplete/)
 assert.match(sql,/IF v_count<>150 OR v_route_eligible<>150 THEN/)
 assert.match(sql,/private\.game_world_reset_execute_guard_v1\(p_reset_run_id\)/)
})
