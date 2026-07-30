/**
 * CalibratedSimulationModeDiagnostic.tsx
 *
 * Phase 8G.5 browser-only diagnostic.
 *
 * In addition to the accepted calibrated simulation-mode checks, this page
 * verifies both the pure weather model and its calibrated-runner integration.
 * The default existing_v1 path remains weather-neutral.
 *
 * Verifies safe mode selection at runDeterministicRoadRace:
 * - omitted mode;
 * - explicit existing_v1;
 * - terrain_separation_calibrated_v1;
 * - repeated calibrated mode.
 *
 * The calibrated mode is one fixed coherent package. Individual calibrated
 * rules cannot be toggled through the public road-race boundary.
 */

import {
  useMemo,
  type ReactNode,
} from 'react'

import type {
  SimulationOutput,
} from '../../race-engine/domain/SimulationOutput'
import type {
  StageInput,
  StageWeatherInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  createMultiGroupSimulationOutput,
} from '../../race-engine/simulation/createMultiGroupSimulationOutput'
import {
  TERRAIN_AWARE_MULTI_GROUP_MOVEMENT_VERSION,
} from '../../race-engine/simulation/terrainAwareMultiGroupMovement'
import {
  runCalibratedTerrainSeparationStage,
  type RunCalibratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStage'
import {
  runDeterministicRoadRace,
  type MultiGroupSimulationMode,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  calculateWeatherPerformanceEffects,
  type WeatherPerformanceEffects,
} from '../../race-engine/simulation/weatherPerformanceEffects'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  createReplayStageModelFromSimulationOutput,
} from '../../race-replay/createReplayStageModelFromSimulationOutput'


type WeatherScenarioKey =
  | 'neutral'
  | 'strongWind'
  | 'heat'
  | 'coldRain'
  | 'combinedSevere'

interface WeatherScenarioDefinition {
  readonly key:
    WeatherScenarioKey
  readonly label: string
  readonly weather:
    StageWeatherInput
}

interface WeatherScenarioAudit {
  readonly definition:
    WeatherScenarioDefinition
  readonly effects:
    WeatherPerformanceEffects
  readonly repeatedEffects:
    WeatherPerformanceEffects
  readonly deterministicHash:
    string
  readonly repeatedHash:
    string
}


interface ActiveWeatherRaceAudit {
  readonly definition:
    WeatherScenarioDefinition
  readonly baselineOutput:
    SimulationOutput
  readonly weatherOutput:
    SimulationOutput
  readonly repeatedWeatherOutput:
    SimulationOutput
  readonly existingBaselineOutput:
    SimulationOutput
  readonly existingWeatherOutput:
    SimulationOutput

  readonly baselineOutputHash:
    string
  readonly weatherOutputHash:
    string
  readonly repeatedWeatherOutputHash:
    string
  readonly existingBaselineOutputHash:
    string
  readonly existingWeatherOutputHash:
    string

  readonly baselineWinnerTimeSeconds:
    number
  readonly weatherWinnerTimeSeconds:
    number
  readonly winnerTimeDifferenceSeconds:
    number

  readonly baselineAverageFinalEnergy:
    number
  readonly weatherAverageFinalEnergy:
    number
  readonly averageFinalEnergyDifference:
    number

  readonly baselineAverageFinalRuntimeFatigue:
    number
  readonly weatherAverageFinalRuntimeFatigue:
    number
  readonly averageFinalRuntimeFatigueDifference:
    number

  readonly replayFrameCount:
    number
  readonly replayEventCount:
    number
}

type ScenarioKey =
  | 'gradient8'
  | 'gradient10'
  | 'gradient12'
  | 'gradient15'
  | 'rio'

interface ScenarioDefinition {
  readonly key:
    ScenarioKey
  readonly label: string
  readonly gradientPercent:
    number | null
  readonly expectedTransitionCount:
    number
  readonly expectedCreatedCount:
    number
  readonly expectedCaughtCount:
    number
  readonly expectedFinalGroupCount:
    number
}

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface TransitionRow {
  readonly transitionNumber: number
  readonly kind: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly movedRiderCount: number
  readonly eventType: string | null
  readonly eventSequenceNumber:
    number | null
}

interface ScenarioSummary {
  readonly label: string

  readonly omittedOutputHash: string
  readonly explicitExistingOutputHash:
    string
  readonly calibratedOutputHash: string
  readonly repeatedCalibratedOutputHash:
    string
  readonly directCalibratedOutputHash:
    string
  readonly calibratedStageHash: string
  readonly replayCollectionHash: string
  readonly auditHash: string

  readonly requirementsEnabledOutputHash:
    string
  readonly repeatedRequirementsEnabledOutputHash:
    string
  readonly requirementsEnabledStageHash:
    string
  readonly requirementsEnabledReplayCollectionHash:
    string

  readonly requirementsEnabledEqualsRepeated:
    boolean
  readonly requirementsEnabledCompleted:
    boolean

  readonly requirementsEnabledTickCount:
    number
  readonly requirementsEnabledSnapshotCount:
    number
  readonly requirementsEnabledOutputFrameCount:
    number
  readonly requirementsEnabledReplayModelFrameCount:
    number
  readonly requirementsEnabledEventCount:
    number
  readonly requirementsEnabledReplayModelEventCount:
    number
  readonly requirementsEnabledResultCount:
    number

  readonly requirementsEnabledAllStatesValid:
    boolean
  readonly requirementsEnabledSnapshotsValid:
    boolean
  readonly requirementsEnabledOutputContractValid:
    boolean
  readonly requirementsEnabledResultRanksContiguous:
    boolean
  readonly requirementsEnabledEventSequencesContiguous:
    boolean

  readonly omittedEqualsExplicit:
    boolean
  readonly calibratedEqualsRepeated:
    boolean
  readonly calibratedEqualsDirect:
    boolean

  readonly tickCount: number
  readonly transitionCount: number
  readonly createdCount: number
  readonly caughtCount: number
  readonly finalGroupCount: number
  readonly maximumPressureSeconds: number

  readonly snapshotCount: number
  readonly outputFrameCount: number
  readonly replayModelFrameCount: number
  readonly eventCount: number
  readonly replayModelEventCount: number

  readonly winnerRiderName: string
  readonly winnerGroupId: string
  readonly winnerElapsedSeconds: number
  readonly resultCount: number

  readonly allStatesValid: boolean
  readonly snapshotsValid: boolean
  readonly outputContractValid: boolean
  readonly resultRanksContiguous: boolean
  readonly eventSequencesContiguous: boolean
  readonly transitionEventsMatch: boolean
  readonly exactFinishTimingPresent:
    boolean
  readonly finalPressureZero: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly omittedOutput:
    SimulationOutput
  readonly explicitExistingOutput:
    SimulationOutput
  readonly calibratedOutput:
    SimulationOutput
  readonly repeatedCalibratedOutput:
    SimulationOutput
  readonly calibratedStage:
    RunCalibratedTerrainSeparationStageResult

