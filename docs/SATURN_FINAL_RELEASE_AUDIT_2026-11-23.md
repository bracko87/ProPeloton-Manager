# Project Saturn — production release audit

**Date:** 23 November 2026
**Audit disposition:** Core email Guest Mode conversion working; monitoring permissions closed. **Not fully certified** pending live negative tests and Google-linking configuration.

## Production checks completed (read-only unless noted)

- Public guest authentication gate and test-club rollout gate: enabled, verified, and `public_signup=true`. Owner requested that public Guest Mode remain available; do not silently revert it to individual tester approvals.
- Three guest-origin teams exist, two converted and one still anonymous at the time of the audit.
- All three retain correct club ownership and owner memberships, exactly one stored home jersey, and exactly one original Premium welcome trial.
- The 14-day and 7-day windows are exactly `started_at + 14 days` and `started_at + 7 days`. No Premium restart was detected on conversion.
- The one unconverted account has zero Coins and no Coin ledger entries. Each of the two converted accounts has a balance of 20 and one 20-Coin welcome ledger grant; no duplicate grants were observed.
- Simulated JWT-subject read-only tests: an active guest's own club mutation guard returned `true` and another club returned `false`. Converted accounts are evaluated through the normal registered-user RLS policies. The shared lifecycle helper deliberately returns `true` for a converted identity and is **not a standalone ownership grant**: the inspected club and rider RLS write policies separately enforce ownership; other inspected tables lacked independent permissive write policies.
- Day-15 expiry retirement: cron job `propeloton_saturn_day15_guest_retirement_v1` remains active at every 15 minutes. The last-24-hour check showed 80/80 executions successful and no failed executions. The retirement routine excludes converted accounts. **No expired live guest exists today**, so actual day-15 deletion/AI replacement is not yet proven by this production audit.
- The game clock remains paused; no game tick or race process was activated by this audit.

## Monitoring hardening applied to production

The frontend at GitHub revision `c80fc35` already uses the admin-only youth competition monitor wrapper.

- `20261123121513_saturn_close_legacy_public_youth_competition_monitor_v1.sql` revoked direct browser execution of the legacy monitor.
- `20261123121812_saturn_restrict_raw_system_health_watchdogs_v1.sql` revoked direct browser execution of nine other raw health/incident processors.
- Privilege catalog checks confirmed both `anon` and `authenticated` cannot call these ten raw endpoints; `service_role` remains authorized. The admin-only youth competition wrapper still requires `auth.uid()` and `is_app_admin_v1()`; internal guarded watchdog execution remains service-role-only.
- The admin dashboard browser refresh has **not** been verified with a real admin session after this revocation.
- These changes did not alter Coin balances, teams, riders, game clock, cron schedules, public Guest Mode or Premium.

## CI

Saturn security workflow passed on 23 November 2026:
https://github.com/bracko87/ProPeloton-Manager/actions/runs/45173653796

This verifies source expectations, configured permissions in migration files and the production application build. The live database privilege checks are separate from CI; CI does not run against production credentials or impersonate real user sessions.

## Remaining release blockers / manual acceptance tests

1. **Live expiration scenario (staging only):** anonymous guest at day 14/15 cannot write via RPC or direct table paths; retirement replaces an AI club safely and preserves prior race histories; converted clubs never retire. Do not artificially expire real production clubs.
2. **Abuse / real JWT negative tests:** missing/replayed CAPTCHA, rate limiting, repeated anonymous identities farming trials/Coins, simultaneous team creation, user-to-user data access. A test of an authenticated identity under a simulated JWT claim is not a substitute for real API-session tests.
3. **Google account linking:** the screenshots of 23 November showed `Google identity linking could not start`. Verify Supabase Auth manual identity linking, Google provider configuration and authorized redirect URLs, then retry in the same browser without creating a second identity. **Email/password conversion already succeeded.**
4. **Live administrator browser:** open Control Center Race Operations and System Health under a real admin session after legacy-monitor revocation; verify no stale cached code still calls the old monitor endpoint.
5. **Deployment confirmation:** check which exact GitHub commit is currently published by Netlify; a successful GitHub build does not prove a Netlify publish.
6. **Other Supabase advisor findings:** security advisors report many project-wide warnings; these are not declared resolved by this narrow Saturn audit. Security-definer functions that are intentionally authenticated-callable must continue to enforce JWT ownership and authorization.

## Release recommendation

Keep public Guest Mode **on** and the game clock **paused**. Do not issue an unconditional '100% secure' or 'fully complete' sign-off until the negative-path staging and live admin/Google tests pass. Do not make additional onboarding changes without a specific confirmed defect.

The only live database changes made in this audit were targeted revocations of direct access to legacy/raw monitoring functions; no gameplay or account record updates were performed.
