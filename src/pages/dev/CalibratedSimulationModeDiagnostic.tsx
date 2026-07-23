/**
 * CalibratedSimulationModeDiagnostic.tsx
 *
 * Phase 7B.8L browser-only diagnostic.
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
  runCalibratedTerrainSeparationStage,
  type RunCalibratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStage'
import {
  runDeterministicRoadRace,
  type MultiGroupSimulationMode,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  createReplayStageModelFromSimulationOutput,
} from '../../race-replay/createReplayStageModelFromSimulationOutput'

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
  readonly checks:
    readonly CheckResult[]
}

const CONTROLLED_DISTANCE_KM =
  10

const EPSILON =
  0.0000001

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

  if (
    definition.gradientPercent ===
    null
  ) {
    return base
  }

  return {
    ...base,
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

  const checks:
    CheckResult[] = [
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
            Phase 7B.8L development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Calibrated simulation-mode integration failed
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
            Phase 7B.8L development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Safe calibrated simulation mode
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Preserves existing_v1 as the default and exposes the accepted
            terrain-separation package only through one explicit coherent mode.
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
              ? 'PASS — existing output remains the default and calibrated mode is deterministic, valid, and replay-compatible'
              : 'FAIL — calibrated simulation-mode integration needs correction'}
          </h2>
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
            terrain_separation_calibrated_v1 is opt-in and remains an in-memory
            engine mode only. No database flag, production route, persistence,
            scheduler, RPC, or Supabase integration is added.
          </p>
        </section>
      </div>
    </main>
  )
}
