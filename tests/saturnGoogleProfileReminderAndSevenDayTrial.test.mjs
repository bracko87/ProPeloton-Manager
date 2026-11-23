import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const modal = read('src/components/trial/PostConversionProfileReminder.tsx')
const profile = read('src/pages/MyProfile.tsx')
const header = read('src/components/layout/Header.tsx')
const migration = read('supabase/migrations/20261123143900_saturn_google_profile_birthday_and_trial_window_v1.sql')
const locales = ['en', 'de', 'sr-Latn', 'hr', 'es', 'fr', 'it', 'ru']

test('direct Google signup gets the same optional reminder without creating a duplicate club', () => {
  assert.ok(modal.includes("user.app_metadata?.provider === 'google'"))
  assert.ok(modal.includes('converted?.converted_at'))
  assert.ok(modal.includes("supabase.rpc('get_my_club_id')"))
  assert.ok(modal.includes("source: convertedClubId ? 'converted_guest' : 'direct_google'"))
  assert.ok(modal.includes("created your account with Google"))
  assert.ok(modal.includes('REMINDER_KEY_PREFIX + user.id'))
  assert.ok(modal.includes("to=\"/dashboard/my-profile\""))
  assert.ok(modal.includes("to=\"/dashboard/customize-team\""))
  assert.ok(!modal.includes('create_club('))
  assert.ok(!modal.includes('auth.signUp'))
})

test('Google and guest conversions may enter a missing birthday exactly once', () => {
  assert.ok(profile.includes("user.app_metadata?.provider === 'google'"))
  assert.ok(profile.includes("saturn_set_missing_birthday_once_v1"))
  assert.ok(migration.includes("i.provider='google'"))
  assert.ok(migration.includes("i.created_at between u.created_at - interval '5 minutes'"))
  assert.ok(migration.includes('t.converted_at is not null'))
  assert.ok(migration.includes('u.is_anonymous is false'))
  assert.ok(migration.includes('birthday_locked=true,birthday_set_at=now()'))
  assert.ok(migration.includes('v_p.birthday_locked is true'))
  assert.ok(migration.includes('v_p.birthday_set_at is not null'))
  assert.ok(migration.includes("where id=v_uid"))
})

test('Premium trial header counts the actual seven-day window, not prelaunch time', () => {
  assert.ok(migration.includes('get_my_premium_trial_schedule_v1'))
  assert.ok(migration.includes("'started_at',t.started_at"))
  assert.ok(migration.includes("'expires_at',t.expires_at"))
  assert.ok(migration.includes('t.user_id=auth.uid()'))
  assert.ok(migration.includes('revoke all on function public.get_my_premium_trial_schedule_v1()'))
  assert.ok(header.includes("supabase.rpc('get_my_premium_trial_schedule_v1')"))
  assert.ok(header.includes('trialStartsAtLaunch = Number.isFinite(startedMs) && startedMs > Date.now()'))
  assert.ok(header.includes('expiresMs - Math.max(Date.now(), Number.isFinite(startedMs) ? startedMs : Date.now())'))
  assert.ok(header.includes('Math.min(7, Math.ceil(remainingMs / 86400000))'))
  assert.ok(header.includes("t('trial.scheduledCountdown'"))
  for (const locale of locales) {
    const t = JSON.parse(read(`src/i18n/locales/${locale}/proPackages.json`))
    assert.ok(t.trial.scheduledCountdown.includes('{{count}}'), locale)
    assert.ok(t.trial.countdown, locale)
  }
})

test('existing guest conversion popup, premium welcome and other sign-in remain intact', () => {
  assert.ok(modal.includes("Some optional details were skipped when you converted your guest account."))
  assert.ok(modal.includes("window.addEventListener('saturn-profile-completion-updated'"))
  assert.ok(profile.includes('setCanAddBirthdayOnce(false)'))
  assert.ok(migration.includes('user_id=u.id and t.converted_at is not null'))
})
