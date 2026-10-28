# Race Engine V3 — Step 74: strong two-slot full-field space-time entry spacing

**28 October 2026. Offline technical/replay gates PASS. First fully traversed 106-rider strong 2.2m road at 120 seconds with 124 independently confirmed 3-second rider-pair passes. Full 168-rider strong-road safety remains FAIL, and sporting/production NO-GO.**

## Why this work follows Step 73

Step 73 proved that an ordinary 32-rider three-column field could traverse the complete synthetic **4.4m → 2.2m → 4.4m** road narrowing safely using fixed geometric two-slot entry bookings. The earlier 106/168-rider field instead rejected a real swept collision at **43 accepted seconds** between `r088` and `r090`. At first contact the lead middle rider moved near x729.74/y2.2m and the following outside rider near x727.93/y1.45m. The trailing cyclist was already braking at the maximum permitted **−0.85m/s²** and there was only **≈1.807m** longitudinal separation with **0.75m** lateral separation. This must not be silently repaired or counted as a pass.

All Step 74 work remains **offline, opt-in research**: 0.5-second simultaneous coupled field ticks, 16 swept microintervals, all-pair bicycle collisions, *full bicycle-body* road edges (**0.3m half-width**), lateral steering ≤0.38m/s, bounded ± acceleration (**+0.45/−0.85m/s²**), normal W-prime accounting, no after-the-fact velocity reset, mirror and rider-ID parity, exact saved-state replay and fail-closed collisions. The road, rider attributes and 5m/s provisional booking minimum are synthetic, not sourced real cycling route parameters.

## Experiments and causal interpretation

The existing `platoon_gate_schedule` policy freezes physical starting-row bookings at the beginning of the simulation and later commands only bounded movement. We compared two changes against it:

1. **Selective relative-speed following reserve.** A new identity-free [cross-row stopping reserve](../../scripts/v3/a2CrossRowFollowingV3.mjs) requests extra space only when the current outside follower has genuine closing speed toward a rider in a laterally overlapping adjacent corridor. This does not turn off passing and cannot command extra braking power. The **gentle** version retains the original large-field collision at 43s; the **stronger** version slightly regresses it to 42.5s. Neither is approved. The 32-rider baseline retains its full 120s clear result.
2. **Earlier, wider space-time entry intervals** in the [two-slot feasibility/scheduling module](../../scripts/v3/a2TwoSlotFeasibilityV3.mjs). The original 0.50s entry interval was already physically feasible but left too little space between successive normal-start rows once 106/168 riders converged. We tested 0.55, 0.60, 0.65 and 0.70s uniform intervals, plus front-loaded and balanced variable intervals. The first three-quarters of rows in the **front-loaded** policy use 0.64s; the tail uses the physically permitted minimum **0.50s**. The balanced alternative uses 0.63s for the first two-thirds and 0.54s thereafter. Physical row order, **not rider ID**, determines schedule timing.

Every actual physical result still uses the original bicycle collision and roadside guards. **No reachable booking implies a valid trajectory**—the scheduler rejects any all-row assignment beyond its deadline rather than teleporting or forcing extra acceleration.

## Full matched physical field results

For 32 riders we requested 120s; for 106/168 riders the initial screen requested 90s. Failures are the **last fully accepted physical half-second**, not simulated successful finishes.

| Gate policy | 32-rider strong | 106-rider strong | 168-rider strong |
|---|---|---|---|
| Step 73 reference, 0.50s | **120s clear**, 24 lane changes | Contact at **43s** (r088/r090) | Contact at **43s** (r088/r090) |
| Gentler closing-speed reserve | **120s clear** | Contact **43s** | Contact **43s** |
| Stronger closing-speed reserve | **120s clear** | Contact **42.5s** | Contact **42.5s** |
| Uniform **0.55s** interval | **120s clear**, 29 lanes | Contact **49.5s** | Contact **49.5s** |
| Uniform **0.60s** interval | **120s clear**, 34 lanes | **90s clear**, 90 lanes | Contact **56.5s** |
| Uniform **0.65s** interval | **120s clear**, 40 lanes | **90s clear**, 94 lanes | **NO REACHABLE WINDOW**, t=0 |
| Uniform **0.70s** interval | **120s clear**, 46 lanes | **90s clear**, 92 lanes | **NO REACHABLE WINDOW**, t=0 |
| Front-loaded **0.64/0.50s** | **120s clear**, 36 lanes | Contact **49.5s** | Contact **69s**, 99 lanes |
| Balanced **0.63/0.54s** | **120s clear**, 36 lanes | Contact **46.5s** | Contact **58s** |

