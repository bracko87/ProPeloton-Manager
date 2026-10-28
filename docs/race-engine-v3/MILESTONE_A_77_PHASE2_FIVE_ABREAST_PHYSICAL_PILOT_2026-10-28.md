# Race Engine V3 - A77 Phase 2: physical five-abreast multi-gate pilot

**28 October 2026. 32-rider body-valid five-abreast mixed-width 180-second PHYSICAL PILOT PASS. 106/168 rider general admission remains BLOCKED. Full sporting Milestone A and release NO-GO.**

## Scope

Step 77 phase 1 [provided 12/12 necessary two-gate arrival-window screens](MILESTONE_A_77_MULTIGATE_ADMISSION_PHASE1_2026-10-28.md) but did not move a bicycle. Phase 2 introduces the separate, opt-in [A77 physically coupled controller wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs). It issues only temporary desired-speed and steering-target **requests** into the existing [unchanged A64-A76 physics integrator](../../scripts/v3/a2NormalStartPelotonV3.mjs). Every actual rider movement remains limited to +0.45/-0.85 m/s² acceleration/braking, 0.38 m/s lateral movement, 0.3 m bicycle half-width, strict 0.5-second swept all-pair collision detection, swept roadside boundaries and physical W-prime. There are no force-position/teleport, imaginary road-width, collision bypass, production toggles, Supabase writes, payouts, classifications or race clock changes.

The new wrapper preserves its own serialized necessary gate timetable plus the original desired speeds. If the actual physical solver rejects a tick, the wrapper preserves the last fully committed rider x/y/v/energy and returns an explicit collision, road-edge or energy failure. One-time starting conditions may optionally use a **neutral rolling-start speed** but may never change physical speed instantaneously after t=0.

## First successful five-abreast physical result - staged road

- **Initial formation:** 32 riders in five-abreast body-valid rows; x intervals 5.2m, y centres at 0.30, 1.25, 2.20, 3.15, 4.10m.
- **Route:** first 3.3m narrowing, road reopening, then a physically distinct 2.2m narrowing.
- **Opt-in controls:** `timed_safe_corridor`, baseline variable-speed start, `coordinated_demand` solver, 4.5m headway stand-off, and conservative `preview_only` physical lane policy.
- **Result:** all 32 riders physically passed the second reopening x1470m, finishing **180 accepted seconds**; rearmost x = **2008.918235m**.
- **Bounded physical moves:** **360 completed lane changes**, **zero detected swept collisions**, **zero detected road exits**, **zero near-stop rider ticks**.
- **Independent A67 overtake observer:** **87 genuinely sustained 3-second rider-pair passes** counted only from accepted physics. A77 now enforces **at least 80** independent sustained passes as a regression floor.
- **Deterministic replay:** exact complete physical + independent observer **90+90-second JSON checkpoint recovery**. Full reflected-road and renamed-rider physical trajectory and energy parity also passed.
- **Proof:** [A77 physical pilot and original A76 protected regression GitHub CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40768623858).

This closes a meaningful **32-rider synthetic mixed-width five-abreast pilot**, NOT 106/168 five-abreast capacity, NOT a real-length road race and NOT all geometries.

## Additional double-strong and neutral-start observations

- **8 riders**, body-valid five-abreast, 3.2m stand-off, `preview_only`: both 2.2m restrictions physically cleared for full 180s; 162 completed lane changes, but the independent eight-rider first-60-second observer counted **zero** genuine sustained passes. This is a small safety probe, not a sporting approval.
- **32 riders**, normal variable-speed start, 3.2m stand-off, `timed_speed_only`: double-2.2m 180s physical completion was possible, but **20 near-stop ticks**, a poor sporting candidate.
- **32 riders**, equal-speed 9.0m/s neutral rolling start, 4.5m stand-off, `timed_safe_corridor`: double-2.2m 180s physical completion with **875 lane changes** and **45 near-stop ticks**; it must **not** be promoted as fully realistic. The same neutral start on the staged profile passed 180s with 339 lateral changes and **zero near-stops**. Other equal-speed 8.5m/s starts failed at 5.5-7s.
- **Source:** [neutral-start and fixed-speed comparison CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40768839194).

The high 875 change count is not a proof of sporting quality; severe repeated weaving and near-stops require further analysis.

## Larger field failures are actual physical counterexamples

The opt-in 4.5m stand-off staged candidate from variable-speed starts first rejects a swept bicycle contact in:
- **106 riders:** t=4.0 seconds, pair r028/r034.
- **168 riders:** t=3.0 seconds, pair r153/r158.

The same 106/168 field on double-2.2m with the timed safe corridor first rejects a collision at 3.0s, pair r054/r059. Neutral 9.0m/s starting speeds move some first contacts to 3.5-5.5s, but **do not fix** larger field admission. These are not accepted collisions; each bad step is discarded before any physical or energy state change.

The existing `platoon_chain` and `platoon_soft_yield` coupling modes were tested as separate offline candidates against the five-abreast grid. They did **not** solve 106/168; some fail earlier or with a road-edge violation. Neither should replace the proven `preview_only` 32-rider controller.

- [Step77 full physical pilot, policy comparisons and first-contact evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40769092582)
- [Phase 2 candidate, direct 32/106/168 field test](../../scripts/v3/verify-a2-step77-physical-pilot-v3.mjs)
- [32 staged 180s + 3-second passes + exact replay](../../scripts/v3/verify-a2-step77-phase2-staged-success-v3.mjs)
- [Neutral start study](../../scripts/v3/probe-a2-step77-neutral-rolling-start-v3.mjs)
- [Chain comparison](../../scripts/v3/probe-a2-step77-chain-coupling-v3.mjs)

## Previously protected A76 performance unchanged

In the same successful A77 physical workflow, the original *three-abreast* A76 double-strong controller still passes all 32/106/168 fields for 180s, with **58/151/198 independent 3-second sustained pairs**, **35/120/169** physical lateral changes, zero collisions/road exits/near-stop ticks and exact 90+90s physics+observer recovery. This remains a separate benchmark, not proof of five-abreast starts.

## Immediate next work: A77 Phase 3, large-peloton physical queue dynamics

1. **Root-cause and solve actual 106/168 first-contact chains** under five-abreast starts, using current physical positions, predicted stopping envelopes, lead-speed constraints and already published static road geometry. Current repeated longitudinal contacts involve faster rear cyclists with exhausted -0.85m/s² braking authority while leaders decelerate. No invented additional braking force or instantaneous speed.
2. **Causally order lateral passages** from five positions into two. Prevent a lane's width-based mandatory inward steering from consuming the remaining 0.8m bicycle clearance unless neighboring riders have *actually* created a reachable longitudinal passing gap. No hard-coded 32-only rider or ID exceptions.
3. Require **32 then 106 then 168 riders**, across double-strong and staged roads, all beyond x1470m at 180s, no collision/road/near-stop events, physically meaningful sustained overtakes, exact observer+physics checkpoint, mirror and renamed-ID parity.
4. Once synthetic multi-gate acceptance is robust, use verified road widths, genuine curved grades and terrain, credible drafting/power/fatigue and long-lived attack/gap dynamics. Full 106/168 classified stages must be tested before Milestone A sporting approval.

**Overall decision: A77 phase 2 = PARTIALLY PASSED (32-rider staged mixed-width only). Milestone A = NO-GO. Milestone B/C = NOT STARTED. No live race, player data, clock, payout or Supabase change.**
