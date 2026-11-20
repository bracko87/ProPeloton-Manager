import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const conversion = read('src/pages/GuestConvert.tsx')
const app = read('src/App.tsx')
const practice = read('src/pages/GuestPractice.tsx')
const guest = read('src/lib/guestSupabase.ts')

test('conversion acts upon current guest UUID, never registers or silently merges another account', () => {
  assert.match(conversion, /guestSupabase\.auth\.updateUser\(\{ email: email\.trim\(\) \}\)/)
  assert.match(conversion, /guestSupabase\.auth\.updateUser\(\{ password \}\)/)
  assert.doesNotMatch(conversion, /auth\.signUp\(|auth\.signInWithPassword\(|auth\.admin\.|auth\.linkIdentity\(/)
  assert.match(conversion, /user\.id !== originalId/)
  assert.match(conversion, /data\.user\?\.id !== originalId/)
  assert.match(conversion, /data\.user\?\.is_anonymous !== false/)
})
test('verification and user consent are required before setting password', () => {
  assert.match(conversion, /!user\.email_confirmed_at/)
  assert.match(conversion, /user\.is_anonymous === true/)
  assert.match(conversion, /password\.length < 8/)
  assert.match(conversion, /password !== confirm/)
  assert.match(conversion, /Existing-account merging is not supported/)
})
test('the original identity survives a reload without persisting password', () => {
  assert.match(conversion, /ORIGINAL_GUEST_ID_KEY/)
  assert.match(conversion, /localStorage\.setItem\(ORIGINAL_GUEST_ID_KEY, id\)/)
  assert.doesNotMatch(conversion, /localStorage\.setItem\([^\n]*password/)
})
test('conversion route is not a public signup entry or official club route', () => {
  assert.match(app, /path="\/guest-convert" element=\{<GuestConvertPage \/>\}/)
  assert.match(practice, /to="\/guest-convert"/)
  assert.match(guest, /persistSession: true/)
})
test.todo('staging: updateUser email sends verification and preserves original Auth UUID')
test.todo('staging: clicking verification returns to same guest session with same UUID')
test.todo('staging: password update only after email confirmation; new login preserves UUID')
test.todo('staging: existing email conflict never merges or transfers progress')
test.todo('staging: server rewards never duplicate after conversion')
