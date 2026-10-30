# Race Engine V4 — isolated template-first AI planning

October 30, 2026. OWNER-REQUESTED PARALLEL FOUNDATION ONLY. NOT LIVE.

## Goal

Reuse the existing V2 physics, replay, input format, race data and the original 80 road scenario templates, but choose the AI strategy template BEFORE calculating the race, using the locked stage snapshot. Human rider commands are never supplied or overwritten by AI templates. AI riders and human riders ultimately share one physical calculation and one official result/replay; that final execution path is NOT implemented in this initial milestone.

## This milestone

Pure independent module: src/race-engine-v4/templateFirstPlannerV4.ts

Unit tests: src/race-engine-v4/templateFirstPlannerV4.test.ts

Dedicated CI: .github/workflows/v4-template-first-research.yml

Uses the original FLAT, HILLY, MOUNTAIN, COBBLED scenario catalog arrays, 20 each. No duplicate template definitions, changes to their V2 implementation, or edits to production selectors. Checks immutable lock proof with a three-game-hour lead time; requires one explicit trusted ownership classification per stage team. Uses only stage/course context, a fixed seeded chooser and history penalties. It does not run a preliminary physical race.

All-human stage: return the exact original canonical input unchanged, no template, no extra attack commands. Mixed and all-AI stages: select one eligible terrain template and generate AI-only attack/breakaway/control/chase/finish commands. Human plan objects and all their existing phase commands are preserved exactly, including default follow-team-plan. The returned combinedInput holds BOTH human instructions and AI instructions for the eventual one physical calculation.

The template gap and catch-target ranges are intentions, NOT forced results. V4 cannot directly assign a breakaway gap, finish place, rider group, catch location, race time, winner or official result.

The initial lightweight course/roster proxy metrics are research heuristics and must be enhanced with real locked roster and weather features before production use. The original seven-second breakaway physics issue remains unresolved.

## Safety restrictions

No V4 imports in App.tsx, Netlify routes, live Edge workers or race dispatcher. No Supabase migration, API call, deployment change, new cron or DB write. The production V2 official engine remains active. This module creates a plan only, no V2 solver call and no production result. The test with simultaneous human and AI attacks demonstrates that both commands exist in the SAME prospective calculation input; actual shared breakaway group movement is NOT claimed yet.

Next: read-only locked snapshot adapter; isolated execution using existing production solver; compare synthetic and historical race outcomes and replays. Only then propose an allowlisted shadow testing mode in production. Promotion to V4 official requires separate approval and an atomic stage-scoped engine selection with V2 rollback.

The standard preexisting race-engine validation workflow must remain intact.
