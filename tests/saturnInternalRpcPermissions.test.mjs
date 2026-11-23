import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261123081746_saturn_restrict_internal_privileged_rpc_execution_v1.sql')
const expected = [
  'race_get_rider_numeric_skill_value_v1(uuid,text[],numeric)',
  'race_calculate_rider_favorite_score_v1(uuid,numeric,text,text,integer)',
  'finance_transfer_club_to_club_internal(uuid,uuid,bigint,text,text,text,jsonb)',
  'finance_get_or_create_system_account(text,text,text)',
  'generate_race_stage_weather_v1(uuid,boolean)',
  'finance_process_weekly_rider_wages()',
  '_finance_process_weekly_rider_wages_core_v1()',
]

test('SAT-10 protects exactly seven selected definer RPCs, preserving service access', () => {
  const revokePattern = /revoke execute on function public\.(\w+\([^\n]*\))\s+from public, anon, authenticated;/gi
  const grantPattern = /grant execute on function public\.(\w+\([^\n]*\))\s+to service_role;/gi
  const revoked = [...sql.matchAll(revokePattern)].map(x => x[1]).sort()
  const granted = [...sql.matchAll(grantPattern)].map(x => x[1]).sort()
  assert.deepEqual(revoked, [...expected].sort())
  assert.deepEqual(granted, [...expected].sort())
  assert.match(sql, /v_invoker_callers<>0/)
  assert.match(sql, /v_is_definer is distinct from true/)
  assert.match(sql, /to_regprocedure\(v_signature\)/)
  assert.doesNotMatch(sql, /alter (table|view)|drop (function|view|table)|delete from|truncate/i)
})

test('SAT-10 read-only database audit covers all seven and never modifies data', () => {
  const verify = read('supabase/tests/saturn_internal_privileged_rpc_permissions_readonly.sql')
  for (const fn of expected) {
    assert.ok(verify.includes(fn.split('(')[0]), fn + ' not included in verification')
  }
  assert.match(verify, /has_function_privilege\('anon'/)
  assert.match(verify, /has_function_privilege\('authenticated'/)
  assert.match(verify, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(verify.replace(/^--.*$/gm, ''), /\b(insert|update|delete|alter|drop|revoke|grant|truncate)\b/i)
})
