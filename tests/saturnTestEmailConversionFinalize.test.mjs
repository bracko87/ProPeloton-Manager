import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261120223000_saturn_finalize_same_uuid_email_conversion_v1.sql')
const page=read('src/pages/TestAccountRegister.tsx')

test('conversion finalizer uses actual Auth UUID, owner and one existing official club',()=>{
 assert.match(sql,/v_uid uuid := auth\.uid\(\)/)
 assert.match(sql,/where t\.user_id=v_uid for update/)
 assert.match(sql,/from auth\.users u where u\.id=v_uid/)
 assert.match(sql,/v_auth\.is_anonymous is distinct from false/)
 assert.match(sql,/v_auth\.email_confirmed_at is null/)
 assert.match(sql,/v_auth\.encrypted_password/)
 assert.match(sql,/c\.id=v_trial\.club_id and c\.owner_user_id=v_uid/)
 assert.match(sql,/m\.club_id=v_trial\.club_id and m\.user_id=v_uid and m\.role='owner'/)
})

test('only original test term converted_at may be updated, once, with no trial reset',()=>{
 assert.match(sql,/if v_trial\.converted_at is null then/)
 assert.match(sql,/set converted_at=now\(\)/)
 assert.match(sql,/where user_id=v_uid and converted_at is null/)
 assert.doesNotMatch(sql,/insert into auth\.users|insert into public\.clubs|update public\.premium_welcome_trials|update public\.clubs|update public\.club_finance_summary|update public\.user_wallets/i)
 assert.match(sql,/'premium_restarted',false/)
})

test('verified permanent users may finish conversion but guest or anon roles may not',()=>{
 assert.match(sql,/revoke all on function public\.saturn_finalize_test_account_email_conversion_v1/)
 assert.match(sql,/grant execute on function public\.saturn_finalize_test_account_email_conversion_v1\(\)\s+to authenticated/)
 assert.match(sql,/is_anonymous is distinct from false/)
 assert.match(sql,/using errcode='42501'/)
})

test('UI never announces converted before original trial is marked by server',()=>{
 assert.match(page,/\.rpc\('saturn_finalize_test_account_email_conversion_v1'\)/)
 assert.match(page,/result\?\.user_id === originId/)
 assert.match(page,/result\?\.converted === true/)
 assert.match(page,/Registration completed on your original account/)
 assert.match(page,/server could not complete team registration/)
 assert.doesNotMatch(page,/supabase\.auth\.signUp\(/)
})

test.todo('staging: email verified, password set, original Auth UUID and club remain identical')
test.todo('staging: confirmed email without a password cannot finalize trial')
test.todo('staging: anonymous or a different permanent account cannot finalize another guest trial')
test.todo('staging: retry of conversion never extends Premium or resets original 336-hour term')
test.todo('staging: conversion after 14 days restores gameplay without duplicate club creation')
test.todo('staging: google-linked conversion requires separately audited OAuth path')
