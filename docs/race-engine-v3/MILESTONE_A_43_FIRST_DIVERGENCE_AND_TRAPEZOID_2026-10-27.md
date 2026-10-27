# Race Engine V3 — Milestone A Step 43: first numerical divergence and acceleration-integrated candidate

**27 October 2026 — 480/480 OFFLINE technical run cases PASS; acceleration error isolated and reduced, but congested ordering NO-GO.**

## What this step investigates

[A42](MILESTONE_A_42_PHYSICAL_QUANTUM_CONVERGENCE_2026-10-27.md) showed that the original A34 conservative collision solver had **up to 270.165m** maximum rider displacement and **887** relative-ordering inversions between a 0.5s and 1s true physical microstep, despite continuously collision-free paths and the same 10-second control intents.

The new A43 diagnostic distinguishes (i) numerical integration errors that happen **before any collision**, from (ii) how swept collision avoidance amplifies small, different proposed motions. A separate opt-in A43 movement policy tests one physically meaningful correction, without changing default race physics or treating a 0.5s run as known physical truth.

## Opt-in instrumentation and controlled fixtures

`scripts/v3/a2SubstepPhysicalResearchV3.mjs` now records proposals, original start speeds, provisional paths, initially conflicting pair IDs, and actual accepted movement scales **only when diagnosticTrace is enabled**. It does not modify any path while observing it. Existing research callers still receive the unchanged default symmetric-halving policy unless they explicitly select a different research option.

`scripts/v3/audit-a2-step43-first-divergence-v3.mjs` exercised **4 provisional roads × 5 field sizes (2,8,12,24,32) × 2 fixed variations = 40 configurations** in two layouts:

- **Free-road controls:** same riders/speed demands/lateral commands but with 2000m start gaps, ensuring all 40 actual 60-second simulations have zero provisional pair contacts and no forced attenuation.
- **Congested traffic:** same physical initial rider characteristics and controls with 6.4m start longitudinal gaps, allowing genuine collisions of provisional paths that must be resolved continuously.

For each layout, both **0.5s and 1s** actual physics were run for exactly 60 simulated seconds, giving **160 independent diagnosis runs** and 80 logical pairwise comparisons. Each accepted physical knot, accumulated energy, current speed, first-one-second disagreement and checkpoint replay was recorded and checked against an independent piecewise swept audit. All 160 runs passed technically.

### Earliest causal evidence

Every matched **40/40 free-road and 40/40 congested configuration** differed in at least one rider's position at the first common 1-second time.

For example, a rider beginning at 4m/s and commanded toward 4.5m/s accelerates at the same stated 0.45m/s²:

- In **two 0.5s steps**, the original method applies successively updated speeds to each entire half-step: nominal distances `4.225×0.5 = 2.1125m` then `4.45×0.5 = 2.225m`, total **4.3375m**.
- In **one 1s step**, the method applies near-4.45m/s over all of the second, traveling approximately **4.4500m**, a difference of **0.1125m** from just one rider's first movement decision.

The longest observed first-second error across riders in the matched suite is **0.212501m**, including other rider speeds/deceleration cases.

The free-road cases record **0/0 initially colliding pairs or physical attenuations**, confirming this first difference arises from free-motion time integration and/or its energy bound, *not exclusively* from traffic logic. The congested runs start with the same independent movement mechanism, then add **7,092** (0.5s) versus **5,997** (1s) originally previewed provisional collision pairs and **13,786** versus **11,013** attenuated rider-substeps across 60s. These are research proposals/attenuations, not crashes.

## Separate opt-in acceleration-integrated trial

The `symmetric_trapezoid_motion` choice in `scripts/v3/a2SubstepPhysicalResearchV3.mjs` is **offline and opt-in**. For each rider substep, it estimates the forward distance as:

\[
\Delta x \approx \tfrac{1}{2}(v_\mathrm{start}+v_\mathrm{permitted,end})\,\Delta t
\]

rather than `v_end * dt`, while leaving the existing synchronized symmetric collision resolver and all-pair swept checking intact. Clear, unattenuated movement can retain the terminal velocity as its next start speed; when collision attenuation is required, the next saved speed conservatively reflects the **actually achieved average speed**. Committed power/energy continues to use achieved movement on exactly the real substep duration; no phantom sprint energy is added.

This is a **discrete trapezoidal candidate**, not a proven exact integration of nonlinear W-prime dynamics or a verified physical collision law. It has no effect on the selected `symmetric_halving` default or existing A37-A42 optional experiments.

`scripts/v3/verify-a2-step43-trapezoid-trial-v3.mjs` repeated both layouts, all 40 fixed configurations and both microsteps under the unchanged reference and new trial policy: **320 independent 60-second physical runs**. Along with the initial 160-run diagnosis that is **480 technical runs** in Step43, each validated for accepted swept-pair clearance, finite/nonnegative W-prime, corresponding mechanical joule ledger, immutable commands and JSON restart stability.

## Measured effect against 0.5s reference

| 60s outcome across 40 fixtures per layout | Original symmetric | Optional trapezoid | Outcome |
|---|---:|---:|---|
| Open-road maximum rider position difference (1s vs 0.5s) | 1.237425m | **0.137532m** | Improved |
| Open-road maximum first-second difference | 0.212501m | **0.087499m** | Improved |
| Open-road maximum W-prime difference | 24.998719J | **15.700042J** | Improved |
| Congested maximum rider position difference (1s vs 0.5s) | 270.164685m | **239.187501m** | Improved |
| Congested maximum W-prime difference | 74.043913J | **38.710429J** | Improved |
| Congested changed final-order cases | 32/40 | **28/40** | Improved in count |
| **Congested pairwise rider-order inversions** | **887** | **920** | **Worse — fails sporting gate** |
| Congested physically attenuated rider-substeps at 0.5s | 13,786 | 16,401 | More intervention |

The final-order case count and total inversion count can move in opposite directions. The rider-order metric counts *how many relative pairs changed order*, not only whether a configuration had at least one flip, and **920 is worse than 887**. No result here is a historical stage classification. The 0.5-second solution remains a **numerical reference, not ground truth**.

## CI, release boundary and decision

Actual GitHub Actions:
- [A43 first-divergence diagnostic](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40587952985) — 160 technical run cases.
- [A43 targeted movement trial](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40588384377) — 320 technical run cases, separate unchanged A43/A42/A41/A40/A39/A38/A37/A36/A35/A34/A33/A32/full-stage technical regressions and React application build.
- Separate V3 legacy isolation is preserved.

**A43 diagnosis and physics trial COMPLETED; technical and free-road integration criteria PASS; numerically stable overtaking/rank ordering NO-GO.** The tested correction is retained as an **isolated rejected research option**, not promoted as the new solver. Official results, real race decisions, Supabase records and the game clock were not modified.

**Next — A44:** a genuinely time-consistent contact-management/collision-resolution experiment that controls the physical end speed, accepted position and competitor separation together. Keep 0.5s-versus-1s free-road integration gains, prove that rank pair-inversion counts also decrease, maintain left/right/rider-ID fairness, finite energy and exact replay, and extend scrutiny to 2s/2.5s/5s. Numerical synthetic improvement alone cannot close source road-width/elevation, drafting, peloton and 106/168-rider full-stage sporting validation. Milestones B/C remain NOT STARTED.
