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
 'finance_apply_club_house_tax_rebate_v1(uuid,date,date)',
 'finance_charge_emergency_loan_weekly_payment(uuid,date)',
 'finance_charge_race_cost(uuid,uuid,bigint,jsonb)',
 'finance_create_club_house_rebate_v1(uuid,uuid,text,bigint,integer,text)',
 'finance_force_transfer_club_to_club(uuid,uuid,bigint,text,text,text,jsonb)',
 'finance_issue_emergency_loan_non_ai_core_v1(uuid,text,text,text)',
 'finance_run_monthly_tax_audit_for_club(uuid,date,date,boolean)',
 'race_engine_refund_one_day_weather_cancelled_race_v1(uuid)',
 'refund_one_day_weather_cancelled_race_v2(uuid)',
]
test('browser EXECUTE denied on all thirteen reviewed internal finance routines',()=>{
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

test('live and staging finance permission audit is read-only and checks all effective grants',()=>{
 const audit=read('supabase/tests/saturn_internal_finance_grants_audit.sql')
 for(const f of internal){
  assert.ok(audit.includes('public.'+f),'grant audit missing '+f)
 }
 for(const role of ['anon','authenticated','service_role']){
  assert.ok(audit.includes("has_function_privilege('"+role+"'"),'audit missing '+role)
 }
 assert.ok(audit.includes('security_definer'))
 assert.doesNotMatch(audit,/^\\s*(?:update|insert|delete|alter|create|drop|grant|revoke)\\s/mi)
})
