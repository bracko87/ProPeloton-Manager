from pathlib import Path

path = Path('src/universal-race-engine/runRaceEngine.ts')
text = path.read_text()

old = '''  const phase3GcThreatTeamIds = getGcThreatChasingTeamIds(
    input,
    physicalEscapeRiderIds,
  ).filter((teamId) => !physicalEscapeTeamIds.has(teamId))
  const phase3AutomaticFinishInterestTeamIds =
    explicitPhase3ChasingTeamIds.length > 0
      ? []
      : getAutomaticLateFinishInterestTeamIds(
          input,
          riderSuitability,
          roadCommandResolution,
          physicalEscapeRiderIds,
        ).filter((teamId) => !physicalEscapeTeamIds.has(teamId))
'''
new = '''  const phase3ExplicitNonChasingTeamIds = new Set(
    phase3Rows
      .filter(
        ({ row, phase }) =>
          !physicalEscapeTeamIds.has(row.teamId) &&
          phase.resolvedSource === 'explicit_individual_command' &&
          phase.behaviour !== 'chase',
      )
      .map(({ row }) => row.teamId),
  )
  const phase3GcThreatTeamIds = getGcThreatChasingTeamIds(
    input,
    physicalEscapeRiderIds,
  ).filter(
    (teamId) =>
      !physicalEscapeTeamIds.has(teamId) &&
      !phase3ExplicitNonChasingTeamIds.has(teamId),
  )
  const phase3AutomaticFinishInterestTeamIds =
    explicitPhase3ChasingTeamIds.length > 0
      ? []
      : getAutomaticLateFinishInterestTeamIds(
          input,
          riderSuitability,
          roadCommandResolution,
          physicalEscapeRiderIds,
        ).filter(
          (teamId) =>
            !physicalEscapeTeamIds.has(teamId) &&
            !phase3ExplicitNonChasingTeamIds.has(teamId),
        )
'''
if text.count(old) != 1:
    raise SystemExit(f'Expected one Phase 3 automatic-chase block, found {text.count(old)}')
text = text.replace(old, new, 1)
path.write_text(text)
