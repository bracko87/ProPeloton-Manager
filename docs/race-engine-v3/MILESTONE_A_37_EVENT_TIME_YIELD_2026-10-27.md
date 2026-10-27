# Race Engine V3 — A2 Step 37: contact-time-aware bounded rear yielding

**27 October 2026 — 720/720 OFFLINE technical runs PASS; numerical/sporting outcome MIXED — candidate NOT APPROVED.**

## Research question

[A36](MILESTONE_A_36_CAUSAL_ISOLATION_2026-10-27.md) isolated the major source of timestep instability to rider–rider traffic, even in straight and held-lane riding. Existing A34 collision resolution repeatedly halves *both* parties' forward and lateral motion whenever their proposed line segments overlap. This is conservative but can create extensive congestion and different pass orderings at 2, 2.5 and 5-second physical substep sizes.

A37 builds an entirely **optional offline research policy** and compares it against **the exact existing symmetric solver kept as default**. The experiment prefers a *voluntary* rear-rider speed-and-steering reduction, using the current substep's earliest projected swept contact. It may not rewrite other riders' **requested** speed, lane or power; any accepted **achieved** paths are still subject to full continuous, all-pair swept clearance.

## Code and physical safety

- New `scripts/v3/a2EventTimeYieldResearchV3.mjs`: computes a first potential overlap **for a single currently proposed linear substep** using the simultaneous time intervals where both longitudinal and lateral clearance would be violated. Time estimates are advisory, **not future knowledge and not accepted collision authority**. The existing `continuousBicycleCollisionV3` remains authoritative.
- Optional `conflictPolicy: 'event_time_yield'` in `scripts/v3/a2SubstepPhysicalResearchV3.mjs`, alongside the unchanged/default `'symmetric_halving'`. Both reuse the exact same kinematics, finite W-prime debits, immutable 10s commands, x/y knots and complete piecewise swept-safety audit. Neither drives live races.
- At the earliest current-substep proposed contact, identify which cyclist is *physically behind at the start of the substep*. Try up to 32 bounded candidate movement fractions for **that rider alone**, with each proposed swept path checked against every other current opposing path. This is a bounded geometric sweep, not an arbitrary assumption that smaller forward motion is always safer for a crossing trajectory.
- If no individually safe rear yield exists, fall back to symmetric half-movement for the conflicting pair. If 64 experimental resolution rounds cannot converge in dense traffic, **restart that substep from the original input proposals** with the established symmetric path resolver. Its occurrence is counted, not hidden. No unresolved collision is accepted.
- Where the ancillary analytical timestamp disagrees with the canonical collision predicate in near-degenerate floating-point cases, count a conservative `contactBoundaryFallback`, rank that collision as immediate and **never call it clear**.
- Reject any returned candidate movement with an actual swept overlap. Keep finite nonnegative W-prime, matching mechanical energy, exact JSON checkpoint restoration and unchanged rider command/ID assertions.

## Verified GitHub experiment

[Successful Step37 4-job GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40551658829): three independent test jobs for same-lane following, four-lane holding and active merging plus one unchanged Step36/35/34/33/32 and complete-stage regression/build job. These were checked via actual individual job output, not just workflow color. The separate A34 regression workflow also passed.

The full matrix: **3 traffic families × 4 synthetic road envelopes × 5 rider sizes (2,8,12,24,32) × 2 variation settings × 3 numerical resolutions (2/2.5/5s) × 2 policies = 720/720 completed technical runs**. There are **840 recorded pairwise comparisons**: 480 within-policy 2s-to-2.5/5s comparisons and 360 same-substep experiment-vs-baseline comparisons.

All 720 run cases passed collision, energy, conservation of submitted commands, zero official writes, and exact 30s-then-60s JSON checkpoint reproducibility. Each family has 240 validated technical runs and 280 comparison records.

The preliminary A37 CI attempts exposed and fixed two *research harness* issues without changing canonical swept safety: an expected comparison count that was calculated incorrectly (280, not 200 per family), and a numerical first-contact timestamp mismatch on tiny contact boundaries. A further experiment limitation surfaced in densely contested merges: the unilateral search may exhaust its 64 round limit. The final research policy records and safely falls back to the unchanged original resolver rather than pretending such cases did not occur. No original collision checks were weakened.

## Results against 2-second reference

**Maximum same-rider absolute position difference after the exact same 60 simulated seconds:**

| Traffic family | 2.5s baseline | 2.5s rear yield | 5s baseline | 5s rear yield |
|---|---:|---:|---:|---:|
| Same-lane following | 186.09m | **101.95m** | 187.39m | **121.32m** |
| Held mixed lanes (no commanded merges) | 197.38m | **114.97m** | 205.43m | **177.56m** |
| Active lane merges | **207.03m** | 237.66m | **209.15m** | 235.01m |

**Pairwise final positional ordering inversions:**

| Traffic family | 2.5s baseline | 2.5s rear yield | 5s baseline | 5s rear yield |
|---|---:|---:|---:|---:|
| Same-lane following | 0 | 0 | 0 | 0 |
| Held mixed lanes | 564 | **220** | 672 | **436** |
| Active lane merges | **626** | 798 | **759** | 982 |

The 2s output is a reference, **not ground truth**. All pair inversions refer to short synthetic riding configurations rather than real race classifications.

**Percentage of rider-substeps whose movement was attenuated to achieve clearance:**

| Traffic family | Baseline 2s | Yield 2s | Baseline 2.5s | Yield 2.5s | Baseline 5s | Yield 5s |
|---|---:|---:|---:|---:|---:|---:|
| Following | 57.20% | 26.90% | 64.48% | 34.13% | 76.82% | 53.10% |
| Held lanes | 35.92% | 17.52% | 44.47% | 20.49% | 56.94% | 29.06% |
| Active merging | 37.50% | 17.45% | 45.19% | 19.49% | 56.54% | 29.21% |

The new policy attenuates fewer movements, but **fewer interventions are not automatically fair or realistic**, as the worsening active-merge ranking stability demonstrates.

## Hard cases, remaining blockers and disposition

Active merging required full-substep reversion to the original validated resolver **11 times** (7 at 2s, 2 at 2.5s and 2 at 5s). There were also numerous locally rejected unilateral attempts that were cleared through per-conflict symmetric fallback; they are counted separately in the retained CI JSON evidence. Near-degenerate analytical timestamp mismatches occur in some following and merge scenarios; the experiment always treats them as potential collisions under the canonical predicate. Original submitted rider commands remain unchanged.

**A37 technical execution PASS, but A37 policy REJECTED as a numerical/sporting replacement.** The comparator demonstrates that the chosen one-way rear-yield priority can improve physically unobstructed progress yet aggravate contested multi-lane merging fairness. Neither A34 nor A37 is an approved production racing model. No final 106/168 rider full-stage comparison, real-world road geometry/elevation correction, drafting/attacking simulation, or end-user race UI/tactical milestone was completed. A2 **NO-GO**, B/C **NOT STARTED**.

**Next focus:** instrument where the dense-merge strategy loses numerical invariance — identify actual first conflicting rivals, crossing direction, candidate ratio rejections, and whether the algorithm's priorities are symmetric under lane/rider swaps. Test a truly time-normalized geometric corridor or bounded local hybrid with both **per-rider and group fairness checks**, not just low near-stop ticks. Keep collision/energy/checkpoint safety mandatory and remain research-only.
