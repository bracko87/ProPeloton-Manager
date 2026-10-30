# V4 Phase 3 — private historical export and seven-second acceptance gate

2026-10-30. **No V2 changes, no production writes, no public historical snapshots.**

## Stronger real historic diagnosis (Supabase SELECT-only)

Of the 413 completed road-race runs with intact original input and full saved result, 202 recorded a MAXIMUM breakaway gap between 6 and 8 seconds. Exactly **199 recorded 7.00 seconds** (rounded to 0.01 second). The remaining three were 7.05, 7.24 and 7.95 seconds. Every one of the 202 races contained a nonempty accepted opening breakaway (mean 3.48 riders). Only 44 of these 202 races report synchronized replay. In contrast, 77 other races recorded no opening breakaway and correctly had a zero maximum gap. Therefore the seven-second value is not explained by a race with no attacks and deserves a targeted physics/root-cause investigation.

A future V4 acceptance gate must examine a sufficiently large sample of physically accepted attacks across terrains. Detect whether their maximum gaps cluster at 7 seconds; check break duration, gap trajectories, chase/catch mechanism and replay synchronization. Avoid replacing a 7-second constant with any artificially enforced gap. Sample comparison with the current V2 solver using identical locked inputs is mandatory.

These figures are HISTORICAL V2 observations, NOT measurements of V4 reruns.

## Private historical snapshot export (new)

The script scripts/v4/privateHistoricalExportV4.mjs reads exactly ONE completed road stage. It makes SELECT calls ONLY to the existing race_stage_simulation_runs and race_participant_teams_v1 Data API tables, then returns a private file under the operating system's temp directory with filesystem permissions 0600. It never posts or uploads results, never calls an RPC or an Edge function, and never modifies historical data.

The script **fails closed** on:
- absent or multiple completed runs for the same stage;
- archived/compacted/missing input or result;
- unlocked or mismatched stage plans;
- incomplete, duplicate or conflicting historical race-team-entry mappings;
- conflicting authoritative AI classification versus saved AI marker;
- wrong Supabase origin (only the pre-existing ProPeloton project is accepted);
- missing read-authorized credential.

It NEVER infers a team is human merely because it has no player commands. It NEVER falls back to snapshot flags when an authoritative race entry ID is missing. The 72 previously identified unmappable archived road stages remain excluded. All human/AI identities are sourced from historical original race entry records.

### Operator-only local steps

Use a trusted private machine, never a shared/public CI job. First install existing project dependencies with npm ci, then set these environment variables locally:

    PPM_V4_RESEARCH_URL=https://okuravitxocyevkexfgi.supabase.co
    PPM_V4_RESEARCH_READ_KEY=(a locally configured read-authorized credential)

Do not paste credentials into chat or version control. Prefer a dedicated least-privilege, SELECT-only research credential when available. The script itself only performs reads, but a privileged key can have broader permissions and must be protected.

Find a candidate stage ID through a SELECT-only SQL query in the authenticated Supabase console (no names/rider data needed):

    select stage_id
    from public.race_stage_simulation_runs
    where status='completed'
      and input_snapshot_json ? 'riders'
      and input_snapshot_json #>> '{stage,stageFormat}'='road_race'
    order by completed_at desc
    limit 20;

Run the exporter locally:

    node scripts/v4/privateHistoricalExportV4.mjs STAGE_UUID

It prints the PRIVATE absolute path plus counts and an opaque stage token, not rider details. The envelope is written OUTSIDE the repository and must not be committed, attached to GitHub issues, put in Actions workflow artifacts, or pasted into chat.

Bundle the already-created offline comparator and run it locally on that private file:

    npx esbuild src/race-engine-v4/historicalCompareCliV4.ts --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/ppm-v4-history.mjs
    node /tmp/ppm-v4-history.mjs /PRIVATE/EXPORTED/STAGE-FILE.json

Use equivalent paths on Windows. Remove the exported file and temporary comparison bundle after the test.

The historical comparator reports aggregates and SHA-256 hashes, including stored-V2 versus current-V2 reconstruction parity, V4-versus-current-V2 gap and finish differences, accepted attacks and replay synchronization.

**Important historical lock caveat:** the saved stage plans are locked, but the actual old game-time cutoff is not recorded. This retrospective test reconstructs start-minus-three-hours for **research only** and explicitly labels the lock timing unverified. Live V4 stage preparation must never rely on this shortcut.

### CI

V4 physical research workflow executes the exporter safety tests using 100% synthetic records with mocked Data API calls (zero network requests). It checks locked input, authoritative control mapping, project restriction, archived stage rejection, no unapproved writes, private file mode 0600 and cleanup. The same workflow compiles/runs the original V4 physics tests and the unchanged production React build.

A 36-seed synthetic current-V2 versus V4 input comparison also measures the exact-seven-second phenomenon without touching production tables; report its real outcomes from CI rather than assuming they pass a future physical realism threshold.

## Completion boundary

This milestone delivers verified historical baseline evidence and a private safe data path, but **no real completed production snapshot has yet been physically rerun through V4** because a private local authenticated export execution environment has not been provided. The research result must not be called a validated historical V4 win until private export+comparison actually executes. Live shadow mode and V2 replacement remain explicitly out of scope.


## Verified 36-seed physical diagnostic

[CI execution 41032953726](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41032953726) — physical test, synthetic history comparator, exporter guard tests and unchanged production React build all passed their validation harness. The 36-seed race-physics test has **unresolved physical errors** described below; successful CI execution is NOT physical acceptance.

The tests use 36 synthetic 24-rider flat races (4 teams, 6 riders/team, 2 human and 2 AI) with identical rider fields but two tactical inputs: original V2 with neutral AI, versus V4-generated AI instructions added to the same locked human commands. No historical private data is used.

| Measurement | Current V2 baseline | V4 AI-planned |
| --- | ---: | ---: |
| Synthetic seeds | 36 | 36 |
| Completed race calculations | 36 | 31 |
| Races with accepted breakaway launches | 0 | 18 |
| Exact 7-second maximum breakaway gaps | 0 | 0 |
| Races with maximum gap over 60 seconds | 0 | 18 |
| Median maximum gap in races with accepted escapes | n/a | 715.559713 seconds |
| Replay synchronization exceptions | 0 | 5 |

The five V4 errors are each of type front_group_transfer_without_physical_transition and occurred on seed indices 2, 16, 28, 30 and 33. They indicate that V4 AI tactical pressure exposes an existing V2 solver/replay transition weakness. The research harness records and counts these failures independently; no failing case is silently treated as a successful run.

A 13.9% exception rate (5 of 36) and maximum gaps near 12 minutes require further examination. They are NOT proof V4 produces plausible cycling races. The V2 baseline in this synthetic setup had no accepted escape, so the absence of 7-second gaps in this test cannot disprove the historical exactly-seven-second defect. Physically valid V4 races need broader terrain/field/seed coverage, gap growth and catch timing evidence, and zero unexplained replay failures before official shadow promotion.

This is diagnostic research only. No live race was recalculated, no production writer was invoked, and no historical results or Supabase database contents were changed.
