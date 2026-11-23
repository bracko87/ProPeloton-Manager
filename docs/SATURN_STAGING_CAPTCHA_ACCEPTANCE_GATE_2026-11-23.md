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

## Environment / migration bootstrap blocker

The owner approved a temporary Supabase branch at USD $0.01344/hour on 23 November. A cost confirmation was obtained and staging branch `saturn-security-staging-20261123` (`lypyyvgyfdhxceorwcyj`) was created without player data.

**The deployment FAILED during production migration replay.** The first historical migration tried to patch missing `generate_race_prize_awards_v1` and `universal_race_stage_finalize_v1` definitions on the empty branch. The branch had 0 public application tables and 0 applied migrations. The production migration history starts in August 2026, ahead of the September 29 fresh-install baseline in GitHub, so this direct branching method cannot reconstruct the schema.

The failed staging branch **was deleted successfully** and the branch inventory was checked to confirm only the main production branch remains. No additional hourly charges should accrue after deletion. The negative CAPTCHA harness did not run against a live staging game.

See [the verified root cause and repair path](./SATURN_STAGING_BRANCH_BOOTSTRAP_BLOCKER_2026-11-23.md). Repair reproducible schema bootstrap in a disposable environment before creating another hourly-billed branch. No production migration history or existing player data was modified.
