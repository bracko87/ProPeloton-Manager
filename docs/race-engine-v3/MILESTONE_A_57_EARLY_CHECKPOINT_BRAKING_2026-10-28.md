# Race Engine V3 — A57: actual early-braking from frozen A44 checkpoints

**28 October 2026 — offline technical PASS. Twenty-nine ten-second early-braking trials avoid frozen surrounding-rider collisions; no sporting approval.**

## Purpose

A55 demonstrated that zero of the 70 geometrically safe local A44/A50 contact-component alternatives could satisfy all actual start-speed and ordinary acceleration constraints. A56 found **110** changed-rider braking observations, with earlier contact warnings in **67**, but did not intervene. This step is the first **actual trajectory intervention from a real prior A44 pre-substep physical state**. It is deliberately stricter than a retrospective estimated braking lead, but substantially narrower than a fully coupled peloton solver.

## Implementation and precise meaning of “checkpoint”

- New `scripts/v3/a2EarlyCheckpointBrakeReplayV3.mjs`: pure, OFFLINE `replayEarlyBrakingShadowV3` from the earlier recorded A44 substep's exact **initial x, lateral y, speed, and W-prime energy**. It begins at the **start of the first previously warned A44 substep** (the previous warning's timestamp marks the *end* of that source substep). These are historical diagnostics from actual A44 physics, not synthetic future positions guessed by A57.
- New `scripts/v3/verify-a2-step57-early-brake-v3.mjs`: executes A44 and rejected A50 against frozen 40 × 2 timing-grid scenarios plus one targeted 2s scenario; chooses only the actually changed riders from the same original A53 component; reproduces A56’s original **110** case warnings and applies early braking when an earlier warning was genuinely present.
- New `.github/workflows/v3-a2-step57-early-brake.yml`: dedicated offline audit, 30-day JSON evidence, A56–A39 and complete-stage regression tests, and independent production React application build.

[Step57 GitHub Actions and attached full evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40686447148).

The warned cyclist alone now follows ordinary `v(t)=max(v_start-0.85×t,0)` with **exact integrated forward displacement** including stopping before the physical interval ends, constant lateral y, and a new W-prime ledger committed at the physically achieved average speed using the **existing provisional road-power law**. There is no instantaneous assignment of an impossible terminal speed.

Every other rider acts as an unchanged moving obstacle following the **original A44 accepted substep motion**, linearly interpolated within that substep. Each substep is independently tested against **every** moving other rider via 32 continuous micro-swept comparisons with a conservative `b × h²/8 + epsilon` enlargement of the longitudinal collision footprint, sufficient to bound the braking trajectory’s curvature under the one-rider braking model. It is not merely a sample of endpoint positions.

The code never writes back to any original A44 checkpoint, frozen rider command, Supabase state, official race or production selector. The shadow may be rejected immediately on swept contact or W-prime failure. Exact JSON round-trip replay of the intervention is asserted; a synthetic positive control also verifies left/right mirror, consistent rider-ID renaming and an intentionally blocked close-following case.

## Actual measured results

Across **162** existing 60-second synthetic A44/A50 physics executions, **81** matched same-grid comparisons and all **75** original A53 connected components, the test reproduces **110** actual changed-rider brake observations from A56. Only **67** have a recorded warning *before* the critical first-divergence substep, so only those 67 are eligible for an early checkpoint intervention. The remaining **43** have no earlier warning and receive **no invented preemptive action**.

| True physical quantum | Prior-warning interventions | Completed full 10s without collision | Contact with a frozen A44 rider | W-prime ledger failure |
|---|---:|---:|---:|---:|
| 0.5 seconds | **40** | **12** | **28** | **0** |
| 2 seconds (single targeted case) | **0** | 0 | 0 | 0 |
| 2.5 seconds | **27** | **17** | **10** | **0** |
| **Total** | **67** | **29** | **38** | **0** |

The **29** successful trajectories span ten actual physical seconds and reach their originally targeted critical time without a collision with *frozen A44 obstacles*. They are real state-dependent, velocity-bounded, W-prime-accounted shadow movements and are fundamentally stronger evidence than A56’s estimated warning lead. The **38** blocked trajectories are physically relevant failures: reducing one cyclist's speed can introduce new contact with another rider that originally moved around the situation; the full A44 environment **does not react** to the changed cyclist.

This is **not** 29 newly passing full 32-rider races. The unmodified A44 riders may themselves have unbounded accepted speeds, the source command policy does not use the new braking warning, and the new state has not yet been jointly integrated with the whole field.

### Four historical source spotlights

- **Baseline 5m, 8 riders, v1 — original source at 51.0s:** r004 receives its prior warning at **44.5s**, with optimistic lead 2.418s. Actual ordinary braking from that A44 checkpoint becomes blocked by another frozen rider at **48.828125s**, before the historical event.
- **Wide 6.5m, 8 riders, v1 — source at 51.5s:** r004 receives the prior warning at **44.5s**, with optimistic lead 2.358s; the frozen-traffic brake replay is blocked at **48.828125s**.
- **Cautious 5m, 32 riders, v0 — source at 22.5s:** r030 has prior warning at **15s** with optimistic lead 2.351s; actual brake intervention becomes blocked by frozen rider motion at **16.71875s**.
- **Cautious 5m, 32 riders, v1 — source at 22s:** r002/r014 individually have earlier warnings at **14s** and both complete the ten-second horizon without frozen-rider contact. r024 receives a prior warning at **18s** but collides at **21.3125s**. They are three independent, non-coupled interventions; combining them has not been verified.

The first actual A44-vs-A50 accepted trajectory differences occur at **32.5s**, **13.5s**, **22.5s** and **14s** respectively in these fixtures, so source-event spotlights and original first-divergence replay populations are distinct.

## Outcome and explicit limitations

**A57 actual prior physical starting state, continuous ordinary braking, independent full-field frozen-obstacle swept safety, W-prime accounting, reproducible ten-second shadow progression and synthetic left/right/ID metamorphic controls PASS technically.**

**No whole-peloton physical or sporting GO.** Frozen A44 neighbors do not respond, some may themselves retain unphysical terminal-speed assignments, and a pass does not certify a race's position ranking, power fairness, 106/168 rider fields, or sourced stage geography. No live A34 research policy or production racing code is activated.

**A58 focus:** add a bounded, *mutually coupled* anticipatory response within original connected contact groups. Start all potentially affected riders at valid prior checkpoints, respond to same-corridor braking/steering without unbounded velocity reassignment, and check all moving riders and connected dependency growth across ten seconds. Fail closed on unresolved collisions. Test both the 29 frozen-obstacle successes and the 38 blocked cases against a common reference with deterministic replay. Full competition calibration, road geometry and 106/168 rider stage fields remain unresolved.

**A2 physical and sporting NO-GO. Milestones B and C NOT STARTED. No live race, player payout, Supabase, historical results or game-clock changes.**
