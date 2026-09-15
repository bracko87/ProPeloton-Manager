import {
  buildProductionUniversalRaceEngineInput as buildBaseProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources as BaseProductionUniversalRaceSources,
} from './buildProductionRaceInput.ts'
import {
  runRaceEngine as runCoreRaceEngine,
  type UniversalRaceEngineInput,
} from './runRaceEngine.ts'
import {
  applyRoadScenarioFromPrecalculationV2,
  type PrecalculationScenarioHistoryEntryV2,
} from './roadScenarioPrecalculationV2.ts'

type Row = Record<string, unknown>
type JsonRecord = Record<string, unknown>

export interface ScenarioHistoryEntryV1 extends PrecalculationScenarioHistoryEntryV2 {}

export type ScenarioProductionUniversalRaceSources = Omit<
  BaseProductionUniversalRaceSources,
  'scenarioHistory'
> & {
  readonly scenarioHistory?: readonly ScenarioHistoryEntryV1[]
}

// Compatibility aliases let the existing authoritative Edge runner keep its
// buildSources() contract unchanged.
export type ProductionUniversalRaceSources = ScenarioProductionUniversalRaceSources

const ROAD_SCENARIO_METADATA_KEYS = [
  'flatScenarioV1',
  'hillyScenarioV1',
  'mountainScenarioV1',
  'cobbledScenarioV1',
] as const

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['true', 't', '1', 'yes', 'y'].includes(value.trim().toLowerCase())
  return false
}

function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function participantTeamId(row: Row): string | null {
  return text(row.participating_club_id ?? row.club_id ?? row.team_id)
}

function scenarioAiControlledTeamIds(
  sources: ScenarioProductionUniversalRaceSources,
): ReadonlySet<string> {
  const result = new Set<string>()
  ;(sources.participantTeams as readonly Row[]).forEach((row) => {
    const teamId = participantTeamId(row)
    if (!teamId) return
    const entrySource = text(row.entry_source)?.toLowerCase()
    if (
      booleanValue(row.scenario_ai_controlled) ||
      booleanValue(row.is_ai_filler) ||
      entrySource === 'ai_fill'
    ) {
      result.add(teamId)
    }
  })
  return result
}

function withScenarioAiMetadata(
  input: UniversalRaceEngineInput,
  aiTeamIds: ReadonlySet<string>,
): UniversalRaceEngineInput {
  return {
    ...input,
    teams: input.teams.map((team) => ({
      ...team,
      snapshot: {
        ...team.snapshot,
        metadata: {
          ...team.snapshot.metadata,
          scenarioAiControlled: aiTeamIds.has(team.teamId),
        },
      },
    })),
  }
}

function gameDateFromSources(sources: ScenarioProductionUniversalRaceSources): string {
  const stage = sources.stage as Row
  const race = sources.race as Row
  return text(stage.stage_date ?? race.start_date) ?? 'unknown'
}

function parseScenarioHistory(value: unknown): ScenarioHistoryEntryV1[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => {
    const row = object(entry)
    const raceId = text(row.raceId ?? row.race_id)
    const stageId = text(row.stageId ?? row.stage_id)
    const gameDate = text(row.gameDate ?? row.game_date)
    const templateId = text(row.templateId ?? row.template_id)
    const family = text(row.family ?? row.template_family)
    if (!raceId || !stageId || !gameDate || !templateId || !family) return []
    return [{
      raceId,
      stageId,
      gameDate,
      templateId,
      family,
      status: text(row.status) ?? `history_${index}`,
    }]
  })
}

function rawScenarioHistory(
  sources: ScenarioProductionUniversalRaceSources,
): ScenarioHistoryEntryV1[] {
  if (sources.scenarioHistory) return [...sources.scenarioHistory]
  const phase9 = object(sources.phase9Payload)
  return parseScenarioHistory(phase9.scenario_history ?? phase9.scenarioHistory)
}

/**
 * Two-pass scenario production adapter.
 *
 * Pass 1 is the unmodified canonical race engine calculation. Terrain, riders,
 * preparation, team plans and every rider command are exactly the same inputs
 * they would have been without templates. That hidden result is not published.
 *
 * The closest unused template is then selected from the physical pre-calculation
 * outcome. Pass 2 receives the exact same sporting input plus template metadata
 * for the physical peloton director. No synthetic rider commands or team tactics
 * are injected by the template layer.
 */
export function buildScenarioProductionUniversalRaceEngineInput(
  sources: ScenarioProductionUniversalRaceSources,
): UniversalRaceEngineInput {
  const canonical = buildBaseProductionUniversalRaceEngineInput(
    sources as BaseProductionUniversalRaceSources,
  )
  const input = withScenarioAiMetadata(canonical, scenarioAiControlledTeamIds(sources))

  if (
    input.stage.stageFormat !== 'road_race' ||
    !['flat', 'hilly', 'mountain', 'cobbled'].includes(input.stage.terrainType)
  ) {
    return input
  }

  // This is deliberately the normal engine with no scenario metadata attached.
  // Its result is only used to classify the race shape; it is never persisted as
  // the official sporting result.
  const preCalculation = runCoreRaceEngine(input)
  const selection = applyRoadScenarioFromPrecalculationV2(
    input,
    preCalculation,
    gameDateFromSources(sources),
    rawScenarioHistory(sources),
  )
  return selection.input
}

export const buildProductionUniversalRaceEngineInput =
  buildScenarioProductionUniversalRaceEngineInput

export function getRoadScenarioAuditV1(
  input: UniversalRaceEngineInput,
): JsonRecord | null {
  for (const plan of input.stagePlans) {
    const metadata = object(plan.metadata)
    for (const key of ROAD_SCENARIO_METADATA_KEYS) {
      const audit = object(metadata[key])
      if (
        text(audit.templateId) &&
        text(audit.templateFamily) &&
        text(audit.scenarioType)
      ) {
        return audit
      }
    }
  }
  return null
}

export function getScenarioAiControlledTeamIdsForProductionV1(
  sources: ScenarioProductionUniversalRaceSources,
): readonly string[] {
  return [...scenarioAiControlledTeamIds(sources)].sort()
}
