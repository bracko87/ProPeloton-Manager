# Full Season 1 restart — safety review (2026-11-17)

## Decision and current state
- Owner approved working toward a **full-world restart to Season 1, January 1**, reusing the improved game code and returning the game clock to paused.
- **Not authorized to reopen public play until the new world passes verification.**
- Prepared run ID: `a673dc49-a37a-4493-b121-db6e8c2fdfa0`, status `preflight`.
- No world reset, database truncation, full-world freeze, clock restart, or historical deletion has occurred during this preparation.
- During inspection: live Season 2 still running, approx. Jan 6 game time, 2× speed. 27 Auth accounts; 11 active owned clubs across 10 owners; database roughly 11.8 GB.
- Existing two preflight functions return `ready_for_reset_build` / `ready_for_reset`, but these **are insufficient** for approving destructive execution, as shown below.

## Immediate safety fixes completed
- Every `public.game_world_reset_%` SECURITY DEFINER function (13 observed) now has no `anon` or `authenticated` EXECUTE; service_role retains access. Verified via `has_function_privilege`.
- Added `private.game_world_reset_execution_signoffs_v1` and fail-closed `private.game_world_reset_execute_guard_v1` to the existing core reset entrypoint. The reset is blocked until a verified backup reference, player-club preservation, national calendar rebuilding, and current-validator compatibility have separately been signed off.
- Versioned migration: `20261117090000_protect_global_season1_restart_v1.sql`.
- Prepared run currently has **zero approvals**, and the direct world reset still refuses execution.

## Blocking corrections before destructive execution

1. **Keep every user-owned club — FIXED IN RESET BASELINE.** The old baseline `public.game_world_reset_s1_competition_baseline_v1` has 499 clubs but excludes four live user WorldTeams from Season 1: **Adidas pro Team**, **BK Budva**, **LECO Cycling Team**, **Levsisters**. The old reset would deactivate them. Reconciled exact AI-to-human replacement pairs using equal old AI deletion time and new owned club creation time, matching final S1 WorldTeam placements. The reset baseline still contains 499 clubs, including 25 WorldTeams, and now includes all 11 live owned clubs. Four replaced AI baseline records are archived in private audit; no live clubs were changed. Still check division counts and seed remaining vacant AI slots during the final world reset.
2. **National Championships for all countries**. `TRUNCATE public.riders CASCADE` clears `national_championship_editions` and `world_road_championship_editions`. The old core does not rebuild either after regenerating riders. Add an explicit rebuilding phase using the current permanent route eligibility policy, guarantee all 150 countries have valid stages, ensure rider eligibility across the complete national pool, and reject missing/duplicate championships. The old Season 1 calendar's historical `missing_route` statuses must not be recycled as truth.
   - At present the reset's 499-club roster baseline represents 148 of the 150 national championship countries; **BT (Bhutan) and BW (Botswana)** need fresh eligible riders after the roster wipe. Old BT/BW riders will be truncated with all other progression. Ensure these two countries have valid fresh participants and routes before validating 150 editions.
3. **Fix stale validator hashes — FIXED AND VERIFIED.** `game_world_reset_validate_core_v1` embeds hashes for older `season_transition_engine_execute_v2` and `verify_new_season_fresh_state_v1` functions. Current definitions differ, so the old validator will incorrectly reject even an otherwise good rebuild. Validator now compares the four transition function definitions with hashes captured in the prepared reset run. The live hash mismatch count is 0. Validation still fails, as expected, on a running Season 2 world, and will be checked after the actual reset.
4. **Backup and recovery**. Confirm a restorable database backup **taken before the reset** in Supabase Dashboard > Database > Backups (including any point-in-time recovery capability) and record a reference with the prepared run. A generic count report or reset checkpoint is **not a complete database backup**. Do not proceed with the live wipe until verified.
5. **Operational maintenance gate**. Before freezing, ensure normal players cannot write gameplay data and no race-engine, game-clock or other cron/edge worker can race the reset transaction. Record precisely what is disabled and restore only after validation.
6. **Complete reset audit**. Check clean Season 1 01:00 paused state; no S1/S2 results, ranking points, fatigue/progression or stale simulation snapshots; 150 valid national championship editions plus valid future world championship; correct world/pro/continental/amateur slots; original accounts and entitlements preserved (including coins/purchases and Premium); fresh finance, sponsored club objectives and 10-player user/15-player AI starting rosters; correct current and previous timeline visibility; no pending future deliveries; job clocks rebased; no foreign-key/trigger fallout.

