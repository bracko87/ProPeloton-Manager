/**
 * crashIncidentIntegration.ts
 *
 * Shared deterministic individual/group crash evaluation.
 *
 * Exactly one combined candidate list is evaluated per tick and passed to the
 * canonical deterministic selector. Therefore an individual and group crash
 * cannot both be applied during the same tick.
 */

import type {
  ActiveCrashIncidentKind,
  CrashIncidentRuntimeState,
  SimulationState,
} from '../domain/SimulationState'
import {
  applyGroupCrash,
  type ApplyGroupCrashResult,
} from './applyGroupCrash'
import {
  applyIndividualRiderCrash,
  type ApplyIndividualRiderCrashResult,
} from './applyIndividualRiderCrash'
import {
  createCanonicalHashedValue,
} from './canonicalSerialization'
import type {
  GroupCrashSeverity,
} from './groupCrashOutcome'
import {
  evaluateRaceIncidentRisk,
  selectDeterministicIncidentCandidate,
  type DeterministicIncidentSelection,
  type RaceIncidentRiskResult,
} from './incidentRisk'
import type {
  IndividualCrashSeverity,
} from './individualCrashOutcome'
import type {
  TerrainAwareMultiGroupMovementResult,
} from './terrainAwareMultiGroupMovement'
import {
  calculateWeatherPerformanceEffects,
} from './weatherPerformanceEffects'

export interface CrashIncidentIntegrationOptions {
  readonly globalCooldownSeconds?: number
  readonly riderCooldownSeconds?: number
  readonly maximumIncidentsPerStage?: number
  readonly enabledIncidentKinds?:
    readonly ActiveCrashIncidentKind[]
}

export interface ResolvedCrashIncidentIntegrationOptions {
  readonly globalCooldownSeconds: number
  readonly riderCooldownSeconds: number
  readonly maximumIncidentsPerStage: number
  readonly enabledIncidentKinds:
    readonly ActiveCrashIncidentKind[]
}

export type AppliedCrashIncident =
  | {
      readonly incidentKind:
        'individual_crash'
      readonly result:
        ApplyIndividualRiderCrashResult<SimulationState>
    }
  | {
      readonly incidentKind:
        'group_crash'
      readonly result:
        ApplyGroupCrashResult<SimulationState>
    }

export interface IntegratedCrashIncidentTickResult {
  readonly previousState:
    SimulationState
  readonly state:
    SimulationState

  readonly candidateCountByKind: {
    readonly individualCrash: number
    readonly groupCrash: number
  }

  readonly eligibleCandidateCountByKind: {
    readonly individualCrash: number
    readonly groupCrash: number
  }

  readonly triggeredCandidateCountByKind: {
    readonly individualCrash: number
    readonly groupCrash: number
  }

  readonly stageLimitReached: boolean

  readonly selection:
    DeterministicIncidentSelection
  readonly selectedRisk:
    RaceIncidentRiskResult | null
  readonly selectedIncidentKind:
    ActiveCrashIncidentKind | null
  readonly severity:
    IndividualCrashSeverity | GroupCrashSeverity | null
  readonly application:
    AppliedCrashIncident | null

  readonly runtimeBefore:
    CrashIncidentRuntimeState
  readonly runtimeAfter:
    CrashIncidentRuntimeState
}

const DEFAULT_GLOBAL_COOLDOWN_SECONDS =
  120

const DEFAULT_RIDER_COOLDOWN_SECONDS =
  900

const DEFAULT_MAXIMUM_INCIDENTS_PER_STAGE =
  3

const DEFAULT_ENABLED_INCIDENT_KINDS:
  readonly ActiveCrashIncidentKind[] = [
    'individual_crash',
    'group_crash',
  ]

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `crashIncidentIntegration: ${fieldName} must be a positive integer.`,
    )
  }
}

