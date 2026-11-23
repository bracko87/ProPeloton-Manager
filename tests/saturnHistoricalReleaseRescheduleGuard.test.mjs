import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
 '../supabase/migrations/20261119224500_postpone_peloton_release_and_premium_to_dec10_v1.sql',
 import.meta.url),'utf8')
test('one-off December release reschedule requires original release control',()=>{
 assert.match(sql,/if not exists \(\s*select 1 from private\.ppm_december_2026_release_control_v1 where id=true/i)
 assert.match(sql,/raise exception 'Partial release records exist without the release control'/)
 assert.match(sql,/Skipping one-time December release reschedule: no prior schedule on fresh install/)
 assert.match(sql,/raise exception 'Release schedule unexpectedly changed; refusing to overwrite'/)
 assert.match(sql,/raise exception 'Launch function copy changed unexpectedly'/)
 assert.doesNotMatch(sql,/cron\.schedule\(/)
})
