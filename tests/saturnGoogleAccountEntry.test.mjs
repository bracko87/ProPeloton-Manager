import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const googleEntry = read('src/components/auth/GoogleAuthEntry.tsx')
const login = read('src/pages/Login.tsx')
const register = read('src/pages/Register.tsx')
const callback = read('src/components/auth/SignupEmailCallbackRouting.tsx')
const conversion = read('src/pages/TestAccountRegister.tsx')
const oauth = read('src/lib/googleOAuth.ts')
const client = read('src/lib/supabase.ts')
const storage = read('src/lib/regularAuthStorage.ts')
const locales = ['en', 'de', 'sr-Latn', 'hr', 'es', 'fr', 'it', 'ru']

test('both normal auth screens offer one shared Google sign-in / new account entry', () => {
  assert.match(login, /<GoogleAuthEntry purpose="login" \/>/)
  assert.match(register, /<GoogleAuthEntry purpose="register" \/>/)
  assert.match(googleEntry, /supabase\.auth\.signInWithOAuth\(\{/)
  assert.match(googleEntry, /provider: 'google'/)
  assert.match(googleEntry, /redirectTo: googleOAuthRedirect\(\)/)
  assert.doesNotMatch(googleEntry, /\.signUp\(|\.insert\(|\.rpc\('create_club'/)
})

test('guest team identity is never replaced by generic Google sign-in', () => {
  assert.match(googleEntry, /current\?\.is_anonymous === true/)
  assert.match(googleEntry, /SATURN_GUEST_AUTH_MODE && hasSavedGuestSession\(\)/)
  assert.match(googleEntry, /navigate\('\/test-account-register'\)/)
  assert.match(conversion, /testClient\.auth\.linkIdentity\(\{/)
  assert.doesNotMatch(conversion, /signInWithOAuth\(|auth\.signUp\(/)
  assert.match(conversion, /pending\.userId !== originId/)
  assert.match(conversion, /linked\.user\?\.id !== originId/)
  assert.match(conversion, /saturn_finalize_test_account_google_conversion_v1/)
})

test('OAuth return goes through existing allowlisted callback and never creates a club', () => {
  assert.match(oauth, /return window\.location\.origin \+ '\/create-club'/)
  assert.match(oauth, /sessionStorage\.setItem\(GOOGLE_OAUTH_INTENT_KEY/)
  assert.match(oauth, /10 \* 60 \* 1000/)
  assert.match(callback, /googleIntent\?\.kind === 'guest_link'/)
  assert.match(callback, /user\.id !== googleIntent\.userId/)
  assert.match(callback, /identity\.provider === 'google'/)
  assert.match(callback, /navigate\('\/test-account-register', \{ replace: true \}\)/)
  assert.match(callback, /supabase\.rpc\('get_my_club_id'\)/)
  assert.doesNotMatch(callback, /\.insert\(|\.upsert\(|\.signUp\(/)
})

test('ordinary Google PKCE stores only verifier across redirect; guest email flow remains intact', () => {
  assert.match(storage, /key\.includes\('-code-verifier'\)/)
  assert.match(storage, /sessionStorage\?\.setItem\(key, value\)/)
  assert.match(storage, /return pending\.get\(key\) \?\? null/)
  assert.match(client, /flowType: SATURN_GUEST_AUTH_MODE \? 'implicit' : 'pkce'/)
  assert.match(client, /storage: guestSessionStorage/)
  assert.match(client, /storage: regularAuthStorage/)
  assert.match(client, /detectSessionInUrl: true/)
  assert.doesNotMatch(storage, /localStorage|access_token|refresh_token/)
})

test('Google account actions have all eight auth translations', () => {
  for (const locale of locales) {
    const messages = JSON.parse(read(`src/i18n/locales/${locale}/auth.json`))
    for (const field of ['continue','createOrSignIn','existingTeamReminder','sessionError','storageRequired','providerError']) {
      assert.equal(typeof messages.google?.[field], 'string', locale + ':' + field)
      assert.ok(messages.google[field].length > 4, locale + ':' + field)
    }
  }
})
