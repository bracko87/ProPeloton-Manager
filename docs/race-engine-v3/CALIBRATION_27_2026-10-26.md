# Race Engine V3 — Batch 27: bounded lane cadence and full-field rank sensitivity

**Date:** 2026-10-26  
**Study code:** [fb8e7eabd12c9d56e3eef00bb959f6f152972995](https://github.com/bracko87/ProPeloton-Manager/commit/fb8e7eabd12c9d56e3eef00bb959f6f152972995)  
**Corrections:** [1091cb2cbddf95d22aea3980d79a4667b979b0e3](https://github.com/bracko87/ProPeloton-Manager/commit/1091cb2cbddf95d22aea3980d79a4667b979b0e3) (field-wide cadence), [c39eeb52824a9c078aeae2e3815f57e2e12081c0](https://github.com/bracko87/ProPeloton-Manager/commit/c39eeb52824a9c078aeae2e3815f57e2e12081c0) (artifact location).
**Decision:** **SPORTING NO-GO.** Research diagnostics only, no production race-engine physics, no live database writes, official racing selector unchanged, clocks unchanged.

## Technical validation

- [Batch 27 spatial-sensitivity matrix, full 106/168-roster epoch branches, pure metric tests, and application build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40305815874).
- [V3 legacy regression/isolation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40305815855) was run on the same research-script commit; inspect its final job result separately.
- Deterministic control branch required to reproduce the uninterrupted frozen race with **exact full-result equality**. Branched initial checkpoint differs only in one rider's lane, with no free forward metres, power, fatigue or W-prime adjustment.
- Each branch starts from its own already-reached checkpoint and runs forward to every rider's finish. Completion and no official writes are enforced. A rejected multi-rider safety plan is counted and not executed.
- Full rider JSON in GitHub Actions artifacts `v3-batch27-energy-epochs` and `v3-batch27-combined-epochs`, retention 30 days. Both artifacts inspected independently.

## A: Bounded global cadence under identical fixed speed targets

Over 96 ten-second ticks (16 synthetic minutes), same neutral rolling grid and rider speed targets, no production race result:

| Frozen field | No lateral intervention: blocked ticks | Safe lane move at most once/4 ticks: blocked ticks (shifts) | At most once/16 ticks: blocked ticks (shifts) |
|---|---:|---:|---:|
| Dordrecht, 106 | 6,185 | 5,936 (24) | 6,164 (6) |
| Guangxi, 168 | 12,193 | 11,933 (24) | 12,034 (6) |

Thus the 4-tick lane rule reduces blocked rider-ticks by **4.03% in Dordrecht** and **2.13% in Guangxi**; the 16-tick rule reduces them by **0.34%** and **1.30%**, respectively. These are reductions of rider-ticks, not of unique blocked riders.

The original per-rider cooldown was not binding because each of 95 decisions chose a different rider. The follow-up applies a **field-wide** cooldown and asserts strict 24-versus-6 intervention limits. The initial nonbinding test should not be interpreted as sensitivity evidence. More lane actions do not guarantee more realistic groups; after 96 ticks, the count of spatial gaps of at least 30 metres can change in either direction.

## B: Full-race one-rider intervention at three location bands

Every row compares a *single* safe lane change at a saved race checkpoint against the original uninterrupted frozen simulation with **all the same rider powers and prior history**. "Discordant pairs" is the number of pairs whose relative finish order flips, not a tail-gap metric. The locations and chosen riders differ by mode because the peloton evolves differently.

| Fixture/mode | Shift point | Riders changing finish rank | Reversed rider pairs | Median absolute change in actual finish time | Largest absolute change in actual finish time |
|---|---|---:|---:|---:|---:|
| Dordrecht energy-only | 0.598 km | 81 / 106 | 392 / 5,565 | 47.3 s | 597.8 s |
| Dordrecht energy-only | 3.090 km | 28 / 106 | 65 / 5,565 | 0.0 s | 120.7 s |
| Dordrecht energy-only | 15.291 km | 8 / 106 | 10 / 5,565 | 0.0 s | 29.6 s |
| Dordrecht combined | 0.780 km | 85 / 106 | 284 / 5,565 | 40.8 s | 346.5 s |
| Dordrecht combined | 3.995 km | 84 / 106 | 239 / 5,565 | 33.7 s | 257.2 s |
| Dordrecht combined | 18.236 km | 28 / 106 | 83 / 5,565 | 0.0 s | 123.0 s |
| Guangxi energy-only | 0.846 km | 144 / 168 | 1,479 / 14,028 | 44.2 s | 493.9 s |
| Guangxi energy-only | 3.025 km | 147 / 168 | 1,533 / 14,028 | 41.0 s | 484.1 s |
| Guangxi energy-only | 15.198 km | 9 / 168 | 8 / 14,028 | 0.0 s | 82.3 s |
| Guangxi combined | 1.688 km | 153 / 168 | 996 / 14,028 | 35.7 s | 273.8 s |
| Guangxi combined | 3.276 km | 149 / 168 | 893 / 14,028 | 41.3 s | 213.0 s |
| Guangxi combined | 23.654 km | 127 / 168 | 640 / 14,028 | 23.8 s | 207.1 s |
| Guangxi energy-only — steep 160.868 km | 160.868 km | 0 / 168 | 0 / 14,028 | 0.0 s | 0.87 s |

**Key observation:** Small early lane perturbations can reverse **up to 10.9% of all rider-pair finish orders** and materially change a large majority of finishing ranks. Sensitivity is not guaranteed to decline monotonically with kilometre: a single combined-mode Guangxi shift at 23.654 km still changes 127 finishing ranks. Therefore the solver's long-range positional feedback remains a large sporting calibration concern.

### Group splits

Full-race checkpoints also record group counts from **adjacent position gaps of 30 metres or more**, plus front-to-back distances, at the first, third, tenth and thirtieth 120-second continuation batch after a shift. Those snapshots do not establish a continuous exact separation onset; they are sampled group geometry, not a validated official breakaway-group algorithm. Examples:

- Dordrecht combined, early 0.780 km shift: after 10 batches, control had 18 geometry-defined groups and candidate 20; after 30 batches, control 35 vs candidate 31.
- Guangxi combined, early 1.688 km shift: after 3 batches, control 5 vs candidate 4; after 10 batches, control 13 vs candidate 10.
- Guangxi energy-only, early 0.846 km shift: after 3 batches, control 5 vs candidate 6 and after 10, control 13 vs candidate 11.
- Underlying JSON includes these snapshots, all paired finish ranks, time deltas, mechanical energy and blocked rider-ticks.

These are descriptive, not proof that one lane change *caused* every later overtake. Both branches are deterministic but the peloton responds with nonlinear power, shelter and collision interactions.

## Constraints and interpretation

1. **No official racing activation.** This study adds test scripts and GitHub Actions only; all study outputs mark `sportingApproval: NOT_APPROVED` and `officialWrites: 0`.
2. Guangxi's synthetic route still misses 718 m of the reported ascent. Dordrecht's 8 sprint-point orders are approximated as tempo; energy parameters and original weather remain provisional.
3. The cadence experiment is fixed speed demand, which deliberately removes energy feedback and does **not** reproduce a full aerodynamic race.
4. A single deterministic seed, a synthetic start formation, and one first admissible choice per location band do not yield confidence intervals. Outcomes should not be generalized across every route/field configuration.
5. **Do not optimize only blocked ticks or the last-rider gap:** those may improve while rider-order sensitivity and group organization remain unacceptable.

## Batch 28 recommendation

Build an offline-only multi-seed, multi-roster, weather/gradient-stratified **first-separation and rider-order robustness gate**. Include paired perturbations of initial grid assignment, safe lane choice and bounded power differences; measure actual rider-group cohesion, leader identity, rider-pair inversions, mass rank changes and chronic energy/passing opportunity costs. Validate repeated-attack exhaustion, exact checkpoints, collision-safe corridor, official write isolation and full application build. Reject any new lane dynamics that merely hide blocking while introducing implausible pack-wide finish reorderings.

**Sporting approval remains blocked.** No historical race results, production schedule or game clock was changed.
