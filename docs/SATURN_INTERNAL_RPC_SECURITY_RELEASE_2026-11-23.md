# Project Saturn — Restrict privileged internal and global-game RPC execution

**Date:** 23 November 2026  
**State:** Applied and verified in Supabase production; source migrations and read-only tests tracked in GitHub.

## Scope

Two targeted permission-only migrations remove public direct execution of **18** `SECURITY DEFINER` functions. All 18 retain `service_role` access; existing `postgres`-owned `SECURITY DEFINER` internal callers are left unchanged. No function definition, club, rider, wallet, calendar, paid trial, race result, or game-clock value is changed by these migrations.

The first set of seven closes direct ability to read exact rider skills and invoke internal finance or weather helpers:

- `race_get_rider_numeric_skill_value_v1(uuid,text[],numeric)`
- `race_calculate_rider_favorite_score_v1(uuid,numeric,text,text,integer)`
- `finance_transfer_club_to_club_internal(uuid,uuid,bigint,text,text,text,jsonb)`
- `finance_get_or_create_system_account(text,text,text)`
- `generate_race_stage_weather_v1(uuid,boolean)`
- `finance_process_weekly_rider_wages()`
- `_finance_process_weekly_rider_wages_core_v1()`

The second set of eleven prevents public calls that could advance the shared game clock or perform global race and scheduler processes:

- `advance_game_state_one_hour_manual()`
- `advance_game_state_one_hour()`
- `advance_game_state_one_minute_v1()`
- `run_game_tick_if_unpaused()`
- `run_game_minute_tick_if_unpaused_v1()`
- `run_daily_game_processors_v1(boolean)`
- `run_hourly_game_processors_v1(boolean)`
- `process_due_race_days_v1()`
- `process_one_backlog_game_processor_child_step_v1(date,text,integer)`
- `auto_fill_race_ai_team_applications_season_v1(uuid,text,integer,integer,integer)`
- `generate_race_weather_for_race_v1(uuid)`

## Evidence and validation

- Before the first migration, a read-only anonymous SQL session retrieved **3 of 3** sampled exact rider sprint attributes via `race_get_rider_numeric_skill_value_v1`, despite the earlier secure view masking. The helper had no caller-ownership validation.
- For the selected internal helpers, catalog inspection found no invoker-function callers; all recorded function callers were security definers. No view-rule dependencies for the first seven were detected.
- For global processors, inspected `pg_cron` job commands execute as `postgres`; one scheduled job references the audited game-clock/processors. All eleven selected RPCs had no recorded invoker-function callers.
- After both migrations, **18/18** selected functions: `anon` **DENIED**, `authenticated` **DENIED**, `service_role` **ALLOWED**.
- Under a read-only simulated `service_role` request, **2/2** rider favorite-score calculations returned their expected JSON shape through the internal helpers. This checks numerical calculation continuity without displaying rider values.
- Focused GitHub source regression and `npm run build` succeeded (GitHub Actions run 45138090665).
- Supabase Security Advisor `anon_security_definer_function_executable` count decreased from **1,229 to 1,211**. `authenticated_security_definer_function_executable` remains **1,412** and the definer-view advisor reports **31** entries.

## Limitations and release gates

**A full production game cycle has not been run after these grants.** Scheduled functions run as `postgres` based on job metadata, but review the next real cron results and Control Center error logs to confirm no permission regressions. Manual admin tick controls implemented as direct `authenticated` RPC calls will now be denied; they must use a separately authorized server/admin path instead of reopening PUBLIC privileges.

These measures **do not close all database risks**:

- Other indirectly callable world processors and finance endpoints require individual review; some publicly accessible routines may bypass the newly restricted entry points by calling protected functions within their own `SECURITY DEFINER` context.
- `get_race_favorites_v1` still publishes derived favorite/skill scores from an authorized public race ranking query. Check whether the scouting design intends to show that derived numerical score.
- Other publicly readable views and 31 definer-view warnings require classification. Do **not** blanket apply `security_invoker=true`, which would hide public race statistics under the current owner-scoped base-table RLS.
- Real authenticated browser sessions and an expired-guest test remain release gates.
- Public account conversion, one-time birthday, Coin balance, and registration workflows were not changed.

## Exact applied migration versions

- `supabase/migrations/20261123081746_saturn_restrict_internal_privileged_rpc_execution_v1.sql`
- `supabase/migrations/20261123082058_saturn_restrict_public_global_game_processors_v1.sql`

Both exist in Supabase's applied migration history. The SQL scripts contain a fail-closed preflight that checks the specific function signatures, `SECURITY DEFINER` contract, and absence of unreviewed invoker-function callers before any revocation.

Read-only verification scripts are in `supabase/tests/`; they return only role-permission metadata and never call game processors or mutate game data. Backing out these grants would reopen an untrusted API path, so do not automatically restore public `EXECUTE` as a rollback.

**Next:** review additional public processor wrappers, finance mutation endpoints, remaining definer views, frontend administrative controls and actual scheduled job logs. Continue [security issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299).
