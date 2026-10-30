# V4 — Automated private historical physics pilot

## Verified read-only database inventory (30 October 2026)

The 40 latest completed production simulations contain 36 road races (10 flat, 20 hilly, six mountain) and four time-trial/prologue stages. All 40 have a saved original result object, locked-stage-plan array and stage-start timestamp. Six snapshots have an anomalous count of teams equal to riders. They must be excluded unless authoritative original team entries can be proven. These inventory counts are NOT V4 recalculations.

## Operator-only local execution

From a trusted local ProPeloton Manager repository copy, install existing dependencies with npm ci. In your private OS environment, configure:

    PPM_V4_RESEARCH_URL=https://okuravitxocyevkexfgi.supabase.co
    PPM_V4_RESEARCH_READ_KEY=(locally configured read-authorized credential)

Run one command from the repository root:

    node scripts/v4/privateHistoricalPilotV4.mjs

Do not paste credentials, stage snapshots, rider data, or local envelope paths into chat or GitHub Actions. Prefer a dedicated least-privilege SELECT-only credential.

The pilot fetches only up to 250 recent completed-stage metadata rows (IDs, timestamps, terrain, stage format) in one SELECT request. It groups and validates these locally; aims for four flat, four hilly, four mountain and one cobbled road race; and limits export probes to 18 per terrain. It never silently changes a missing category to another terrain.

Each candidate is passed through the existing strict private exporter (completed run, full locked original input and output, authoritative team-entry AI/human mapping). Anomalous teams over 40, absent/mismatched mapping, compacted snapshots and unsupported formats fail closed. Export is SELECT-only and uses temporary, owner-only OS files. An owner-only manifest drives three isolated physical calculations on identical input: preserved V2, V4 combined, V4 combined+energy. All temporary manifests and exported snapshot directories are deleted on both success and failure.

Output is aggregate-only: shortlisted metadata counts, export attempts, accepted/rejected counts and the physical runner's terrain-specific results. No race identity, name, command input, individual classification or path is printed. Public CI runs a mocked synthetic test, never real historical snapshots or credentials.

## Strict interpretation

- Valid source snapshot does not mean a valid historical V4 comparison. The current V2 baseline must reproduce saved V2 outputs, and all three replays must pass the unchanged strict validator.
- Experimental V2 solver lanes remain unsupported in this first candidate comparison. They are rejected, not misrepresented as baseline road V2.
- Original three-game-hour lock timestamps cannot be proven from old snapshots. This is a retrospective research caveat, not a live lock exception.
- A zero-size eligible comparison is a failed pilot, not V4 approval. Races that cannot pass source, replay and historical baseline checks remain excluded.
- Even a successful representative pilot is diagnostic evidence only. No V2 replacement, production shadow write, official race recalculation or automatic realism approval is permitted.

Related: PRIVATE_HISTORICAL_PHYSICS_COMPARISON_2026-10-30.md and HISTORICAL_COHORT_PRIVATE_RESEARCH_2026-10-30.md.

## Failure diagnostics (added 30 October)

When every candidate fails input validation, the private physics runner now returns a
diagnostic report instead of stopping with an opaque child-process error. It reports
only counts across fixed, non-sensitive categories: incomplete history, locked input
mismatch, unverified team control, unsupported V2 lane, missing saved result,
invalid replay/physics and missing finish classification. Arbitrary source errors
are grouped as `other`; private text, rider/team IDs, snapshots and paths are
never reported. The operator CLI still exits unsuccessfully for **zero valid
historical comparison triples**. A synthetic test verifies this failed-cohort
path and the explicit absence of production writes.

Read-only representative inventory also verified three archived road races with
105 flat, 154 hilly and 168 mountain riders, complete authoritative team
mapping and synchronized saved V2 replay. Their saved maximum breakaway gaps
are 44.042713, 7.045696 and 300.225158 seconds respectively. These are
observations of **historic V2** and are not proof of V4 behavior.
