# Public Guest Mode — owner-requested availability (23 November 2026)

**Production target:** propelotonmanager.com / Supabase project `okuravitxocyevkexfgi`.

## Owner instruction
Keep **Test the Game** accessible to all visitors; do not reinstate the individual tester-approval wall during normal future releases. This is an explicit availability decision, not an approval to disable CAPTCHA, owner checks, trial lifecycle, RLS or security monitoring.

## Production state confirmed 2026-11-23
- `private.ppm_guest_auth_gate_v1.enabled = true`, with `verified_at` present.
- `private.saturn_test_club_rollout_v1.enabled = true`, `public_signup = true`, with `verified_at` present.
- The public guest-registration boolean has **no automatic expiry**. A former individual tester's 48-hour approval is not needed while public signup is on.
- `netlify.toml` builds with `VITE_SATURN_TEST_ACCOUNTS_ENABLED = "true"` and `VITE_SATURN_PUBLIC_SIGNUP_ENABLED = "true"`.
- Homepage Test the Game button depends on the test feature being enabled; it does not depend on the obsolete private-approval flag.
- `src/pages/TestTeamSignup.tsx` does not display the stale approved-testers-only banner.
- Current normal lifecycle remains **14 days** before guest expiry (register/convert to retain the team), and **7 days** of introductory Premium. Do not silently make those durations unlimited.

## Never regress
1. Do not change `public_signup` to `false` during ordinary frontend maintenance, deployment, CI refactoring, or customer-onboarding fixes.
2. Keep Cloudflare Turnstile client checks, server-side Auth verification, official club ownership, per-identity duplicate prevention, approved division-capacity checks and expiring guest-write protections.
3. Never confuse the **public Guest Mode availability** with the **14-day lifespan of an individual guest team**.
4. If an actual exploit forces an emergency lockdown, document the incident and communicate the safety reason; do not silently present private approval as normal signup.
5. Production Netlify deployment and genuine guest email/Google conversion browser testing still require independent verification.

## Open security follow-ups
- Real direct-API negative CAPTCHA and IP-rate-limit tests, including repeated signup abuse.
- Genuine separate-identity, trial expiration and conversion tests with real JWTs and no loss of club, assets or finance.
- Review of remaining player-write paths and server-side trial expiration protections.
- Netlify publication of the changed public flag/banner is separate from the **already applied** database gate. A stale browser bundle can still display an old notice until rebuilt.

**Scope of database change:** only `public_signup=true` and its audit reason were updated on the existing private test-club rollout record. No existing player, club, race, premium, coin or game-clock data were modified.
