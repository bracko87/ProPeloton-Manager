# Race Engine V3 — Step 70: whole-peloton lane capacity, upstream speed information and bicycle-body road clearance

**28 October 2026 — Offline technical verification PASS, sporting/full-stage NO-GO.**

## Scope and motivation

[Step 69](MILESTONE_A_69_MULTI_RIDER_MERGE_CAPACITY_2026-10-28.md) recovered 120-second collision-free **32-rider** starts through both synthetic narrowing profiles, but 106/168-rider fields still rejected following collisions or road exits. More braking and leader acceleration did not fix the chain. Critically, Step 68–69 road limits tested rider **centres**, which can falsely imply a whole bicycle fits at the edge of the road.

Step 70 adds two independent things: (1) an opt-in current-state road-capacity planner that advises lane continuity and shares upstream pace information, and (2) an opt-in physical **rider/bicycle half-width** against the changing road edge. Neither reads future accepted racer trajectories or authorizes live activation.

### Implemented, isolated research modules

- [`a2LaneCapacityPlannerV3.mjs`](../../scripts/v3/a2LaneCapacityPlannerV3.mjs): pure, rider-ID-independent road-width lookahead over 20 seconds at current speeds. It can recommend **holding an already feasible lateral position** while a known road pinch is approaching. A second variant uses up to 40 metres of actual *current* same-lane rider positions and speed to communicate a slower attainable speed demand upstream. It does not move a rider or spend energy.
- [`a2NormalStartPelotonV3.mjs`](../../scripts/v3/a2NormalStartPelotonV3.mjs): opt-in `platoon_capacity_hold` and `platoon_capacity_wave` policies; ordinary 0.5s all-field physics, **+0.45/−0.85m/s²** acceleration and **0.38m/s** lateral steering are unchanged. Any accepted frame still faces every pair's conservative swept-contact test, the road-boundary test, and exact energy bookkeeping.
- [`a2VariableRoadWidthV3.mjs`](../../scripts/v3/a2VariableRoadWidthV3.mjs): optional physical `bodyHalfWidthM` expands the roadside test from a centre point to **both sides of the bicycle/rider envelope**, at the original 16 subintervals and their midpoints. It also narrows the *intended* future lateral target corridor by that margin, but it never teleports a cyclist into a valid position.
- [`verify-a2-step70-lane-capacity-v3.mjs`](../../scripts/v3/verify-a2-step70-lane-capacity-v3.mjs) and [`verify-a2-step70-body-clearance-v3.mjs`](../../scripts/v3/verify-a2-step70-body-clearance-v3.mjs): 18 centre-only matched capacity runs plus 12 opt-in full-bicycle-envelope runs; reflected/renamed physics, energy, exact JSON checkpoint on completed runs, and forced-invalid-start rejection.
- [Targeted Step 70 GitHub CI](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step70-capacity-targeted.yml); [full A59–A70 gate plus React regression/build workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml). No prior race/physics tests were removed.

## Stage 1: nominal centre-only road capacity comparison

The unmodified A69 `platoon_lane_forecast` is the comparison policy. All fields start normally at t=0, on identical three-column mixed-speed grids; both mild and strong road-width profiles start at **4.4m**, narrow gradually to **3.3m** or **2.2m**, and reopen. **32 riders target 120s, 106/168 riders target 90s.**

| Riders | Road profile | A69 lane forecast accepted | A70 lane hold accepted | A70 lane hold + upstream pace accepted |
|---|---|---|---|---|
| 32 | Mild | 120s CLEAR | 120s CLEAR | **120s CLEAR**, 21 lateral changes |
| 32 | Strong | 120s CLEAR | 120s CLEAR | **120s CLEAR**, 33 lateral changes |
| 106 | Mild | 22.5s then contact | 22.5s then contact | **24s** then road-edge rejection, rider r075 |
| 106 | Strong | 15.5s then contact | 15.5s then contact | **21s** then contact, riders r088/r091 |
| 168 | Mild | 22.5s then contact | 22.5s then contact | **24s** then road-edge rejection, rider r075 |
| 168 | Strong | 15.5s then contact | 15.5s then contact | **21s** then contact, riders r088/r091 |

**Interpretation:** all 18 scenarios passed the technical *fail-closed integrity* gate. The 32-rider successful cases had **zero near-stop ticks** and made measurable lateral progress. The capacity-hold variant did not exercise a new hold in this particular corpus (the A69 lane forecast already blocked the relevant outer-lane requests), so **it is not independently demonstrated to improve racing**. Upstream speed requests were actively used, and extended the large-field pre-failure period, but **none of the 106/168 runs completed**.