  readonly requirementsEnabledOutput:
    SimulationOutput

  readonly repeatedRequirementsEnabledOutput:
    SimulationOutput

  readonly requirementsEnabledStage:
    RunCalibratedTerrainSeparationStageResult

  readonly summary:
    ScenarioSummary
  readonly transitions:
    readonly TransitionRow[]
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly scenarios:
    Readonly<
      Record<
        ScenarioKey,
        ScenarioAudit
      >
    >
  readonly invalidModeRejected:
    boolean
  readonly weatherScenarios:
    Readonly<
      Record<
        WeatherScenarioKey,
        WeatherScenarioAudit
      >
    >
  readonly activeWeatherRaces:
    Readonly<
      Record<
        Exclude<
          WeatherScenarioKey,
          'neutral'
        >,
        ActiveWeatherRaceAudit
      >
    >
  readonly checks:
    readonly CheckResult[]
}

const CONTROLLED_DISTANCE_KM =
  10

const EPSILON =
  0.0000001


function createWeather(
  overrides:
    Partial<StageWeatherInput>,
): StageWeatherInput {
  return {
    authority:
      'stage_weather_snapshot',
    source:
      'phase_8g4_controlled_fixture',
    condition:
      'clear',
    summary:
      null,
    averageTemperatureC:
      20,
    minimumTemperatureC:
      15,
    maximumTemperatureC:
      25,
    windSpeedKmh:
      5,
    precipitationMm:
      0,
    hostCity:
      'Controlled test',
    countryCode:
      'XX',
    ...overrides,
  }
}

function weatherDefinitions():
  readonly WeatherScenarioDefinition[] {
  return [
    {
      key:
        'neutral',
      label:
        'Neutral · 20°C · 5 km/h · dry',
      weather:
        createWeather({}),
    },
    {
      key:
        'strongWind',
      label:
        'Strong wind · 20°C · 35 km/h · dry',
      weather:
        createWeather({
          windSpeedKmh:
            35,
        }),
    },
    {
      key:
        'heat',
      label:
        'Heat · 34°C · 5 km/h · dry',
      weather:
        createWeather({
          averageTemperatureC:
            34,
          minimumTemperatureC:
            29,
          maximumTemperatureC:
            39,
        }),
    },
    {
      key:
        'coldRain',
      label:
        'Cold rain · 5°C · 8 km/h',
      weather:
        createWeather({
          condition:
            'rain',
          averageTemperatureC:
            5,
          minimumTemperatureC:
            2,
          maximumTemperatureC:
            8,
          windSpeedKmh:
            8,
          precipitationMm:
            8,
        }),
    },
    {
      key:
        'combinedSevere',
      label:
        'Combined · 34°C · 35 km/h · heavy rain',
      weather:
        createWeather({
          condition:
            'heavy_rain',
          averageTemperatureC:
            34,
          minimumTemperatureC:
            30,
          maximumTemperatureC:
            39,
          windSpeedKmh:
            35,
          precipitationMm:
            18,
        }),
    },
  ]
}

function weatherScenarioAudit(
  definition:
    WeatherScenarioDefinition,
): WeatherScenarioAudit {
  const effects =
    calculateWeatherPerformanceEffects(
      definition.weather,
    )

  const repeatedEffects =
    calculateWeatherPerformanceEffects(
      definition.weather,
    )

  return {
    definition,
    effects,
    repeatedEffects,
    deterministicHash:
      createCanonicalHashedValue(
        effects,
      ).hash,
    repeatedHash:
      createCanonicalHashedValue(
        repeatedEffects,
      ).hash,
  }
}


const CONTROLLED_WEATHER_DISTANCE_KM =
  4

function createControlledWeatherRaceInput(
  weather?:
    StageWeatherInput,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const {
    weather:
      _baseWeather,
    ...weatherFreeBase
  } = base

  return {
    ...weatherFreeBase,
    raceId:
      `${base.raceId}-active-weather`,
    stageId:
      `${base.stageId}-active-weather`,
    stageName:
      'Active deterministic weather integration',
    distanceKm:
      CONTROLLED_WEATHER_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          CONTROLLED_WEATHER_DISTANCE_KM,
        elevationMetres: 0,
      },
    ],
    orders: [],
    ...(weather
      ? {
          weather,
        }
      : {}),
  }
}

function getWinnerTimeSeconds(
  output:
    SimulationOutput,
): number {
  const winner =
    output.finalRiderStates.find(
      (rider) =>
        rider.finishPosition ===
          1 &&
        rider.finishTimeSeconds !==
          null,
    )

  if (
    !winner ||
    winner.finishTimeSeconds ===
      null
  ) {
    throw new Error(
      'CalibratedSimulationModeDiagnostic: active weather scenario has no winner.',
    )
  }

  return winner
    .finishTimeSeconds
}

function averageFinalEnergy(
  output:
    SimulationOutput,
): number {
  if (
    output.finalRiderStates.length ===
    0
  ) {
    return 0
  }

  return (
    output.finalRiderStates.reduce(
      (
        sum,
        rider,
      ) =>
        sum +
        rider.energy,
      0,
    ) /
    output.finalRiderStates.length
  )
}

function averageFinalRuntimeFatigue(
  output:
    SimulationOutput,
): number {
  if (
    output.finalRiderStates.length ===
    0
  ) {
    return 0
  }

  return (
    output.finalRiderStates.reduce(
      (
        sum,
        rider,
      ) =>
        sum +
        (
          rider.runtimeFatigue ??
          0
        ),
      0,
    ) /
    output.finalRiderStates.length
  )
}