**0.65–0.70s does not work for 168 riders** because the rearmost rows cannot receive a kinematically valid entry time within the deadline. This is a proper **fail-closed planning result**, not a rider collision, and no position, game time or energy is committed. The 0.60s uniform policy is the current best proven full-field 106-rider controller. The front-loaded interval is the best of these candidates for physical 168-rider *progress*, but is **not sporting-safe**.

## Independent full-body passage and sustained-overtake certification

The [Step 74 independent observer test](../../scripts/v3/verify-a2-step74-strong-passing-v3.mjs) repeated the actual physical solver with a separate **post-acceptance sustained-overtake observer**. A pair pass requires a genuine crossing with clear separation, an established forward position and **3s** of maintained lead; it does not equate a lane movement or an endpoint rank inversion with a real pass. All listed physical/observer replays match exactly after a serialized halfway checkpoint.

| Verified test | Actual accepted time | Completed lane changes | Confirmed sustained rider-pair passes | Real road-edge/contact/near-stop |
|---|---:|---:|---:|---|
| 32 riders, 0.60s, requested 120s | **120s clear** | **34** | **43** | **None** |
| 106 riders, 0.60s, requested 90s | **90s clear** | **90** | **38** | **None** |
| **106 riders, 0.60s, requested 120s** | **120s clear** | **115** | **124** | **None** |
| 168 riders, front-loaded, requested 90s | **69s accepted**, then contact | **99** | **4** before contact | First swept contact **r130/r134**, no near-stops |

For the 106-rider **120s** run, **every rider passed the entire narrowing and reopening** (all x past **1020m**; rearmost x≈**1272.824m**). For the 90s run, however, the rearmost cyclist was at x≈**1009.956m**, so the full reopening cannot yet be claimed at 90s. The 32-rider 120s run also puts all bicycles beyond x1020m. The 168-rider run fails before all riders traverse the constriction and must not be credited with completion.

**Technical acceptance is an explicit regression gate:** the 106-rider 120s successful run must stay clear, every rider beyond x1020m, at least **100 physical lane changes and 100 independently sustained pair passes**, zero near-stop ticks, valid energy and exact physical + observer serialized replay. The 32-rider full 120s strong-road success with at least 35 verified pair passes is independently preserved. The larger 168-rider synthetic failure must remain visible rather than being rewritten as a passing completion.

## What is still not resolved

The 168-rider front-loaded field first collides at accepted time **69s** between `r130` and `r134`. It makes 99 completed lateral moves and has zero near-stop ticks up to that point, but the 3s overtake observer verifies only **four** sustained pair-pass events. That is **not sufficient for sporting realism**, regardless of the greater duration. No candidate currently solves this field.

The 106-rider result is also only **a two-minute synthetic narrow-road start**, not a complete professional stage. It does not yet prove realistic aerodynamic drafting, attacks and breakaways, long-lasting groups, real route width/grade, power-limited accelerations, fatigue accumulation, team orders, timed classifications, full-distance 106/168 stages or live tactics/UI integration.

## Validation and next focus

- [Step 74 matched safety/fairness comparisons](../../scripts/v3/verify-a2-step74-selective-crossrow-v3.mjs)
- [Step 74 independent post-acceptance passing and exact replay](../../scripts/v3/verify-a2-step74-strong-passing-v3.mjs)
- [Focused Step 74 GitHub Actions and JSON evidence](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step74-selective-crossrow-targeted.yml)
- [Comprehensive maintained A63–A74 and earlier A58–A39/React build regression workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

**Next A75:** Build a **feasibility-driven upstream row-allocation rule** for the **168-rider** strong bottleneck that can allocate more time to high-pressure middle rows while retaining physically achievable booking windows for the tail. Avoid fixed rider IDs, arbitrary rescue gaps and repeat of r088/r090, r115/r118 and r130/r134. Require **all 168 riders** to pass the complete 2.2m narrowing and reopening at 120s or a scientifically justified longer research horizon; real three-second sustained pair passes, realistic non-stalling pack speed, complete collision-free replay, reflection/renaming parity and full W-prime accounting. Preserve the **32/106 strong 120s** and **106/168 mild 120s** verified passing baselines, older 67-case and complete historical regression suites.

**Milestone A sporting/production: NO-GO; B/C remain not complete.** All changes are isolated offline V3 research/CI/docs in GitHub `main`. No official game solver selection, Supabase data, official races, rider standings, results, payouts or game clock was modified.
