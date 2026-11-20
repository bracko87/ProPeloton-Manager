import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const practice = read('src/pages/GuestPractice.tsx')
const client = read('src/lib/supabase.ts')

test('anonymous sessions cannot enter official club/dashboard route guards', () => {
  assert.match(app, /user\.is_anonymous === true/)
  assert.match(app, /Navigate to="\/guest-practice" replace/)
  assert.match(app, /path="\/guest-practice" element=\{<GuestPracticePage \/>\}/)
})
test('guest screen uses isolated draft store, never official club, race, economy mutations', () => {
  assert.match(practice, /user\?\.is_anonymous === true/)
  assert.match(practice, /saturn_guest_drafts_v1/)
  assert.match(practice, /\.update\(\{ draft: next \}\)\.eq\('user_id', user\.id\)/)
  assert.match(practice, /\.insert\(\{ user_id: user\.id, draft: next \}\)/)
  assert.doesNotMatch(practice, /signInAnonymously|create_club|apply_for_race|welcome_coins|premium_trial|race_team_entries/)
})
test('client currently does not persist Auth sessions: long-term recovery is explicitly pending', () => {
  assert.match(client, /persistSession: false/)
  assert.match(practice, /this practice team may not be recoverable/)
})
test.todo('staging: anonymous sign-in, reload and retained same-UUID draft')
test.todo('staging: guest A vs guest B with isolated JWTs and PostgREST RLS')