function activeWeatherRaceAudit(
  definition:
    WeatherScenarioDefinition,
): ActiveWeatherRaceAudit {
  const baselineInput =
    createControlledWeatherRaceInput()

  const weatherInput =
    createControlledWeatherRaceInput(
      definition.weather,
    )

  const baselineOutput =
    runDeterministicRoadRace(
      baselineInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const weatherOutput =
    runDeterministicRoadRace(
      weatherInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const repeatedWeatherOutput =
    runDeterministicRoadRace(
      weatherInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const existingBaselineOutput =
    runDeterministicRoadRace(
      baselineInput,
      {
        simulationMode:
          'existing_v1',
      },
    )

  const existingWeatherOutput =
    runDeterministicRoadRace(
      weatherInput,
      {
        simulationMode:
          'existing_v1',
      },
    )

  const replayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        weatherInput,
      simulationOutput:
        weatherOutput,
    })

  const baselineWinnerTimeSeconds =
    getWinnerTimeSeconds(
      baselineOutput,
    )

  const weatherWinnerTimeSeconds =
    getWinnerTimeSeconds(
      weatherOutput,
    )

  const baselineAverageFinalEnergy =
    averageFinalEnergy(
      baselineOutput,
    )

  const weatherAverageFinalEnergy =
    averageFinalEnergy(
      weatherOutput,
    )

  const baselineAverageFinalRuntimeFatigue =
    averageFinalRuntimeFatigue(
      baselineOutput,
    )

  const weatherAverageFinalRuntimeFatigue =
    averageFinalRuntimeFatigue(
      weatherOutput,
    )

  return {
    definition,
    baselineOutput,
    weatherOutput,
    repeatedWeatherOutput,
    existingBaselineOutput,
    existingWeatherOutput,

    baselineOutputHash:
      outputHash(
        baselineOutput,
      ),
    weatherOutputHash:
      outputHash(
        weatherOutput,
      ),
    repeatedWeatherOutputHash:
      outputHash(
        repeatedWeatherOutput,
      ),
    existingBaselineOutputHash:
      outputHash(
        existingBaselineOutput,
      ),
    existingWeatherOutputHash:
      outputHash(
        existingWeatherOutput,
      ),

    baselineWinnerTimeSeconds,
    weatherWinnerTimeSeconds,
    winnerTimeDifferenceSeconds:
      weatherWinnerTimeSeconds -
      baselineWinnerTimeSeconds,

    baselineAverageFinalEnergy,
    weatherAverageFinalEnergy,
    averageFinalEnergyDifference:
      weatherAverageFinalEnergy -
      baselineAverageFinalEnergy,

    baselineAverageFinalRuntimeFatigue,
    weatherAverageFinalRuntimeFatigue,
    averageFinalRuntimeFatigueDifference:
      weatherAverageFinalRuntimeFatigue -
      baselineAverageFinalRuntimeFatigue,

    replayFrameCount:
      replayModel.frames.length,
    replayEventCount:
      replayModel.events.length,
  }
}

function definitions():
  readonly ScenarioDefinition[] {
  return [
    {
      key:
        'gradient8',
      label:
        'Constant 8% · 10 km',
      gradientPercent: 8,
      expectedTransitionCount: 7,
      expectedCreatedCount: 5,
      expectedCaughtCount: 2,
      expectedFinalGroupCount: 6,
    },
    {
      key:
        'gradient10',
      label:
        'Constant 10% · 10 km',
      gradientPercent: 10,
      expectedTransitionCount: 8,
      expectedCreatedCount: 6,
      expectedCaughtCount: 2,
      expectedFinalGroupCount: 7,
    },
    {
      key:
        'gradient12',
      label:
        'Constant 12% · 10 km',
      gradientPercent: 12,
      expectedTransitionCount: 7,
      expectedCreatedCount: 5,
      expectedCaughtCount: 2,
      expectedFinalGroupCount: 6,
    },
    {
      key:
        'gradient15',
      label:
        'Constant 15% · 10 km',
      gradientPercent: 15,
      expectedTransitionCount: 7,
      expectedCreatedCount: 5,
      expectedCaughtCount: 2,
      expectedFinalGroupCount: 6,
    },
    {
      key:
        'rio',
      label:
        'Real Rio Stage 1',
      gradientPercent:
        null,
      expectedTransitionCount: 0,
      expectedCreatedCount: 0,
      expectedCaughtCount: 0,
      expectedFinalGroupCount: 1,
    },
  ]
}

function createInput(
  definition:
    ScenarioDefinition,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const {
    weather:
      _fixtureWeather,
    ...weatherFreeBase
  } = base

  if (
    definition.gradientPercent ===
    null
  ) {
    return weatherFreeBase
  }

  return {
    ...weatherFreeBase,
    raceId:
      `${base.raceId}-calibrated-mode-${definition.key}`,
    stageId:
      `${base.stageId}-calibrated-mode-${definition.key}`,
    stageName:
      `Calibrated mode · ${definition.label}`,
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
            definition
              .gradientPercent /
            100
          ),
      },
    ],
    orders: [],
  }
}

function outputHash(
  output:
    SimulationOutput,
): string {
  return createCanonicalHashedValue(
    output,
  ).hash
}

function outputsEqual(
  left:
    SimulationOutput,
  right:
    SimulationOutput,
): boolean {
  return (
    createCanonicalHashedValue(
      left,
    ).canonicalJson ===
    createCanonicalHashedValue(
      right,
    ).canonicalJson
  )
}

function ranksContiguous(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  return (
    JSON.stringify(
      stage.results.map(
        (result) =>
          result.rank,
      ),
    ) ===
    JSON.stringify(
      Array.from(
        {
          length:
            stage.results.length,
        },
        (
          _,
          index,
        ) =>
          index + 1,
      ),
    )
  )
}

function eventSequencesContiguous(
  output:
    SimulationOutput,
): boolean {
  return output.events.every(
    (
      event,
      index,
    ) =>
      event.sequenceNumber ===
      index + 1,
  )
}

function snapshotsValid(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  const snapshots =
    stage.replaySnapshots

  if (
    snapshots.length ===
    0
  ) {
    return false
  }

  return snapshots.every(
    (
      snapshot,
      index,
    ) => {
      const previous =
        index > 0
          ? snapshots[
              index - 1
            ]
          : null

      return (
        snapshot.sequenceNumber ===
          index + 1 &&
        (
          !previous ||
          snapshot.raceSecond >=
            previous.raceSecond
        ) &&
        /^[0-9a-f]{16}$/.test(
          snapshot
            .deterministicHash,
        ) &&
        snapshot.riderCount ===
          96 &&
        snapshot.groupCount ===
          Object.keys(
            snapshot.groups,
          ).length &&
        snapshot.activeGroupCount ===
          Object.values(
            snapshot.groups,
          ).filter(
            (group) =>
              group.active,
          ).length
      )
    },
  )
}

function allStatesValid(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  try {
    validateSimulationState(
      stage.initialState,
    )

    for (
      const tick of
      stage.ticks
    ) {
      validateSimulationState(
        tick.state,
      )
    }

    validateSimulationState(
      stage.finalState,
    )

    return true
  } catch {
    return false
  }
}

