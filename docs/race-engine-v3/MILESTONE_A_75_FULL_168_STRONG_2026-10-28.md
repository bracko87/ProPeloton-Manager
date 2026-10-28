# Race Engine V3 — Step 75: full 168-rider passage through a genuine bicycle-wide two-slot bottleneck

**28 October 2026. Offline synthetic physical research PASS for 168 riders, 120 seconds, all cyclists beyond the 2.2m road narrowing and reopening. Exactly replayed independent 3s sustained overtakes PASS. Sporting full-stage and production authorization: NO-GO.**

## Objective and physical baseline

At the end of Step 74, the 32- and **106-rider** synthetic 2.2-metre strong-road narrowing already had fully confirmed 120s physical completions, but **168** still rejected a swept collision after **69 accepted seconds** between r130/r134. The 168-rider reference uses an ordinary three-riders-abreast start at x600m minus 5.2m per row; the road narrows **4.4m → 2.2m → 4.4m**, reaching its restrictive two usable lateral slots at x780m and reopens after x1020m. All widths, powers and grid geometry are provisional, not a sourced actual road stage.

The experimental integrator keeps simultaneous 0.5s rider movement, up to **+0.45m/s² acceleration and −0.85m/s² braking**, **0.38m/s lateral** movement, 16 microintervals for **all-pair conservative continuous swept bicycle contact**, a **0.3m bicycle half-width** at the road edge, real W-prime cost accounting and complete rejection of any attempted collision or bicycle-body off-road position. It does **not** teleport riders, repair forbidden contact, borrow braking, pad simulated time or count an incompletely traversed bunch as complete.

The new [Step 75 two-slot feasibility profiles](../../scripts/v3/a2TwoSlotFeasibilityV3.mjs) reallocate the **same limited arrival-time budget** among geometric starting rows, preserving an entry separation of at least **0.5s** and individually feasible speed/steering windows. The row index comes from starting physical x, not an arbitrary rider ID or retrospectively chosen successful path. Each candidate gets a full coupled physical run after a necessary initial entry feasibility audit. Rejected paths and failed bookings remain visible.

## First Step75 screen — correctly localizing the pressure

Five schedules were tested over **168 riders × 120 seconds**, with matching mirror and renamed rider starts and the proven 32/106 strong-road controls:

| Schedule | Last fully accepted time | Accepted lane changes | First blocked pair |
|---|---:|---:|---|
| Step74 front-load (0.64s early / 0.50s tail) | 69s | 99 | r130/r134 |
| More late-middle pressure | 59s | 97 | r118/r120 |
| Middle-pressure profile | 78s | 114 | r157/r161 |
| Late-peak profile | **78.5s** | 115 | r157/r161 |
| Moderated late schedule | 57.5s | 95 | r118/r120 |

The best first new run pushes contact toward the *last* rows: r157/r161 around x≈743m, with only 0.75–0.80m lateral clearance and inadequate longitudinal clearance while an outer rider is already approaching the −0.85m/s² braking limit. At this new rear bottleneck, the old schedule falls back to only **0.50s** of entry-window separation. Merely widening that gap without reducing earlier commitments makes the later booking physically impossible. The audit never regards a mathematically infeasible schedule as successful.

## Second Step75 screen — last-row capacity reallocation

Five further **generic, position-based** allocation hypotheses were tested, reallocating slack from earlier rows toward the final 6–9 rows. All are checked for reachable windows, 168 actual physical bodies, rider/left-right symmetry, no near-halts and first swept collision.

| Final-row allocation variant | 168-rider 120s physical outcome | Lane changes | Rearmost x at termination |
|---|---|---:|---:|
| Tail surge | **120s FULL_HORIZON_CLEAR** | **158** | **1046.676m** |
| Tail grad | Contact after 55s (r112/r113) | 96 | 608.694m |
| Tail emphasis | Contact after 74.5s (r166/r167) | 115 | 705.048m |
| Tail focus | **120s FULL_HORIZON_CLEAR** | **158** | **1042.838m** |
| Tail flip | Contact after 57.5s (r115/r117) | 99 | 619.734m |

The two winning profiles allocate earlier rows smaller—but always physically admissible—time gaps, then allocate additional time specifically to the tail. Their respective complete theoretical last booking release times are **88.993s** and **89.153s** inside the bounded arrival windows. Crucially, these are *not just mathematical timetables*: the **full 168-rider physical solver** accepts the entire 120 seconds for both candidates. All 168 riders have actually passed the full narrowing and the x1020m reopening, with **0 detected swept contacts, 0 full-body road-edge violations and 0 near-stop rider-ticks**; at least 158 physical lateral lane changes are completed.

