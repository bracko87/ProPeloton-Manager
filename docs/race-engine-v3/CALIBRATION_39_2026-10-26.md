# Race Engine V3 — Batch 39: continuously swept bicycle passing trajectories

**Date:** October 26, 2026  
**Code commit:** [ce214577](https://github.com/bracko87/ProPeloton-Manager/commit/ce214577a74bd8da81fccd5ca532fc1146695933)  
**Final decision:** **TECHNICAL PASS / SPORTING NO-GO / OFFLINE ONLY**. Zero official writes, zero changes to production race calculation, race schedule, live results, user records or game clocks.

## Core question

Batch 38 proved long-lived wheel queues and found relatively many clear **destination lanes** after 3–4 discrete passing ticks. This was **not evidence** that a real bicycle could traverse from its original lane to the destination without contacting another bike. Batch 39 evaluates the *entire two-dimensional bicycle trajectory* continuously within every 10-second step, not merely the final lane occupancy, while retaining the original race's exact forward movement, available speed and energy state.

The new `continuousLateralResearchV3.mjs` is a standalone offline scientific shadow. **It does not implement continuous steering inside the race engine** or alter any production or V3 coupled-physics files.

## Provisional physical geometry

- Four lane centres in the 106/168-rider frozen research fixtures; **1.0-metre lateral separation** between lane centres (not yet real-world road-width calibrated).
- Provisional bicycle body width **0.55 metres** with **0.25 m additional lateral clearance**; declare contact if relative lateral centre separation is less than **0.8 m** *at the same time* as relative longitudinal separation below **1.8 m**.
- Both candidate and every other rider have linear longitudinal and lateral trajectories between each tick's observed start/end positions. Collision is detected analytically by intersecting the *continuous time intervals* where both proximity inequalities hold. It catches collisions between clear start/end snapshots.
- A rider must first qualify with a persistent **at least three-tick same-wheel obstruction**, then complete **two reaction ticks** with no lane displacement.
- Thereafter execute a 3- or 4-tick continuous shadow steering path moving **1/3 or 1/4 lane width per 10-second tick**, respectively. The candidate remains at its actual baseline longitudinal metres; other riders retain baseline trajectories.
- Every steering tick requires full 2D swept clearance, unchanged source rider longitudinal movement and valid reservation state. Unsafe path, a source lane change/finish, insufficient W-prime, or stale next-tick geometry **rejects** the maneuver.
- Charge a hypothetical **35 extra mechanical watts** over each accepted steering tick in a separate W-prime ledger. No alternative progress, W-prime spending, finishing position or velocity is applied to the actual control race.
- On success, make **one independently reset next-tick** comparison with the chosen destination lane under *identical original rider speed commands*. This local result is not propagated into any complete race. An incomplete trial at the end of the 144-tick window is not counted as a completion or rejection.

**Critical limitations:** The lateral geometry is rectangular bicycle occupancy with continuous linear interpolation, not a validated curved/steering-lean bicycle dynamics model. The actual source engine's other riders may make discrete lane changes whose continuous path is approximated linearly in the shadow. A successful shadow represents one locally clear maneuver under modeled geometry, **not** proof of full-race sporting realism.

## Experiment matrix and full-race control

Two frozen source-stage fixtures (Dordrecht **106 riders** and Guangxi **168 riders**) × W-prime energy-only and energy + existing finite passing × three deterministic neutral start grids × frozen route weather and synthetic +3 m/s headwind / +2 m/s crosswind: **24 full unchanged baseline race calculations** and both independent 3-/4-tick steering shadow programs over the first **144 ticks / 24 simulated minutes** of each baseline.

For each complete baseline result: assert `mode` remains offline research, `sportingApproval: NOT_APPROVED`, `officialWrites: 0`; verify every rider finishes, and the whole classification reproduces from a serialized checkpoint. Original-grid frozen weather additionally asserts identical full result to untouched `runCoupledV3`. This is **not** 24 full-race implementations of modified continuous steering.

## Measured full-matrix outcomes

| Continuous steering shadow | Three steering ticks | Four steering ticks |
|---|---:|---:|
| Independently started maneuvers | **888** | **878** |
| Complete continuous 2D clearance | **92 (10.4%)** | **62 (7.1%)** |
| Safe following-tick comparisons after completion | 91 | 61 |
| Explicit 2D swept-trajectory collision rejections | **755** | **776** |
| Insufficient W-prime rejections | **0** | **0** |
| Extra steering work on **completed** shadows, summed across independent studies | 96,600 J | 86,800 J |

Do **not** conflate the summed shadow work with a real rider or race expenditure. A rejected attempt can also incur modeled partial effort, but aggregate `extraWorkJoules` is reported here only for completed attempts. Starts minus completions minus collision rejections additionally include original-rider lane changes/finishes, other rejected conditions and attempts still open at the observation cutoff.

### Selected original-grid frozen-weather observations

| Frozen route and research mode | Queue duration | 3-tick accepted / started | 4-tick accepted / started | Local 30 m split |
|---|---:|---:|---:|---:|
| Dordrecht energy-only | 140 ticks | **0/42** | **0/42** | 120 s |
| Dordrecht with finite passing | 140 ticks | **5/34** | **4/34** | 120 s |
| Guangxi energy-only | 139 ticks | **2/41** | **3/40** | 280 s |
| Guangxi with finite passing | 139 ticks | **4/36** | **4/35** | 280 s |

In the *original-grid Dordrecht energy-only* condition, the full-bicycle 2D model accepted **no** attempt, even though Batch 38's narrower final-lane/swept destination checks admitted many. This is the primary finding: **a safe destination is not a safe lateral journey**.

Guangxi and Dordrecht both retain a prolonged same-wheel blockage; the research model cannot cure that by simply assigning a faster lateral move. Slower four-tick steering is not automatically safer because more observed ticks can bring other bicycle trajectories into the candidate's swept envelope.

### Behavior of successful isolated maneuvers

Where the full steering path did complete, the independent next-tick physical simulation sometimes changed neighboring riders' metres and blocking flags. The magnitudes are recorded in full JSON per scenario. They are **not additive full-race improvements**. The main branch therefore leaves all live engine movement, race gaps, draft effects and rider energy completely unchanged.

## Verification

- [Batch 39 four-job 106/168-rider full-race research matrix — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40341321534): 24 unmodified full-stage references, four full race/energy condition jobs, complete observer + checkpoint consistency, collision and energy tests, application build.
- [Existing V3 legacy isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40341321519): independently inspected **51-step** successful run, zero failed steps and zero GitHub `##[error]` entries.
- Unit tests prove the 2D continuous sweep rejects bicycles that cross paths **mid-tick despite noncolliding endpoints**, accepts properly separated adjacent lanes, rejects invalid widths/input, preserves immutable shadow state, charges valid W-prime effort and deterministically replays from JSON snapshots.
- GitHub Actions retains four complete per-fixture/mode JSON archives for 30 days. The combined user-facing evidence archive contains all four plus a concise `BATCH39-SUMMARY.txt`.
- Diff scope: **only** `scripts/v3/continuousLateralResearchV3.mjs`, `scripts/v3/verify-batch39-continuous-v3.mjs`, `scripts/v3/audit-batch39-continuous-v3.mjs`, `.github/workflows/v3-batch39-continuous-steering.yml` and this report. **No changes to `src/race-engine-v3/**` or active race selector.**

## Unresolved sporting blockers

1. **No production integration** or physically complete 2D pack solver, no validated lateral bicycle/road dimensions, no real steering turn-rate, rider intent, multi-bike team coordination, shoulder clearance or geometric lane bandwidth. The large 2D rejection rate may indicate inadequate passing space under the assumed geometry rather than proof that real-world passing is impossible.
2. The existing World Nations Hilly/Mountain route-fidelity suite still reports **1,785 m declared ascent vs 720 m represented, 1,065 m missing**, and correctly blocks sporting authorization despite green CI. The Guangxi proxy independently misses **718 m** of reported climbing. Dordrecht sprint point commands and rider ability calibration remain incomplete.
3. Two weather regimes and three synthetic neutral grids do not establish confidence in realistic peloton bunch and breakaway behavior. No alternatives were actually propagated through complete races, so no claims about changed winning time, first breakaway, final groups, top ten or classification stability are warranted.

## Recommendation for Batch 40

**Do not enable the 2D shadow.** First calibrate lane centre spacing and bicycle envelope against realistic road widths and cycling formations. Investigate whether conservative dynamic **look-ahead corridor reservations** and early safe passing commitments can create a continuously clear trajectory without teleportation or allowing overlap. Then use a genuine dynamically integrated two-dimensional, finite-duration rider state in separate offline full-race A/B, with correct W-prime debits, contact avoidance, checkpoint exactness, at least 106/168 riders, synthetic gradients and wind, multiple grids and a repaired source route.

**FINAL DECISION: ENGINEERING PASS, SPORTING NO-GO; official racing, results and game clock unchanged.**