## Source facts
- S1 competition snapshot: 525 club rows, 29 national/technical identities, 496 true sporting clubs, including all 11 currently active user-owned clubs.
- Legacy reset baseline: 499 club rows, including stale AI clubs and **missing the four player WorldTeams**. Do not assume it is current or complete.
- Current permanent national-route library: 150 Season 2 national editions report valid routes. After a full rider regeneration, re-run the all-country route and eligibility audit for Season 1 independently.
- Original reset baseline AI replacement mapping is audited and corrected; see migration `20261117092000_preserve_player_clubs_in_season1_world_restart_v1.sql`.
- Prepared-run validator has been corrected; see migration `20261117093000_reset_validation_against_checkpointed_code_v1.sql`.
- The old world reset previously completed in August but also has several failed historical attempts. Past success does not establish compatibility with the November schema.
- Old reset implementation explicitly clears hundreds of thousands of results and rider-linked history; it is destructive and must never be run based on the old `ready_for_reset` flag alone.

## Update: November 17 — latest verified preparation

- All **150** Season 1 schedule-plan calls were checked read-only with estimated fresh starting roster sizes: **150 returned ready** with source stage and date. **22** countries projected to need qualification heats. This does not replace a full post-reset simulation.
- The reset now retains exactly 150 independent country targets in `private.game_world_reset_national_countries_v1`, including Bhutan (BT) and Botswana (BW). Both have existing hidden routes but no reset baseline clubs, so they receive one fresh national rider each **only** inside paused/frozen S1.
- New internal helpers `private.game_world_reset_cleanup_national_competitions_v1` and `private.game_world_reset_rebuild_national_competitions_v1` are wired into the existing reset core; old Nations history and NC/NCQ/WRC/WNQ/WNF fixtures are cleared, then all 150 national editions, WRC and fresh Nations schedules are constructed. These helpers have only been negative-tested against live S2; live execution is **not certified** until the backed-up reset run succeeds.
- Strict final validator now requires 150 S1 route-ready national editions, 150 countries with riders, one ready WRC, a fresh planned Nations edition, and **zero** old Nations points and history.
- There are **64 active cron jobs**. A guarded private helper will snapshot job IDs and active flags, suspend them only once backup and all signoffs are verified; the core reset fails closed until all cron jobs are suspended and running jobs drained. Not yet executed: 64 jobs remain active.
- Private restart maintenance gate is installed with `locked=false` (the public season-window RPC now includes `restart_locked`), and new Auth sessions would be blocked during approved maintenance. A React maintenance page has been implemented on `main` with EN/DE copy and no speculative reopening time, **not yet confirmed deployed to Netlify**. Earlier sessions and other direct APIs require separate locking verification.
- The reset run `a673dc49-a37a-4493-b121-db6e8c2fdfa0` remains `preflight`, with **zero** signoffs. Season 2 is still running, and the database has not been wiped or paused.
- Source files: `20261117104000_prepare_s1_150_nation_and_nations_rebuild_v1.sql`, `20261117104500_integrate_clean_competition_restart_validation_v1.sql`, `20261117105000_prepare_and_require_cron_quiescence_before_full_reset_v1.sql`, and `20261117110000_prepare_full_s1_restart_maintenance_access_gate_v1.sql`.

### Remaining unverified gates

1. **Restorable backup**: Supabase project backup evidence must be verified and recorded before any destructive reset. Supabase backup availability cannot be read through the connected SQL-only project actions; a database size check or in-database checkpoint is not a backup.
2. **Production deployment**: publish the actual reset maintenance UI on Netlify from `main` and verify that the production JavaScript includes the new lock.
3. **Pre-existing JWT/API writes**: auth new-session block and frontend lock do not guarantee that every existing access token and direct gameplay API write is blocked. Verify and address server-side write permissions before activating the gate.
4. **In-flight and external workers**: ensure edge function dispatches, asynchronous runners and user APIs cannot race the reset; no assumption that suspending cron alone is sufficient.
5. **Full positive reset test**: execute only after verified backup, then audit all 150/150 editions, Worlds/Nations fixtures, club/finance/entitlements, and complete runtime cleanup; keep game locked until verified and owner confirms reopening.

## Execution gate checklist
- [x] Audit existing preflight and reset implementation.
- [x] Create non-destructive prepared reset record.
- [x] Restrict privileged full-world reset API calls.
- [x] Install fail-closed backup and integrity execution guard.
- [x] Reconcile player-owned clubs into canonical S1 league universe (all 11 owned; 25 WorldTeams).
- [x] Implement guarded S1 national/WRC/Nations cleanup and regeneration; 150/150 read-only planner checks passed, full live execution intentionally untested pending verified backup.
- [x] Repair reset validation using preparatory checkpoint hashes; mismatch count 0.
- [ ] Obtain and verify restorable pre-reset backup.
- [x] Implement guarded cron snapshot/suspension, inactive-by-default backend maintenance gate and client maintenance lock page; execution remains blocked and not yet published.
- [ ] Execute world reset once with all gates passed.
- [ ] Verify final S1 paused state, financial and entitlement preservation.
- [ ] Reopen only when owner authorizes launch after test.
