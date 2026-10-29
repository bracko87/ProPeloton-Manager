# Race Engine V3 — Step97 global physical timetable feasibility

**29 October 2026 — synthetic, research-only diagnostic and alternative initial booking study.** No new live pace policy, no modification to original A64, Supabase, A44 race history, users, game clock, payouts or classifications.

## Scientific question

Step96 demonstrated original A64 **0/8** 106/168 complete 180s, and 0/4 32-rider sporting completions. The local 3–5-rider controller generated coordinated assist/cap/steer proposals but did not create a whole-field feasible moving solution. A crucial distinction is whether the *initial five-abreast physical geometry* is impossible or whether the chosen **global appointment timetable** and existing local candidate selector fail.

Original 5-wide starts have road width **4.4m** and rider centers at y=.3,1.25,2.2,3.15,4.1, with 5.2m longitudinal row spacing; original bicycle longitudinal swept contact envelope **1.8m**, lateral **0.8m**, half-body **0.3m**, steering ≤0.38m/s, acceleration ≤+0.45m/s², braking ≤−0.85m/s². The two synthetic routes have a full-width approach up to x=680; first narrowing reaches maximum width at x=780: staged 3.3m/4 physical lateral slots; double 2.2m/2 lateral slots. Both have a second later narrowing. Under Step95 an achieved tick is unacceptable if speed falls below **6.5m/s before x680**, below **4.5m/s after x680** or below 1m/s anywhere.

## New mathematically necessary audit

[Step97 global timetabling certificate](../../scripts/v3/a2Step97FeasibilityCertificateV3.mjs) computes an **upper bound on physically reachable gate arrival time** from every ACTUAL initial x/v by maximally braking at the original legal −0.85m/s² to 6.5m/s before x680, then to 4.5m/s afterward, without instant speed changes. It also computes earliest possible arrival under +0.45m/s² and shortest straight-line y-target travel at 0.38m/s, and verifies each static booking's target fits the actual bicycle body inside the lane envelope. A gate appointment outside this conservative reachable interval is a provably inconsistent **fixed appointment** given the time-target requirement. It is **not** proof that the underlying real road cannot be negotiated under *some different crossing schedule*, and bookings are advisory in the current engine.

A first private analytic audit revealed **34** fixed first-gate appointments on the original 168-rider **double-pinch** 0.5s-spaced schedule that exceed the true piecewise-floor latest physically reachable time; the largest lateness is about **5.30 seconds**. The 106-rider case does not exhibit such a piecewise-floor contradiction (although an overly restrictive uniform 6.5m/s floor would suggest otherwise). Previous booking generator used a **5m/s** minimum for the entire approach, while the Step95 actual acceptance floor is higher before x680.

## Alternative longer global timing experiment

The [Step97 alternate global scheduler](../../scripts/v3/a2Step97TimetableProbeV3.mjs) generates a **new full-race, both-gate global appointment table at t=0**, rather than allocating conflicting short-range rider priorities on every tick. It uses the existing A77 global row/flank-wave reservation logic with a conservative **6.5m/s** minimum over the booking estimator and trials shorter 0.35s (and admissible 0.40s) global wave spacing. On an isolated all-9m/s starting grid, the existing original 168-double first gate last appointment is ≈65.14s; the 0.35s floor-aware alternate ends at ≈49.99s, inside all tested 1D latest reachable time windows, as a **necessary** schedule only.

A 0.35s nominal interwave time at constant 6.5m/s implies 2.275m longitudinal travel, above a 2.05m conservative same-lane gap, but this is **not** a guarantee when actual velocities change or crossing lanes overlap. Step95 permits 4.5m/s after x680, so the shorter wave interval cannot be claimed physically collision-safe on schedule evidence alone. **Every subsequent tick is still tested against the unchanged original A64 real bicycle 16-subinterval all-pair collision, road edges, +0.45/−0.85m/s² acceleration/braking and W-prime energy.** No accepted bicycle x/y/v changes, repairs, teleports, body-width edits or road widening; the only input altered is the **prestart synthetic booking table**, not any production data.

The long-horizon test requests 180 seconds of actual A64 racing (or honestly ends on first physical/moving rejection) for 106/168 × two road profiles × Step96 strict/balanced under global 0.35s and an additional strict 0.40s whenever the necessary booking windows exist. A separate protected 8/32, 16-mirror-and-renamed, true ≥3s passing, lane-changes and exact 90+90 physical/observer checkpoint test evaluates sporting integrity under the alternate timetable. The preliminary original first 4s straight 5-wide full-body baseline probes test whether the *initial grid itself* is already impossible before taper; even success cannot establish gate passage.

## Acceptance and scope

The [dedicated Step97 workflow](../../.github/workflows/v3-step97-global-feasibility.yml) also reruns protected Step78/85/86/87/89/90/91/92/93/94/95/96 units and production React build. **Technically green fail-closed rejections do not constitute sporting success**. Milestone A GO still requires full 180s for both 106 and 168 five-wide fields through the second gate, zero contact/road/energy violations and zero committed crawling, substantial sustained overtaking, nonpathological lane changes, original physical and mirror/replay parity.

No Milestone B gameplay integration or Milestone C production release is authorized. Preserve the protected Step86 32-rider full180 benchmark (staged 80 real sustained passes/411 lane changes, double 70/678).


## Step97 actual original A64 evidence

[Dedicated Step97 Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40912578574) executed the new global necessary-timing certificate, protected early physical regressions, full-field alternative prestart global bookings, mirrored/renamed original physics and independent overtaking/checkpoint tests. The research tests do not edit the A64 solver, steering limit, bicycle body, allowed acceleration/brake, W-prime, accepted positions, road width or any live user/race state.

### Original appointment contradiction independently reproduced

