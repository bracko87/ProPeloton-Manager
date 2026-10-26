# Race Engine V3 — Batch 29: bounded early formation sensitivity

**Date:** 2026-10-26  
**Research implementation:** [73c25368860c3748ef591c94363fc8df310880cb](https://github.com/bracko87/ProPeloton-Manager/commit/73c25368860c3748ef591c94363fc8df310880cb)  
**Decision:** TECHNICAL VALIDATION **PASS**, SPORTING **NO-GO**. Synthetic/offline test only. Zero official writes; no production race-engine source, official racing selector, historical results, database, or game-clock updates.

## Hypothesis and controls

Batch 28 found large sensitivity to randomized neutral starting-grid assignments (30–34% reversed rider pairs in the energy-only configuration). Batch 29 tests whether a **bounded early positioning window** can reduce that initial-condition sensitivity **without** faking gaps, granting forward metres, generating preset groups, or changing watts.

1. Each experimental full race uses the identical fixed roster, synthetic seed, orders, road geometry, power limits, W-prime initialization, and tick rate as its untreated control.
2. During the first **5 km**, once every **four 10-second ticks at most**, the research wrapper may use the *existing* swept-corridor anticipatory lane planner to place **one wheel** in a conflict-free adjacent lane at the end of its tick. The planner evaluates the full preceding tick's bicycle trajectories; the wrapper does **not** grant additional longitudinal metres or change power, reserve, energy, attack orders, speed, or finishing times directly.
3. Research-selected lane changes are skipped at recording boundaries so frame history remains consistent. An unsafe proposal must fail closed. No simulation loosens spacing or swept-corridor validation.
4. Each input is simulated both unmodified and treated, across the original neutral grid, two extra deterministic grid seeds, and an original-grid two-rider lane swap. Two further original/seed-A comparisons use synthetic +3 m/s headwind and +2 m/s crosswind. Each of the four matrix jobs executes 12 full races (**48 treated/untreated simulations in all**), with additional exact unmodified `runCoupledV3` baseline equality checks.
5. Finite W-prime reserve must remain in bounds, every rider must finish, and each simulated research result must carry `OFFLINE_RESEARCH_ONLY`, `NOT_APPROVED`, and `officialWrites: 0`. Checkpoints are also serialized and restored during the run.

**Important limit:** lane positions are discrete integers. The swept-corridor test conservatively assesses the motion path but this is **not yet a continuous physical lateral steering model**. The 5-km convergence window and one-move/four-tick cadence are hypotheses, not empirically calibrated parameters.

## A — Grid robustness before versus after formation assistance

All reversal percentages refer to **rider pairs switching relative finishing order versus the original grid**, independently in untreated and treated models. Lower is more stable. Four calm grid arrangements were compared per row.

| Frozen race / mode | Pair inversions, seed A untreated → treated | Pair inversions, seed B untreated → treated | Distinct winners untreated → treated | Median individual rank range untreated → treated |
|---|---:|---:|---:|---:|
| Dordrecht (106), W-prime energy only | 31.45% → 28.70% | 30.93% → **34.05%** | 3 → **4** | 38.5 → 37.5 |
| Dordrecht, combined lane + draft + W-prime | 9.40% → **12.36%** | 10.96% → 10.08% | 2 → 2 | 10.0 → **13.5** |
| Guangxi (168), W-prime energy only | 32.89% → 27.84% | 34.10% → 31.83% | 3 → 2 | 56.0 → 48.0 |
| Guangxi, combined lane + draft + W-prime | 11.51% → 10.42% | 14.74% → **16.07%** | 1 → **2** | 22.5 → **25.0** |

**Mixed result / NO-GO:** The energy-only Guangxi model benefits substantially. In contrast, the combined model becomes less stable in seed B and produces a different additional winner. Dordrecht W-prime energy-only moves from three to four distinct winners. A rule cannot pass sporting review based on selective improvements.

### Actual paired changes under the same starting grid

Accepted early lateral shifts in calm conditions, across original/seed-A/seed-B/lane-swap: **11/12/11/11** for Dordrecht energy-only; **6/6/7/4** Dordrecht combined; **10/10/11/10** Guangxi energy-only; **6/6/8/6** Guangxi combined. None of these 16 calm runs reported a rejected unsafe planner proposal.

- **Dordrecht energy only:** blocked rider-tick differences after the interventions: **+8,889, +8,452, −10,929, +14,941**. Relative finish order changes between untreated and treated arms reach 13–18% of rider pairs. The net effect cannot be summarized as a congestion win.
- **Dordrecht combined:** blocked rider-ticks change **+286, +2,348, +586, +2,022**. Even 4–7 accepted early shifts consistently increased aggregate blocking in these four scenarios.
- **Guangxi energy only:** blocking changes **−22,631, −11,499, −3,216, −9,980**. The initial grid produces two geometric groups at the first sampled separation point instead of three, but reshuffle B forms a 30-metre split **earlier** (240 rather than 360 seconds). Lower whole-race blocking is not sufficient proof of correct group behavior.
- **Guangxi combined:** blocking changes **−7,084, +17,169, +11,006, +271**. Its lane-swap test delays the first sampled 30-metre separation from 360 to 480 seconds yet reports four groups rather than two at that later sample.

A treatment may materially reorder the entire field even where the measured tail gap barely changes. All group counts above use **first sampled adjacent spatial gaps of at least 30 metres**, not an official breakaway or group-time model. Sampling cannot identify exact onset between snapshots.

## B — Artificial headwind/crosswind robustness

Wind is *hypothetical*, not historical race weather. Rider-pair inversion rates for original versus seed-A starting grids:

| Fixture/mode | Untreated | Formation-assisted |
|---|---:|---:|
| Dordrecht energy-only | 32.99% | **33.75%** |
| Dordrecht combined | 14.56% | 12.52% |
| Guangxi energy-only | 27.34% | 27.03% |
| Guangxi combined | 11.06% | 9.13% |

Even this narrow synthetic wind exercise yields contradictory changes. No wind-specific sporting approval is justified.

## Evidence and verification

- [Batch 29 matrix, 48 full-race A/B experiments, strict lane invariants, frontend build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40309490146).
- [Existing V3 offline legacy-isolation and full-race regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40309490444).
- GitHub Actions archives per fixture and mode: `v3-batch29-dordrecht-2000-10-15-energy`, `v3-batch29-dordrecht-2000-10-15-combined`, `v3-batch29-guangxi-2000-10-19-energy`, and `v3-batch29-guangxi-2000-10-19-combined` (30-day retention). Full JSON includes individual finish-order ranges, grid and wind comparisons, selected rider/tick/lane choices, paired blocked-tick differences, checkpoint metadata, early geometric splits, and full race result summaries.
- Only `scripts/v3/*` and one dedicated workflow changed; **no** `src/race-engine-v3/**` implementation or official racing code was modified.

## Constraints and next investigation

1. The **Guangxi synthetic geometry still omits 718 m** of reported ascent. Dordrecht's eight sprint-point tactical orders are mapped to tempo and rider physiology/power parameters remain provisional.
2. The algorithm selects one safe lane based on headway. It is **not** optimizing a known finishing position or constructing preset groups. Results across only four grids and one synthetic wind choice do not establish confidence intervals.
3. The extra shifts are discretized; realistic lateral steering, reaction delay, fatigue cost of prolonged passing, and team behaviors remain uncalibrated.
4. **Do not promote Batch 29.** There is no consistent reduction in grid sensitivity, and in several tests blocking and rank instability become worse.
5. **Batch 30 candidate:** instrument the *first decisive longitudinal divergence* under identical power targets and incoming lanes, determine whether follower speed clipping, nearest-leader selection, or lane-reservation ordering amplifies perturbations, then test a physically limited **multi-tick** passing reservation with finite lateral duration and collision-safe occupancy. Require full 106/168-roster calibration, more neutral seeds, exact checkpoints, no artificial scripted results, and the existing production build/regression checks before any gameplay changes.

**SPORTING NO-GO.** Official V3 remains disabled for live races, existing historical results untouched, and game clocks unchanged.
