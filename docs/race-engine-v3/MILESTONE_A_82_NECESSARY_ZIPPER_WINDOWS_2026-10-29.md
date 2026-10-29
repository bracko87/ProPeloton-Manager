# Race Engine V3 — Step 82: kinematic necessary zipper windows and explicit request-contract infeasibility

**Date:** 29 October 2026  
**Decision:** Isolated mathematical diagnostics and original-physics technical regression **PASS**. New 32-rider five-abreast staged physical full-race pilot **PASS** with 85 independently confirmed sustained 3-second overtakes. Five-abreast 106/168 sporting gate remains **NO-GO**; neither Step82 research policy is approved for production.

## Implementation, scope and limitations

[Step82 interval contract module](../../scripts/v3/a2Step82FeasibleZipperWindowsV3.mjs) adds an explicit **necessary-condition** check missing from the eight-second heuristic forecast of Step81:

1. Compute, **from currently accepted x/v and the static upcoming gate coordinate only**, an individual rider's earliest and latest feasible arrival at the gate under +0.45m/s² acceleration, −0.85m/s² braking and bounded positive terminal speed. The solver uses time-bisection to avoid linear-velocity approximations.
2. Group the static bookings into intended same-physical-corridor lanes, order them by **present longitudinal position then symmetric distance from the road centre**, and propagate a conservative minimum temporal separation of `2.55 metres / 5 m/s`. Exactly same x and same symmetric geometric priority deliberately has **no name-based tie-break**.
3. Return `REQUEST_CONTRACT_INFEASIBLE` for booking-specific necessary time-window contradictions or physically ambiguous same-x shared-lane priority, rather than silently declaring an impossible request valid. A value outside the search horizon is treated as **unknown**, not proof of physical impossibility.
4. Produce four **requests only**: pace a rider towards its permitted timing contract, hold a blocked lateral move, physically bounded lead acceleration assistance, and a combination. Requests retain a positive desired-speed floor (6.7 or 7.3m/s in these opt-in experiments); they cannot teleport, overwrite actual speed or repair accepted race history.

The [existing offline A77–A81 physical wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs) adds opt-in `feasible_window_v1` and `feasible_conservative_v1`, with five first-tick whole-field proposals and the prior 3-tick original-solver receding-horizon verifier. It canonicalizes mirrored *planning* coordinates but accepts the chosen first tick only after re-running the **unchanged original synchronized A64 all-bicycle swept-body, roadside and energy solver** in real (possibly mirrored) coordinates. Rejected prospective movements are never committed.

**Crucial limitation:** Consistent per-rider arrival intervals and even mutually time-ordered lane booking windows are only *necessary*, **not sufficient** for a feasible shared two-dimensional trajectory. In this phase, large fields repeatedly had `REQUEST_CONTRACT_NECESSARY_CONSISTENT` at the scheduling layer and nevertheless reached a genuine rejected swept bicycle contact. That is an intentionally recorded failure of the **current model's sufficiency**, not permission to ignore those collisions.

## First 16-case rigorous physical matrix

[Step82 A64 accepted-motion and contract verifier](../../scripts/v3/verify-a2-step82-feasible-windows-v3.mjs) exercises both policies across 8/32/106/168 initial **five-abreast** bodies, the staged 3.3→2.2m and double 2.2m narrowings and controlled neutral 9m/s large-field starts.

| Five-abreast field and route | Best original-physics accepted time in matrix | Important result |
| --- | ---: | --- |
| 8, staged and double (both policies) | 60s (study horizon) | 0 near-stop ticks, no rejected contact in 60s |
| 32, staged | 45s (study horizon) | 0 near-stop ticks, 74 actual lane changes |
| 32, double | 45s (study horizon) | **32 near-stop rider ticks**; not sporting-ready |
| 106, staged | 5s | first rejected swept contact r053/r059 |
| 106, double | 8s | first rejected swept contact r052/r058, 0 near-stops before rejection |
| 168, staged | 5s | first rejected swept contact r053/r059 |
| 168, double | 8s | first rejected swept contact r052/r058, 0 near-stops before rejection |

All first contacts remained **original physical solver rejections**, no movement reconstruction or retrospective correction. For the large fields, the Step82 policy **regresses** against Step80's credible 168-rider double-strong 20s / zero near-stops and Step81's 106-rider double-strong 20s / 81 near-stop ticks. **Zero** Step82 106/168 five-column 180s clean passes. Passing all **technical** fail-closed assertions does not confer sporting authorization.

