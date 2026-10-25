# Race Engine V3 — Calibration Batch 17 (25 October 2026)

**Status: independent research-only. Sporting quality: NO-GO. No production racing or clock changes.**

## What was investigated

The isolated Batch 16 finite-lane wheel model correctly prevents overtaking through occupied bicycles, but its lane-entry condition rejects any rider ahead in an adjacent lane, even when that rider is moving forwards and the challenger could join safely **behind** them. In 300-second synthetic peloton tests, this leaves severe bottlenecks and near-zero actual overtaking.

An initial candidate replaced that overbroad rule with a merge-entry check and a bounded front-wheel reservation. This candidate passed the small structural tests and, after fixing simultaneous same-row lane reservations, remained collision-free on 106- and 168-rider stress tests. It was **rejected for integration** after full-race testing:

| Explicitly synthetic 106-rider Dordrecht research case | Stress-test lane changes in 300s | Stress-test passes in 300s | Last-rider full-stage gap |
|---|---:|---:|---:|
| Existing isolated spatial motion | **5** | **0** | +363.388 seconds |
| Broader lane-entry candidate | 280 | 92 | **+1,332.670 seconds — FAIL** |
| Bounded to +1 m extra lateral gain per 10-second step | 257 | Not used for acceptance | **+1,321.488 seconds — FAIL** |

These are not real historical stage predictions; the public synthetic roster uses substitute preparation values. A bounded +3 m gain still yielded +1,327.006 s, so merely limiting a lateral velocity increment did not fix the coupled energy/group consequences. **None of these candidate changes was merged into `pelotonSpatialMotionV3.ts` or `experimentalPowerRaceV3.ts`.**

The engineering lesson is that permitting more passes without adjusting collective drafting, power, rider effort, and longitudinal group recovery can destabilize the whole race. Higher overtaking counts alone are not a sporting success criterion.

## Implemented on GitHub main, research-only

- New pure `src/race-engine-v3/passingOpportunityShadowV3.ts`. It runs the currently validated spatial planner **without applying alternative positions**, and separately records potentially feasible adjacent-lane entries, measured wheel blockage, and potential forward gains. Candidate openings are explicitly advisory; they are **not** guaranteed multi-rider conflict-free trajectories or official overtakes.
- `scripts/v3/verify-passing-opportunity-shadow-v3.mjs`: synthetic case where a moving bicycle farther ahead in an adjacent lane should not preclude a passing *opportunity*, checks nonmutation, input order, deterministic output and fail-closed bicycle overlap.
- `scripts/v3/audit-passing-shadow-full-v3.mjs`: reproducible 30-tick stress across frozen-size **106- and 168-rider synthetic fields**, comparing measured blocking and lane openings with the **unchanged** executed baseline motion.
- Added both scripts and strict typechecking for the new pure module to the existing isolated V3 GitHub Actions workflow.
- No production selector, original V3 motion solver, experimental race solver, Supabase worker, database record, or official classification changed.

## Synthetic stress results (30 steps, 300 seconds)

| Research-only measure | 106 riders | 168 riders |
|---|---:|---:|
| Blocked rider-ticks | 1,482 | 2,822 |
| Actual lane changes made by unchanged solver | 5 | 2 |
| Actual passes in that unchanged solver | 0 | 0 |
| **Advisory only** passing opportunities | **420** | **492** |
| Sum of *unexecuted* advisory forward gain | 1,576.70 m | 1,613.55 m |

Advisory gain is accumulated over many riders and ticks, **not a race distance, a rider's gain or an approved speed adjustment**. The audit does not modify or select a racing engine.

## Verification boundary

A locally isolated copy of Batch 16 passed **30 available research scripts**, including the two new scripts, both existing full-roster offline simulations, 106-/168-rider wheel-geometry stresses, checkpoint-resume equality and legacy-independent physics regressions. Strict TypeScript checking passed for all V3 modules. The **operator-only private rider source audit was not run** because its protected source supplement was not available in this runtime. Nothing should claim a complete private-source sporting test in this batch.

GitHub's dedicated CI checks were updated; remote GitHub Actions completion, full application production build and Netlify release remain separate, unverified gates. Tests passing locally means code integrity only.

## Next sporting gate

Build and compare an **explicitly offline** multi-step lateral trajectory/power-conserving prototype. It must reserve collision-free lane changes continuously over each step, charge or recover energy for the actual mechanical work, represent real slipstream exposure and cooperative group pace, and yield credible flat and summit results **across independent source-complete stages**. Reject any variant producing overlong tail gaps or forced mass finishes; never script desired group sizes or exact times.

The game must remain paused at authoritative **Season 1, 20 October 06:38**; stored speed remains 12× pending separate approval of a safe 2× restart. **V3 sporting acceptance remains NO-GO.**