function winnerDetails(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): {
  readonly riderName: string
  readonly groupId: string
  readonly elapsedSeconds: number
} {
  const winner =
    stage.results.find(
      (result) =>
        result.rank === 1,
    )

  if (!winner) {
    throw new Error(
      'CalibratedSimulationModeDiagnostic: missing calibrated winner.',
    )
  }

  const rider =
    stage.finalState.riders[
      winner.riderId
    ]

  if (!rider) {
    throw new Error(
      'CalibratedSimulationModeDiagnostic: missing calibrated winner rider.',
    )
  }

  return {
    riderName:
      rider.riderName,
    groupId:
      rider.currentGroupId,
    elapsedSeconds:
      winner.elapsedSeconds,
  }
}

function transitionRows(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): readonly TransitionRow[] {
  return stage.transitions.map(
    (
      transition,
      index,
    ) => ({
      transitionNumber:
        index + 1,
      kind:
        transition
          .transitionKind,
      raceSecond:
        transition.raceSecond,
      kilometre:
        transition.kilometre,
      sourceGroupId:
        transition.sourceGroupId,
      targetGroupId:
        transition.targetGroupId,
      movedRiderCount:
        transition
          .movedRiderIds.length,
      eventType:
        transition.event
          ?.eventType ??
        null,
      eventSequenceNumber:
        transition.event
          ?.sequenceNumber ??
        null,
    }),
  )
}

function transitionEventsMatch(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  return stage.transitions.every(
    (transition) => {
      const event =
        transition.event

      if (!event) {
        return false
      }

      const expectedType =
        transition
          .transitionKind ===
          'created'
          ? 'GROUP_CREATED'
          : 'GROUP_CAUGHT'

      return (
        event.eventType ===
          expectedType &&
        event.raceSecond ===
          transition.raceSecond &&
        event.kmMarker ===
          transition.kilometre &&
        event.sourceGroupId ===
          transition.sourceGroupId &&
        event.targetGroupId ===
          transition.targetGroupId &&
        JSON.stringify(
          event.relatedRiderIds,
        ) ===
        JSON.stringify(
          transition
            .movedRiderIds,
        )
      )
    },
  )
}

function outputContractValid(
  output:
    SimulationOutput,
  input:
    StageInput,
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  if (
    output.raceId !==
      input.raceId ||
    output.stageId !==
      input.stageId ||
    output.seed !==
      input.seed ||
    output.engineVersion !==
      'race_engine_ts_v1' ||
    output.simulationMode !==
      'deterministic_road_race_v1'
  ) {
    return false
  }

  if (
    output.snapshots.length !==
      stage.replaySnapshots
        .length ||
    output.events.length !==
      stage.events.length ||
    output.finalRiderStates
      .length !== 96
  ) {
    return false
  }

  return output.snapshots.every(
    (
      snapshot,
      index,
    ) => {
      const source =
        stage.replaySnapshots[
          index
        ]

      return (
        !!source &&
        snapshot.frameNumber ===
          source.sequenceNumber &&
        snapshot.raceSecond ===
          source.raceSecond &&
        snapshot.km ===
          source.currentKm &&
        JSON.stringify(
          snapshot.groupOrder,
        ) ===
        JSON.stringify(
          snapshot.groups.map(
            (group) =>
              group.groupId,
          ),
        )
      )
    },
  )
}

function maximumPressure(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): number {
  return Math.max(
    0,
    ...stage.ticks.map(
      (tick) =>
        Math.max(
          0,
          ...Object.values(
            tick.state
              .separationPressureSecondsByRiderId,
          ),
        ),
    ),
  )
}