function canonicalKinds(
  values:
    readonly ActiveCrashIncidentKind[],
): readonly ActiveCrashIncidentKind[] {
  const unique =
    Array.from(
      new Set(values),
    )

  if (
    unique.length ===
    0
  ) {
    throw new Error(
      'crashIncidentIntegration: enabledIncidentKinds must contain at least one incident kind.',
    )
  }

  for (
    const value of
    unique
  ) {
    if (
      value !==
        'individual_crash' &&
      value !==
        'group_crash'
    ) {
      throw new Error(
        `crashIncidentIntegration: unsupported incident kind ${String(value)}.`,
      )
    }
  }

  return unique.sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )
}

function sortedUnique(
  values:
    readonly string[],
): readonly string[] {
  return Array.from(
    new Set(values),
  ).sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )
}

function average(
  values:
    readonly number[],
): number {
  if (
    values.length ===
    0
  ) {
    return 0
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function probabilityRollFromHash(
  hash: string,
): number {
  const numerator =
    Number.parseInt(
      hash.slice(0, 13),
      16,
    )

  return Number(
    (
      numerator /
      0x10000000000000
    ).toFixed(12),
  )
}

export function resolveCrashIncidentIntegrationOptions(
  options:
    CrashIncidentIntegrationOptions = {},
): ResolvedCrashIncidentIntegrationOptions {
  const resolved = {
    globalCooldownSeconds:
      options
        .globalCooldownSeconds ??
      DEFAULT_GLOBAL_COOLDOWN_SECONDS,

    riderCooldownSeconds:
      options
        .riderCooldownSeconds ??
      DEFAULT_RIDER_COOLDOWN_SECONDS,

    maximumIncidentsPerStage:
      options
        .maximumIncidentsPerStage ??
      DEFAULT_MAXIMUM_INCIDENTS_PER_STAGE,

    enabledIncidentKinds:
      canonicalKinds(
        options
          .enabledIncidentKinds ??
        DEFAULT_ENABLED_INCIDENT_KINDS,
      ),
  }

  assertPositiveInteger(
    resolved.globalCooldownSeconds,
    'globalCooldownSeconds',
  )
  assertPositiveInteger(
    resolved.riderCooldownSeconds,
    'riderCooldownSeconds',
  )
  assertPositiveInteger(
    resolved.maximumIncidentsPerStage,
    'maximumIncidentsPerStage',
  )

  return resolved
}

export function ensureCrashIncidentRuntime(
  state:
    SimulationState,
  options:
    CrashIncidentIntegrationOptions = {},
): SimulationState {
  const resolved =
    resolveCrashIncidentIntegrationOptions(
      options,
    )

  const existing =
    state.crashIncidentRuntime

  if (existing) {
    if (
      existing.globalCooldownSeconds !==
        resolved.globalCooldownSeconds ||
      existing.riderCooldownSeconds !==
        resolved.riderCooldownSeconds ||
      existing.maximumIncidentsPerStage !==
        resolved.maximumIncidentsPerStage ||
      JSON.stringify(
        existing.enabledIncidentKinds,
      ) !==
      JSON.stringify(
        resolved.enabledIncidentKinds,
      )
    ) {
      throw new Error(
        'crashIncidentIntegration: existing runtime configuration does not match requested options.',
      )
    }

    return state
  }

  const cooldownSecondsRemainingByRiderId =
    Object.fromEntries(
      Object.keys(
        state.riders,
      )
        .slice()
        .sort(
          (left, right) =>
            left.localeCompare(
              right,
            ),
        )
        .map(
          (riderId) => [
            riderId,
            0,
          ],
        ),
    )

  return {
    ...state,
    crashIncidentRuntime: {
      enabled: true,

      enabledIncidentKinds:
        resolved
          .enabledIncidentKinds,

      occurrenceIndex: 0,
      incidentCount: 0,
      individualCrashCount: 0,
      groupCrashCount: 0,
      maximumIncidentsPerStage:
        resolved
          .maximumIncidentsPerStage,

      globalCooldownSeconds:
        resolved
          .globalCooldownSeconds,
      riderCooldownSeconds:
        resolved
          .riderCooldownSeconds,

      globalCooldownSecondsRemaining: 0,
      cooldownSecondsRemainingByRiderId,

      affectedRiderIds: [],
    },
  }
}

function advanceRuntime(
  runtime:
    CrashIncidentRuntimeState,
  riderIds:
    readonly string[],
  tickSeconds: number,
): CrashIncidentRuntimeState {
  return {
    ...runtime,

    globalCooldownSecondsRemaining:
      Math.max(
        0,
        runtime
          .globalCooldownSecondsRemaining -
        tickSeconds,
      ),

    cooldownSecondsRemainingByRiderId:
      Object.fromEntries(
        riderIds
          .slice()
          .sort(
            (left, right) =>
              left.localeCompare(
                right,
              ),
          )
          .map(
            (riderId) => [
              riderId,
              Math.max(
                0,
                (
                  runtime
                    .cooldownSecondsRemainingByRiderId[
                      riderId
                    ] ??
                  0
                ) -
                tickSeconds,
              ),
            ],
          ),
      ),
  }
}

function determineSeverity(
  risk:
    RaceIncidentRiskResult,
): IndividualCrashSeverity | GroupCrashSeverity {
  const value =
    createCanonicalHashedValue({
      contract:
        'shared_crash_incident_severity_v1',
      incidentKind:
        risk.incidentKind,
      deterministicKeyHash:
        risk
          .deterministicKeyHash,
      finalProbability:
        risk.finalProbability,
      causes:
        risk.causes,
    })

  const roll =
    probabilityRollFromHash(
      value.hash,
    )

  const maximumProbability =
    risk.incidentKind ===
      'group_crash'
      ? 0.04
      : 0.08

  const probabilityRatio =
    Math.min(
      1,
      risk.finalProbability /
      maximumProbability,
    )

  let seriousProbability =
    risk.incidentKind ===
      'group_crash'
      ? 0.08
      : 0.05

  let moderateProbability =
    risk.incidentKind ===
      'group_crash'
      ? 0.35
      : 0.25

  seriousProbability +=
    probabilityRatio *
    (
      risk.incidentKind ===
        'group_crash'
        ? 0.08
        : 0.05
    )

  moderateProbability +=
    probabilityRatio *
    0.1

  if (
    risk.causes.includes(
      'wet_road',
    ) &&
    risk.causes.includes(
      'descending',
    )
  ) {
    seriousProbability +=
      0.05
    moderateProbability +=
      0.1
  }

  if (
    risk.causes.includes(
      'runtime_fatigue',
    )
  ) {
    seriousProbability +=
      0.03
    moderateProbability +=
      0.07
  }

  if (
    risk.causes.includes(
      'high_speed',
    )
  ) {
    seriousProbability +=
      0.02
    moderateProbability +=
      0.05
  }

  seriousProbability =
    Math.min(
      0.3,
      seriousProbability,
    )

  moderateProbability =
    Math.min(
      0.55,
      moderateProbability,
    )

  if (
    roll <
    seriousProbability
  ) {
    return 'serious'
  }

  if (
    roll <
    seriousProbability +
      moderateProbability
  ) {
    return 'moderate'
  }

  return 'minor'
}

function createProposalMap(
  movement:
    TerrainAwareMultiGroupMovementResult,
): Readonly<
  Record<
    string,
    TerrainAwareMultiGroupMovementResult[
      'movement'
    ][
      'proposals'
    ][number]
  >
> {
  return Object.fromEntries(
    movement
      .movement
      .proposals
      .map(
        (proposal) => [
          proposal.groupId,
          proposal,
        ],
      ),
  )
}

function emptySelection():
  DeterministicIncidentSelection {
  return {
    selected: null,
    triggeredCandidateCount: 0,
    orderedTriggeredEntityIds: [],
  }
}

export function integrateCrashIncidentTick(
  input: {
    readonly state:
      SimulationState
    readonly movement:
      TerrainAwareMultiGroupMovementResult
    readonly options?:
      CrashIncidentIntegrationOptions
  },
): IntegratedCrashIncidentTickResult {
  const configuredState =
    ensureCrashIncidentRuntime(
      input.state,
      input.options,
    )

  const runtimeBefore =
    configuredState
      .crashIncidentRuntime

  if (!runtimeBefore) {
    throw new Error(
      'crashIncidentIntegration: runtime was not attached.',
    )
  }

  const tickSeconds =
    input
      .movement
      .movement
      .tickSeconds

  const elapsedRuntime =
    advanceRuntime(
      runtimeBefore,
      Object.keys(
        configuredState.riders,
      ),
      tickSeconds,
    )

  const elapsedState:
    SimulationState = {
      ...configuredState,
      crashIncidentRuntime:
        elapsedRuntime,
  }

  const stageLimitReached =
    elapsedRuntime.incidentCount >=
    elapsedRuntime
      .maximumIncidentsPerStage

  if (stageLimitReached) {
    return {
      previousState:
        configuredState,
      state:
        elapsedState,

      candidateCountByKind: {
        individualCrash: 0,
        groupCrash: 0,
      },
      eligibleCandidateCountByKind: {
        individualCrash: 0,
        groupCrash: 0,
      },
      triggeredCandidateCountByKind: {
        individualCrash: 0,
        groupCrash: 0,
      },

      stageLimitReached: true,

      selection:
        emptySelection(),
      selectedRisk: null,
      selectedIncidentKind: null,
      severity: null,
      application: null,

      runtimeBefore,
      runtimeAfter:
        elapsedRuntime,
    }
  }

  const enabledKinds =
    new Set(
      elapsedRuntime
        .enabledIncidentKinds,
    )

  const proposalByGroupId =
    createProposalMap(
      input.movement,
    )

  const weatherEffects =
    configuredState
      .weatherPerformanceEffectsEnabled
      ? calculateWeatherPerformanceEffects(
          configuredState
            .input
            .weather,
        )
      : calculateWeatherPerformanceEffects(
          undefined,
        )

  const previouslyAffected =
    new Set(
      elapsedRuntime
        .affectedRiderIds,
    )

  const individualCandidates:
    RaceIncidentRiskResult[] = []

  if (
    enabledKinds.has(
      'individual_crash',
    )
  ) {
    for (
      const rider of
      Object.values(
        elapsedState.riders,
      )
        .slice()
        .sort(
          (left, right) =>
            left.riderId.localeCompare(
              right.riderId,
            ),
        )
    ) {
      if (
        rider.stageStatus !==
          'racing' ||
        previouslyAffected.has(
          rider.riderId,
        )
      ) {
        continue
      }

      const group =
        elapsedState.groups[
          rider.currentGroupId
        ]

      if (
        !group ||
        !group.active ||
        group.groupType ===
          'finished' ||
        group.riderIds.length <=
          1
      ) {
        continue
      }

      const proposal =
        proposalByGroupId[
          group.groupId
        ]

      if (!proposal) {
        throw new Error(
          `crashIncidentIntegration: missing movement proposal for ${group.groupId}.`,
        )
      }

      individualCandidates.push(
        evaluateRaceIncidentRisk({
          raceId:
            elapsedState.raceId,
          stageId:
            elapsedState.stageId,
          seed:
            elapsedState.seed,

          incidentKind:
            'individual_crash',
          occurrenceIndex:
            elapsedRuntime
              .occurrenceIndex,

          raceSecond:
            elapsedState.raceSecond,
          tickSeconds,
          stageDistanceKm:
            elapsedState
              .stageDistanceKm,
          distanceKm:
            group.distanceKm,

          entityId:
            rider.riderId,
          riderId:
            rider.riderId,
          groupId:
            group.groupId,
          stageStatus:
            rider.stageStatus,

          currentSpeedKmh:
            proposal
              .appliedSpeedKmh,
          gradientPercent:
            proposal
              .gradientPercent,
          groupSize:
            group.riderIds.length,

          runtimeFatigue:
            rider.runtimeFatigue ??
            0,
          resistance:
            rider
              .attributes
              .resistance,
          raceIq:
            rider
              .attributes
              .raceIq ??
            50,

          weatherIncidentProbabilityMultiplier:
            weatherEffects
              .incidentProbabilityMultiplier,
          weatherReasons:
            weatherEffects.reasons,

          equipmentCondition:
            null,

          incidentCooldownSecondsRemaining:
            Math.max(
              elapsedRuntime
                .globalCooldownSecondsRemaining,
              elapsedRuntime
                .cooldownSecondsRemainingByRiderId[
                  rider.riderId
                ] ??
                0,
            ),
        }),
      )
    }
  }

  const groupCandidates:
    RaceIncidentRiskResult[] = []

  if (
    enabledKinds.has(
      'group_crash',
    )
  ) {
    for (
      const group of
      Object.values(
        elapsedState.groups,
      )
        .filter(
          (candidate) =>
            candidate.active &&
            candidate.groupType !==
              'finished',
        )
        .slice()
        .sort(
          (left, right) =>
            left.groupId.localeCompare(
              right.groupId,
            ),
        )
    ) {
      const riders =
        group.riderIds
          .map(
            (riderId) =>
              elapsedState.riders[
                riderId
              ],
          )
          .filter(
            (
              rider,
            ): rider is NonNullable<typeof rider> =>
              Boolean(
                rider &&
                rider.stageStatus ===
                  'racing' &&
                !previouslyAffected.has(
                  rider.riderId,
                ),
              ),
          )

      if (
        riders.length <
        6
      ) {
        continue
      }

      const proposal =
        proposalByGroupId[
          group.groupId
        ]

      if (!proposal) {
        throw new Error(
          `crashIncidentIntegration: missing movement proposal for ${group.groupId}.`,
        )
      }

      groupCandidates.push(
        evaluateRaceIncidentRisk({
          raceId:
            elapsedState.raceId,
          stageId:
            elapsedState.stageId,
          seed:
            elapsedState.seed,

          incidentKind:
            'group_crash',
          occurrenceIndex:
            elapsedRuntime
              .occurrenceIndex,

          raceSecond:
            elapsedState.raceSecond,
          tickSeconds,
          stageDistanceKm:
            elapsedState
              .stageDistanceKm,
          distanceKm:
            group.distanceKm,

          entityId:
            group.groupId,
          riderId:
            null,
          groupId:
            group.groupId,
          stageStatus:
            'racing',

          currentSpeedKmh:
            proposal
              .appliedSpeedKmh,
          gradientPercent:
            proposal
              .gradientPercent,
          groupSize:
            group.riderIds.length,

          runtimeFatigue:
            average(
              riders.map(
                (rider) =>
                  rider.runtimeFatigue ??
                  0,
              ),
            ),
          resistance:
            average(
              riders.map(
                (rider) =>
                  rider
                    .attributes
                    .resistance,
              ),
            ),
          raceIq:
            average(
              riders.map(
                (rider) =>
                  rider
                    .attributes
                    .raceIq ??
                  50,
              ),
            ),

          weatherIncidentProbabilityMultiplier:
            weatherEffects
              .incidentProbabilityMultiplier,
          weatherReasons:
            weatherEffects.reasons,

          equipmentCondition:
            null,

          incidentCooldownSecondsRemaining:
            elapsedRuntime
              .globalCooldownSecondsRemaining,
        }),
      )
    }
  }

  const allCandidates = [
    ...individualCandidates,
    ...groupCandidates,
  ]

  const selection =
    selectDeterministicIncidentCandidate(
      allCandidates,
    )

  const selectedRisk =
    selection.selected

  const baseResult = {
    previousState:
      configuredState,

    candidateCountByKind: {
      individualCrash:
        individualCandidates.length,
      groupCrash:
        groupCandidates.length,
    },

    eligibleCandidateCountByKind: {
      individualCrash:
        individualCandidates.filter(
          (candidate) =>
            candidate.eligible,
        ).length,
      groupCrash:
        groupCandidates.filter(
          (candidate) =>
            candidate.eligible,
        ).length,
    },

    triggeredCandidateCountByKind: {
      individualCrash:
        individualCandidates.filter(
          (candidate) =>
            candidate.triggered,
        ).length,
      groupCrash:
        groupCandidates.filter(
          (candidate) =>
            candidate.triggered,
        ).length,
    },

    stageLimitReached: false,
    selection,
    runtimeBefore,
  } as const

  if (!selectedRisk) {
    return {
      ...baseResult,
      state:
        elapsedState,
      selectedRisk: null,
      selectedIncidentKind: null,
      severity: null,
      application: null,
      runtimeAfter:
        elapsedRuntime,
    }
  }

  const severity =
    determineSeverity(
      selectedRisk,
    )

  const riskContext = {
    finalProbability:
      selectedRisk
        .finalProbability,
    deterministicRoll:
      selectedRisk
        .deterministicRoll,
    deterministicKeyHash:
      selectedRisk
        .deterministicKeyHash,
    weatherIncidentProbabilityMultiplier:
      selectedRisk
        .contributions
        .weather
        .multiplier,
  }

  let application:
    AppliedCrashIncident

  if (
    selectedRisk
      .incidentKind ===
    'group_crash'
  ) {
    application = {
      incidentKind:
        'group_crash',
      result:
        applyGroupCrash({
          state:
            elapsedState,
          sourceGroupId:
            selectedRisk.entityId,
          severity,
          occurrenceIndex:
            elapsedRuntime
              .occurrenceIndex,
          causes:
            selectedRisk.causes,
          riskContext,
        }),
    }
  } else {
    application = {
      incidentKind:
        'individual_crash',
      result:
        applyIndividualRiderCrash({
          state:
            elapsedState,
          riderId:
            selectedRisk.entityId,
          severity,
          occurrenceIndex:
            elapsedRuntime
              .occurrenceIndex,
          causes:
            selectedRisk.causes,
          riskContext,
        }),
    }
  }

  const affectedRiderIds =
    application
      .result
      .event
      .relatedRiderIds

  const runtimeAfter:
    CrashIncidentRuntimeState = {
      ...elapsedRuntime,

      occurrenceIndex:
        elapsedRuntime
          .occurrenceIndex +
        1,

      incidentCount:
        elapsedRuntime
          .incidentCount +
        1,

      individualCrashCount:
        elapsedRuntime
          .individualCrashCount +
        (
          application
            .incidentKind ===
            'individual_crash'
            ? 1
            : 0
        ),

      groupCrashCount:
        elapsedRuntime
          .groupCrashCount +
        (
          application
            .incidentKind ===
            'group_crash'
            ? 1
            : 0
        ),

      globalCooldownSecondsRemaining:
        elapsedRuntime
          .globalCooldownSeconds,

      cooldownSecondsRemainingByRiderId: {
        ...elapsedRuntime
          .cooldownSecondsRemainingByRiderId,

        ...Object.fromEntries(
          affectedRiderIds.map(
            (riderId) => [
              riderId,
              elapsedRuntime
                .riderCooldownSeconds,
            ],
          ),
        ),
      },

      affectedRiderIds:
        sortedUnique([
          ...elapsedRuntime
            .affectedRiderIds,
          ...affectedRiderIds,
        ]),
    }

  const stateAfterApplication:
    SimulationState = {
      ...application
        .result
        .state,
      crashIncidentRuntime:
        runtimeAfter,
    }

  const finalApplication:
    AppliedCrashIncident =
      application.incidentKind ===
        'group_crash'
        ? {
            incidentKind:
              'group_crash',
            result: {
              ...application.result,
              state:
                stateAfterApplication,
            },
          }
        : {
            incidentKind:
              'individual_crash',
            result: {
              ...application.result,
              state:
                stateAfterApplication,
            },
          }

  return {
    ...baseResult,
    state:
      stateAfterApplication,
    selectedRisk,
    selectedIncidentKind:
      selectedRisk.incidentKind,
    severity,
    application:
      finalApplication,
    runtimeAfter,
  }
}
