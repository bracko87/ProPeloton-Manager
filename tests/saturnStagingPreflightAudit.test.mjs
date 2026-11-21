import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
const preflight=read('supabase/tests/saturn_predeploy_schema_preflight.sql')
const post=read('supabase/tests/saturn_postdeploy_authorization_audit.sql')
const lifecycle=read('supabase/migrations/20261120140000_saturn_14day_full_game_test_account_lifecycle_v1.sql')

test('read-only staging SQL validates production-matched schemas without mutating game',()=>{
 for(const [name,sql] of [['predeploy',preflight],['postdeploy',post]]){
  const withoutComments=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(withoutComments,/\b(?:insert\s+into|update\s+public\.|delete\s+from|drop\s+table|alter\s+table|create\s+table|grant\s+|revoke\s+)\b/i,name+' must remain read-only')
  assert.match(sql,/select check_id,\s*passed,\s*explanation/i)
 }
})
test('predeploy verifies real Auth, clubs, Premium and both historic race datasets',()=>{
 for(const phrase of [
 'auth_anonymous_column','guest_auth_gate_exists','club_roster_nonupdatable_view',
 'club_riders_has_rls','riders_has_rls','premium_welcome_trials_exists',
 'race_entrant_legacy_exists','race_entrant_v1_exists','ai_swap_trigger_exists'
 ])assert.ok(preflight.includes(phrase),'missing '+phrase)
 assert.match(preflight,/pg_relation_is_updatable/)
})
test('postdeploy enforces test account timing confidentiality and fails closed pre-release',()=>{
 for(const phrase of [
 'lifecycle_rls_enabled','lifecycle_does_not_force_owner_rls',
 'anonymous_cannot_insert_lifecycle','authenticated_cannot_insert_lifecycle',
 'authenticated_cannot_update_lifecycle','authenticated_cannot_delete_lifecycle',
 'creation_rpc_denied_to_anon','creation_rpc_denied_to_authenticated',
 'guest_auth_gate_still_off','test_club_gate_still_off'
 ])assert.ok(post.includes(phrase),'missing '+phrase)
})
test('server creation may insert but signed-in browser cannot edit lifecycle',()=>{
 assert.doesNotMatch(lifecycle,/^\s*alter table public\.saturn_test_accounts_v1 force row level security;/im)
 assert.match(lifecycle,/alter table public\.saturn_test_accounts_v1 enable row level security/)
 assert.match(lifecycle,/revoke all on table public\.saturn_test_accounts_v1 from public, anon, authenticated/)
 assert.match(lifecycle,/grant select on table public\.saturn_test_accounts_v1 to authenticated/)
 assert.doesNotMatch(lifecycle,/grant (insert|update|delete) on table public\.saturn_test_accounts_v1/i)
})
test.todo('staging: run predeploy check, apply migrations in isolated environment, then run postdeploy check')
test.todo('staging: anon role cannot modify or read other players trial clocks via JWT/RLS')
test.todo('staging: SECURITY DEFINER club creation inserts valid 336h lifecycle under RLS')
test.todo('staging: expired guest writes denied but user retains dashboard read access')
test.todo('staging: registered owner, public roster displays and scheduler regression')
