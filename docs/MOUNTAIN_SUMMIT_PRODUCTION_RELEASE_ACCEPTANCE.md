# Mountain summit engine — controlled production acceptance

## Scope and immutable source

- Primary race engine + input and output adapters: Git commit `16d240ccd8a2d4351f8abae014d6cedd10c1b24c`, containing October 20 summit-splitting acceptance work (#154 / integration #155).
- Four production paths are coordinated: `universal-race-stage-runner`, `universal-race-stage-pass1-resume`, `universal-race-stage-pass2-resume`, `universal-race-stage-safe-resume`.
- Existing emergency V5.2 fallback engines remain intentionally unchanged for recovery. **A fallback result is not a successful verification of new summit physics.**
- This release contains **no SQL changes and no historical result updates**. Do not rerun or overwrite completed official stages. Do not call worker `tick`, `resume`, `claim`, or administration endpoints as a deployment smoke test.

## Pre-release acceptance gates

1. Review PR to `main`; confirm repository build, `scripts/verify-summit-worker-pins.mjs`, Edge entrypoint bundling/syntax check, focused summit calibration, existing full-physics French Tour tests, replay gate, and World Nations simulations.
2. Inspect the full legacy test logs (the legacy workflow step is nonblocking). Record actual pass/fail totals, not just green overall workflow status. The earlier accepted PR #154 reported **557/557** tests passing; do not assume a new release has that same result without checking.
3. Check production race operations for active calculations. Deploy only in a quiet window, do not interrupt an in-flight simulation; preserve existing auth, environment and import map settings.
4. Supabase Edge Function deployment is **independent** of Netlify. Deploy the four functions using the reviewed GitHub source, with no accidental swap of emergency fallback SHA references.
5. Fetch the live deployed function files afterwards to verify all four primary imports, `SOURCE_COMMIT`, function version, JWT behavior and import maps. If any worker differs, mark release **blocked** and roll back appropriately; do not claim success.
6. Check function logs for import, CPU deadline, timeout and fallback issues without triggering any race operations.

## First live candidates

| Candidate | Stage ID | In-game date | Purpose |
|---|---|---|---|
| Tour of Poyang Lakes Stage 1: Lushan → Lushan Mountain | `eeab7fdd-469d-42c4-a09d-6914518b1fd5` | 2000-09-15 | 132-rider field; general mountain climbing and physical gap handling. **Not** summit feature flag because stage is currently marked `flat_finish` with last KOM at km 84 / finish 88.6. |
| Trofeo Tessile & Moda: Valdengo → Oropa | `0885f370-5082-4bbe-994f-3938f00b7b11` | 2000-10-12 | Formal summit-finish test (final Cat 1 climb, 6.7 km at 7.9%). Confirm a representative race field before start. |

Game clock speed is currently 12×; do not hard-code real-world hours without rechecking `game_clock_config`.

## Read-only verification SQL after a stage

The queries below are read-only. Substitute one of the stage IDs above; **never** run a simulation just to populate a result.

```sql
with runs as (
  select r.id, r.status, r.stage_id, r.created_at,
         r.input_snapshot_json #>> '{stage,summitFinish}' as summit,
         r.input_snapshot_json #>> '{stage,summitFinishSelectivityV1}' as feature_enabled,
         r.result_summary_json #>> '{output_snapshot,verification,primarySourceCommit}' as primary_source_sha,
         r.result_summary_json #>> '{output_snapshot,verification,fallbackUsed}' as fallback_used
  from public.race_stage_simulation_runs r
  where r.stage_id = '0885f370-5082-4bbe-994f-3938f00b7b11'::uuid
  order by r.created_at desc limit 1
)
select * from runs;
```

For **Oropa**, the release passes provenance only when the saved input has `summitFinishSelectivityV1=true`, the source SHA is the approved new engine commit, and the actual run did not use an older fallback. Confirm the simulation is completed and official results were published. For Poyang the summit-specific flag is expected to be false; assess general climbing instead.

```sql
select rank, rider_name_snapshot, team_name_snapshot, elapsed_seconds,
       gap_seconds, status
from public.race_stage_results
where stage_id = '0885f370-5082-4bbe-994f-3938f00b7b11'::uuid
order by rank nulls last
limit 40;
```

```sql
select elapsed_seconds, count(*) as riders_in_time_cohort
from public.race_stage_results
where stage_id = '0885f370-5082-4bbe-994f-3938f00b7b11'::uuid
  and status = 'finished'
group by elapsed_seconds
order by elapsed_seconds
limit 40;
```

Review whether the outcome contains physically plausible different times and rider groups, without imposing fake exact gaps or group sizes. Compare final replay rider gaps with official elapsed/gap seconds; there must be no transitive same-time merge spanning a larger physical gap, no phantom summit rejoin, no backward motion and no divergence in rider identities. Verify published GC, points, mountain and stage results load successfully. Check engine-run status and any replay-quality warning. Validate payouts, classification rows and standings remain consistent; **do not rewrite results to satisfy an expectation**.

## Historical baseline — not production proof

Vuelta Stage 14 (`ab19bbe2-0a59-4bc3-b154-d8b4bdadde4f`) and Stage 15 (`928aae3c-9b0c-46ca-a4a2-4bb3b21762c9`) were generated with source `652816a5c04c5de342fd1c45c31ed4f2536775b9` and had no recorded `summitFinishSelectivityV1` feature flag. They must not be used to claim the improved engine is active. Preserve all existing official data.

## Acceptance decision

Mark the release **PASS** only if (a) reviewed CI tests pass, (b) all four production functions are read back with the aligned primary source, (c) no unannounced emergency fallback was used by the target stage, (d) the expected feature flag is present for the Oropa stage, and (e) replay and official finish groups/GC can be reconciled after the real published result. Otherwise keep status **PENDING** or **FAIL**, with evidence and a follow-up fix.
