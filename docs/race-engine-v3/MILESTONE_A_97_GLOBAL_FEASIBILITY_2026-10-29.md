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
