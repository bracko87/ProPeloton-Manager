# Race Engine V3 — Step A55: bounded-acceleration feasibility of collision-safe interventions

**28 October 2026 — offline technical audit PASS; 0/70 safe-geometry hybrids physically bounded; sporting NO-GO.**

## Purpose

A54 proved that 70 isolated A53 component substitutions could be accepted as linear swept-safe **shadows**, recomputed under the original W-prime research accounting, and deterministically advanced one further collision-safe physical substep. But 68/70 of those changed-rider paths violated at least one provisional acceleration/braking limit in A54, including 60 cases introducing a violation absent from the same source rider's A44 accepted path.

The physical problem must be evaluated using the **actual longitudinal distance completed** inside the interval, not just the final speed assigned after that distance has already been committed. A rider moving with continuous velocity cannot arbitrarily reduce the time-integrated distance and then assign an unrelated terminal speed without exceeding a braking bound.

A55 therefore adds an independently evaluated bounded-acceleration feasibility certificate. This is **not** a new collision policy, production solver or accepted emergency-braking mechanism.

## Implemented observer and mathematical model

- `scripts/v3/a2VelocityEnvelopeAuditV3.mjs` provides `inspectConstantAccelerationEnvelopeV3`, `conservativeQuadraticSweepV3`, and `auditVelocityBoundedHybridV3`. All are pure offline researchers; no game-state write or active race integration.
- `scripts/v3/verify-a2-step55-velocity-envelope-v3.mjs` repeats the full A53/A54 frozen-source comparison for **75 local component and 57 union interventions** and retains every failed endpoint, original source state and computed braking need in JSON.
- `.github/workflows/v3-a2-step55-velocity-envelope.yml` runs that audit, the A54–A39 and complete-stage regression suites, production React build and preserves full case evidence.

For rider starting longitudinally at `x0` with known **physical starting speed `v0`**, after `dt` seconds an ordinary constant-acceleration trajectory obeys:

`dx = v0 × dt + ½ × a × dt²`.

The required acceleration to reach the solver's already accepted endpoint is therefore:

`a_required = 2(dx - v0 × dt) / dt²`.

An ordinary response is considered bounded only if that required acceleration is within **-0.85m/s² braking and +0.45m/s² acceleration** (the existing provisional A34 proposal limits), the terminal speed remains nonnegative and below the source model's maximum, and lateral distance does not exceed **0.38m/s × dt**. When a cyclist reaches zero speed before the interval is over, the lower *stopping-distance* bound is assessed separately; that case cannot receive a full-interval quadratic certificate from this simplistic test.

The finite-time swept safety check for a **feasible** ordinary trajectory uses actual quadratic longitudinal position `x(t)=x0+v0·t+½a·t²` with linear lateral position. In every one of 32 microintervals it conservatively inflates the longitudinal bicycle separation bound by the sum of both riders' maximum quadratic-to-chord deviations `|a|·h²/8`. If this expanded continuous swept path does not overlap, it establishes a conservative **two-dimensional clearance certificate under the stated constant-acceleration model**. It is not a full bicycle-dynamics, drafting or sporting proof. A direct feasible synthetic unit case passed this check; real A53 hybrids are not silently certified if their velocity envelope already fails.

The original A54 W-prime ledger and next-substep JSON replay are checked before this new physical classification. A rejected hybrid remains rejected. Cases requiring braking beyond the original bound are reported with the specific rider identity, magnitude and shortfall of legal forward displacement, never converted to a silently "safe" emergency stop.

## Experiment and results

[Step55 GitHub Actions evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40678963816) spans **162** existing full 60-second synthetic simulations: 40 fields at .5s and 2.5s for both control policies, plus one targeted 2s fixture pair; **81 matched comparisons**. It checks **75** isolated component and **57** combined-component frozen substeps.

The original geometry classification is unchanged: **70** locally swept-safe A53 path combinations and **five** rejected local hybrids. The four prior unsafe component unions also remain blocked. No requested controls or actual source races were modified.

