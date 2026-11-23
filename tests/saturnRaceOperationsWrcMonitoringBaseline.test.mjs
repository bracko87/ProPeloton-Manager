import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql=readFileSync(new URL(
 '../supabase/migrations/20261111103500_fix_wrc_race_operations_false_completion_alerts.sql',
 import.meta.url),'utf8')
const baseline=readFileSync(new URL(
 '../supabase/migrations/20260929183652_baseline_03_plpgsql_1501_1650.sql',
 import.meta.url),'utf8')
test('WRC monitoring uses verified baseline and live expressions but rejects unknown versions',()=>{
  assert.ok(baseline.includes('coalesce(cr.ranking_points_enabled, true) as ranking_points_enabled'))
  assert.match(sql,/v_baseline text := 'coalesce\(cr\.ranking_points_enabled, true\) as ranking_points_enabled'/)
  assert.match(sql,/v_corrected text := 'case when r\.category in \(''WNQ'',''WNF'',''WRC''\)/)
  assert.match(sql,/ELSIF strpos\(v_source,v_baseline\)>0/)
  assert.match(sql,/EXECUTE replace\(v_source,v_baseline,v_corrected\)/)
  assert.match(sql,/RAISE EXCEPTION 'Unexpected Race Operations function version/)
})
