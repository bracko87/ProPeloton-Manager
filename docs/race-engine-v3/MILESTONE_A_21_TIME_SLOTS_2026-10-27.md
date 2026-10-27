# Race Engine V3 — Milestone A2: non-clairvoyant before/after time slots

**27 October 2026 — synthetic 2–6-rider engineering pass; promising two-sided micro feasibility; SPORTING NO-GO.**

## Motivation and scope

[A20 two-sided bounded release](MILESTONE_A_20_TWO_SIDED_FAIRNESS_2026-10-27.md) protected the moving blocker and reduced near-stops, but could not deliver a sustained pass in any of 64 contested-lane scenarios. The research question here is whether it is better for the passing rider to move **before** the other cyclist crosses the lane or to **let that lane change finish and use a freshly clear route afterward**.

The new `scripts/v3/a2TimedCorridorV3.mjs` is an **offline-only intent scheduler**, not an alternative physical collision solver. It uses current positions, the current tick's communicated lateral intentions and a previous position snapshot; it cannot read future rider decisions. All accepted trajectories and rider energy remain controlled by the unchanged `simultaneousConflictResearchV3.mjs`, with continuous swept bicycle collision checks. No production engine, player data, Supabase record or game-clock operation has changed.

Implemented:
- A **rival-first** policy starts by observing the first tick, yields the contested corridor to the lateral-moving rival, waits until that rival is **actually observed** in its new lane, and then chooses a fresh adjacent corridor using only the current geometry.
- A **pass-first with consent** policy may request at most one acknowledged hold; on refusal or exhaustion, the opponent keeps its original lateral move and the algorithm switches to rival-first. No other rider's forward demand is overridden.
- An **eager-start probe** skips the first observation tick. It may pass before the opposing lane change, or cross during the same observed 10s tick as its completion. It cannot be called a *verified* pass-after sequence in those cases.
- The original base collision solution, older two-hold acknowledged lease and previous one-hold two-sided release stay as controls. Synthetic rider demands and the physical solver remain unchanged.

