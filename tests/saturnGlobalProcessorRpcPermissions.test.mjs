import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261123082058_saturn_restrict_public_global_game_processors_v1.sql')
const expected = [
  'public.advance_game_state_one_hour_manual()',
  'public.advance_game_state_one_hour()',
  'public.advance_game_state_one_minute_v1()',
  'public.run_game_tick_if_unpaused()',
  'public.run_game_minute_tick_if_unpaused_v1()',
  'public.run_daily_game_processors_v1(boolean)',
  'public.run_hourly_game_processors_v1(boolean)',
  'public.process_due_race_days_v1()',
  'public.process_one_backlog_game_processor_child_step_v1(date,text,integer)',
  'public.auto_fill_race_ai_team_applications_season_v1(uuid,text,integer,integer,integer)',
  'public.generate_race_weather_for_race_v1(uuid)',
]

test('SAT-10B limits exactly eleven world-state and race processor functions', () => {
  const revoked = [...sql.matchAll(/^revoke execute on function (public\..+) from public, anon, authenticated;$/gmi)].map(x => x[1]).sort()
  const granted = [...sql.matchAll(/^grant execute on function (public\..+) to service_role;$/gmi)].map(x => x[1]).sort()
  assert.deepEqual(revoked, [...expected].sort())
  assert.deepEqual(granted, [...expected].sort())
  assert.match(sql, /v_invoker_callers<>0/)
  assert.match(sql, /v_is_definer is distinct from true/)
  assert.doesNotMatch(sql, /\b(update public\.|delete from|drop function|alter table|truncate table)\b/i)
})

test('SAT-10B check script never executes a processor or alters game state', () => {
  const verify = read('supabase/tests/saturn_global_game_processor_rpc_permissions_readonly.sql')
  for (const signature of expected) assert.ok(verify.includes(signature.split('(')[0].replace('public.','')))
  assert.match(verify, /has_function_privilege\('anon'/)
  assert.match(verify, /has_function_privilege\('authenticated'/)
  assert.match(verify, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(verify.replace(/^--.*$/gm, ''), /\b(insert|update|delete|alter|drop|revoke|grant|truncate|perform|call)\b/i)
})
