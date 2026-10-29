# Race Engine V3 — Step 86: physical multi-row gap creation and leading-row clearance

**Date:** 29 October 2026  
**Scope:** offline synthetic research only; new opt-in planning policies.  
**Current sporting result:** **106/168 five-abreast both-road 180s NO-GO** after independent full-duration attempts. Real A64 swept contacts rejected; no stop-wave workaround or collision bypass.

## What was implemented

1. [Multi-row gap request module](../../scripts/v3/a2Step86MultiRowGapV3.mjs) derives each rider's next booked physical road narrowing from immutable per-rider gate bookings (not a fixed single x=780m), groups bicycles by physically initialized starting-row x, and uses road-centre-symmetric INNER/OUTER/CENTER roles for a five-abreast 5→2 transition. An outer bicycle **does not request a lateral merge through the inner bicycle's occupied corridor** until the inner has actually gained an attainable longitudinal clearance. A central rider waits for an adequate actual physical opening rather than arbitrarily choosing a preferred left/right lane.
2. The initial first-row acceleration request is stopped once the **achieved same-row gap** is large enough, instead of repeatedly asking a front rider to accelerate all the way to the gate and deplete W-prime. Boost requests are capped to 10.1m/s and the original physical integrator still enforces +0.45m/s² actual acceleration, −0.85m/s² braking and 0.38m/s lateral steering speed. The time required to steer a booked lateral distance is included when forming the necessary gap clearance.
3. **Cross-row gap gate (critical third iteration):** before allowing an INNER rider to accelerate into a gap, inspect all presently preceding bicycles with the same booked physical corridor. The necessary upstream clearance accounts for reachable speed change over the next 2.5s, and if the currently accepted forward gap is insufficient the new planner must **not request extra acceleration**. A rear rider with projected closure receives an optional mild *request* for pace limitation instead of a zero-speed command. Equal-longitudinal-position conflicting turns have no priority by rider ID, source-array position or geographic side.
4. [Opt-in wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs) exposes `multirow_gap_strict_v1` and `multirow_gap_wave_v1`. For each 0.5s tick it submits **six** synchronized whole-field candidates—baseline, the historically tested Step78 joint proposal, Step84 consensus hold, and three new multi-row gap variants—to the Step85 original-physics throughput selector with a Step86-only clearance-first tie-break. Up to three *temporary, physically simulated* half-second ticks are inspected. The original A64 synchronized full bicycle, swept contact, real road width and W-prime/energy solver **independently rechecks the selected first movement** in the actual (possibly mirrored) field. Hypothetical futures are discarded, failed ticks leave previously accepted physical states unmodified. Step85's default selector behavior is unchanged.
5. Strict mode still rejects physically accepted first-tick stopwaves as sporting failures. Wave mode compares moving throughput without claiming a hard speed safety guarantee. **Neither is sufficient 2D joint-gap feasibility certification.** Both remain offline research.

## Objective evidence: actual large-field full-180s attempts

[Decisive Step86 106/168 full-duration authority test](../../scripts/v3/verify-a2-step86-large-full-v3.mjs) explicitly requests **180s** for every **106/168 × staged/double pinch × strict/wave**, preserves each original solver's first rejected contact and differentiates authentic sporting completion from a technically valid fail-closed rejection. Results of the third-iteration cross-row restriction:

| Five-abreast race | Strict accepted time | Wave accepted time | Near-stop rider ticks | Original-solver result |
| --- | ---: | ---: | ---: | --- |
| 106, staged | **11.5s** | **11.5s** | **0** | SWEPT_CONTACT (e.g. r010/r011) |
| 106, double | **12s** | **10.5s** | **0** | SWEPT_CONTACT (r048/r053 or r010/r016) |
| 168, staged | **12s** | **11.5s** | **0** | SWEPT_CONTACT (r015/r016 or r018/r019) |
| 168, double | **11s** | **11s** | **0** | SWEPT_CONTACT (r044/r049 or r035/r040) |

**0/8 large-field full-180s sporting passes**. None got every cyclist past the second road reopening. The improvement over the first Step86 request planner (106/168 failed at **5–6s**) is measurable but **insufficient**. These short outcomes remain worse than previously protected Step80's **168r double 20s / zero near-stops** and do not solve realistic large-peloton cycling.

