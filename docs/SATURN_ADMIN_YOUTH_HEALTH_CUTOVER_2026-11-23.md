# SAT-13 — Admin-only youth competition health monitoring cutover

**Date:** 23 November 2026. **State: Stage 1 complete in production; full cutover NOT complete.**

## Confirmed problem

`public.monitor_youth_competition_health_v1()` is a publicly executable `SECURITY DEFINER` RPC with no user/admin guard. Its `private.youth_watchdog_finish_v1` dependency writes business-check logs and can create or resolve Control Center incidents. That means ordinary visitors could trigger the monitoring operation through the Data API.

The existing `src/pages/dashboard/AdminRaceOperationsPage.tsx` calls this monitor directly with the browser user's Supabase credentials, so revoking `authenticated` access abruptly would break that page. Two internal definer callers (`monitor_youth_academy_full_health_v1` and `run_hourly_game_processors_v1`) also call the original monitor.

## Stage 1: additive, non-breaking replacement — completed

Migration `supabase/migrations/20261123090605_saturn_admin_only_youth_competition_health_wrapper_v1.sql` adds `public.admin_monitor_youth_competition_health_v1()`:

- Before the existing monitor runs, checks that `auth.uid()` is non-null and `public.is_app_admin_v1()` is true.
- Returns `42501` for other users.
- New wrapper is callable through PostgREST by `authenticated` only; `anon` and `service_role` have no direct grant. Internal service/cron jobs still use the original RPC.
- Preserves the monitor's JSON response and business logic; **no health-monitoring job was executed** as part of the migration.

Frontend source is updated to call the new wrapper in `AdminRaceOperationsPage.tsx`. Existing users' currently deployed browser bundle still invokes the legacy function until a future Netlify deploy.

**Verification:** catalog reads confirmed the wrapper is `SECURITY DEFINER`, anonymous EXECUTE is false, and the owner/admin check precedes the original monitor call. In a read-only SQL transaction with the `authenticated` role but no JWT, the wrapper returned expected `42501 Administrator access required`, before running the original monitor.

## Stage 2: coordinated cutover — NOT done

**Legacy monitor remains callable** by anonymous and ordinary authenticated callers. This stage has **not** closed that direct vulnerability, and the remaining `monitor_youth_*` RPCs also require classification. Do not mark SAT-13 fully protected.

1. Include the frontend change in the next combined Netlify release; do not trigger a separate paid deploy solely for this change.
2. Use a real administrator browser session to verify the Control Center Race Operations refresh and youth-health panel still work, and a regular manager/anonymous session to confirm the wrapper denies access.
3. Examine old cached browser bundles and external integrations. **Do not revoke** the old `monitor_youth_competition_health_v1` function prematurely; that would break older UIs still calling it.
4. After the documented grace period, atomically revoke direct `EXECUTE` on the original monitor from `PUBLIC`, `anon` and `authenticated`, preserving `service_role`, definer-function and scheduled `postgres` callers. Recheck the 2 internal definer callers; verify the next intentional game-clock resume and watchdog/incident logs. The paused game must not be unpaused for this check.
5. Audit `monitor_youth_academy_full_health_v1` and seven other `monitor_youth_*` functions, which are also broadly callable and may write via watchdog completion. Guard the exposed call graph, not just the one RPC used by the admin UI.

**No production player/finance/game-clock records have been changed**, and no Netlify deployment was triggered.

This follow-up belongs to [GitHub security issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299).
