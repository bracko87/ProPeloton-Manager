import {readFileSync} from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const workflow=read('.github/workflows/saturn-full-game-test-account-review.yml')
const preflight=read('supabase/tests/saturn_predeploy_schema_preflight.sql')
const postflight=read('supabase/tests/saturn_postdeploy_authorization_audit.sql')

test('the Saturn PR checks automatically run for new regression test files',()=>{
 assert.match(workflow,/tests\/saturn\*\.test\.mjs/)
 assert.match(workflow,/src\/components\/auth\/SaturnGuestCaptcha\.tsx/)
 assert.match(workflow,/docs\/SATURN_GUEST_SIGNUP_ABUSE_GATE_2026-11-20\.md/)
 assert.match(workflow,/node --test tests\/saturn\*\.test\.mjs/)
 assert.match(workflow,/python scripts\/saturn_sql_parse\.py/)
 assert.match(workflow,/npm run build/)
})
test('staging preflight checks owner and AI placement base tables before migration',()=>{
 for(const item of ['guest_auth_gate_exists','clubs_real_table','club_riders_has_rls','premium_welcome_trials_exists','club_initializer_exists','guest_owner_guard_exists','ai_swap_trigger_exists','permanent_team_allocator_exists']){
   assert.ok(preflight.includes(item),item)
 }
 assert.doesNotMatch(preflight,/^\s*(?:insert|update|delete|alter|create|drop|grant|revoke)\s/mi)
})
test('postmigration audit holds both rollout gates shut and creation RPC inaccessible',()=>{
 for(const item of ['creation_rpc_denied_to_anon','creation_rpc_denied_to_authenticated','guest_auth_gate_still_off','test_club_gate_still_off','anonymous_cannot_insert_lifecycle','authenticated_cannot_update_lifecycle','self_read_policy_exists']){
  assert.ok(postflight.includes(item),item)
 }
 assert.doesNotMatch(postflight,/^\s*(?:insert|update|delete|alter|create|drop|grant|revoke)\s/mi)
})
test.todo('staging: run predeploy 21 prerequisites and record every result in isolated branch')
test.todo('staging: apply migrations in dependency order to clean isolated branch, both gates OFF')
test.todo('staging: verify RLS and finance helper grants after migration, then actual Auth/JWT scenarios')
