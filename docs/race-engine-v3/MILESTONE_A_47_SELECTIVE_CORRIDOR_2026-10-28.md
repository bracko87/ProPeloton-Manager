# Race Engine V3 — Milestone A Step 47: selective follower corridor concessions

**28 October 2026 — engineering and safety PASS; individual sporting consistency NO-GO.**

## Aim and retained baseline

Step A46 eliminated all 148 of the previous 0.5-second rear-priority conservative-fallback incidents without accepting any cyclist collision. However, its two-sided guard remained less consistent than the A44 rear-priority policy in 10 of the 160 matched 60-second per-fixture tests, and aggregate rider-order inversion count was actually worse at the 2-second grid.

Step A47 tests **two narrow alternative collision responses**, explicitly preserving the original A34 symmetric default, A43 acceleration-integrated reference, A44 physically rear-priority candidate and A46 two-sided guard as unchanged comparisons.

## Independent opt-in candidates

1. **`trapezoid_rear_corridor_strict`** only permits two-sided yield when the current leader swept segment **really intersects a stationary follower**. Unlike A46, it does not initiate the guard merely because the follower's attenuation ratio has dropped below 1/65536. All pairwise collision checks continue to use the original 2D continuous bicycle predicate.

2. **`trapezoid_rear_corridor_leader`** responds to that same physical stationary-follower contact by reducing **only the current leading rider's path**, rather than simultaneously reducing both leader and follower. Otherwise it continues A44-style rear-priority movement attenuation. It cannot authorize an unsafe accepted path; the complete all-pair continuous collision check and bounded conservative fallback remain.

Neither response modifies non-conflicting acceleration, rider effort, the committed W-prime ledger, the command transport, or the active player-race solver. Both are opt-in research policies in `scripts/v3/`, not gameplay engine selection.

The first CI run failed before executing simulations due to a duplicated `rear` variable name in the A47 test harness (a direct isolated pair fixture versus a policy string identifier). Renaming the test-local fixture variable fixed the syntax issue without changing physics. The subsequent full matrix completed successfully.

## Test matrix and engineering gates

[Step A47 GitHub CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40655845945) exercised **1,216 independent 60-second technical runs**:

- **1,000** actual physics runs: 40 synthetic initial configurations (4 provisional road scenarios × 5 field sizes 2,8,12,24,32 × two variations) × 5 physical steps 0.5/1/2/2.5/5s × 5 policies (A43 trapezoid, A44 rear-priority, A46 corridor, A47 strict and A47 leader-only).
- **96** logical-rider ID-renaming runs (32 each for the A46 and two A47 modes), with unchanged physical demands.
- **120** left/right road-reflection runs (40 each for the same three candidate policies).

Every tested accepted physical trajectory had **zero independently detected swept cyclist overlaps**, finite nonnegative W-prime with correct mechanical joule ledger, preserved source commands, and exact JSON 30-second checkpoint replay through 60 seconds. No official race result writes. Both new candidates had **0 of 32 rider-ID rename failures** and **0 of 40 mirrored-road failures**. A47 and A46 reported **zero full conservative-fallback episodes** at 0.5/1/2/2.5/5s in the tested configurations, as required. The A44 0.5-second original fallbacks remained 148 for the independent reference check.

All results compare each physical candidate with **its own** 0.5-second motion as an unvalidated computational reference. None of these simulations is a complete full-peloton race.

## Numerical results

**Total pairwise relative-order reversals after 60 seconds:**

| Actual physical quantum vs 0.5s | A43 trapezoid | A44 rear-priority | A46 two-sided guard | A47 strict guard | A47 leader-only |
|---|---:|---:|---:|---:|---:|
| 1s | 920 | 347 | 256 | 256 | 256 |
| 2s | 1,119 | 429 | 446 | 446 | **429** |
| 2.5s | 823 | 511 | 500 | 500 | **470** |
| 5s | 813 | 608 | 592 | 592 | **570** |

The A47 strict variant **did not change any measured per-fixture x/gap/order stability metric** versus A46 in the 160 nonreference cases. For this specific synthetic dataset the tiny-scale shortcut did not provide an independently measurable benefit; removing it neither solved the known regressions nor reintroduced fallback storms. It is not automatically preferable without broader tests.

The **leader-only variant improved aggregate pair inversion totals** at 2, 2.5 and 5 seconds compared with A46 while retaining its 0.5s zero-fallback property, but still failed individual-scenario acceptance. It also reduced corridor intervention count at 0.5s from A46's 2,196 to just 28 actions, illustrating that this is a materially different path-choice policy. Intervention totals are resolver decisions, not bicycle crashes.

### Mandatory per-fixture no-regression check

A fixture is counted as worse if **any** of three measured deviations increases against the reference policy: worst single-rider longitudinal position, worst leader gap, or total rider-order pair inversions.

| Candidate | 1s cases worse vs A44 | 2s | 2.5s | 5s | Total failures of 160 |
|---|---:|---:|---:|---:|---:|
| A46 two-sided guard | 2 | 3 | 3 | 2 | **10** |
| A47 strict guard | 2 | 3 | 3 | 2 | **10** |
| **A47 leader-only** | 3 | 5 | 3 | 0 | **11** |

The A47 leader-only policy also regressed in **11** comparisons versus the A46 reference and **11** versus A43 trapezoid. This is not a paradox: some cases get better on pair order but worse on position/gap; some improve on one physical reference but not another. An improved total is insufficient evidence that the sporting model behaves correctly for individual races.

A46's worst originally documented counterexample remains visible: **cautious 5m / 32 riders / variation 0 / 2.5s** generated **80** relative-order inversions versus **65** in A44 and **53** in A43; maximum x deviation for A46 **166.01449m**, versus A43 **135.650874m**. A47's new policies must independently correct this kind of case rather than masking its impact through global averaging.

The original data contain all matched per-case computations and metadata in the CI artifact `a2-step47-individual-sporting-evidence`; these case-level data are preserved regardless of the overall sporting NO-GO.

## Decision and next step

**A47 technical, bounded fallbacks, ID-renaming and road-reflection gates PASS. Sporting-realism, zero individual regression, full-sized peloton and complete-stage calibration gates remain NO-GO.** The research policies are not activated for official races or player-facing controls.

**A48** should isolate the individual leader-only errors by exact pair geometry and lane-entry intent, and test an actual *physical right-of-way/contact-time* formulation that respects another rider's competing motion. Success must require both zero full fallback storms and improved **per-fixture** x/gap/order metrics at all five tested time grids, not merely a lower total inversion count. Any full-peloton expansion beyond the current 32-rider research limit requires a separate engineering-and-performance gate and real stage road-width/elevation provenance.

**Milestone A2 sporting NO-GO; Milestones B and C NOT STARTED; no live racing, player currencies, Supabase data or game-clock changes.**
