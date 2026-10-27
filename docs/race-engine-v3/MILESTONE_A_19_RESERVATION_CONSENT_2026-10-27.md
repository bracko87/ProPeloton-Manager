# Race Engine V3 — A2 multi-tick acknowledged passing-corridor reservation

**27 October 2026 — TECHNICAL MICRO PASS; SPORTING FAIRNESS FAIL / DO NOT PROMOTE.**

## Question

The [previous road-width and physically interacting moving-blocker study](MILESTONE_A_18_DYNAMIC_CORRIDORS_2026-10-27.md) found that an early open lane and a snapshot-only "adaptive" side choice each failed to yield a sustained pass in all 64 moving-obstacle cases, despite full swept-collision safety. Can an **explicit, non-clairvoyant cooperative reservation** preserve overtaking without forcing non-consenting riders to yield or starving the acknowledged rider?

## Exact implementation

The additional research-only `scripts/v3/a2CorridorReservationResearchV3.mjs` maintains an opt-in JSON-serializable **lease of a proposed passing lane**. It uses *current rider positions, the current tick's communicated movement intentions, and the last observed lateral motion*, never access to future actual rider decisions. It grants a lease when the current corridor selector sees an unoccupied adjacent track and watches a two-adjacent-step projection for a rival approaching that track within a synthetic 90m longitudinal screen.

If another cyclist signals an intended approach to the corridor, the system may defer **that rider's current lateral maneuver only with the rider's explicitly declared acknowledgement**. Without acknowledgement, the lease cancels; the other rider retains its intended motion. The consenting cyclist may defer at most **two times**. If it still requests entry, the lease cancels. A lease also expires after eight ticks. These are synthetic research parameters, **not cycling regulations or approved gameplay defaults**.

Every move, acknowledged or not, is passed to the **unchanged** `simultaneousConflictResearchV3.mjs` and its existing continuous swept-collision and W-prime safety checks. The protocol is not an alternate physics solver, does not compel a non-consenting rival, and does not write official race results, clock, database or selection state.