Source commits: [micro scheduler and safety test](https://github.com/bracko87/ProPeloton-Manager/commit/24d0cd3c66b62bdc52639f4d05145c1486d224a8), [full comparisons](https://github.com/bracko87/ProPeloton-Manager/commit/95a6a35980a353511946d3142cd57200c5613942), [strict pass-after timing assertion](https://github.com/bracko87/ProPeloton-Manager/commit/01243e40a6860464b925743796900fa0c8e5be9f) and [distinct eager-start branch](https://github.com/bracko87/ProPeloton-Manager/commit/3d48a447870656bf8f3051b702eaf0164b933a7e).

## Verified matrix and technical gates

[Final GitHub Actions run: all 5/5 jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40498189534), as well as its independent legacy-isolation workflow. The original micro collision, energy and checkpoint tests and a production application build passed.

- **Five** field sizes: 2, 3, 4, 5, 6 riders.
- Four **synthetic/unverified** road width and rider-clearance geometries: 4m, baseline 5m, 6.5m and cautious 5m.
- Two initial lead/rear gaps: 9m and 18m; two requested 10s rear movements: 55m/75m; leader requests 45m.
- Open passing corridor controls in all fields; moving-left opponent when field size is at least 3.
- **Seven** policies: baseline, old acknowledged lease, one-hold fair release, rival-first delayed lane re-evaluation, eager start, pass-first with consent, pass-first consent refused.

This totals **112 two-rider control runs plus 4 × 224 moving/open cases for 3–6 riders = 1,008 synthetic runs**, each 40 × 10s = 400s. Every run passes:
- Every pair's continuous swept path collision checks, no invented forward travel and finite/nonnegative rider W-prime.
- Full exact JSON tick-20 recovery for the original physics, persistent passing observer and new time-slot scheduling state; rider-array permutation invariant first tick.
- Consent/refusal: only an explicitly acknowledging rider may be requested to hold one tick; nonconsenting third parties preserve their own commands.
- Strict 60-second longitudinal pass accounting, including exclusion of recent right-censored crossings from sustained passes.

Five archived detailed JSON files `v3-a2-time-slots-{2,3,4,5,6}` (30-day retention) include actual first-pass times, rival lane-change completion seconds, the exact pass-before/after ordering flag and per-policy halted-rider ticks.

## Result: physically interacting moving blocker (64 matched cases)

Each scenario contains the original faster trailing rider, slower lead rider, and an opponent whose persistent intention is to move from lane 2 to lane 0 by traversing lane 1. The opponent's request is never erased or secretly modified. A valid sustained pass is **rear overtakes lead and remains ahead at least 60s**.

| Measurement | Baseline | Old acknowledged lease | One-hold fair release | **Rival first, reselect** | **Eager start** | Pass first, consent | Pass first, refused |
|---|---:|---:|---:|---:|---:|---:|---:|
| 60s sustained passes | 0/64 | 64/64 | 0/64 | **64/64** | **64/64** | 44/64 | 64/64 |
| Blocker finishes lane change by 400s | 64/64 | 58/64 | 64/64 | **64/64** | **64/64** | 64/64 | 64/64 |
| Summed unrelated near-halted rider-ticks | 445 | 593 | 208 | **0** | **0** | 14 | **0** |
| Summed passing rider near-halted ticks | 249 | 324 | 80 | **16** | **0** | 52 | **16** |

These are *aggregated rider-ticks* with actual movement less than 0.5m/10s, not a claim of zero slowdown, zero queued requests, or realism.

**Important pass timing assertion:** The strict rival-first variant additionally asserts the first crossing occurs **strictly after** the rival's observed lane-change completion time in every moving-blocker case. All **64/64** checked cases pass that independent assertion. In a three-rider sample, the opponent completes at 30s and the first pass occurs between 50 and 140s depending on synthetic width, headway and power ceiling.

**Eager timing is ambiguous or genuinely earlier:** In all 64 moving-blocker cases, eager-start first crossing occurs **at or before** the rival's tick-end completion stamp. Within each 16-case rider-size block, 8 crossings occur before the completion timestamp and 8 within the **same 10s tick** as completion. For same-tick events, the tick-end classification alone does not establish the actual sub-tick order. The eager variant is thus **not** a valid rival-first solution; it must be examined separately as an early crossing and finish-time interpolation problem.

**Consent is not necessary for rival-first re-selection** in these examples. The opponent's communicated current intent and subsequently *observed* actual lane movement suffice to choose a different lateral route after it finishes. Passing-first with a one-tick hold succeeds 44/64 but is inferior here to allowing the rival to move immediately.

## Uncontested-lane counterexample: do not cherry-pick

The rival-first policy's extra observation tick produces a **real regression** when no opponent is trying to enter the passing corridor.

| Open-lane control | Baseline | Rival-first observing one tick | Eager first tick |
|---|---:|---:|---:|
| 60s sustained passes | **80/80** | **62/80** | **80/80** |

The 18 missing rival-first passes are from the **4- and 5-rider** synthetic group fixtures (7/16 successes each instead of 16/16). Therefore the cautious rival-first procedure **cannot be promoted unchanged**, even though it performs extremely well in this particular moving-blocker case. Simply selecting the cautious path universally sacrifices unopposed overtakes; always choosing eager first produces micro cases with unresolved same-tick maneuver ordering.

## Engineering interpretation and next A2 gate

**Technical micro: PASS. Sporting approval: STILL NO-GO.** The result identifies feasible sequences in controlled synthetic scenarios and shows that reducing a rival's own lane-change rights is *not necessary* to allow a sustained pass. However, it has not solved optimal dynamic lane choice, 10s intra-tick event ordering, stochastic opponent movement, road curvature, grid robustness or full-stage realism.

**Next narrowly bounded gate:** implement a *conditional, evidence-based slot admission* that does **not** automatically pay an observation-tick penalty on an open road but switches to a rival-first release only on a genuine current or newly observed crossing threat. Test adversarial **varying blocker start times, longitudinal offsets, and rival lateral reversals**, including additional riders trying to claim the same corridor. Require measured both-rider completion, strict intratick swept safety, no coerced nonconsenting actors, and real 30/60s durable passing across multiple grids. If crossing and rival completion share a 10-second tick, explicitly classify the temporal order as unknown rather than claim a proven pass-before/after. Only then consider 12/24/32 riders.

Independent full-stage blockers remain authoritative 4/5/6.5m road widths, missing climbing elevation, fraction-of-tick finish energy, realistic drafting/breakaway/pursuit, historical pack/gap calibration and controlled live UI integration.

**A1 technical 2D foundation passed. A2 sporting OPEN / NO-GO. B/C NOT STARTED. Official result writes 0.**
