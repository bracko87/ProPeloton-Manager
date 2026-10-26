# Race Engine V3 — Milestone A2: coordinated neighbor-space passing study

**26 October 2026 — technical PASS / sporting FAIL. Candidate rejected; official engine unchanged.**

## Hypothesis

An existing lane-change reservation prefers the leftmost clear adjacent lane. When more than one lane has already passed the solver's immediate collision and reservation checks, selecting the one with better forward and rearward wheel clearance might improve peloton mobility and reduce dependence on arbitrary start positions.

Commit [`683c1c19`](https://github.com/bracko87/ProPeloton-Manager/commit/683c1c1959706a4208bc96ed2a6cf6bb215b8485) adds a **research-only**, opt-in `experimentalPassLanePolicy: 'neighbor_space'` policy. A bounded, deterministic candidate score uses existing nearby rider positions and reservations to rank *already safe* neighboring lanes. No passing reservation is permitted on an unsafe track; the solver retains global capacity 3, 10-second ticks, hard continuous 2D collision checks, finite W-prime and existing 35 W steering charge. Default `left_first` is unchanged and byte-equivalent to the historical control.

## Full-stage test matrix

For each frozen race, six complete full-stage scenarios ran: two lane-selection policies × three starting grids (original, exactly two riders' starting lanes swapped, and a one-lane rotation of every rider's initial lane). Experimental results were restored exactly from serialized mid-stage checkpoints.

| Measurement, original grid | Dordrecht control | Dordrecht candidate | Guangxi control | Guangxi candidate |
|---|---:|---:|---:|---:|
| Riders classified | 106/106 | 106/106 | 168/168 | 168/168 |
| Winner | r003 | r005 | r003 | r003 |
| Winner time (s) | 11,940.508200 | 12,038.790668 | 17,566.270712 | 17,558.426275 |
| Last-rider gap (s) | 1,193.300376 | 1,095.017908 | 1,231.182305 | 1,170.356085 |
| Blocked rider-ticks | 92,768 | 102,255 | 208,287 | 207,954 |
| Completed steering reservations | 573 | 553 | 905 | 896 |
| Aborted steering reservations | 264 | 296 | 279 | 293 |
| First geometric 30-metre split (s) | 160 | 160 | 170 | 170 |

### Classification stability under starting-grid perturbations

| Metric | Dordrecht control | Dordrecht candidate | Guangxi control | Guangxi candidate |
|---|---:|---:|---:|---:|
| Two-rider lane swap: inverted pair share | **7.619048%** | **19.119497%** | **18.555746%** | **24.779013%** |
| Full-grid rotation: inverted pair share | **8.319856%** | **9.380054%** | **20.280867%** | **23.260622%** |
| Change in two-rider swap inversions (percentage points) | — | **+11.500449** | — | **+6.223267** |
| Change in full-grid rotation inversions (percentage points) | — | **+1.060198** | — | **+2.979755** |
| Two-rider swap changes the winner | Yes | Yes | No | No |
| Full-grid rotation changes the winner | Yes | Yes | No | No |

**Sporting decision: FAIL.** Both races produce substantially more reversed rider-pair orderings from a minimal two-rider lane swap. The full-grid rotation is worse as well. Original-grid tail gaps shrink by about 98 s in Dordrecht and 61 s in Guangxi, but these isolated gains do not establish credible groups or stable classifications; Dordrecht blocking also grows by 9,487 rider-ticks. Do not activate this candidate.

## Verification

- [A2 neighbor-space full-stage GitHub Actions: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40399090530): both independent 106/168-rider jobs passed small collision/finish assertions, opt-in default parity, three-grid full-stage simulations per policy, exact candidate checkpoint recovery, and application production build.
- [Legacy isolation SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40399089599) and [core coupled 2D research SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40399089860) at the experiment commit.
- 30-day JSON evidence artifacts: `v3-a2-neighbor-space-dordrecht-2000-10-15`, `v3-a2-neighbor-space-guangxi-2000-10-19`. These retain every rider's finishing classification, the three grids and the stability comparisons.
- The default solver, official race selector, historical results, database, workers, live clock and gameplay remain unchanged. **Official writes: 0.**

## Specific next gate

After repeated failures of policies that simply add overtaking opportunities or change lane preference, prioritize a controlled **numerical and movement-resolution audit** before proposing additional tactics: compare 5-second and 10-second ticks using identical synthetic rider/road inputs where supported; measure deterministic checkpoint recovery, collision-free passage, exact physical energy accounting and reproducibility under three start grids. Distinguish numerical order-of-update amplification from authentic rider/energy/tactical effects.

Do **not** assume finer time steps automatically fix results. Real road widths, 718 m missing Guangxi climbing, 1,065 m missing World Nations climbing, realistic breakaway/chase tests, calibrated physiology, and sub-tick finish energy still block sporting approval.

**Milestone A1: complete technically. A2: OPEN / SPORTING NO-GO. B/C: NOT STARTED.**
