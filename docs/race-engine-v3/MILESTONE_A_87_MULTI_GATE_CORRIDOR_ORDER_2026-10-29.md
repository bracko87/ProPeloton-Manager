# Race Engine V3 — Step 87: geometric corridor partial-order and chained multi-gate arrival windows

**Research date:** 29 October 2026.  
**Status:** Synthetic/offline opt-in research. **Milestone A realistic 106/168 five-abreast full-race sporting NO-GO.** No production physical engine, race results or Supabase records changed.

## New algorithm and physical authority

[Step87 corridor partial-order planner](../../scripts/v3/a2Step87CorridorOrderV3.mjs) attempts to coordinate physical front-to-back passage through two narrowing gates, rather than making each rider treat their next booked lane independently:

1. Every provisional node starts from the cyclist's **actually accepted** current x, y, speed, immutable per-rider gate target and the current half-second clock. The individual first-gate acceleration-limited arrival interval is computed using Step82's +0.45m/s² / −0.85m/s² speed bounds, and the time necessary to actually steer to the booked slot is included at **0.38m/s**. This is **necessary** kinematic feasibility only.
2. Build directed crossing/occupancy precedences for nearby cyclists booking the same 2.2m corridor or intersecting 2D steering envelopes. A presently leading bicycle has geometric priority. An exact longitudinal and road-center-distance tie is **ambiguous** and neither side is granted priority by rider ID, input array position or left/right direction. Propagate minimum time-separated provisional arrival constraints across all preceding neighboring rows; flag inconsistent necessary windows, rather than claiming a collision-free future.
3. **Second-gate chain:** for each rider with a second actual booked gate, carry forward its necessary first-gate arrival, minimum front-to-second-gate travel time (bounded by attainable max moving speed) and the steering time required to switch booked corridors. Independently check row-order separation at the second gate as well. Missing/outside-horizon future information is **UNKNOWN**, not proof the course is impassable. No predicted accepted x/y/v, energy or official arrival time is written.
4. Produce four per-half-second **only requested control fields**: `order_hold`, `order_release`, `order_pace`, `order_balanced`. The later iteration also guards immediate *achieved* gap to the preceding row; if a real follower is too close, its lateral merge request is held and pace variants ask for gentle, floor-bounded yielding rather than accelerating blindly into an occupied corridor.
5. Two explicit research policies, `corridor_order_v1` (hard no committed near-stop first tick) and `corridor_release_v1` (sporting near-stop penalized, not hard-vetoed), are connected via [the offline physical candidate wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs). Each selects among six synchronized **whole-field** requests including the historical baseline, Step78 joint viability, proven Step86 gap wave and new corridor-order variants. The Step85 2–3-tick receding horizon evaluates **only actually A64-swept full-body hypothetical continuations**. Its selected first real 0.5s movement is independently re-swept by the unchanged A64 full-bicycle/road-boundary/W′ energy physics. Failed movements are not committed, and temporary imagined futures are discarded.

**Important:** Neither a feasible necessary arrival interval, a directed partial order nor the second-gate chain is a sufficient joint 2D space-time certificate. This research does not change the official race simulation, widen the road, override maximum steering/braking/acceleration, force positions or modify player records.

## True 106/168 five-abreast full 180-second attempts

[Step87 large-field authoritative full-horizon CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40873583294) **completed SUCCESS for honest fail-closed physical assertions, but sporting NO-GO**. All eight 106/168-rider × two actual road profiles × two Step87 policies were *requested for a full 180s*. Their first original A64 all-pair swept-body contacts were recorded, not hidden or repaired:

| Actual starting field | Order-policy accepted duration | Release-policy accepted duration | Near-stop rider ticks | Sporting outcome |
| --- | ---: | ---: | ---: | --- |
| 106, staged 3.3→2.2m | **15.5s** | 11.5s | 0 | Both actual SWEPT_CONTACT failures |
| 106, double 2.2m | **10s** | 10s | 0 | Both actual SWEPT_CONTACT failures |
| 168, staged 3.3→2.2m | 11.5s | **12s** | 0 | Both actual SWEPT_CONTACT failures |
| 168, double 2.2m | **10s** | 10s | 0 | Both actual SWEPT_CONTACT failures |

**Zero of eight** large-field test cases got every rider past the second reopening or reached the requested 180 seconds. These real rejected contacts occurred among adjoining rows including r026/r030 (106 staged) and r033/r038 (both double-narrowing sizes). The 106 staged case improves Step86's best 11.5s by 4 seconds, but double-narrowing and most 168 cases remain behind Step86 or broadly similar. A 0 near-stop count **before the rejected contact** does not imply full-race no-stop feasibility.

The first Step87 version (before immediate headway adjustment) achieved **13s** on 106 staged; the correction reaches **15.5s**. The second-gate schedule is diagnostic and does not grant any physical clearance, so adding the second-gate chain does not rewrite the previously accepted trajectories.

## Final 16-case original-swept physical matrix

