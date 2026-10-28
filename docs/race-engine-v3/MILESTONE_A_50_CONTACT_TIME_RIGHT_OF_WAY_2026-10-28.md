# Race Engine V3 — A50 first-contact lane occupancy experiment

**28 October 2026 — engineering PASS, sporting NO-GO, candidate rejected for activation.**

## Scope

Step 49 showed that separately chosen 0.5-second reference trajectories can distort policy comparisons. Step 50 adds one explicit **offline-only** candidate, `trapezoid_contact_time_occupancy`, and measures it against a **shared A44 0.5-second reference** (plus a second shared A46 reference).

The candidate's provisional contact rules are:
1. A single laterally steering lane entrant gives way to the rider occupying the corridor, even if physically slightly ahead.
2. With no lateral steering, a rear rider closing on a front rider yields.
3. If the yielding rider cannot avoid contact by stopping, or both riders steer, both make a conservative concession.
4. First swept contact time determines which conflicting pair or tied group is resolved next. After every alteration, all paths are rechecked, and a bounded A44 all-pair symmetric fallback remains available.

The rules are a **hypothesis**, not an approved cycling sport law or a validated contact-dynamics model. No game code or historical data are switched to this policy.

## Tests and observations

[Successful GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40660807185) checked **40 starting fixtures × four policies × five genuine substep sizes = 800 sixty-second simulations**, plus **40 rider-ID renamings** and **40 lateral mirror simulations**. Every accepted trajectory was swept-collision-safe, mechanically energy-accounted, nonnegative in W-prime, deterministic under serialized midpoint replay, and based on unchanged submitted commands. ID and mirror mismatches: **zero**.

The original source contact cases are separately classified using A44's frozen proposals, since a new candidate may divert earlier and never encounter the exact later collision. At baseline 5m, r004 (steering, ahead) yields to r005 (occupying the corridor) at first-contact fraction **0.052632** near 51s. At wide 6.5m, the same pair is classified similarly at fraction **0.105263** near 51.5s. The cautious 5m / 32-rider cases at 22s and 22.5s contain several competing unilateral steering, straight and parallel steering conflicts.

## Common-reference failure

All positional deviations are relative to the **same** A44 half-second result for each fixture, not the candidate's own reference:

| True physical step | A44 worst x / m | A50 worst x / m | A44 pair inversions | A50 pair inversions | A50 conservative fallbacks |
|---|---:|---:|---:|---:|---:|
| 0.5s | 0 | 195.191 | 0 | 871 | 12 |
| 1s | 103.667 | 259.766 | 347 | 903 | 23 |
| 2s | 143.535 | 276.739 | 429 | 982 | 31 |
| 2.5s | 166.014 | 293.184 | 511 | 1,076 | 21 |
| 5s | 136.865 | 323.708 | 608 | 1,196 | 9 |

**112 of 160** nonreference fixture comparisons fail at least one maximum x position, leader-gap or pair-order condition versus the A44 control. At .5s the candidate already changes the entire synthetic race substantially, rather than only repairing the two known coarse-grid conflicts. Its use of earliest-only local pair changes and repeated mutual concessions can propagate across a multi-rider field; the mechanism needs direct causal testing.

The direct invariants and safety tests therefore **PASS**, but the candidate's numerical/sporting performance **FAILS**. It is **rejected for sporting activation** and retained solely as opt-in research. The existing A44/A46/A47 candidates and the default solver were not changed.

## Next

A51 should directly trace first causal pair decisions, connected conflict components, and counterfactual movement changes, without inferring sporting correctness from summary inversion totals. The current experimental solver is limited to 32 riders, not full 106/168-rider race fields. Calibration of road geometry, energy, drafting, gaps and full stages remains outstanding.

**A2 sporting NO-GO; B/C NOT STARTED. No live-race, official-results, database or clock changes.**
