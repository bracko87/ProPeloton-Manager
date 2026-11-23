import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
 '../supabase/migrations/20261112153000_control_center_youth_staff_race_scoring_repair.sql',
 import.meta.url),'utf8')
test('Season 2 one-off data repairs run only with historical entities and protected migration state',()=>{
 assert.match(sql,/IF NOT EXISTS \(\s*SELECT 1 FROM public\.clubs/)
 assert.match(sql,/AND NOT EXISTS \(\s*SELECT 1 FROM public\.races r/)
 assert.match(sql,/Skipping specific Season 2 Control Center data repair: historical fixtures absent/)
 assert.match(sql,/This repair requires the protected Season 2 migration period/)
 assert.match(sql,/SELECT a\.id INTO STRICT v_ankara/)
 assert.match(sql,/SELECT a\.id INTO STRICT v_user_academy/)
 assert.match(sql,/SELECT s\.id INTO STRICT v_stage/)
})
