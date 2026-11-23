import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../supabase/migrations/20261004221000_youth_staff_career_courses_payroll_v1.sql', import.meta.url),
  'utf8',
)

test('historical Youth Academy salary normalization retains unique staff profiles', () => {
  assert.match(sql, /for v_candidate in[\s\S]*?from public\.staff_candidates/i)
  assert.match(sql, /exception when unique_violation then[\s\S]*?set specialization=/i)
  assert.match(sql, /left\(sc\.id::text,8\)/i)
  assert.match(sql, /salary_weekly=public\.calculate_staff_weekly_salary\(/i)
  assert.doesNotMatch(sql, /drop index\s+.*staff_candidates_unique_profile_uidx/i)
})
