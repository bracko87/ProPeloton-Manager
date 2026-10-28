# Race Engine V3 — Step 69: multi-rider merge-chain trials and advance lane admission

**28 October 2026 — offline technical research gate PASS. Full-width transition sporting gate NO-GO. No production activation.**

## Baseline and cause from A68

[Step 68](MILESTONE_A_68_VARIABLE_ROAD_WIDTH_2026-10-28.md) introduced synthetic centered spatial road widths **4.4m → 3.3m (mild)** or **4.4m → 2.2m (strong)**, with both profiles widening back to 4.4m. The original 3-column initial peloton was safe on the constant-width corridor but the narrowing test rejected contact at the **r002/r005** inward merge, or, after single-rider yielding, at the **r011/r014** upstream braking chain at 9.96875s. Both the lead and faster follower were already braking at the full **−0.85m/s²** limit. Forcing yet more braking to that pair cannot rescue its existing closing gap.

The A69 research does not read future accepted A44 motion, pick special rider IDs, skip failed pairs, reduce bicycle collision envelopes or change the road geometry to produce success. All scenarios use **ordinary t=0** starts, the unchanged current-state **0.5s** synchronous field, **16 swept-contact subintervals**, physical acceleration **−0.85 to +0.45m/s²**, steering **0.38m/s**, W-prime accounting, road-boundary checks, and exact fail-closed state commits.

## New candidate policies

- **`platoon_soft_yield`:** reserve an occupied lane but do not abruptly force the trailing rider to maximum braking. Actual current-state headway determines the bounded speed command.
- **`platoon_chain`:** soft yielding plus iterative within-step multi-rider gap constraints. A nearby front rider may increase its acceleration up to **+0.45m/s²** to create clearance when a follower cannot brake any more, subject to the other riders' physical constraints. An unsatisfiable chain remains fail-closed.
- **`platoon_lane_forecast`:** before starting an overtaking move, inspect the **known static road envelope over the next 20s at current speed**. Avoid moving farther outward into a corridor that disappears before the cyclist can finish its pass. Riders may still move safely laterally in available middle lanes and resume outside-lane passing after the road opens.
- **`platoon_lane_forecast_chain`:** lane forecast plus multi-rider bounded leader assistance.
- **`platoon_lane_forecast_buffer`:** lane forecast plus advance following-distance reservations using the minimum road width seen in 0–20s.
- **`platoon_velocity_headway`:** lane forecast plus a demand-based following gap scaled with the **actual present relative closing speed** and its ordinary **0.85m/s²** stopping distance, instead of using a fixed **3.2m** target.

The previous **`yield_reservation`** remains the matched A68 baseline. All alternatives are explicitly opt-in research policies. The selected game race engine is unchanged.

## Fully observed 32/106/168-rider comparisons

Each policy was run from the same three-column start in both changing-width profiles. **32 riders were requested for 120s; 106 and 168 riders for 90s**. A completion below the requested duration is a **real swept rider contact or road boundary rejection**; no post-failure movement was accepted.

| Merge policy | 32 mild, 120s target | 32 strong, 120s target | 106/168 mild, 90s target | 106/168 strong, 90s target |
|---|---|---|---|---|
| A68 single-rider yield | contact after **9.5s accepted** | contact after **9.5s** | contact after **9.5s** | contact after **9.5s** |
| Soft yield | boundary reject **8.5s** | boundary reject **8.5s** | boundary reject **8.5s** | boundary reject **8.5s** |
| Multi-rider leader assist | contact **9.5s** | contact **9.5s** | contact **9.5s** | contact **9.5s** |
| **Road-aware lane forecast** | **120s CLEAR** | **120s CLEAR** | contact after **22.5s** | contact after **15.5s** |
| Lane forecast + leader assist | contact **4s** | contact **4s** | contact **3.5s** | contact **3.5s** |
| Lane forecast + advance gap buffer | **120s CLEAR** | **120s CLEAR** | contact **14.5s** | contact **12.5s** |
| Lane forecast + dynamic closing-speed headway | **120s CLEAR** | **120s CLEAR** | road-edge reject **23.5s** | contact **17s** |

The 106- and 168-rider runs have **the same leading first-blocker times** under each tested candidate: their early front groups are identical, so this repetition is not independent proof of full-peloton scalability.

