/**
 * Saturn staging ONLY — negative Supabase Auth CAPTCHA acceptance check.
 *
 * WARNING: if CAPTCHA protection is absent, a rejected-test request can
 * actually create a disposable anonymous Auth identity in STAGING.
 * Never run this against production. No tokens, keys or user IDs are logged.
 *
 * Example, after creating and configuring a separate Supabase staging branch:
 *   SATURN_STAGING_PROJECT_REF=<staging-ref> \
 *   SATURN_STAGING_SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SATURN_STAGING_PUBLISHABLE_KEY=<staging-publishable-key> \
 *   SATURN_ACK_NONPROD_AUTH_MUTATIONS=YES_NONPRODUCTION_ONLY \
 *   node scripts/saturn-verify-staging-auth-captcha.mjs
 *
 * This validates no-token and invalid-token rejection. A real browser with
 * fresh Turnstile token is still required for success/replay/expired tests.
 */
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'okuravitxocyevkexfgi'
const projectRef = (process.env.SATURN_STAGING_PROJECT_REF ?? '').trim()
const projectUrl = (process.env.SATURN_STAGING_SUPABASE_URL ?? '').trim()
const publishableKey = (process.env.SATURN_STAGING_PUBLISHABLE_KEY ?? '').trim()
const acknowledged = process.env.SATURN_ACK_NONPROD_AUTH_MUTATIONS === 'YES_NONPRODUCTION_ONLY'

function requireIsolatedStaging() {
  if (!acknowledged) throw new Error('STOP: explicit nonproduction test acknowledgement is required.')
  if (!/^[a-z0-9]{20}$/.test(projectRef) || projectRef === PRODUCTION_REF) {
    throw new Error('STOP: supply a real staging project ref, never the production ref.')
  }
  let parsed
  try { parsed = new URL(projectUrl) }
  catch { throw new Error('STOP: invalid staging URL.') }
  if (parsed.protocol !== 'https:' ||
      parsed.hostname !== projectRef + '.supabase.co' ||
      parsed.port || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('STOP: staging URL must exactly match the isolated Supabase project.')
  }
  if (!publishableKey) throw new Error('STOP: missing staging publishable key.')
}
requireIsolatedStaging()

const client = createClient(projectUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

async function assertCaptchaRejection(label, options) {
  const result = options === undefined
    ? await client.auth.signInAnonymously()
    : await client.auth.signInAnonymously({ options })
  if (result.data?.user || result.data?.session || !result.error) {
    throw new Error('FAIL: ' + label + ' was accepted. Stop public rollout and fix server-side CAPTCHA.')
  }
  const message = String(result.error.message ?? '')
  const code = String(result.error.code ?? '')
  if (code !== 'captcha_failed' && !/captcha|turnstile|challenge/i.test(message + ' ' + code)) {
    throw new Error('INCONCLUSIVE: ' + label +
      ' was rejected for another reason (not confirmed CAPTCHA enforcement).')
  }
  console.log('PASS: ' + label + ' rejected specifically by server-side CAPTCHA.')
}

await assertCaptchaRejection('missing CAPTCHA token', undefined)
await assertCaptchaRejection('invalid CAPTCHA token', { captchaToken: 'intentionally-invalid-staging-token' })
console.log('Both negative checks passed in isolated staging. Browser success/replay/expiry tests still required.')
