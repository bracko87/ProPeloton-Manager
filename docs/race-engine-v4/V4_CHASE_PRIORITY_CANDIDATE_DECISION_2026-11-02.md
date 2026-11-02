# V4 phase-2 explicit-chase priority: research acceptance record — 2026-11-02

**Status:** Experimental research candidate, **not approved for production**. Production V2 and normal V4, existing official race results, replay validator, database, payouts and scheduler remain unchanged.

## Problem and mechanism
A matched synthetic 24-race mountain experiment assigned one versus three explicit human chasers. Prior to the candidate, physical phase-2 and phase-3 gap traces were exactly identical across all 12 matched pairs. Direct workforce telemetry proved the reason: automatic role-eligible helpers replace explicitly ordered riders in the total chase-worker tally. For one 200 km fixture, the phase-2 distribution was 3 explicitly chasing + 4 other helpers versus 5 explicitly chasing + 2 helpers, **seven total in both**. Early chase-capacity calculations therefore largely ignored the additional explicit orders.

The research-only phase-2 candidate applies a bounded pace multiplier:
`1 + 0.012 * (explicitlyChasingWorkers / eligibleChaseWorkers) * phase2WorkerEnergyFraction`
for a mountain stage with an active gap. The maximum additional pace is 1.2%; the gain falls with worker energy. No target gap, catch kilometre, group merge or replay acceptance is inserted. Phase 3 and phase 4 do not receive this specific multiplier.

## Controlled empirical results (previous pre-refactor implementation)
In [CI run 41458653495](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41458653495), the 24 matched research mountain races (170, 200 and 240 km, four seeds each, one/three chasers) passed **24/24 strict replays**. The three-chaser pursuit produced a lower phase-2 gap in 10 of 12 pairs; the other two pairs were already caught within phase 2, and both had zero end gap.

| Mountain stage | Median peak-gap reduction, 3 vs 1 chasers | Median earlier neutralization distance |
| --- | ---: | ---: |
| 170 km | 11.77 seconds | 1.98 km |
| 200 km | 11.93 seconds | 1.56 km |
| 240 km | 11.21 seconds | 2.00 km |

These figures are **synthetic medians**, not historical cycling benchmarks. Extra pursuit also reduced pursuing-team energy on the tested fixture. The candidate is not guaranteed to improve every stage or produce escape survival; normal physiological and tactical variation is intended.

## Wider reproducibility and survival evidence
[CI run 41459563023](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41459563023) passed **all 23 GitHub jobs**, including candidate replays **192/192** for flat/hilly/mountain at 120/220 km and **96/96** mountain 170/200/240 km stress cases. No strict V4 replay failures, no official writes.

**Important correction:** the correct survival field is `v4Survived`, not `v4Survivals`. The 192 mixed-terrain scenarios had **104 accepted opening breakaways** and **60 survived to the finish**, concentrated in shorter races and flat 220 km without chasing. In the separate 96 mountain stress cases, **24 accepted openings** were recorded and **zero survived**, with limited paired opening samples. These statements are descriptive of the synthetic cohort, not proof of realistic rates. The 220 km flat cohort illustrates the strong activation threshold: 4/4 opening breaks survived with zero assigned chasers, 0/4 with one or more. Such threshold effects still require wider validation.

## Typed research implementation
Commit [2fe7b0e](https://github.com/bracko87/ProPeloton-Manager/commit/2fe7b0e0ecbe26b94e43a533216fe2674dd25556) moved the mathematical multiplier to `src/race-engine-v4/phase2ChasePriorityV4.ts`. It is loaded **only by the optional isolated V4 esbuild source transform**, not production. A typed-module unit test verifies parameter bounds. The follow-up automated test adds exhaustive exact numerical parity with the earlier inline expression, plus stronger controlled chase-direction acceptance.

## Release decision / remaining gates
1. **Refactor CI:** all refactored 24 and 288 candidate replays must pass with no new strict errors and no unintended changed findings. A passing unit test does not substitute for this.
2. **Realistic response:** larger independent paired samples of chaser count, chaser quality, available energy, race profile and chase timing; avoid over-binary single-chaser activation. Check measured speeds and energy.
3. **Historical provenance:** compare against privately held intact locked historical races with verified team ownership and eligible source provenance; never upload private snapshots to GitHub or print identifiers. Known saved race lock instants cannot retroactively prove the exact three-hour cutoff.
4. **Production gate:** deliberate separate review, rollout safeguards and explicit approval before changing normal V4; production V2 is out of scope.

No candidate has been promoted to the live game by these tests.
