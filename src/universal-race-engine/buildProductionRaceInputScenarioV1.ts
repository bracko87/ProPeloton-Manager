import {
  buildProductionUniversalRaceEngineInput as buildBaseProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from './buildProductionRaceInput.ts'
import {
  applyFlatScenarioV1,
  getFlatScenarioAuditV1,
  type FlatScenarioHistoryEntryV1,
} from './flatScenarioV1.ts'
import {
  applyHillyScenarioV1,
  getHillyScenarioAuditV1,
  type HillyScenarioHistoryEntryV1,
} from './hillyScenarioV1.ts'
import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

type Row = Record<string, unknown>
type JsonRecord = Record<string, unknown>

type ScenarioHistoryEntryV1 = FlatScenarioHistoryEntryV1 | HillyScenarioHistoryEntryV1

export type ScenarioProductionUniversalRaceSources = Omit<
  ProductionUniversalRaceSources,
  'scenarioHistory'
> & {
  readonly scenarioHistory?: readonly ScenarioHistoryEntryV1[]
}

export interface RoadScenarioReservationAuditV1 extends JsonRecord {
  readonly scenarioType: 'flat' | 'hilly'
  readonly templateId: string
  readonly templateFamily: string
  readonly catalogVersion: string
  readonly selectionSeed: string
  readonly repeatAllowedRace: boolean
  readonly repeatAllowedDay: boolean
}

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

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(object) : []
}

function participantTeamId(row: Row): string | null {
  return text(row.participating_club_id ?? row.club_id ?? row.team_id)
}

function scenarioAiControlledTeamIds(sources: ScenarioProductionUniversalRaceSources): ReadonlySet<string> {
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

function resetGeneratedAiCommands(
  input: UniversalRaceEngineInput,
  aiTeamIds: ReadonlySet<string>,
): UniversalRaceEngineInput {
  return {
    ...input,
    stagePlans: input.stagePlans.map((plan) => {
      if (!aiTeamIds.has(plan.teamId)) return plan
      return {
        ...plan,
        riders: plan.riders.map((rider) => ({
          ...rider,
          commands: {
            phase1: 'follow_team_plan',
            phase2: 'follow_team_plan',
            phase3: 'follow_team_plan',
            phase4: 'follow_team_plan',
          },
        })),
      }
    }),
  }
}

function humanPhaseCommandRows(
  rows: readonly Row[],
  aiTeamIds: ReadonlySet<string>,
): readonly Row[] {
  return rows.filter((row) => {
    const teamId = text(row.team_id)
    return !teamId || !aiTeamIds.has(teamId)
  })
}

function gameDateFromSources(sources: ScenarioProductionUniversalRaceSources): string | null {
  const stage = sources.stage as Row
  const race = sources.race as Row
  return text(stage.stage_date ?? race.start_date)
}

function normalizedReservationAudit(auditValue: unknown): RoadScenarioReservationAuditV1 | null {
  const audit = object(auditValue)
  const scenarioType = text(audit.scenarioType)
  const templateId = text(audit.templateId)
  const templateFamily = text(audit.templateFamily)
  const catalogVersion = text(audit.catalogVersion)
  const selectionSeed = text(audit.selectionSeed)
  if (
    (scenarioType !== 'flat' && scenarioType !== 'hilly') ||
    !templateId || !templateFamily || !catalogVersion || !selectionSeed
  ) return null

  const context = object(audit.contextSnapshot)
  const history = object(context.history)
  const usedRace = new Set(rows(history.templatesUsedThisRace).length > 0
    ? rows(history.templatesUsedThisRace).map((row) => String(row))
    : Array.isArray(history.templatesUsedThisRace)
      ? history.templatesUsedThisRace.map(String)
      : [])
  const usedDay = new Set(Array.isArray(history.templatesUsedToday)
    ? history.templatesUsedToday.map(String)
    : [])
  const candidateScores = rows(audit.candidateScores)
  const compatibleIds = candidateScores
    .filter((candidate) => Number(candidate.rawScore) >= 42)
    .map((candidate) => text(candidate.templateId))
    .filter((value): value is string => Boolean(value))

  const computedRepeatAllowedRace = compatibleIds.length > 0 && compatibleIds.every((id) => usedRace.has(id))
  const computedRepeatAllowedDay = compatibleIds.length > 0 && compatibleIds.every((id) => usedDay.has(id))

  return {
    ...audit,
    scenarioType,
    templateId,
    templateFamily,
    catalogVersion,
    selectionSeed,
    repeatAllowedRace: typeof audit.repeatAllowedRace === 'boolean'
      ? audit.repeatAllowedRace
      : computedRepeatAllowedRace,
    repeatAllowedDay: typeof audit.repeatAllowedDay === 'boolean'
      ? audit.repeatAllowedDay
      : computedRepeatAllowedDay,
    repetitionPenalties: Object.keys(object(audit.repetitionPenalties)).length > 0
      ? object(audit.repetitionPenalties)
      : {
          exactTemplateSameRace: -45,
          sameFamilyPreviousComparableStage: -20,
          exactTemplateSameDay: -30,
          sameFamilySameDayPerUse: -5,
          sameFamilySameDayCap: -15,
        },
  }
}

/**
 * Scenario-aware production adapter.
 *
 * The existing production adapter remains the canonical source normalizer. This
 * wrapper only adds hidden deterministic road-scenario direction after the
 * canonical input has been built. AI-generated phase commands are reset before
 * scenario direction so they do not masquerade as player instructions. Human
 * phase commands remain immutable inputs to the scenario director.
 */
export function buildScenarioProductionUniversalRaceEngineInput(
  sources: ScenarioProductionUniversalRaceSources,
): UniversalRaceEngineInput {
  const base = buildBaseProductionUniversalRaceEngineInput(
    sources as ProductionUniversalRaceSources,
  )
  const aiTeamIds = scenarioAiControlledTeamIds(sources)
  const marked = withScenarioAiMetadata(base, aiTeamIds)
  const normalized = resetGeneratedAiCommands(marked, aiTeamIds)
  const humanRows = humanPhaseCommandRows(sources.phaseCommandRows as readonly Row[], aiTeamIds)
  const gameDate = gameDateFromSources(sources)
  const history = sources.scenarioHistory ?? []

  if (normalized.stage.stageFormat !== 'road_race') return normalized

  if (normalized.stage.terrainType === 'flat') {
    return applyFlatScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('flat_')) as readonly FlatScenarioHistoryEntryV1[],
    }).input
  }

  if (normalized.stage.terrainType === 'hilly') {
    return applyHillyScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('hilly_')) as readonly HillyScenarioHistoryEntryV1[],
    }).input
  }

  return normalized
}

export function getRoadScenarioAuditForReservationV1(
  input: UniversalRaceEngineInput,
): RoadScenarioReservationAuditV1 | null {
  return normalizedReservationAudit(
    getFlatScenarioAuditV1(input) ?? getHillyScenarioAuditV1(input),
  )
}

export function getScenarioAiControlledTeamIdsForProductionV1(
  sources: ScenarioProductionUniversalRaceSources,
): readonly string[] {
  return [...scenarioAiControlledTeamIds(sources)].sort()
}
