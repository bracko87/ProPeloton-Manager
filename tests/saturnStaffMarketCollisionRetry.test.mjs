import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../supabase/migrations/20261004202500_youth_staff_market_expansion_v1.sql', import.meta.url),
  'utf8',
)

test('staff market refill retries duplicate random profiles without losing target cardinality', () => {
  const start = sql.indexOf('create or replace function public.staff_market_refill_available_candidates(')
  const end = sql.indexOf('$function$;', start)
  const source = sql.slice(start, end)
  assert.match(source, /for v_attempt in 1\.\.20 loop/)
  assert.match(source, /exception when unique_violation then/)
  assert.match(source, /if not v_inserted then\s+raise exception/)
  assert.match(source, /v_generated:=v_generated\+1;/)
  assert.match(source, /perform public\.insert_generated_staff_candidate\(/)
})