Code and fixes:
- [Initial explicit-consent and abort model](https://github.com/bracko87/ProPeloton-Manager/commit/3f25988b01fc1fddf4ff1fcf3955567acca32902).
- [Two-step communicated-intent forecast correction](https://github.com/bracko87/ProPeloton-Manager/commit/8e082b6fb3eb2e03f2a09c94ecae0c2642cc42f5).
- [Full 2–6-rider baseline/acknowledged/refused comparison](https://github.com/bracko87/ProPeloton-Manager/commit/55c8eb7ad28a57e5a8914bf5a7aadff73d84d3b0).
- [Important test-strengthening correction: rivals continue their requested lane change until it actually completes](https://github.com/bracko87/ProPeloton-Manager/commit/7d9c815b1eb904f75769f3ac5c6c1cd0aad98938).

The first comparison allowed the blocker to request a change on just two predetermined ticks, potentially erasing the entire maneuver through voluntary deferral. **Its more optimistic results are superseded by the stronger, persistent-rival-intent experiment below.**

## Verified test coverage

[Final GitHub Actions run: SUCCESS, five jobs](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40492304420).

The matrix includes **2, 3, 4, 5 and 6 riders**, each across the four still-unverified **synthetic** widths/envelopes (4m, baseline 5m, 6.5m, cautious 5m), 9m/18m headways, 55m/75m scripted 10s requests, two corridor situations and three protocols.

- 2 riders: 4 × 2 × 2 × 1 × 3 = **48 cases**.
- 3–6 riders: each 4 × 2 × 2 × 2 × 3 = **96 cases**, totaling **384**.
- **Grand total: 432 complete synthetic scenarios**, each 40 × 10s = 400 simulated seconds.

All scenarios passed full rider-pair swept-collision checks on every movement, finite and nonnegative energy, no invented forward distance, deterministic serialized tick-20 checkpoint recovery for physics **and** pass observer **and** reservation state, and one-tick rider-array order independence. Existing coupled full-stage research regressions and application production build passed in the same workflow; all outputs report `officialWrites=0` and `sportingApproval=NOT_APPROVED`.

The five detailed JSON files are in GitHub artifacts `v3-a2-reservation-2` through `v3-a2-reservation-6`, retained for 30 days.

## Sporting result in the genuinely moving-obstacle scenario

Every row below aggregates **64 matched cases, using rider fields of 3–6**. A successful pass requires the trailing rider to move ahead of the leader and remain ahead for **60 seconds or more**, not merely touch a passing lane.

| Metric | Baseline early passing | Acknowledged reservation | Refused reservation |
|---|---:|---:|---:|
| Sustained 60-second pass | **0/64** | **64/64** | **0/64** |
| Moving blocker completes its own lane change by 400s | **64/64** | **58/64** | **64/64** |
| Summed near-halted unrelated rider-ticks | **445** | **593** | **445** |
| Summed near-halted passing-rider ticks | **249** | **324** | **249** |
| Explicit lateral deferrals acknowledged | 0 | **128** | 0 |
| Lease cancellations | 0 | **64** (deferral cap) | **64** (no consent) |

**Open, unoccupied corridor control (all rider sizes):** 16 cases × 5 sizes × 3 protocols = 240 cases; every candidate completed a sustained pass, with no lateral acknowledgements or cancellations required. The explicit reservation adds no benefit when the rider can already pass without contested lanes.

**Moving-blocker by rider count:**

| Riders | Baseline pass | Acknowledged pass | Refused pass | Blocker completes its move with consent |
|---|---:|---:|---:|---:|
| 3 | 0/16 | 16/16 | 0/16 | 15/16 |
| 4 | 0/16 | 16/16 | 0/16 | 14/16 |
| 5 | 0/16 | 16/16 | 0/16 | 14/16 |
| 6 | 0/16 | 16/16 | 0/16 | 15/16 |

**Interpretation:** Under these exact cooperative inputs, a short acknowledged deferral creates time for the passing cyclist to get ahead of the leader; refusing consent correctly preserves the rival's instruction and the previous failure remains. However, two deferrals and subsequent cancellation do **not** guarantee the acknowledged rider a clear eventual trajectory. Some lose too much time or remain boxed out by the unchanged collision solver. Congestion of unrelated riders becomes **worse in aggregate**. This is a sporting fairness failure, not a reason to relax collision safety or force longer holds.

The initial microscopic verification also asserted refusal cancellation, the explicit two-hold cap, output parity after JSON round-trip, and order-independent lane selection. An initial forecast unit failure identified missing two-step lateral anticipation, corrected before accepting the matrix.

## Boundary and next A2 gate

**Technical micro: PASS. Sporting acceptance: FAIL / NO-GO.** The work demonstrates a feasible *communication mechanism*, not a fair peloton traffic model. It is **not approved** for integration into the canonical 106/168-rider coupled 2D full-stage solver, tactics layer or live game.

The next bounded investigation should test **two-sided fairness**: the requesting cyclist's sustained pass must not deny the acknowledging cyclist completion of its intended lane change within a declared bounded delay. Specifically:
1. Instrument each rider's *age of pending lateral intent*, actual final lane, and queued lane changes, including the number of failed corridor requests **after** lease expiry or cancellation.
2. Test a mutual scheduling / safe gap creation protocol in 2–6-rider configurations: acknowledgements may reserve at most a very short interval, must retain the other cyclist's queued intent, and should actively identify a safe release gap. If one cannot exist, deny the reservation rather than sacrifice the rival.
3. Measure near-halted rider-ticks, sustained passes, blocked-cyclist lane-change completion, and effects of consent refusal together. Require all swept paths, W-prime, deterministic replay and no involuntary opponent control to pass.
4. **Only then** consider 12/24/32-rider pack research and additional starting grids. Authentic road widths/climb profiles, finish-tick energy accounting and historical pack/breakaway metrics remain independent blockers.

**Milestone A1 technically complete; A2 still OPEN / SPORTING NO-GO; B/C NOT STARTED. No official writes or engine switch.**
