/**
 * AuthoritativeSeparationPressureDiagnostic.tsx
 *
 * Phase 7B.8K browser-only diagnostic.
 *
 * Verifies that sustained cannot-hold pressure is owned by SimulationState
 * rather than a runner-local record.
 *
 * Scenarios:
 * - constant 8% for 10 km;
 * - 0.7 km at 8%, followed by flat recovery to 4 km;
 * - real Rio Stage 1;
 * - deterministic continuation from a JSON-restored 90-second checkpoint;
 * - current isolated runMultiGroupStage preservation.
 */

import {
  useMemo,
  type ReactNode,
} from 'react'

import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  runIntegratedTerrainSeparationStage,
  type IntegratedTerrainSeparationTickResult,
  type RunIntegratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  runMultiGroupStage,
} from '../../race-engine/simulation/runMultiGroupStage'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface InitialSummary {
  readonly riderCount: number
  readonly pressureEntryCount: number
  readonly nonZeroCount: number
  readonly pressureHash: string
}

interface ClimbSummary {
  readonly tickCount: number
  readonly maximumPressureSeconds: number
  readonly maximumPressuredRiderCount: number
  readonly pressureAt60Count: number
  readonly pressureAt90Count: number
  readonly firstTransitionSecond:
    number | null
  readonly transitionCount: number
  readonly movedRiderCount: number
  readonly movedRiderResetFailureCount: number
  readonly droppedRiderResetFailureCount: number
  readonly terminalResetFailureCount: number
  readonly aliasMismatchCount: number
  readonly transferMismatchCount: number
  readonly eligibilityMismatchCount: number
  readonly finalNonZeroCount: number
  readonly deterministicHash: string
  readonly pressureTraceHash: string
}

interface RecoverySummary {
  readonly tickCount: number
  readonly maximumPressureBeforeRecoverySeconds: number
  readonly pressuredRiderCountBeforeRecovery: number
  readonly firstRecoveryTickSecond:
    number | null
  readonly firstRecoveryGradientPercent:
    number | null
  readonly resetRiderCount: number
  readonly resetFailureCount: number
  readonly transitionCount: number
  readonly finalNonZeroCount: number
  readonly deterministicHash: string
}

interface CheckpointSummary {
  readonly checkpointSecond: number
  readonly nonZeroPressureCount: number
  readonly maximumPressureSeconds: number
  readonly checkpointPressureHash: string
  readonly restoredPressureHash: string
  readonly fullFinalStateHash: string
  readonly resumedFinalStateHash: string
  readonly restoredContinuationMatches: boolean
  readonly zeroedFirstTransitionSecond:
    number | null
  readonly authoritativeFirstTransitionSecond:
    number | null
  readonly zeroedContinuationDiffers: boolean
}

interface RioSummary {
  readonly integratedTickCount: number
  readonly integratedTransitionCount: number
  readonly integratedMaximumPressureSeconds: number
  readonly integratedFinalNonZeroCount: number
  readonly integratedHash: string
  readonly isolatedTickCount: number
  readonly isolatedMaximumPressureSeconds: number
  readonly isolatedFinalNonZeroCount: number
  readonly isolatedHash: string
}

interface ValidatorSummary {
  readonly caseCount: number
  readonly rejectedCount: number
  readonly labels:
    readonly string[]
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly initial:
    InitialSummary
  readonly climb:
    ClimbSummary
  readonly recovery:
    RecoverySummary
  readonly checkpoint:
    CheckpointSummary
  readonly rio:
    RioSummary
  readonly validator:
    ValidatorSummary
  readonly repeatedHashA: string
  readonly repeatedHashB: string
  readonly checks:
    readonly CheckResult[]
}

const TERRAIN_INFLUENCE =
  0.5

const SEPARATION_WINDOW_SECONDS =
  120

const CONSOLIDATION_THRESHOLD_SECONDS =
  5

const CONSOLIDATION_GAP_DIFFERENCE_SECONDS =
  5

const CONTROLLED_DISTANCE_KM =
  10

const RECOVERY_DISTANCE_KM =
  4

const CHECKPOINT_SECOND =
  90

function baseInput():
  StageInput {
  return createStageInputFromSourceRows(
    rioStage1SourceRows,
  )
}

function createConstantGradientInput(
  gradientPercent: number,
): StageInput {
  const base =
    baseInput()

  return {
    ...base,
    raceId:
      `${base.raceId}-authoritative-pressure-${gradientPercent}`,
    stageId:
      `${base.stageId}-authoritative-pressure-${gradientPercent}`,
    stageName:
      `Authoritative pressure · constant ${gradientPercent}%`,
    distanceKm:
      CONTROLLED_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          CONTROLLED_DISTANCE_KM,
        elevationMetres:
          CONTROLLED_DISTANCE_KM *
          1000 *
          (
            gradientPercent /
            100
          ),
      },
    ],
    orders: [],
  }
}

