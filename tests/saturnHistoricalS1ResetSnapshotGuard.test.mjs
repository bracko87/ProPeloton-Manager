import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
 '../supabase/migrations/20261117143000_season1_final_rider_nationality_safety_v1.sql',
 import.meta.url),'utf8')
test('full S1 reset snapshot requires 499 clubs unless the world is newly created',()=>{
 assert.match(sql,/IF \(SELECT count\(\*\) FROM public\.game_world_reset_s1_competition_baseline_v1\)=0/)
 assert.match(sql,/AND NOT EXISTS \(\s*SELECT 1 FROM public\.clubs c\s*WHERE c\.owner_user_id IS NOT NULL AND c\.deleted_at IS NULL/i)
 assert.match(sql,/Skipping S1 restart snapshot verification: no historical player baseline/)
 assert.match(sql,/<>499/)
 assert.match(sql,/The full S1 restart club baseline is not safe/)
 assert.match(sql,/National rebuild is only permitted inside a paused Season 1 reset/)
})