## Stage 2: physical bicycle-width clearance

The new optional physical body half-width is **0.3m per side**. This is an intentionally provisional **0.6m total-width research envelope**, NOT a calibrated actual road bike/handlebar+rider model, nor a source-based road-width measurement.

The number of *simultaneous cross-sectional lanes* allowing **at least 0.8001m lateral separation** between centres, after reserving 0.3m on both road edges, is:

| Nominal road width | Usable lane-centre width | Maximum physically separated side-by-side positions |
|---|---:|---:|
| 4.4m (full) | 3.8m | **5** |
| 3.3m (mild minimum) | 2.7m | **4** |
| 2.2m (strong minimum) | 1.6m | **2** |

This is an instantaneous lateral-capacity ceiling, not a promise that an entire peloton can be scheduled through it. **The starting grid has three cyclists abreast** in each row. For the strongest 2.2m section those three cannot remain abreast with the new conservative geometry. One or more riders must acquire *real longitudinal staggering* by bounded acceleration and safe lane admission **before the pinch**, not just steer 0.3m inward at the edge.

The new 12-case audit repeated both A69 lane forecast and the A70 upstream-speed policy with the 0.3m envelope enabled:

| Riders | Mild width, lane forecast | Mild width, upstream pace | Strong width, lane forecast | Strong width, upstream pace |
|---|---|---|---|---|
| 32 | **120s FULL_HORIZON_CLEAR** | **120s FULL_HORIZON_CLEAR** | **Road exit reject at 16.5s**, r002 | **Road exit reject at 16.5s**, r002 |
| 106 | Contact at 22.5s | Contact at **30.5s** | Contact at 15.5s | Road exit reject at 16.5s, r002 |
| 168 | Contact at 22.5s | Contact at **27s** | Contact at 15.5s | Road exit reject at 16.5s, r002 |

**The most important correction:** Step 69's 32-rider centre-only strong-road “120s safe” result **does not pass when full bicycle width is checked**. At the strong road profile's constraint, the outside track lies too close to the physical road edge for a bicycle. The new checker properly rejects that step **without changing rider position, W-prime or clock**. So the previous 32-rider strong result is *not sufficient evidence of realistic safe riding*. The 32-rider **mild** case does survive this stronger check for its full 120 seconds.

All 12 new outcomes passed the exact failure-category/time and mirror/renaming parity checks; completed cases passed exact midway serialized recovery. A purposely body-infeasible starting point at x=800m is rejected at **time 0** before a state commit, while the previous centre-only negative control remains unchanged.

## What has and has not been achieved

**Engineering acceptance PASS:** truthful capacity metrics, read-only guidance, an independently enforceable body-road-edge limit, old test backward compatibility, changed-width collision and road rejection, no rider-ID or physical-side bias, deterministic resumed checkpoints, preserved physical energy ledger and zero official writes.

**Sporting acceptance NO-GO:** A70 improves early flow in certain large pelotons, but neither 106 nor 168 riders complete the changing-width 90s test. In the strong synthetic narrowing even 32 riders **fail realistic bicycle-edge acceptance**. A provisional lateral road-margin model also does not yet account for the full dynamic bicycle turning geometry. No complete stage, real terrain elevation, source-verified road widths, drafting, meaningful fatigue, attacks, group time gaps, team tactics or official finish classification is validated.

## Step 71 — necessary next engineering design

Build a **nonclairvoyant longitudinal stagger / merge-slot allocation planner** that uses the measured *two-abreast* capacity of a 2.2m road, reserves physically achievable time/distance gaps for three-abreast incoming groups, and propagates speed decisions far enough upstream to prevent impossible braking chains. Favor true matching of moving corridor space and safe temporal occupancy, not ID-specific priority, blanket no-overtaking or overpowered brakes. Require **32-rider strong-width safety with full bicycle-body clearance** as the first target; then 106/168 full 90s and multi-minute physical starts. Preserve mild-width 32-rider 120s success, earlier A63 67/67 and A67 genuine overtakes, mirrored/renamed parity and real fail-closed road/energy/collision checks. Real road widths and bicycle dimensions must be sourced/calibrated before sporting approval.

**Release boundary:** This is offline, explicitly opt-in V3 research on GitHub `main`. The selected live engine, Supabase race data, historical results, riders, payouts and clocks were **not changed**.