function createRecoveryInput():
  StageInput {
  const base =
    baseInput()

  return {
    ...base,
    raceId:
      `${base.raceId}-authoritative-pressure-recovery`,
    stageId:
      `${base.stageId}-authoritative-pressure-recovery`,
    stageName:
      'Authoritative pressure · 8% then flat recovery',
    distanceKm:
      RECOVERY_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre: 0.7,
        elevationMetres: 56,
      },
      {
        kilometre:
          RECOVERY_DISTANCE_KM,
        elevationMetres: 56,
      },
    ],
    orders: [],
  }
}

function integratedOptions() {
  return {
    terrainCapabilityInfluence:
      TERRAIN_INFLUENCE,
    separationWindowSeconds:
      SEPARATION_WINDOW_SECONDS,

    droppedWaveConsolidationEnabled:
      true,
    droppedWaveConsolidationThresholdSeconds:
      CONSOLIDATION_THRESHOLD_SECONDS,
    droppedWaveConsolidationGapDifferenceSeconds:
      CONSOLIDATION_GAP_DIFFERENCE_SECONDS,

    droppedTransitionEventsEnabled:
      true,

    steepGradientSeverityEnabled:
      true,
    steepGradientSeverityModel:
      'progressive_resilience' as const,

    steepGradientMovementSeverityEnabled:
      true,
    steepGradientMovementSeverityModel:
      'progressive_resilience' as const,

    subTickFinishInterpolationEnabled:
      true,

    maximumTickCount:
      40_000,
  }
}

function runIntegrated(
  input: StageInput,
): RunIntegratedTerrainSeparationStageResult {
  return runIntegratedTerrainSeparationStage(
    createInitialState(
      input,
    ),
    integratedOptions(),
  )
}

function pressureValues(
  state: SimulationState,
): readonly number[] {
  return Object.values(
    state
      .separationPressureSecondsByRiderId,
  )
}

function nonZeroPressureCount(
  state: SimulationState,
): number {
  return pressureValues(
    state,
  ).filter(
    (seconds) =>
      seconds > 0,
  ).length
}

function maximumPressure(
  state: SimulationState,
): number {
  return Math.max(
    0,
    ...pressureValues(
      state,
    ),
  )
}

function exactPressureKeys(
  state: SimulationState,
): boolean {
  const riderIds =
    Object.keys(
      state.riders,
    )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )

  const pressureRiderIds =
    Object.keys(
      state
        .separationPressureSecondsByRiderId,
    )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )

  return (
    JSON.stringify(
      riderIds,
    ) ===
    JSON.stringify(
      pressureRiderIds,
    )
  )
}

function pressureHash(
  state: SimulationState,
): string {
  return createCanonicalHashedValue(
    state
      .separationPressureSecondsByRiderId,
  ).hash
}

function stateWithoutPressureHash(
  state: SimulationState,
): string {
  const {
    separationPressureSecondsByRiderId:
      _ignored,
    ...rest
  } = state

  return createCanonicalHashedValue(
    rest,
  ).hash
}

function transitionMovedIds(
  tick:
    IntegratedTerrainSeparationTickResult,
): ReadonlySet<string> {
  return new Set(
    tick.transitions.flatMap(
      (transition) =>
        transition
          .movedRiderIds,
    ),
  )
}

