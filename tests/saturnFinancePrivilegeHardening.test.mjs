import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261120235000_saturn_internal_finance_privilege_hardening_v1.sql')
const signup=read('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')

const internal=[
 'finance_grant_new_club_bonus(uuid,bigint)',
 'finance_setup_new_club(uuid)',
 'finance_credit_to_club(uuid,bigint,text,text,text,jsonb)',
 'finance_get_or_create_club_account(uuid,text,text)',
]
test('browser EXECUTE denied on all four observed unguarded finance primitives',()=>{
 for(const f of internal){
  const revoke='revoke all on function public.'+f+'\n  from PUBLIC, anon, authenticated;'
  assert.ok(sql.includes(revoke),'missing browser REVOKE: '+f)
  assert.ok(sql.includes('grant execute on function public.'+f+'\n  to service_role;'),
    'missing service role retention: '+f)
 }
 assert.doesNotMatch(sql,/\b(?:alter\s+table|update\s+public\.|delete\s+from|insert\s+into)\b/i)
})
test('normal test-club creation still relies on trusted finance functions',()=>{
 assert.match(signup,/perform public\.finance_setup_new_club\(v_club\)/)
 assert.match(signup,/perform public\.apply_new_club_creation_balance_v1\(v_club,true\)/)
 assert.match(signup,/private\.saturn_test_club_rollout_v1/)
})
test.todo('staging: browser anon cannot call internal bonus or credit functions directly')
test.todo('staging: registered player cannot call bonus or credit to mint arbitrary money')
test.todo('staging: internal SECURITY DEFINER club initialization grants exactly one starting bonus')
test.todo('staging: normal signup, scheduler, sponsor and seasonal finance remain functional after privilege restrictions')
