import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
  '../supabase/migrations/20261009055000_accelerated_race_scheduler_cadence.sql',
  import.meta.url),'utf8')
test('race scheduler replay never creates production-connected cron jobs',()=>{
  assert.match(sql,/if \(select count\(\*\) from cron\.job[\s\S]*?\) = 0 then/)
  assert.match(sql,/raise notice 'Race scheduler cron cadence deferred/)
  assert.match(sql,/elsif \(select count\(\*\) from cron\.job[\s\S]*?\) and active\) <> 2 then/)
  assert.match(sql,/raise exception 'Both active race scheduler jobs are required'/)
  assert.doesNotMatch(sql,/cron\.schedule\(/)
  assert.doesNotMatch(sql,/net\.http_post\(/)
})
