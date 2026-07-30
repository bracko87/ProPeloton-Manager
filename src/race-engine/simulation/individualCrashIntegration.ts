/**
 * individualCrashIntegration.ts
 *
 * Opt-in deterministic individual-crash evaluation for the integrated
 * calibrated terrain/separation runner.
 *
 * The module:
 * - attaches state-owned runtime counters only when explicitly enabled;
 * - decrements global and rider cooldowns;
 * - evaluates every eligible racing rider using incidentRisk.ts;
 * - selects at most one triggered candidate;
 * - resolves deterministic crash severity;
 * - applies the already-verified immutable crash mutation;
 * - never accesses persistence or the production route.
 */

import type {
  SimulationState,
  IndividualCrashRuntimeState,
} from '../domain/SimulationState'
import {
  applyIndividualRiderCrash,
  type ApplyIndividualRiderCrashResult,
} from './applyIndividualRiderCrash'
import {
  createCanonicalHashedValue,
} from './canonicalSerialization'
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

export interface IndividualCrashIntegrationOptions {
  readonly globalCooldownSeconds?: number
  readonly riderCooldownSeconds?: number
  readonly maximumCrashesPerStage?: number
}

export interface ResolvedIndividualCrashIntegrationOptions {
  readonly globalCooldownSeconds: number
  readonly riderCooldownSeconds: number
  readonly maximumCrashesPerStage: number
}

export interface IntegratedIndividualCrashTickResult {
  readonly previousState:
    SimulationState
  readonly state:
    SimulationState

  readonly candidateCount: number
  readonly eligibleCandidateCount: number
  readonly triggeredCandidateCount: number
  readonly stageLimitReached: boolean

  readonly selection:
    DeterministicIncidentSelection
  readonly selectedRisk:
    RaceIncidentRiskResult | null
  readonly severity:
    IndividualCrashSeverity | null
  readonly application:
    ApplyIndividualRiderCrashResult<SimulationState> | null

  readonly runtimeBefore:
    IndividualCrashRuntimeState
  readonly runtimeAfter:
    IndividualCrashRuntimeState
}

const DEFAULT_GLOBAL_COOLDOWN_SECONDS =
  120

const DEFAULT_RIDER_COOLDOWN_SECONDS =
  900

const DEFAULT_MAXIMUM_CRASHES_PER_STAGE =
  3

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `individualCrashIntegration: ${fieldName} must be a positive integer.`,
    )
  }
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

export function resolveIndividualCrashIntegrationOptions(
  options:
    IndividualCrashIntegrationOptions = {},
): ResolvedIndividualCrashIntegrationOptions {
  const resolved = {
    globalCooldownSeconds:
      options
        .globalCooldownSeconds ??
      DEFAULT_GLOBAL_COOLDOWN_SECONDS,
    riderCooldownSeconds:
      options
        .riderCooldownSeconds ??
      DEFAULT_RIDER_COOLDOWN_SECONDS,
    maximumCrashesPerStage:
      options
        .maximumCrashesPerStage ??
      DEFAULT_MAXIMUM_CRASHES_PER_STAGE,
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
    resolved.maximumCrashesPerStage,
    'maximumCrashesPerStage',
  )

  return resolved
}