function auditClimb(
  run:
    RunIntegratedTerrainSeparationStageResult,
): ClimbSummary {
  let maximumPressureSeconds = 0
  let maximumPressuredRiderCount = 0
  let pressureAt60Count = 0
  let pressureAt90Count = 0
  let movedRiderResetFailureCount = 0
  let droppedRiderResetFailureCount = 0
  let terminalResetFailureCount = 0
  let aliasMismatchCount = 0
  let transferMismatchCount = 0
  let eligibilityMismatchCount = 0

  const pressureTrace:
    Readonly<Record<string, unknown>>[] =
      []

  for (
    const [
      index,
      tick,
    ] of
    run.ticks.entries()
  ) {
    const statePressure =
      tick.state
        .separationPressureSecondsByRiderId

    const previousPressure =
      tick.previousState
        .separationPressureSecondsByRiderId

    const previousExpected =
      index === 0
        ? run.initialState
            .separationPressureSecondsByRiderId
        : run.ticks[
            index - 1
          ]?.state
            .separationPressureSecondsByRiderId

    if (
      tick.pressureDurationByRiderId !==
      statePressure
    ) {
      aliasMismatchCount +=
        1
    }

    if (
      JSON.stringify(
        previousPressure,
      ) !==
      JSON.stringify(
        previousExpected,
      )
    ) {
      transferMismatchCount +=
        1
    }

    const values =
      Object.values(
        statePressure,
      )

    maximumPressureSeconds =
      Math.max(
        maximumPressureSeconds,
        ...values,
      )

    maximumPressuredRiderCount =
      Math.max(
        maximumPressuredRiderCount,
        values.filter(
          (seconds) =>
            seconds > 0,
        ).length,
      )

    if (
      tick.state.raceSecond ===
      60
    ) {
      pressureAt60Count =
        values.filter(
          (seconds) =>
            seconds === 60,
        ).length
    }

    if (
      tick.state.raceSecond ===
      90
    ) {
      pressureAt90Count =
        values.filter(
          (seconds) =>
            seconds === 90,
        ).length
    }

    const movedIds =
      transitionMovedIds(
        tick,
      )

    for (
      const riderId of
      movedIds
    ) {
      if (
        statePressure[
          riderId
        ] !== 0
      ) {
        movedRiderResetFailureCount +=
          1
      }
    }

    for (
      const rider of
      Object.values(
        tick.state.riders,
      )
    ) {
      const group =
        tick.state.groups[
          rider.currentGroupId
        ]

      if (
        group?.groupType ===
          'dropped' &&
        statePressure[
          rider.riderId
        ] !== 0
      ) {
        droppedRiderResetFailureCount +=
          1
      }

      if (
        rider.stageStatus !==
          'racing' &&
        statePressure[
          rider.riderId
        ] !== 0
      ) {
        terminalResetFailureCount +=
          1
      }
    }

    for (
      const evaluation of
      tick.pressureEvaluations
    ) {
      const previousSeconds =
        previousPressure[
          evaluation.riderId
        ] ?? 0

      if (
        evaluation
          .eligibility
          .previousConsecutiveCannotHoldSeconds !==
        previousSeconds
      ) {
        eligibilityMismatchCount +=
          1
      }

      const moved =
        movedIds.has(
          evaluation.riderId,
        )

      const terminal =
        tick.state.riders[
          evaluation.riderId
        ]?.stageStatus !==
          'racing'

      const expectedStateSeconds =
        moved ||
        terminal
          ? 0
          : evaluation
              .eligibility
              .nextConsecutiveCannotHoldSeconds

      if (
        statePressure[
          evaluation.riderId
        ] !==
        expectedStateSeconds
      ) {
        eligibilityMismatchCount +=
          1
      }
    }

    pressureTrace.push({
      raceSecond:
        tick.state.raceSecond,
      pressure:
        statePressure,
      transitions:
        tick.transitions.map(
          (transition) => ({
            kind:
              transition
                .transitionKind,
            target:
              transition
                .targetGroupId,
            moved:
              transition
                .movedRiderIds,
          }),
        ),
    })
  }

  return {
    tickCount:
      run.tickCount,
    maximumPressureSeconds,
    maximumPressuredRiderCount,
    pressureAt60Count,
    pressureAt90Count,
    firstTransitionSecond:
      run.transitions[0]
        ?.raceSecond ??
      null,
    transitionCount:
      run.transitions.length,
    movedRiderCount:
      run.transitions.reduce(
        (
          total,
          transition,
        ) =>
          total +
          transition
            .movedRiderIds.length,
        0,
      ),
    movedRiderResetFailureCount,
    droppedRiderResetFailureCount,
    terminalResetFailureCount,
    aliasMismatchCount,
    transferMismatchCount,
    eligibilityMismatchCount,
    finalNonZeroCount:
      nonZeroPressureCount(
        run.finalState,
      ),
    deterministicHash:
      run.deterministicHash,
    pressureTraceHash:
      createCanonicalHashedValue(
        pressureTrace,
      ).hash,
  }
}

function pelotonGradient(
  tick:
    IntegratedTerrainSeparationTickResult,
): number | null {
  const proposal =
    tick.movement
      .movement
      .proposals
      .find(
        (candidate) =>
          candidate.groupId ===
          'peloton_main',
      )

  return proposal
    ?.gradientPercent ??
    null
}

