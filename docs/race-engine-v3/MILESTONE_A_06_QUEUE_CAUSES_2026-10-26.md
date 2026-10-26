# Race Engine V3 — Milestone A2: exact overtaking admissions, queue delays and longitudinal passes

**26 October 2026. Diagnostic technical gate: PASS. Sporting approval: NO-GO.**

## Why the diagnostic matters

The [previous A2 local-versus-global admission test](MILESTONE_A_05_LOCAL_ADMISSION_2026-10-26.md) proved that reducing aggregate blocking and multiplying steering maneuvers **did not** make race results stable. Before changing physics again, we must distinguish the actual mechanism that prevents a rider from preparing a lane change.

[Commit `cea37994`](https://github.com/bracko87/ProPeloton-Manager/commit/cea37994ed3b7bbdcd6acca6d3ea9f7cd4066c24) adds the opt-in `diagnosePassing: true` observer to the offline `scripts/v3/coupled2DMicroV3.mjs` research engine. The default false value preserves the previous serialized state. This is not imported by official production race selection.

At **each 10-second tick**, the observer attributes every *eligible overtaking reservation decision* to exactly one outcome: capacity exhausted, no physically clear neighboring track, neighboring track blocked by another reserved maneuver, or granted reservation. It also counts cancellations by steering collision versus finishing, and pairs of still-active riders whose forward order genuinely reverses across a tick. Reversal events can recur for the same pair; they are **not** unique overtakes or independently validated tactical attacks.

## Complete-stage results

Two offline fixtures were simulated twice: the original uninstrumented control and the instrumented control, with unchanged rider power, tactics, roads, passing policy and geometry (5-m synthetic road, global capacity 3).

| Measurement | Dordrecht | Guangxi |
|---|---:|---:|
| Riders finishing | **106/106** | **168/168** |
| Eligible overtaking decision-ticks | 85,561 | 196,741 |
| Denied by **global capacity** | **51,930 (60.69%)** | **142,873 (72.62%)** |
| Denied by **physical lane occupancy** | **32,151 (37.58%)** | **52,000 (26.43%)** |
| Denied by existing reserved corridor | 643 (0.75%) | 684 (0.35%) |
| Overtaking reservations granted | 837 (0.98%) | 1,184 (0.60%) |
| Aborted because steering would collide | 261 | 269 |
| Aborted at finish | 3 | 10 |
| Tick-end longitudinal pair reversal events | 139,302 | 173,927 |
| Longest consecutive eligible denial streak | 1,244 ticks | 1,206 ticks |
| Winner, baseline and diagnostic | r003, unchanged | r003, unchanged |
| Last-rider gap, baseline and diagnostic | 1,193.300376 s | 1,231.182305 s |
| Whole-race rider trajectories, classifications, samples and original metrics | **Exactly equal** | **Exactly equal** |
| Exact checkpoint recovery of instrumented full stage | **PASS** | **PASS** |

**Read these denominators carefully:** one rider can produce thousands of decision-ticks. The high capacity-denial share does **not** imply that 60–73% of unique riders were refused an overtake. These exclusive categories reflect the *priority-ordered admission algorithm*: capacity is tested first, then track physical occupancy, then conflicts with existing reservations. A rider denied for capacity might also have encountered a physical lane obstacle if later conditions had been evaluated. Therefore these are accurate decision-level reasons, **not** causal proportions proving what sporting rule to change.

**Forward pair reversals** are calculated using actual pre/post solver metres, with small ties and finishers excluded. The existing continuous-sweep collision physics is verified separately. There may be repeated crossings of the same pair and side-by-side overtakes without a new steering reservation; this metric alone is not a tactical-quality or realism gate.

## Verified evidence

- [V3 A2 passing/queue causes — full-stage CI SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40397582742): both full stages, explicit default-off equivalence, identical physics/results/timeline, mid-race serialized checkpoint equality, micro collision and finish tests, app build.
- [V3 core 2D validation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40397582549) and [legacy isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40397582552). Green engineering checks are not sporting clearance.
- 30-day per-rider evidence archives: `v3-a2-queue-causes-dordrecht-2000-10-15` and `v3-a2-queue-causes-guangxi-2000-10-19`, with decision counters, pair crossings, per-rider attribution and remaining limits.
- Official game engine, result rows, historic classifications, Supabase, game clock, live workers and tactics remain **unchanged**; game result writes **0**.

## Decision and next engineering acceptance gate

**This observation identifies the dominant algorithmic admission denial reason, but does NOT authorize simply increasing capacity.** That was already tested and worsened finishing-order sensitivity under two-rider lane swaps.

Next, isolate **why starting-grid swaps have amplified effects**: (1) log per-rider exact positional order changes at stable phase boundaries, (2) test safe coordinated neighbor-relative steering under tight verified road widths, (3) compare a controlled matrix of at least three starting permutations and independent rider-skill arrangements, (4) establish authentic breakaway/chase group and energy benchmarks. Score finish gaps, winner stability, rider-pair inversion share, actual passing, wheel hold durations and collision-safe W-prime simultaneously.

Separate blockers remain: **718 m** missing Guangxi ascent, **1,065 m** missing World Nations ascent, unverified physical road widths, insufficiently calibrated physiology/weather, and sub-tick finish energy.

**A1: technical PASS. A2: sporting FAIL/OPEN. B: NOT STARTED. C: NOT STARTED. Official promotion: NO-GO.**
