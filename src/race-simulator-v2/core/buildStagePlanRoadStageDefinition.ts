/**
 * buildStagePlanRoadStageDefinition.ts
 *
 * Read-only bridge from the live race field and saved Stage Plans into the
 * accepted B1 road-stage definition contract.
 *
 * This file does not add rider-attribute specialisation. Until the dedicated
 * B2 rider-attribute milestone is implemented, each real rider receives a
 * neutral attribute bridge based on the available overall snapshot and a
 * fixed starting freshness. Real rider identity, team membership and saved
 * tactical commands are preserved.
 */

import type {
  B1RoadStageSimulationDefinition,
} from './runB1RoadStageSimulation'
import type {
  BreakawayOutcome,
} from './breakawayOutcomeCheckpointSequence'
import type {
  RiderInput,
} from '../types/rider'

const DEFAULT_INTERVAL_SECONDS = 600
const DEFAULT_OVERALL = 70
const NEUTRAL_STARTING_FRESHNESS = 90
const NO_ATTACK_CHECKPOINT_INDEX = Number.MAX_SAFE_INTEGER
const ATTACK_COMMANDS = new Set(['attack', 'join_breakaway'])
const CHASE_COMMANDS = new Set(['chase_breakaway', 'control_tempo'])
const CHASE_ROLES = new Set(['breakaway_chaser'])
const CHASE_TEAM_TACTICS = new Set(['aggressive', 'sprint_control'])

export type StagePlanJsonRecord = Readonly<Record<string, unknown>>

export interface StagePlanSimulationRiderSource {
  readonly riderId: string
  readonly displayName: string
  readonly teamId: string
  readonly teamName?: string | null
  readonly overall?: number | null
}

export interface StagePlanSimulationPlanSource {
  readonly planId: string
  readonly teamId: string
  readonly status?: string | null
  readonly teamTacticJson?: unknown
  readonly riderRolesJson?: unknown
  readonly riderIndividualTacticsJson?: unknown
}

export interface BuildStagePlanRoadStageDefinitionInput {
  readonly stageId: string
  readonly raceId: string
  readonly distanceKm: number
  readonly riders: readonly StagePlanSimulationRiderSource[]
  readonly stagePlans: readonly StagePlanSimulationPlanSource[]
  readonly intervalSeconds?: number
}

export interface StagePlanTacticalSummary {
  readonly inputMode: 'real_stage_orders'
  readonly fieldRiderCount: number
  readonly visibleStagePlanCount: number
  readonly visibleTeamCount: number
  readonly attackEnabled: boolean
  readonly attackerRiderIds: readonly string[]
  readonly attackerTeamIds: readonly string[]
  readonly earliestAttackKm: number | null
  readonly attackCheckpointIndex: number | null
  readonly explicitAttackCommandCount: number
  readonly deferredAttackCommandCount: number
  readonly explicitChaseSignalCount: number
  readonly requestedOutcome: BreakawayOutcome
  readonly teamTacticCodes: readonly string[]
  readonly riderRoleCodes: readonly string[]
  readonly individualCommandCodes: readonly string[]
  readonly neutralAttributeBridge: true
}

export interface BuiltStagePlanRoadStageDefinition {
  readonly definition: B1RoadStageSimulationDefinition
  readonly summary: StagePlanTacticalSummary
}

type AttackInstruction = {
  riderId: string
  teamId: string
  fromKm: number
  toKm: number
  command: string
}

function asRecord(value: unknown): StagePlanJsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as StagePlanJsonRecord)
    : {}
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  )
}

function createNeutralRiderInputs(
  riders: readonly StagePlanSimulationRiderSource[],
): RiderInput[] {
  const seen = new Set<string>()

  return riders.flatMap((source) => {
    const riderId = source.riderId.trim()

    if (!riderId || seen.has(riderId)) return []
    seen.add(riderId)

    const overall = clamp(
      Math.round(toFiniteNumber(source.overall, DEFAULT_OVERALL)),
      30,
      100,
    )

    return [
      {
        riderId,
        displayName: source.displayName.trim() || riderId,
        flat: overall,
        climbing: overall,
        sprint: overall,
        endurance: overall,
        startingFreshness: NEUTRAL_STARTING_FRESHNESS,
      },
    ]
  })
}

function collectPlanCodes(
  plans: readonly StagePlanSimulationPlanSource[],
): {
  teamTacticCodes: string[]
  riderRoleCodes: string[]
  individualCommandCodes: string[]
} {
  const teamTacticCodes: string[] = []
  const riderRoleCodes: string[] = []
  const individualCommandCodes: string[] = []

  for (const plan of plans) {
    const teamTactic = asRecord(plan.teamTacticJson)
    const teamTacticCode = String(teamTactic.plan ?? '').trim()
    if (teamTacticCode) teamTacticCodes.push(teamTacticCode)

    const riderRoles = asRecord(plan.riderRolesJson)
    for (const role of Object.values(riderRoles)) {
      const roleCode = String(role ?? '').trim()
      if (roleCode) riderRoleCodes.push(roleCode)
    }

    const riderTactics = asRecord(plan.riderIndividualTacticsJson)
    for (const riderValue of Object.values(riderTactics)) {
      const phases = asRecord(riderValue)

      for (const phaseValue of Object.values(phases)) {
        const phase = asRecord(phaseValue)
        const command = String(phase.command ?? phaseValue ?? '').trim()
        if (command) individualCommandCodes.push(command)
      }
    }
  }

  return {
    teamTacticCodes: uniqueSorted(teamTacticCodes),
    riderRoleCodes: uniqueSorted(riderRoleCodes),
    individualCommandCodes: uniqueSorted(individualCommandCodes),
  }
}