function auditRecovery(
  run:
    RunIntegratedTerrainSeparationStageResult,
): RecoverySummary {
  let maximumPressureBeforeRecoverySeconds =
    0

  let pressuredRiderCountBeforeRecovery =
    0

  let firstRecoveryTick:
    IntegratedTerrainSeparationTickResult | null =
      null

  for (
    const tick of
    run.ticks
  ) {
    const gradient =
      pelotonGradient(
        tick,
      )

    if (
      gradient !== null &&
      gradient > 0.1 &&
      !firstRecoveryTick
    ) {
      maximumPressureBeforeRecoverySeconds =
        Math.max(
          maximumPressureBeforeRecoverySeconds,
          maximumPressure(
            tick.state,
          ),
        )

      pressuredRiderCountBeforeRecovery =
        Math.max(
          pressuredRiderCountBeforeRecovery,
          nonZeroPressureCount(
            tick.state,
          ),
        )
    }

    if (
      gradient !== null &&
      Math.abs(
        gradient,
      ) <= 0.1 &&
      maximumPressureBeforeRecoverySeconds >
        0 &&
      !firstRecoveryTick
    ) {
      firstRecoveryTick =
        tick
    }
  }

  const previouslyPressuredIds =
    firstRecoveryTick
      ? Object.entries(
          firstRecoveryTick
            .previousState
            .separationPressureSecondsByRiderId,
        )
          .filter(
            ([
              _riderId,
              seconds,
            ]) =>
              seconds > 0,
          )
          .map(
            ([
              riderId,
            ]) =>
              riderId,
          )
      : []

  const resetFailureCount =
    firstRecoveryTick
      ? previouslyPressuredIds
          .filter(
            (riderId) =>
              firstRecoveryTick
                ?.state
                .separationPressureSecondsByRiderId[
                  riderId
                ] !== 0,
          )
          .length
      : previouslyPressuredIds
          .length

  return {
    tickCount:
      run.tickCount,
    maximumPressureBeforeRecoverySeconds,
    pressuredRiderCountBeforeRecovery,
    firstRecoveryTickSecond:
      firstRecoveryTick
        ?.state
        .raceSecond ??
      null,
    firstRecoveryGradientPercent:
      firstRecoveryTick
        ? pelotonGradient(
            firstRecoveryTick,
          )
        : null,
    resetRiderCount:
      previouslyPressuredIds
        .length -
      resetFailureCount,
    resetFailureCount,
    transitionCount:
      run.transitions.length,
    finalNonZeroCount:
      nonZeroPressureCount(
        run.finalState,
      ),
    deterministicHash:
      run.deterministicHash,
  }
}

function roundTripState(
  state: SimulationState,
): SimulationState {
  return JSON.parse(
    JSON.stringify(
      state,
    ),
  ) as SimulationState
}

