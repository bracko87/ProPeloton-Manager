import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261123110440_homepage_online_player_presence_and_guest_account_totals_v1.sql')
const tracker = read('src/components/analytics/SiteAnalyticsTracker.tsx')
const home = read('src/pages/Home.tsx')
const locales = ['en', 'de', 'sr-Latn', 'hr', 'es', 'fr', 'it', 'ru']

test('online presence uses verified Auth identity, not email or a browser-controlled user ID', () => {
  assert.ok(migration.includes('v_user uuid := auth.uid();'))
  assert.ok(migration.includes('private.site_online_players_v1'))
  assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.touch_online_player_v1() TO authenticated;"))
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.touch_online_player_v1() FROM PUBLIC, anon, authenticated;'))
  assert.ok(migration.includes('REVOKE ALL ON TABLE private.site_online_players_v1 FROM PUBLIC, anon, authenticated;'))
  assert.ok(!migration.includes('p_user_id'))
  assert.ok(!migration.includes('u.is_anonymous is not true'))
})

test('online counts mean activity in the last three minutes, not all historical accounts', () => {
  assert.ok(migration.includes("p.last_seen_at >= clock_timestamp() - interval '3 minutes'"))
  assert.ok(migration.includes('v_total_player_accounts integer := 0;'))
  assert.ok(migration.includes("'total_player_accounts', coalesce(v_total_player_accounts, 0)"))
  assert.ok(migration.includes("'online_users', coalesce(v_online_users, 0)"))
  assert.ok(migration.includes("lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'"))
})

test('authenticated presence heartbeat is separate from pageview telemetry', () => {
  assert.ok(tracker.includes("supabase.rpc('touch_online_player_v1')"))
  assert.ok(tracker.includes('!user?.id'))
  assert.ok(tracker.includes('document.visibilityState'))
  assert.ok(tracker.includes('window.setInterval(touchPresence, 60_000)'))
  assert.ok(tracker.includes("document.addEventListener('visibilitychange', onVisible)"))
  assert.ok(tracker.includes("window.clearInterval(timer)"))
  assert.ok(tracker.includes("supabase.rpc('record_site_analytics_event_v1'"))
})

test('homepage shows live online count and all guest-inclusive accounts', () => {
  assert.ok(home.includes("homeSnapshot?.online_users"))
  assert.ok(home.includes("homeSnapshot?.total_player_accounts"))
  assert.ok(home.includes("t('stats.totalPlayerAccounts')"))
  for (const locale of locales) {
    const translations = JSON.parse(read(`src/i18n/locales/${locale}/home.json`))
    assert.ok(translations.stats.onlineUsers, locale + ' onlineUsers')
    assert.ok(translations.stats.totalPlayerAccounts, locale + ' totalPlayerAccounts')
  }
})
