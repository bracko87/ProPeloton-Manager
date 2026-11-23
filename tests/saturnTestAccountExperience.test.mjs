import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const dashboard = read('src/pages/dashboard/ClubDashboard.tsx')
const notice = read('src/components/trial/TestAccountNotice.tsx')
const conversion = read('src/pages/TestAccountRegister.tsx')

test('in-game Register control is globally visible for active test accounts', () => {
  assert.match(dashboard, /<TestAccountNotice \/>/)
  assert.match(notice, /Register \/ Keep my team/)
  assert.match(notice, /test-account-register/)
  assert.match(notice, /saturn_test_accounts_v1/)
  assert.match(notice, /VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'/)
})
test('introductory popup explains terms without generating duplicate accounts', () => {
  assert.match(notice, /role="dialog"/)
  assert.match(notice, /14-day test account/)
  assert.match(notice, /seven days include the Premium trial/)
  assert.match(notice, /sessionStorage\.setItem/)
  assert.doesNotMatch(notice, /signUp|signInAnonymously|apply_coin_delta|\.insert\(/)
})
test('conversion links current anonymous auth identity instead of signing up a new user', () => {
  assert.match(app, /path="\/test-account-register" element=\{<RequireUnexpiredTestAccount><TestAccountRegisterPage \/><\/RequireUnexpiredTestAccount>\}/)
  assert.match(conversion, /supabase\.auth\.updateUser\(\{ email: email\.trim\(\) \},\s*\{[\s\S]*?emailRedirectTo:/)
  assert.match(conversion, /supabase\.auth\.updateUser\(\{ password \}\)/)
  assert.match(conversion, /testClient\.auth\.linkIdentity\(\{/)
  assert.match(conversion, /original\.user\.id !== originId/)
  assert.match(conversion, /data\.user\?\.id !== originId/)
  assert.match(conversion, /result\?\.user_id === originId/)
  assert.match(conversion, /!user\.email_confirmed_at/)
  assert.doesNotMatch(conversion, /auth\.signUp\(|\.from\('clubs'\)\.insert|\.rpc\('create_club'/)
})
test.todo('staging: same-UUID identity links after verification without losing riders or finances')
test.todo('staging: test account expiry is enforced by every state-changing backend RPC')
test.todo('staging: premium is actually granted for 7 days but never duplicated on conversion')
