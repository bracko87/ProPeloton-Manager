import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261120123000_saturn_verified_guest_welcome_claim_v1.sql')
const login = read('src/pages/Login.tsx')
const createClub = read('src/pages/CreateClub.tsx')

test('server checks canonical verified, converted Auth user and draft before deferred grant', () => {
  assert.match(sql, /v_user uuid := auth\.uid\(\)/)
  assert.match(sql, /join public\.saturn_guest_drafts_v1 d on d\.user_id = u\.id/)
  assert.match(sql, /u\.is_anonymous is false/)
  assert.match(sql, /u\.email_confirmed_at is not null/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.doesNotMatch(sql, /raw_user_meta_data|auth\.jwt\(\)/)
})
test('welcome claim shares existing ledger key and backend idempotent grant mechanism', () => {
  assert.match(sql, /'system_key' = 'welcome_coins_v1'/)
  assert.match(sql, /perform public\.apply_coin_delta\(/)
  assert.match(sql, /\n    20,\n    'welcome',/)
  assert.match(sql, /grant execute on function public\.saturn_claim_converted_guest_welcome_v1\(\)/)
  assert.doesNotMatch(sql, /premium_welcome_trials|premium_trial_claim_history_v1|insert into public\.clubs/)
})
test('login invokes claim only after verified password session; errors never block login', () => {
  const signIn = login.indexOf("supabase.auth.signInWithPassword")
  const hasSession = login.indexOf("if (!data?.session)")
  const claim = login.indexOf("supabase.rpc('saturn_claim_converted_guest_welcome_v1')")
  assert.ok(signIn >= 0 && hasSession >= 0 && claim > hasSession)
  assert.match(login, /if \(claimError\)/)
})
test('on official onboarding only the draft team name can be suggested', () => {
  assert.match(createClub, /from\('saturn_guest_drafts_v1'\)/)
  assert.match(createClub, /user\.is_anonymous === true/)
  assert.match(createClub, /draft\.teamName/)
  assert.match(createClub, /previous\.name \? previous/)
  const section = createClub.slice(createClub.indexOf('// The only draft field eligible'), createClub.indexOf('const \[countries, setCountries\]'))
  assert.doesNotMatch(section, /draft\.riders|draft\.training|insert\(|\.update\(/)
})
test.todo('Staging: converted guest login grants exactly 20 once under concurrent requests')
test.todo('Staging: regular registered user cannot claim another welcome grant')
test.todo('Staging: guest with unverified email cannot claim reward or create official club')
test.todo('Staging: converted identity creates one official team while original practice draft remains accessible')
