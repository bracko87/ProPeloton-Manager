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

## Verified results and negative finding — October 29, 2026

First Step106 [original A64 test run 40948166110](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40948166110) completed **all four jobs successfully**, including protected original Step86 32-rider 180-second benchmark and user-approved 8-second group behavior. Eight 106/168 full five-wide initial fields were tested (staged and double, 4- and 6-second forecasts). **Zero passed even the first 30-second test horizon and zero crossed the first narrowing.** Best achieved accepted movement remained 14 seconds, exactly Step104's prior best.

To test whether initial anticipation was too late, the bounded original-A64 forecast was extended to **12 seconds** without changing A64 geometry, bodies, finite energy, braking/steering or group rules. Follow-up [Step106 extended workflow 40948458701](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40948458701) ran another eight five-wide 106/168 experiments (6- and 12-second actual original A64-swept previews). Micro-tests and React build passed, and the protected original Step86 run was in progress when this report was first updated.

### Achieved original A64 physical duration in both Step106 experiments

| Field size | Road narrowing | 4-second future | 6-second future | 12-second future |
| --- | --- | ---: | ---: | ---: |
| 106 | staged | 14.0s | 14.0s | 14.0s |
| 106 | double | 9.0s | 9.0s | 9.0s |
| 168 | staged | 14.0s | 14.0s | 14.0s |
| 168 | double | 9.0s | 9.0s | 9.0s |

**16/16 actual large-field A64 trajectory attempts ended in physical SWEPT_CONTACT rejections.** At the last accepted instant no controller offered a collision-free next half-second, despite bounded conflict-directed forecasts. The staged failure's first rejected pair is **r016/r020** (inner from one row, outer from the next); the double-pinch first rejected pair is **r005/r006** (same-row outer/inner). They recur at both field sizes, and 12-second foresight does **not** move the collision frontier.

The research has established a specific *negative result*: simply extending the forecast horizon or separately changing speed requests for the future collision pair does not yield a physically feasible **whole-peloton lane-and-gap reservation**. It does NOT establish a mathematical proof that the original road geometry is impossible. A further algorithm must jointly solve *lateral swept occupancy and longitudinal gap reservations for all interacting bicycles*, with cause/effect consistency under A64 steering and acceleration, rather than picking another lookahead distance.

### Invariants and next engineering milestone

- Original A64 authoritative 16-substep collision/road and achieved-energy checks are untouched. Rejected previews never become accepted results; each selected first tick is independently re-swept.
- All accepted 106/168 riders stayed **one peloton** with individually evolving positions and speeds. The approved rule remains **adjacent time gaps <=8 seconds link riders into one race group**, greater gaps split, and catches rejoin. Group assignment must never be mistaken for a single shared bicycle body.
- Eight-rider and 32-rider physical replay, symmetry and immutable test inputs passed. All source modifications are under research-only scripts, tests, docs and workflows; no Supabase race, payout, record or live engine modification was made.
- Milestone A requires 106 and 168 physically finish the entire 180-second controlled test through BOTH narrowing gates with no collisions, no near-stops, meaningful sustained overtakes and exact independent replay. **GO is still NO.** Overall V3 readiness estimate remains approximately 35%.

**Architectural next step:** coupled continuous lateral/longitudinal space-time clearance *allocation* with explicit same-row and cross-row precedence for every upcoming taper, including third-party conflicts. This demands a globally compatible reservation certificate checked by actual original A64, not simply an x-coordinate time appointment or 2-rider speed adjustment.
