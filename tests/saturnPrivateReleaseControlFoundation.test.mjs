import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const path='20261119135000_release_control_empty_fresh_install_v1.sql'
const sql=readFileSync(new URL('../supabase/migrations/'+path,import.meta.url),'utf8')
test('fresh-install release control has secure empty schema and cannot activate the game',()=>{
 assert.ok(path<'20261119135500_control_center_verified_release_hold_reporting_v1.sql')
 assert.match(sql,/create table if not exists private\.ppm_december_2026_release_control_v1/i)
 assert.match(sql,/reset_run_id uuid not null references public\.game_world_reset_runs\(id\)/i)
 assert.match(sql,/enable row level security/i)
 assert.match(sql,/revoke all on private\.ppm_december_2026_release_control_v1 from public,anon,authenticated/i)
 assert.doesNotMatch(sql,/insert into private\.ppm_december_2026_release_control_v1/i)
 assert.doesNotMatch(sql,/cron\.schedule\(/i)
})
