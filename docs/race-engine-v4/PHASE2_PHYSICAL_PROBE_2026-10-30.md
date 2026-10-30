# V4 Phase 2 — in-memory physics probe of preserved V2

Date: October 30, 2026. This is an isolated research milestone, not production integration.

The first Phase 1 V4 template-first module prepares a locked one-stage combined input:
- Human teams retain their precise original frozen commands.
- AI teams get tactical commands selected from the original 80 templates.
- The same combined input contains every rider, team, and phase command.
- The selected template does not pin breakaway gaps or force results.

Phase 2 adds physicalResearchProbeV4.ts, a standalone RESEARCH ONLY function which:
1. Verifies the three-game-hour locked stage input and authoritative team identity through prepareV4ShadowRace.
2. Runs the ALREADY-EXISTING in-memory runRaceEngine() once on that exact combined input; does not call a production dispatcher.
3. Examines actual first-wave attack attempts, accepted escape launches, rider IDs, replay checkpoints and groups, classification, and replay synchronization.
4. Hashes replay and classification outputs to support comparison without persisting them.
5. Returns evidence clearly separating *command given* from *attempt launched*, *escape accepted*, *mixed group shown*. A mixed peloton group alone is not proof of a mixed breakaway.
6. Asserts the source snapshot was not mutated, and performs NO official writes.

The dedicated synthetic test uses the original V2 solver on 24-rider all-human neutral, 24-rider half-AI, and 96-rider half-AI fields. It deliberately does not create independent mock results, write to Supabase, run game cron, change the official race engine selector, or publish scores.

The physical test does NOT yet claim human/AI breakaway merging unless evidence proves both accepted escaped riders appear in the same actual breakaway replay group. The original seven-second gap weakness is not considered resolved just because the engine completes a run.

Development status: new V4 files only. Existing V2 engine code, results, runtime schema, game UI, worker and Netlify routing unchanged.

CI: .github/workflows/v4-physical-readonly-probe.yml. Exact measured evidence will be appended after verification.


## Verified measured results — October 30, 2026

[GitHub Actions initial full solver run 41026922234](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41026922234) and [stricter actual escape group run 41027286812](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41027286812) passed full original in-memory solver and replay tests. This includes the unchanged React production build. Both mixed races selected original Flat Template 03 prior to any calculation. Exact synthetic results:

| Fixture | Count | Real accepted human+AI launches | Opening break | Actual shared B group replay checkpoints | Max observed break gap | Replay synchronized |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| All human, all neutral | 24 | 0+0 | 0 | 0 | 0 s | Yes |
| 2 human + 2 AI teams | 24 | 1+4 | 5 | 59 | 739.863033 s | Yes |
| 8 human + 8 AI teams | 96 | 4+1 | 5 | 39 | 606.166081 s | Yes |

The strict actual shared-breakaway check considers only replay groups with breakaway display code prefix B **AND** a physically accepted human escape rider **AND** a physically accepted AI escape rider. Merely sharing a peloton group is not enough. Both mixed tests satisfy it. The same locked 24-rider mixed input reproduces the identical finish-classification and full checkpoint replay SHA-256 hashes when run again. All synthetic fixtures passed original engine input validation, produced one complete finish classification and had zero reported replay synchronization issues.

IMPORTANT: Maximum gaps of approximately 10 to 12 minutes are observations from these synthetic fixtures, NOT proof of realistic AI chase/catch behavior. We have not yet checked the intended catch timing, 7-second artifact over a large seed/race sample, power balance, fatigue over consecutive days, weather robustness, mountain outcomes or production snapshot equivalence. Old physics may still contain undesirable behavior. The existing engine is preserved exactly; V4 currently only chooses the AI strategy and provides a research-only pure call to the unchanged solver.

Production worker, replay publisher, router, database, schedule and result tables remain untouched. No user-visible live V4 selector and no live production shadow execution exists yet.
