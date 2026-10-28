# Race Engine V3 — Step 76: repeated road narrowing, 180-second peloton physics, and five-abreast admission boundary

**28 October 2026 — offline technical validation PASS for two consecutive 2.2-metre synthetic bottlenecks with 32/106/168 riders and independently observed sustained overtakes; mixed-width admission and physically valid five-abreast entry remain BLOCKED. Full-stage sporting and production NO-GO.**

## Scope and unchanged physical limits

Step 75 demonstrated 168 riders passing a **single** 2.2m synthetic narrowing in 120s. Step 76 tests whether that safety is robust across more complex road-width sequences and more realistic initial cross-sectional occupancy.

We introduced *research-only* [two constriction geometries](../../scripts/v3/a2VariableRoadWidthV3.mjs):

- **`double_pinch`**: normal 4.4m → 2.2m → 4.4m profile with its original first narrow section at x680–1020m, then a **second independent narrow section** at x1130–1470m, reaching 2.2m width from x1230–1370m.
- **`staged_pinch`**: first, a milder **3.3m** width restriction at x680–1020m, then the same later **2.2m** section at x1130–1470m.

Both geometries remain laterally **centered**, flat, and synthetic. They do not describe sourced real roads, road curvature, banking, varying slopes, or traffic restrictions. Earlier `constant`, `mild_pinch`, and `strong_pinch` evaluate to exactly their previous spatial values; the existing Step 75 policy and physical limits are not loosened.

The solver still enforces simultaneous 0.5s ticks, longitudinal swept bicycle occupancy, lateral separation, **full 0.3m bicycle half-width** in the road envelope, maximum **0.38m/s lateral steering**, **+0.45/−0.85m/s²** acceleration/braking, W-prime accounting, and fail-closed rejection before committing a bad physical step. No time, lane or position jumps, skipped collision checks, geometry widening, or official data modifications were used.

## Full-field second constriction results

We ran the already-validated **`platoon_gate_tail_surge`** research policy from normal three-abreast starts, preserving its one initial x780m entry timetable. Notably, the controller does **not** have a second explicitly booked x1230m admission. Both successive physical bottlenecks still survived for the full 180s pilot.

| Actual 180-second test, two 2.2m constrictions | 32 riders | 106 riders | 168 riders |
|---|---:|---:|---:|
| Physical status | **FULL_HORIZON_CLEAR** | **FULL_HORIZON_CLEAR** | **FULL_HORIZON_CLEAR** |
| Confirmed finished second reopening x1470m | **32/32** | **106/106** | **168/168** |
| Rearmost cyclist x (m) | **2051.350** | **1784.305** | **1563.196** |
| Completed bounded lateral lane changes | **35** | **120** | **169** |
| Independent sustained rider-pair passes (≥3s maintained) | **58** | **151** | **198** |
| Detected swept contacts, full-bike road exits, near-stop ticks | **0** | **0** | **0** |
| Exact 90+90s serialized physical **and independent observer** recovery | **PASS** | **PASS** | **PASS** |
| Reflected-road physical trajectory and renamed-ID outcome parity | **PASS** | **PASS** | **PASS** |

The independent observer only sees fully accepted movements. The sustained rider-pair-pass metric requires a real crossing, established lead and three seconds of persistent separation—not simply an end-rank inversion or an initiated lane change.

To prevent a future regression from being counted as "technical success" despite reduced passing, the final A76 acceptance test *requires* **at least 55 / 145 / 190 independently confirmed sustained 3-second rider-pair passes** (32/106/168), at least 30/110/150 completed lane changes, all cyclists beyond x1470m, full 180s uninterrupted physics, zero near-stops, and exact 90+90s combined observer and physics recovery.

These proofs cover only the finite **180-second synthetic test**, not a professional road race or 3-hour stage.

## Mixed-width sequence: real limitation exposed

The existing `platoon_no_yield_control` policy, which has **no explicit second two-slot schedule**, was checked on the **3.3m first pinch followed by a 2.2m second pinch**. Its field may appear stable earlier but is still **not safe for this new route**:

