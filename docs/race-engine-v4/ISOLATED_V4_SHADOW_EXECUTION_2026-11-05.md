# V4 isolated shadow execution — release boundary (5 Nov 2026)

## Decision
Stop the repetitive private historical checkpoint-repair loop. Final read-only
cohort: 12 attempted, 7 valid strict historical replay candidates, 1 invalid
(causal autonomous-group change at an original covered-attack event), 4
unsupported. This is NOT a release pass and is NOT evidence for bypassing strict
replay publication gates.

## Delivered: first executable offline V4 candidate
- `src/race-engine-v4/templateFirstPlannerV4.ts`: deterministic V4 AI template
  selection, preserving human commands; requires an immutable three-game-hour
  lock and verified human/AI ownership.
- `scripts/v4/calibratedPhysicalTransformV4.mjs`: isolated, fixed V4
  peloton/cooperation/energy physics transform. It does not change the
  accepted source file in the repository.
- `src/race-engine-v4/isolatedShadowWorkerV4.ts`: executes a single combined
  V4 input against the isolated calibrated physical engine **in memory**.
  It invokes the unchanged `classifyUniversalReplaySynchronizationForPublication`.
- `scripts/v4/isolatedShadowGateV4.mjs`: fail-closed gate. Only synchronized,
  `full` replay is an isolated-shadows-pass status. `degraded` and `blocked`
  are NOT successes. Output is categorical; no rider data, stage identity,
  original results, private issue strings or raw engine objects.
- `scripts/v4/runIsolatedShadowV4.mjs`: local, private, single-stage offline
  command. Bundles the patched race core into an OS temporary directory,
  supplies a locked race envelope over stdin to a credential-free child,
  validates the categorical result and deletes temporary compiled code.
- `.github/workflows/v4-isolated-shadow-validation.yml`: synthetic-only
  CI; no Supabase secrets, migrations or deployed worker changes.

## Verified automated synthetic end-to-end gate (5 Nov 2026)
[GitHub CI run 42058494214](https://github.com/bracko87/ProPeloton-Manager/actions/runs/42058494214)
completed successfully. The build and external CLI both executed the complete
calibrated V4 physics and template planner with an authoritatively formatted
**synthetic** locked race containing one human team and one AI team:

- `SHADOW_STRICT_REPLAY_PASS`, replay quality `full`.
- Exactly `officialWrites:0`, `productionEnabled:false`.
- No private IDs, raw results, engine objects, DB access or credentials emitted.
- The unchanged source worker-routing regression guard also passed.

This validates the executable offline integration path. It does **not**
approve V4 for an official race or prove historical replay 8/8, realism,
existing production deployment, real-stage lock evidence or sporting fallback.

## Use on a privately controlled machine (NOT a production worker)
Provide an absolute path to a file **outside** the repository containing:

```json
{"input":{"...":"complete UniversalRaceEngineInput"},"options":{"...":"V4Options with authoritative stage lock and team ownership"}}
```

The placeholders above are explanatory, not a runnable race fixture. The
trusted, complete input must be supplied by a future read-only export adapter.

```cmd
node scripts/v4/runIsolatedShadowV4.mjs "C:\\private\\locked-v4-envelope.json"
```

No credentials are passed to the child. The script rejects non-absolute,
repository-resident or oversized files. On non-Windows systems the input
must also have owner-only filesystem permissions.

## Explicitly not delivered yet
1. **Real locked-stage read-only input adapter.** Existing historical snapshots
   do not prove the original lock time and cannot establish a production lock.
   Until a verified live lock is available, do not claim real race acceptance.
2. **Verified end-to-end live-data shadow execution.** A synthetic-only
   compile/rejection test is not a complete real-race calculation.
3. **Production V4 routing/fallback.** Four existing workers are unchanged.
   Their deployed versions have independent Git pins and differ from
   repository copies. Production rollback must be based on the deployed
   artifacts, not blind redeployment from main.
4. **Official V4 race publication.** No stage is opted in; no official results,
   player data, finances, rankings, payouts or scheduler state may be written.
5. **Realism approval.** Strict replay is necessary but not sufficient for
   believable stage outcomes, realistic energy or tactical response.

## Next acceptance sequence
- Run the offline candidate once against one **authoritatively locked**
  read-only snapshot, then a representative terrain set. Record only
  aggregated status and comparisons with preserved baseline, keeping source
  data private.
- Require all eligible shadow candidates to pass strict full replay.
  Inspect physical group identity, catch distance, rider DNF status, energy,
  team orders and winner gaps. No shortcut for the unresolved 7/8 history.
- Add a **separate, stage-ID allowlisted pilot** and engine-source pin,
  matched across runner/pass1/pass2/safe-resume, with verified behavior for
  in-flight checkpoints, failures and sporting fallback.
- Verify worker deployment settings, source pins, execution provenance and
  publication read-back before any owner-approved pilot stage.

No automatic V4 activation, no SQL changes, no worker deployments.


## Real-data readiness audit and fail-closed source gate (5 Nov 2026)

The live ProPeloton Supabase project was queried using read-only metadata
inspection. No functions that perform race processing were called and no
production rows were changed.

- 51 previously locked plan rows, covering 13 distinct stages in 8 races.
- All 51 mark the plan payload immutable, carry matching 32-character
  snapshot-hash references, match their stage/race identities, and show a
  stage-start minus three-hour lock timestamp.
- Those plan snapshots were built between in-game 5 Jan and 16 Feb 2000;
  18 were built at cutoff, 33 within two game minutes after cutoff.
- None of the 13 stages has a matching completed, full structured input in
  public.race_stage_simulation_runs. Most existing run inputs are absent or
  compacted. The old per-team locked plans are NOT sufficient to reconstruct
  the full original race input or prove a full-stage immutable input was
  captured at lock time.
- The hard_rejections field in these payloads is a list of forbidden source
  classes, NOT a list of observed failures; it must not be counted as seven
  actual rejections.

New research-only files:

- scripts/v4/realLockedStageEvidenceV4.mjs
- scripts/v4/realLockedStageEvidenceV4.test.mjs

The pure adapter validates real-style locked plan evidence, authoritative
entry-to-team ownership, and an independently sourced **immutable full-stage
input lock record**. It never accesses the network or database, prints raw
rider details, invokes the engine, or writes race state. It explicitly rejects
ordinary completed simulation snapshots presented as lock evidence. A positive
classification is only V4_REAL_INPUT_CANDIDATE_ONLY: NOT a strict replay pass,
not realism approval, and not live release authorization.

A future trusted read-only export process must establish that the full-stage
input really was persistently captured at the authoritative lock and verify
the associated source evidence and input hash before calling this adapter.
Caller-supplied JSON flags alone are not database proof. If eligible, the
private in-memory envelope can be passed to the existing calibrated offline
runner, but **no eligible real input was available from the inspected sources
in this audit**.

Next actions: identify/build the authoritative full-stage lock export source
without altering current race workers, then execute one private real-input
shadow test, extend to representative terrain types, and only after strict
replay/realism validation consider an allowlisted pilot. Production remains
unchanged and V4 remains disabled.
