import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const form=get('src/pages/TestTeamSignup.tsx')
const widget=get('src/components/auth/SaturnGuestCaptcha.tsx')
const server=get('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')

test('guest signup requires CAPTCHA and passes token to Supabase Auth, never club RPC',()=>{
 assert.match(form,/!SATURN_TURNSTILE_SITE_KEY \|\| !captchaToken/)
 assert.match(form,/signInAnonymously\(\{\s*options:\s*\{\s*captchaToken\s*\}/)
 assert.match(form,/<SaturnGuestCaptcha key=\{captchaAttempt\} onTokenChange=\{setCaptchaToken\}/)
 assert.match(form,/disabled=\{busy \|\| countries\.length === 0 \|\| !SATURN_TURNSTILE_SITE_KEY \|\| !captchaToken\}/)
 assert.match(form,/setCaptchaAttempt\(attempt => attempt \+ 1\)/)
 assert.doesNotMatch(form,/localStorage\.setItem\(['"]captcha|sessionStorage\.setItem\(['"]captcha/)
})

test('missing site key fails closed and actual Turnstile callback drives eligibility',()=>{
 assert.match(widget,/VITE_SATURN_TURNSTILE_SITE_KEY/)
 assert.match(widget,/if \(!SATURN_TURNSTILE_SITE_KEY\)/)
 assert.match(widget,/turnstile\.render\(target/)
 assert.match(widget,/callback: token => \{ if \(active\) onToken\.current\(token\) \}/)
 assert.match(widget,/'expired-callback': \(\) => \{ if \(active\) onToken\.current\(null\) \}/)
 assert.match(widget,/'error-callback': \(\) => \{ if \(active\) onToken\.current\(null\) \}/)
 assert.match(widget,/turnstile\?\.remove\(widgetId\)/)
 assert.doesNotMatch(widget,/import\.meta\.env\.VITE_[A-Z_]*SECRET|process\.env\.[A-Z_]*SECRET/)
})

test('client CAPTCHA does not replace transactional owner/one-club and rollout gates',()=>{
 assert.match(server,/private\.ppm_guest_auth_gate_v1/)
 assert.match(server,/private\.saturn_test_club_rollout_v1/)
 assert.match(server,/u\.is_anonymous is true/)
 assert.match(server,/pg_advisory_xact_lock/)
 assert.match(server,/where t\.user_id=v_user/)
 assert.match(server,/where c\.owner_user_id=v_user/)
 assert.match(server,/revoke all on function public\.saturn_create_test_club_v1/)
})

test.todo('staging: dashboard Auth CAPTCHA required on direct /auth/v1/signup anonymous requests, not just React')
test.todo('staging: configure Supabase Turnstile secret and site-key domain/hostname allowlist')
test.todo('staging: verify anonymous Auth per-IP rate limit and identify safe project-specific thresholds')
test.todo('staging: reused/expired CAPTCHA token denied by Auth and new token works')
test.todo('staging: two simultaneous trial team requests from one guest still produce at most one club')
test.todo('staging: new anonymous identities cannot farm starting Coins, Premium or team assets through repeated signup')