The best all-purpose research candidate for this fixed starting grid is currently **`platoon_lane_forecast`**, *not yet a live race policy*:

- In **both 32-rider profiles**, it completes the entire **120-second** test with **zero swept contacts, zero detected road exits, zero near-stop rider-ticks**, **19 (mild) / 30 (strong)** completed physical lane movements, and exact serialized checkpoint restart.
- In **106/168 riders**, it eliminates the initial merge and stops safely at a **later** problem: **r046/r049** (mild, first swept contact at 22.875s; 22.5s accepted), or **r033/r036** (strong, contact at 15.71875s; 15.5s accepted). Both pairs are travelling in the **same lane** while the faster follower closes on a leader already slowed in traffic. The collision is never accepted.
- The relative-speed headway candidate provides a small further delay in larger fields, but trades the mild-profile first collision for a **road-edge violation involving r075 at 23.5s**. This is a different physical failure, not a rescue.
- The multi-rider leader-assist algorithm alone is **not approved**: 100s of bounded assist decisions shifted conflicts to other pairs and, in combination with forecast, even caused contact around 3.5–4s. More assistance is not automatically safer.

The study [`verify-a2-step69-multi-rider-merge-v3.mjs`](../../scripts/v3/verify-a2-step69-multi-rider-merge-v3.mjs) contains **42 paired physical-field cases** (one baseline plus six candidate policies, across three field sizes and two road widths), each also checked under mirrored geometry and renamed rider IDs. Unsuccessful runs remain in the JSON artifact with the first rejected contact or road exit. All physical starts, road widths and speed demands are synthetic and provisional.

## What actually passed, and what remains blocked

**Technical PASS:**

- [Targeted Step 69 CI and complete evidence](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step69-merge-targeted.yml): all policies genuinely run and report success/failure, same initial state, 120/90s requested deadlines, capped acceleration and steering, road-boundary and all-pair continuous swept collision checks, W-prime/time consistency and post-contact rejection.
- Mirror-reflected and bijectively renamed rider fields agree in accepted steps, failure category, physical x/y and W-prime in every matched case. Completed fields restart from a JSON-serialized halfway physical checkpoint exactly.
- The known **32-rider lane-forecast 120s success** with **nonzero completed lane changes** and **zero near-stops** is now an explicit regression assertion. A deliberately road-infeasible start is rejected at **time 0** with zero energy, clock or movement updates.
- The earlier A63 **67/67** short-field safety gate, A64–A68 normal-start physics, A66 240s 32-rider passing, A67 verified 106/168 sustained passes on **constant** width, older A58–A39 historical validation and React production-build gates remain in the comprehensive workflow.

**Sporting NO-GO:** None of the proposed policies can yet complete the **106/168-rider 90-second changing-width** scenarios safely, let alone complete stages. Same-lane chain compression, fair lane reservations and road-edge clearance need a structural solution rather than a larger braking buffer, rider-ID exception or after-contact repair.

The current road guard checks the cyclist **center position**, not an independently source-calibrated full bicycle/rider envelope at each road edge. This distinction matters especially on the synthetic **2.2m** pinch and is a release blocker. There is no verified route width/elevation, aerodynamic drafting, power-limited attacks, realistic fatigue, physical pack gap formation over hours, stage classification or selected UI/tactics integration.

## Next research — A70

Build an **upstream multi-rider lane-capacity planner** from actual road geometry and current peloton states, with reserved physical lateral occupancy across an entire closing chain, pace communication to upstream riders *before* a space deficit forms, and an explicit impossible-merge fail-closed response. Require multi-minutes of **106/168-rider** narrowed/widened road safety **without near-stops or disabled overtaking**, and add road-edge bicycle body clearance, deterministic progress/energy, reflection and ID parity, checkpoint restarts, sourced real roads and multiple initial grid layouts. Preserve the full previously passing constant-width and 32-rider research regressions; do not promote to Milestone B or C until sporting and production gates separately pass.

**Production boundary:** all edits are isolated offline V3 research scripts and CI/docs on GitHub `main`. No Supabase data, official race engine policy, historical classifications, winnings/payouts, game clock, races or live player states were modified.
