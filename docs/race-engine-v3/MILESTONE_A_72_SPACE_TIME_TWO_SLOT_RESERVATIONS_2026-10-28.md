# Race Engine V3 — Step 72: physical two-slot entry windows, matched admission controls and long mild-road passing

**28 October 2026. Engineering / synthetic simulation research PASS. Mild 106/168-rider 120s safety and sustained passing PASS under matched no-yield control. Strong 2.2m road sporting FAIL; full-stage and production NO-GO.**

## Why this step exists

Step 71 demonstrated that a provisional **2.2m** narrowing is **two-slot geometry** once the full bicycle body is respected: a **0.3m bicycle half-width** leaves **1.6m usable bicycle-centre road** and therefore at most two lateral slots at **over 0.8m** spacing. A three-abreast field cannot pass that cross-section at one longitudinal x without first staggering into real longitudinal space. Merely instructing the central rider to brake caused new upstream collisions. The most conservative 32-rider strong-pinch candidate rejected the bicycle at the road margin at 20s; 106/168-rider strong-pinches stopped on actual swept contacts at 15.5s.

Step 72 adds [`a2TwoSlotReservationsV3.mjs`](../../scripts/v3/a2TwoSlotReservationsV3.mjs), a *pure, offline* geometry-and-speed request planner. It groups riders by their **physical starting-row x** rather than rider IDs, then reserves the symmetric two positions **y=1.45m** and **y=2.95m** within the strong narrowing for left and right flank riders. A centre rider in the same original row receives a later, **2.6m-offset** longitudinal entry request. For approaching riders, the planner may communicate present requested speeds upstream among centre riders and, experimentally, to approaching flanks; it never directly changes x/y/v. Reflected/renamed rider fields must make exactly the same choices.

The actual physical solver remains fully authoritative: **0.5s simultaneous bounded steps, +0.45 / −0.85m/s², at most 0.38m/s lateral movement, swept all-pair continuous bicycle collision tests, full 0.3m bicycle half-width at road edges, finite energy/W-prime and exact snapshot restart**. No collision or physical road-edge breach can be repaired after the fact or counted as a completed movement. The road widths, centre-slot locations, 2.6m target offset and bicycle half-width are **research assumptions, not sourced actual event road data**.

## Four separately tested policies and causal control

1. **`platoon_two_slot_hazard_hold`**, the Step 71 historical baseline: legacy physically conservative no-new-pass policy ahead of a strong narrowing, with existing yielding constraints.
2. **`platoon_no_yield_control`**: identical 8s geographic steering lookahead and anti-dead-end lane forecast, **without** the old ad hoc merge-yield veto. It retains every full rider-rider and road-edge swept-contact rejection. This is a matched causal control, not a production recommendation.
3. **`platoon_space_time_reservation`**: physically defined two side-slot entry windows, centre offset pace guidance and upstream speed communication.
4. **`platoon_space_time_admission`**: reserves the same initial row positions but temporarily **defers an inward lateral move** if an ahead centre rider's current-state relative motion will occupy that lateral space within the next eight seconds, rather than applying another broad cross-row braking wave.

The two A72 reservation policies are **inactive in the 3.3m mild profile** by design; their exact mild-road outcomes match the no-yield control. These matches are asserted in the tests to prevent misattributing a positive result to a mechanism that did not activate.

## Normal-start results with strict full-bicycle roadside checks

All fields use the same ordinary three-column start. The 32-rider target is 120s, and the main 106/168-rider screening target is 90s. Reported failure times are the **last accepted complete half-second tick**, with actual rejection potentially in the next unsaved subinterval.

| Field | Road | Step 71 hazard | No-yield control | Slot pace reservations | Cross-row lateral admission |
|---|---|---|---|---|---|
| 32 | Mild 3.3m | **120s clear** | **120s clear** | **120s clear (reservations inactive)** | **120s clear (inactive)** |
| 32 | Strong 2.2m | Edge rejection **20s** | Contact **13.5s** | Contact **3s** | Contact **13s** |
| 106 | Mild 3.3m | Contact **22.5s** | **90s clear** | **90s clear (inactive)** | **90s clear (inactive)** |
| 106 | Strong 2.2m | Contact **15.5s** | Contact **13.5s** | Contact **2.5s** | Contact **13s** |
| 168 | Mild 3.3m | Contact **22.5s** | **90s clear** | **90s clear (inactive)** | **90s clear (inactive)** |
| 168 | Strong 2.2m | Contact **15.5s** | Contact **13.5s** | Contact **8s** | Contact **13s** |

