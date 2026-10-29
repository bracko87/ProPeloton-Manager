# Race Engine V3 — Step 84: simultaneous crossing-order consensus

**29 October 2026. Technical verification: PASS. Full five-abreast 106/168 sporting realism: NO-GO. Research-only opt-in controller; no production authorization.**

## Why Step 84 was needed

Step83's locally generated two-dimensional path warnings were correct diagnostic signals but its independent pair-by-pair steering holds and speed adjustments generated incompatible whole-peloton commands, excessive braking and early collision rejections. Step83's actual 32-rider staged field rejected a swept contact at 73.5s; 106/168 five-abreast fields still failed before meaningful passage. Meanwhile Step78's 32r staged 180s, 87 sustained ≥3s passes, 356 lane changes, zero near-stops and Step82's 32r staged 180s, 85 sustained passes, 460 lane changes, zero near-stops remained protected.

Step84 [a2Step84CrossingConsensusV3.mjs](../../scripts/v3/a2Step84CrossingConsensusV3.mjs) evaluates all of the Step83 geometrically projected current-state warning pairs into **one coordinated rider-request consensus**:

- Pairs are derived from 6-second current-command two-dimensional bicycle center forecasts with 0.5-second sampling, finite physical acceleration/braking and steering speeds. They remain **warnings, not proof of unavoidable collision or proof of a safe path**.
- Accumulate conflict votes over *all* overlapping warnings before applying an individual rider's final requests: **hold lateral request = logical OR**, **follower pace ceiling = minimum**, **leader assistance = maximum**, with fixed speed floors. A rider can be involved in several linked neighborhoods, but pair enumeration cannot repeatedly edit or re-prioritize that rider. Current geometric longitudinal lead determines order; equal-x crossings cannot invent rider-ID or geographic left/right priority and instead ask both threatened lateral movers to hold.
- Four pure proposed control fields: `consensus_crossing_hold`, `consensus_limited_wave`, `consensus_balanced` and `consensus_gated_release`.
- Two **opt-in research modes** exposed through [the existing non-production physical wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs): `consensus_hold_v1` (prefers lateral gap holds and bounded assistance) and `consensus_wave_v1` (includes controlled follower pace ceilings). The 3-step lookahead considers multiple synchronized fields, all originally full-body swept by the existing **unchanged A64 solver**; only the winner's first 0.5s movement is independently re-swept and accepted on the real field. No projected x/y/v or energy state is inserted into accepted race history.

This is a **consistent request aggregation algorithm**, not yet a sufficient joint two-dimensional space-time feasibility or crossing-order certificate. It does **not** widen the road, lift lateral steering / braking limits, waive contact or energy checks, teleport or retroactively repair positions, use ID order to choose a right of way, or write production race results.

## First actual five-abreast 16-case A64 physical matrix

[Strict Step84 consensus + full-body matrix](../../scripts/v3/verify-a2-step84-crossing-consensus-v3.mjs) tests 8/32/106/168 physically valid five-column rolling starts on both staged 3.3→2.2m and double 2.2m two-gate road profiles and both modes. Real A64 errors are recorded; a green test means fail-closed behavior, **not a successfully completed race**.

| Configuration | Actual physical duration accepted | Near-stop rider ticks | Outcome |
| --- | ---: | ---: | --- |
| 8r staged, hold and wave | 45s study horizon | 0 | No contact before horizon |
| 8r double, hold | 45s study horizon | **2** | No contact but sporting zero-stop criterion fails |
| 8r double, wave | 32.5s | 2 | Contact rejected |
| 32r staged, hold | 55s study horizon | 0 | No contact before horizon |
| 32r staged, wave | **11.5s** | 0 | Contact r013/r019 rejected |
| 32r double, hold and wave | 55s study horizon | **1** | No contact before horizon; near-stop failure |
| 106r staged, hold | **9s** | 0 | Contact r056/r061 rejected |
| 106r double, hold and wave | **25s study horizon** | **1,661** | Contact-free for study horizon, but severe unrealistic near-stop shockwave |
| 168r staged, hold | **10s** | 0 | Contact r008/r014 rejected |
| 168r double, hold and wave | **9s** | 0 | Contact r082/r088 rejected |

