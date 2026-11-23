import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261123084428_saturn_restrict_sponsor_payout_and_income_tax_rpc_v1.sql')
const verification = read('supabase/tests/saturn_sponsor_tax_rpc_permissions_readonly.sql')
const names = [
  'public.finance_apply_income_tax(uuid,uuid,text,bigint,jsonb)',
  'public.finance_grant_sponsor_contract_payment(uuid,uuid,bigint,jsonb)',
].sort()

test('SAT-12 closes direct public execution on exactly two money-writing functions', () => {
  const revokes = [...sql.matchAll(/revoke execute on function (public\.[\w]+\(.*?\))\s+from public, anon, authenticated;/g)].map(m=>m[1]).sort()
  const grants = [...sql.matchAll(/grant execute on function (public\.[\w]+\(.*?\))\s+to service_role;/g)].map(m=>m[1]).sort()
  assert.deepEqual(revokes, names)
  assert.deepEqual(grants, names)
})

test('SAT-12 verifies internal callers without running payments or taxes', () => {
  assert.match(sql, /to_regprocedure\(v_signature\)/)
  assert.match(sql, /p\.prosecdef and p\.proowner='postgres'::regrole/)
  assert.match(sql, /not p\.prosecdef/)
  assert.match(sql, /pg_trigger/)
  assert.match(sql, /pg_rewrite/)
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:update|insert|delete|drop|truncate|alter)\s+/im)
  assert.match(verification, /has_function_privilege\('anon'/)
  assert.match(verification, /has_function_privilege\('authenticated'/)
  assert.match(verification, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(verification.replace(/^--.*$/gm,''), /\b(?:call|perform|insert|update|delete|alter|drop|truncate|grant|revoke)\b/i)
})
