import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261120233000_saturn_finalize_same_uuid_google_conversion_v1.sql')
const ui = read('src/pages/TestAccountRegister.tsx')
const client = read('src/lib/testAccountClient.ts')

test('Google finalizer requires original canonical Auth ID and linked provider identity', () => {
 assert.match(sql, /v_uid uuid := auth\.uid\(\)/)
 assert.match(sql, /from public\.saturn_test_accounts_v1 t/)
 assert.match(sql, /where t\.user_id=v_uid/)
 assert.match(sql, /for update/)
 assert.match(sql, /from auth\.users u/)
 assert.match(sql, /u\.is_anonymous is false/)
 assert.match(sql, /from auth\.identities i/)
 assert.match(sql, /i\.user_id=v_uid/)
 assert.match(sql, /i\.provider='google'/)
 assert.match(sql, /c\.owner_user_id=v_uid/)
 assert.match(sql, /m\.user_id=v_uid/)
})

test('Google finalizer is idempotent and never resets financial or trial state', () => {
 assert.match(sql, /if v_trial\.converted_at is null then/)
 assert.match(sql, /set converted_at=now\(\)/)
 assert.match(sql, /where user_id=v_uid and converted_at is null/)
 assert.match(sql, /'premium_restarted',false/)
 assert.doesNotMatch(sql, /insert into auth\.users|insert into public\.clubs|update public\.premium_welcome_trials|update public\.user_wallets|update public\.clubs/i)
})

test('Google linking uses persisted original Auth client, never generic new-account OAuth', () => {
 assert.match(ui, /testClient\.auth\.linkIdentity\(\{/)
 assert.match(ui, /provider: 'google'/)
 assert.match(ui, /redirectTo: window\.location\.origin \+ '\/test-account-register'/)
 assert.doesNotMatch(ui, /signInWithOAuth\(|signUp\(/)
 assert.match(client, /detectSessionInUrl: SATURN_TEST_ACCOUNTS_ENABLED/)
 assert.match(client, /persistSession: true/)
})

test('Google registration success requires provider, UUID and server confirmation', () => {
 assert.match(ui, /linked\.user\?\.id !== originId/)
 assert.match(ui, /linked\.user\.is_anonymous !== false/)
 assert.match(ui, /identity\.provider === 'google'/)
 assert.match(ui, /saturn_finalize_test_account_google_conversion_v1/)
 assert.match(ui, /result\?\.user_id !== originId/)
 assert.match(ui, /result\?\.provider !== 'google'/)
 assert.match(ui, /session\.session\.user\.id !== originId/)
 assert.match(ui, /await supabase\.auth\.setSession/)
 assert.match(ui, /Google registration completed on your original account/)
})

test.todo('staging OAuth: manual linking enabled, callback allowlisted, same session survives redirect')
test.todo('staging OAuth: linkIdentity Google preserves user UUID and original official club')
test.todo('staging OAuth: already-used Google identity cannot replace/merge another existing player')
test.todo('staging OAuth: anonymous user cannot invoke server finalizer successfully')
test.todo('staging OAuth: signup after 14 days restores permanent manager privileges and original Premium term')
