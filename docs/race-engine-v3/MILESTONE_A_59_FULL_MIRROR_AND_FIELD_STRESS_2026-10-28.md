# Race Engine V3 — A59: full left/right mirror and all-rider bounded response stress test

**28 October 2026 — engineering audit PASS; full-field physical realism and sporting authorization remain NO-GO.**

## Objective

A58 produced 44/67 nominally collision-free ten-second responses by braking and optionally steering selected cyclists while all remaining cyclists followed unchanged recorded A44 paths. Its additional 15 successes appeared only as **rightward steering**. This raised an important question: **was the resolver biased toward one side, or were the synthetic fixture layouts asymmetric?**

A59 audits **every eligible A58 early-warning checkpoint** under left/right reflection and rider identity renaming. It also makes a separate, stricter attempt to advance **all riders** from the same earlier checkpoint under bounded acceleration, braking, lateral motion and a deterministic current-state headway reaction, rather than retaining impossible A44 accepted motion for nonselected cyclists.

These are **two distinct research experiments**. A mirror audit tests transformation fairness of A58's frozen-obstacle model. The full-field probe is a new fail-closed physical stress control, not a vetted contact solver and not a live deployment.

## Files and validation

- `scripts/v3/a2MirrorAndFullFieldProbeV3.mjs`: read-only source reflection and ID relabeling, all-field physical integration with actual source tick intentions, conservative pairwise swept detection, and W-prime accounting.
- `scripts/v3/verify-a2-step59-symmetry-and-field-v3.mjs`: all 67 original + reflected + relabeled A58 comparisons, 67 fresh 10s all-field simulations with exact JSON replay, and independent positive / negative three-cyclist synthetic controls.
- `.github/workflows/v3-a2-step59-symmetry-and-field.yml`: bounded CI jobs, retained per-case JSON artifact, complete A58–A39 and full-stage technical regressions, React production application build.

[Step59 Actions and full evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40691906546)

All 162 A44/A50 historical 60-second synthetic technical runs, 81 matched comparisons, 75 connected-component case counts, 110 changed-rider braking observations and 67 prior-warning eligibility decisions reproduced without changes to baseline game, commands, stage classifications, or payouts.

## 1. Full 67-case mirror and rider-ID audit

For each original source history, the test mirrors actual lateral source state `y -> Ymax - y`, all requested/proposed lateral movement, and each accepted substep path. Every permitted original A58 reaction plan receives a corresponding mirrored plan: `LEFT` is mapped to `RIGHT`, and vice versa. An independent run consistently renames the rider identities under a bijection that **reverses their lexical order**, intentionally stressing accidental ID tie-breaks.

All **383** original A58 candidate strategies are evaluated against both transformed scenarios. Plan availability, ten-second success or failure, and the actual first swept-contact rider-pair identities (after applying the mapping) are checked.

| Category | Original .5s | Original 2.5s | Total |
|---|---:|---:|---:|
| Eligible prior-warning checkpoints | 40 | 27 | **67** |
| Response plans per original geometry | 243 | 140 | **383** |
| Any-plan ten-second clear against frozen A44 obstacles | 23 | 21 | **44** |
| Original right-steering rescues | 11 | 4 | **15** |
| Corresponding mirrored left-steering rescues | 11 | 4 | **15** |
| Strategy outcome mismatches after mirror | 0 | 0 | **0** |
| Strategy outcome mismatches after relabel | 0 | 0 | **0** |
| Swept contact-pair mismatches (mirror and relabel) | 0 | 0 | **0** |

The observation **does not show an intrinsic right-side priority** in the A58 algorithm. The 15 original rightward successes are exactly reproduced as leftward successes under reflected initial positions and steering intentions. This identifies asymmetric fixture starting geometry as the proximate explanation within this test corpus, **not** a universal empirical preference of cyclists for either side.

Logical rider ID renaming also produces zero differences, providing a useful metamorphic control. Real-world lateral behavior, overtaking priority and rider fairness are still uncalibrated and sporting GO remains closed.

## 2. All-rider bounded physical shadow, without frozen A44 obstacles

