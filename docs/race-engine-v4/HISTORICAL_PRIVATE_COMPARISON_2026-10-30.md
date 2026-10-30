# V4 Phase 3: historical production audit and private offline comparison

Date: 2026-10-30. SELECT-only production audit; V2 remains the official engine.

## Verified production inventory

- Completed stage simulations: 1,677. Of these, 1,250 input snapshots are compacted and 427 contain their original full input and saved universal result.
- The 427 intact runs contain 413 road races: flat 114, hilly 222, mountain 75 and cobbled 2.
- All 413 road-race saved stage plans are locked and all 413 have saved finish classifications.
- Stored replay synchronization flags: 207 synchronized, 206 not synchronized. This is PREEXISTING V2 historical behavior; do not blame V4.
- Observed maximum breakaway gap of 6–8 seconds: flat 46/114, hilly 115/222, mountain 39/75, cobbled 2/2; total 202/413. This strongly supports investigating the old seven-second artifact; not every 7-second maximum is necessarily an error.
- Strict archived team-entry ID mapping found 337 all-AI stages and four all-human stages. The other 72 have incomplete historical team-entry mapping; 5,745 participant team rows across those cannot be matched to the authoritative reference. Do not guess their AI/human status. The saved 6,983 positive AI markers agree with matched authoritative AI entries, but this does not repair unmatched identities.
- Historical lock-at-exact-game-time evidence is not stored reliably in the simulation run snapshots. A retrospective comparison can confirm plans were saved as locked, but CANNOT prove their original lock happened exactly three game hours before start.

All observations above came from SELECT only against the ProPeloton Manager production Supabase project. No DB changes or race recalculations were performed.

## Implemented read-only components

1. src/race-engine-v4/historicalComparisonV4.ts — pure in-memory historical saved-result vs current selected V2 vs V4 comparison. Imports existing runSelectedRaceEngineV1, not production workers or database. Rejects incomplete or compacted snapshots and incomplete/conflicting AI/human ownership.
2. src/race-engine-v4/historicalCompareCliV4.ts — CLI reads an owner-provided PRIVATE JSON file outside repository, prints only aggregates and hashes, and never connects to Supabase or writes results.
3. Synthetic historical-shaped regression tests added to physicalResearchProbeV4.test.ts. The V4 physical CI compiles the private CLI as well as testing the original solver.
4. No SQL migrations, public routes, worker changes, production selector changes or official result writes.

## Required PRIVATE envelope and usage

Keep production snapshot JSON private: NEVER commit it to the public GitHub repository, attach it to an issue, or pass full snapshots through GitHub workflow inputs/logs.

Required local JSON shape:

    {
      "status":"completed",
      "input_snapshot_json":{...exact saved input_snapshot_json...},
      "result_summary_json":{
         "stage_start_game_at":"2000-10-19T14:30:00",
         "output_snapshot":{"universalResult":{...exact saved universalResult...}}
      },
      "team_control":[
        {"teamId":"teamId from snapshot","kind":"ai"},
        {"teamId":"another teamId from snapshot","kind":"human"}
      ]
    }

The team_control entries must be derived from the authoritative race_participant_teams_v1 entries joined by each saved team's raceTeamEntryId. They must cover EVERY team. Never infer human identity from a rider having no tactical commands. Missing team records cause a safe rejection.

Build from root:

    npx esbuild src/race-engine-v4/historicalCompareCliV4.ts --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/ppm-v4-history.mjs

Use a private input file (adjust temp paths for Windows):

    node /tmp/ppm-v4-history.mjs /absolute/private/path/stage-envelope.json

The comparator executes the saved input with the CURRENT V2 solver first; this checks whether current code still reproduces the stored historical finish classification. Then it prepares AI-only template-first V4 instructions and executes the SAME current solver, reporting rank/gap changes, physical breakaway maximum, accepted escapes and replay synchronization. Its output contains only hashed stage identity, aggregate counts and SHA-256 hashes.

Do not infer a historical V4 effect directly by comparing against saved V2 when current V2 fails the saved-output reproduction check: that is baseline code/snapshot drift.

### Important historical lock-time limitation

The original historical game-time lock instant is not present in these snapshots. This OFFLINE-ONLY adapter reconstructs a start-minus-three-hour timestamp strictly so the phase-1 research planner can run. It explicitly returns historicLockCutoffActuallyVerified=false and riskWarning=historical_lock_time_reconstructed_not_proven. This research assumption must NEVER be accepted by a future live V4 preparation or production worker.

## Honest acceptance status

The database corpus inventory above is verified against production. The new offline historical comparison module is intended for use with privately exported original run data; NO real production snapshot has been transferred into GitHub Actions or rerun as V4 in this task. Synthetic historical-shaped runs are used to verify code and safely exercise the comparator without leaking real teams/commands. A real private historical V4 calculation is the next required step before any V4 shadow execution in production.
