# Race Engine V3 — Step 102: continuous, original A64 joint physical path witnesses

**29 October 2026. Research-only, opt-in.** Do NOT modify the live race engine, game clock, results, payouts, Supabase, official physical A64 or production race routing.

## Objective and distinction from Step100

Step100 found *necessary* time-expanded two-gate occupancy appointments for all 106/168 riders but did not find a physically continuous motion solution. Step101 established the user-requested **8-second connected racing-group rule** and real-proximity draft observer. Step102 attempts to translate those two components into **actually achieved original-A64 synchronized full-body bicycle trajectories** over each half-second, while distinguishing small successful physical prefixes from full 180-second sporting feasibility.

### Three deliberately bounded physical experiments

- **Convoy:** physically neutral 9m/s moving group with each rider retaining its own x/y/v state and no forced lane change; a reference to test whether the crowded start itself is physically impossible or whether lateral merging causes failure.
- **Row wave:** geometric mirror-neutral inner/center/outer row speed requests, with a no-steering-until-local-physical-corridor-clear guard.
- **Scheduled merge:** the same row coordination blended with Step100's two-gate time appointments and the physical lateral corridor guard.

All candidate commands are *requests*. Original unchanged A64's 0.5s synchronized sixteen-substep all-pair swept bicycle/body, road edge, acceleration, braking and W-prime energy solver either accepts them or rejects them. Then Step95 checks achieved upstream >=6.5m/s, downstream >=4.5m/s, no near-stops. **Rejected hypothetical states are discarded, never committed.** This is NOT a group-speed lock, synthetic group displacement, corridor teleport, position repair, road widening, or physics shortcut.

Step101's exact eight-second grouping observes each accepted physical frame. Actual positions remain authoritative; 120 starters can be a single peloton while retaining separate velocities and lane trajectories. Group labels do not produce a free speed multiplier or override physics.

### Acceptance and interpretation

A success for a first 8 or 30 seconds confirms only an A64-valid prefix from the original five-wide grid. A first-gate pass counts only if every accepted bicycle physically clears the original road. Neither a 30s completion nor a clean Step100 timetable proves a second-gate passage or a valid 180s race. Incomplete attempts report the exact first original A64 collision/road/energy reason or the achieved-moving-floor veto; comparisons are grounded in **actual accepted duration**, not speculative projected lookahead.

Full sporting GO remains: complete 180s for 106 and 168 five-wide through both narrowings with zero accepted collisions, road violations, W-prime corruption, crawling or near-stops, meaningful >=3-second sustained overtakes, geometry/renaming fairness and exact 90+90 physical+independent observer replay. Protect Step86 original 32-rider 180s achievements. No Milestone B/C activation.

### Test matrix

One dedicated CI workflow checks original A64 8/32 short physical races, original full-state 4+4 replay consistency, exact eight-second group protection and immutable inputs; 106/168 x staged/double x convoy/wave/scheduled = 12 actual up-to-30s A64 physical attempts with genuine rejected-state diagnoses; protected Step86, Step101 and React build. No data modifications.

## Verified original A64 results — 29 October 2026

The corrected [Step102 workflow 40941025896](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40941025896) confirms the unit/short original A64 witness, exact accepted-state restart/replay, and the independent taper-steering root-cause check have PASSED. The 12 original large-field real-physics attempts and React build have also PASSED their **truthful fail-closed** test jobs; protected original Step86 benchmark remained running when this text was initially recorded. A passing diagnostic test is NOT a sporting completion.

### Actual accepted original-A64 continuous physical seconds (30s requested EACH)

| Field | Road | Neutral convoy | Geometric row wave | Step100 appointment-guided |
| --- | --- | ---: | ---: | ---: |
| 106 riders | staged | 8.0s | **10.0s** | 9.0s |
| 106 riders | double | 6.5s | 7.5s | 6.5s |
| 168 riders | staged | 8.0s | **10.0s** | 9.0s |
| 168 riders | double | 6.5s | 7.5s | 6.5s |

**12/12 fail by original A64 swept contact; 0/12 complete even the first 30s; none passes the first road narrowing.** Step99's best large accepted time was 4.5s and Step98's 9.5s. Step102 best 10.0s is a longer fully verified early physical prefix but NOT a meaningful first- or second-gate sporting improvement, and certainly NOT a 180s success. Every accepted physical time had the eight-second group rule: the full five-wide starting field remained ONE peloton, not 106/168 solo groups. There was no group-speed lock, no virtual merged bicycle and no accepted unsafe physical movement.

### Proven collision mechanism

Original A64 calls the **unchanged** constrainedLaneTargetV3 on every tick, which clamps even a "stay in your present lane" target to a prospective road envelope four seconds ahead. For example, in double narrowing at 6.5s the leading outside rider has x=658.5m, y=0.41m, v=9m/s. The road is still 4.4m wide there, but the 4-second preview samples x=694.5m, where the narrowing already begins. The correct future body-safe lower target moves inward to y=0.4595m **even though the upstream controller requested holding y=0.41m**. Its same-row neighbor remains at y=1.25m; target lateral difference shrinks to 0.7905m, below the 0.80m swept collision threshold with *zero* longitudinal headway. The actual solver independently rejects this contact at about 6.875s. The staged layout has the analogous effect at x=672m: its outside rider is automatically moved inward before a physical longitudinal escape gap exists. The [focused regression](../../scripts/v3/verify-a2-step102-forced-taper-v3.mjs) validates these forced-target conditions, constant-road negative control and mirror symmetry.

This shows that escalating Step100's *arrival appointments*, or simply telling the outer rider to remain straight, is not enough: the **A64 road-forecast inward-steering requirement must be jointly coordinated with actual front/rear headway before it activates**. A safe next approach should make road-entry feasibility and all row-crossing movement jointly achievable under the unchanged contact/edge/energy constraints. Do NOT defeat this by weakening the road, shortening the safety lookahead without proof, teleporting riders or accepting collisions.

The genuine eight-second group membership and existing Stage V3 checkpoint/replay protections stay unchanged. Milestone A still **sporting NO-GO**, B/C not approved, readiness estimate ~35%. No production activation or live-data writes.