function zeroPressureState(
  state: SimulationState,
): SimulationState {
  return {
    ...state,
    separationPressureSecondsByRiderId:
      Object.fromEntries(
        Object.keys(
          state.riders,
        )
          .slice()
          .sort(
            (
              left,
              right,
            ) =>
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
      ),
  }
}

function auditCheckpoint(
  full:
    RunIntegratedTerrainSeparationStageResult,
): CheckpointSummary {
  const checkpoint =
    full.ticks.find(
      (tick) =>
        tick.state.raceSecond ===
        CHECKPOINT_SECOND,
    )?.state

  if (!checkpoint) {
    throw new Error(
      'AuthoritativeSeparationPressureDiagnostic: missing 90-second checkpoint.',
    )
  }

  const restored =
    roundTripState(
      checkpoint,
    )

  validateSimulationState(
    restored,
  )

  const resumed =
    runIntegratedTerrainSeparationStage(
      restored,
      integratedOptions(),
    )

  const zeroed =
    zeroPressureState(
      restored,
    )

  validateSimulationState(
    zeroed,
  )

  const zeroedContinuation =
    runIntegratedTerrainSeparationStage(
      zeroed,
      integratedOptions(),
    )

  const fullFinalStateHash =
    createCanonicalHashedValue(
      full.finalState,
    ).hash

  const resumedFinalStateHash =
    createCanonicalHashedValue(
      resumed.finalState,
    ).hash

  const zeroedFinalStateHash =
    createCanonicalHashedValue(
      zeroedContinuation
        .finalState,
    ).hash

  return {
    checkpointSecond:
      checkpoint.raceSecond,
    nonZeroPressureCount:
      nonZeroPressureCount(
        checkpoint,
      ),
    maximumPressureSeconds:
      maximumPressure(
        checkpoint,
      ),
    checkpointPressureHash:
      pressureHash(
        checkpoint,
      ),
    restoredPressureHash:
      pressureHash(
        restored,
      ),
    fullFinalStateHash,
    resumedFinalStateHash,
    restoredContinuationMatches:
      fullFinalStateHash ===
      resumedFinalStateHash,
    zeroedFirstTransitionSecond:
      zeroedContinuation
        .transitions[0]
        ?.raceSecond ??
      null,
    authoritativeFirstTransitionSecond:
      resumed.transitions[0]
        ?.raceSecond ??
      null,
    zeroedContinuationDiffers:
      zeroedFinalStateHash !==
      resumedFinalStateHash,
  }
}

function expectValidationFailure(
  state: SimulationState,
): boolean {
  try {
    validateSimulationState(
      state,
    )

    return false
  } catch {
    return true
  }
}

function auditValidator(
  initial:
    SimulationState,
  climb:
    RunIntegratedTerrainSeparationStageResult,
): ValidatorSummary {
  const firstRiderId =
    Object.keys(
      initial.riders,
    )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )[0]

  if (!firstRiderId) {
    throw new Error(
      'AuthoritativeSeparationPressureDiagnostic: missing first rider.',
    )
  }

  const missingPressure = {
    ...initial
      .separationPressureSecondsByRiderId,
  }

  delete missingPressure[
    firstRiderId
  ]

  const transitionTick =
    climb.ticks.find(
      (tick) =>
        tick.transitions.length >
        0,
    )

  const droppedRiderId =
    transitionTick
      ?.transitions[0]
      ?.movedRiderIds[0] ??
    null

  const winnerId =
    climb.results.find(
      (result) =>
        result.rank === 1,
    )?.riderId ??
    null

  const cases:
    readonly {
      readonly label: string
      readonly state:
        SimulationState
    }[] = [
      {
        label:
          'missing rider entry',
        state: {
          ...initial,
          separationPressureSecondsByRiderId:
            missingPressure,
        },
      },
      {
        label:
          'unknown rider entry',
        state: {
          ...initial,
          separationPressureSecondsByRiderId: {
            ...initial
              .separationPressureSecondsByRiderId,
            unknown_rider: 0,
          },
        },
      },
      {
        label:
          'negative pressure',
        state: {
          ...initial,
          separationPressureSecondsByRiderId: {
            ...initial
              .separationPressureSecondsByRiderId,
            [firstRiderId]: -1,
          },
        },
      },
      {
        label:
          'fractional pressure',
        state: {
          ...initial,
          separationPressureSecondsByRiderId: {
            ...initial
              .separationPressureSecondsByRiderId,
            [firstRiderId]: 0.5,
          },
        },
      },
      {
        label:
          'pressure exceeds race clock',
        state: {
          ...initial,
          separationPressureSecondsByRiderId: {
            ...initial
              .separationPressureSecondsByRiderId,
            [firstRiderId]: 30,
          },
        },
      },
      ...(
        transitionTick &&
        droppedRiderId
          ? [
              {
                label:
                  'dropped rider retains pressure',
                state: {
                  ...transitionTick
                    .state,
                  separationPressureSecondsByRiderId: {
                    ...transitionTick
                      .state
                      .separationPressureSecondsByRiderId,
                    [droppedRiderId]:
                      30,
                  },
                },
              },
            ]
          : []
      ),
      ...(
        winnerId
          ? [
              {
                label:
                  'terminal rider retains pressure',
                state: {
                  ...climb.finalState,
                  separationPressureSecondsByRiderId: {
                    ...climb
                      .finalState
                      .separationPressureSecondsByRiderId,
                    [winnerId]:
                      30,
                  },
                },
              },
            ]
          : []
      ),
    ]

  const rejected =
    cases.filter(
      (entry) =>
        expectValidationFailure(
          entry.state,
        ),
    )

  return {
    caseCount:
      cases.length,
    rejectedCount:
      rejected.length,
    labels:
      cases.map(
        (entry) =>
          entry.label,
      ),
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const initialState =
    createInitialState(
      createConstantGradientInput(
        8,
      ),
    )

  const initial:
    InitialSummary = {
      riderCount:
        Object.keys(
          initialState.riders,
        ).length,
      pressureEntryCount:
        Object.keys(
          initialState
            .separationPressureSecondsByRiderId,
        ).length,
      nonZeroCount:
        nonZeroPressureCount(
          initialState,
        ),
      pressureHash:
        pressureHash(
          initialState,
        ),
    }

  const climbRun =
    runIntegrated(
      createConstantGradientInput(
        8,
      ),
    )

  const repeatedClimbRun =
    runIntegrated(
      createConstantGradientInput(
        8,
      ),
    )

  const climb =
    auditClimb(
      climbRun,
    )

  const recoveryRun =
    runIntegrated(
      createRecoveryInput(),
    )

  const recovery =
    auditRecovery(
      recoveryRun,
    )

  const checkpoint =
    auditCheckpoint(
      climbRun,
    )

  const rioIntegrated =
    runIntegrated(
      baseInput(),
    )

  const rioIsolated =
    runMultiGroupStage(
      createInitialState(
        baseInput(),
      ),
      {
        maximumTickCount:
          40_000,
      },
    )

  const rio:
    RioSummary = {
      integratedTickCount:
        rioIntegrated.tickCount,
      integratedTransitionCount:
        rioIntegrated
          .transitions.length,
      integratedMaximumPressureSeconds:
        Math.max(
          0,
          ...rioIntegrated.ticks.map(
            (tick) =>
              maximumPressure(
                tick.state,
              ),
          ),
        ),
      integratedFinalNonZeroCount:
        nonZeroPressureCount(
          rioIntegrated
            .finalState,
        ),
      integratedHash:
        rioIntegrated
          .deterministicHash,
      isolatedTickCount:
        rioIsolated.tickCount,
      isolatedMaximumPressureSeconds:
        Math.max(
          0,
          ...rioIsolated.ticks.map(
            (tick) =>
              maximumPressure(
                tick.state,
              ),
          ),
        ),
      isolatedFinalNonZeroCount:
        nonZeroPressureCount(
          rioIsolated
            .finalState,
        ),
      isolatedHash:
        rioIsolated
          .deterministicHash,
    }

  const validator =
    auditValidator(
      initialState,
      climbRun,
    )

  const allIntegratedStates = [
    climbRun.initialState,
    ...climbRun.ticks.map(
      (tick) =>
        tick.state,
    ),
    recoveryRun.initialState,
    ...recoveryRun.ticks.map(
      (tick) =>
        tick.state,
    ),
    rioIntegrated.initialState,
    ...rioIntegrated.ticks.map(
      (tick) =>
        tick.state,
    ),
  ]

  const repeatedHashA =
    climbRun
      .deterministicHash

  const repeatedHashB =
    repeatedClimbRun
      .deterministicHash

  const checks:
    CheckResult[] = [
      {
        label:
          'Initial state contains exactly one zero pressure entry per rider',
        passed:
          initial.riderCount ===
            initial
              .pressureEntryCount &&
          initial.nonZeroCount ===
            0,
      },
      {
        label:
          'Every inspected state contains exactly the rider pressure key set',
        passed:
          allIntegratedStates.every(
            exactPressureKeys,
          ),
      },
      {
        label:
          'Repeated authoritative-pressure runs are identical',
        passed:
          repeatedHashA ===
          repeatedHashB,
      },
      {
        label:
          'Tick pressure aliases reference the authoritative state record',
        passed:
          climb
            .aliasMismatchCount ===
          0,
      },
      {
        label:
          'Every tick receives the exact previous state pressure record',
        passed:
          climb
            .transferMismatchCount ===
          0,
      },
      {
        label:
          'Eligibility previous/next durations match authoritative state values',
        passed:
          climb
            .eligibilityMismatchCount ===
          0,
      },
      {
        label:
          'Cannot-hold pressure accumulates before the 120-second transition',
        passed:
          climb.pressureAt60Count >
            0 &&
          climb.pressureAt90Count >
            0 &&
          climb
            .firstTransitionSecond ===
            120,
      },
      {
        label:
          'Moved riders reset authoritative pressure in the transition tick',
        passed:
          climb
            .movedRiderResetFailureCount ===
          0,
      },
      {
        label:
          'Dropped-group riders always have zero authoritative pressure',
        passed:
          climb
            .droppedRiderResetFailureCount ===
          0,
      },
      {
        label:
          'Finished and terminal riders always have zero authoritative pressure',
        passed:
          climb
            .terminalResetFailureCount ===
            0 &&
          climb.finalNonZeroCount ===
            0,
      },
      {
        label:
          'Comfortable recovery resets every previously pressured rider immediately',
        passed:
          recovery
            .maximumPressureBeforeRecoverySeconds >
            0 &&
          recovery
            .resetRiderCount >
            0 &&
          recovery
            .resetFailureCount ===
            0 &&
          recovery
            .transitionCount ===
            0,
      },
      {
        label:
          'JSON-restored checkpoint preserves pressure and completes identically',
        passed:
          checkpoint
            .checkpointPressureHash ===
            checkpoint
              .restoredPressureHash &&
          checkpoint
            .restoredContinuationMatches,
      },
      {
        label:
          'Zeroing restored pressure changes continuation and delays separation',
        passed:
          checkpoint
            .zeroedContinuationDiffers &&
          (
            checkpoint
              .zeroedFirstTransitionSecond ??
            0
          ) >
          (
            checkpoint
              .authoritativeFirstTransitionSecond ??
            Number.POSITIVE_INFINITY
          ),
      },
      {
        label:
          'Rio integrated pressure remains zero with no transition',
        passed:
          rio
            .integratedTickCount ===
            394 &&
          rio
            .integratedTransitionCount ===
            0 &&
          rio
            .integratedMaximumPressureSeconds ===
            0 &&
          rio
            .integratedFinalNonZeroCount ===
            0,
      },
      {
        label:
          'The current isolated multi-group runner preserves zero pressure',
        passed:
          rio
            .isolatedTickCount ===
            394 &&
          rio
            .isolatedMaximumPressureSeconds ===
            0 &&
          rio
            .isolatedFinalNonZeroCount ===
            0,
      },
      {
        label:
          'Validator rejects every malformed authoritative pressure state',
        passed:
          validator
            .rejectedCount ===
          validator.caseCount,
      },
      {
        label:
          'Pressure storage does not alter unrelated non-pressure state during JSON restoration',
        passed:
          stateWithoutPressureHash(
            roundTripState(
              climbRun.ticks.find(
                (tick) =>
                  tick.state.raceSecond ===
                  CHECKPOINT_SECOND,
              )?.state ??
              climbRun.initialState,
            ),
          ) ===
          stateWithoutPressureHash(
            climbRun.ticks.find(
              (tick) =>
                tick.state.raceSecond ===
                CHECKPOINT_SECOND,
            )?.state ??
            climbRun.initialState,
          ),
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    initial,
    climb,
    recovery,
    checkpoint,
    rio,
    validator,
    repeatedHashA,
    repeatedHashB,
    checks,
  }
}

function format(
  value: number,
  digits = 3,
): string {
  return value.toFixed(
    digits,
  )
}

function Check({
  result,
}: {
  readonly result:
    CheckResult
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {result.label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          result.passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {result.passed
          ? 'PASS'
          : 'FAIL'}
      </span>
    </div>
  )
}

function Card({
  title,
  children,
}: {
  readonly title: string
  readonly children:
    ReactNode
}): JSX.Element {
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">
        {title}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        {children}
      </dl>
    </article>
  )
}

function Row({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    ReactNode
}): JSX.Element {
  return (
    <div className="flex justify-between gap-4">
      <dt>
        {label}
      </dt>
      <dd className="text-right">
        {value}
      </dd>
    </div>
  )
}

export default function AuthoritativeSeparationPressureDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => {
        try {
          return {
            ok: true as const,
            value:
              buildDiagnostic(),
          }
        } catch (error) {
          return {
            ok: false as const,
            message:
              error instanceof Error
                ? error.message
                : String(error),
            stack:
              error instanceof Error
                ? error.stack ??
                  null
                : null,
          }
        }
      },
      [],
    )

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-5xl rounded-3xl border border-red-400 bg-red-950/30 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 7B.8K development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Authoritative pressure audit failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>

          {result.stack ? (
            <details className="mt-4 rounded-2xl bg-slate-950 p-4">
              <summary className="cursor-pointer font-semibold">
                Browser stack
              </summary>

              <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-400">
                {result.stack}
              </pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }

  const value =
    result.value

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1900px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8K development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Authoritative separation-pressure state
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Verifies that sustained cannot-hold pressure is stored on every
            immutable SimulationState and survives deterministic continuation
            without a runner-local pressure record.
          </p>
        </header>

        <section
          className={[
            'rounded-3xl border p-6',
            value.passed
              ? 'border-emerald-400 bg-emerald-950/25'
              : 'border-red-400 bg-red-950/25',
          ].join(' ')}
        >
          <h2 className="text-2xl font-semibold">
            {value.passed
              ? 'PASS — separation pressure is authoritative immutable simulation state'
              : 'FAIL — authoritative separation-pressure storage needs correction'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card title="Initial state">
            <Row
              label="Riders / pressure entries"
              value={`${value.initial.riderCount} / ${value.initial.pressureEntryCount}`}
            />
            <Row
              label="Non-zero entries"
              value={value.initial.nonZeroCount}
            />
            <Row
              label="Pressure hash"
              value={
                <span className="font-mono text-xs">
                  {value.initial.pressureHash}
                </span>
              }
            />
          </Card>

          <Card title="Constant 8% · 10 km">
            <Row
              label="Ticks / transitions"
              value={`${value.climb.tickCount} / ${value.climb.transitionCount}`}
            />
            <Row
              label="Max pressure / riders"
              value={`${value.climb.maximumPressureSeconds}s / ${value.climb.maximumPressuredRiderCount}`}
            />
            <Row
              label="Pressure at 60 / 90"
              value={`${value.climb.pressureAt60Count} / ${value.climb.pressureAt90Count}`}
            />
            <Row
              label="First transition"
              value={`${value.climb.firstTransitionSecond ?? '—'}s`}
            />
            <Row
              label="Moved / final non-zero"
              value={`${value.climb.movedRiderCount} / ${value.climb.finalNonZeroCount}`}
            />
            <Row
              label="Run hash"
              value={
                <span className="font-mono text-xs">
                  {value.climb.deterministicHash}
                </span>
              }
            />
            <Row
              label="Pressure trace hash"
              value={
                <span className="font-mono text-xs">
                  {value.climb.pressureTraceHash}
                </span>
              }
            />
          </Card>

          <Card title="Recovery">
            <Row
              label="Max pre-recovery pressure"
              value={`${value.recovery.maximumPressureBeforeRecoverySeconds}s`}
            />
            <Row
              label="Pressured riders"
              value={value.recovery.pressuredRiderCountBeforeRecovery}
            />
            <Row
              label="First recovery tick"
              value={`${value.recovery.firstRecoveryTickSecond ?? '—'}s`}
            />
            <Row
              label="Recovery gradient"
              value={
                value.recovery.firstRecoveryGradientPercent ===
                null
                  ? '—'
                  : `${format(value.recovery.firstRecoveryGradientPercent)}%`
              }
            />
            <Row
              label="Reset / failures"
              value={`${value.recovery.resetRiderCount} / ${value.recovery.resetFailureCount}`}
            />
            <Row
              label="Transitions"
              value={value.recovery.transitionCount}
            />
            <Row
              label="Run hash"
              value={
                <span className="font-mono text-xs">
                  {value.recovery.deterministicHash}
                </span>
              }
            />
          </Card>

          <Card title="Checkpoint continuation">
            <Row
              label="Checkpoint"
              value={`${value.checkpoint.checkpointSecond}s`}
            />
            <Row
              label="Non-zero / max pressure"
              value={`${value.checkpoint.nonZeroPressureCount} / ${value.checkpoint.maximumPressureSeconds}s`}
            />
            <Row
              label="Pressure hashes"
              value={
                <span className="font-mono text-xs">
                  {value.checkpoint.checkpointPressureHash}
                  <br />
                  {value.checkpoint.restoredPressureHash}
                </span>
              }
            />
            <Row
              label="Final-state hashes"
              value={
                <span className="font-mono text-xs">
                  {value.checkpoint.fullFinalStateHash}
                  <br />
                  {value.checkpoint.resumedFinalStateHash}
                </span>
              }
            />
            <Row
              label="Transition authoritative / zeroed"
              value={`${value.checkpoint.authoritativeFirstTransitionSecond ?? '—'}s / ${value.checkpoint.zeroedFirstTransitionSecond ?? '—'}s`}
            />
          </Card>

          <Card title="Rio and validator">
            <Row
              label="Integrated ticks / transitions"
              value={`${value.rio.integratedTickCount} / ${value.rio.integratedTransitionCount}`}
            />
            <Row
              label="Integrated max pressure"
              value={`${value.rio.integratedMaximumPressureSeconds}s`}
            />
            <Row
              label="Isolated ticks / max pressure"
              value={`${value.rio.isolatedTickCount} / ${value.rio.isolatedMaximumPressureSeconds}s`}
            />
            <Row
              label="Validator rejected"
              value={`${value.validator.rejectedCount} / ${value.validator.caseCount}`}
            />
            <Row
              label="Integrated hash"
              value={
                <span className="font-mono text-xs">
                  {value.rio.integratedHash}
                </span>
              }
            />
            <Row
              label="Isolated hash"
              value={
                <span className="font-mono text-xs">
                  {value.rio.isolatedHash}
                </span>
              }
            />
          </Card>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Validation rejection cases
          </h2>

          <p className="mt-3 text-sm text-slate-300">
            {value.validator.labels.join(', ')}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            {value.checks.map(
              (check) => (
                <Check
                  key={check.label}
                  result={check}
                />
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            Pressure becomes authoritative engine state, but the integrated
            terrain-separation runner remains inactive. The current isolated
            multi-group runner preserves zero pressure and receives no
            separation logic. Production routes, persistence, replay storage,
            and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
