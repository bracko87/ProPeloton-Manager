import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('SAT-08 registration must not query the public account-existence oracle', () => {
  const page = read('src/pages/Register.tsx')
  assert.doesNotMatch(page, /is_email_registered_v1|checkEmailAlreadyRegistered|checkingEmail/)
  assert.doesNotMatch(page, /onBlur=\{\(\) => \{\s*if \(!loading\) void checkEmail/)
  assert.match(page, /await supabase\.auth\.signUp\(\{/)
  assert.match(page, /supabase\.auth\.resend\(\{/)
  assert.match(page, /emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL/g)
  assert.match(page, /setMessage\(t\('register\.accountCreatedConfirm'\)\)/)
  assert.doesNotMatch(page, /setMessage\(t\('register\.emailAlreadyRegistered'\)\)/)
  assert.doesNotMatch(page, /setMessage\(t\('register\.alreadyConfirmed'\)\)/)
  // CAPTCHA applies to both real Auth requests; it is no longer spent on an
  // unsupported preflight RPC.
  assert.equal((page.match(/captchaToken: captcha\.consume\(\)/g) || []).length, 2)
  assert.equal((page.match(/finally \{\s+captcha\.reset\(\)/g) || []).length, 2)
  // Do not regress signup's optional birthday promise.
  assert.match(page, /birthday_month: birthdayProvided \? birthdayMonth : null/)
  assert.match(page, /birthday_day: birthdayProvided \? birthdayDay : null/)
})

test('SAT-08 compatibility RPC cannot reveal whether an email is registered', () => {
  const sql = read('supabase/migrations/20261122210000_saturn_email_lookup_privacy_compat_v1.sql')
  assert.match(sql, /create or replace function public\.is_email_registered_v1\(p_email text\)/i)
  assert.match(sql, /security invoker/i)
  assert.match(sql, /select false;/)
  assert.match(sql, /revoke all on function public\.is_email_registered_v1\(text\)/i)
  assert.match(sql, /grant execute on function public\.is_email_registered_v1\(text\)/i)
  assert.doesNotMatch(sql, /from auth\.users|from public\.profiles|security definer/i)
})

test('SAT-08 privacy-safe signup and resend notices are localized in all 8 languages', () => {
  for (const locale of ['en','de','sr-Latn','hr','es','fr','it','ru']) {
    const auth = JSON.parse(read('src/i18n/locales/' + locale + '/auth.json'))
    for (const key of ['accountCreatedConfirm','activationSent','alreadyConfirmed','emailInUse','emailAlreadyRegistered']) {
      assert.ok(auth.register[key] && auth.register[key].length > 40, locale + ':' + key)
    }
    assert.notEqual(auth.register.accountCreatedConfirm, auth.register.signupFailed)
  }
  const english = JSON.parse(read('src/i18n/locales/en/auth.json')).register
  assert.match(english.accountCreatedConfirm, /If this address can be registered/i)
  assert.match(english.activationSent, /If this address has an unconfirmed registration/i)
})
