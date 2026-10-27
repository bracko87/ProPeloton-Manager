# Race Engine V3 — A2 Step 29: active lane-claim admission and earlier communicated intent

**27 October 2026 — 10,560/10,560 OFFLINE MICRO TECHNICAL PASSES; SPORTING NO-GO.**

## Purpose

The [Step 28 bounded lane-release experiment](MILESTONE_A_28_BOUNDED_RELEASE_2026-10-27.md) found that a one-tick voluntary hold reduces rider congestion but sacrifices 32 of 64 passing opportunities when a single cyclist enters early and 24 of 48 when two cyclists claim the corridor, relative to the original baseline on the lane-0 follower grid.

The new question is whether an **observed, communicated opposing lane-change request** should cause an immediate switch to the existing intent-aware corridor policy, instead of waiting for a direct within-tick swept-path collision or imposing a voluntary hold. The new experiment has **no future intent access**. A rider entering at tick 2 and another who stays stationary until tick 6 are not distinguishable *before either has submitted a lateral request*; the policy can only react when a request is actually visible.

## Research-only implementation

- Added `scripts/v3/a2ActiveClaimSwitchV3.mjs`, a separate stateful research wrapper with three tested modes. It advances candidate read-only policy states on the **same observed current frame**, selects only one candidate's current movement request and submits it to the unchanged `simultaneousConflictResearchV3.mjs` continuous swept-collision and finite-W-prime solver.
- **active_only:** when the current outer-lane guarded policy sees a swept-path hazard from an actively moving opponent, select baseline intent-aware movement for that tick; otherwise select the current-lane guarded request.
- **latched:** after the first such collision-path threat is observed, keep selecting the baseline policy for subsequent ticks.
- **signal_preemptive:** switch at the **earlier currently communicated leftward lane-intent signal**, while the opponent is visibly within up to 90m longitudinally of the follower and in the immediately adjacent/second adjacent lane-screen. This can detect a rival who asks to move toward lane 0 *before* their present movement actually overlaps lane 0. It cannot foresee a later request the opponent has not yet made.
- The wrapper also carries the original baseline, outer-lane guard and one-tick hold as **unchanged reference comparisons**. Parallel candidate plans are discarded when not chosen; this is **not** a consensus simulator or permission for the unselected plan to influence rider physics.
- Inputs to the research wrapper are consistently rider-ID ordered internally, so JSON state, candidate history and checkpoint replay are not dependent on the caller's input-array permutation; selected movements are returned in the caller's original rider order.
- All modes assert that non-requesting riders' originally submitted forward and lateral intentions are **unchanged**. `officialWrites=0`; `sportingApproval=NOT_APPROVED`.

Initial micro permutation checks exposed different rider-array orderings retained by nested unselected planners. That check was corrected by deterministic internal input ordering **without suppressing or loosening the assertion**. [Micro safety regression run: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40530929656).