function exactFinishTimingPresent(
  stage:
    RunCalibratedTerrainSeparationStageResult,
): boolean {
  return stage.results.some(
    (result) =>
      Math.abs(
        result.elapsedSeconds /
          30 -
        Math.round(
          result.elapsedSeconds /
            30,
        ),
      ) >
      EPSILON,
  )
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
): ScenarioAudit {
  const input =
    createInput(
      definition,
    )

  const omittedOutput =
    runDeterministicRoadRace(
      input,
    )

  const explicitExistingOutput =
    runDeterministicRoadRace(
      input,
      {
        simulationMode:
          'existing_v1',
      },
    )

  const calibratedOutput =
    runDeterministicRoadRace(
      input,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const repeatedCalibratedOutput =
    runDeterministicRoadRace(
      input,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const calibratedStage =
    runCalibratedTerrainSeparationStage(
      createInitialState(
        input,
      ),
    )

  const directCalibratedOutput =
    createMultiGroupSimulationOutput(
      calibratedStage,
    )

  const createRequirementsEnabledInitialState =
    () => ({
      ...createInitialState(
        input,
      ),
      groupShelterEnergyEnabled:
        true,
      groupCooperationPaceEnabled:
        true,
      controlledAttackLaunchEnabled:
        true,
      finalStagePelotonEffortEnabled:
        true,
      flatStageChaseEffortEnabled:
        true,
    })

  const requirementsEnabledStage =
    runCalibratedTerrainSeparationStage(
      createRequirementsEnabledInitialState(),
    )

  const repeatedRequirementsEnabledStage =
    runCalibratedTerrainSeparationStage(
      createRequirementsEnabledInitialState(),
    )

  const requirementsEnabledOutput =
    createMultiGroupSimulationOutput(
      requirementsEnabledStage,
    )

  const repeatedRequirementsEnabledOutput =
    createMultiGroupSimulationOutput(
      repeatedRequirementsEnabledStage,
    )

  const requirementsEnabledReplayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        input,
      simulationOutput:
        requirementsEnabledOutput,
    })

  const replayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        input,
      simulationOutput:
        calibratedOutput,
    })

  const winner =
    winnerDetails(
      calibratedStage,
    )

  const transitions =
    transitionRows(
      calibratedStage,
    )

  const createdCount =
    calibratedStage
      .transitions
      .filter(
        (transition) =>
          transition
            .transitionKind ===
          'created',
      )
      .length

  const caughtCount =
    calibratedStage
      .transitions
      .filter(
        (transition) =>
          transition
            .transitionKind ===
          'consolidated',
      )
      .length

  const auditBase = {
    definition,
    omittedOutputHash:
      outputHash(
        omittedOutput,
      ),
    explicitExistingOutputHash:
      outputHash(
        explicitExistingOutput,
      ),
    calibratedOutputHash:
      outputHash(
        calibratedOutput,
      ),
    repeatedCalibratedOutputHash:
      outputHash(
        repeatedCalibratedOutput,
      ),
    directCalibratedOutputHash:
      outputHash(
        directCalibratedOutput,
      ),
    calibratedStageHash:
      calibratedStage
        .deterministicHash,
    replayCollectionHash:
      calibratedStage
        .replayCollection
        .deterministicHash,

    requirementsEnabledOutputHash:
      outputHash(
        requirementsEnabledOutput,
      ),
    repeatedRequirementsEnabledOutputHash:
      outputHash(
        repeatedRequirementsEnabledOutput,
      ),
    requirementsEnabledStageHash:
      requirementsEnabledStage
        .deterministicHash,
    requirementsEnabledReplayCollectionHash:
      requirementsEnabledStage
        .replayCollection
        .deterministicHash,

    transitions,
  }

  const auditHash =
    createCanonicalHashedValue(
      auditBase,
    ).hash

  const summary:
    ScenarioSummary = {
      label:
        definition.label,

      omittedOutputHash:
        auditBase
          .omittedOutputHash,
      explicitExistingOutputHash:
        auditBase
          .explicitExistingOutputHash,
      calibratedOutputHash:
        auditBase
          .calibratedOutputHash,
      repeatedCalibratedOutputHash:
        auditBase
          .repeatedCalibratedOutputHash,
      directCalibratedOutputHash:
        auditBase
          .directCalibratedOutputHash,
      calibratedStageHash:
        auditBase
          .calibratedStageHash,
      replayCollectionHash:
        auditBase
          .replayCollectionHash,
      auditHash,

      requirementsEnabledOutputHash:
        auditBase
          .requirementsEnabledOutputHash,
      repeatedRequirementsEnabledOutputHash:
        auditBase
          .repeatedRequirementsEnabledOutputHash,
      requirementsEnabledStageHash:
        auditBase
          .requirementsEnabledStageHash,
      requirementsEnabledReplayCollectionHash:
        auditBase
          .requirementsEnabledReplayCollectionHash,

      requirementsEnabledEqualsRepeated:
        outputsEqual(
          requirementsEnabledOutput,
          repeatedRequirementsEnabledOutput,
        ),
      requirementsEnabledCompleted:
        requirementsEnabledStage
          .finalState
          .completed,

      omittedEqualsExplicit:
        outputsEqual(
          omittedOutput,
          explicitExistingOutput,
        ),
      calibratedEqualsRepeated:
        outputsEqual(
          calibratedOutput,
          repeatedCalibratedOutput,
        ),
      calibratedEqualsDirect:
        outputsEqual(
          calibratedOutput,
          directCalibratedOutput,
        ),

      tickCount:
        calibratedStage
          .tickCount,
      transitionCount:
        calibratedStage
          .transitions.length,
      createdCount,
      caughtCount,
      finalGroupCount:
        Object.keys(
          calibratedStage
            .finalState.groups,
        ).length,
      maximumPressureSeconds:
        maximumPressure(
          calibratedStage,
        ),

      snapshotCount:
        calibratedStage
          .replaySnapshots.length,
      outputFrameCount:
        calibratedOutput
          .snapshots.length,
      replayModelFrameCount:
        replayModel.frames.length,
      eventCount:
        calibratedOutput
          .events.length,
      replayModelEventCount:
        replayModel.events.length,

      requirementsEnabledTickCount:
        requirementsEnabledStage
          .tickCount,
      requirementsEnabledSnapshotCount:
        requirementsEnabledStage
          .replaySnapshots
          .length,
      requirementsEnabledOutputFrameCount:
        requirementsEnabledOutput
          .snapshots
          .length,
      requirementsEnabledReplayModelFrameCount:
        requirementsEnabledReplayModel
          .frames
          .length,
      requirementsEnabledEventCount:
        requirementsEnabledOutput
          .events
          .length,
      requirementsEnabledReplayModelEventCount:
        requirementsEnabledReplayModel
          .events
          .length,
      requirementsEnabledResultCount:
        requirementsEnabledStage
          .results
          .length,

      winnerRiderName:
        winner.riderName,
      winnerGroupId:
        winner.groupId,
      winnerElapsedSeconds:
        winner.elapsedSeconds,
      resultCount:
        calibratedStage
          .results.length,

      allStatesValid:
        allStatesValid(
          calibratedStage,
        ),
      snapshotsValid:
        snapshotsValid(
          calibratedStage,
        ),
      outputContractValid:
        outputContractValid(
          calibratedOutput,
          input,
          calibratedStage,
        ),
      resultRanksContiguous:
        ranksContiguous(
          calibratedStage,
        ),
      eventSequencesContiguous:
        eventSequencesContiguous(
          calibratedOutput,
        ),

      requirementsEnabledAllStatesValid:
        allStatesValid(
          requirementsEnabledStage,
        ),
      requirementsEnabledSnapshotsValid:
        snapshotsValid(
          requirementsEnabledStage,
        ),
      requirementsEnabledOutputContractValid:
        outputContractValid(
          requirementsEnabledOutput,
          input,
          requirementsEnabledStage,
        ),
      requirementsEnabledResultRanksContiguous:
        ranksContiguous(
          requirementsEnabledStage,
        ),
      requirementsEnabledEventSequencesContiguous:
        eventSequencesContiguous(
          requirementsEnabledOutput,
        ),

      transitionEventsMatch:
        transitionEventsMatch(
          calibratedStage,
        ),
      exactFinishTimingPresent:
        exactFinishTimingPresent(
          calibratedStage,
        ),
      finalPressureZero:
        Object.values(
          calibratedStage
            .finalState
            .separationPressureSecondsByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
    }

  return {
    definition,
    omittedOutput,
    explicitExistingOutput,
    calibratedOutput,
    repeatedCalibratedOutput,
    calibratedStage,
    requirementsEnabledOutput,
    repeatedRequirementsEnabledOutput,
    requirementsEnabledStage,
    summary,
    transitions,
  }
}

