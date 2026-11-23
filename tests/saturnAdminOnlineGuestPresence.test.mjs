import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8')
const sql = read('supabase/migrations/20261123150500_saturn_admin_online_guest_presence_breakdown_v1.sql')
const admin = read('src/pages/dashboard/AdminAnalyticsPage.tsx')
const tracker = read('src/components/analytics/SiteAnalyticsTracker.tsx')
const homeSql = read('supabase/migrations/20261123110440_homepage_online_player_presence_and_guest_account_totals_v1.sql')

test('online guests are real Auth users, including anonymous users without email', () => {
  assert.ok(sql.includes('private.site_online_players_v1'))
  assert.ok(sql.includes('JOIN auth.users u ON u.id=p.user_id AND u.deleted_at IS NULL'))
  assert.ok(sql.includes("p.last_seen_at >= v_now - interval '3 minutes'"))
  assert.ok(sql.includes('u.is_anonymous IS TRUE'))
  assert.ok(sql.includes('s.converted_at IS NULL'))
  assert.ok(sql.includes('s.converted_at IS NOT NULL'))
  assert.ok(sql.includes('online_total'))
  assert.ok(sql.includes('online_guest'))
  assert.ok(sql.includes('online_registered'))
  assert.ok(sql.includes('online_converted_guest'))
  assert.ok(sql.includes('window_seconds'))
  assert.ok(homeSql.includes("p.last_seen_at >= clock_timestamp() - interval '3 minutes'"))
  assert.ok(tracker.includes("supabase.rpc('touch_online_player_v1')"))
  assert.ok(tracker.includes("window.setInterval(touchPresence, 60_000)"))
})

test('admin-only aggregate never exposes identity and never grants browser access to underlying presence', () => {
  assert.ok(sql.includes('IF auth.uid() IS NULL OR NOT public.is_app_admin_v1()'))
  assert.ok(sql.includes("RAISE EXCEPTION 'Administrator access required' USING errcode='42501'"))
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_admin_online_presence_breakdown_v1()'))
  assert.ok(sql.includes('FROM PUBLIC,anon,authenticated'))
  assert.ok(sql.includes('TO authenticated,service_role'))
  assert.doesNotMatch(sql, /'user_id'\s*,|'email'\s*,|'ip'\s*,|'session_id'\s*,/)
  assert.doesNotMatch(sql, /update public\.|insert into public\.|delete from public\./i)
})

test('admin UI separates authenticated presence from five-minute page navigation', () => {
  assert.ok(admin.includes("'get_admin_online_presence_breakdown_v1'"))
  assert.ok(admin.includes('setOnlinePresence(null)'))
  assert.ok(admin.includes('Online account activity is temporarily unavailable.'))
  assert.ok(admin.includes('Online managers · last 3 minutes'))
  assert.ok(admin.includes('Guests / unfinished trials'))
  assert.ok(admin.includes('Permanent accounts'))
  assert.ok(admin.includes('onlinePresence.online_guest'))
  assert.ok(admin.includes('onlinePresence.online_registered'))
  assert.ok(admin.includes('onlinePresence.online_converted_guest'))
  assert.ok(admin.includes('not a guaranteed live socket connection'))
  assert.ok(admin.includes('Navigation recorded within the last 5 minutes'))
  assert.ok(admin.includes('window.setInterval(refreshIfVisible, 60_000)'))
})