| Physical quantum | Safe geometry local hybrids | Fully bounded, conservative swept-safe ordinary candidates | Newly infeasible under required constant acceleration vs A44 | Changed rider needs out-of-bounds braking | Largest measured required braking |
|---|---:|---:|---:|---:|---:|
| 0.5s | 31 | **0** | 27 | 31 | **28.500m/s²** |
| 2s (targeted fixture) | 1 | **0** | 1 | 1 | **4.675m/s²** |
| 2.5s | 38 | **0** | 33 | 37 | **7.389m/s²** |
| **Total** | **70** | **0** | **61** | **69** | **28.500m/s²** |

The stricter constant-acceleration check produces **61** newly infeasible local cases, versus A54's **60** newly violating cases under the previous post-substep terminal-speed approximation. They are different measurements, not an accidental change to the original test. A55 is specifically measuring **distance-integrated feasibility**, which a plausible-looking final speed alone cannot prove.

All **70** matching A44 original source fields contain at least one rider with an infeasible constant-acceleration trajectory, so fixing the A50 lane-entry heuristic alone is not sufficient. The A44 experimental baseline itself does not meet this physical model in the studied contact situations.

The worst measured required braking of **28.499996m/s²** at a 0.5-second substep is more than **33×** the provisional -0.85m/s² ordinary braking limit. These figures are mathematical implications of the frozen synthetic endpoints, not measured bicycle braking performance. This classifier does **not** endorse real cyclists braking at 28.5m/s²: it identifies those endpoints as non-admissible under the current model and demands earlier anticipation or an explicitly separate emergency response, with physical validation.

### Four original contact spotlights

- **Baseline 5m / 8 riders / v1, 51s:** source r004/r005 occupied-corridor conflict; unchanged source hybrid remains geometrically safe but requires about **28.941m/s²** peak braking for r004. The A44/A50 trajectories had already diverged at 32.5s.
- **Wide 6.5m / 8 riders / v1, 51.5s:** r004/r005 source conflict, around **27.769m/s²** required for r004; source trajectories had already diverged at 13.5s.
- **Cautious 5m / 32 riders / v0, 22.5s:** two source contact components, r030 requires around **4.85m/s²**; this is the first actual coarse-grid divergent substep.
- **Cautious 5m / 32 riders / v1, 22s:** several source contact components, r002/r014/r024 require out-of-bounds braking, with a peak around **4.762m/s²**; the actual A44/A50 first split occurs earlier at 14s.

Note that the first two source event maxima exceed the **28.500m/s²** overall table maximum because they are *additional original historical source snapshots at 51/51.5s*, rather than among the 75 first-divergence component trials. These are intentionally distinct scopes.

## Safety, limitations and decision

**A55 exact displacement/velocity calculation, comparison with unchanged A44 source, conservative quadratic sweep implementation, immutable proposals, source W-prime ledger, second-substep replay and 162 offline physical simulations PASS technically.** None of the 70 contested local hybrids earns an ordinary physically bounded all-rider certificate. The future continuous quadratic sweep is therefore skipped in those cases, rather than incorrectly certifying an impossible trajectory. A feasible, noncolliding synthetic control demonstrates the certificate works for an admissible path.

No full 10-second **hybrid** tick or realistic full-stage contact time was newly authorized. The original A44/A50 shadow energy routines and synthetic contact clearance do not prove real-world cycling behavior, and the assumed 0.85/0.45m/s² envelope itself still needs empirical calibration.

**A55 SPORTING / PHYSICAL NO-GO, A2 NO-GO; Milestones B/C NOT STARTED.** No live race, historical result, player payout, official Supabase race record, Netlify production race policy or game-clock change.

**A56 research direction:** evaluate *earlier anticipation* by looking backward before predicted contact, rather than giving a rider an unreachable target inside a late physical substep. Require documented stopping distances and deterministic collision-time predictions; where normal braking is genuinely impossible, design and validate an explicitly named emergency-control model that respects its own acceleration, rider energy and road width constraints. Maintain independent swept collision, replay and identity/mirror fairness gates.
