# SAT-13 — Admin-only health-monitoring cutover

**Date:** 23 November 2026. **State: Database direct-execution cutover complete; live administrator browser regression still pending.**

## Problem and fix

The original `public.monitor_youth_competition_health_v1()` is a `SECURITY DEFINER` function that can write business-check and Control Center incident records. It previously allowed `anon` and `authenticated` roles to invoke it directly. This was an unnecessary public execution path.

The older frontend invoked the original monitor directly. The updated `AdminRaceOperationsPage.tsx`, including GitHub revision `c80fc35`, instead calls `public.admin_monitor_youth_competition_health_v1()`. The replacement checks `auth.uid()` and `public.is_app_admin_v1()` before performing any monitoring. An anonymous or non-admin caller must be rejected.

## Production migrations applied

1. `20261123090605_saturn_admin_only_youth_competition_health_wrapper_v1.sql` created the protected admin-facing RPC and updated the source UI to use it.
2. `20261123121513_saturn_close_legacy_public_youth_competition_monitor_v1.sql` revoked the original endpoint from `PUBLIC`, `anon` and `authenticated`.
3. `20261123121812_saturn_restrict_raw_system_health_watchdogs_v1.sql` revoked the same direct browser privileges from the unguarded raw global health watchdog, the full youth watchdog, the special-infrastructure watchdog, and seven additional raw youth checkers.

**Verified in production:** all 10 raw monitor functions reject direct `anon` and `authenticated` execution by privilege inspection, while retaining `service_role`. The administrator wrapper is `authenticated`-callable with an internal administrator check, and rejects `anon`. Internal callers and wrappers are owned by `postgres` and execute as `SECURITY DEFINER`; the protected `run_system_health_watchdog_guarded_v2` is service-role-only.

The administrator System Health UI reads `get_admin_system_health_overview_v1`, `get_admin_system_incidents_v1` and `get_admin_system_runs_v1`, rather than invoking the raw health processors. The Race Operations UI uses the protected wrapper.

## Safety and remaining checks

- No player finances, riders, teams, game clock, Premium, guest access gates or cron job states were changed by the monitoring cutover.
- The game remains paused; do not resume the watchdog or game clock as a test.
- The actual admin browser refresh still needs testing with a real admin session and a verified current browser bundle. Old cached frontend code calling the now-closed endpoint can fail until cache refresh.
- The raw health processors may have other old integrations outside the repository. Those must be treated as obsolete; never grant them public execute again to handle an old client.
- Keep public Guest Mode enabled as expressly requested by the owner, subject to separate abuse protections.

Follow-up: [SAT-13 security issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299).
