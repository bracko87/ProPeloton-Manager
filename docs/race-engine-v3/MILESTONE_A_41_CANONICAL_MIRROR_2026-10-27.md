# Race Engine V3 — Milestone A Step 41: canonical left/right road representation

**27 October 2026 — 456/456 matched 60-second technical simulations PASS; mirror and ID symmetry PASS; numerical/sporting realism NO-GO.**

## Why Step 41 was necessary

[A39](MILESTONE_A_39_PHYSICAL_TIE_2026-10-27.md) eliminated identity-dependent pair priority but retained **three** left/right roadway mirror failures in 120 synthetic configurations. [A40](MILESTONE_A_40_MIRROR_TIME_NORMALIZATION_2026-10-27.md) isolated the first failing path knots and tested rounding relative coordinates and first-contact times; the attempted correction still failed **3/120 mirror comparisons** and worsened the largest spatial discrepancy. It was therefore necessary to test *coordinate representation independently of the conflict policy*.

## Research-only architecture

New file: `scripts/v3/a2CanonicalMirrorResearchV3.mjs`.

It leaves A34 and A37/A39/A40 source algorithms unchanged. When initializing a synthetic 2–32-rider physical field, it selects a canonical left/right orientation using the earliest longitudinal rider who has a distinguishable off-center lateral position, entirely from physical coordinates. It normalizes reflected lateral positions onto the same quantized geometric envelope and runs exactly the **existing A39 `event_time_fair`** substep and energy solver. All physical rider state and accepted per-substep trace coordinates are mapped back to the original left/right orientation for the caller.

The source A34 checkpoint remains embedded intact in the wrapper, including its physics, per-rider energy, metrics and last accepted path tracks. A41 adds a `canonicalFlipped` flag and physical-coordinate view so exact serialized replay can be verified. Physical rider commands remain unchanged outside the wrapper. The nested adapter receives corresponding canonicalized target lane requests and reuses the unchanged swept-collision and energy-commit checks.

**Scope limitation:** A field where every rider starts exactly on the lateral centerline has no physically distinguishable initial left/right orientation, so the wrapper explicitly rejects it. Likewise these 120 scenarios are only synthetic cases, not a proof of symmetry on arbitrary historical stages or real-world road geometry.

**No live integration.** The research wrapper is never called from the production game engine or Netlify gameplay. Nothing is written to live races, payouts, Supabase or game clock.

## Validated CI and exact counts

[Successful Step 41 GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40584785802) included both the new metamorphic/numerical matrix and unchanged A40/A39/A38/A37/A36/A35/A34/A33/A32/complete-stage regressions plus production React build. The separate legacy-isolation workflow was also preserved.

Matrix design: 4 provisional road-width envelopes × 5 field sizes (2, 8, 12, 24, 32) × 2 configuration variations × 3 simulated physical step durations (2, 2.5 and 5 seconds) = **120 configurations**.

Each configuration was independently run for 60 simulated seconds in four forms: 120 unchanged A39 physical scenarios, 120 A41 same-orientation canonical scenarios, 120 reflected-road canonical scenarios and **96** A41 ID-renamed cases (renaming only meaningful for fields of 8+ riders). Total **456/456** completed technical cases. Each 10-second command was frozen and preserved. Exact midpoint JSON resume through 60 seconds, accepted 2D swept paths, nonnegative finite W-prime and mechanical-energy ledger consistency were checked.

### Symmetry acceptance

| Independent gate | Step 41 outcome |
|---|---:|
| Canonical versus unchanged A39 initial orientation | **120/120 exactly equivalent**, 0m x/y and 0J W-prime difference |
| Left/right mirrored orientation | **120/120 matched**, max x deviation **0m**, max reflected y deviation **0m** |
| Rider-ID relabeling | **96/96 matched**, max x deviation **0m** |
| Accepted piecewise swept overlap | **0** |
| Official result writes | **0** |

The verified 120/120 mirror result resolves the three known A39 reflection counterexamples *within this tested grid*. It does not mean that the underlying collision algorithm is now numerical- or sporting-realistic.

## Unchanged poor timestep convergence

**Rider-pair ordering reversals and maximum single-rider x differences after 60 simulated seconds relative to 2-second reference:**

| Policy | 2.5-second inversions | 2.5-second max x delta | 5-second inversions | 5-second max x delta |
|---|---:|---:|---:|---:|
| Unchanged symmetric A34 control | **626** | **207.032m** | **759** | **209.147m** |
| Original A39 group-priority candidate | 1,164 | 229.985m | 1,104 | 250.091m |
| A41 canonical representation with unchanged A39 physics | **1,164** | **229.985m** | **1,104** | **250.091m** |

This exact numerical equivalence was intentional: it proves that A41 changed **representation, not the underlying collision and energy mechanics**. The fact that reflection can now be represented consistently does **not** improve timestep stability. The 2-second motion is a comparison reference, not verified physical truth; pair inversions are synthetic spatial ordering differences, not official race classifications.

The A41 candidate still requires **30** full-substep fallback-to-symmetric events in 2-second configurations, **8** at 2.5s and **1** at 5s. The old production game engine is not involved and remains unchanged.

## Decision and next narrowly bounded experiment

**A41 engineering and geometric-representation gate PASSED; A2 numerical-stability and sporting gates remain NO-GO.** A41 may be kept as an offline coordinate-normalization test harness for future candidate evaluators; it should not be presented as an improvement in race physics or as player-facing functionality.

**Step A42** must target physical time-step-dependent congestion and rank changes, with a genuinely time-consistent swept intersection/priority approach or bounded pairwise yielding policy and independent per-rider fairness checks. Match exact fields and immutable demands across multiple substeps; demonstrate lower position, gap and rank disagreements simultaneously without violating swept safety, W-prime or checkpoint replay. Even better synthetic convergence would still need realistic sourced stage road widths/elevation, athlete physics, drafting and breakaways and full-scale 106/168-rider sporting validation before completion of A2.

**Milestone B/C remain NOT STARTED; production selection remains unchanged; no official race/data/game clock modifications.**
