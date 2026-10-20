# Issue 139 — incident-enabled replay failure, root-cause investigation

## Reproduction
PR #143, CI run 39427782218, seed `audit139-baseline-flat-72-2` (72-rider flat).
The engine throws `same_kilometre_physical_state_mismatch` between `winner-finish` and `final-results`. The incident-enabled 180-run audit is blocked; do not report DNF rates from its incomplete output.
Existing full race-engine suite on the same PR: 555/555 passed, run 39427782004.

## Source trace
- `resolveUniversalPhase10Incidents` gates incidents and OTL on `input.incidentModel?.enabled === true`. Previous audit fixtures omitted it: zero-withdrawal results therefore cannot estimate production incidence.
- `phase10BuildFinalRoadGroups` creates final authoritative grouping from adjudicated classification and physical finish gaps.
- `shouldCommitPhase10FinalRoadStateV16` permits the physical-state commit only at the explicit finish-group-transition event.
- Phase 10's `checkpoint.finalResultsVisible` branch publishes `finalRoad.groups` unconditionally, whereas an earlier winner-finish checkpoint can retain a different physical road group state if no appropriate commit checkpoint exists. The replay synchronizer correctly rejects unannounced same-km state changes.

## Required narrow correction
1. On the failing deterministic seed, log *both* checkpoints' physical groups, lineage IDs, memberships, gaps and commentary, along with incident consequences and the authoritative finalRoad groups.
2. Confirm whether an explicit finish-group-transition checkpoint is missing, out of order, or previously committed to a nonmatching state. Determine exactly which riders differ.
3. If the authoritative Phase 10 final road differs physically, materialize a real, explicitly typed finish-line transition **before** final-results visibility and ensure all subsequent finish-km checkpoints retain its physical state. Never silently reassign groups only in the final-results display.
4. Preserve V16 guard, no hidden teleports, same-kilometre consistency, finish statuses, official time and GC integrity. Add regression for the exact seed and a no-change finish case.
5. Rerun incident-enabled cohort and full test suite; only merge to staging after green.

No production writes, migrations, replay history rewrites, or weakened assertions permitted.
