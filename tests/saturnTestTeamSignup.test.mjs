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

test('restricted testing keeps public homepage button disabled and uses server UUID approval',()=>{
 const sql=read('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')
 assert.match(hero,/VITE_SATURN_PUBLIC_SIGNUP_ENABLED === 'true'/)
 assert.match(sql,/public_signup boolean not null default false/)
 assert.match(sql,/a\.user_id=v_user and a\.approved_at<=now\(\) and a\.approval_expires_at>now\(\)/)
 assert.match(sql,/Restricted test access: approval required/)
 assert.match(form,/setTesterReference\(authenticated\.user\.id\)/)
 assert.match(sql,/revoke all on private\.saturn_approved_testers_v1 from PUBLIC, anon, authenticated/)
})


test('selected country displays a small flag without changing its submitted code', () => {
  assert.ok(form.includes('https://flagcdn.com/w40/\${country.toLowerCase()}.png'))
  assert.match(form, /<img key=\{country\}/)
  assert.match(form, /id="saturn-country" required value=\{country\}/)
  assert.match(form, /p_country_code: country/)
})
