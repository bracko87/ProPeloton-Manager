# Race Engine V3 — Batch 40: road-width envelopes and nonclairvoyant passing-corridor lookahead

**Date:** 2026-10-26  
**Research code:** [a041df82](https://github.com/bracko87/ProPeloton-Manager/commit/a041df82be49fa0f6baa2de5a1181cc851063a40), [4c577d42](https://github.com/bracko87/ProPeloton-Manager/commit/4c577d42846810417dec0ea7719dd26732ec5cc3)  
**Status:** ENGINEERING PASS; **SPORTING NO-GO**; OFFLINE RESEARCH ONLY; **0 official writes**.

## Scope and external reference

Batch 39 demonstrated that destination-lane clearance alone does not make a continuously safe lateral bicycle trajectory. Its provisional 1.0 m lane-centre spacing and 0.8 m lateral collision threshold produced **92/888 (10.4%)** accepted 3-tick shadow maneuvers across 24 unmodified reference races.

The 2026 UCI road-racing equipment specification includes **at least 400 mm total handlebar width (outside-to-outside)** for mass-start road events: [UCI announcement](https://www.uci.org/pressrelease/the-uci-takes-important-measures-to-protect-rider-safety-and-health-and/4hnxXGTJRFAAUBHKLtGFQc). The rule does **not** determine the lateral clearance of a moving rider/bicycle, or the width of the Dordrecht/Guangxi roads. The UCI organiser guide's 6 m minimum is for a particular **finishing straight**, and **must not be treated as the general width of a whole road stage**. Accordingly the four profiles below are hypothetical sensitivity parameters, **not calibrated source-stage measurements**.

| Scenario | Assumed total road width | Track centre spacing | Bicycle envelope width | Extra lateral clearance | Collision threshold |
|---|---:|---:|---:|---:|---:|
| Compact | 4.0 m | 0.85 m | 0.45 m | 0.25 m | 0.70 m |
| Batch 39-equivalent | 5.0 m | 1.00 m | 0.55 m | 0.25 m | 0.80 m |
| Wider | 6.5 m | 1.20 m | 0.55 m | 0.25 m | 0.80 m |
| Cautious envelope | 5.0 m | 1.00 m | 0.60 m | 0.35 m | 0.95 m |

Each scenario validates the road-edge margin (at least 0.15 m), centre-track spacing against lateral contact width, bicycle minimum envelope 0.40 m and a **1.8 m longitudinal overlap threshold**. These are discrete research tracks with continuously swept trajectories in shadow mode. The original official and coupled V3 physics continue using their existing unchanged four lane assignments.

## Questions and controlled experiment

**Question A:** Does more physical lateral room increase the share of safe three-tick passing paths without altering the source peloton's forward movement?

**Question B:** Does an **early** (first blocked tick) candidate policy plus a **nonclairvoyant** lookahead reduce the number of unsafe starts compared with the existing persistent three-tick wheel queue?

The lookahead uses only the **already observed** checkpoint, actual current completed speed and rider lanes, and extrapolates every bicycle at **constant speed on its current end-of-tick lane** across a 2-tick reaction period and 3-/4-tick steering period. It tests continuous proximity intervals on those predictions, **never consulting actual future source positions at selection time**. The actual maneuver must still pass each subsequent real source tick's full continuous 2D collision check. A forecast is **only an opt-in veto**, not a reservation held against future riders; no planner can guarantee another rider does not enter the corridor later.

The probe differs from real full-race implementation in three important ways: (i) each shadow is independently reset to the original full race and never contributes alternative motion or energy, (ii) the candidate's longitudinal path remains its original movement during the alternative lateral motion, and (iii) competitor discrete lane changes are interpolated linearly, not continuously controlled by a two-dimensional live pack solver. W-prime mechanical energy is charged in an isolated shadow ledger at 35 additional watts per steering tick, and insufficient W-prime or unsafe collision rejects an attempt.

### Full test matrix

- **Two stages:** frozen Dordrecht 106-rider and Guangxi 168-rider fixtures.
- **Two modes:** W-prime energy-only and experimental default 3-tick finite passing.
- **Three starting grids** × **two hypothetical weather regimes** (frozen or +3 m/s headwind/+2 m/s crosswind).
- **24 full unchanged coupled V3 reference races**, including exact JSON-serialized resume verification for every result and byte-identical original-grid baseline finish under `runCoupledV3`.
- **18 separate shadow configurations per reference**: four assumed geometries × {first blocked vs 3-tick persistent} × {no forecast vs forecast}, plus 4-tick baseline geometry queued tests with and without forecast.
- All shadow attempts observe the first **144 ten-second ticks (24 simulated minutes)** of each reference. Accepted and rejected maneuver events are not alternative race results. Every output retains `sportingApproval: NOT_APPROVED` and `officialWrites: 0`.

## Aggregated full-matrix shadow outcomes (24 reference races)

The denominator below is **maneuvers actually started**, not forecast-vetoed proposals. Forecast decisions can occur on multiple successive ticks and are not statistically independent attempts.

| Research policy | Starts | Completed continuous path | Completion proportion | Actual 2D collision rejections | Forecast veto decisions |
|---|---:|---:|---:|---:|---:|
| Baseline 5 m; persistent 3-tick queue; no lookahead | 888 | **92** | **10.4%** | 755 | 0 |
| Baseline 5 m; persistent queue; lookahead | 697 | 83 | 11.9% | 578 | 583 |
| Baseline 5 m; **early** candidate; no lookahead | 850 | 110 | 12.9% | 697 | 0 |
| Baseline 5 m; early candidate; lookahead | 690 | 101 | **14.6%** | 542 | 573 |
| **Wider 6.5 m**; persistent queue; no lookahead | 874 | **109** | **12.5%** | 723 | 0 |
| Wider 6.5 m; persistent queue; lookahead | 744 | 99 | 13.3% | 608 | 431 |
| **Wider 6.5 m; early + lookahead** | 724 | **123** | **17.0%** | **552** | 429 |
| Cautious envelope 5 m; queued; no forecast | 894 | 80 | **8.9%** | 773 | 0 |
| Existing-width, 4 steering ticks, no forecast | 878 | 62 | **7.1%** | 776 | 0 |
| Existing-width, 4 steering ticks + forecast | 641 | 50 | 7.8% | 555 | 742 |

The remaining eight configurations and every source rider's classification are in the four full JSON artifacts. An early forecast can **raise a conditional completion percentage while starting fewer maneuvers**. For example, on the existing-width early policy the forecast **reduces** completions from 110 to 101; queued 5 m passes drop from 92 to 83. This is **not an unqualified gain**. The wider 6.5 m geometry raises accepted queued 3-tick attempts from 92 to 109, but still rejects 723 by actual swept-path collision. The strongest combination tested (wide, early, forecast) still rejects 552 of 724 starts.

The 4-tick scenarios perform worse in absolute completions. Extending maneuver duration increases how long other riders can move into a route; it does not eliminate the collision problem.

### Selected original-grid, frozen-weather comparisons

| Frozen stage and mode | Baseline 5 m queued (accepted/started) | Wider 6.5 m queued | Wider 6.5 m early + forecast |
|---|---:|---:|---:|
| Dordrecht energy | 0/42 | 1/42 | 4/29 |
| Dordrecht finite passing | 5/34 | 7/33 | 7/27 |
| Guangxi energy | 2/41 | 3/40 | 4/33 |
| Guangxi finite passing | 4/36 | 4/36 | 3/30 |

The last row demonstrates the improvement is **not universally monotonic**. Cross-grid and synthetic weather details are retained in JSON, including forecast-veto counts, continuous collision failures, W-prime charges, first 30 m separation of the reference race and unmodified full-race finish list.

## Engineering verification

- [Batch 40 four-job research CI — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40345258622): all 24 unchanged full races, a dedicated unit suite for valid geometry margins and 400 mm lower envelope, nonclairvoyant predictor, mid-tick collision detection, exact shadow JSON snapshots and charging, every full-stage control checkpoint, and `npm run build`.
- [V3 legacy isolation — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40345259043): inspected 51-step job, **zero failed steps and no GitHub `##[error]` entries**. Known route-fidelity sporting rejection remains: World Nations Hilly/Mountain route has **1,785 m declared ascent vs 720 m represented, 1,065 m missing**. The frozen Guangxi proxy still misses 718 m reported ascent.
- Code changed **only** `scripts/v3/roadWidthLookaheadV3.mjs`, `scripts/v3/verify-batch40-road-width-v3.mjs`, `scripts/v3/audit-batch40-road-corridors-v3.mjs`, `.github/workflows/v3-batch40-road-width.yml`, plus this report; **no** `src/race-engine-v3/`, game clock, scheduler, historical results or DB changes.
- Full GitHub Actions JSON evidence is retained for 30 days, one artifact per fixture/mode, each with 6 reference results × 18 isolated shadow arms, all four geometry values, forecast decisions, failures and unmodified finish classifications.

## Decision and Batch 41

**Engineering PASS; sporting NO-GO.** There is strong evidence that geometry width and proactive lookahead affect **whether a speculative 2D route clears**. But even at the widest hypothetical parameter, more than 80% of starts fail continuous collision checks. The advance forecast merely screens, and cannot reserve space or coordinate competitors. We still have **no dynamically integrated altered peloton**, no race-gap evidence from the passing policy and no validated course-by-course road widths.

**Batch 41 priority:** independent finite two-dimensional lane-reservation state that coordinates competing bicycles across multiple ticks rather than only retrospectively rejecting shadow paths. Calibrate route width and actual bottlenecks per source segment; use power/energy and steering effort from the real coupled W-prime research state. Run true offline A/B full races under safe contact constraints, exact checkpoint recovery and repaired climbing source data before any consideration of production routing.

**No sporting activation; zero official writes.**