The first Step86 prototype over-accelerated INNER tracks continuously, failing 8r at 28.5–30s on genuine W-prime/energy and 32r at 5.5–7s on real swept contact. A second iteration stopped boosts after achieved same-row clearance and included previously proven joint and consensus candidate fallbacks; a third iteration suppressed physically dangerous acceleration into the leading row. Tests were **not relaxed** to hide these failures.

## Latest actual 8/32 pilot matrix (not a full-race claim)

The [final strict 16-case original swept-body and protected physical audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40867458374) **passed its new physical assertions** and completed its protected A85/A84/A78/A76 regressions and React build successfully. The Step86 portion itself recorded:

| Five-abreast field and geometry | Strict accepted time | Wave accepted time | Actual near-stop ticks | Meaning |
| --- | ---: | ---: | ---: | --- |
| 8 staged | 45s | 45s | 0 | Short study horizon only |
| 8 double | 45s | 45s | 0 | Short study horizon only |
| 32 staged | 12.5s, swept contact | **50s** | 0 | Wave clears initial 50s but not proven 180s |
| 32 double | **50s** | **50s** | 0 | Both clear initial 50s but not proven 180s |
| 106 staged | 11.5s | 11.5s | 0 | Swept contact rejected |
| 106 double | 12s | 10.5s | 0 | Swept contact rejected |
| 168 staged | 12s | 11.5s | 0 | Swept contact rejected |
| 168 double | 11s | 11s | 0 | Swept contact rejected |

Here the correct comparison is not a single short positive result: a **50s/zero-near-stop** 32r test is only evidence of early physical safety. The 180s independent observer suite must determine whether any of those policies actually finishes with reasonable overtaking and exact serialized checkpoint recovery.

## Required independent verification

- [Step86 pure geometry + 16-case original swept-body matrix](../../scripts/v3/verify-a2-step86-gap-physical-v3.mjs): symmetric mirror/ID/array-order tests, hard check that an INNER bicycle cannot be accelerated into its preceding row, and strict no committed near-stop requirement. The first CI version caught late upstream preparation. A later CI version correctly caught the original unit assertion that incorrectly treated *more* boosts as necessarily good; it was replaced with a stronger explicit forward-gap safety assertion.
- [Step86 true full-field parity and complete 8/32 180s independent passing-observer attempts](../../scripts/v3/verify-a2-step86-physical-parity-replay-v3.mjs): real actual x/y/v/W-prime symmetry for 8/32/106/168 × both road profiles × both policies, full 180s 8/32 attempts, independently sustained ≥3s overtakes and full 90+90 JSON physics and observer replay for any field that reaches that checkpoint. A correctly rejected field before 90s is NOT described as a replay pass.
- [Step86 authoritative 106/168 180s CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40867404704): SUCCESS technical audit; all eight original contacts retained and **sporting NO-GO**.
- [Step86 first-matrix CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40867458374) and [Step86 full-field fairness CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40867404736): preserve actual completion/failure status independently and do not infer sporting success merely from a green technical workflow.

The unchanged historical Step76 **three-abreast** 32/106/168 full 180s, Step78 **five-abreast 32 staged** 180s 87 real sustained passes/356 lane changes, Step84 32 staged 180s 83 real sustained passes/370 lanes and Step85 **five-abreast 32 double** 180s 66 real passes/752 lanes with zero near-stops remain protected comparison benchmarks. None should be silently replaced by the new research policies.

## Next engineering gate — Step 87

The remaining first contacts are now concentrated in **adjacent starting rows**, including same-side pairs and same-row r010/r011. A simple simultaneous hold/acceleration request and 1.5s physical lookahead is still too short to ensure that multiple crossing pairs choose a compatible sequence. The next research step must explicitly construct and propagate a **partial-order schedule for real multi-row, multi-gate corridor occupancy**, with physically reachable speed/steering/road-width windows and per-row throughput capacity, and then validate each half-second against the unmodified A64 original solver. Avoid applying an artificial global braking wave and examine W-prime feasibility, sustained overtaking and weaving rates. All 32/106/168 five-abreast fields must finish 180s on both geometries, have every rider beyond the second opening, zero near-stops/contact/road/energy violation, mirror/renamed neutrality and exact 90+90 checkpoint before sporting approval.

**Milestone A full sporting realism NO-GO. Milestone B gameplay integration NOT STARTED. Milestone C production release NOT AUTHORIZED.** No live Supabase data, race results, payouts, game clock, classified stages or production physical controller were changed.
