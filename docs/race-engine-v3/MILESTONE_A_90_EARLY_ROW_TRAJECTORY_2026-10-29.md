# Race Engine V3 — Step 90: coupled early row-trajectory clearance

**29 October 2026. SYNTHETIC RESEARCH ONLY.** A64 original all-pair swept bicycle collision, narrowing-road boundary and W-prime/energy physics remain unchanged; no active simulation policy or Supabase/official player data changed.

## Step89 handoff, verified
Step89's completed GitHub CI was technically successful, with 16/16 mirror and renamed physical fields and exact replay of full 8/32 races that reached 180 seconds. But all eight 106/168 five-abreast attempts still first rejected a genuine swept-body collision within 7–11.5 seconds. Step89 32r staged rejected at 8.5s. Its 32r double strict completed 180s with zero near-stops but only 44 independent 3-second pair passes and 1,120 physical lane changes; balanced completed 180s but had 16 near-stop ticks, 40 passes, 1,252 lane changes. Never misinterpret a green fail-closed physical CI as full-race sporting clearance.

## New Step90 hypothesis
Step89 early arrival slots were only diagnostic and the A85 three-tick chooser still could select an isolated whole-field request that did not reserve space for a valid *actual* later merge. The new [row trajectory controller](../../scripts/v3/a2Step90RowTrajectoryV3.mjs) constructs a coupled current-geometry conflict graph across rows while the gate is up to 230m ahead. Conflicting occupied lateral swept envelopes must have a real longitudinal clearance before the rear rider is allowed to request steering. A fully symmetric same-x ambiguity holds both moves; otherwise current x and the physically shorter remaining steering path—not rider ID, input array or left/right geography—determine provisional priority. Across each conflicting graph edge, small bounded requested pace offsets encourage long-range actual gap creation; leader assistance is suppressed when its forward crossing corridor is already occupied. No planner ever manufactures achieved x/y/v, accepted steering, speed, energy, or a fictitious checkpoint.

This policy is opt-in as \`trajectory_strict_v1\` and \`trajectory_balanced_v1\`. The original A85 full-body guarded 3-tick selector compares baseline, Step78 joint, proven Step86 gap wave, Step87 pace, and three new trajectory requests; the selected actual half-second is re-swept independently by A64. Existing Step78/86/87/88/89 behavior is left unchanged.

## Required original physics audit
[Step90 CI](../../.github/workflows/v3-step90-row-trajectory.yml) verifies pure name/mirror/array neutrality, true current-state equal-x ambiguity, immutable inputs, all 106/168 × two real narrowing layouts × strict/balanced requested for 180 seconds, independent 8/32 racing and 3s passes and exact 90+90 replay for accepted races, plus protected Step85/86/87/89 and React. Read actual JSON/log outputs; technical green means collision was correctly rejected if a failure happens.

**Decision pending actual completed CI:** Milestone A 106/168 five-wide 180s sporting approval remains NO-GO. Milestone B gameplay and Milestone C production release remain unauthorized. Historical Step78 staged (87 passes /356 changes), Step86 staged (80 /411), Step86 double (70 /678) 32r sporting quality remains the acceptance reference.


## First complete original A64 Step90 audit — 29 October 2026

The [dedicated Step90 workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40885344872) produced technical success for original A64 large-field collision/rejection evidence, 8/32-rider full-horizon sporting/replay audit, 16/16 mirrored/renamed physical fields, and React build. This does not imply the larger peloton finished. The large audit recorded **zero of eight** 106/168 five-abreast full-180s passes: all rejected genuine SWEPT_CONTACT before the second gate, with zero near-stop ticks *before* rejection.

| Riders | Layout | Strict accepted | Balanced accepted | Sporting |
| --- | --- | ---: | ---: | --- |
| 106 | Staged | **14.5s** | 12s | Both SWEPT_CONTACT |
| 106 | Double | 11s | **11.5s** | Both SWEPT_CONTACT |
| 168 | Staged | **13s** | 11s | Both SWEPT_CONTACT |
| 168 | Double | 10s | **11.5s** | Both SWEPT_CONTACT |

Step90 staged large-field time improved over Step89's previous 7s to 14.5s (106) and 13s (168), but did not exceed Step87's previous 106 staged 15.5s. First rejected original solver pairs include 106 staged strict r043/r048 and 168 staged strict r041/r047. The bottleneck moves; it does not disappear.

The 8/32 actual original A64 full-race, independent >=3-second passing observer and serialized 90+90 checkpoint results were:

| Size | Layout | Policy | Accepted | Near-stop ticks | Real lane changes | Sustained >=3s pair passes | Exact replay |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 8 | Staged | Strict | 180s | 0 | 134 | 5 | Yes |
| 8 | Double | Strict | 180s | 0 | 236 | 7 | Yes |
| 32 | Staged | Strict | 15s (contact) | 0 | 25 | 2 | Not applicable |
| 32 | Staged | Balanced | **180s** | 0 | 856 | 75 | Yes |
| 32 | Double | Strict | 15s (contact) | 0 | 22 | 0 | Not applicable |
| 32 | Double | Balanced | **180s** | 0 | 1217 | 46 | Yes |

The two complete 32-rider balanced routes have all riders beyond the second reopening and exact physical/observer replay but are **not sporting improvements over protected Step86**: Step86 staged 80 passes/411 lane changes and double 70 passes/678 lane changes. Step90 balanced staged makes 75 passes with 856 physical lane changes; double 46 passes with 1217 physical changes. Even its safest completed routes weave excessively. 16/16 original swept physical mirror and rider rename comparisons passed.

## Next engineering gate

Investigate persistent *achieved* headway and lane ownership across successive 0.5s accepted movements. The early premerge gap can be consumed by a neighboring row before the intended lateral transition is complete. A persistent physically-revalidated crossing reservation must protect the *entire steering interval*, expire stale claims, and avoid right-of-way by rider ID, array order or fixed geographical side. Only actual original swept-body clearance grants passage. Maintain strict zero-stop 106/168 goals and all 32/106/168 both-profile full-180, overtaking, W-prime, lane-change and checkpoint acceptance gates.

**Milestone A remains full 106/168 five-abreast sporting NO-GO. B/C NOT STARTED.**
