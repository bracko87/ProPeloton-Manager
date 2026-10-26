# Race Engine V3 — Batch 34: solver-source drafting, watt, W-prime and wheel-limit attribution

**Date:** 2026-10-26  
**Final research instrumentation revision:** [0961a46a170328402966849d5d954a874e4bce6d](https://github.com/bracko87/ProPeloton-Manager/commit/0961a46a170328402966849d5d954a874e4bce6d)  
**Decision: TECHNICAL PASS / SPORTING NO-GO / OFFLINE RESEARCH ONLY.** Official writes **0**. No production racing selector, staged result, race clock, worker schedule, database or rider data modified.

## Why this test exists

Batch 33 exposed a paradox: an initial two-rider lateral swap could alter forward motion from seconds 50–70, but Guangxi's original grid did not exhibit a *different binary wheel-blocked status* until seconds 2,390 (energy-only) or 5,750 (finite passing). A nearest-wheel inference alone could not establish the underlying source.

Batch 34 adds a **read-only optional callback** to the existing offline coupled V3 tick method. It reads values **from inside the actual solver**, without changing a rider's movement, energy debit, stopping rules or checkpoint schema. The fourth `advanceCoupledV3` argument is omitted by all existing production and baseline callers. The callback receives a copied, typed row per active rider containing:

- Physical gradient, headwind/crosswind, rider provisional sustainable watts and available power, tactical order;
- Actual spatial shelter, draft leader ID, nearest initial same-lane leader ID (a proxy, **not guaranteed** to be the constraining bicycle);
- Pre-W-prime intended speed, post-W-prime bounded speed, post-passing bounded speed, commanded and achieved speeds;
- Whether the solver marked the rider as wheel-limited, **metres prevented relative to commanded** speed, lane/position changes;
- Actual mechanical watts (including finite-pass cost where relevant) and W-prime reserve before/after the tick.

The observer is **opt-in at the method-call level** and is not saved in the input fingerprint or official data. Callback values are descriptive readings; no new physics is implemented.

## Paired full-race protocol

For each frozen 106-rider Dordrecht and 168-rider Guangxi fixture, compare original and synthetic grid-B starts, both in (a) W-prime research-only energy mode and (b) W-prime + default three-tick/35 W finite passing. The experimental branch swaps exactly **two equal-distance starting-row lane assignments** while leaving other initial fields byte-identical.

Both branches simulate every race tick, source-tracing their first **660 ten-second ticks (6,600 simulated seconds)**. The remaining race is fully calculated without retaining detailed traces. At each sampled tick compare source-level mechanical watts, shelter, intended and achieved speed, W-prime, and **two distinct clipping concepts**:

1. **Wheel clipping magnitude** — different distance prevented by the actual spatial movement relative to commanded movement, even when both riders are classified as blocked.
2. **Wheel-limited flag difference** — one simulation marks the rider blocked and the other does not, consistent with Batch 33's reported different counter increments.

A `30 m group-count divergence` means a different number of gaps between sorted adjacent rider positions of at least 30 m. This is not an official breakaway or stage time-gap determination.

Each scenario completes the entire race, verifies no official writes, and the unperturbed original-grid full result equals `runCoupledV3(input)` exactly. Restoring the lane-perturbed checkpoint from tick 121 must reproduce the original perturbed race's full result exactly. A 12-rider standalone unit suite asserts callback/non-callback **exact state equality every tick**.

## Complete first-divergence results

All times in **seconds since simulation start**. Every paired run first shows a different shelter fraction, actual mechanical power and W-prime after 10 seconds.

| Race | Model | Grid | First source shelter / watts / W-prime | First different forward metres | First different clipped metres | First different blocked flag | First different 30 m group count | Ranks changed |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Dordrecht 106 | energy | original | 10 | 50 | 50 | 50 | 210 | 88 |
| Dordrecht 106 | energy | B | 10 | 50 | 50 | 50 | 190 | 95 |
| Dordrecht 106 | finite passing | original | 10 | 50 | 50 | 50 | 220 | 97 |
| Dordrecht 106 | finite passing | B | 10 | 50 | 50 | 50 | 190 | 99 |
| Guangxi 168 | energy | original | 10 | 70 | **70** | **2,390** | 2,420 | 135 |
| Guangxi 168 | energy | B | 10 | 60 | 60 | 60 | 390 | 153 |
| Guangxi 168 | finite passing | original | 10 | 70 | **70** | **5,750** | 5,810 | 117 |
| Guangxi 168 | finite passing | B | 10 | 60 | 60 | 60 | 270 | 165 |

The Guangxi-original pattern is now directly observable: physical shelter and actual work differ from the first tick; clipped distance starts diverging by seconds 70; nonetheless the **binary** blocked/not-blocked flag does not differ until 2,390 or 5,750 seconds. This is a genuine distinction in what the counters measure, not an inconsistent simulation.

### The first *available-power* divergence is much later

Available-watts output is derived from rider attributes, tactic, terrain and the transient energy envelope. It is **not identical to actually required watts**. In the original Dordrecht energy-only grid, the first available-power difference is seen at **2,950 seconds**, and in the original Guangxi energy-only grid at **5,650 seconds**. Despite identical available-watts early on, actual mechanical work and W-prime already diverge at 10 seconds. This supports a meaningful aerodynamic/position feedback pathway. However the tracer is **observational** and does not prove how much of the final finishing spread that pathway explains.

No paired difference in the *amount* of the requested-speed cap from W-prime appeared in the 6,600-second comparison window. This must **not** be interpreted as proof that short-burst reserve is unimportant: W-prime totals and actual physical work still differ, and the velocity cap can remain nonbinding.

### Full-race sporting instability remains

| Race and mode | Final ranks changed — original grid / grid B | Paired-rider finishing-order inversions — original / B | Change in blocked rider-ticks — original / B |
|---|---:|---:|---:|
| Dordrecht energy | 88 / 95 | 682 / 1,320 | −3,637 / −52 |
| Dordrecht finite passing | 97 / 99 | 646 / 1,127 | +4,293 / +3,384 |
| Guangxi energy | 135 / 153 | 1,373 / 2,311 | −11,834 / +12,491 |
| Guangxi finite passing | 117 / **165** | 755 / 2,060 | +4,331 / +5,084 |

The strongly varying gap and rank effects persist despite unchanged rider attributes, tactics, road and initial mechanical energy. **Neither a lower blocked-tick total nor an unchanged tail gap is evidence of credible sporting results.**

## Engineering verification and artifacts

- [Batch 34 four-job matrix: exact source trace, isolated unit tests, two full-roster races, both modes, paired restarts and application build — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40320862942).
- [V3 existing legacy isolation and race-engine regression — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40320862944). The full 51-step job log was reviewed; no failed steps or reported error entries.
- Prior Batch 31 finite passing and Batch 22–24 unchanged default regression pipelines succeeded with the callback-aware source code, which leaves their normal three-parameter advance call behavior unaltered.
- GitHub Actions archive artifacts: `v3-batch34-dordrecht-2000-10-15-energy`, `v3-batch34-dordrecht-2000-10-15-finite_pass`, `v3-batch34-guangxi-2000-10-19-energy`, `v3-batch34-guangxi-2000-10-19-finite_pass`. Retention is 30 days. Complete JSON includes source rows around event onsets, opening-window event counts, full rider finish results, W-prime/work differences and verified checkpoint outcomes.
- Source changed only in research-only `src/race-engine-v3/coupledRoadRaceResearchV3.ts`; further changes are pure offline diagnostic scripts and a dedicated GitHub workflow. No production engine activation or live race write was attempted.

## Interpretation limits and Batch 35 proposal

1. **Changed source variables co-occur.** The observed timing demonstrates shelter/work can differ before forward movement and before a changed wheel-limited flag. It is **not a controlled causal experiment separating drag from the positions of individual wheels**. Nearest starting-lane wheel is not necessarily the mechanical limiting wheel after multiple lane choices.
2. Motion/clipping readings are identical across observed state and unobserved mode, but the collected 660-tick summaries count **rider-ticks**, not unique riders. Some riders contribute hundreds of differences.
3. Guangxi proxy stage geometry omits **718 m of reported climbing**; Dordrecht point-sprint commands remain mapped to tempo. Rider powers, CdA, W-prime and discrete bicycle-lane geometry have not been externally calibrated.
4. No empirical criterion currently allows V3 sporting activation. Strict technical CI passing does **not** justify a production switch.

**Batch 35 recommendation:** isolate a **read-only draft-power counterfactual** at the first 10–70 seconds and compare cumulative *actual work* and W-prime between branches under identical achieved motion. Then run a separate strictly gated draft-sensitivity A/B to quantify whether shelter, wheel clearance, or the initial grid's same-lane reservations dominate finishing-order instability. Do not merge a physical rule change without full 106/168-rider source-calibrated sporting evidence, safe swept occupancy, exact resumability and the existing regression/build gates.

**Status remains: SPORTING NO-GO / offline experiment only.**
