import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('both application paths check authentication, ownership and guest expiry',()=>{
 const sql=read('supabase/migrations/20261122164344_saturn_race_application_owner_and_expiry_v2.sql')
 assert.equal((sql.match(/not public\.saturn_test_account_can_mutate_v1\(v_club_id\)/g)||[]).length,2)
 assert.equal((sql.match(/c\.owner_user_id=auth\.uid\(\)/g)||[]).length,2)
 assert.match(sql,/revoke all on function public\.submit_race_application_pre_uwt_policy_v1\(uuid,uuid\) from public,anon,authenticated/)
 assert.match(sql,/grant execute on function public\.submit_race_application_v1\(uuid,uuid\) to authenticated/)
})
test('expired team retirement withdraws applications awaiting preliminary and final review',()=>{
 const sql=read('supabase/migrations/20261122164424_saturn_day15_race_preselection_status_v2.sql')
 assert.equal((sql.match(/e\.status in \('applied','under_review','provisionally_accepted','accepted','confirmed'\)/g)||[]).length,2)
 assert.match(sql,/race_in_progress_or_due/)
})