Code: [initial research wrapper](https://github.com/bracko87/ProPeloton-Manager/commit/1a6e402ee3c80087b6af179b66792c38f87fa947); [deterministic input ordering and earlier signaled-intent detection](https://github.com/bracko87/ProPeloton-Manager/commit/393bf52afd33474ec3552450542ca74d073f5880); [full 1,760-per-policy CI matrix](https://github.com/bracko87/ProPeloton-Manager/commit/75140b9338d892f5b245275d6315023d12d70eb7).

## Full validated comparison

[Final six-policy GitHub Actions matrix — all 5/5 jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40531192636). It validates the original collision and finite-energy unit regressions and *full-stage technical* checks; the two-rider job also independently builds the application. The five JSON artifacts `v3-a2-active-claims-2` through `v3-a2-active-claims-6` preserve the full individual cases for 30 days.

The exact same **1,760 starting-lane configurations per policy** used in Steps 26–28 were rerun under **six** policies, totaling **10,560 synthetic full-400-second micro trajectories**. Inputs cover 2–6 riders; four provisional, unsourced synthetic road/envelope profiles; 9m/18m headways; two faster-follower forward demands; original and lateral alternate starting grids; open lanes, early rival entry, delayed entry and two simultaneous claimants.

All 10,560 cases technically PASS: every accepted full swept bicycle path remains clear, W-prime remains finite and nonnegative, forward motion is not invented, full midstage serialized physics/energy/passing/policy replay is exact and no opponent is commanded to change without consent. The experiments do **not** establish historical drafting realism or full-stage peloton correctness.

### Sporting results per 1,760-case policy

| Measure | Baseline | A27 guard | A28 1-tick hold | Active-only switch | Latched switch | **Early signal** |
|---|---:|---:|---:|---:|---:|---:|
| Technical passes | 1,760 | 1,760 | 1,760 | 1,760 | 1,760 | **1,760** |
| Sustained 60-second rear overtakes | 1,502 | 1,610 | 1,590 | 1,610 | 1,610 | **1,634** |
| Near-stop follower rider-ticks | 1,102 | 692 | **355** | 692 | 692 | **652** |
| Near-stop unrelated rider-ticks | **974** | 1,025 | **765** | 1,025 | 1,025 | **991** |
| Primary competing rider final lane arrivals | 1,232 | 1,232 | 1,232 | 1,232 | 1,232 | **1,232** |
| Secondary competing rider final lane arrivals | 336 | 336 | 336 | 336 | 336 | **336** |

**Early-signal admission is the strongest sustained-passing policy of these six synthetic candidates** (+132 overtakes versus baseline and +24 versus A27 guard), and it trims near-halts compared with guard (**692→652** follower ticks and **1,025→991** unrelated ticks). However, it still has **17 more unrelated halted ticks than baseline** and many more than the one-tick hold. There is no single undisputed choice across all metrics.

The direct-current-conflict and latched-conflict selectors reproduce **exactly** the guard's aggregated sustained passing and near-stop totals in this tested matrix. These do not represent a new sporting gain; earlier *signaled* intent, rather than collision imminence or simply remembering a collision, accounts for the observed improvement.

### Representative matched rear-in-lane-0 cases

| Scene | Number of cases | Baseline | A27 guard | A28 1-tick hold | **Early signal** |
|---|---:|---:|---:|---:|---:|
| Open road | 80 | 0 | 80 | 80 | **80** |
| Rival enters late | 64 | 0 | 64 | 64 | **64** |
| Single rival enters early | 64 | **64** | 52 | 32 | **52** |
| Two riders claim lanes | 48 | **48** | 24 | 24 | **48** |

In the two-claimant lane-0 fixture the new earlier signal restores **48/48** sustained passes without near-stopped follower/unrelated rider ticks. Both claimants also arrive at their intended final lateral lane centers in all applicable test scenarios. But the new rule still gives up **12** sustained passes compared with baseline under single early entry (**52/64** versus **64/64**) and does not eliminate starting-lane sensitivity on more adversarial arrangements. For example, when the first claimant starts at lane 3, all six candidate policies still yield **0/48** sustained passes in that separate two-claimant grid (while completing those rivals' requested lane changes).

The current signal screen is a **synthetic 90m window** and only considers communicated movement in a particular lateral direction. Neither its 90m threshold nor its traffic-inclusion logic is empirically calibrated for real cycling speeds, curves or roads. The result remains a conditional policy benchmark, not a sporting guarantee.

## Decision

**ENGINEERING MICRO PASS; A2 SPORTING STILL NO-GO.** The work confirms that communicating intent earlier than immediate swept-path conflict can restore a meaningful subset of overtakes without coercing other riders. However, incomplete lane-grid robustness, early-single-claim regression, nonlinear intra-tick sensitivity, unsourced road width/ascent, fractional finish-energy accounting and uncalibrated peloton/breakaway dynamics block approval.

**Next bounded A2 research:** distinguish single early-entry conflicts from two-claimant risk using only present rider state and actively submitted intentions, then test targeted pass sequencing or safe longitudinal slot allocation for the remaining **12/64 early-entry misses**, plus the severe rival-lane-3 two-claimant **0/48** case. The test must not infer future claims from fixture labels. Verify strict 30/60s passing, both competing riders' full movement, collisions, W-prime, lack of coerced opponent commands, replay and all 1,760 starting grids **without raising unrelated congestion**. Do not expand to 12/24/32 or 106/168 riders until true sporting gates improve.

**A1 technical foundation complete. A2 sporting NO-GO. Milestones B/C NOT STARTED. Live racing physics/results and game clock unchanged.**