function invalidModeRejected():
  boolean {
  try {
    runDeterministicRoadRace(
      createInput(
        definitions()[4]!,
      ),
      {
        simulationMode:
          'invalid_mode' as
            MultiGroupSimulationMode,
      },
    )

    return false
  } catch {
    return true
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const scenarios =
    Object.fromEntries(
      definitions().map(
        (definition) => [
          definition.key,
          scenarioAudit(
            definition,
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      ScenarioAudit
    >

  const all =
    Object.values(
      scenarios,
    )

  const controlled = [
    scenarios.gradient8,
    scenarios.gradient10,
    scenarios.gradient12,
    scenarios.gradient15,
  ]

  const invalidRejected =
    invalidModeRejected()

  const weatherScenarios =
    Object.fromEntries(
      weatherDefinitions().map(
        (definition) => [
          definition.key,
          weatherScenarioAudit(
            definition,
          ),
        ],
      ),
    ) as Record<
      WeatherScenarioKey,
      WeatherScenarioAudit
    >

  const activeWeatherRaces =
    Object.fromEntries(
      weatherDefinitions()
        .filter(
          (
            definition,
          ): definition is
            WeatherScenarioDefinition &
            {
              readonly key:
                Exclude<
                  WeatherScenarioKey,
                  'neutral'
                >
            } =>
            definition.key !==
            'neutral',
        )
        .map(
          (definition) => [
            definition.key,
            activeWeatherRaceAudit(
              definition,
            ),
          ],
        ),
    ) as Record<
      Exclude<
        WeatherScenarioKey,
        'neutral'
      >,
      ActiveWeatherRaceAudit
    >

  const neutralWeather =
    weatherScenarios.neutral
      .effects

  const strongWindWeather =
    weatherScenarios.strongWind
      .effects

  const heatWeather =
    weatherScenarios.heat
      .effects

  const coldRainWeather =
    weatherScenarios.coldRain
      .effects

  const combinedWeather =
    weatherScenarios
      .combinedSevere
      .effects

  const checks:
    CheckResult[] = [
      {
        label:
          'Latest accepted terrain-aware movement implementation is loaded',
        passed:
          TERRAIN_AWARE_MULTI_GROUP_MOVEMENT_VERSION ===
          'phase_8g5c_latest_weather_direct_v1',
      },
      {
        label:
          'Missing and neutral weather preserve identity multipliers',
        passed:
          calculateWeatherPerformanceEffects(
            undefined,
          ).speedMultiplier ===
            1 &&
          neutralWeather
            .speedMultiplier ===
            1 &&
          neutralWeather
            .energyConsumptionMultiplier ===
            1 &&
          neutralWeather
            .staminaConsumptionMultiplier ===
            1 &&
          neutralWeather
            .fatigueGainMultiplier ===
            1 &&
          neutralWeather
            .incidentProbabilityMultiplier ===
            1,
      },
      {
        label:
          'Strong wind reduces speed and increases energy and stamina consumption',
        passed:
          strongWindWeather
            .speedMultiplier <
            1 &&
          strongWindWeather
            .energyConsumptionMultiplier >
            1 &&
          strongWindWeather
            .staminaConsumptionMultiplier >
            1,
      },
      {
        label:
          'Strong wind increases the future incident-probability input',
        passed:
          strongWindWeather
            .incidentProbabilityMultiplier >
            1,
      },
      {
        label:
          'Temperatures above 30°C increase energy, stamina, and fatigue demand',
        passed:
          heatWeather
            .energyConsumptionMultiplier >
            1 &&
          heatWeather
            .staminaConsumptionMultiplier >
            1 &&
          heatWeather
            .fatigueGainMultiplier >
            1,
      },
      {
        label:
          'Cold rain reduces speed and increases rider demand and incident input',
        passed:
          coldRainWeather
            .speedMultiplier <
            1 &&
          coldRainWeather
            .energyConsumptionMultiplier >
            1 &&
          coldRainWeather
            .fatigueGainMultiplier >
            1 &&
          coldRainWeather
            .incidentProbabilityMultiplier >
            1,
      },
      {
        label:
          'Combined severe weather is deterministic, bounded, and stronger than isolated weather',
        passed:
          weatherScenarios
            .combinedSevere
            .deterministicHash ===
          weatherScenarios
            .combinedSevere
            .repeatedHash &&
          combinedWeather
            .speedMultiplier >=
            0.75 &&
          combinedWeather
            .speedMultiplier <
            strongWindWeather
              .speedMultiplier &&
          combinedWeather
            .energyConsumptionMultiplier >
            strongWindWeather
              .energyConsumptionMultiplier &&
          combinedWeather
            .fatigueGainMultiplier >
            heatWeather
              .fatigueGainMultiplier &&
          combinedWeather
            .incidentProbabilityMultiplier >
            strongWindWeather
              .incidentProbabilityMultiplier,
      },
      {
        label:
          'Active calibrated weather races remain deterministic',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit.weatherOutputHash ===
              audit
                .repeatedWeatherOutputHash,
          ),
      },
      {
        label:
          'Active weather slows calibrated race completion',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit
                .winnerTimeDifferenceSeconds >
              0,
          ),
      },
      {
        label:
          'Active weather increases runtime energy and stamina consumption',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit
                .averageFinalEnergyDifference <
              0,
          ),
      },
      {
        label:
          'Strong wind alone preserves neutral runtime fatigue',
        passed:
          activeWeatherRaces
            .strongWind
            .averageFinalRuntimeFatigueDifference ===
          0,
      },
      {
        label:
          'Temperatures above 30°C create deterministic runtime fatigue',
        passed:
          activeWeatherRaces
            .heat
            .averageFinalRuntimeFatigueDifference >
          0,
      },
      {
        label:
          'Cold rain creates deterministic runtime fatigue',
        passed:
          activeWeatherRaces
            .coldRain
            .averageFinalRuntimeFatigueDifference >
          0,
      },
      {
        label:
          'Combined severe weather creates the greatest runtime fatigue',
        passed:
          activeWeatherRaces
            .combinedSevere
            .averageFinalRuntimeFatigueDifference >
            activeWeatherRaces
              .heat
              .averageFinalRuntimeFatigueDifference &&
          activeWeatherRaces
            .combinedSevere
            .averageFinalRuntimeFatigueDifference >
            activeWeatherRaces
              .coldRain
              .averageFinalRuntimeFatigueDifference,
      },
      {
        label:
          'Runtime fatigue remains metadata-only for accepted controlled finish times',
        passed:
          Math.abs(
            activeWeatherRaces
              .strongWind
              .weatherWinnerTimeSeconds -
            353.496
          ) <=
            0.001 &&
          Math.abs(
            activeWeatherRaces
              .heat
              .weatherWinnerTimeSeconds -
            334.966
          ) <=
            0.001 &&
          Math.abs(
            activeWeatherRaces
              .coldRain
              .weatherWinnerTimeSeconds -
            345.151
          ) <=
            0.001 &&
          Math.abs(
            activeWeatherRaces
              .combinedSevere
              .weatherWinnerTimeSeconds -
            379.092
          ) <=
            0.001,
      },
      {
        label:
          'Every runtime-fatigue value remains bounded between zero and one hundred',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit.weatherOutput
                .finalRiderStates
                .every(
                  (rider) =>
                    (
                      rider.runtimeFatigue ??
                      0
                    ) >= 0 &&
                    (
                      rider.runtimeFatigue ??
                      0
                    ) <= 100,
                ),
          ),
      },
      {
        label:
          'Active weather outputs remain replay-compatible',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit.replayFrameCount >
                1 &&
              audit.replayEventCount >
                0,
          ),
      },
      {
        label:
          'existing_v1 remains weather-neutral',
        passed:
          Object.values(
            activeWeatherRaces,
          ).every(
            (audit) =>
              audit
                .existingBaselineOutputHash ===
              audit
                .existingWeatherOutputHash,
          ),
      },
      {
        label:
          'Omitted mode equals explicit existing_v1 for every scenario',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .omittedEqualsExplicit,
          ),
      },
      {
        label:
          'Repeated calibrated road-race outputs are identical',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .calibratedEqualsRepeated,
          ),
      },
      {
        label:
          'Public calibrated output equals direct calibrated-stage adaptation',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .calibratedEqualsDirect,
          ),
      },
      {
        label:
          'Unsupported simulation modes are rejected',
        passed:
          invalidRejected,
      },
      {
        label:
          'Both public modes preserve the authoritative SimulationOutput contract',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .outputContractValid &&
              scenario.omittedOutput
                .engineVersion ===
                'race_engine_ts_v1' &&
              scenario.omittedOutput
                .simulationMode ===
                'deterministic_road_race_v1',
          ),
      },
      {
        label:
          'Every calibrated state passes structural validation',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .allStatesValid,
          ),
      },
      {
        label:
          'Every calibrated replay snapshot sequence and hash is valid',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .snapshotsValid,
          ),
      },
      {
        label:
          'Output frames and generic replay frames equal calibrated snapshots',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .snapshotCount ===
                scenario.summary
                  .outputFrameCount &&
              scenario.summary
                .snapshotCount ===
                scenario.summary
                  .replayModelFrameCount,
          ),
      },
      {
        label:
          'Generic replay events equal authoritative calibrated events',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .eventCount ===
              scenario.summary
                .replayModelEventCount,
          ),
      },
      {
        label:
          'Controlled calibrated transition counts match the verified package',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .transitionCount ===
              scenario.definition
                .expectedTransitionCount &&
              scenario.summary
                .createdCount ===
              scenario.definition
                .expectedCreatedCount &&
              scenario.summary
                .caughtCount ===
              scenario.definition
                .expectedCaughtCount,
          ),
      },
      {
        label:
          'Controlled calibrated final group counts match the verified package',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .finalGroupCount ===
              scenario.definition
                .expectedFinalGroupCount,
          ),
      },
      {
        label:
          'The peloton contains every controlled calibrated winner',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .winnerGroupId ===
              INITIAL_PELOTON_GROUP_ID,
          ),
      },
      {
        label:
          'Calibrated finish times include sub-tick precision',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .exactFinishTimingPresent,
          ),
      },
      {
        label:
          'Every transition has its matching deterministic race event',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .transitionEventsMatch,
          ),
      },
      {
        label:
          'Every calibrated event sequence is contiguous',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .eventSequencesContiguous,
          ),
      },
      {
        label:
          'Every calibrated scenario completes with 96 contiguous results',
        passed:
          all.every(
            (scenario) =>
              scenario.calibratedStage
                .completed &&
              scenario.summary
                .resultCount === 96 &&
              scenario.summary
                .resultRanksContiguous,
          ),
      },
      {
        label:
          'Every calibrated scenario finishes with zero authoritative pressure',
        passed:
          all.every(
            (scenario) =>
              scenario.summary
                .finalPressureZero,
          ),
      },
      {
        label:
          'Calibrated Rio remains one group with zero transitions and zero pressure',
        passed:
          scenarios.rio.summary
            .tickCount === 394 &&
          scenarios.rio.summary
            .transitionCount === 0 &&
          scenarios.rio.summary
            .finalGroupCount === 1 &&
          scenarios.rio.summary
            .maximumPressureSeconds ===
            0 &&
          scenarios.rio.summary
            .eventCount === 98 &&
          scenarios.rio.summary
            .snapshotCount === 395,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    scenarios,
    invalidModeRejected:
      invalidRejected,
    weatherScenarios,
    activeWeatherRaces,
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



function ActiveWeatherRaceCard({
  audit,
}: {
  readonly audit:
    ActiveWeatherRaceAudit
}): JSX.Element {
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">
        {audit.definition.label}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <Row
          label="Winner time baseline / weather"
          value={`${format(audit.baselineWinnerTimeSeconds)} / ${format(audit.weatherWinnerTimeSeconds)}s`}
        />

        <Row
          label="Weather time loss"
          value={`${format(audit.winnerTimeDifferenceSeconds)}s`}
        />

        <Row
          label="Average final energy baseline / weather"
          value={`${format(audit.baselineAverageFinalEnergy)} / ${format(audit.weatherAverageFinalEnergy)}`}
        />

        <Row
          label="Average energy difference"
          value={format(audit.averageFinalEnergyDifference)}
        />

        <Row
          label="Average runtime fatigue baseline / weather"
          value={`${format(audit.baselineAverageFinalRuntimeFatigue)} / ${format(audit.weatherAverageFinalRuntimeFatigue)}`}
        />

        <Row
          label="Average runtime-fatigue difference"
          value={format(audit.averageFinalRuntimeFatigueDifference)}
        />

        <Row
          label="Calibrated hashes"
          value={
            <span className="font-mono text-xs">
              {audit.weatherOutputHash}
              <br />
              {audit.repeatedWeatherOutputHash}
            </span>
          }
        />

        <Row
          label="existing_v1 hashes"
          value={
            <span className="font-mono text-xs">
              {audit.existingBaselineOutputHash}
              <br />
              {audit.existingWeatherOutputHash}
            </span>
          }
        />

        <Row
          label="Replay frames / events"
          value={`${audit.replayFrameCount} / ${audit.replayEventCount}`}
        />
      </dl>
    </article>
  )
}

