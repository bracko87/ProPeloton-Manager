# Race Engine V3 — Milestone A Gate 1: complete coupled two-dimensional stages

**Date:** 2026-10-26  
**Technical gate:** **PASS** — all six complete offline full-stage simulations; finish times, 106/168 rider classifications, exact checkpoint recovery.  
**Sporting gate:** **FAIL / NOT APPROVED.** Official race writes **0**. No production engine selector, rider/history data, Game Center, deployment of V3, race clocks, or Supabase changes.

## Purpose: progress measured in deliverables, not numbered batches

Earlier Batches 1–42 proved microfixtures, complete old-model races, and 24-minute full-size 2D pilots. They did **not** prove the newest continuous-lateral 2D solver could finish a whole stage. This milestone implements the actual stage finish contract in the isolated research solver:

1. Derive the finish line from the complete route-segment distances.
2. Mark every rider's crossing within a ten-second movement tick using a linear interpolation fraction. Retain their full-tick trajectory for within-tick 2D collision checking, then remove each completed rider from future movement, lateral reservations and drafting eligibility.
3. Stop the simulation only when every input rider has a unique and finite finish time. Deterministically assign stage ranks and gaps relative to the first finisher.
4. Serialize a checkpoint after the race has progressed beyond 40% of the route; continue it using irregular batch sizes and demand **exact full final-state equality** with the uninterrupted reference.
5. Verify the finish state cannot advance further; forbid player-result writes, live engine import, or clock modifications.
6. For each frozen race, run a steering-disabled control, a steering-enabled control and a two-rider same-row lane swap with everything else identical.

**Important limitation:** the physics still simulates the complete terminal ten-second bicycle sweep and charges work for that tick even when finish crossing occurs earlier in it. The reported *finish time* uses crossing interpolation; finishing rider power/position *at* the finish is not yet fully sub-tick integrated. This must be corrected for sporting fidelity before approval.

## Complete full-distance results

All six cases finished every rider, retained finite W-prime and produced exact complete-result checkpoint replay. The frozen routes are **118.5 km Dordrecht (106 riders)** and **165.8 km Guangxi (168 riders)**. The simulated teams' power and tactics are still synthetic approximations, not an approved sporting benchmark.

| Race | Control | Winner | Winner finish (sec) | Last-rider gap (sec) | Blocked rider-ticks | Completed lateral reservations |
|---|---|---|---:|---:|---:|---:|
| Dordrecht | Steering disabled | r004 | 11,978.646 | 1,163.984 | 112,283 | 0 |
| Dordrecht | Steering enabled | r004 | 11,978.056 | **974.790** | 98,649 | 414 |
| Dordrecht | Exactly two starting lanes swapped | **r001** | 11,951.872 | **1,181.845** | 85,992 | 396 |
| Guangxi | Steering disabled | r003 | 17,609.174 | 952.198 | 278,205 | 0 |
| Guangxi | Steering enabled | **r013** | 17,649.792 | **1,130.839** | 211,989 | 613 |
| Guangxi | Exactly two starting lanes swapped | **r079** | 17,701.395 | **717.813** | 235,487 | 588 |

The first 30-metre geometric gap appeared at **160 seconds** in all Dordrecht settings and **170 seconds** in all Guangxi settings. A geometric 30-metre gap is **not an officially validated breakaway group**.

**Steering versus no steering:**
- Dordrecht: **13,634 fewer** blocked rider-ticks and **189.194 seconds smaller** tail gap.
- Guangxi: **66,216 fewer** blocked rider-ticks but **178.641 seconds larger** tail gap. This is an explicit sporting regression despite improved traffic statistics.

**Pure initial-lane swap, steering enabled in both:**
- Dordrecht: **102 of 106 riders** changed finishing rank; **746 of 5,565 rider pairs (13.41%)** reversed their relative finish order. Winner changes from r004 to r001.
- Guangxi: **163 of 168 riders** changed rank; **3,925 of 14,028 pairs (27.98%)** reversed. Winner changes from r013 to r079.
- Both perturbations exchange **only the lateral starting lanes** of two riders sharing a starting row; their longitudinal positions, tactical commands, rider attributes, W-prime and identity remain identical.

This instability is unacceptable as evidence of calibrated sporting results. A technical stage-completion success is **not** clearance to expose the current 2D model to players.

## Technical verification

- [Milestone A complete-stage matrix — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40356887361): two independent GitHub jobs, six **complete stages**, 106/168 full rosters, source collision/low-reserve regression, interpolated finish microfixture, exact serialized checkpoint replay, production application build. All steps passed.
- [Existing V3 legacy isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40356887282): 51 steps, no failed step and no `##[error]` log line. Its independent route-fidelity check **correctly blocks sporting approval**: World Nations mountain profile declares 1,785 m of climbing but contains 720 m (**1,065 m missing**).
- Guangxi synthetic route still represents **718 m less climbing** than its published reported ascent; real road-width and stage weather are unmeasured and the model's power/physiology parameters are uncalibrated.
- Two Actions artifacts retain complete per-rider results, crossing times, stage ranks, gap seconds, W-prime, full race samples and serialized checkpoint proof. An offline combined ZIP was independently validated. No real historical result records or production data changed.
- Repository diff is confined to isolated `scripts/v3/**`, its dedicated workflow and `docs/race-engine-v3/**`, with no source universal race engine modification. The new 2D source module remains **outside the official race selector**.

## Milestone A status after Gate 1

| Acceptance gate | Result |
|---|---|
| First full 106 and 168-rider 2D stage, terminal result and exact restart | **PASS** |
| Complete rosters and no collision / no W-prime overdraw under test geometry | **PASS under provisional model assumptions** |
| Reasonable independence from a two-rider starting-grid lane swap | **FAIL** |
| Realistic and consistent breakaways, pursuits, group splits and finish times | **NOT PROVEN / NO-GO** |
| Authentic mountain elevation, widths, rider power, tactical phase instructions | **INCOMPLETE** |
| Gameplay integrations: 12 live sectors, real commands, live UI and Game Center | **NOT INTEGRATED** |
| Production sporting authorization | **NOT APPROVED** |

**Next specific work:** calibrate initial grid formation and collision priority, resolve terminal-tick and route-fidelity limitations, and benchmark genuine attacks/chases and breakaway gaps across flat/mountain routes. Do not merge the prototype into player racing before sporting and operational gates pass.

**Decision: Milestone A Gate 1 COMPLETED TECHNICALLY. Milestone A OVERALL STILL OPEN. Milestone B and C not started. SPORTING NO-GO.**
