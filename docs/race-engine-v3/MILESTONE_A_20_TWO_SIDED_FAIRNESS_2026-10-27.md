# Race Engine V3 — Milestone A2: two-sided bounded lane fairness

**27 October 2026 — 576 MICRO ENGINEERING PASSES; NO SPORTING APPROVAL.**  

## Objective

The prior [A19 acknowledged corridor reservation](MILESTONE_A_19_RESERVATION_CONSENT_2026-10-27.md) gave the passing rider a sustained overtake in 64/64 moving-blocker micro scenarios. But 6/64 consenting blocking riders did **not** finish their own lane change, and the protocol increased summed near-stop unrelated-rider ticks from 445 to 593.

This study asks if preserving the consenting rival's lane-change request, allowing **no more than one voluntary one-tick hold**, and actively **releasing** the rider can improve fairness without sacrificing swept collision clearance, energy conservation or deterministic checkpoint recovery.

## Research-only implementation

The isolated [two-sided scheduling prototype](../../scripts/v3/a2FairCorridorSchedulingV3.mjs) is a policy on submitted rider motion intentions, **not** an alteration to the original finite-energy/collision solver, full-stage 2D engine or official game.

- A passing lane is initially requested only if the prior corridor selector finds an unoccupied adjacent track.
- An approaching other rider may voluntarily acknowledge at most **one** deferred lateral instruction; its latest originally requested lane change remains queued and observable.
- Once the hold budget is exhausted, the protocol stops overriding the consenting rider's lateral instruction, marks it as released and lets the existing physical resolver arbitrate every movement.
- The *requesting passing rider* voluntarily keeps its current lateral position and caps its own forward request to protect a synthetic **4m longitudinal release gap** behind the rival's current proposed movement. This prevents compelling further opponent holds but can sacrifice the overtake.
- The scheduler tracks actual, observed arrival into the formerly reserved corridor and the release/hold/rear-forward-capping events. It cannot guarantee completion in an arbitrary future stream of third-party movements and never uses unseen future decisions.
- Refusing acknowledgment leaves the opponent's movement request unchanged. Every actual accepted motion is still processed by the existing swept bicycle collision resolver and finite W-prime accounting.

No rider results, Supabase records, official race-engine selection, tactics layer or game clock were touched. The prototype explicitly marks `officialWrites=0` and `sportingApproval=NOT_APPROVED`.