function WeatherCard({
  scenario,
}: {
  readonly scenario:
    WeatherScenarioAudit
}): JSX.Element {
  const effects =
    scenario.effects

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">
        {scenario.definition.label}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <Row
          label="Speed"
          value={`${format(effects.speedMultiplier, 3)}x`}
        />

        <Row
          label="Energy consumption"
          value={`${format(effects.energyConsumptionMultiplier, 3)}x`}
        />

        <Row
          label="Stamina consumption"
          value={`${format(effects.staminaConsumptionMultiplier, 3)}x`}
        />

        <Row
          label="Fatigue gain"
          value={`${format(effects.fatigueGainMultiplier, 3)}x`}
        />

        <Row
          label="Incident probability input"
          value={`${format(effects.incidentProbabilityMultiplier, 3)}x`}
        />

        <Row
          label="Rain intensity"
          value={effects.rainIntensity}
        />

        <Row
          label="Reasons"
          value={
            effects.reasons.length > 0
              ? effects.reasons.join(', ')
              : 'neutral'
          }
        />

        <Row
          label="Repeated hash"
          value={
            <span className="font-mono text-xs">
              {scenario.deterministicHash}
              <br />
              {scenario.repeatedHash}
            </span>
          }
        />
      </dl>
    </article>
  )
}

