import {
  buildProductionUniversalRaceEngineInput as buildBaseProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources as BaseProductionUniversalRaceSources,
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
  BaseProductionUniversalRaceSources,
  'scenarioHistory'
> & {
  readonly scenarioHistory?: readonly ScenarioHistoryEntryV1[]
}

// Compatibility aliases let the existing authoritative Edge runner swap this
// adapter in without changing its buildSources() contract.
export type ProductionUniversalRaceSources = ScenarioProductionUniversalRaceSources

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
      family: family as FlatScenarioHistoryEntryV1['family'],
      status: text(row.status) ?? `history_${index}`,
    }]
  })
}

function rawScenarioHistory(sources: ScenarioProductionUniversalRaceSources): ScenarioHistoryEntryV1[] {
  if (sources.scenarioHistory) return [...sources.scenarioHistory]
  const phase9 = object(sources.phase9Payload)
  return parseScenarioHistory(phase9.scenario_history ?? phase9.scenarioHistory)
}

function scenarioSelectionHistory(
  sources: ScenarioProductionUniversalRaceSources,
  gameDate: string | null,
): ScenarioHistoryEntryV1[] {
  const history = rawScenarioHistory(sources)
  const raceId = text((sources.race as Row).id)
  if (!raceId || !gameDate) return history

  // Same-day exact-template avoidance is intentionally upgraded to the same
  // hard guard used for an already-used template in this stage race. Guards are
  // placed before true race history and use a sentinel family so they do not
  // pretend that a different race's scenario family was used in this race.
  const sameDayGuards = history
    .filter((entry) => entry.gameDate === gameDate && entry.raceId !== raceId)
    .map((entry, index) => ({
      ...entry,
      raceId,
      stageId: `same-day-guard:${index}:${entry.stageId}`,
      family: '__same_day_exact_guard__' as FlatScenarioHistoryEntryV1['family'],
    }))

  return [...sameDayGuards, ...history]
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
    sources as BaseProductionUniversalRaceSources,
  )
  const aiTeamIds = scenarioAiControlledTeamIds(sources)
  const marked = withScenarioAiMetadata(base, aiTeamIds)
  const normalized = resetGeneratedAiCommands(marked, aiTeamIds)
  const humanRows = humanPhaseCommandRows(sources.phaseCommandRows as readonly Row[], aiTeamIds)
  const gameDate = gameDateFromSources(sources)
  const history = scenarioSelectionHistory(sources, gameDate)

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

export const buildProductionUniversalRaceEngineInput = buildScenarioProductionUniversalRaceEngineInput

export function getRoadScenarioAuditV1(
  input: UniversalRaceEngineInput,
): JsonRecord | null {
  const audit = getFlatScenarioAuditV1(input) ?? getHillyScenarioAuditV1(input)
  if (!audit) return null
  return object(audit)
}

export function getScenarioAiControlledTeamIdsForProductionV1(
  sources: ScenarioProductionUniversalRaceSources,
): readonly string[] {
  return [...scenarioAiControlledTeamIds(sources)].sort()
}