function collectAttackInstructions(
  riders: readonly StagePlanSimulationRiderSource[],
  plans: readonly StagePlanSimulationPlanSource[],
): AttackInstruction[] {
  const riderById = new Map(
    riders.map((rider) => [rider.riderId, rider] as const),
  )
  const firstInstructionByRiderId = new Map<string, AttackInstruction>()

  for (const plan of plans) {
    const riderTactics = asRecord(plan.riderIndividualTacticsJson)

    for (const [riderId, riderValue] of Object.entries(riderTactics)) {
      const rider = riderById.get(riderId)
      if (!rider) continue

      const phases = asRecord(riderValue)

      for (const phaseValue of Object.values(phases)) {
        const phase = asRecord(phaseValue)
        const command = String(phase.command ?? phaseValue ?? '').trim()

        if (!ATTACK_COMMANDS.has(command)) continue

        const fromKm = Math.max(0, toFiniteNumber(phase.from_km, 0))
        const toKm = Math.max(fromKm, toFiniteNumber(phase.to_km, fromKm))
        const instruction: AttackInstruction = {
          riderId,
          teamId: rider.teamId || plan.teamId,
          fromKm,
          toKm,
          command,
        }
        const current = firstInstructionByRiderId.get(riderId)

        if (
          !current ||
          instruction.fromKm < current.fromKm ||
          (instruction.fromKm === current.fromKm &&
            instruction.toKm < current.toKm)
        ) {
          firstInstructionByRiderId.set(riderId, instruction)
        }
      }
    }
  }

  return Array.from(firstInstructionByRiderId.values()).sort(
    (left, right) =>
      left.fromKm - right.fromKm ||
      left.toKm - right.toKm ||
      left.riderId.localeCompare(right.riderId),
  )
}

function calculateAttackCheckpointIndex({
  attackInstruction,
  riders,
  intervalSeconds,
}: {
  attackInstruction: AttackInstruction
  riders: readonly RiderInput[]
  intervalSeconds: number
}): number {
  const averageFlat =
    riders.reduce((sum, rider) => sum + rider.flat, 0) /
    Math.max(riders.length, 1)
  const expectedPelotonSpeedKmh = 43 + (averageFlat - 60) * 0.12
  const expectedIntervalDistanceKm = Math.max(
    0.1,
    (expectedPelotonSpeedKmh * intervalSeconds) / 3600,
  )
  const targetKm =
    attackInstruction.fromKm +
    Math.max(0, attackInstruction.toKm - attackInstruction.fromKm) * 0.5

  return Math.max(1, Math.ceil(targetKm / expectedIntervalDistanceKm))
}

function countChaseSignals(
  plans: readonly StagePlanSimulationPlanSource[],
): number {
  let signalCount = 0

  for (const plan of plans) {
    const teamTactic = asRecord(plan.teamTacticJson)
    const teamTacticCode = String(teamTactic.plan ?? '').trim()
    if (CHASE_TEAM_TACTICS.has(teamTacticCode)) signalCount += 1

    const roles = asRecord(plan.riderRolesJson)
    for (const role of Object.values(roles)) {
      if (CHASE_ROLES.has(String(role ?? '').trim())) signalCount += 1
    }

    const riderTactics = asRecord(plan.riderIndividualTacticsJson)
    for (const riderValue of Object.values(riderTactics)) {
      const phases = asRecord(riderValue)

      for (const phaseValue of Object.values(phases)) {
        const phase = asRecord(phaseValue)
        const command = String(phase.command ?? phaseValue ?? '').trim()
        if (CHASE_COMMANDS.has(command)) signalCount += 1
      }
    }
  }

  return signalCount
}

/**
 * Build a real-field B1 definition without changing the frozen B1 constants.
 * Explicit attack/join-breakaway commands are the only source of attackers.
 * When no explicit attack exists, the attack checkpoint is placed beyond the
 * simulation safety horizon so the stage remains one peloton.
 */