function Card({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  const summary =
    scenario.summary

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">
        {summary.label}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <Row
          label="Ticks / transitions"
          value={`${summary.tickCount} / ${summary.transitionCount}`}
        />

        <Row
          label="Created / caught"
          value={`${summary.createdCount} / ${summary.caughtCount}`}
        />

        <Row
          label="Final groups / max pressure"
          value={`${summary.finalGroupCount} / ${summary.maximumPressureSeconds}s`}
        />

        <Row
          label="Snapshots / output / replay"
          value={`${summary.snapshotCount} / ${summary.outputFrameCount} / ${summary.replayModelFrameCount}`}
        />

        <Row
          label="Events / replay events"
          value={`${summary.eventCount} / ${summary.replayModelEventCount}`}
        />

        <Row
          label="Winner"
          value={
            <>
              {summary.winnerRiderName}
              <br />
              <span className="font-mono text-xs">
                {summary.winnerGroupId}
                {' · '}
                {format(
                  summary.winnerElapsedSeconds,
                )}s
              </span>
            </>
          }
        />

        <Row
          label="Omitted / explicit hashes"
          value={
            <span className="font-mono text-xs">
              {summary.omittedOutputHash}
              <br />
              {summary.explicitExistingOutputHash}
            </span>
          }
        />

        <Row
          label="Calibrated / repeated hashes"
          value={
            <span className="font-mono text-xs">
              {summary.calibratedOutputHash}
              <br />
              {summary.repeatedCalibratedOutputHash}
            </span>
          }
        />

        <Row
          label="Direct output hash"
          value={
            <span className="font-mono text-xs">
              {summary.directCalibratedOutputHash}
            </span>
          }
        />

        <Row
          label="Stage / replay collection"
          value={
            <span className="font-mono text-xs">
              {summary.calibratedStageHash}
              <br />
              {summary.replayCollectionHash}
            </span>
          }
        />

        <Row
          label="Audit hash"
          value={
            <span className="font-mono text-xs">
              {summary.auditHash}
            </span>
          }
        />
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

function TransitionTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} calibrated transitions
        </h2>
      </div>

      {scenario.transitions.length >
      0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">
                  #
                </th>
                <th className="px-3 py-3">
                  Kind
                </th>
                <th className="px-3 py-3">
                  Time / km
                </th>
                <th className="px-3 py-3">
                  Source → target
                </th>
                <th className="px-3 py-3">
                  Moved
                </th>
                <th className="px-3 py-3">
                  Event
                </th>
              </tr>
            </thead>

            <tbody>
              {scenario.transitions.map(
                (transition) => (
                  <tr
                    key={`${transition.transitionNumber}-${transition.targetGroupId}`}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3">
                      {transition.transitionNumber}
                    </td>

                    <td className="px-3 py-3">
                      {transition.kind}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {transition.raceSecond}s
                      {' / '}
                      {format(
                        transition.kilometre,
                      )} km
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {transition.sourceGroupId}
                      {' → '}
                      {transition.targetGroupId}
                    </td>

                    <td className="px-3 py-3">
                      {transition.movedRiderCount}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {transition.eventSequenceNumber ??
                      '—'}
                      {' / '}
                      {transition.eventType ??
                      '—'}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-5 text-sm text-slate-400">
          No calibrated transition occurred.
        </p>
      )}
    </section>
  )
}

export default function CalibratedSimulationModeDiagnostic():
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
            Phase 8G.6 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Weather-performance model diagnostic failed
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
      <div className="mx-auto max-w-[1950px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 8G.6 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Safe calibrated mode with runtime weather fatigue
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Preserves existing_v1 as the default, retains the accepted
            calibrated terrain-separation package, and accumulates bounded
            weather-only runtime fatigue as non-authoritative in-memory rider
            metadata.
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
              ? 'PASS — existing calibrated fixtures remain stable and heat plus rain accumulate deterministic runtime fatigue'
              : 'FAIL — calibrated or weather-model verification needs correction'}
          </h2>
        </section>


        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Phase 8G.6 weather and fatigue model
            </div>

            <h2 className="mt-2 text-xl font-semibold">
              Deterministic weather-performance effects
            </h2>

            <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
              Weather multipliers are verified in isolation and used by the
              active calibrated scenarios below. Runtime fatigue is accumulated
              only in memory and remains separate from immutable pre-stage
              fatigue. Incidents, crashes, database persistence, and production
              output remain disconnected.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              value.weatherScenarios.neutral,
              value.weatherScenarios.strongWind,
              value.weatherScenarios.heat,
              value.weatherScenarios.coldRain,
              value.weatherScenarios.combinedSevere,
            ].map(
              (scenario) => (
                <WeatherCard
                  key={scenario.definition.key}
                  scenario={scenario}
                />
              ),
            )}
          </div>
        </section>


        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Phase 8G.6 active calibrated integration
          </div>

          <h2 className="mt-2 text-xl font-semibold">
            Weather changes movement, energy, and runtime fatigue
          </h2>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            These controlled four-kilometre races use the active calibrated
            runner. Weather must slow completion, reduce average final
            energy, and create bounded runtime fatigue only when the resolved
            fatigue multiplier exceeds one. existing_v1 remains neutral.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              value.activeWeatherRaces.strongWind,
              value.activeWeatherRaces.heat,
              value.activeWeatherRaces.coldRain,
              value.activeWeatherRaces.combinedSevere,
            ].map(
              (audit) => (
                <ActiveWeatherRaceCard
                  key={audit.definition.key}
                  audit={audit}
                />
              ),
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card
            scenario={
              value.scenarios
                .gradient8
            }
          />

          <Card
            scenario={
              value.scenarios
                .gradient10
            }
          />

          <Card
            scenario={
              value.scenarios
                .gradient12
            }
          />

          <Card
            scenario={
              value.scenarios
                .gradient15
            }
          />

          <Card
            scenario={
              value.scenarios.rio
            }
          />
        </section>

        {[
          value.scenarios
            .gradient8,
          value.scenarios
            .gradient10,
          value.scenarios
            .gradient12,
          value.scenarios
            .gradient15,
          value.scenarios.rio,
        ].map(
          (scenario) => (
            <TransitionTable
              key={scenario
                .definition.key}
              scenario={
                scenario
              }
            />
          ),
        )}

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
            Omitted mode and explicit existing_v1 use the original runner.
            terrain_separation_calibrated_v1 remains opt-in. Weather speed,
            energy/stamina consumption, and bounded runtime fatigue are enabled
            only by the calibrated wrapper when canonical weather is present.
            Runtime fatigue is metadata-only and does not feed movement,
            separation, finishing, or incidents. Database writes, persistent
            fatigue, crashes, equipment, schedulers, RPC behavior, and
            production execution remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
