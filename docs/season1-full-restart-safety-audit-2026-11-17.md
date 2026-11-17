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

1. **Keep every user-owned club**. The old baseline `public.game_world_reset_s1_competition_baseline_v1` has 499 clubs but excludes four live user WorldTeams from Season 1: **Adidas pro Team**, **BK Budva**, **LECO Cycling Team**, **Levsisters**. The old reset would deactivate them. All 11 live player-owned clubs must survive with sensible original Season 1 competitive placements, while preserving league sizes. The S1 final standings include the four missing teams; investigate replacements for stale/deleted AI slots, do not simply append them and create oversized divisions.
2. **National Championships for all countries**. `TRUNCATE public.riders CASCADE` clears `national_championship_editions` and `world_road_championship_editions`. The old core does not rebuild either after regenerating riders. Add an explicit rebuilding phase using the current permanent route eligibility policy, guarantee all 150 countries have valid stages, ensure rider eligibility across the complete national pool, and reject missing/duplicate championships. The old Season 1 calendar's historical `missing_route` statuses must not be recycled as truth.
3. **Fix stale validator hashes**. `game_world_reset_validate_core_v1` embeds hashes for older `season_transition_engine_execute_v2` and `verify_new_season_fresh_state_v1` functions. Current definitions differ, so the old validator will incorrectly reject even an otherwise good rebuild. Compare against audited function hashes captured at prepare time rather than obsolete hardcoded versions. Keep validation fail-closed if definitions change during the restart.
4. **Backup and recovery**. Confirm a restorable database backup **taken before the reset** in Supabase Dashboard > Database > Backups (including any point-in-time recovery capability) and record a reference with the prepared run. A generic count report or reset checkpoint is **not a complete database backup**. Do not proceed with the live wipe until verified.
5. **Operational maintenance gate**. Before freezing, ensure normal players cannot write gameplay data and no race-engine, game-clock or other cron/edge worker can race the reset transaction. Record precisely what is disabled and restore only after validation.
6. **Complete reset audit**. Check clean Season 1 01:00 paused state; no S1/S2 results, ranking points, fatigue/progression or stale simulation snapshots; 150 valid national championship editions plus valid future world championship; correct world/pro/continental/amateur slots; original accounts and entitlements preserved (including coins/purchases and Premium); fresh finance, sponsored club objectives and 10-player user/15-player AI starting rosters; correct current and previous timeline visibility; no pending future deliveries; job clocks rebased; no foreign-key/trigger fallout.

## Source facts
- S1 competition snapshot: 525 club rows, 29 national/technical identities, 496 true sporting clubs, including all 11 currently active user-owned clubs.
- Legacy reset baseline: 499 club rows, including stale AI clubs and **missing the four player WorldTeams**. Do not assume it is current or complete.
- Current permanent national-route library: 150 Season 2 national editions report valid routes. After a full rider regeneration, re-run the all-country route and eligibility audit for Season 1 independently.
- The old world reset previously completed in August but also has several failed historical attempts. Past success does not establish compatibility with the November schema.
- Old reset implementation explicitly clears hundreds of thousands of results and rider-linked history; it is destructive and must never be run based on the old `ready_for_reset` flag alone.

## Execution gate checklist
- [x] Audit existing preflight and reset implementation.
- [x] Create non-destructive prepared reset record.
- [x] Restrict privileged full-world reset API calls.
- [x] Install fail-closed backup and integrity execution guard.
- [ ] Reconcile player-owned clubs into canonical S1 league universe.
- [ ] Implement and test S1 national/WRC championship regeneration.
- [ ] Repair reset validation using current safe comparison.
- [ ] Obtain and verify restorable pre-reset backup.
- [ ] Implement and test full maintenance/worker quiescence.
- [ ] Execute world reset once with all gates passed.
- [ ] Verify final S1 paused state, financial and entitlement preservation.
- [ ] Reopen only when owner authorizes launch after test.
