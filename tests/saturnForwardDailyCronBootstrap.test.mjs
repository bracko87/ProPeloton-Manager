import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const seed = '20261008154500_forward_daily_cron_fresh_install_v1.sql'
const consumer = '20261008155000_optimize_forward_daily_fatigue_accelerated_clock.sql'
const sql=readFileSync(new URL('../supabase/migrations/'+seed,import.meta.url),'utf8')
test('inactive forward-daily cron prerequisite exists before historical clock migration',()=>{
  assert.ok(seed<consumer)
  assert.match(sql,/where jobname='forward-daily-automation-every-minute'/)
  assert.match(sql,/if v_id is null then/)
  assert.match(sql,/cron\.schedule\(/)
  assert.match(sql,/'\*\/5 \* \* \* \*'/)
  assert.match(sql,/cron\.alter_job\(v_id, active := false\)/)
})
