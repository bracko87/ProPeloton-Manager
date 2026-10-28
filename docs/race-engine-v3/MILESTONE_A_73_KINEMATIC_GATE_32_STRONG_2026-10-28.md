# Race Engine V3 — Step 73: kinematically reachable two-slot windows and first 32-rider full-body strong-pinch traversal

**28 October 2026 — technical regression PASS; synthetic 32-rider strong 2.2m road pilot PASS for 120 seconds, with 55 independently confirmed sustained rider-pair passes. The complete 106/168-rider strong-road test still FAILS; full-stage sporting and production NO-GO.**

## The obstacle and why a static booking is not enough

The existing five-lane reference road narrows from **4.4m to 2.2m**, then widens again, with a provisional **0.3m half-width bicycle**, **0.8m all-pair lateral exclusion** and **1.8m swept longitudinal exclusion**. At the worst cross-section only **two** riders can safely be physically abreast. Step 72's old fixed-row pace warnings either produced early collision chains or held merging riders at the road edge; they are not approved.

A useful time booking must be physically reachable: if a rider is only 1m before the road constriction travelling 30m/s, they cannot suddenly become 2.35m behind an adjacent cyclist before passing that section, no matter how clean a proposed timetable appears.

[Step 73's pure two-slot feasibility module](../../scripts/v3/a2TwoSlotFeasibilityV3.mjs) now calculates **necessary** arrival-time envelopes using the available **+0.45m/s² acceleration, −0.85m/s² braking, current speed and desired-speed cap**, a provisional **5m/s minimum non-stalled speed**, distance to **x=780m** and a **0.38m/s maximum lateral steering rate**. For each initial geometric three-rider row it proposes simultaneous physically separated left/right positions **y=1.45m/2.95m**, then schedules the centre rider **at least 0.5 seconds later**. At 5m/s this represents at least 2.5m of longitudinal movement, greater than the requested **2.35m** clearance. Each succeeding row starts after the previous centre's reserved half-second interval.

This is **only a necessary scheduling test**, not a certification that riders can follow those windows while avoiding every other rider, power limit and changing road edge. Bookings are based on **physical initial row location**, not rider-ID priority or future accepted race paths. Once a row cannot fit in the reachable window, its following rows remain **blocked**, not artificially admitted.

## Actual field experiment — a physical breakthrough for 32 riders

The new optional research-only [`platoon_gate_schedule` policy](../../scripts/v3/a2NormalStartPelotonV3.mjs) freezes its initial row bookings in the replayable snapshot. It requests an attainable scheduled approach speed, blocks unsafe discretionary lateral moves while the same-row centre rider remains too close, gradually steers authorised flanks towards the two inside targets and resumes ordinary passing after the road opens. The physical integrator still decides every accepted move. **No position reset, speed teleport, forbidden acceleration, widened road, skipped collision, or after-contact repair was introduced.**

| Same ordinary synthetic 3-column start | Step 71 strong-road historical control | New Step 73 physical slot timetable |
|---|---|---|
| 32 riders, 120s requested | Roadside violation after **20s accepted** | **FULL_HORIZON_CLEAR — 120s accepted** |
| 106 riders, 90s requested | Swept contact after **15.5s** | Swept contact after **43s** |
| 168 riders, 90s requested | Swept contact after **15.5s** | Swept contact after **43s** |

The **32-rider 120s test** now passes an unusually strict acceptance gate:

- All **32 physical bicycle centres** travel past the x=1020m *end of the re-expansion*, not merely remain alive until the simulation timer expires.
- **24 completed physical lateral lane changes**, **55 independently confirmed sustained 3-second rider-pair passes** using the A67 post-acceptance overtake observer, **zero near-stop rider-ticks**, **zero missed booked entry windows**, **zero swept pair contacts**, and **zero full bicycle-body road-edge violations**.
- The complete field and independent passing observer reproduce **exactly** after saving and resuming a serialized **60+60-second** physical checkpoint.
- Mirror-reflected road starts and bijectively relabeled rider IDs preserve physical accepted x/y, failure/finish status, progress and W-prime. No cyclist gains scheduling priority from their numerical ID.

**This is a real improvement within synthetic research**, not a finished competitive road stage or production activation. All road widths, powers, slots, initial grids and speed demands remain uncalibrated assumptions. The 55 count is confirmed **pair passes**, not 55 unique riders or a classification.

## Unresolved larger peloton contact, with exact physics

The first **106/168-rider** new policy rejection is now delayed from 15.5 to **43 accepted seconds**; in both tests the first rejected pair is **r088/r090** near road x≈729m. At a rejected microstep:
- Centre rider `r088` was near **y=2.20m**, x≈729.736m, current speed ≈**4.968m/s**, accelerating at the permitted **+0.45m/s²**.
- Outside rider `r090` was near **y=1.45m**, x≈727.929m, current speed ≈**5.705m/s**, already braking at **−0.85m/s²**.
- Their approximate longitudinal separation was **1.807m**, while their lateral separation was only **0.75m**, insufficient to pass beside one another without longitudinal bicycle clearance.

The contact is **physically impossible to avoid within that final half-second** because the follower has already reached its braking limit while the centre rider is accelerating. The planner must create longitudinal clearance *earlier across the adjacent rows*, and must preserve upstream safe space throughout the 106/168 field, not simply reserve each initial triple independently.

Step 73 therefore also screened the opt-in **`platoon_gate_crossrow`** variant, which gives earlier current-state pace warnings to an outside rider approaching a slower centre rider in the next row. **Rejected:** it causes a new contact between **r016/r017** after only **20 accepted seconds** in *all three* fields, degrading the 32-rider fully cleared reference. Its failure remains recorded; it is NOT selected or masked behind CI's green technical audit.

| Field | `platoon_gate_schedule` | Cross-row pace candidate | Accepted physical outcome |
|---|---|---|---|
| 32 | **120s clear, 24 lanes, 55 verified sustained pair passes** | **20s**, first contact r016/r017 | Reject cross-row variant |
| 106 | **43s**, first contact r088/r090 | **20s**, first contact r016/r017 | Neither fully crosses |
| 168 | **43s**, first contact r088/r090 | **20s**, first contact r016/r017 | Neither fully crosses |

All failed starts stop at the **last fully accepted 0.5s step**. Every contact is preserved as the first rejected microinterval with rider positions, actual bounded acceleration and road dimensions. No official result is written.

## The feasibility audit's negative controls

- All **32, 106, and 168** ordinary synthetic starts have **necessary** reachable entry windows: the last planned slot release is approximately **31.93s, 56.43s and 76.93s**, respectively, with a 120s theoretical booking horizon. This is NOT sufficient evidence of safe passage—the actual 106/168 fields still collide.
- Three 30m/s cyclists starting only **1m from the narrow gate** in the same row have **NO_REACHABLE_SLOT_WINDOW**; at that speed, their usable arrival-time range is about 0.033s, much less than the required 0.5s centre/flank separation. No instant slot placement is allowed.
- An already-passed gate, a too-short deadline and a row downstream of an unresolved previous row are explicitly marked inadmissible.
- A road wider than two physical slots is diagnosed **NOT_TWO_SLOT**, preventing the strong-road scheduler from claiming to explain Step 72's successful 3.3m mild-road experiment.
- Reflection/relabel booking parity, invalid input rejection, physical swept safety, full bicycle-width margin, energy validity, actual traversed x bounds, zero near-stops, actual real overtakes and exact checkpoint recovery are hard, not optional, test assertions.

## Validation and next milestone

- [Step 73 physical and adversarial test source](../../scripts/v3/verify-a2-step73-feasibility-v3.mjs)
- [Dedicated Step 73 GitHub Actions audit and JSON evidence](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step73-feasibility-targeted.yml)
- [Complete maintained A63–A73, historical A58–A39 and React production build workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

**Next Step 74:** preserve the proven **32-rider 2.2m 120s result (24 actual lane moves, 55 actual 3s sustained pair passes)** and the **106/168-rider 3.3m 120s result (51/77 physical lane moves, 324/520 true sustained pair passes)** as immovable safety baselines. Design a **joint queue and cross-row interval admission** control that prevents the r088/r090 rear collision before it becomes kinematically unavoidable, *without* causing the already-recorded r016/r017 early-contact regression. Focus on continuously feasible same-lane and adjacent-lane following envelopes, actual rider power and fair merge ordering. Only after **106 and 168 full-bicycle strong-road multi-minute traversals** survive with genuine passing and zero near-stops should real-source road widths, drafting, fatigue, actual route geometry and full stages be approved.

**Sporting/production gate: NO-GO. Milestone A incomplete for complete stages; Milestones B/C not done.** No production policy, Netlify deployment, Supabase record, official race data, player results, payout, ranking or game clock was changed by this offline research.
