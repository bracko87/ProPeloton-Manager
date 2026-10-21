# ProPeloton Manager — RLS follow-up, 2026-10-21

## Scope

Live Supabase ref `okuravitxocyevkexfgi`. Production game is running.
Twenty newly introduced public tables currently have row-level security off (PostgreSQL catalog).
Ten of them are also flagged as ERROR by Supabase's externally-facing RLS linter.
This change enables RLS without changing table contents, game clock, player records, race results,
race simulation functions or the standing/statistics view security modes.

## Classification

- **13 private/internal-only**: admin shadow validation, championship draw state, premium trial
  storage, race engine survival/watchdog, safe-calculation checkpoints, rider weekly snapshot health
  and youth academy service config. No frontend policies are added.
- **3 signed-in global/reference reads**: nations competition schedule config, historical youth
  competition transitions and youth standings. `SELECT` only.
- **3 signed-in own-club reads**: race eligibility notification state (via `team_id`),
  team policy nonrecurring charge state and team policy rider-effect log. `SELECT` only;
  includes parent-club ownership/membership.
- **1 signed-in own-user read**: national-association renewal coin events,
  filtered by `user_id = auth.uid()`. `SELECT` only.

There are no new `anon` policies and no INSERT/UPDATE/DELETE frontend policies.
The live PostgreSQL function-source audit found only SECURITY DEFINER functions
directly referencing these 20 relations, supporting backend/RPC continuity.
The already-restored security-definer behavior of 45 views is deliberately unchanged:
the previous bulk security_invoker conversion caused standings/statistics regressions.

## Separate error-log findings (no speculative fix in this PR)

- On 2026-10-20, several PostgREST requests attempted the authenticated-only RPCs
  `get_my_coin_status`, `get_my_premium_status` and `mark_online_presence_v1` without access.
  Live function grants already permit `authenticated` and deny `anon`, which is intentional.
  Determine whether these are invalid-session/anonymous probes before modifying auth.
- `inbox_list_threads` raised its explicit `Not authenticated` error in anonymous requests.
- One `40P01` deadlock was logged between rider weekly snapshot verification and
  real rider progression settlement. Recent day/hour processors otherwise passed.
  Investigate job scheduling separately rather than altering this migration.

## Release verification

1. Review the PR, migration and live schema for drift; run the existing build and race
   engine regression gates. PR alone does not deploy SQL.
2. After explicit authorization and a controlled Supabase migration:
   ```sql
   select count(*) as rls_disabled
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;
   ```
   Expected `0` if no new tables have been created in the interim.
3. Confirm no definer-view change:
   ```sql
   select count(*) as definer_mode_views
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
   and not coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true'];
   ```
   Expected current baseline `45`, unless another authorized release changes views.
4. Exercise as logged-in human club: team ranking, statistics, national championships,
   own team policies, premium status, youth standings, stage results and replay availability.
   The database-only anonymous and authenticated-role smoke probes passed for standings/statistics,
   but **cannot substitute for a real user session**. The replay probes returned no frame rows
   without a JWT; that alone does not mean the logged-in replay is broken.
   The legacy `race_stage_replay_frames` table currently has zero rows, but the current
   universal replay RPC reads `race_stage_simulation_runs.result_summary_json.output_snapshot`.
   Read-only verification confirmed all 20 most-recent completed simulation runs contain
   an output snapshot and at least two replay timeline checkpoints. This is positive
   persistence evidence, **not** an authenticated browser replay test.
5. Confirm anon cannot read any private state and authenticated users cannot read another
   club's team-policy or coin-event records. Check SQL and Edge Function logs after release.
6. Inspect the new Security Advisor findings: [RLS Disabled in Public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

## Rollback discipline

If a regression occurs, inspect the failed relation and its policy. Roll back only that
table's policy/security setting in a reviewed forward migration while retaining audit evidence.
Do **not** run a global `DISABLE ROW LEVEL SECURITY` batch or change security-definer views.