There are **zero** 106/168 five-abreast full-180s accepted sporting runs. The 106r 25s is **not an improvement**: 1,661 near-stop ticks violate the core no-mass-braking requirement by a wide margin; 168r fares worse than Step80's double-strong 20s / zero near-stops.

The pure controller's unit tests also prove simultaneous equal-x hold, symmetric reflection, rider-ID rename and reversed source-array/pair order invariance, and reject malformed inputs.

## Independent true long 8/32-rider tests

[Step84 mirror, full 8/32 sporting and passing observer verifier](../../scripts/v3/verify-a2-step84-physical-parity-replay-v3.mjs) checks **16** real original-swept 8/32/106/168 × staged/double × both-policy mirror/rename short physical runs (actual x/y/v, energy, chosen policies, first contact/time). All 16 passed. The same test independently coupled accepted true swept bicycle movements to the ≥3-second sustained-passing observer and tested long 180s physical trajectories:

| Size / layout / policy | Full actual accepted seconds | Near-stop rider ticks | Actual lane changes | Genuine sustained ≥3s pair overtakes | Sporting result |
| --- | ---: | ---: | ---: | ---: | --- |
| 8 staged, hold | **180** | 0 | 78 | **8** | Full physical pass |
| 8 double, hold | **180** | **2** | 147 | **9** | Physical finish; fails strict zero-stop quality |
| **32 staged, hold** | **180** | **0** | **370** | **83** | **Full physical and passing pilot PASS** |
| 32 staged, wave | **11.5** | 0 | 18 | 4 before rejection | Swept contact r013/r019; FAIL |
| 32 double, hold | **180** | **1** | **834** | **38** | Physical finish; zero-stop criterion FAIL |
| 32 double, wave | **180** | **1** | **834** | **38** | Physical finish; zero-stop criterion FAIL |

All completed full 180s trajectories got every rider past the second gate reopening x1470m. Full accepted 180s runs passed **exact serialized 90+90-second physical and independent overtaking observer checkpoint replay**; the 11.5s rejected wave scenario correctly did **not** claim a 90s replay.

This is a real **reduction in 32r staged lane weaving relative to Step82**, while preserving a high count of true sustained passes. But **Step78 remains the stronger historical 32r benchmark**:

| 32r five-abreast staged metric | Step78 | Step82 | Step84 hold |
| --- | ---: | ---: | ---: |
| Actual accepted 180s | 180 | 180 | 180 |
| Independent ≥3s pair overtakes | **87** | 85 | 83 |
| Physical lane changes | **356** | 460 | 370 |
| Near-stop rider ticks | 0 | 0 | 0 |

Do not promote Step84 by conflating technical validations with the unresolved full-size sporting target.

## Regression and CI

- [Step84 physical consensus matrix, unchanged prior A83/A82/A78/A76 tests, React build](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40859224025) **PASS**. Protected original Step78 32r five-abreast staged 180s / 87 passes / 356 lane changes and original A76 32/106/168 **three-abreast** 180s / 58/151/198 independent sustained passes remain intact.
- [Step84 long full physical, mirror and independent observer run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40859370158) **PASS**; its later proof-upload path was corrected without changing physical behavior, and the evidence-upload rerun is [here](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40859952391).

These are **offline/synthetic only**. No Supabase data, race, result, historic classification, payout, rider energy, game clock or active physical engine was changed. GitHub `main` carries the opt-in research modules and tests but green React CI does not assert a real Netlify deployment.

## Step85 research target

At 106 riders, consistent pair votes can still stop the entire peloton: **1,661 near-stop rider ticks** without enough actual gap creation. Step85 should examine **graph-wide feasible multi-row ordering and admissible cumulative braking/gap propagation** across overlapping groups before any narrowing. It must use multi-step authoritative physically achieved states, model finite lateral time and road-width capacity *together*, enforce bounded group throughput/near-stop budgets in decision selection, and avoid both the 106-rider stop wave and 168-rider early collisions. Preserve mirror/ID/array-order fairness and the protected Step78 and Step84 32r full-race performance. Full sporting gate remains **32→106→168 five-abreast, two road layouts, 180s each, every rider beyond the second gate, zero near-stops/contact/road exits, actual sustained overtakes, exact JSON physics+observer recovery**.

**Milestone A full 106/168 five-abreast sporting NO-GO. Milestone B gameplay NOT STARTED. Milestone C live production NOT AUTHORIZED.**
