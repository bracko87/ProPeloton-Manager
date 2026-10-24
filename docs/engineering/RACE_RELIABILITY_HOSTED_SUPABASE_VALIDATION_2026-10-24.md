# Race Engine Reliability — hosted Supabase test results (2026-10-24)

**Scope:** Isolated ProPeloton Supabase development branch. **Not** production.

## Environment and limitations

- Branch: `race-reliability-validation-20261024`, project `hkpltcppwncifsgwslxt` (created from production with no production data), quoted compute rate **$0.01344 per hour**.
- Supabase reported `MIGRATIONS_FAILED` during automatic replay of the full production schema. The branch itself was reachable, but `public.race_stage_safe_calculation_v1` and the core game schema were initially absent.
- To test the recovery SQL safely, created minimal synthetic tables and a mock underlying final submit function on this **isolated branch**. Tested the **exact proposed** `persistent_race_output_v2_proposal_20261024.sql` and `safe_step_admission_cap_proposal_20261024.sql` against hosted PostgreSQL.
- Confirmed original production submit signatures (read-only) matched the proposed v2 API's delegated signature. **Did not** execute end-to-end real game simulation, replay hashes from live race data, or final hosted Edge-worker orchestration.
- These results supplement (do not replace) the disposable PostgreSQL GitHub Actions checks: [PR #176](https://github.com/bracko87/ProPeloton-Manager/pull/176), [PR #177](https://github.com/bracko87/ProPeloton-Manager/pull/177), [PR #178](https://github.com/bracko87/ProPeloton-Manager/pull/178).

## Hosted execution results

1. **Cross-lease publication:** PASS. Version-2 table and RPCs applied to isolated branch; synthetic SQL suite executed without errors. Lease-A chunk reuse under lease B accepted only with identical bytes; mismatched bytes, wrong-run and stale-lease requests rejected. Missing chunks blocked submission; simulated SQL submit failure rolled back and preserved chunks. Retry produced **1 authoritative simulation** with expected output hash and **0 remaining chunks**; duplicate attempt returned existing authoritative result.
2. **Security:** PASS. `private.race_stage_persistent_output_chunks_v2` has RLS enabled, while `anon` and `authenticated` have no EXECUTE privilege on the sensitive RPCs; `service_role` is explicitly granted execution. Supabase database-linter emits informational `rls_enabled_no_policy` because the table intentionally has no client policies. No client access was added.
3. **Worker admission:** PASS on hosted branch with synthetic claimant. Three valid running claims were allowed; further claim returned `capacity_deferred`, without mutating queued items. Expired lease and completed worker released capacity for subsequent work. The exact proposed SQL patch applied successfully to the synthetic claimant.
4. **Hosted concurrency check:** PASS for the observed ten concurrent deferred claims after the three-slot capacity was filled. The synthetic table was observed to contain **3 running and 29 pending** rows immediately after the first burst; ten additional concurrent calls all returned `capacity_deferred` and none returned `claimed`. This is not a live-engine throughput benchmark; it specifically checks capacity enforcement under simultaneous SQL requests.

## Release decision

- **PASS:** Standalone hosted PostgreSQL behavior of both proposals under synthetic fixtures; permissions and one-time publication logic.
- **BLOCKED:** Full game schema migration replay, representative races at 2x and 12x, Edge Function integration with the entire backend, and comparison against the latest deployed safe-resume worker (live version 74 at test start).
- **DO NOT** deploy these SQL functions or enable `PPM_PERSISTENT_RACE_OUTPUT_V2` / the concurrency cap in production on these results alone.
- Next engineering work: fix/resolve preview migration drift, run realistic representative simulations with privacy-safe seed data, then review staging-to-main release under `AGENTS.md` with explicit approval.
- Supabase preview branch should be deleted following validation to stop hourly charges.