The unit-level math tests also demonstrate real **infeasible booking arrangements**: booked required passage beyond the individual latest reachable time produces `NECESSARY_TIME_WINDOW_CONFLICT`, and equal-x equal-lane identical priority produces `AMBIGUOUS_SAME_X_SAME_LANE`. The same formulas produce equal outcomes under mirrored road coordinates and rider-ID renaming.

## True full-180s independent sporting tests

Unlike the 45s matrix, the [separate Step82 completed 8/32 field and mirror/replay audit](../../scripts/v3/verify-a2-step82-parity-full-races-v3.mjs) actually continued both eight- and 32-rider `feasible_window_v1` fields for the **entire 180s** with the independent sustained-passing observer:

| Full 180s research fixture | Actual full duration | Near-stop rider ticks | Actual lane changes | True sustained >=3s pair overtakes | Sporting safety |
| --- | ---: | ---: | ---: | ---: | --- |
| 8 riders, staged | 180s | **0** | 114 | **8** | Physical pass |
| 8 riders, double | 180s | **0** | 109 | **7** | Physical pass |
| **32 riders, staged** | **180s** | **0** | **460** | **85** | **Full physical pass** |
| 32 riders, double | 180s | **32** | **971** | **45** | **FAIL near-stop realism** |

All four fields were beyond the second gate's reopening x1470m at the end; the 32-rider staged rearmost rider reached x2032.912378m and double rear x1993.272623m. **No contacts, off-road boundaries or energy failure** were detected in these accepted full-duration trials. Exact serialized **90+90s saved physical world + independently observed rider-pair passing** recovery passed for all four configurations.

This is a genuine improvement over **Step81 staged** (180s, 64 passes, 768 lane changes, 0 near-stops) but **does not surpass the already protected Step78 staged** (180s, 87 passes, only 356 lane changes, 0 near-stops). The Step82 32r double field moves physically but is excessively slowed and still weaves too much. Do not replace Step78 simply because Step82 introduces a more formal scheduling diagnostic.

## Reflection, identity and protected regression verification

The new Step82 controller passed **16 short full-body physical reflection / rider renaming tests**: `8/32/106/168 × staged/double × both policies`, including actual accepted x/y/v, remaining W-prime energy, time, selected policy counts, and true rejection status. These are **short-run fairness checks**, not full 180s mirror certification of the new 32r racing mode.

- [Step82 corrected first complete physical CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40854061143) — **SUCCESS**, 16 honest physical cases, previously protected A81 32r full 180s 64 passes, A78 32r 180s 87 passes, A76 three-abreast 32/106/168 180s with 58/151/198 independent sustained passing events, and React production build. The first attempt identified and corrected an integration dispatch error before this success.
- [Step82 expanded full-mirror/8-32-rider full-race and checkpoint CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40854433943) — **SUCCESS**, with 16 exact mirror/name cases and full physical+observer 90+90 replay, and all protected race/React tests.

All tests are **research-only** and never request a Supabase migration, read or modify live race results, game clock, club finance, payouts, historical races, user accounts or production classifications. Github `main` contains the opt-in research modules and tests; successful CI is not a claim of production Netlify deployment or live racing behavior.

## Decision and next engineering gate

**Step82 research/technical validation: complete. 32-rider staged synthetic full race: PASSED, but original Step78 benchmark still better. Full 106/168 five-abreast realistic racing: NO-GO.**

**Step83** should upgrade beyond one-dimensional consistent booking windows to a **joint, geometry-aware physically reachable space-time viability certificate** for local crossing clusters. In particular, catch pairs `r053/r059` and `r052/r058` *before* irreversible 5–8s collision, by considering each actual bicycle's longitudinal AND lateral reachable tube, finite maximum steering rate, correlated collision-free crossing order, leader/follower braking and physical road-edge capacity. Recognize collective infeasibility across overlapping 3–8-rider groups rather than declaring every individually legal booking consistent. Avoid mass braking or 971 32-rider lane changes. Test both narrowing profiles with full 180s, 32→106→168 five-abreast, every cyclist beyond the second reopening, zero near-stops/contact/off-road, credible independent 3-second overtakes, mirror/ID invariance, full physics+observer exact checkpoint recovery and energy-feasible long-term behavior.

**Milestone A full sporting realism: NO-GO. Milestone B gameplay integration: NOT STARTED. Milestone C production release: NOT STARTED.**
