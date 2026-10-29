# Race Engine V3 — Step96 achieved 3–5 rider physical gap creation

**29 October 2026. Research-only opt-in experiment. No live controller changed, no live Supabase write.**

## Physical problem retained from Step95

The [Step95 original physical audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40903327415) completed 4/4 technical GitHub Actions jobs but **0/8** 106/168 true original A64 180-second full races and no 32-rider complete run. Step95 successfully blocked every actual accepted half-second that would allow upstream crawling below 6.5m/s (x<680m), downstream slow motion below 4.5m/s or near-stops. Earlier Step94 scored 70.5s with 2,073 near-stop rider-ticks, proving that merely delaying a collision by stopping riders is not sport.

Step95's drawback is that rejecting bad commands does not **create** safe velocity/steering combinations. The earliest first-field failures often happen before the road taper, with close riders in multiple adjacent start rows and necessary lanes already occupied.

## Step96 physical neighborhood actuator

[Step96 local gap opener](../../scripts/v3/a2Step96LocalGapOpenerV3.mjs) explicitly generates new **simultaneous requested speeds and steering holds** for each physical original 3–5-rider start-row neighborhood. At its next two booked narrowing gates, it differentiates center, inner and outer *desired* speeds in the approach (center 10.25m/s, inner 9.45m/s, outer 7.8m/s) to create real x separation while staying above Step95's 6.5m/s minimum. These are only acceleration targets; original A64 caps acceleration at +0.45m/s² and braking at −0.85m/s². No actual initial or accepted x/y/v is overwritten.

When insufficient **achieved** longitudinal room exists for a rider to leave an occupied adjacent lane, the planner holds the lateral target. A second step builds a 2.5s bounded-acceleration conflict graph among neighboring and *different* starting rows; a leader is requested to accelerate (unless its forward corridor is blocked), the follower's requested pace is capped without stopping it, and the lateral motion is deferred until the projected gap and achieved gap can support it. The process repeats at most four bounded passes and only builds plans. The original A64 whole-field 16-subinterval swept bicycle collision/road/W-prime solver remains the sole acceptance authority.

Three opt-in first-tick policies are *local_lane_shield*, *local_group_pulse*, and *local_gap_wave*, compared with protected Step86 gap wave, Step87 order pace, baseline and joint under the existing Step95 **hard achieved no-crawl gate**; each hypothetical original A64 accepted state must have upstream ≥6.5m/s, downstream ≥4.5m/s and no near-stop (<1m/s) before it can be selected. Both *local_gap_strict_v1* and *local_gap_balanced_v1* enforce this same hard requirement; they differ only in ranking emphasis within the protected 3-tick physical beam. A blocked first tick is reported as a research NO-GO, never a fabricated original collision or success.

## Scientific validation

The pure local planner checks multirow gaps, simultaneous bounded forward assist and rear pace cap requests, actual achieved lateral holds, 3–5 neighborhood size, mirror/renaming/array permutation neutrality, same-x left/right tie and immutable inputs. The [Step96 CI](../../.github/workflows/v3-step96-local-gap.yml) independently checks protected Step78/85/86/87/89/90/91/92/93/94/95; eight 106/168 × staged/double × strict/balanced full 180-second original A64 attempts, reporting both true collision and no-moving/no-safe-request status; original A64 16 full-field mirror/renamed comparisons; independent 8/32 sustained ≥3s overtakes, physical lane changes, actual two-gate passage, exact 90+90 physical+observer replay and React production build.

**Required GO:** all 106/168 five-wide 180 seconds complete *on both* synthetic staged/double constrictions, every rider crosses the second gate, zero committed collision/road/energy errors, zero accepted crawling/near-stops, meaningful sustained overtaking, modest weaving, original physics and parity/replay. Reference protected Step86 32 staged = 80 sustained passes / 411 lane changes and double = 70 / 678, both with full 180s. A green technical fail-closed test does **not** mean sporting GO. Milestone A remains NO-GO pending real results. Milestones B/C not approved; live races, payouts, game clock and player data untouched.


## Verified original A64 Step96 outcomes — 29 October 2026

[Step96 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40908445269) finished **all 4/4 technical jobs SUCCESS**, including the Step96 pure group-generation test; protected Steps78/85/86/87/89/90/91/92/93/94/95; all eight 106/168 original-A64 full180-requested field attempts; exact mirrored/renamed physical parity and independent 8/32 sporting/observer replay; and React production build.

