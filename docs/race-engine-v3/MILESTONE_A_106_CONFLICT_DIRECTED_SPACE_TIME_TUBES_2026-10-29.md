# Race Engine V3 — Step106 original-A64 conflict-directed time-expanded tubes

**29 October 2026. Offline isolated research only; not a live race engine release.** Protect live Supabase race results, payouts, user data, production simulation crons and the original A64 research source.

## Background / new architecture

Step105 added simultaneous projected pairwise zipper accelerations but managed only two-tick physical foresight. Verified results: 106 riders staged **12s**, double **10.5s**; 168 riders staged **13s**, double **10.5s**. **All 12 first physical collisions r015/r016**, 0/12 passed the first gate and 0/12 reached 180s. This was a regression from Step104's **14s** best. The exact original A64 swept-body/road/energy solver and Step101 owner-requested **8s consecutive-gap** peloton grouping were preserved.

Step106 changes *the architecture of the research experiment*, not just fixed velocities:

1. Builds a **time-expanded signed physical conflict graph** from original starting five-wide positions, current actual x/y/v, the original road narrowing geometry, and global left/right zipper precedence. It evaluates 6–12-second conditional longitudinal gap deficit, relative closing and maximum gap achievable under the unchanged +.45/- .85 m/s² physical acceleration/braking bounds. **A conditional impossible pair applies only under the explicitly assumed future lane convergence; it is NOT formal proof the whole course is infeasible.** The center remains independent with no arbitrary side/ID tie-breaking.
2. Uses the full original **A64 synchronized 16-substep continuous bicycle collision, road-envelope and W-prime solver** to preview actual 0.5-second motion over a bounded 4–6-second (8–12-tick) future tube, using several distinct global precedence candidate algorithms. Forecasts stop immediately at the first *genuine* swept contact, energy, road or achieved-speed rejection. None are "safe" merely because a timetable or abstract occupancy booking says yes.
3. The real first future physical conflict pair becomes feedback: apply simultaneous bounded earlier acceleration to its *geometry-defined predecessor* and bounded earlier braking to its successor, preserve every other rider's independent physical control and re-sweep the entire group over the same future tube. No rider is physically reordered, teleported, merged into a group body or allowed to take space from another rider based on lexical ID. Forecasted contacts are **rejected**, not accepted.
4. Choose the best *actually original-A64-swept* physical prefix and independently re-sweep the chosen FIRST physical tick on the original checkpoint. Commit only that independently accepted movement and observe **the unchanged user-defined exact consecutive <=8-second group rule** on resulting positions.
5. Record initial-to-first-rejection duration and the actual first rejected rider pair; compare to the Step104 **14-second** best. This is a research investigation, not an automatic sporting GO or production scheduling controller.

### Validation

The Step106 dedicated [CI workflow](../../.github/workflows/v3-step106-space-time-tubes.yml) verifies an original A64 8/32-rider 0.5s and exact 1+1 second saved-state replay, mirror and renamed geometric conflict-graph parity, independent selected-tick re-sweep, user-approved exact eight-second dynamic race grouping, protected Step86 full-180 32-rider A64 benchmark and React build. The large-field matrix: 106 and 168 riders × staged and double narrowing × **4-second and 6-second future physics** (eight actual A64 attempts, up to 30 seconds of real continuous trajectory each).

Sporting milestone A GO still requires a complete **180-second** original A64 physically accepted continuous path for 106 and 168 riders past **both** narrowings, zero body contact, no W-prime manipulation or crawl, real overtakes and deterministic independent replay. A locally longer original-A64 prefix is useful evidence, but not a gate passage. Any physical collision or insufficient moving speed is a real NO-GO. Neither A64 nor live race engine is changed.

**Results**: Pending GitHub Actions measurement; Step104's 14s remains the actual certified best before new tests, not the Step105 13s. Overall V3 readiness remains a rough ~35%, milestone A sporting NO-GO.
