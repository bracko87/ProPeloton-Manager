# Race Engine V3 — Milestone A Step 48: pair geometry and reference-time divergence diagnosis

**28 October 2026 — independent geometric diagnosis PASS; sporting approval NO-GO.**

## Purpose and most important distinction

In A47, the leader-only priority experiment had **11 of 160 per-fixture numerical regressions** against the A44 rear-priority policy. Those were defined as a worse maximum x displacement, leader-gap difference or pair-order inversion count when each algorithm was compared with **its own** 0.5-second physical reference. A report of a "worse" score does **not** necessarily mean the two policies made different decisions at the *coarser* time step.

A48 follows **actual accepted trajectories and the original frozen movement demands**, first locating where A44 and A47 policy outputs genuinely split at the same time quantum, then separately checking if their fine-grid references split. It uses no new speculative priority correction and changes **neither** policy's movement, W-prime debit nor contact predicate.

## Offline implementation

- `scripts/v3/a2PairGeometryAuditV3.mjs`: pure observer using the existing A37 first-swept-contact fraction and the original continuous 2D bicycle collision predicate. For a provisional rider pair, it records longitudinal front/rear orientation, which rider changes lateral position, whether steering is unilateral/parallel/opposed, physical gap and first-contact geometry. It tests whether the leader's proposed swept path intersects a **completely stationary follower**. This is a collision diagnosis, not a legal right-of-way decision.
- `scripts/v3/audit-a2-step48-first-pair-v3.mjs`: reruns identical Step47 source fixtures, attaches the existing opt-in accepted-substep diagnostic trace and independently audits the first accepted x/y path divergence between A44 rear priority and A47 leader-only (and A46 two-sided guard as a control). Separately replays a 0.5-second reference pair when the coarser compared physical paths are identical.
- `.github/workflows/v3-a2-step48-geometry-audit.yml`: bounded synthetic technical job, JSON evidence artifact and previous A47–A39 plus completed-stage and application build checks.

The first CI attempt stopped because the audit had assumed a regression score necessarily meant the compared coarse trajectories differed. Five fixtures disproved that assumption immediately. The corrected full study checks both trajectories and their **independent fine-grid references** rather than silently excluding those cases.

## Scope and validation

[Successful A48 GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40657326343) completed:

- Four provisional road-width scenarios × fields of 2/8/12/24/32 riders × two control variations: **40 matched fixtures**.
- Three unchanged policies (A44 rear priority, A46 two-sided follower guard, A47 leader-only concession) × five real substep sizes (0.5,1,2,2.5,5 seconds) × 40 fixtures: **600** independent 60-second physical simulations.
- When a recorded regression had identical coarse trajectories, an additional three 0.5s traced source runs rechecked the fine-grid reference decisions. **27 additional targeted fine-grid replays**, giving **627 successful technical physics runs**.
- **160 nonreference fixture-grid comparisons**, and exact reproduction of the **11/11 A47 leader-only** and **10/10 A46 guard** original per-fixture regression counts.
- Exact synthetic checkpoint replay, finite nonnegative W-prime with consistent mechanical energy, unchanged frozen controls and no independently accepted piecewise swept cyclist collision. All official-write counters remain **zero**.
- Two constructed pure geometric controls separately confirmed that a one-steering leader-over-follower contact is classified identically under lateral reflection and rider-ID renaming.

The source driver’s default policy and player-facing race physics remain unchanged; all study outputs are numerical research only.

## Key result: nine reported regressions are fine-grid reference changes

**9 of the 11** A47 leader-only regressions against A44 have **identical accepted rider trajectories at the tested coarse physical quantum**. The policies differ instead at their own **0.5-second reference trajectory**, so the policies' deviations measured *from those distinct references* differ even though their coarser outcomes match.

These nine comparisons arise from repeated instances of the same two physically similar local situations, predominantly around **51s to 51.5s** of the synthetic 60-second run:

| Road | Examples of affected field sizes / coarse grids | Earliest different fine-grid trajectory |
|---|---|---|
| Baseline 5m | 8 and 12 riders; 1/2/2.5-second comparisons | **51.0s**, first rider r005 |
| Wide 6.5m | 8, 12 and 24 riders; 1/2/2.5-second comparisons | **51.5s**, first rider r005 |

For the baseline 5m situation, the *same* one-steering pair has a measured initial contact fraction **0.052632** in the affected 0.5s interval. A44's accepted movement ratio for rider r005 was **0.03125**, while A47 leader-only allowed **1.0** at that first differing interval. In the wide 6.5m variant, the contact fraction was **0.105263** and the respective movement ratios were **0.0625** vs **1.0**. These are important *mechanical divergence facts*, not justification that either concession is the physically correct sporting outcome. The full source-time segments are in the attached CI JSON.

It would be misleading to label all nine of these scores as an incorrect coarse-grid overtaking choice: **no coarse-grid path-choice difference exists in those nine matched comparisons**.

## Two genuine coarser-timestep path-choice differences

Two scenarios *do* show an A44-vs-A47 accepted-path difference at the evaluated coarse time step:

| Road | Field | Variation | Physical step | First different accepted path | First differing rider |
|---|---:|---:|---:|---:|---|
| Cautious 5m | 32 | 0 | **2.5s** | **22.5s** | r025 |
| Cautious 5m | 32 | 1 | **2s** | **22.0s** | r021 |

In the 2.5s case, the affected rider r025 had accepted movement ratio **0.0625** in A44 and **0.5** in leader-only; x endpoints **379.218735m** and **386.874984m**, respectively. In the 2s case, r021 had ratio **0.0625** in A44 and **1.0** in leader-only; x endpoints **372.321840m** and **384.649957m**. All these accepted paths remain independent swept-collision safe in the synthetic model.

The first mismatching substeps included unilateral lateral steering, front/rear contact, and proposed leader motion intersecting a stopped follower. The variation-1 2s case also involved other straight and parallel-steering provisional contacts in the same step. The first decision can therefore be a **competing multirider contact graph**, not an isolated "rear rider must always yield" formula.

## Geometric classification and limitations

Across all eleven first-divergence cases, **all 11** had at least one **one-steering** provisional conflicting pair. In addition, one first-divergence set contained a straight pair and one contained parallel-steering contact; categories overlap because several riders can conflict in the same physical substep. No opposite-steering pair occurred in those first-difference sets. All eleven had at least one provisional contact in which the proposed leader path would intersect a stationary follower.

Importantly, this classifies the **first observed differing accepted track** and its provisional collision geometry. It is not yet an exhaustive causal proof that a single pair's priority decision caused the later final order difference: adjacent conflict pairs can participate simultaneously and trajectories thereafter evolve differently. Nor does matching a 0.5s reference validate that reference as real cycling truth.

## Decision and next technical focus

**A48 source-level geometric tracing and safe replay PASS. A2 sporting, numerical convergence and full-stage representativeness remain NO-GO.** No new race policy was promoted or activated, and none of the existing opt-in or default policies was changed by this step.

**A49 next** should establish a shared, defensible physical reference for comparing policies, then isolate the left/right physical contact-time decisions responsible for the nine 0.5s reference differences and the two genuine coarser physical branching cases. A complete solution must also preserve self-consistent speed and energy, swept cyclist clearance, identity/lateral invariance and full realistic peloton road-width/elevation, drafting and realistic 106/168-rider stage classifications. Step A48 did not claim those exist.

**A2 NO-GO; Milestones B and C NOT STARTED; no official race results, Supabase data, payouts or clock changes.**
