import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const form = read('src/pages/TestTeamSignup.tsx')
const hero = read('src/components/home/Hero.tsx')
const app = read('src/App.tsx')
const official = read('src/lib/supabase.ts')
const testClient = read('src/lib/testAccountClient.ts')
const authProvider = read('src/context/AuthProvider.tsx')

test('homepage keeps full registration and only shows Test the Game behind explicit OFF-by-default flag', () => {
  assert.match(hero, /to="\/register"/)
  assert.match(hero, /VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'/)
  assert.match(hero, /to="\/test-the-game"/)
  assert.match(app, /path="\/test-the-game" element=\{<TestTeamSignupPage \/>\}/)
  assert.match(form, /if \(!ENABLED\) return/)
})
test('test player must create a team and nickname; no email or password requested', () => {
  assert.match(form, /Manager nickname/)
  assert.match(form, /Team name/)
  assert.match(form, /Team country/)
  assert.match(form, /Create team and start testing/)
  assert.doesNotMatch(form, /type="email"|type="password"|birthday/i)
})
test('anonymous Auth only started on user submit, uses persisted separate session', () => {
  assert.match(form, /async function begin\(event: React\.FormEvent\)/)
  assert.match(form, /if \(!ENABLED \|\| busy\) return/)
  assert.match(form, /testClient\.auth\.signInAnonymously\(\{\s*options:\s*\{\s*captchaToken/)
  assert.match(authProvider, /restoreTestAccountIntoGame\(\)/)
  assert.match(testClient, /term\?\.user_id !== testUser\.user\.id/)
  assert.match(testClient, /persistSession: true/)
  assert.match(testClient, /storageKey: 'ppm-saturn-fullgame-test-session-v1'/)
  assert.match(official, /persistSession: false/)
})
test('real club is only created by a dedicated server endpoint, not direct inserts', () => {
  assert.match(form, /testClient\.rpc\('saturn_create_test_club_v1'/)
  assert.doesNotMatch(form, /\.from\('clubs'\)\.insert|\.from\('saturn_test_accounts_v1'\)\.insert/)
  assert.match(form, /testClient\.auth\.getSession\(\)/)
  assert.match(form, /supabase\.auth\.setSession/)
})
test.todo('staging: signInAnonymously gate remains closed until all production safety tests pass')
test.todo('staging: dedicated create-club RPC creates exactly one lowest-tier team and trial record')
test.todo('staging: club ID, riders, economy, training and races persist after conversion')
