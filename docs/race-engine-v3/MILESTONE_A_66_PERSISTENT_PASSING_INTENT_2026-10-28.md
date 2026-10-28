# Race Engine V3 — Step 66: sustained passing intent, coordinated safety and longer normal-start screens

**28 October 2026 — offline physical/technical gate PASS; sporting and production NO-GO.**

## Question and selected design

Step 65 established bounded, collision-free 180-second 32-rider pelotons on three nonclairvoyant normal-start cases. It lost meaningful passing: the 90-second, 32-rider open-corridor benchmark dropped from **22** completed lane changes with the unsafe A64 controller to **13** under the safer 3.2 m coordinated headway model. In a full five-lane aggressive grid, the Step 65 3.2 m controller completed just **3** lane changes by 90 seconds.

The reason being screened in A66 is simple and physically important: **a rider who is already safely following a slower leader may no longer be going faster at that instant, but may still want to pass**. A lane decision triggered only by a momentary speed advantage can suppress overtaking just because the headway controller did its job.

A66 adds two strictly opt-in research variants to [the standalone normal-start integrator](../../scripts/v3/a2NormalStartPelotonV3.mjs):

- `coordinated_demand`: seek a feasible lane when the rider's current **requested speed** is sufficiently higher than the leader's current requested speed; preserve the same bounded Step 65 longitudinal headway rules.
- `coordinated_either`: seek a feasible lane when either requested pace or measured current speed is higher; preserve the identical safety model.

The previous `coordinated_headway` remains untouched and selected only when explicitly requested in the offline experiments. The game's official race engine is not connected to any of these settings.

Every attempt uses present-time state and current requested commands only, a globally identical **3.2 m provisional standoff**, 0.5 s coupled physical updates, maximum acceleration **+0.45 m/s²**, maximum braking **−0.85 m/s²**, lateral speed at most **0.38 m/s**, current corridor occupancy checks, all-pair conservative swept-contact rejection, energy/W-prime accounting, a fixed synthetic five-lane road, and deterministic state recovery. Nothing may teleport, repair a contact retroactively or select its desired target using a future A44 trajectory.

## Matched 32-rider results — 90 seconds

| Normal-start geometry | A65 coordinated headway | A66 requested-speed intent | A66 speed-or-request intent |
|---|---:|---:|---:|
| Mixed, all five lanes filled: completed lane changes | 0 | **0** | **0** |
| Aggressive, all five lanes filled: completed lane changes | 3 | **25** | **33** |
| Three-column open corridor: completed lane changes | 13 | **22** | **22** |
| Mixed/pressure/open corridor swept-contact failures | 0 | **0** | **0** |
| Near-stop rider-ticks | 0 | **0** | **0** |

All nine 90-second variants completed with no swept-contact reject. Requested-speed-only restored the open-corridor benchmark's **22** completed movements and improved aggressive passing to **25**. Either-condition produced more aggressive lane completions after 90s, but not consistently across longer experiments.

## Matched 32-rider results — 180 seconds

| Normal-start geometry | A65 old 3.2m headway, completed lane changes | A66 requested-speed intent, completed lane changes | A66 speed-or-request, completed lane changes |
|---|---:|---:|---:|
| Mixed, all five lanes | 0 | **8** | 8 |
| Aggressive, all five lanes | 3 | **63** | 58 |
| Three-column open corridor | 13 | **30** | 30 |

**All nine 180-second runs completed safely with zero near-stop rider-ticks.** Every 90-second and 180-second candidate comparison checked reflection symmetry and rider-ID invariance on the corresponding 90-second fields, and a genuine serialized 90+90s restart on clear 180-second fields.

`coordinated_demand` is therefore the **preferred experimental candidate**, not an approved production racing rule. It does not rely on rider-ID priority, retrospective collision victims or exceptional emergency deceleration.

## Longer 240-second endurance and larger interactive safety screens

The globally identical requested-speed-only rule was extended from ordinary `t=0` starts:

| Research scenario | Complete physical time | Completed lane changes | Final longitudinal rider-order reversals | Near-stop rider-ticks | First swept collision |
|---|---:|---:|---:|---:|---|
| 32 riders, mixed 5-lane | **240s** | **8** | 102 | 0 | None |
| 32 riders, aggressive 5-lane | **240s** | **66** | 181 | 0 | None |
| 32 riders, open outer lanes | **240s** | **32** | 182 | 0 | None |
| 106 riders, mixed 5-lane | **30s** | **0** | 106 | 0 | None |
| 168 riders, mixed 5-lane | **30s** | **0** | 165 | 0 | None |

All three 240-second 32-rider endpoints were reproduced exactly by a **120+120s** serialized state restart. The 106/168-rider runs were **30-second interactive order-changing screens, but neither produced completed lateral lane changes**. These do NOT demonstrate realistic 106/168-rider peloton overtaking, actual racing or complete-stage scalability. The large starts remain provisional, relatively short and tactically uncalibrated.

Longitudinal pair-order reversals are only a **start/end ordering proxy**: A66 does not independently enumerate each sustained, physically completed cyclist-versus-cyclist pass, so they must not be described as that number of genuine race overtakes.

## Validation and explicit gates

- [Step 66 offline matched 90/180/240-second test and symmetry/recovery suite](../../scripts/v3/verify-a2-step66-passing-intent-v3.mjs)
- [CI full A59–A66 race-engine technical validation and prior regression/build workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)
- The newly enforced **required** acceptance tests assert all three requested-speed-only 90/180-second fields clear, zero near-stops, restored **22** open-corridor completed lanes at 90 seconds, **25** aggressive-grid lanes at 90 seconds, and at least **8/63/30** completed lanes for mixed/aggressive/corridor after 180 seconds. 240-second and 30-second larger-field tests are additional diagnostic screens, reported honestly whether they pass or fail.
- The older A65 normal-start/collisions/regressions, A64 controls, A63 **67/67** short-field safety/replay, earlier A58–A39 technical audits, full-stage technical regressions and React build remain in the workflow; no test was removed or relaxed to obtain this result.
- Full all-pair continuous collision checks, physical and energy limits, unmodified official data, exact checkpoint recovery and rider-ID/road-reflection comparisons remain in force.

## Remaining blockers before actual full-race sporting approval

1. Complete **nontrivial interactive 106 and 168-rider** scenarios with realistic lane passing; the A66 large trials recorded **zero completed lateral changes**.
2. Verify source-based real route width and elevation, accurate peloton positioning, team/rider tactics, drafting, kinetic/mechanical power, fatigue and attacks, pro-level sprint behavior, persistent breakaways, 30s+ time gaps and actual classified finish times.
3. Make real overtakes observable through crossing, safe lane occupancy and sustained lead, rather than relying only on initial/final longitudinal order reversals.
4. Prove long-distance multi-hour continuous and deterministically restorable race execution, acceptable processing throughput, and robustness across varied starting grids/road profiles, not just a few synthetic 240-second runs.
5. Separately complete Milestone B gameplay/UI and Milestone C deployment/performance/recovery/rollback before authorization for production.

**A66 technical research PASS; Milestone A sporting NO-GO; Milestones B/C not yet complete.** No selected live game solver, Supabase record, historical race result, player club, payout, race schedule, game clock, or other production state was modified.

**Next A67:** Build a nonclairvoyant sustained *overtake completion* detector and fair multi-lane admission stress tests in **106/168-rider interactive grids**. Preserve all A66 240-second 32-rider and old 67/67 safety gates, and do not promote a controller solely from collision absence or rider-pair order reversals.
