import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const practice = read('src/pages/GuestPractice.tsx')
const officialClient = read('src/lib/supabase.ts')
const guestClient = read('src/lib/guestSupabase.ts')

test('registered game routes reject canonical anonymous identities', () => {
  assert.match(app, /user\.is_anonymous === true/)
  assert.match(app, /Navigate to="\/guest-practice" replace/)
  assert.match(app, /path="\/guest-practice" element=\{<GuestPracticePage \/>\}/)
})

test('guest-only client has a separate persistent storage key; official client remains unchanged', () => {
  assert.match(officialClient, /persistSession: false/)
  assert.match(guestClient, /storageKey: SATURN_GUEST_STORAGE_KEY/)
  assert.match(guestClient, /persistSession: true/)
  assert.match(guestClient, /autoRefreshToken: true/)
  assert.match(guestClient, /detectSessionInUrl: false/)
  assert.match(guestClient, /createClient\(SUPABASE_URL, SUPABASE_ANON_KEY/)
  assert.doesNotMatch(guestClient, /signInAnonymously\(/)
})

test('practice reads and writes only through guest identity and isolated draft table', () => {
  assert.match(practice, /guestSupabase\.auth\.getUser\(\)/)
  assert.match(practice, /guestSupabase\.auth\.onAuthStateChange/)
  assert.match(practice, /session\?\.user\?\.is_anonymous === true/)
  assert.match(practice, /data\.user\?\.is_anonymous === true/)
  assert.match(practice, /guestSupabase\.from\('saturn_guest_drafts_v1'\)/)
  assert.match(practice, /\.update\(\{ draft: next \}\)\.eq\('user_id', user\.id\)/)
  assert.match(practice, /\.insert\(\{ user_id: user\.id, draft: next \}\)/)
  assert.doesNotMatch(practice, /create_club|apply_for_race|welcome_coins|premium_trial|race_team_entries/)
})

test('guest warning states session loss remains possible', () => {
  assert.match(practice, /this practice team may not be recoverable/)
})
test.todo('staging: real anonymous guest session survives browser reload with same UUID')
test.todo('staging: guest A cannot read or write guest B drafts under RLS')
test.todo('staging: guest-to-permanent conversion retains original UUID and draft')
