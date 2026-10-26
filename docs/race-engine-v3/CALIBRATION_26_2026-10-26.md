# Race Engine V3 — Batch 26: one-shot lane branch causality test

**Date:** 2026-10-26  
**Implementation:** [eb15df729c309d4c627a22c4083c9930610161d9](https://github.com/bracko87/ProPeloton-Manager/commit/eb15df729c309d4c627a22c4083c9930610161d9)  
**Safety follow-up:** [6e112e9935454c6413435a9b3aa7bcd8fa49b31d](https://github.com/bracko87/ProPeloton-Manager/commit/6e112e9935454c6413435a9b3aa7bcd8fa49b31d)  
**Status:** Technical verification **PASS**; sporting approval **NO-GO**, offline-only; no production game engine change, no database writes, no race-clock action.

## Experimental design

- Run the original coupled V3 calculation with the finite W-prime energy model, frozen Dordrecht (106 riders) and Guangxi (168 riders), in two separately seeded modes: energy-only and combined lane/drafting/bottleneck telemetry.
- At the first **safe admissible** lateral maneuver proposed by the existing swept-corridor research planner, fork an identical serialized checkpoint into control and experimental copies. Change **one** rider's lane in the experiment; keep **all** existing longitudinal metres, speed, W-prime, rider fatigue, tactical status, time, and other rider states byte-identical.
- Continue both paired branches with precisely the same input, physics rules, stage route and roster. Compare full finish lists, ranking changes, blocking, mechanical work, and per-rider gaps. The unmodified fork must equal the original uninterrupted full race exactly.
- For Guangxi, independently probe an admissible lateral shift in the frozen steep section (160.8–162.6 km), if available.
- A proposed multi-lane plan that fails the existing spatial collision check is **rejected and counted**, not forced. The combined Guangxi scan rejected 15 unsafe planner proposals; it still found a valid single-rider branch. Do not interpret them as 15 real-world crashes.
- This is a *fixed initial power/energy state* comparison. **Subsequent speed, drafting, exertion and W-prime can diverge endogenously** as a result of positioning. It is not a fixed-watts full-race trial.

## Single early lane intervention — complete race continuation

| Fixture / setting | Intervention (rider, tick, kilometre) | Extra blocked rider-ticks after branch | Last-rider gap change (s) | Mean rider-gap change (s) | Riders changing rank | Mean absolute rank shift |
|---|---|---:|---:|---:|---:|---:|
| Dordrecht energy-only | r006, tick 7, km 0.598330 | +506 | 0.000 | +4.431 | 81/106 | 5.30 |
| Guangxi energy-only | r029, tick 9, km 0.846266 | **−10,541** | −5.139 | **−20.828** | **144/168** | 11.83 |
| Dordrecht combined | r050, tick 9, km 0.779634 | +2,711 | 0.000 | +10.720 | 85/106 | 3.94 |
| Guangxi combined | r098, tick 17, km 1.688219 | **−8,825** | −23.257 | +1.987 | **153/168** | 8.14 |

The large gap and rank redistribution is evidence of **sensitivity to tiny early lateral perturbations**, not necessarily better sport modeling. The per-rider gap changes are partly relative to the possibly changed winner; pairwise rider rankings and absolute finish times should both be assessed.

Maximum absolute individual *finishing-gap* difference from the single early lane shift: **598 seconds** in Dordrecht energy-only, **494 seconds** in Guangxi energy-only, **346 seconds** in Dordrecht combined, and **274 seconds** in Guangxi combined. These large individual changes are a material calibration warning.

### Late Guangxi uphill intervention

One safe single-rider intervention at **160.868157 km**, rider **r141**, tick **1515** (energy-only run), produced:
- Change in last-rider gap: **0.000 s**.
- Change in blocked rider-ticks: **−1**.
- Changed finishing ranks: **0**.
- Mean individual gap difference: **−0.005 s**.

A single late shift cannot undo hours of earlier pack separation; this particular intervention showed negligible field-wide effect. No comparable safe intervention was recorded for combined mode on this segment.

## Validation and artifacts

- [Batch 26 energy-only / combined full-roster paired branches and app build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40302914366).
- [Full V3 legacy isolation and existing race-engine regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40302914363).
- Separate file-level unit checks reject stale lane moves, duplicate riders, invalid separation, or a non-lateral checkpoint mutation.
- Full paired runs verify unchanged checkpoint state beyond exactly one rider's lane, deterministic unmodified branch equal to original uninterrupted full-race output, collision checks, finite recorded energy, complete 106/168 rider finishes, and zero official writes.
- Artifacts: GitHub Actions `v3-batch26-energy-one-shot` and `v3-batch26-combined-one-shot` (30-day retention). Their JSON includes all riders' gap, finish-time, rank and energy deltas and initial checkpoint observation windows.
- The first attempt surfaced `Invalid anticipatory bicycle placement` for Guangxi combined in the *diagnostic proposal generator*. The follow-up explicitly rejects unsafe proposals without changing any race movement or reducing collision validation. Both final workflows passed.

## Sporting decision

**Reject automatic deployment of the single-lane candidate.** It can dramatically change pack obstruction and rider ordering with no physically free initial movement, while the tail-gap metric alone would miss most of the impact. The observation confirms spatial interaction is a major calibration dimension, but does not establish the correct sporting sensitivity.

The frozen Guangxi mountain profile is still incomplete by 718 m of reported climb. Dordrecht maps eight sprint-point orders to tempo and rider power/W-prime remain provisional. These limitations prevent final sporting approval.

### Recommended Batch 27

Study **bounded, continuous rider lane-choice dynamics** and sensitivity under tiny early perturbations, including realistic passing opportunities, traffic density, headwind/crosswind and climb. Measure **full finish-order stability, relative group time gaps, first-separation time, and power/energy opportunity costs**, rather than optimizing only blocked-tick totals or tail gaps. Require no free longitudinal metres on lateral action, collision-safe swept corridor, exact resumed checkpoints, broad A/B across both synthetic fields, full V3 regression and build. Keep official V3 activation and game clocks untouched.
