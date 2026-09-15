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
import {
  applyMountainScenarioV1,
  getMountainScenarioAuditV1,
  type MountainScenarioHistoryEntryV1,
} from './mountainScenarioV1.ts'
import {
  applyCobbledScenarioV1,
  getCobbledScenarioAuditV1,
  type CobbledScenarioHistoryEntryV1,
} from './cobbledScenarioV1.ts'
import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

type Row = Record<string, unknown>
type JsonRecord = Record<string, unknown>

export interface ScenarioHistoryEntryV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

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

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
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

const ROAD_SCENARIO_METADATA_KEYS = [
  'flatScenarioV1',
  'hillyScenarioV1',
  'mountainScenarioV1',
  'cobbledScenarioV1',
] as const

/**
 * Phase 1 intentionally blocks a group made only from `join_breakaway`
 * commands: somebody has to launch the move before other riders can join it.
 * Scenario templates historically generated an entire preferred break as
 * joiners, which meant a perfectly valid template could never physically form.
 *
 * Convert one already-selected synthetic joiner into the launch attacker. The
 * rider count does not increase, human commands are untouched, and the normal
 * Phase 1 strength/chase/energy model still decides whether the move succeeds.
 */
function ensureScenarioOpeningBreakInitiator(
  input: UniversalRaceEngineInput,
): UniversalRaceEngineInput {
  const metadataPlanIndex = input.stagePlans.findIndex((plan) => {
    const metadata = object(plan.metadata)
    return ROAD_SCENARIO_METADATA_KEYS.some((key) => Object.keys(object(metadata[key])).length > 0)
  })
  if (metadataPlanIndex < 0) return input

  const metadata = object(input.stagePlans[metadataPlanIndex].metadata)
  const scenarioKey = ROAD_SCENARIO_METADATA_KEYS.find(
    (key) => Object.keys(object(metadata[key])).length > 0,
  )
  if (!scenarioKey) return input

  const audit = object(metadata[scenarioKey])
  const appliedDirectives = object(audit.appliedDirectives)
  const assignments = array(appliedDirectives.commandAssignments).map((value) => object(value))
  const phaseOneAssignments = assignments.filter((assignment) => Number(assignment.phase) === 1)

  if (phaseOneAssignments.some((assignment) => text(assignment.command) === 'attack')) {
    return input
  }

  const joiners = phaseOneAssignments.filter(
    (assignment) => text(assignment.command) === 'join_breakaway' && text(assignment.riderId),
  )
  if (joiners.length === 0) return input

  const riderById = new Map(
    input.stagePlans.flatMap((plan) => plan.riders.map((rider) => [rider.riderId, rider] as const)),
  )
  const rolePriority = (riderId: string): number => {
    const role = text(riderById.get(riderId)?.stageRole)?.toLowerCase() ?? ''
    if (role === 'breakaway_rider') return 0
    if (role === 'free_role') return 1
    if (role.includes('domestique')) return 2
    return 3
  }

  const initiatorAssignment = [...joiners]
    .sort((left, right) => {
      const leftId = text(left.riderId) ?? ''
      const rightId = text(right.riderId) ?? ''
      return rolePriority(leftId) - rolePriority(rightId) || leftId.localeCompare(rightId)
    })
    .find((assignment) => {
      const riderId = text(assignment.riderId)
      if (!riderId) return false
      const rider = riderById.get(riderId)
      return rider?.commands.phase1 === 'join_breakaway'
    })

  const initiatorId = text(initiatorAssignment?.riderId)
  if (!initiatorId) return input

  const updatedAssignments = assignments.map((assignment) => {
    if (
      Number(assignment.phase) !== 1 ||
      text(assignment.riderId) !== initiatorId ||
      text(assignment.command) !== 'join_breakaway'
    ) {
      return assignment
    }
    return {
      ...assignment,
      command: 'attack',
      reason: `${text(assignment.reason) ?? 'road_scenario'}:breakaway_initiator`,
    }
  })

  const updatedAudit = {
    ...audit,
    appliedDirectives: {
      ...appliedDirectives,
      commandAssignments: updatedAssignments,
    },
  }

  return {
    ...input,
    stagePlans: input.stagePlans.map((plan, planIndex) => ({
      ...plan,
      riders: plan.riders.map((rider) => rider.riderId !== initiatorId
        ? rider
        : {
            ...rider,
            commands: {
              ...rider.commands,
              phase1: 'attack',
            },
          }),
      metadata: planIndex !== metadataPlanIndex
        ? plan.metadata
        : {
            ...plan.metadata,
            [scenarioKey]: updatedAudit,
          },
    })),
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
    return [{ raceId, stageId, gameDate, templateId, family, status: text(row.status) ?? `history_${index}` }]
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

  // Same-day exact-template avoidance is upgraded to the same hard guard used
  // inside a stage race. A sentinel family prevents another race's family from
  // being mistaken for this race's family history.
  const sameDayGuards = history
    .filter((entry) => entry.gameDate === gameDate && entry.raceId !== raceId)
    .map((entry, index) => ({
      ...entry,
      raceId,
      stageId: `same-day-guard:${index}:${entry.stageId}`,
      family: '__same_day_exact_guard__',
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
    return ensureScenarioOpeningBreakInitiator(applyFlatScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('flat_')) as readonly FlatScenarioHistoryEntryV1[],
    }).input)
  }

  if (normalized.stage.terrainType === 'hilly') {
    return ensureScenarioOpeningBreakInitiator(applyHillyScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('hilly_')) as readonly HillyScenarioHistoryEntryV1[],
    }).input)
  }

  if (normalized.stage.terrainType === 'mountain') {
    return ensureScenarioOpeningBreakInitiator(applyMountainScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('mountain_')) as readonly MountainScenarioHistoryEntryV1[],
    }).input)
  }

  if (normalized.stage.terrainType === 'cobbled') {
    return ensureScenarioOpeningBreakInitiator(applyCobbledScenarioV1(normalized, {
      gameDate,
      phaseCommandRows: humanRows,
      history: history.filter((entry) => entry.templateId.startsWith('cobbled_')) as readonly CobbledScenarioHistoryEntryV1[],
    }).input)
  }

  return normalized
}

export const buildProductionUniversalRaceEngineInput = buildScenarioProductionUniversalRaceEngineInput

export function getRoadScenarioAuditV1(
  input: UniversalRaceEngineInput,
): JsonRecord | null {
  const audit =
    getFlatScenarioAuditV1(input) ??
    getHillyScenarioAuditV1(input) ??
    getMountainScenarioAuditV1(input) ??
    getCobbledScenarioAuditV1(input)
  if (!audit) return null
  return object(audit)
}

export function getScenarioAiControlledTeamIdsForProductionV1(
  sources: ScenarioProductionUniversalRaceSources,
): readonly string[] {
  return [...scenarioAiControlledTeamIds(sources)].sort()
}
