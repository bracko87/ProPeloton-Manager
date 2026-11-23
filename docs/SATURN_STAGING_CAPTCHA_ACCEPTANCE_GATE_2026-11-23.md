# Project Saturn — isolated Supabase Auth CAPTCHA and expiry acceptance

Date: 2026-11-23 · Project: ProPeloton Manager · Production Supabase ref `okuravitxocyevkexfgi`.

## What was proven without changing production

- Reviewed the current `TestTeamSignup.tsx`: the guest UI refuses submission when the Turnstile public site key or challenge token is absent, and calls `signInAnonymously({ options: { captchaToken } })` for first-time guest Auth identities. It resets the challenge after a request. Regular signup/login also use `AuthCaptcha`.
- Corrected the outdated `.github/workflows/saturn-auth-captcha-production.yml`, which had assumed both public guest flags were **off**. It now requires them **on**, matching the owner's approved settings in `netlify.toml`. It runs the existing guest and ordinary login CAPTCHA source regressions, validates the public browser site key and challenge script in the production bundle, and does **not deploy**. [Successful workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45206478097).
- Inspecting Supabase branches confirmed only the `main` production branch is available; there is no disposable staging branch.
- Reviewed the retirement procedure `control_center_private.retire_expired_saturn_test_clubs_v1` before invoking its built-in `p_dry_run=true`. The production dry-run reported **0 candidates, 0 removals, 0 AI replacements and 0 deferred**. The production game is paused and Guest Mode remains enabled.
- Client-facing `anon` PostgREST role lacks `EXECUTE` on `saturn_create_test_club_v1`. An Auth-signed-in anonymous user uses PostgREST's `authenticated` role, and must still pass the original identity, owner and rollout checks in the RPC.

## Staging safety harness prepared

`scripts/saturn-verify-staging-auth-captcha.mjs` performs **two negative server-side Auth tests**, using `signInAnonymously()` with no CAPTCHA and an intentionally invalid CAPTCHA token. It requires all four operator-provided environment variables:

- `SATURN_STAGING_PROJECT_REF`: brand-new, nonproduction Supabase project reference
- `SATURN_STAGING_SUPABASE_URL`: exact `https://<staging-ref>.supabase.co`
- `SATURN_STAGING_PUBLISHABLE_KEY`: publishable/anon key **of staging only**
- `SATURN_ACK_NONPROD_AUTH_MUTATIONS=YES_NONPRODUCTION_ONLY`

The script refuses the production project ref **even when the operator acknowledgement is supplied**, requires HTTPS and exact hostname matching, limits requests to two and never prints keys, CAPTCHA tokens, Auth session or user IDs. If server-side CAPTCHA is missing and an identity is created, it **fails**; the identity exists only on disposable staging. It does **not** accept a rate-limit rejection as evidence of CAPTCHA enforcement. The script must never be pointed at production. The accompanying automated safety tests verify the fail-closed controls without any outbound Auth requests.

**Important:** A fresh valid-token success, token replay, expiration, supported hostname and NAT/rate-limit behaviors require additional actual staging browser tests. They are not proven by the negative harness.

## Environment / cost blocker

Supabase's branch tool requires explicit cost approval. At the time of this checkpoint the project-specific quoted rate for an isolated branch was **USD $0.01344 per hour**, recurring while running. The initial branch creation was refused because the cost confirmation ID was not supplied. The branch has **not** been created, no cost has been approved and no staging credentials are stored in the repository.

After the owner explicitly approves the cost, create the staging branch, confirm its ref is not production, configure server-side Cloudflare Turnstile and appropriate test hostnames, then run the staging-only negative test. Finish disposable expired-guest tests there (day 7/14/15, linked-but-unconverted, conversion, AI reserve and race results preservation). Production Auth settings require separate operator verification at [Supabase Authentication → Bot and Abuse Protection](https://supabase.com/dashboard/project/okuravitxocyevkexfgi/auth/providers), since the connected SQL/API tools do not expose the Auth CAPTCHA secret or enforcement toggle.

Do **not** change the production game's clock, payouts, club ownership, registration availability, or expiration timestamps to simulate these tests.
