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


## Next source milestone: private lock-window reconstruction (research-only)

The existing production payload routines are not read-only:
- public.universal_race_stage_get_calculation_payload_v1 records survival heartbeats.
- public.universal_race_stage_get_calculation_payload_full_v1 invokes
  jersey eligibility/mandatory supply operations and stage-points sync.
Do **not** invoke either from an offline V4 read-only export.

scripts/v4/privateReadOnlyLockedCaptureV4.mjs implements a separate capture:
- Operator-only PostgreSQL session with dedicated **non-superuser,
  NO-BYPASSRLS and SELECT-only** login named
  v4_live_shadow_read_login; never use service_role, worker secrets or
  postgres admin credentials.
- BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY.
  Verifies the active role and the STABLE signatures of all called RPCs.
  Hardcoded SQL SELECT statements only. ROLLBACK followed by disconnect.
- Requires an official road-stage start time and a game clock between the
  exact three-game-hour cutoff and five game minutes later.
  Any missing stage lock evidence, ambiguous human/AI ownership,
  unverified team mapping, changed source signatures or incomplete input
  rejects the capture. No production writes.
- Reconstructs the V4 input using the existing local pure production
  input adapter. Captured input is only passed through a private mode-0600
  temporary file to the already isolated, credential-free V4 physical
  shadow runner. The file is deleted even after a runner error. Only
  categorical safe status escapes to the output.
- Source classification is
  V4_READ_ONLY_CAPTURE_RECONSTRUCTION_ONLY, **distinct** from
  V4_REAL_INPUT_CANDIDATE_ONLY for a genuinely stored immutable full-stage
  source. Lock-window reconstruction alone does NOT prove that all
  production inputs were persisted at cutoff or that it is identical
  to the live runner's jersey, source filtering or scenario selection.
  Even full strict replay means **research only**, never production approval.

This code does not provision database roles, connect to production from
GitHub CI, schedule a capture, or enable race workers. It needs an
independently provisioned least-privilege database reader and an upcoming
stage that actually locks inside the brief capture window before it can
run on real data. Never store credential values in the repository.

The read-only database inventory at game time 20 October 2000 06:38
found two stage cutoffs within the following 24 game hours, but neither
stage had a locked plan yet at that time. This is **not** a real V4
execution result; real capture and sporting parity remain blocked.


## Security gate on dedicated research database reader (5 Nov 2026)

A migration created v4_live_shadow_read_login with narrowly scoped table
SELECT grants, function EXECUTE grants for the seven approved read helpers,
and SELECT-only RLS policies for the race source tables. Verification showed
INSERT/UPDATE/DELETE false on all directly granted tables; no official
simulation results or publication privileges were granted.

**The reader is deliberately NOLOGIN and has no password.** A subsequent
security inventory discovered that PostgreSQL PUBLIC function grants expose
additional privileged routines in the database to this role
despite its narrow direct table grants. This is a broader pre-existing ACL
condition. Do not solve it by blindly revoking PUBLIC function grants:
that could break live game RPC access. Do not set a password, enable LOGIN,
or send production credentials into the V4 test path.

The private V4 capture now also checks that its actual active reader has
**zero** callable VOLATILE SECURITY DEFINER functions. Otherwise it fails
closed before selecting any race inputs. A login is not equivalent to
read-only merely because default_transaction_read_only=on, since a session
can override that default. The explicit REPEATABLE READ READ ONLY
transaction is still required even after function permissions are fixed.

Next safe step: privately audit the inherited callable routines and their actual PUBLIC ACL
dependencies, then design a credential-isolated export mechanism that
does not require changing live function ACLs, or prepare a separately
reviewed, non-disruptive permission migration. This is not an invitation
to broadly revoke privileges or deploy V4. No real V4 shadow race has been
executed yet.


## Credential-free administrator mediated read-only SQL export

