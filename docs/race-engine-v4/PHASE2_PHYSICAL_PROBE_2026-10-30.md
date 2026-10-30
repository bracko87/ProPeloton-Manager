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
