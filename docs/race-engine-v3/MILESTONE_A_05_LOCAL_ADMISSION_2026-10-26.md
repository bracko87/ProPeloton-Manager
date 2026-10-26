# Race Engine V3 — Milestone A2: global vs spatially local passing admission

**Date: 2026-10-26. Technical result: PASS. Sporting result: FAIL. Local-admission candidate REJECTED for gameplay.**

## Controlled hypothesis

The original coupled 2D research model limits the *entire peloton* to three simultaneous passing reservations, no matter how far apart the riders are. The [A2 start-row confinement audit](MILESTONE_A_04_ROW_CONFINEMENT_2026-10-26.md) found approximately 70% sampled rider blocking in both full-stage fixtures.

This test adds opt-in `experimentalPassingAdmissionPolicy: 'local_30m'` to the offline solver. At most three reservations can be active within 30 metres of any newly admitting rider; physically separate clusters can begin independent maneuvers. This *does not* relax continuous within-tick collisions, tire/bicycle clearance, speed demand, steering cost, W-prime conservation, road width, timing, or the official gameplay engine. The default remains `global`. The cap remains three locally; no unlimited local overtaking.

The code, micro validation and four-scenario-per-fixture full-stage audit were committed in [`f04090c5`](https://github.com/bracko87/ProPeloton-Manager/commit/f04090c59e4dceacd1f515425450c8b0e48c97e6).

## Full-stage test matrix (original synthetic starting grid)

| Metric | Dordrecht global | Dordrecht local | Guangxi global | Guangxi local |
|---|---:|---:|---:|---:|
| Riders finished | 106/106 | 106/106 | 168/168 | 168/168 |
| Winner | r003 | r001 | r003 | r003 |
| Winner time (seconds) | 11,940.508200 | 11,966.441146 | 17,566.270712 | 17,609.010904 |
| Last-rider gap (seconds) | 1,193.300376 | 1,169.336614 | 1,231.182305 | 1,206.981501 |
| Blocked rider-ticks | 92,768 | 85,284 | 208,287 | 211,296 |
| Completed steering maneuvers | 573 | 1,365 | 905 | 2,267 |
| Aborted steering maneuvers | 264 | 389 | 279 | 483 |
| Simultaneous reservations peak | 3 | 13 | 3 | 16 |
| First 30-metre geometric split | 160s | 160s | 170s | 170s |

### Starting-lane sensitivity (original grid vs swapping only the first two riders' lanes)

| Metric | Dordrecht global | Dordrecht local | Guangxi global | Guangxi local |
|---|---:|---:|---:|---:|
| Riders whose finishing rank changes | 96/106 | 101/106 | 165/168 | 165/168 |
| Inverted rider-pair share | **7.619048%** | **15.759209%** | **18.555746%** | **25.998004%** |
| Increase in inversion share | — | **+8.140161 percentage points** | — | **+7.442258 percentage points** |
| Winner changes after two-rider lane swap | Yes | Yes | **No** | **Yes** |
| Swapped-grid winner | r006 | r003 | r003 | r117 |
| Swapped-grid completed steering maneuvers | 591 | 1,308 | 919 | 2,688 |
| Swapped-grid simultaneous reservation peak | 3 | 11 | 3 | 20 |

The local candidate reduced Dordrecht original-grid blocked rider-ticks by **7,484**, but increased Guangxi original-grid blocking by **3,009**. It increased steering maneuvers by 792 in Dordrecht and 1,362 in Guangxi. Its original-grid tail gaps were each approximately **24 seconds smaller**, but that single improvement is not sufficient evidence of credible groups or sportingly stable classifications.

**Crucial regression:** under the identical two-rider starting-lane change, both candidate fixtures suffered substantially more rider-pair inversions; Guangxi also changed the winner when the global control had not. There is no sporting basis to promote the policy.

## Verification and isolation

- [A2 local-admission full-stage Actions — SUCCESS, both fixture jobs](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40394528826): eight full 2D stages, 106/168 riders, original/swapped for global/local, finish classifications, local-candidate serialized checkpoint recovery, micro collision checks, default-exact comparison and production app build.
- [Legacy isolation Actions — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40394528963) and [core coupled 2D research — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40394529195). Their green results do **not** provide sporting clearance.
- Full per-rider classification and original-grid/swap comparisons retained as 30-day Actions artifacts: `v3-a2-local-admission-dordrecht-2000-10-15` and `v3-a2-local-admission-guangxi-2000-10-19`.
- The global behavior, including original winner and last-rider gap, exactly reproduces previously verified control values. Invalid admission policies are rejected. Candidate full-race recovery exactly matches uninterrupted simulation.
- **No official race-result writes, SQL, Supabase, live race selection, worker changes, historical results, game clocks or gameplay integration.**

## Limitations and next gate

The policy uses a hypothetical fixed 5-metre road and a 30-metre longitudinal window; these are not verified stage-specific geometry. The two original/swap scenarios cannot establish grid-independence, and completed lane-steering maneuvers are **not** the same thing as confirmed overtakes of another bicycle. The source still lacks 718 metres of Guangxi and 1,065 metres of World Nations reported climbing, authentic road widths, calibrated rider energy/teams and real breakaway benchmarks.

**Next specific A2 task:** instrument tick-accurate longitudinal order crossing and per-rider blocked-wheel queue duration, separated into waiting for global admission, waiting for physically clear lateral lanes, and steering failures. Establish precisely *which* mechanism produces starting-order sensitivity, then test a narrow intervention against at least three grids and flat/hilly/mountain benchmarks, without maximizing lane-change counts for their own sake. Independently repair route fidelity and terminal-tick energy before declaring realism.

**Decision: A1 technical gate retained. A2 SPORTING NO-GO. B NOT STARTED. C NOT STARTED. Spatially local admission remains an isolated, off-by-default research candidate, NOT an approved fix.**