A safer path is now available without enabling a new LOGIN or changing live
PUBLIC function grants. The trusted Supabase admin connection begins an
explicit REPEATABLE READ READ ONLY transaction, switches **locally** to the
NOLOGIN V4 research reader, runs only fixed SELECT statements, and rolls back
before returning. The admin's role membership was narrowly extended to permit
SET ROLE, without granting login or inheritance to the research account.

Read-only production verification completed:
- Effective database role: v4_live_shadow_read_login
- Authenticated session role: postgres
- Transaction state: read_only=on
- Stage and plan SELECTs were accessible.
- A road-stage source check returned 176 rider and 176 phase-command rows
  with matched participant data, with no writes.
- A later flat-road stage had an available profile and Phase 9 data, but
  its 24 plans were submitted, **none persisted as immutable locked**.
  Thus no private rider payload was exported.

New research-only files:
- scripts/v4/adminReadOnlyStageCaptureV4.sql
- scripts/v4/adminReadOnlyStageExportV4.mjs
- scripts/v4/adminReadOnlyStageExportV4.test.mjs

The SQL source is an owner-invoked template: an exact stage UUID is inserted
only after validation, and the query itself rejects unqualified lock timing,
missing locked plan snapshots, absent accepted team rows, unsupported formats
and disqualification cases. If ineligible, only counts and categorical status
return, with bundle=NULL; no rider payload is returned.

When a real eligible stage exists, the private SQL result's capture_result
JSON must be kept in a mode-0600 file **outside the repository**. The new
offline CLI can validate this input, build the race from the original local
pure production adapter, run the existing calibrated isolated V4 runner,
delete its temporary envelope and emit only sanitized status. The operation
does not produce or publish official race outcomes and does not certify
original persistent production-source identity.

An important separate source issue remains: all 1,078 September–October
stage plans examined are still status=submitted, without immutable locked
plan snapshots. The 51 historical persisted locked plan rows are older.
A persisted three-hour cutoff record and full input provenance must be
verified or built before this strict export can yield an official-lock
research candidate. Do not silently treat submitted records as locked.
No live production V4 processing was enabled.


## Forward-only V4 immutable research source sidecar

A new **private** database storage definition is in
scripts/v4/sql/v4_research_only_stage_source_lock.sql.

Read-only source audit (5 November 2026):
- Production game clock remains **paused** on game day 20 October 2000 at 06:38 UTC.
  Do not unpause it for research; no future lock should be fabricated.
- All 3,619 submitted general-stage plan rows have non-empty, **not immutable**
  engine_stage_payload_json values. These encode other competitions, mainly
  national championship (3,506), Nations Cup (71) and world road
  championship (42). The old research lock builder returns
  "already_snapshotted" on any non-empty payload, and its due finalizer
  requires an empty payload. It also has no active scheduling job.
  Do not overwrite other competitions' engine metadata merely to satisfy
  the old research locking check.
- Upcoming standard road-race entries exist with accepted team/rider source
  rows but often **no saved team plan**. Their human/AI ownership must be
  checked from authoritative entries, never guessed.

The sidecar creates a private RLS-protected table, a never-update/delete
trigger and an admin-only SECURITY INVOKER capture function. The capture
requires an explicit REPEATABLE READ read-write administrative transaction,
unpaused authoritative clock, stage format and terrain eligibility, a
cutoff equal to stage start minus exactly three game hours, a capture no
more than 15 game minutes beyond cutoff, no completed stage, no prohibited
disqualifications, source row completeness, and unique team/rider ownership.
It stores a SHA-256 hash and a full **research-only** snapshot of original
rows, without touching the original race-stage plans, riders, results,
workers, season clock or any sporting state. This is a separate immutable
research capture, **not an authoritative production stage lock or proof of
parity** with production scenario selection and mandatory jersey processing.
A future rollout still requires independent production lock provenance.

The function has no cron job. The stage-source data table is private and
intentionally not accessible to public application API roles. The actual
first capture remains blocked while the game clock is paused and no
eligible stage has passed its cutoff. It is inappropriate to bypass the
clock or populate the table with retroactive stage data.