export function buildStagePlanRoadStageDefinition(
  baseline: B1RoadStageSimulationDefinition,
  input: BuildStagePlanRoadStageDefinitionInput,
): BuiltStagePlanRoadStageDefinition {
  const distanceKm = toFiniteNumber(input.distanceKm, 0)
  if (distanceKm <= 0) throw new Error('Real stage distance must be positive')

  const riders = createNeutralRiderInputs(input.riders)
  if (riders.length === 0) throw new Error('Real stage field has no riders')

  const intervalSeconds = toFiniteNumber(
    input.intervalSeconds,
    DEFAULT_INTERVAL_SECONDS,
  )
  if (intervalSeconds <= 0) {
    throw new Error('Real stage checkpoint interval must be positive')
  }

  const rawAttackInstructions = collectAttackInstructions(
    input.riders,
    input.stagePlans,
  )
  const maximumAttackerCount = Math.max(0, riders.length - 1)
  const earliestRawAttackInstruction = rawAttackInstructions[0] ?? null
  const attackInstructions = earliestRawAttackInstruction
    ? rawAttackInstructions
        .filter(
          (instruction) =>
            Math.abs(
              instruction.fromKm - earliestRawAttackInstruction.fromKm,
            ) <= 0.000001,
        )
        .slice(0, maximumAttackerCount)
    : []
  const attackerRiderIds = attackInstructions.map(
    (instruction) => instruction.riderId,
  )
  const attackEnabled = attackerRiderIds.length > 0
  const earliestAttackInstruction = attackInstructions[0] ?? null
  const attackCheckpointIndex = earliestAttackInstruction
    ? calculateAttackCheckpointIndex({
        attackInstruction: earliestAttackInstruction,
        riders,
        intervalSeconds,
      })
    : NO_ATTACK_CHECKPOINT_INDEX
  const chaseSignalCount = countChaseSignals(input.stagePlans)
  const requestedOutcome: BreakawayOutcome =
    attackEnabled && chaseSignalCount > 0 ? 'caught' : 'survived'
  const codes = collectPlanCodes(input.stagePlans)
  const breakawayGroupId = baseline.controlledAttack.breakawayGroupId
  const pelotonGroupId = baseline.separateGroupMovement.pelotonGroupId
  const cooperationLevelByGroupId = {
    [breakawayGroupId]:
      baseline.groupCooperation.cooperationLevelByGroupId[breakawayGroupId],
    [pelotonGroupId]:
      baseline.groupCooperation.cooperationLevelByGroupId[pelotonGroupId],
  }

  const definition: B1RoadStageSimulationDefinition = {
    config: {
      seed: [
        baseline.config.seed,
        input.raceId,
        input.stageId,
        ...riders.map((rider) => rider.riderId),
      ].join(':'),
    },
    stage: {
      stageId: input.stageId,
      raceId: input.raceId,
      distanceKm,
      profilePoints: [
        { km: 0, elevationM: 0 },
        { km: distanceKm, elevationM: 0 },
      ],
    },
    riders,
    controlledAttack: {
      ...baseline.controlledAttack,
      attackCheckpointIndex,
      attackerRiderIds,
    },
    separateGroupMovement: {
      ...baseline.separateGroupMovement,
      splitCheckpointIndex: attackCheckpointIndex,
    },
    groupCooperation: {
      ...baseline.groupCooperation,
      splitCheckpointIndex: attackCheckpointIndex,
      cooperationLevelByGroupId,
    },
    energyModel: {
      ...baseline.energyModel,
      attackCheckpointIndex,
      attackerRiderIds,
      cooperationLevelByGroupId,
    },
    lateStageChase: {
      ...baseline.lateStageChase,
      cooperationLevelByGroupId,
    },
    breakawayCatchScenario: {
      ...baseline.breakawayCatchScenario,
      cooperationLevelByGroupId,
    },
    breakawaySurvivalScenario: {
      ...baseline.breakawaySurvivalScenario,
      cooperationLevelByGroupId,
    },
    finalResultModel: {
      ...baseline.finalResultModel,
      tieBreakAttributeOrder: [
        ...baseline.finalResultModel.tieBreakAttributeOrder,
      ],
    },
  }

  return {
    definition,
    summary: {
      inputMode: 'real_stage_orders',
      fieldRiderCount: riders.length,
      visibleStagePlanCount: input.stagePlans.length,
      visibleTeamCount: new Set(input.stagePlans.map((plan) => plan.teamId)).size,
      attackEnabled,
      attackerRiderIds,
      attackerTeamIds: uniqueSorted(
        attackInstructions.map((instruction) => instruction.teamId),
      ),
      earliestAttackKm: earliestAttackInstruction
        ? earliestAttackInstruction.fromKm +
          Math.max(
            0,
            earliestAttackInstruction.toKm - earliestAttackInstruction.fromKm,
          ) *
            0.5
        : null,
      attackCheckpointIndex: attackEnabled ? attackCheckpointIndex : null,
      explicitAttackCommandCount: rawAttackInstructions.length,
      deferredAttackCommandCount:
        rawAttackInstructions.length - attackInstructions.length,
      explicitChaseSignalCount: chaseSignalCount,
      requestedOutcome,
      teamTacticCodes: codes.teamTacticCodes,
      riderRoleCodes: codes.riderRoleCodes,
      individualCommandCodes: codes.individualCommandCodes,
      neutralAttributeBridge: true,
    },
  }
}