For 168 riders, double narrowing, original fixed global **0.50s-wave** booking, actual initial nine m/s speed and 5.2m start-row spacing, there are **34 first-gate fixed appointments** later than the maximum time permitted by physical braking −0.85m/s² and the ACTUAL piecewise Step95 lower speed floors (6.5m/s while x<680 and 4.5m/s afterward). Largest provable *conditional fixed-appointment* deficit is **5.299588 seconds**. No such piecewise-floor contradiction was found for the corresponding 106-double timetable or either staged route. The original scheduler's independent 5.0m/s minimum is not consistent with the stricter current accepted-motion rules in these 34 cases.

With a newly calculated 0.35s wave interval and minimum booking speed 6.5m/s, all eight 8/32/106/168 × staged/double 2-gate *necessary* booking screens have complete assignments and zero arrival/lateral/body-boundary contradictions. For the 168-double first gate, the last scheduled appointment moves from **65.141016s** to **49.991016s**. For 106-double it moves **46.141016s → 36.691016s**. All this means only that individually reachable time windows can be assigned. **No slot-time plan alone proves no swept bicycle collision**; with a permitted 4.5m/s downstream speed a 0.35s interwave nominal difference could in fact be too small for 2.05m longitudinal clearance if the riders used the same physical lane.

The unit test also runs the actual original A64 solver for 4 seconds with all riders initially 5-abreast, riding straight ahead at 9m/s on the untouched x=600 / 5.2m row grid; both 106/168 sizes on both synthetic profiles remain legal, moving and wholly upstream of the narrowing. This rules out an *immediate* physically overlapped start in this control, but does not prove a possible future merge, let alone 180 seconds.

### Re-timed 180-second original A64 race attempts

All attempts are full requests to 180 seconds; a rejected first physical/Step95 moving tick ends the case and is explicitly a sporting **NO-GO**, never credited as a finish. All 11 actual A64 replays had zero *accepted* near-stops, zero accepted speeds <6.5m/s upstream or <4.5m/s downstream. No race passed the second gate.

| Riders | Route | Controller | New global slot | Actually accepted | First reason |
| --- | --- | --- | ---: | ---: | --- |
| 106 | staged | strict | 0.35s | 10.5s | NO_SAFE_PHYSICAL_REQUEST |
| 106 | staged | strict | 0.40s | 11s | NO_SAFE_PHYSICAL_REQUEST |
| 106 | staged | balanced | 0.35s | 8.5s | NO_SAFE_PHYSICAL_REQUEST |
| 106 | double | strict | 0.35s | 9s | A95_NO_MOVING_PHYSICAL_REQUEST |
| 106 | double | strict | 0.40s | 10s | NO_SAFE_PHYSICAL_REQUEST |
| 106 | double | balanced | 0.35s | 8s | NO_SAFE_PHYSICAL_REQUEST |
| 168 | staged | strict | 0.35s | 11.5s | A95_NO_MOVING_PHYSICAL_REQUEST |
| 168 | staged | strict | 0.40s | 11.5s | A95_NO_MOVING_PHYSICAL_REQUEST |
| 168 | staged | balanced | 0.35s | 11s | NO_SAFE_PHYSICAL_REQUEST |
| 168 | double | strict | 0.35s | 10s | NO_SAFE_PHYSICAL_REQUEST |
| 168 | double | balanced | 0.35s | 8s | NO_SAFE_PHYSICAL_REQUEST |

The original Step96 106-double strict accepted only 2.5s under the old fixed timetable, versus 9–10s after global re-timing; the new global schedule is therefore a **measurable improvement on this single early-failing fixture** but not a sporting success. Conversely, 106 staged strict was previously 13s and fell to 10.5–11s. Global timetable changes are not a sufficient physical-control solution. **0/11 106/168 original-solver 180s finishes.**

### Independent physical symmetry, racing quality and exact replay

All **16 original-A64 mirrored/renamed physical comparisons** passed (including accepted x/y/v, real energy and chosen policy). Both 8-rider strict original-body 0.35s-timed races finished 180 seconds with no near-stops and all riders through gate two; staged had **8** independent sustained ≥3s overtakes and **115** actual lane changes, double had **6** and **135**, respectively. Both passed exact **90+90 serialized original physical plus independently tracked overtaking observer checkpoint restoration**.

All 32-rider re-timed trials remain **NO-GO**: staged strict 10s, balanced 8s; double strict 7.5s, balanced 7s, none reached second gate or even their 90s checkpoint. Protected Step86 retained full 180s staged 80 sustained overtakes / 411 lane changes and double 70 overtakes / 678 changes; it is superior to the new test controller.

### Engineering conclusion and Step98 direction

Step97 establishes an actual **fixed-booking reachability inconsistency** for the 168-double old timetable, but also establishes that removing all identifiable individual arrival-window contradictions is **not enough** to make the full peloton move safely. The original A64 solver's clear 4s 5-abreast approach establishes that initial geometry is not inherently invalid. The unresolved question is sustained multirow, multilane *coupled* feasibility while every rider keeps >=6.5m/s upstream and >=4.5m/s downstream.

Step98 should not impose a new arbitrary short-range priority rule or equate a green feasibility screen with a trajectory. Build a physically swept **longer-horizon globally coupled** x/y/v plan across upstream acceleration and corridor releases, with real signed longitudinal separation and temporal ordering at lane crossings; test *whether* any such plan is attainable under current A64 dynamics, and if none is found distinguish finite-search failure from mathematical impossibility. Keep Step86 as protected 32r sporting control, preserve true passing/replay and never relax bicycle collision or allowed energy.

**Milestone A remains sporting NO-GO. No Milestone B game integration, no Milestone C production release or changes to live Supabase data, results, payout, classifications or game clock.**
