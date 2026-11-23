import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql=readFileSync(new URL(
 '../supabase/migrations/20261110165000_fix_world_championship_rider_event_date_selection.sql',
 import.meta.url),'utf8')

test('WRC event-date availability guard protects every fresh or historical participant selection site',()=>{
 assert.match(sql,/IF v_matches NOT IN \(1,7\) THEN/)
 assert.match(sql,/= v_matches THEN/)
 assert.match(sql,/v_definition := replace\(/)
 assert.match(sql,/national_championship_rider_available_for_event_v1\(en\.rider_id,e\.race_date\)/)
 assert.match(sql,/RAISE EXCEPTION 'Partial World Road Championship event-date guard installation'/)
})