Code: [initial fairness module and unit tests](https://github.com/bracko87/ProPeloton-Manager/commit/d89a3b844c5147f0f37cd7fb57409db4b1208c98); [comparison and CI](https://github.com/bracko87/ProPeloton-Manager/commit/7e4a55dd7a4805dde2264ded02036976956c50bf). All work is isolated in `scripts/v3` and its own GitHub Actions workflows.

## Final matrix

[Verified GitHub Actions run — 5/5 comparison jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40494415427). The independent application build and the canonical 2D regression checks passed in that same run.

The matrix runs:
- 2, 3, 4, 5 and 6 riders;
- four still-**synthetic** road geometry/envelope profiles (4m, baseline 5m, wide 6.5m, cautious 5m);
- initial longitudinal gaps 9m and 18m;
- rear rider requested 55m or 75m per ten-second tick, compared with a scripted 45m leader;
- initially clear side corridor, plus a moving blocker entering the corridor for fields of at least 3 riders;
- four policies: **baseline**, **old acknowledged two-hold reservation**, **consent refused**, **new one-hold two-sided release**.

Counts: two-rider open control = 4 widths × 2 headways × 2 requested speeds × 4 policies = **64 runs**; each size 3–6 has both situations and **128 runs**, for **576 total**. Each ran 40 ten-second ticks with strict swept-pair checks, finite/nonnegative W-prime, no invented forward metres, and exact serialized midpoint checkpoint replay of both physics and pass/reservation states. Input rider-array reversal was also checked.

The final run archived per-case JSON in `v3-a2-fair-scheduling-2` through `v3-a2-fair-scheduling-6` (30-day GitHub Actions artifacts).

## Verified moving-blocker results — 64 matched cases

A pass counts only if the trailing rider moves in front of the leader and remains there **at least 60 simulated seconds**.

| Metric | Baseline (no reservation) | Old acknowledged two-hold lease | Consent refused | New one-hold two-sided release |
|---|---:|---:|---:|---:|
| Sustained 60s passing rider overtakes | 0/64 | **64/64** | 0/64 | **0/64** |
| Blocker actually completed lateral move by 400s | **64/64** | 58/64 | **64/64** | **64/64** |
| Summed near-halted unrelated-rider ticks | 445 | 593 | 445 | **208** |
| Summed near-halted passing-rider ticks | 249 | 324 | 249 | **80** |
| Consenting lateral holds | 0 | 128 | 0 | **64** |
| Release attempts recorded by new scheduler | n/a | n/a | n/a | 64 |
| Completed pending-rider releases observed by new scheduler | n/a | n/a | n/a | **64** |
| Forward motion voluntarily capped for lane release | n/a | n/a | n/a | 80 rider-ticks |

The new policy decreases unrelated near-stop ticks **445→208** (−237 ticks, roughly −53%) compared with the noncooperative baseline, and preserves the blocker completion ratio at 100%. It also reduces the overtaking rider's near-stop ticks **249→80**. However, **the requesting rider never completes a 60s+ sustained pass** in the moving-blocker fixture. Therefore these data show better release fairness and reduced standstill, *not* successful, realistic two-sided overtaking.

Per roster size, the new policy's moving-blocker results were:

| Field size | Sustained passes | Blockers completed | Unrelated near-stop ticks |
|---|---:|---:|---:|
| 3 | 0/16 | 16/16 | 48 |
| 4 | 0/16 | 16/16 | 0 |
| 5 | 0/16 | 16/16 | 0 |
| 6 | 0/16 | 16/16 | 160 |

All **320 open-corridor control runs** (5 sizes × 16 configurations × 4 policies) produced sustained passes. No new coordination was necessary there.

## What is proven, and what is not

**Technical MICRO PASS:** the new scheduler can implement a strict voluntary one-tick hold cap, preserve queued lateral requests, release the cooperating rider, retain final swept collision safety and energy accounting, and reproduce results after checkpoint restoration. Existing micro and full-stage *technical regression suites* and independent production build passed. The separate prior [legacy isolation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40492304420) had also passed; do not assume a production deployment from a successful build.

**Sporting FAIL / NO-GO:** traffic still cannot deliver both a durable pass and a completed consenting rival lane change in this contested example. A safe system may deliberately sacrifice the pass rather than block another rider; that is the appropriate conservative failure mode, but it does not satisfy realistic cycling dynamics. The apparent improvement in near-halt counters is measured only under highly scripted, synthetic fixed-gap traffic with a simplified bicycle collision envelope. Larger peloton fairness and full-stage classification are still untested.

The current prototype's released-rider priority is a *voluntary follower speed cap* based on communicated current motion and a synthetic 4m gap. It does not constitute a mathematically guaranteed future release gap when actual acceleration, multiple rival lane changes, or third-party behavior vary. The 64/64 actual blocker completions are observations in these 64 fixtures only.

## Next bounded A2 gate

Investigate **physically feasible time-slot ordering** instead of more blanket priority weights. For each 2–6-rider conflict, compare whether the requester's pass may safely occur *before* the opponent's crossing, *after* it, or neither, using jointly admitted trajectories over a short verified horizon and no unannounced future intent. Require **both** riders' movement-completion measures and sustained 30/60-second passing, not just total movement or absence of collisions. Restrict the planner to current observations and explicitly submitted short-term intents, with bounded hold budgets, fair reattempts, nonconsenting-rider rights, W-prime accounting and exact replay.

**Do not expand this candidate to 12/24/32 riders or the 106/168-rider full-stage engine** until those two-sided micro outcomes improve without new grid sensitivity or excessive unnecessary halts. Independent research blockers remain authenticated road widths/elevation, missing climbing/ascent, finish-tick energy, realistic drafting/breakaway behavior, historical calibration and live tactics/UI.

**A1 technical foundation complete; A2 sporting NO-GO; Milestones B/C NOT STARTED. Production engine and historical race data unchanged.**