**Technical CI green does not mean successful racing. Step96 achieved 0/8 full-180 large-field completions and 0/4 32-rider completions.** A research NO_SAFE_PHYSICAL_REQUEST or A95_NO_MOVING_PHYSICAL_REQUEST means **no proposal was both physically feasible and moving**, and the field was not advanced, not that contact could be overlooked.

### Original 106/168-rider five-wide 180-second requests

All failed *before* first/second gate completion. Original physical state accepted no upstream (x<680m) rider below 6.5m/s and no near-stops; all selected first ticks were re-swept by original A64.

| Riders | Geometry | Controller | Actual accepted | True final status | Accepted upstream slow rider-ticks | Near-stops | A95 moving veto previews |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| 106 | staged | strict | 13s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 72 |
| 106 | staged | balanced | 8s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |
| 106 | double | strict | 2.5s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 60 |
| 106 | double | balanced | 2.5s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 60 |
| 168 | staged | strict | 13.5s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 101 |
| 168 | staged | balanced | 11s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |
| 168 | double | strict | 9s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 28 |
| 168 | double | balanced | 7s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |

In the 106 staged strict run, the planner generated 567 row-neighborhood evaluations with 5,312 proximity conflict-edge evaluations, including 1,026 cross-row edges, 2,341 suggested leader boosts, 3,036 suggested follower caps and 2,918 suggested steering holds. **These are control *proposals* accumulated over accepted decision ticks, not independent proof of physically achieved gaps.** The original A64 full-field solver and 3-tick moving-speed selector rejected the missing feasible continuation at t=13s. The 106 double narrowing strict and balanced policies failed much sooner (2.5s) than earlier trials; that is a negative result, not an improvement.

### Protected independent physical fairness, overtaking and deterministic checkpoint

All **16/16 original-A64 mirrored and renamed physical comparisons** produced matching accepted x/y/v/W-prime, reason and policy selection. The two 8-rider strict configurations completed 180 seconds with all riders crossing the second gate, no near-stops, and exact serialized physical + independent ≥3s overtake-observer 90+90s replay.

| Riders | Geometry | Policy | Actual accepted | Independent ≥3s pair overtakes | Physical lane changes | Full second gate | Exact 90+90 replay |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 8 | staged | strict | 180s | 8 | 115 | Yes | Yes |
| 8 | double | strict | 180s | 6 | 135 | Yes | Yes |
| 32 | staged | strict | 10s | 0 | 10 | No | Not reached |
| 32 | staged | balanced | 8s | 0 | 0 | No | Not reached |
| 32 | double | strict | 7.5s | 0 | 1 | No | Not reached |
| 32 | double | balanced | 8.5s | 0 | 3 | No | Not reached |

**Protected Step86 remains the actual better sporting benchmark:** 32 staged full180, 80 independent sustained overtakes / 411 physical lane changes, and 32 double full180, 70 overtakes / 678 lane changes. A96 does not replace it.

## Milestone decision and next physics objective

Step96 demonstrated that a 3–5-body local actuator can generate physically bounded *simultaneous speed and steering proposals*, without rider-ID/side bias, preserving no-crawl safeguards and physical replay. **It has NOT demonstrated an achievable whole-field moving solution**: a locally plausible gap request can still conflict with the front/back rows over the remaining time-to-merge, and accumulated local caps or assists compete for the same limited physical space. The present discrete local candidates plus 3-tick search do not solve long-range dynamic feasibility.

**Decision: Milestone A physical sporting NO-GO.** Next research should quantitatively distinguish (a) an infeasible 5-wide, fixed-start, no-crawl physical initial condition under the current A64 capabilities and narrow 2.2m/3.3m road geometry, from (b) a solvable long-horizon multi-row trajectory coordination problem. Test a longer continuous acceleration/lane-target horizon with a **global conflict constraint/feasibility certificate** and original A64 re-sweep. Do not stack another unverified local priority heuristic, declare an impossibility without proof, weaken collision geometry, teleport cyclists, or hide slow riders. Keep exact original 106/168 180-second sporting, overtaking, mirroring and replay acceptance.

No Milestone B integration, Milestone C live rollout, race/payout/classification changes, Supabase writes or game-clock changes approved.