## Independent three-second sustained rider passing: verified

The [separate Step 75 actual-acceptance observer](../../scripts/v3/verify-a2-step75-168-passing-v3.mjs) is run only on complete, accepted 0.5s full-field states, never rejected or hypothesized future paths. It counts actual rider-pair longitudinal crossings that establish **at least 2.05m forward clearance** with adequate lateral safety and maintain this lead **continuously for at least three seconds**, including the intra-step minimum-gap check. This is stricter than counting lane moves or start/end pair-order inversions.

| Independent 120-second physical + observer proof | Tail surge | Tail focus |
|---|---:|---:|
| 168-rider full bicycle-wide traversal | **PASS** | **PASS** |
| All 168 riders beyond x1020m road reopening | **YES** | **YES** |
| Completed physical lane changes | **158** | **158** |
| **Confirmed sustained 3s rider-pair passes** | **137** | **135** |
| Last/rearmost cyclist x | **1046.675695m** | **1042.837659m** |
| Near-stop rider-ticks | **0** | **0** |
| Swept collision / full-body roadside rejection | **0 / 0** | **0 / 0** |
| Exact complete physical and observer 60+60s saved replay | **PASS** | **PASS** |

Each successfully observed pass is a **rider pair**, not a unique rider or an actual full-stage classification. There is no claim of realistic stage gap timing, aerodynamic influence, race strategy, fatigue or finish ranking.

Both successful candidates now enforce **hard regression assertions**: full 120s with *every* cyclist beyond x1020m, >=**150** completed lane changes, >=**125** independently sustained 3s pair passes, zero near-stops, positive energy accounting, exact snapshot replay and unchanged first-contact protections. Full 168 mirror reflection and rider-ID renaming retain exact acceptance category, 0.5s step count, final physical trajectories and W-prime. The rejected alternative schedules also remain documented for causal review.

## What this proves—and what remains

**Newly demonstrated:** 32, 106 and 168 riders can now physically navigate the same **synthetic** 2.2m strong narrowing for the complete 120-second test, using real bicycle-wide swept collision clearance, bounded acceleration/steering, full field replay and independently observed sustained passing.

Prior benchmarks are retained, not replaced: the 32-rider strong t120 normal-start breakthrough from A73, **106 strong t120 with 115 lane changes and 124 verified passes** from A74, **106/168 mild 3.3m t120 with 324/520 passes** from A72, constant-road passing from A66/A67, and the A63 **67/67** early-warning safety cases. Failed broader middle/late intervals have not been promoted. The specialized A75 passes are added to the comprehensive A63–A75 workflow, which also preserves the historical A58–A39 technical suite and React production build.

**Still not proved:** a full 100–250km professional stage with actual sourced road widths and elevation, realistic coasting, 3D/2D geometric road curvature, descending speed, real cycling power and drafting/pacing, W-prime depletion over distance, persistent rider groups and seconds gaps, attack and chase dynamics, crash/crosswind strategies, team tactics, official stage finish and general classification correctness, online user tactics or production integration. A dense two-minute synthetic field has now cleared a physically defined pinch, but **sporting full-stage Milestone A is still open**.

## GitHub evidence and next work

- [Step 75 full 168-rider capacity and rejected-candidate safety tests](../../scripts/v3/verify-a2-step75-capacity-distribution-v3.mjs)
- [Step 75 independent 168-rider 3s true pair passes + exact 60+60s saved replay](../../scripts/v3/verify-a2-step75-168-passing-v3.mjs)
- [Step 75 dedicated GitHub Actions with retained JSON evidence](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step75-capacity-targeted.yml)
- [Unweakened comprehensive historical and React validation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

**Next Step 76:** freeze the two A75 winning profiles as isolated reference test controls and investigate **more realistic dense peloton starting configurations, varied velocities, longer multi-minute echelons, authentic width transitions and cross-sectional capacity**, including calibrated bike envelope and sourced physical road widths. Then integrate a physics-aware aerodynamic drafting/power balance and persistent breakaway gaps, test 106/168-rider full competitive stages with tactics and official finish classifications, and only subsequently start Milestones B (UI/live tactics) and C (production/rollback).

**Production and sporting status: NO-GO.** The live race engine, Supabase project state, historical or scheduled race results, classifications, leaderboards, payout rules, game clock and Netlify deployment were not deliberately modified. The code remains offline research on GitHub `main`.