Operator-only dry-run (never supply a historical/started stage):
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT private.v4_capture_research_locked_stage_source_v1(
  '<future-stage-uuid>'::uuid, true
);
ROLLBACK;

Do not pass private captured rider data into GitHub, chat logs, or public
CI. Any subsequent research replay must use a private offline bridge.


## Offline replay of immutable private V4 research sidecars

The replay bridge is scripts/v4/privateResearchSidecarReplayV4.mjs and the
trusted SELECT template is scripts/v4/sql/v4_private_research_sidecar_export.sql.

For an approved, **already captured** stage:
1. Generate the fixed SQL using the CLI with --sql and the stage UUID.
   Run it with an existing trusted Supabase admin connection. The query
   uses REPEATABLE READ READ ONLY and independently verifies the stored
   SHA-256 of the PostgreSQL JSONB serialization.
2. Save only the private_capture JSON object to a protected mode-0600
   file **outside the repository**. Never paste rider data, source input
   or credentials into chat, GitHub, CI or public logs.
3. Run the CLI with --run and the absolute filename. It independently
   verifies the exact source bytes/hash, stage ID/time, pre-start cutoff,
   duplicate team/rider controls and authoritative AI ownership. The
   pure production input adapter builds the input for the existing
   isolated calibrated V4 physical runner. The temporary engine envelope
   is always removed and only sanitized categorical results are printed.
4. Even if strict replay succeeds this remains **research only**:
   production parity and original official production locks remain unverified.

At the paused game clock 20 October 2000 06:38, the next upcoming
ordinary road-race candidate starts at 11:15 game time, with cutoff
08:15. It has 18 accepted AI-controlled teams and no human saved-plan
requirements. The game is paused, so no real capture has happened.

No capture scheduler or official-race worker was changed. Future
automation requires a separate reviewed research-only change.


## One-stage automatic research capture watch (5 Nov 2026)

The active experimental pilot is scoped to exactly one normal hilly road stage
in-game 20 October 2000 at 11:15 UTC, with cutoff 08:15:
stage ID c7800ffd-f417-4feb-8a66-b928551daa4d. The limited source
preflight in a restricted READ ONLY transaction checked:
18/18 uniquely identified accepted AI teams, 108 unique riders,
108 complete rider source inputs, 108 complete phase-command rows,
zero missing/duplicate rider IDs, and object stage profile/Phase 9 payload.
There are zero saved human-stage plans, as this entire field is AI.

Supabase pg_cron was verified with a disposable every-30-seconds
REPEATABLE READ transaction probe that succeeded; the probe was then
unscheduled and removed. The production game clock remains paused at
20 October 2000 06:38 UTC; no first real V4 run has occurred.

A new one-stage-only, per-real-minute research watch is defined in:
scripts/v4/sql/v4_single_stage_private_research_capture_cron_20261105.sql

It calls only the approved SECURITY INVOKER private sidecar function inside
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE, and never
calls live race processing or writes a stage result. It does not change the
clock. The sidecar itself rejects a paused game, premature/late cutoff,
already-completed stage, missing source, ambiguous identity and other unsafe
conditions. If successful it stores only one private immutable research
source, not a new official race plan lock. The scheduled job checks
the original stage date/format/terrain/time, then self-unschedules if
the source was captured, game race start is reached, stage metadata changed,
or the real date reaches 8 November 2026 00:00 UTC. A CLI/PR run does not
export rider data to GitHub. The watch can be manually removed at any time
by: SELECT cron.unschedule('ppm-v4-private-capture-c7800ffd-20261105');
Only this new research job is affected.

Any original race plan, race timing, startlist, standings, finance or workers
must remain untouched. The resulting snapshot, if any, is research data;
the separately isolated V4 replay bridge must be invoked in private with
the hash-verified source. This is **not** approval to enable V4 live.