The [Step87 final A64 matrix and protected regression workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40873629590) completed **SUCCESS**, including the exact geometry/identity/mirrored two-gate planning tests, genuine 8/32/106/168 × both layouts × two policies original swept physical runs, protected A86/A85/A78/A76 tests, uploaded original-solver JSON evidence and React production build. **Technical green explicitly includes honest first-contact rejection.**

| Size / synthetic narrowing | Strict corridor order accepted | Corridor release accepted | Near-stop ticks | Meaning |
| --- | ---: | ---: | ---: | --- |
| 8 staged | 40s test horizon | 40s test horizon | 0 | Short initial physical check |
| 8 double | 40s test horizon | 40s test horizon | 0 | Short initial physical check |
| 32 staged | 12.5s, swept collision | 12.5s, swept collision | 0 | Both fail true sporting duration |
| 32 double | **50s test horizon** | 12s, swept collision | 0 | Strict avoids early collision; full 180s still separately required |
| 106 staged | **15.5s**, swept collision | 11.5s, swept collision | 0 | Original collision prevented further motion |
| 106 double | 10s, swept collision | 10s, swept collision | 0 | Original collision prevented further motion |
| 168 staged | 11.5s, swept collision | **12s**, swept collision | 0 | Original collision prevented further motion |
| 168 double | 10s, swept collision | 10s, swept collision | 0 | Original collision prevented further motion |

The new necessary second-gate schedule is never treated as a guarantee that each bicycle can pass both gates. The first rejected physical state is **not** committed. All 16 actual initial checks passed their correctly strict assertions.

## Strict technical and sporting tests

- [Step87 16 original swept-body cases, mirror/name/array-order and two-gate necessary-window assertions](../../scripts/v3/verify-a2-step87-corridor-physical-v3.mjs) exercises 8, 32, 106, 168 riders from physical five-abreast rolling starts on both profiles. The hard strict-mode test ensures it never commits even one near-stop rider tick, and checks all accepted energy values and preserved previous state on a rejected contact. Its new unit cases include a true equal-x crossing conflict with **no arbitrary winner**, an already occupied corridor whose rear rider must yield instead of merging, and second-gate chaining after first-gate travel/steer bounds.
- [Step87 independent full-field fairness and 8/32 full sporting verification](../../scripts/v3/verify-a2-step87-physical-parity-replay-v3.mjs) checks 16 actually swept 8/32/106/168 × staged/double × policy reflected/renamed trajectories, then attempts full 180-second 8/32 physical racing with an **independent sustained ≥3-second passing observer** and exact serialized 90+90 physical plus observer recovery for every real completed 180s configuration.
- [Step87 16-case technical CI with protected Step86, Step85, Step78, Step76 and React](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40873629590) completed **SUCCESS**. [Step87 full parity/observer CI with protected Step86](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40873583125) must be judged by its separate actual completion and racing metrics. A technically successful CI suite proves honest physical/rejection behavior and regression integrity, **not** that a new 32/106/168 configuration has achieved sporting realism.

### Historical protected benchmarks

- **Step78 32r five-abreast staged:** 180 seconds, zero near-stops, 87 independent sustained ≥3-second overtakes and 356 physical lane changes.
- **Step84 32r five-abreast staged:** 180 seconds, zero near-stops, 83 passes and 370 lane changes.
- **Step85 32r five-abreast double:** 180 seconds, zero near-stops, 66 passes and 752 lane changes.
- **Step86 32r five-abreast staged wave:** 180 seconds, zero near-stops, 80 passes and 411 lane changes.
- **Step86 32r five-abreast double wave:** 180 seconds, zero near-stops, **70 passes and 678 lane changes**, exact 90+90 checkpoint.
- **Step76 32/106/168 three-abreast** (NOT five-wide) double strong: 180 seconds, 58/151/198 independent 3-second sustained overtakes.

Keep all these baselines intact. An experimental Step87 configuration must **not** silently replace a more realistic prior controller simply because its future-order graph is more sophisticated.

## Step88 proposed next engineering gate

Prioritize a true **coupled spatial corridor slot-and-velocity solver** over more pairwise yield heuristics. The ordering graph must be translated into jointly consistent, dynamically attainable *whole-row* speed and lateral control with explicit occupation intervals for 0.6m full body width, propagated multi-row capacity and sustainable throughput. A local 1.5s preview cannot repair conflicts that become unavoidable earlier. Require explicit A64 physical 180s completions at **32, 106 and 168 five-abreast**, both road profiles, all riders beyond the second gate, zero real body contact, exits, near-stop rider ticks and W′ failures, credible ≥3s passing and lane-change counts, mirrored/renamed neutrality and exact serialized 90+90 actual bicycle/observer recovery. Only then consider integration/milestone B and an independently authorized milestone C production release.

**No production race engine, Supabase race, rider histories, payouts, game clock or player data was altered. Main-only owner-scoped writes remain opt-in synthetic research and CI. Milestone A 106/168 sporting NO-GO; B/C NOT STARTED.**
