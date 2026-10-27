# Race Engine V3 — A2 Step 35: 2s, 2.5s and 5s numerical convergence audit

**27 October 2026 — 180/180 OFFLINE TECHNICAL RUNS PASS; numerical stability FAIL (NO-GO). A2 sporting remains NO-GO.**

## Question answered

Step [A34](MILESTONE_A_34_SYNCHRONIZED_SUBSTEPS_2026-10-27.md) successfully generated accepted intermediate paths and matching substep W-prime debits at a 2.5-second resolution. That success alone did not establish **time-step convergence**: physical position, energy, gaps and cyclist ordering should not drastically change just because the numeric integrator resolves the same one-minute situation at 2, 2.5 or 5 seconds.

A35 runs the existing, unchanged, **synthetic A34 adapter**, not an official game race, at three resolutions. For each fixture, every rider receives precisely the same **speed target, lane target and steering surcharge**, computed *only* from rider ID, variation and the outer ten-second tick. Commands are recomputed identically for all three independent physics runs; no future paths, fixture outcomes or other run's realized physical states influence those commands. Every run starts with the same x/y, speed, CP/W-prime and provisional road grade.

## Audited implementation and reproducibility

Added `scripts/v3/audit-a2-step35-substep-sensitivity-v3.mjs` and a dedicated GitHub Actions workflow. [Actual CI run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40546643058) passed the new audit, unchanged A34/A33/A32 and stage technical regression suites, the app production build and output-artifact upload.

The matrix is **4 synthetic geometries × 5 field sizes (2, 8, 12, 24, 32) × 3 controlled variations = 60 matched starting cases**, each simulated for **6 × 10s game ticks**, separately at 2s (5 substeps/tick), 2.5s (4 substeps/tick) and 5s (2 substeps/tick). Thus **180 individual technical runs** and **120 matched end-of-60s comparisons**, with 2s selected as an **arbitrary reference, not verified truth**.

Each physical run asserts independently rechecked swept paths (no accepted collisions), finite and nonnegative W-prime, mechanical-joule accounting agreement, exact JSON midpoint checkpoint/replay, deterministic rider permutation, elapsed clocks, unchanged commands, `officialWrites=0` and `sportingApproval='NOT_APPROVED'`. Case-level rider positions, gaps-to-front, pairwise ordering differences, W-prime, energy expenditure and stopping/congestion metrics are preserved as a CI JSON artifact.

A35's explicitly declared **exploratory**, *not calibrated*, numerical screen expected at most 1 metre of maximal rider-position difference, no ordering inversions, and at most 200 joules of individual W-prime difference after 60 seconds. The result **fails those indicative thresholds by large margins**. A different threshold must not be substituted retroactively to turn this into a sporting pass.

## Verified physical and energy counterexample

| After the same 60 simulated seconds | 2s reference | 2.5s | 5s |
|---|---:|---:|---:|
| Technical simulations completed | 60/60 | 60/60 | 60/60 |
| Individual rider substeps | 28,080 | 22,464 | 11,232 |
| Collision-attenuated rider substeps | 10,823 | 10,168 | 6,285 |
| Fraction attenuated | **38.54%** | **45.26%** | **55.96%** |
| Attenuation-weighted rider seconds | 21,646 | 25,420 | 31,425 |
| Whole-tick near-stop rider events | 130 | 50 | 72 |
| Candidate proposal collision detections (not crashes) | 21,965 | 16,421 | 9,744 |
| Independently audited final rider pair tracks | 62,424 | 62,424 | 62,424 |
| Accepted swept collisions | 0 | 0 | 0 |

The conflict-detection counts above include repeat checks on speculative unsafe proposals that were **rejected**; they do not represent rider crashes.

| 60s matched outcome compared with 2s | 2.5s | 5s |
|---|---:|---:|
| Fixtures with different relative rider ordering | **42/60** | **48/60** |
| Aggregate pairwise order inversions | **1,012** | **1,192** |
| Maximum absolute rider-position difference | **207.03 m** | **209.15 m** |
| Maximum gap-to-front difference | **205.84 m** | **211.05 m** |
| Maximum remaining individual W-prime difference | **2,253.46 J** | **2,195.09 J** |
| Maximum mechanical energy divergence for one rider | **6,069.78 J** | **5,803.99 J** |
| Fixtures with any rider diverging over 5m | **48/60** | **52/60** |

These are differences between synthetic 60-second **rider-position orderings**, *not official race classifications, published results or full-stage rankings*. Every comparison is anchored on the **same rider ID**. The reference's superiority has not been established.

In separate 2-rider cases, there are no ordering inversions; much greater deviations emerge in the more congested 8–32-rider fixtures. That suggests—**but does not independently prove**—the simultaneous conflict resolver's repeated symmetric forward/lateral attenuation and the per-step velocity/energy integration are major contributors. The attenuation rate itself changes by roughly 17.4 percentage points from 2s to 5s. W-prime and movement use matching time intervals for each run, but that does not guarantee the three integrations produce similar outcomes.

## Verdict and next bounded gate

**A35 collision/energy/checkpoint technical tests PASS; numerical convergence clearly FAILED. A2 realistic peloton racing remains NO-GO. Milestones B and C remain NOT STARTED.** A34's numerical prototype must not become the official engine on current evidence.

**A36 priority:** a causal 3-way isolation study: (1) low-density straight or single-lane no-conflict acceleration/braking and energy; (2) synchronized same-lane following; (3) crossing/merging traffic. Measure whether differences are generated by velocity integration, collision attenuation, steering rate, or W-prime accounting. Prefer event-time or physically normalized conflict behavior over arbitrary substep rounding; keep conservative swept clearance. Re-run **identical** 2/2.5/5s cases, then independently validate larger groups and complete real-road 106/168-rider race sporting fairness, realistic attacks/breakaways, and sourced terrain/road widths. Do not relabel passing technical tests as sporting approval.

All Step35 modifications are limited to isolated test scripts, GitHub Actions and documentation on `main`. **No official race selector, player results, production Supabase data, staged game race, live clock, or gameplay UI was changed.**
