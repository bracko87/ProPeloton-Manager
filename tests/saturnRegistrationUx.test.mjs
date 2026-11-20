import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')

test('SAT-07 has three required account fields, not an obligatory public username', () => {
  const register = source('src/pages/Register.tsx')
  assert.match(register, /username: username \|\| undefined/)
  assert.doesNotMatch(register, /if \(!username\) nextErrors\.username/)
  assert.match(register, /if \(!email\)/)
  assert.match(register, /form\.password\.length < 8/)
  assert.match(register, /!form\.confirmPassword/)
  assert.match(register, /await supabase\.auth\.signUp\(\{/)
  assert.match(register, /navigate\('\/create-club'\)/)
})

test('SAT-07 birthday details are hidden by default and validation reveals them', () => {
  const register = source('src/pages/Register.tsx')
  assert.match(register, /\[showBirthdayFields, setShowBirthdayFields\] = useState\(false\)/)
  assert.match(register, /aria-expanded=\{showBirthdayFields\}/)
  assert.match(register, /\{showBirthdayFields \? \(/)
  assert.match(register, /setShowBirthdayFields\(true\)/)
  assert.match(register, /birthday_month: birthdayProvided \? birthdayMonth : null/)
  assert.match(register, /birthday_day: birthdayProvided \? birthdayDay : null/)
})

test('SAT-07 generated handles use the full anonymous UUID, never the email prefix', () => {
  const sql = source('supabase/migrations/20261120110000_saturn_privacy_safe_generated_manager_handles.sql')
  assert.match(sql, /v_username := 'mgr_' \|\| left\(md5\(new\.id::text\), 20\)/)
  assert.doesNotMatch(sql, /split_part\(coalesce\(v_email/)
  assert.match(sql, /insert into public\.profiles/)
  assert.match(sql, /birthday_month/)
  assert.match(sql, /on conflict \(id\) do update/)
})

test('SAT-07 has professional signup help in every supported locale', () => {
  for (const locale of ['en', 'de', 'sr-Latn', 'hr', 'es', 'fr', 'it', 'ru']) {
    const json = JSON.parse(source(`src/i18n/locales/${locale}/auth.json`))
    for (const key of ['accountBenefits', 'usernameHelp', 'showOptional', 'hideOptional', 'birthdayHelp']) {
      assert.ok(json.register[key]?.length, `${locale} missing ${key}`)
    }
  }
})