The no-yield mild results involve real bicycle-wide accepted movement: 106 riders complete **51** lateral lane changes and 168 riders **76** within 90s; there are **no detected swept contacts, road exits or near-stop rider ticks**. The old yield veto was constraining or destabilizing this particular synthetic geometry, but removing it must NOT be generalized to arbitrary race routes without separate safety testing.

**Strong pinch failure analysis:** The first slot-pace version generated a new crossing between `r013` (centre position ahead) and `r017` (following outer position), at which the longitudinal separation had decreased to roughly **0.83m** and lateral separation approached **0.81m**. An additional ahead-centre-to-trailing-flank speed wave often caused even earlier same-lane chain failures. The deferred-admission alternative successfully exercises its cross-row occupancy hold on all field sizes but still fails on a different front-row contact (`r000/r001`) at **13s**. The previous 32-rider 20s edge result therefore remains the best strong-pinch research benchmark; no new strong policy was approved.

## Stronger 120-second independent mild-peloton validation

Because an initial 90s clearance could conceal late pack compression, A72 extends the **no-yield mild** field to **120 seconds** and observes passes using the independent [A67 post-acceptance overtake observer](../../scripts/v3/a2SustainedOvertakeObserverV3.mjs). A pass is counted only when a rider actually crosses another rider's longitudinal position with adequate lateral space, establishes **2.05m** forward clearance and maintains that lead **continuously for 3 seconds**, including intra-step minimum-gap checks.

| Verified 120s mild field | Completed physical lane changes | Initial/final pair-order reversals (not necessarily passes) | Independently confirmed sustained rider-pair passes | Swept contact / roadside exit / near-stop |
|---|---:|---:|---:|---|
| **106 riders** | **51** | 358 | **324** | **None** |
| **168 riders** | **77** | 575 | **520** | **None** |

Both independent overtake observer states and physical trajectories reproduce **exactly** when restarted from serialized **60+60s** checkpoints. The counts are *rider-pair passes*, not unique riders, complete events or a validated professional race classification. The positive 120s cases are now **hard CI regressions** with full horizon, zero near-stops, at least **45/70** completed lane changes and **300/500** confirmed sustained pair passes.

## Validation and approval status

- [Full Step 72 physical research and matching controls](../../scripts/v3/verify-a2-step72-space-time-reservations-v3.mjs)
- [Step 72 focused CI and retained JSON evidence](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step72-reservations-targeted.yml)
- [Comprehensive A63–A72 technical, previous historical, complete-stage and React build gates](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)
- Full road reflection, ID relabeling, bounded power accounting, negative three-bicycles-abreast full-body overlap, exact checkpoint recovery for all completed fields and no retrospective future trajectory access remain mandatory.
- **Technical/synthetic research PASS** does not confer sporting readiness. The A72 strong 2-slot scheduling experiments **all fail** within the 90/120s test horizons, with the physical rejection captured and no official results written. Road geometry is not source calibrated, and 120s is not a complete stage.

## Next Step 73

Do not merely enlarge communication ranges, reduce collision envelopes or apply another universal braking multiplier. Investigate **provable space-time feasibility at a narrow cross-section**: reserve actual **longitudinal x–t intervals** for all rows across the two physical usable lateral slots, detect if a given rider cannot clear both its immediate same-row and next-row neighbours under physical acceleration limits, and plan bounded speed decisions for *all upstream riders before a conflict becomes unavoidable*. Test multiple initial grids, mild/strong width transitions and multi-minute 106/168 fields without suppression of passing outside the bottleneck. Study whether a 2.2m public-road fixture can realistically accommodate a densely packed three-abreast bunch without forced almost-stops, and calibrate actual event road width and bike body dimensions before selecting production policy.

The entire V3 design still needs real-source geometry/elevation, aerodynamic drafting, power-limited attacks, fatigue, persistent real group gaps, realistic team tactics, actual complete 106/168-rider stage classifications, application integration and deployment/rollback gates.

**Sporting NO-GO; Milestones B/C not complete.** No official selected game solver, Supabase record, historical race result, rider standing, payout, race clock or live match was altered. All work remains isolated offline research on GitHub `main`.