A59 also independently restarts **all 2–32 synthetic riders** at the actual earlier A44 alert-time pre-substep x/y/speed/W-prime checkpoint. During a ten-second shadow interval:

- Selected cyclists follow the same chosen A58 ordinary braking and optional bounded smooth lateral steering; any A58 candidate previously successful is used *retrospectively for comparison only*, not as a nonclairvoyant approved controller.
- Other cyclists **no longer replay A44 accepted paths**. Their speed changes toward the currently supplied A44 rider intention are limited to +0.45/-0.85m/s², and lateral movement toward that intention is capped at 0.38m/s.
- A current-state same-corridor following-headway rule can select extra ordinary braking when a trailing rider is approaching a leader too closely. It sees only the present state, not future collisions.
- All riders' x(t) is physically integrated with bounded acceleration and stopping at zero speed; y(t) is bounded for each physical interval. Every rider pair is checked independently against conservative continuous swept 2D bicycle envelopes, **not simply at endpoints**.
- Every completed substep recomputes provisional W-prime and elapsed energy time. On the first swept contact, any energy violation, or malformed state, the shadow **fails closed**, with no collision adjustment by teleporting rider movement or resetting terminal velocity. Exact JSON checkpoint replay is checked for all 67 full-field runs.

This is a strict diagnostic *baseline controller*. It is **not** yet a negotiated mutually responsive, calibrated race engine; headway is a one-rule approximation, original tick intentions come from recorded source snapshots, drafting/terrain are not source-calibrated, and the choice of an A58 strategy when that original model succeeded was selected with hindsight.

### Full-field stress results

| Quantum | Eligible A58 scenes | A58 clear against frozen outside riders | All-field 10s clear | New all-field swept collisions | Energy failures |
|---|---:|---:|---:|---:|---:|
| 0.5s | 40 | 23 | **0** | **40** | 0 |
| 2s (targeted no-warning fixture) | 0 | 0 | 0 | 0 | 0 |
| 2.5s | 27 | 21 | **6** | **21** | 0 |
| **Total** | **67** | **44** | **6** | **61** | **0** |

The new headway model triggered **327** extra braking responses across the .5s cases and **252** across the 2.5s cases: **579** decisions in total. Even with these reactions, 61 scenes collide, proving that the narrow original A58 frozen-obstacle successes do not translate automatically into an interacting 2D peloton.

A59 has not shown that six 32-rider *races* are safe. The six pass only a **ten-second, up-to-32-rider shadow stress scenario** under one provisional controller and particular starting states. No classification, repeated full stage, long-run formation, realistic drafting or sporting validation follows.

### Controlled three-cyclist checks

A fully integrated three-rider sample with an alerted cyclist, same-lane trailer and adjacent-lane rider passes ten seconds when the first two brake together from the same time. The result survives independent exact JSON round-trip, left/right reflection and identity renaming. Deliberately overlapping starting motion is rejected for contact. These controls establish the test can distinguish a safe bounded response from an unsafe one under a compact configuration; they are not field-scale validation.

## Decision and A60 focus

**A59 TECHNICAL PASS**: source immutable, all 67 A58 mirrors and renamed rider identities tested without outcome or contact-pair differences; all 67 bounded complete-field shadows deterministically replayed and reject 61 collisions; provisional energy calculation completed without invalid W-prime. The earlier 44/67 remains a valid but narrow *frozen-other-path* result, not an engine readiness measure.

**A2 SPORTING / PHYSICAL NO-GO**: 61 all-field collisions, primitive headway anticipation, no proven nonclairvoyant candidate selection, synthetic road geometry, a maximum of 32 riders instead of real 106/168-rider stages, and no valid production racing/classification connection.

**A60:** classify each of the 61 initial swept contacts, trace which rider received insufficient advance warning, and test strictly prior-state bounded reactive selection (braking and steering) against all-pair trajectories without using hindsight. Preserve all 67 mirror and rename fairness checks, deterministic 10s energy and collision gates and common reference metrics. If no physically feasible collision avoidance exists, fail closed rather than accepting an emergency velocity jump.

**No live racing engine, Netlify racing-policy change, Supabase records, historical results, rider payouts or game clock modified.**
