# Race Engine V3 — Batch 30: first-wheel clipping and finite-duration passing reservations

**Date:** 2026-10-26  
**Implementation:** [fc3d191df4ca94d8ffc971634d59e7c472a929f2](https://github.com/bracko87/ProPeloton-Manager/commit/fc3d191df4ca94d8ffc971634d59e7c472a929f2)  
**Decision:** **SPORTING NO-GO**; technical CI PASS; **OFFLINE RESEARCH ONLY**. All official result writes = 0, official V3 selector and game clocks unchanged. No application / physics files under `src/**` changed.

## Mechanism traced

In `src/race-engine-v3/pelotonSpatialMotionV3.ts`, riders are ordered front to back. The next follower is restricted to the previously advanced same-lane bicycle minus minimum wheel clearance (1.8 m). Only after this clip does the algorithm consider adjacent lanes. A potential pass is excluded if a bicycle's **original** position occupies the swept destination interval; the solver also validates end-of-tick spacing.

This sequence can make a follower with spare watts lose distance because of geometric clipping rather than energy exhaustion. It does **not**, by itself, establish the correct physical volume of congestion or the real-world optimal pass. The new offline diagnostics log requested-versus-achieved metres, provisional leader constraints, adjacent-lane old-position occupancy and the first tick of clipping.

## New bounded passing experiment

A separate research-only shadow model lets **one rider at a time** reserve an adjacent lane over **three complete 10-second ticks** (rather than receiving an instantaneous extra research lane shift). The rider remains in its source lane during preparation, and the target must remain safe against all current and moved bicycles each tick; unsafe crossings abort. Any preparation charges 35 W of extra mechanical demand and reduces allowed forward target speed under the same provisional power budget. No free metres, targets, race places, W-prime recovery, or real-world race results are allocated.

**Important physical limitation:** This is a *conservative tick-duration reservation*, NOT fully interpolated bicycle lateral steering. The underlying spatial solver may still perform ordinary single-tick passing for other riders. A duration-based reservation is neither a calibrated racing strategy nor proof that 35 W for 30 seconds is physiologically accurate.

## Scope

For each frozen 106-rider Dordrecht and 168-rider Guangxi roster, two different deterministic neutral grids were simulated for **96 ten-second ticks (16 min)** under fixed desired-speed demands in each of three artificial road conditions: flat, flat with a +3 m/s headwind and +2 m/s crosswind, and +4% gradient. Each scenario ran an untreated reference, the bounded-reservation candidate, and a deterministic repeat. Therefore **12 paired A/B scenarios / 24 primary runs** plus repeat determinism checks; these are NOT full stages. Individual output JSON and unit regression suites are available in the linked GitHub Actions artifacts.

### Rider-tick blocking deltas (treated minus untreated)

| Test condition | Dordrecht grid 1 | Dordrecht grid 2 | Guangxi grid 1 | Guangxi grid 2 |
|---|---:|---:|---:|---:|
| Flat road | -108 | **+35** | -76 | -27 |
| Synthetic headwind/crosswind | -94 | **+35** | -76 | -27 |
| Synthetic +4% climb | -109 | **+15** | -252 | **+42** |

Negative is less wheel-clipping, positive is worse. One rider can have several blocked ticks. The headwind/climb contexts are controlled assumptions, not an authentic route or weather reconstruction.

### Passing completion, attempts and extra mechanical demand

| Condition / roster | Grid 1 completion / attempts | Grid 2 completion / attempts | Extra J for grid 1 / grid 2 |
|---|---:|---:|---:|
| Dordrecht flat | 5 / 6 | 4 / 6 | 5,950 / 4,900 |
| Dordrecht headwind | 5 / 6 | 4 / 6 | 6,300 / 4,900 |
| Dordrecht climb | 8 / 8 | 8 / 9 | 8,400 / 9,100 |
| Guangxi flat | 4 / 5 | 4 / 5 | 4,550 / 4,550 |
| Guangxi headwind | 4 / 5 | 4 / 5 | 4,550 / 4,550 |
| Guangxi climb | 7 / 7 | 6 / 7 | 7,350 / 6,650 |

Attempted maneuvers can be rejected after some ticks and energy expenditure. The reported joules represent **provisional additional mechanical effort**, not calibrated real rider expenditure and not a production W-prime debit.

### Why the fixed-speed wind test has low sporting fidelity

When commanded target speeds are held fixed, the source spatial solver uses crosswind for slipstream, not to calculate each rider's new power-limited desired speed. Flat and artificial headwind rows consequently produce nearly identical wheel-limitation counts under some conditions. The different joules measure the assumed road-power demand/cost rule. The shadow does **not** claim to have solved realistic meteorological passing behavior.

### Limits to confidence

1. A deterministic two-seed, 16-minute **fixed-demand geometry** test cannot show whether a full 118.5 km or 165.8 km race has realistic breakaways, persistent groups, gaps, rider abilities or fatigue.
2. No observed real-race rider wheel tracking was available. The first clip in these simulations occurs at tick one partly because the hypothetical neutral grid rows begin 2 m apart. The diagnostic's inferred "nearest same-lane leader" is **descriptive**, not proof of a unique physical cause.
3. The Guangxi proxy still omits 718 m of the reported ascent; Dordrecht approximates eight sprint-points tactics as tempo in other frozen benchmark tests. A separate 150-km hilly/mountain source audit reports only 720 of 1,785 m ascent represented, correctly blocking sporting calibration even though technical workflow steps passed.
4. Candidate reduces blocked rider-ticks in many scenarios, but **worsens them in three** and can reduce accumulated forward distance for a given grid. A clearance-safe candidate cannot be promoted based on obstruction tick reductions alone.
5. The available checkpoint test serializes shadow state at ticks 32 and 64 and the candidate reruns deterministically. This is not the same as verifying full authoritative `CoupledStateV3` checkpoint recovery with the new maneuver integrated.

## Engineering evidence

- [Batch 30 three-condition matrix, fail-closed reservation tests, 106/168-rider fixed-demand shadows, frontend build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40311592518).
- [Existing V3 legacy regression/isolation suite — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40311592591).
- Full synthetic rider positions, clipping events, attempts, aborts, achieved forward metres and modeled joules retained as `v3-batch30-flat`, `v3-batch30-headwind`, `v3-batch30-climb` Actions artifacts for 30 days.
- All new files confined to `scripts/v3/**` and the new `.github/workflows/v3-batch30-passing-reservation.yml`. Zero edits to `src/**`, Supabase, official race results or game clocks.

## Next steps: Batch 31

Before ANY integrated passing change:
- Resolve model distinctions between safe *lateral occupation of both lanes* and the single-lane bicycle representation; check the full swept corridor **for all affected riders** across three ticks, including trailing-wheel entries and cut-ins.
- Carry provisional extra passing demand through actual W-prime/critical-watts accounting; ensure reserved power reduces attainable forward speed without silently double-debiting fatigue.
- Compare exact paired snapshots at the first decisive wheel clip across different neutral grids, with abilities, gear, road, wind, tactics and input state frozen. Track emerging group structure, first decisive gap, energy and ranking sensitivity under full-roster full-stage simulation—not just 16-minute shadow blocking totals.
- Demand strict deterministic restart and zero official writes, complete V3 regression and production build, and corrected source-route fidelity before any sporting approval.

**Sporting approval remains BLOCKED. Official race engine selection, schedules and game clocks unchanged.**
