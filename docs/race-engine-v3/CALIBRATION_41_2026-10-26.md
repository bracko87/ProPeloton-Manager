# Race Engine V3 — Batch 41: multi-rider coordinated two-dimensional passing-corridor reservations

**Date:** 2026-10-26
**Code commits:** [109a8601](https://github.com/bracko87/ProPeloton-Manager/commit/109a860163aa9d108217f0b7f2fe41c08d69f043), [d26736eb](https://github.com/bracko87/ProPeloton-Manager/commit/d26736eb6d5af486917f8b8aada138117ee67c25)
**Result: ENGINEERING PASS / SPORTING NO-GO / OFFLINE ONLY.** All official writes: **zero**.

## Question and disciplined interpretation

Batch 40 proved that independent lane forecasts and wider hypothetical road width can increase the chance of a geometrically clear passing shadow, but did not stop **several simultaneously proposed passes from claiming conflicting space**. Batch 41 builds a separate serialized, deterministic **multi-rider corridor coordinator**. It can track 1 or up to 3 simultaneous reservations, arbitrate admission by the rider's current blocked-wheel streak and rider ID, reject overlapping **future predicted two-dimensional trajectories**, and independently verify every accepted active shadow against actual observed future competitor trajectories.

**It does not modify real race movement or racing decisions.** It is an independent, persisted **shadow reservation state** alongside unaltered coupled V3 reference races. Although multiple shadow reservations coexist, they do not force nearby source racers to yield, cannot prevent future uncoordinated riders from entering an intended corridor, and do not produce an alternative full-race winner, time gap, or GC. A successful reservation never grants free longitudinal progress.

## Model, safety and fairness

- **Physics of geometric shadows:** the unchanged Batch 39 continuous analytical simultaneous longitudinal/lateral collision test checks whole ten-second intervals, including possible mid-tick contact. Provisional longitudinal contact limit: 1.8 m. Two research-only road envelopes are used: four tracks, width 5 m / centre pitch 1.0 m / total bike+lateral buffer 0.8 m; and hypothetical width 6.5 m / pitch 1.2 m / buffer 0.8 m. These are **not documented stage road widths**.
- **Fair arbitration:** candidates come solely from the existing anticipatory-lane planner **at the current tick** after an observed blocked-wheel motion. The planner must mark an actual desired lane change and the rider must have nonzero commanded-but-prevented metres. The coordinator sorts by longest current same-leader block streak, then rider ID. Each rider has at most one pending reservation.
- **Finite time:** two full 10-second reaction intervals with no lateral movement, followed by three 10-second lateral movement intervals. The source rider's longitudinal movement remains the unchanged baseline; the hypothetical lateral progress advances 1/3 of the pitch per steering tick.
- **Multi-reservation conflict exclusion:** at admission, each proposed candidate trajectory is projected across the next five ticks from currently known completed positions and speeds, compared with active candidates' existing reservation progress, and rejected when the two claimed volumes intersect in continuous 2D. Forecasting is separately selectable and uses **no future observed race information**. At each later tick, shadow trajectories are evaluated against all *actual newly observed source rider trajectories*, then against the already accepted other shadow reservations. Older reservations take priority. Any contact rejects the lower-priority shadow instead of creating an overlap.
- **Energy and replay:** the existing research W-prime ledger is debited for actual observed mechanical watts plus 35 extra watts per accepted steering tick. The debit occurs only in the shadow's serializable state. Every admission and active shadow transition is tested against the identical JSON-serialized input. Unit tests check disjoint concurrent movement, conflicting pair arbitration, one- versus two-reservation capacity, deterministic serialization, finite surcharge 1,050 J for each three-tick completion, and no mutation of the coordinator input.
- **No false full-race A/B:** whole-race classifications shown here belong exclusively to the 24 **unchanged controls**. A shadow's aggregate changed future metres is not a stage performance result and must not be summed as such.

## Test matrix

Frozen source research fixtures: **Dordrecht 106 riders**, **Guangxi 168 riders**; energy-only W-prime and energy plus default finite passing; three deterministic neutral grid seeds; existing frozen synthetic weather and synthetic +3 m/s headwind/+2 m/s crosswind. This is **24 complete reference races** with four modes × six grid/weather combinations. Each reference records the first **144 × 10-second ticks (24 minutes)** with an independently initialized coordinator for each of **8 policies**:

- 5.0 m or 6.5 m hypothetical width;
- maximum one or maximum three concurrent lane reservations;
- current-speed look-ahead forecast on or off.

Every original-grid frozen control is compared with a separate uninterrupted `runCoupledV3`; every complete result is compared with a JSON-restored checkpoint at tick 144. All outputs demand `sportingApproval: NOT_APPROVED` and `officialWrites: 0`.

## Aggregate results across all 24 unchanged reference races

**Admitted** means a reservation has actually started, excluding forecast vetoes and capacity or other admission rejections. **Completed** means the continuous trajectory passed the conservative full-duration swept checks. **Next safe** is the independent final next-tick source-physics comparison, not a full alternative race.

| Width / policy | Admitted | Completed | Complete/admitted | Actual physical path collision rejections | Safe next tick | Peak active |
|---|---:|---:|---:|---:|---:|---:|
| 5 m, cap 1, no forecast | 921 | 78 | 8.5% | 803 | 77 | 1 |
| 5 m, cap 1, forecast | 887 | 110 | 12.4% | 734 | 109 | 1 |
| 5 m, cap 3, no forecast | 2,793 | 225 | 8.1% | 2,375 | 224 | 3 |
| 5 m, cap 3, forecast | 2,709 | **248** | 9.2% | 2,260 | 246 | 3 |
| 6.5 m, cap 1, no forecast | 916 | 95 | 10.4% | 779 | 94 | 1 |
| 6.5 m, cap 1, forecast | 894 | 119 | **13.3%** | 729 | 119 | 1 |
| 6.5 m, cap 3, no forecast | 2,764 | 284 | 10.3% | 2,291 | 282 | 3 |
| **6.5 m, cap 3, forecast** | **2,715** | **307** | **11.3%** | **2,229** | **305** | **3** |

The max-three versions show **actual concurrent shadow state** (for example 2,391 multi-active rider-ticks at the 6.5 m / cap 3 / forecast setting). Forecast admission and inter-reservation overlap rejections are separately measured: 6.5 m cap3 forecast has **25 predicted reservation conflicts** and **2,921 distinct forecast veto decisions**, while 5 m cap3 no-forecast has **60 inter-reservation admission conflicts**. Rejected proposed reservations remain rejected, not displaced or simulated in the real race.

The main tradeoff: allowing three reservations at once approximately triples starts and raises **the absolute number** of clear completed paths, but does **not reliably raise per-start completion probability**. On the same 6.5 m forecast geometry, cap 1 has **13.3%** conditional success, cap 3 only **11.3%**. The majority still fail due to **actual source-rider 2D collisions**, not a coordinator bookkeeping problem. The forecast cannot guarantee a rider will not unexpectedly enter the space later.

### Selected original-grid, frozen-weather no-forecast successes

| Mode | 5m cap1 | 5m cap3 | 6.5m cap1 | 6.5m cap3 |
|---|---:|---:|---:|---:|
| Dordrecht energy-only | 0/42 | 6/125 | 1/41 | **12/121** |
| Dordrecht finite passing | 5/35 | 12/111 | 7/36 | **18/109** |
| Guangxi energy-only | 2/43 | 6/127 | 3/43 | **9/125** |
| Guangxi finite passing | 4/37 | 6/115 | 5/37 | **8/113** |

These numerators and denominators are **independent admitted shadow reservation attempts in one single original-grid reference race**, not actual executed racing maneuvers.

## CI and evidence integrity

- [Batch 41 four-job full-matrix GitHub Actions — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40348386205): 24 complete unchanged races, eight shadow policies per reference, exact source position and wheel-block replay, candidate conflict and energy tests, JSON checkpoint/restart equality, and `npm run build`.
- [V3 legacy isolation — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40348386230): inspected completed 51 steps, zero failed steps, zero GitHub `##[error]` log entries. Its **sporting route fidelity** remains correctly blocked by missing real-stage terrain: World Nations Hilly/Mountain declared 1,785 m climb versus represented 720 m, **1,065 m missing**. The Guangxi proxy separately misses 718 m declared ascent.
- GitHub retains 4 data artifacts for 30 days; one JSON per fixture/mode records original full-race rider finishes, 3 grids × 2 weather profiles, eight shadow policies, active/reservation conflict counts, physical rejections, first 30-metre geometric separation, W-prime surcharge and checkpoint equality. The combined ZIP additionally includes a text aggregate summary.
- The total new repository scope is **only** `scripts/v3/coordinatedCorridorV3.mjs`, `scripts/v3/verify-batch41-coordinator-v3.mjs`, `scripts/v3/audit-batch41-coordinator-v3.mjs`, `.github/workflows/v3-batch41-coordinator.yml`, and this calibration report. **No production engine, `src/race-engine-v3/**`, official race result, Supabase schema/data, or game clock touched**.

## Decision, limitations, next research

**ENGINEERING PASS; SPORTING NO-GO.** The new model demonstrates that competing 2D reservations can be scheduled deterministically, without double-claiming modeled road space, and revalidated against actual source tick geometry. It does not demonstrate a safe **interactive peloton**: the unchanged source racers do not steer in response to reservations, rider width and road segment width are unmeasured, a candidate still uses unchanged baseline longitudinal motion, and there are no alternative full-race gaps/classifications. Proposed active reservations do not occupy space in the production wheel solver.

**Batch 42 next:** construct a truly coupled *offline* multi-rider two-dimensional movement solver with simultaneous lane displacement and longitudinal speed under the same collision constraints, conservative traffic yielding, rider energy/power accounting and serializable lane reservation commitments. Start with 8–24 rider microfixtures, repair stage route-fidelity blocking data, then compare 106/168-rider full races against the unchanged baseline before considering sporting approval. No live physics selection until real course width, grade and breakaway behavior are calibrated.

**STATUS: SPORTING NO-GO; zero official writes.**