export function ensureIndividualCrashRuntime(
  state:
    SimulationState,
  options:
    IndividualCrashIntegrationOptions = {},
): SimulationState {
  const resolved =
    resolveIndividualCrashIntegrationOptions(
      options,
    )

  const existing =
    state.individualCrashRuntime

  if (existing) {
    if (
      existing.globalCooldownSeconds !==
        resolved.globalCooldownSeconds ||
      existing.riderCooldownSeconds !==
        resolved.riderCooldownSeconds ||
      existing.maximumCrashesPerStage !==
        resolved.maximumCrashesPerStage
    ) {
      throw new Error(
        'individualCrashIntegration: existing runtime configuration does not match requested options.',
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
    individualCrashRuntime: {
      enabled: true,
      occurrenceIndex: 0,
      crashCount: 0,
      maximumCrashesPerStage:
        resolved
          .maximumCrashesPerStage,
      globalCooldownSeconds:
        resolved
          .globalCooldownSeconds,
      riderCooldownSeconds:
        resolved
          .riderCooldownSeconds,
      globalCooldownSecondsRemaining: 0,
      cooldownSecondsRemainingByRiderId,
      crashedRiderIds: [],
    },
  }
}

function advanceRuntime(
  runtime:
    IndividualCrashRuntimeState,
  riderIds:
    readonly string[],
  tickSeconds: number,
): IndividualCrashRuntimeState {
  const cooldownSecondsRemainingByRiderId =
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
    )

  return {
    ...runtime,
    globalCooldownSecondsRemaining:
      Math.max(
        0,
        runtime
          .globalCooldownSecondsRemaining -
        tickSeconds,
      ),
    cooldownSecondsRemainingByRiderId,
  }
}

function determineSeverity(
  risk:
    RaceIncidentRiskResult,
): IndividualCrashSeverity {
  const severityHash =
    createCanonicalHashedValue({
      contract:
        'individual_crash_severity_v1',
      deterministicKeyHash:
        risk
          .deterministicKeyHash,
      finalProbability:
        risk.finalProbability,
      causes:
        risk.causes,
    }).hash

  const roll =
    probabilityRollFromHash(
      severityHash,
    )

  const probabilityRatio =
    Math.min(
      1,
      risk.finalProbability /
      0.08,
    )

  let seriousProbability =
    0.05 +
    probabilityRatio *
      0.05

  let moderateProbability =
    0.25 +
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
      0.25,
      seriousProbability,
    )

  moderateProbability =
    Math.min(
      0.5,
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

export function integrateIndividualCrashTick(
  input: {
    readonly state:
      SimulationState
    readonly movement:
      TerrainAwareMultiGroupMovementResult
    readonly options?:
      IndividualCrashIntegrationOptions
  },
): IntegratedIndividualCrashTickResult {
  const configuredState =
    ensureIndividualCrashRuntime(
      input.state,
      input.options,
    )

  const runtimeBefore =
    configuredState
      .individualCrashRuntime

  if (!runtimeBefore) {
    throw new Error(
      'individualCrashIntegration: runtime was not attached.',
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
      individualCrashRuntime:
        elapsedRuntime,
  }

  const stageLimitReached =
    elapsedRuntime.crashCount >=
    elapsedRuntime
      .maximumCrashesPerStage

  if (stageLimitReached) {
    const emptySelection:
      DeterministicIncidentSelection = {
        selected: null,
        triggeredCandidateCount: 0,
        orderedTriggeredEntityIds: [],
      }

    return {
      previousState:
        configuredState,
      state:
        elapsedState,
      candidateCount: 0,
      eligibleCandidateCount: 0,
      triggeredCandidateCount: 0,
      stageLimitReached: true,
      selection:
        emptySelection,
      selectedRisk: null,
      severity: null,
      application: null,
      runtimeBefore,
      runtimeAfter:
        elapsedRuntime,
    }
  }

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

  const alreadyCrashed =
    new Set(
      elapsedRuntime
        .crashedRiderIds,
    )

  const candidates =
    Object.values(
      elapsedState.riders,
    )
      .filter(
        (rider) => {
          if (
            rider.stageStatus !==
            'racing'
          ) {
            return false
          }

          if (
            alreadyCrashed.has(
              rider.riderId,
            )
          ) {
            return false
          }

          const group =
            elapsedState.groups[
              rider.currentGroupId
            ]

          return Boolean(
            group &&
            group.active &&
            group.riderIds.length >
              1 &&
            group.groupType !==
              'finished',
          )
        },
      )
      .slice()
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )
      .map(
        (rider) => {
          const group =
            elapsedState.groups[
              rider.currentGroupId
            ]

          if (!group) {
            throw new Error(
              `individualCrashIntegration: missing group ${rider.currentGroupId}.`,
            )
          }

          const proposal =
            proposalByGroupId[
              group.groupId
            ]

          if (!proposal) {
            throw new Error(
              `individualCrashIntegration: missing movement proposal for ${group.groupId}.`,
            )
          }

          const incidentCooldownSecondsRemaining =
            Math.max(
              elapsedRuntime
                .globalCooldownSecondsRemaining,
              elapsedRuntime
                .cooldownSecondsRemainingByRiderId[
                  rider.riderId
                ] ??
                0,
            )

          return evaluateRaceIncidentRisk({
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

            incidentCooldownSecondsRemaining,
          })
        },
      )

  const selection =
    selectDeterministicIncidentCandidate(
      candidates,
    )

  const selectedRisk =
    selection.selected

  if (!selectedRisk) {
    return {
      previousState:
        configuredState,
      state:
        elapsedState,
      candidateCount:
        candidates.length,
      eligibleCandidateCount:
        candidates.filter(
          (candidate) =>
            candidate.eligible,
        ).length,
      triggeredCandidateCount:
        selection
          .triggeredCandidateCount,
      stageLimitReached: false,
      selection,
      selectedRisk: null,
      severity: null,
      application: null,
      runtimeBefore,
      runtimeAfter:
        elapsedRuntime,
    }
  }

  const severity =
    determineSeverity(
      selectedRisk,
    )

  const application =
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
      riskContext: {
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
      },
    })

  const runtimeAfter:
    IndividualCrashRuntimeState = {
      ...elapsedRuntime,
      occurrenceIndex:
        elapsedRuntime
          .occurrenceIndex +
        1,
      crashCount:
        elapsedRuntime
          .crashCount +
        1,
      globalCooldownSecondsRemaining:
        elapsedRuntime
          .globalCooldownSeconds,
      cooldownSecondsRemainingByRiderId: {
        ...elapsedRuntime
          .cooldownSecondsRemainingByRiderId,
        [selectedRisk.entityId]:
          elapsedRuntime
            .riderCooldownSeconds,
      },
      crashedRiderIds:
        sortedUnique([
          ...elapsedRuntime
            .crashedRiderIds,
          selectedRisk.entityId,
        ]),
    }

  const finalState:
    SimulationState = {
      ...application.state,
      individualCrashRuntime:
        runtimeAfter,
    }

  const finalApplication:
    ApplyIndividualRiderCrashResult<SimulationState> = {
      ...application,
      state:
        finalState,
    }

  return {
    previousState:
      configuredState,
    state:
      finalState,
    candidateCount:
      candidates.length,
    eligibleCandidateCount:
      candidates.filter(
        (candidate) =>
          candidate.eligible,
      ).length,
    triggeredCandidateCount:
      selection
        .triggeredCandidateCount,
    stageLimitReached: false,
    selection,
    selectedRisk,
    severity,
    application:
      finalApplication,
    runtimeBefore,
    runtimeAfter,
  }
}
