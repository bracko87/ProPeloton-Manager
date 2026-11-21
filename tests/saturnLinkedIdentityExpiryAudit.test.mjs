import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const audit=readFileSync(new URL('../supabase/tests/saturn_linked_identity_expiry_audit.sql',import.meta.url),'utf8')
test('read-only audit distinguishes Auth linking from completed Saturn conversion',()=>{
 for(const x of [
  'expired_linked_unconverted',
  'active_linked_unconverted',
  'fully_converted',
  'expired_unconverted_anonymous',
  't.converted_at is null and t.expires_at<=now()',
  't.converted_at is null and t.started_at<=now() and t.expires_at>now()',
  'from public.saturn_test_accounts_v1 t',
  'join auth.users u on u.id=t.user_id'
 ])assert.ok(audit.includes(x),x)
 assert.doesNotMatch(audit,/^\\s*(?:insert|update|delete|alter|create|drop|grant|revoke)\\s/mi)
})
test.todo('staging: linked expired nonanonymous row returns must_be_read_only=true')
test.todo('staging: fully converted same UUID returns must_be_read_only=false')
