# V4 research Phase 5 — historical seven-second gap and explicit pursuit sensitivity

2026-10-30. **Research only, no live races recalculated, no V2 changes or Supabase writes.**

## Historical V2 evidence (production SELECT only)

413 completed road-race outputs retain intact inputs and saved results. Of those, 199 saved a \`calibrationSummary.maximumBreakawayGapSeconds\` of **exactly 7.00**. All 199 also saved \`phase1Opening.initialGapSeconds = 7.00\`; 197/199 recorded a physical Phase-1 catch.

The opening \`physicalGapTrajectory\` in **26/199** exact-seven cases records a **higher actual Phase-1 physical sample peak** than 7 seconds, reaching **62.679 seconds** in the largest case. Thus the stored maximum was understated in at least 26 examples, because the original calibration summary includes Phase-1 *initial* gap rather than the full opening trajectory. The historical launch itself is exactly seven for all 199; this concentration also needs a separate historical source-version/launch calculation investigation. Do not assume the entire phenomenon is a reporting-only bug.

The current V2 solver source independently confirms \`buildUniversalRaceCalibrationSummary()\` samples \`phase1.initialGapSeconds\` while not including \`phase1.physicalGapTrajectory\`. This research does not edit that production source or backfill historical saved values.

## New V4 research-only physical diagnostic

\`src/race-engine-v4/breakawayGapDiagnosticsV4.ts\` reads measured physical gap trajectories and reports separate Phase-1, Phase-2 and Phase-4 maxima. It also exposes Phase-2 response mode, explicit chasing-team count, controlling-team count, Phase-4 chase-team counts and catch states. It never changes the gap, energy, team decision, replay validator, classification or result writer.

The original 36-seed 24-rider synthetic V4 AI-planned study has 18 accepted-breakaway cases (31/36 complete with the unmodified replay solver; **36/36 when the validated V4 bridge target mapping is applied**). Across the 18 complete accepted-breakaway cases, median phase maxima are 182.812468, 398.059022 and 715.559713 seconds for Phases 1, 2 and 4, respectively. All 18 had **zero explicit Phase-2 chasing teams**. Their biggest sampled gap was in Phase 4; this particular synthetic maximum is not explained by the historical Phase-1 maximum-reporting issue.

## Controlled chase A/B (new 30-rider scenario)

To prevent a confounding team-ownership effect, the A/B uses 5 teams: 2 AI teams, 2 human teams capable of opening attacks, and 1 separate human team with no Phase-1 attack. The separate non-escaping human team either gives no chase command or explicitly assigns 3 riders to \`chase\` in Phases 2 and 4. Every paired seed uses identical roster, stage, weather, engine seed and AI-generated plans. No gap floors, forced winners or physics alterations.

Measured using the unmodified solver as the base diagnostic (with strict replay exceptions recorded, not hidden):

| Measurement | No explicit chase | Human-team chase |
| --- | ---: | ---: |
| Seeds tested | 36 | 36 |
| Completed with strict replay | 32 | 35 |
| Replay exceptions | 4 | 1 |
| Matched completed breakaway comparisons | 24 | 24 |
| Median maximum gap in those 24 pairs | 670.491867 s | 557.599087 s |
| Physical Phase-2 chasing-team count, median | 0 | 1 |
| Physical Phase-4 explicit chasing-team count, median | 0 | 1 |

The **median per-pair gap reduction was 123.744382 seconds**; all 24 pairs decreased, none increased. Distinguish that paired median from subtracting the two separate group medians.

A first 24-rider A/B had assigned chase commands to the same human teams that fielded opening-escape riders; those teams are legitimately excluded from the Phase-2 chasing coalition. It showed reduced Phase-4 gaps but was **not valid evidence of Phase-2 chase response**. The 30-rider test corrects this confound.

The corrected V4 bridge-replay research bundle has an additional reported chase-sensitivity check; it is not equivalent to testing 106–168 rider fields or genuine historical completed snapshots.

## Safety and next decisions

- Baseline V2 remains unchanged, production engine active and race results intact.
- V4 still requires larger fields, multiple terrains, credible team pursuit selection, staged gap evolution, replay parity, fatigue and real private historical snapshot reruns.
- Do not infer that nine-minute synthetic gaps are categorically impossible; study strategy, field size, route, energy and chase capacity before selecting realism acceptance bands.
- Investigate historical seven-second launch generation separately from the observed calibration under-reporting. Never substitute a fixed target gap for rider-based physics.