| Field | Last accepted physical time | Actual outcome | First rejected rider pair |
|---|---:|---|---|
| 32 riders | **64.5s** | SWEPT_CONTACT | r004/r011 |
| 106 riders | **64.5s** | SWEPT_CONTACT | r004/r011 |
| 168 riders | **64.5s** | SWEPT_CONTACT | r004/r011 |

Each first contact is rejected *without* accepting the colliding step or modifying energy. The three fields preserve reflected-road and renamed-ID trajectory parity up to the rejection. This is a useful control: passing `double_pinch` under one specified scheduler does **not** imply arbitrary narrowing sequences can be entered safely under a different scheduler.

## Five-abreast initial field: physically valid, but unbookable

An optional `five_dense` initial mode places five bicycles in one row at **y=0.30, 1.25, 2.20, 3.15, 4.10m**, with true 0.3m half-body margins on the 4.4m starting road. Unlike the historical five-lane points at y=0 and 4.4m, all five new centres are **body-valid** at the starting cross-section.

The current A73–A75 two-slot reservation planner assumes at most one rider per outer or centre corridor per geometric start row. It cannot yet establish a safe five-to-two longitudinal/sideways order for the `five_dense` rows:

| Initial field | Required two-slot booking | Actual physical outcome |
|---|---|---|
| 32 riders in five-abreast starting rows | **UNRESOLVED** | `GATE_ENTRY_NO_WINDOW` at t=0 |
| 106 riders in five-abreast starting rows | **UNRESOLVED** | `GATE_ENTRY_NO_WINDOW` at t=0 |
| 168 riders in five-abreast starting rows | **UNRESOLVED** | `GATE_ENTRY_NO_WINDOW` at t=0 |

This is correct **fail-closed behavior**, not a completed five-to-two merge. No rider state, W-prime, or accepted time is changed. Reflected and renamed field outcomes match.

As a separate geometric negative control, putting a full-width bicycle centre at y=1.10m while x=1230m (when the road is only 2.2m wide) produces an immediate **ROAD_ENVELOPE_VIOLATION**, despite any valid booking for the earlier x780m gate. The physical road-edge margin cannot be bypassed by an outdated slot reservation.

## Validation

- [Step 76 geometric, mixed-width and five-abreast adversarial suite](../../scripts/v3/verify-a2-step76-route-diversity-v3.mjs)
- [Step 76 independent accepted-physics 180s sustained overtakes and replay](../../scripts/v3/verify-a2-step76-double-passing-v3.mjs)
- [Dedicated GitHub Actions and both retained JSON evidence artifacts](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step76-route-diversity-targeted.yml)
- [Comprehensive A63–A76, earlier A58–A39 complete-stage and React production build workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

All new policies remain **opt-in offline research** on GitHub `main`. Previously demonstrated A75 168-rider strong t120 benchmarks, 106/168-rider mild t120 verified passing, A63 67/67 safety cases and all earlier research cases are retained and not weakened.

## Next: Step 77

Build a **general nonclairvoyant multi-gate entry and physical row sequencing planner** that handles width transitions **without hard-coding one x780m gate**; specifically:

1. Progress from a body-valid five-abreast starting grid into narrower lanes using bounded movement and safe longitudinal spacing, keeping ID/reflection fairness and independent passing checks.
2. Reserve physically achievable arrival windows for multiple gate locations (including a mild 3.3m pinch followed by a 2.2m two-slot narrowing). A successful first narrowing must not imply safe admission to the second.
3. Stress-test extended 106/168-rider simulations for several minutes and actual staged road profiles; prevent any silent retreat from the protected double-strong t180 passes.
4. Then introduce actual sourced event road width/grade and bank, curved geometry/corner speed, aerodynamics and drafting, realistic terrain-sensitive power/energy, long-lived group separation, attacks, team tactics and official finish classifications before Milestone A can be called sporting-complete.

**Sporting/full-stage NO-GO; Milestones B and C NOT STARTED.** No live race engine switch, Supabase records, historical result, classification, payout, game clock or deployment was deliberately altered.
