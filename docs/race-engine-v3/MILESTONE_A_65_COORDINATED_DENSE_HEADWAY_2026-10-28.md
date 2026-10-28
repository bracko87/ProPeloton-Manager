# Race Engine V3 — A65: bounded coordinated following in crowded normal-start pelotons

**28 October 2026 — isolated physical engineering gate PASS; realistic sporting and production approval NO-GO.**

## Prior failure, actual question

[A64](MILESTONE_A_64_NORMAL_START_SUSTAINED_PILOT_2026-10-28.md) established a genuine **t=0, future-blind** cycling field research harness with all-pair swept collision rejection and 0.5s coupled updates, but both **fully occupied 32-rider** variable-speed grids collided. The first rejected pair was `r015/r020`: **24.65625s** in the mixed grid and **8.90625s** in the more aggressive grid. An open-corridor 32-rider scene already passed 90 seconds with **22 completed lane changes**, so deleting all lateral movement was not an acceptable solution.

The A61 reactive alarm could command both a leader and its follower to brake maximally at the same time while a small existing closing-speed difference persisted. A65 studies a more stable, **leader-dependent bounded following plan** that starts with the entire peloton at t=0. No retrospective known-contact time, frozen A44 obstacle, targeted rider ID, artificial stopping, velocity reset, instant lateral move or recovery after accepted collision is permitted.

## Implementation

- [A65 optional normal-start controller](../../scripts/v3/a2NormalStartPelotonV3.mjs): `controllerPolicy: 'coordinated_headway'`, isolated from the older default `legacy` policy and from the game's official race solver.
- [Matched A64-vs-A65 test and 3.2 / 3.8 / 4.5m headway trial](../../scripts/v3/verify-a2-step65-coordinated-headway-v3.mjs)
- [Full on-GitHub validation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

At the beginning of each 0.5s step, the controller computes each rider's intended acceleration and lateral target from **current** physical x, y, velocity and the current user-independent synthetic speed request. In descending actual road position (not rider-ID order), it determines the nearest relevant leader in an overlapping or intended crossing lateral corridor. The follower then limits acceleration using **that leader's already-bounded acceleration**, the present clearance, target following gap and a minimum research endpoint separation of **2.05m**. It cannot accelerate above **+0.45m/s²**, brake below **−0.85m/s²**, steer faster than **0.38m/s**, cross the road edges or borrow W-prime. The existing continuous 16-interval/piece conservative all-rider sweep still rejects any actual contact before state commit.

The **2.05m** emergency step clearance, **3.2/3.8/4.5m** target following spacings, road width, speed requests, critical-power/W-prime and bicycle lateral envelopes are *synthetic, uncalibrated research inputs*. They are not verified professional-racing safe following distances. The same single policy is applied **uniformly** to a whole field, not optimized per rider or chosen with advance knowledge of contact.

Braking and gap-limiting counters were corrected: an actual brake-rider tick now means **negative acceleration**, whereas `headwayLimitedRiderTicks` separately counts reduced acceleration plans, including still-positive accelerations.

## Matched 90-second dense/start-grid outcomes

| Source grid (32 riders) | Legacy A64, original normal start | A65 coordinated 4.5m target | A65 coordinated 3.2m target |
|---|---|---|---|
| Full five-lane mixed speed | Collision at **24.65625s** | **90s clear** | **90s clear** |
| Full five-lane aggressive speed | Collision at **8.90625s** | **90s clear** | **90s clear** |
| Open outside passing lanes | **90s clear** | **90s clear** | **90s clear** |
| Completed lane changes, open corridor | **22** | **13** | **13** |
| Longitudinal order reversals, open corridor | **118** | **111** | **112** |
| Completed lane changes, aggressive five-lane start | 1 before rejected contact | 0 | **3** |

All **nine** 90s A65 settings (3.2, 3.8, 4.5m on three 32-rider grid modes) complete without swept contact. The 3.2m variant has **74** mixed and **93** aggressive order reversals, compared with 4.5m's **72** and **68**, but still underperforms the pre-existing open-corridor controller on completed overtakes. Individual longitudinal order reversals are NOT proof of legally and physically completed stage passes.

The original shorter reference cohort consisted of 6 cases (8-rider mixed and corridor; 32-rider mixed, aggressive, corridor and steady). Under 4.5m following it improves from **4/6 → 6/6** collision-free scenarios, **2 rescues and 0 safety regressions**. Rider-ID relabeling, mirrored-road x/y/energy parity and serialized checkpoint resumes passed on every compared variant.

## Sustained 180-second and larger interactive tests

The global **3.2m** parameter, without scenario-specific tuning, was then exercised for **180 seconds** in 32-rider fields:

| 32-rider normal start | 180s result | Final longitudinal pair-order reversals | Completed lane changes | Near-stop rider ticks |
|---|---|---:|---:|---:|
| Mixed speed, five-lane filled | **FULL_HORIZON_CLEAR** | 92 | 0 | 0 |
| Aggressive speed, five-lane filled | **FULL_HORIZON_CLEAR** | 97 | 3 | 0 |
| Open passing corridors | **FULL_HORIZON_CLEAR** | 146 | 13 | 0 |

For all three 180s cases, the road-mirrored and rider-identity-relabelled results match, and the saved state after **90s** resumes to the exact original **180s** result.

A separate first, highly limited **interactive** larger-peloton diagnostic, also with 3.2m and changing individual speed targets, completed **15 simulated seconds** without detected swept collision for **106 riders** (58 longitudinal order changes) and **168 riders** (92 changes). These are **not complete races**, not sustained bunch races, and certainly not proof of scaled production runtime or sporting dynamics. The former 106/168 rider A64 control was a non-interactive steady-speed 30s smoke run.

**Negative controls:** pre-overlapping starting riders are rejected at time 0; physical state does not advance on rejection. The full previous A63 **67/67** short-field collision, mirror/ID, W-prime and deterministic replay gate remains in the workflow. The full A58–A39 historical physics gates, finish-line check and React production build are retained without weakening.

## Honest sporting assessment

**Engineering improvement: substantial. Sporting promotion: NO-GO.** A65 fixes the two original dense-grid 32-rider 90s test failures under a provisional gap-regulation algorithm and extends three dynamic 32-rider experiments to 180s. It also exposes **unacceptable passing suppression** in the open-corridor benchmark: completed lane changes fall **22 → 13**, even with the shorter 3.2m standoff.

Another serious limitation: the sample scenarios primarily cruise at low synthetic power demand, so finite W-prime bookkeeping is correct but **fatigue/drafting/attacks are not calibrated or meaningfully stressed**. The 180s 32-rider simulations and 15s interactive 106/168 rider trials are far from full sourced Dordrecht/Guangxi stages. The provisional fixed five-lane geometry is not a real race route.

**Next A66 objective:** restore the **22+** open-corridor completed lane passes (or a physically justified equivalent) *without losing* the new dense-grid 180s safety and identity/reflection invariance. Evaluate side-safe intent preservation and cooperative claim timing, actual lane-pass tracking, 120–600-second field persistence, realistic power/drafting, crowd width and formation behavior, then extend sustained **106/168** interactive fields with sourced stage profiles and classifications. Never improve numbers by disabling swept collision tests, artificially clamping speed after contact or removing independent old regressions.

**Release boundary:** research files on GitHub `main` only. No official selected game solver, Supabase data, live race results, payouts, clocks, Netlify behavior or user game state were changed.
