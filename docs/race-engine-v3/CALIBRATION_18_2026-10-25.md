# Race Engine V3 — Integrated physics milestone (Batch 18)

**25 October 2026 | engineering integrity: PASS | sporting realism: FAIL | production activation: NONE**

## Architectural progress

For the first time the isolated research stack has a **single authoritative simulation tick** combining the previously independent V3 modules:

1. Source-gated rider skills, stamina, fatigue and preparation to provisional sustained mechanical watts.
2. Wind/gradient and *actual wheel-location* drafting into individual power-to-speed estimates.
3. Tactical attacks/chases/recovery with no phantom chase boost when there is no rider group ahead.
4. Finite-lane physical movement, overtaking and wheel clearance into **achieved** rather than requested speed.
5. Energy reserve debited only from **actual mechanical work at the achieved speed** (rather than the energy required for a blocked request).
6. Continuous power availability with depletion (no old binary 13% energy cliff).
7. Deterministic finish interpolation and persistent replay/group-history checkpoints originating in the same physical state.

All of the above is contained in **`src/race-engine-v3/coupledRoadRaceResearchV3.ts`**, entirely independent of the pre-existing Baseline, Mountain V2, Breakaway V1, the original research engine and the production engine selector. Input gates require explicit `offlineOnly: true` and `acknowledgedNoSportingApproval: true`. Outputs hard-code `sportingApproval: NOT_APPROVED` and `officialWrites: 0`. No official stage results or game tables were written.

### Validation

- Node 22 / TypeScript 5.8: strict typecheck of **all isolated V3 modules passed**.
- **30 older relevant research tests passed**, zero failures; three private-dependent/audit runners were skipped because the protected individual supplement was not present in this local test workspace.
- New 3-km coupled integration tests with both full-size rosters (106 and 168 riders): PASS, including group-history and replay timestamp alignment, one unique assignment per rider, no invalid energy, corrupted-checkpoint rejection, and exact serialized checkpoint resumption.
- Targeted work/energy test: confirms the mechanical work charged matches the watt demand at **the speed actually achieved**, actual acceleration consumes power reserve, and chasing without a real forward gap creates no extra power.
- **Full-length 118.5-km Dordrecht and 165.8-km Guangxi offline tests: both fully completed**. Each reproduced its complete race result, event timeline and physical replay bit-identically after repeated serialized interruptions: **36** and **45** checkpoint batches respectively.
- New full-roster and achieved-work checks are registered in the dedicated V3 GitHub Actions workflow. **Remote CI success and full website production build have not been independently verified.** The local package does not contain the full web app/repo dependency tree.

### Sporting realism: hard failure

| Research-only benchmark | Dordrecht (118.5 km) | Guangxi (165.8 km) |
|---|---:|---:|
| De-identified riders | 106 | 168 |
| Fully finish | 106 | 168 |
| Recorded physical passes | 324 | 710 |
| Attack attempts | 15 | 0 (frozen orders unavailable) |
| Distinct physical finish-gap values | 106 | 168 |
| Final rider gap | **+2,694.469 s (44m54s)** | **+2,001.083 s (33m21s)** |
| Wheel-limited rider-steps | 66,928 | 145,773 |
| Approximate blocked share of rider-ticks | 45.0% | 48.7% |
| Sporting gate | **FAIL** | **FAIL** |

These tests used **explicit synthetic stand-ins** for incomplete source attributes, and Guangxi's altitude profile still lacks **718 m** of declared climbing. Therefore, finish-gap numbers are *diagnostic outputs*, not true source-complete predictions. A separate private actual-source Dordrecht supplement was not used in this batch.

The model now *moves riders*, but its current lane clearance/pack shelter combination induces extreme attrition and overblocking. The large tail gaps and widespread wheel-limited steps block any promotion. Removing the old identical-coordinate finish artifact is **not itself** proof of believable race behavior. Overtaking counts are not a target that can be tuned independently of actual energy and drafting.

## Next tightly scoped sporting problem

Use the authoritative per-tick measurements now available to profile **wheel-blocking duration, lane-entry reservations and resulting energy/draft changes**, then implement a physically valid, time-continuous merge trajectory that does not teleport cyclists or repeatedly stall the middle/rear of a peloton. Re-run flat, mountain, attack/chase scenarios and independent measured physics calibration; accept nothing that merely imposes preselected gaps, scripted riders/groups or times. The mountain source-geometry deficit must be addressed separately.

## Safety and development status

All Batch 18 code, tests and CI configuration are in the isolated V3 namespace / dedicated V3 workflow. The production game remains explicitly excluded. No live race UI, 12-sector server control, official V3 publishing or game-clock restart is authorized as a consequence of this milestone. Remote GitHub Actions/Netlify outcomes are separate verification gates.

The production clock should remain held at the authoritative Season 1 20 October 06:38 with both pause flags set and the saved multiplier at 12× until a separately authorized 2× reconciliation/restart.

**Decision: unified physical tick and deterministic full-length race-engine integrity milestone complete. The sporting-acceptance and production-readiness gates remain CLOSED.**
