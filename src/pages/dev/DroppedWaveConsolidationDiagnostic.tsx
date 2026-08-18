/**
 * DroppedWaveConsolidationDiagnostic.tsx
 *
 * Phase 7B.8D browser-only calibration audit.
 *
 * Measures how close each new dropped wave is to previously created active
 * dropped groups. It then simulates candidate consolidation thresholds without
 * mutating SimulationState or changing the inactive integrated runner.
 *
 * Scenarios:
 * - constant 5% for 10 km;
 * - constant 8% for 10 km; and
 * - constant 12% for 10 km.
 */

import { useMemo } from 'react'

import type {
  GroupState,
} from '../../race-engine/domain/GroupState'
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
  type IntegratedDroppedTransition,
  type RunIntegratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type ScenarioKey =
  | 'moderate5'
  | 'long8'
  | 'severe12'

type ConsolidationThresholdSeconds =
  | 5
  | 10
  | 15
  | 20
  | 30

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface ScenarioDefinition {
  readonly key: ScenarioKey
  readonly label: string
  readonly gradientPercent: number
}

interface DroppedGroupFinish {
  readonly groupId: string
  readonly riderCount: number
  readonly finishSecond: number
  readonly resultGapSeconds: number
}

interface ExistingDroppedProximity {
  readonly groupId: string
  readonly riderCount: number
  readonly distanceKm: number
  readonly speedKmh: number
  readonly gapFromLeaderSeconds: number
  readonly distanceBetweenMetres: number
  readonly gapDifferenceSeconds: number
  readonly estimatedTimeBetweenSeconds: number
}

interface WaveProximityRow {
  readonly transitionNumber: number
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly movedRiderCount: number
  readonly movedRiderNames:
    readonly string[]

  readonly newWaveDistanceKm: number
  readonly newWaveSpeedKmh: number
  readonly newWaveGapFromLeaderSeconds: number

  readonly existingDroppedGroups:
    readonly ExistingDroppedProximity[]

  readonly nearestExistingDroppedGroupId:
    string | null
  readonly nearestDistanceBetweenMetres:
    number | null
  readonly nearestGapDifferenceSeconds:
    number | null
  readonly nearestEstimatedTimeBetweenSeconds:
    number | null
}

interface ConsolidatedCluster {
  readonly clusterId: string
  readonly memberGroupIds:
    readonly string[]
  readonly riderCount: number
  readonly finishSeconds:
    readonly number[]
  readonly finishSpreadSeconds: number
  readonly finishCompatibleWithinOneTick:
    boolean
}

interface ThresholdAudit {
  readonly thresholdSeconds:
    ConsolidationThresholdSeconds
  readonly mergeDecisions:
    readonly string[]
  readonly clusterCount: number
  readonly finalRaceGroupCountIncludingPeloton:
    number
  readonly clusters:
    readonly ConsolidatedCluster[]
  readonly smallestClusterSize: number
  readonly largestGruppettoSize: number
  readonly finishCompatibleClusterCount: number
  readonly finishIncompatibleClusterCount: number
  readonly maximumFinishSpreadSeconds: number
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly run:
    RunIntegratedTerrainSeparationStageResult
  readonly proximityRows:
    readonly WaveProximityRow[]
  readonly thresholdAudits:
    Readonly<
      Record<
        ConsolidationThresholdSeconds,
        ThresholdAudit
      >
    >
  readonly droppedFinishes:
    readonly DroppedGroupFinish[]
  readonly hash: string
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly repeatedRunsIdentical: boolean
  readonly scenarios:
    Readonly<
      Record<
        ScenarioKey,
        ScenarioAudit
      >
    >
  readonly checks:
    readonly CheckResult[]
}

const TERRAIN_INFLUENCE =
  0.5

const SEPARATION_WINDOW_SECONDS =
  120

const STAGE_DISTANCE_KM =
  10

const THRESHOLDS:
  readonly ConsolidationThresholdSeconds[] = [
    5,
    10,
    15,
    20,
    30,
  ]

function baseInput():
  StageInput {
  return createStageInputFromSourceRows(
    rioStage1SourceRows,
  )
}

function controlledInput(
  definition:
    ScenarioDefinition,
): StageInput {
  const base =
    baseInput()

  return {
    ...base,
    raceId:
      `${base.raceId}-wave-consolidation-${definition.key}`,
    stageId:
      `${base.stageId}-wave-consolidation-${definition.key}`,
    stageName:
      `Dropped-wave consolidation · ${definition.label}`,
    distanceKm:
      STAGE_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          STAGE_DISTANCE_KM,
        elevationMetres:
          STAGE_DISTANCE_KM *
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

function definitions():
  readonly ScenarioDefinition[] {
  return [
    {
      key:
        'moderate5',
      label:
        'Constant 5% · 10 km',
      gradientPercent: 5,
    },
    {
      key:
        'long8',
      label:
        'Constant 8% · 10 km',
      gradientPercent: 8,
    },
    {
      key:
        'severe12',
      label:
        'Constant 12% · 10 km',
      gradientPercent: 12,
    },
  ]
}

function runScenario(
  definition:
    ScenarioDefinition,
): RunIntegratedTerrainSeparationStageResult {
  return runIntegratedTerrainSeparationStage(
    createInitialState(
      controlledInput(
        definition,
      ),
    ),
    {
      terrainCapabilityInfluence:
        TERRAIN_INFLUENCE,
      separationWindowSeconds:
        SEPARATION_WINDOW_SECONDS,
      maximumTickCount:
        20_000,
    },
  )
}

function droppedFinishRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly DroppedGroupFinish[] {
  const resultByRiderId =
    new Map(
      run.results.map(
        (result) => [
          result.riderId,
          result,
        ],
      ),
    )

  return Object.values(
    run.finalState.groups,
  )
    .filter(
      (group) =>
        group.groupType ===
        'dropped',
    )
    .slice()
    .sort(
      (left, right) =>
        left.createdAtRaceSecond -
          right.createdAtRaceSecond ||
        left.groupId.localeCompare(
          right.groupId,
        ),
    )
    .map(
      (group) => {
        const results =
          group.riderIds
            .map(
              (riderId) =>
                resultByRiderId.get(
                  riderId,
                ),
            )
            .filter(
              (
                result,
              ): result is NonNullable<
                typeof result
              > =>
                !!result,
            )

        if (
          results.length !==
          group.riderIds.length
        ) {
          throw new Error(
            `DroppedWaveConsolidationDiagnostic: missing results for ${group.groupId}.`,
          )
        }

        return {
          groupId:
            group.groupId,
          riderCount:
            group.riderIds.length,
          finishSecond:
            Math.min(
              ...results.map(
                (result) =>
                  result.elapsedSeconds,
              ),
            ),
          resultGapSeconds:
            Math.min(
              ...results.map(
                (result) =>
                  result.gapSeconds,
              ),
            ),
        }
      },
    )
}

function estimateTimeBetweenSeconds(
  distanceBetweenKm: number,
  speedA: number,
  speedB: number,
): number {
  if (
    distanceBetweenKm <= 0
  ) {
    return 0
  }

  const referenceSpeedKmh =
    Math.max(
      0.000001,
      (
        speedA +
        speedB
      ) /
        2,
    )

  return (
    distanceBetweenKm /
    referenceSpeedKmh
  ) *
    3600
}

function buildWaveProximityRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly WaveProximityRow[] {
  return run.transitions.map(
    (
      transition,
      index,
    ) => {
      const state =
        transition.application
          .state

      const newWave =
        state.groups[
          transition.targetGroupId
        ]

      if (!newWave) {
        throw new Error(
          `DroppedWaveConsolidationDiagnostic: missing new wave ${transition.targetGroupId}.`,
        )
      }

      const existingDroppedGroups =
        Object.values(
          state.groups,
        )
          .filter(
            (group) =>
              group.groupType ===
                'dropped' &&
              group.groupId !==
                newWave.groupId &&
              group.active,
          )
          .slice()
          .sort(
            (left, right) =>
              left.groupId.localeCompare(
                right.groupId,
              ),
          )
          .map(
            (group) => {
              const distanceBetweenKm =
                Math.abs(
                  newWave.distanceKm -
                  group.distanceKm,
                )

              return {
                groupId:
                  group.groupId,
                riderCount:
                  group.riderIds
                    .length,
                distanceKm:
                  group.distanceKm,
                speedKmh:
                  group.speedKmh,
                gapFromLeaderSeconds:
                  group
                    .gapFromLeaderSeconds,
                distanceBetweenMetres:
                  distanceBetweenKm *
                  1000,
                gapDifferenceSeconds:
                  Math.abs(
                    newWave
                      .gapFromLeaderSeconds -
                    group
                      .gapFromLeaderSeconds,
                  ),
                estimatedTimeBetweenSeconds:
                  estimateTimeBetweenSeconds(
                    distanceBetweenKm,
                    newWave.speedKmh,
                    group.speedKmh,
                  ),
              }
            },
          )

      const nearest =
        existingDroppedGroups
          .slice()
          .sort(
            (left, right) => {
              if (
                left.estimatedTimeBetweenSeconds !==
                right.estimatedTimeBetweenSeconds
              ) {
                return (
                  left.estimatedTimeBetweenSeconds -
                  right.estimatedTimeBetweenSeconds
                )
              }

              if (
                left.distanceBetweenMetres !==
                right.distanceBetweenMetres
              ) {
                return (
                  left.distanceBetweenMetres -
                  right.distanceBetweenMetres
                )
              }

              return left.groupId.localeCompare(
                right.groupId,
              )
            },
          )[0] ??
        null

      return {
        transitionNumber:
          index + 1,
        sourceGroupId:
          transition.sourceGroupId,
        targetGroupId:
          transition.targetGroupId,
        raceSecond:
          transition.raceSecond,
        kilometre:
          transition.kilometre,
        movedRiderCount:
          transition
            .movedRiderIds
            .length,
        movedRiderNames:
          transition.movedRiderIds
            .map(
              (riderId) =>
                run.initialState
                  .riders[
                    riderId
                  ]?.riderName ??
                riderId,
            ),

        newWaveDistanceKm:
          newWave.distanceKm,
        newWaveSpeedKmh:
          newWave.speedKmh,
        newWaveGapFromLeaderSeconds:
          newWave
            .gapFromLeaderSeconds,

        existingDroppedGroups,

        nearestExistingDroppedGroupId:
          nearest?.groupId ??
          null,
        nearestDistanceBetweenMetres:
          nearest
            ?.distanceBetweenMetres ??
          null,
        nearestGapDifferenceSeconds:
          nearest
            ?.gapDifferenceSeconds ??
          null,
        nearestEstimatedTimeBetweenSeconds:
          nearest
            ?.estimatedTimeBetweenSeconds ??
          null,
      }
    },
  )
}

class DisjointSet {
  private readonly parent =
    new Map<string, string>()

  add(value: string): void {
    if (!this.parent.has(value)) {
      this.parent.set(
        value,
        value,
      )
    }
  }

  find(value: string): string {
    const current =
      this.parent.get(
        value,
      )

    if (!current) {
      throw new Error(
        `DroppedWaveConsolidationDiagnostic: missing cluster node ${value}.`,
      )
    }

    if (current === value) {
      return value
    }

    const root =
      this.find(
        current,
      )

    this.parent.set(
      value,
      root,
    )

    return root
  }

  union(
    left: string,
    right: string,
  ): void {
    const leftRoot =
      this.find(
        left,
      )

    const rightRoot =
      this.find(
        right,
      )

    if (
      leftRoot ===
      rightRoot
    ) {
      return
    }

    const [
      keep,
      merge,
    ] =
      leftRoot.localeCompare(
        rightRoot,
      ) <= 0
        ? [
            leftRoot,
            rightRoot,
          ]
        : [
            rightRoot,
            leftRoot,
          ]

    this.parent.set(
      merge,
      keep,
    )
  }
}

function thresholdAudit(
  thresholdSeconds:
    ConsolidationThresholdSeconds,
  proximityRows:
    readonly WaveProximityRow[],
  droppedFinishes:
    readonly DroppedGroupFinish[],
): ThresholdAudit {
  const set =
    new DisjointSet()

  const riderCountByGroupId =
    new Map(
      proximityRows.map(
        (row) => [
          row.targetGroupId,
          row.movedRiderCount,
        ],
      ),
    )

  const finishByGroupId =
    new Map(
      droppedFinishes.map(
        (finish) => [
          finish.groupId,
          finish.finishSecond,
        ],
      ),
    )

  const mergeDecisions:
    string[] = []

  for (
    const row of
    proximityRows
  ) {
    set.add(
      row.targetGroupId,
    )

    for (
      const existing of
      row.existingDroppedGroups
    ) {
      set.add(
        existing.groupId,
      )
    }

    if (
      row.nearestExistingDroppedGroupId &&
      row.nearestEstimatedTimeBetweenSeconds !==
        null &&
      row.nearestEstimatedTimeBetweenSeconds <=
        thresholdSeconds
    ) {
      set.union(
        row.targetGroupId,
        row.nearestExistingDroppedGroupId,
      )

      mergeDecisions.push(
        `${row.targetGroupId} → ${row.nearestExistingDroppedGroupId} at ${row.nearestEstimatedTimeBetweenSeconds.toFixed(2)}s`,
      )
    }
  }

  const memberIdsByRoot =
    new Map<
      string,
      string[]
    >()

  for (
    const groupId of
    proximityRows.map(
      (row) =>
        row.targetGroupId,
    )
  ) {
    const root =
      set.find(
        groupId,
      )

    const current =
      memberIdsByRoot.get(
        root,
      ) ?? []

    current.push(
      groupId,
    )

    memberIdsByRoot.set(
      root,
      current,
    )
  }

  const clusters:
    ConsolidatedCluster[] =
    Array.from(
      memberIdsByRoot.entries(),
    )
      .map(
        ([
          root,
          memberGroupIds,
        ]) => {
          const sortedMembers =
            memberGroupIds
              .slice()
              .sort(
                (left, right) =>
                  left.localeCompare(
                    right,
                  ),
              )

          const riderCount =
            sortedMembers.reduce(
              (
                total,
                groupId,
              ) =>
                total +
                (
                  riderCountByGroupId.get(
                    groupId,
                  ) ??
                  0
                ),
              0,
            )

          const finishSeconds =
            sortedMembers
              .map(
                (groupId) =>
                  finishByGroupId.get(
                    groupId,
                  ),
              )
              .filter(
                (
                  value,
                ): value is number =>
                  typeof value ===
                  'number',
              )
              .sort(
                (left, right) =>
                  left - right,
              )

          const finishSpreadSeconds =
            finishSeconds.length > 0
              ? finishSeconds[
                  finishSeconds.length -
                  1
                ] -
                finishSeconds[0]
              : 0

          return {
            clusterId:
              root,
            memberGroupIds:
              sortedMembers,
            riderCount,
            finishSeconds,
            finishSpreadSeconds,
            finishCompatibleWithinOneTick:
              finishSpreadSeconds <=
              30,
          }
        },
      )
      .sort(
        (left, right) =>
          left.clusterId.localeCompare(
            right.clusterId,
          ),
      )

  const sizes =
    clusters.map(
      (cluster) =>
        cluster.riderCount,
    )

  const finishCompatibleClusterCount =
    clusters.filter(
      (cluster) =>
        cluster
          .finishCompatibleWithinOneTick,
    ).length

  return {
    thresholdSeconds,
    mergeDecisions,
    clusterCount:
      clusters.length,
    finalRaceGroupCountIncludingPeloton:
      clusters.length + 1,
    clusters,
    smallestClusterSize:
      sizes.length > 0
        ? Math.min(
            ...sizes,
          )
        : 0,
    largestGruppettoSize:
      sizes.length > 0
        ? Math.max(
            ...sizes,
          )
        : 0,
    finishCompatibleClusterCount,
    finishIncompatibleClusterCount:
      clusters.length -
      finishCompatibleClusterCount,
    maximumFinishSpreadSeconds:
      Math.max(
        0,
        ...clusters.map(
          (cluster) =>
            cluster.finishSpreadSeconds,
        ),
      ),
  }
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
  run:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const proximityRows =
    buildWaveProximityRows(
      run,
    )

  const droppedFinishes =
    droppedFinishRows(
      run,
    )

  const thresholdAudits =
    Object.fromEntries(
      THRESHOLDS.map(
        (threshold) => [
          threshold,
          thresholdAudit(
            threshold,
            proximityRows,
            droppedFinishes,
          ),
        ],
      ),
    ) as Record<
      ConsolidationThresholdSeconds,
      ThresholdAudit
    >

  const hash =
    createCanonicalHashedValue({
      definition,
      proximityRows,
      thresholdAudits,
      droppedFinishes,
    }).hash

  return {
    definition,
    run,
    proximityRows,
    thresholdAudits,
    droppedFinishes,
    hash,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const scenarioDefinitions =
    definitions()

  const firstRuns =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          runScenario(
            definition,
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      RunIntegratedTerrainSeparationStageResult
    >

  const secondRuns =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          runScenario(
            definition,
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      RunIntegratedTerrainSeparationStageResult
    >

  const repeatedRunsIdentical =
    scenarioDefinitions.every(
      (definition) =>
        firstRuns[
          definition.key
        ].deterministicHash ===
        secondRuns[
          definition.key
        ].deterministicHash,
    )

  const scenarios =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          scenarioAudit(
            definition,
            firstRuns[
              definition.key
            ],
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      ScenarioAudit
    >

  const allScenarios =
    Object.values(
      scenarios,
    )

  const thresholdCountsMonotonic =
    allScenarios.every(
      (scenario) =>
        THRESHOLDS.every(
          (
            threshold,
            index,
          ) =>
            index === 0 ||
            scenario
              .thresholdAudits[
                threshold
              ]
              .clusterCount <=
            scenario
              .thresholdAudits[
                THRESHOLDS[
                  index - 1
                ]
              ]
              .clusterCount,
        ),
    )

  const clusterSizesPreserveMovedRiders =
    allScenarios.every(
      (scenario) => {
        const moved =
          scenario.proximityRows
            .reduce(
              (
                total,
                row,
              ) =>
                total +
                row.movedRiderCount,
              0,
            )

        return THRESHOLDS.every(
          (threshold) =>
            scenario
              .thresholdAudits[
                threshold
              ]
              .clusters
              .reduce(
                (
                  total,
                  cluster,
                ) =>
                  total +
                  cluster.riderCount,
                0,
              ) ===
            moved,
        )
      },
    )

  const firstWaveHasNoNearest =
    allScenarios.every(
      (scenario) =>
        scenario.proximityRows
          .length === 0 ||
        scenario.proximityRows[0]
          .nearestExistingDroppedGroupId ===
        null,
    )

  const laterWavesHaveNearest =
    [
      scenarios.long8,
      scenarios.severe12,
    ].every(
      (scenario) =>
        scenario.proximityRows
          .slice(1)
          .every(
            (row) =>
              row
                .nearestExistingDroppedGroupId !==
              null &&
              row
                .nearestEstimatedTimeBetweenSeconds !==
              null,
          ),
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated integrated runs are identical for 5%, 8%, and 12%',
        passed:
          repeatedRunsIdentical,
      },
      {
        label:
          'Every transition has a proximity audit row',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .proximityRows
                .length ===
              scenario.run
                .transitions
                .length,
          ),
      },
      {
        label:
          'The first wave has no pre-existing dropped group',
        passed:
          firstWaveHasNoNearest,
      },
      {
        label:
          'Every later 8% and 12% wave resolves a nearest dropped group',
        passed:
          laterWavesHaveNearest,
      },
      {
        label:
          'Candidate cluster counts never increase as the threshold rises',
        passed:
          thresholdCountsMonotonic,
      },
      {
        label:
          'Candidate cluster sizes preserve every moved rider',
        passed:
          clusterSizesPreserveMovedRiders,
      },
      {
        label:
          'No candidate consolidation cluster is empty',
        passed:
          allScenarios.every(
            (scenario) =>
              THRESHOLDS.every(
                (threshold) =>
                  scenario
                    .thresholdAudits[
                      threshold
                    ]
                    .clusters
                    .every(
                      (cluster) =>
                        cluster
                          .riderCount >
                        0,
                    ),
              ),
          ),
      },
      {
        label:
          'Every threshold audit includes finish compatibility data',
        passed:
          allScenarios.every(
            (scenario) =>
              THRESHOLDS.every(
                (threshold) =>
                  scenario
                    .thresholdAudits[
                      threshold
                    ]
                    .clusters
                    .every(
                      (cluster) =>
                        cluster
                          .finishSeconds
                          .length ===
                        cluster
                          .memberGroupIds
                          .length,
                    ),
              ),
          ),
      },
      {
        label:
          'All three source scenarios still complete with 96 results',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.run
                .completed &&
              scenario.run
                .results.length ===
              96,
          ),
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    repeatedRunsIdentical,
    scenarios,
    checks,
  }
}

function format(
  value: number,
  digits = 2,
): string {
  return value.toFixed(
    digits,
  )
}

function nullable(
  value: number | null,
  suffix = '',
): string {
  return value === null
    ? 'None'
    : `${format(
        value,
      )}${suffix}`
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

function ProximityTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} wave proximity
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Audit hash:
          {' '}
          <span className="font-mono">
            {scenario.hash}
          </span>
        </p>
      </div>

      {scenario.proximityRows.length >
      0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">
                  Wave
                </th>
                <th className="px-3 py-3">
                  Time / km
                </th>
                <th className="px-3 py-3">
                  Riders
                </th>
                <th className="px-3 py-3">
                  New distance / speed / gap
                </th>
                <th className="px-3 py-3">
                  Nearest dropped group
                </th>
                <th className="px-3 py-3">
                  Distance
                </th>
                <th className="px-3 py-3">
                  Gap difference
                </th>
                <th className="px-3 py-3">
                  Estimated time
                </th>
              </tr>
            </thead>

            <tbody>
              {scenario.proximityRows.map(
                (row) => (
                  <tr
                    key={row.targetGroupId}
                    className="border-t border-slate-800"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {row.transitionNumber}
                      {' · '}
                      {row.targetGroupId}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {row.raceSecond}s
                      {' / '}
                      {format(
                        row.kilometre,
                        3,
                      )} km
                    </td>

                    <td className="min-w-[300px] px-3 py-3 text-slate-300">
                      {row.movedRiderCount}
                      {' · '}
                      {row.movedRiderNames
                        .join(', ')}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        row
                          .newWaveDistanceKm,
                        3,
                      )} km
                      {' / '}
                      {format(
                        row
                          .newWaveSpeedKmh,
                      )} km/h
                      {' / '}
                      {format(
                        row
                          .newWaveGapFromLeaderSeconds,
                      )}s
                    </td>

                    <td className="px-3 py-3 font-mono">
                      {row
                        .nearestExistingDroppedGroupId ??
                      'None'}
                    </td>

                    <td className="px-3 py-3">
                      {nullable(
                        row
                          .nearestDistanceBetweenMetres,
                        'm',
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {nullable(
                        row
                          .nearestGapDifferenceSeconds,
                        's',
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {nullable(
                        row
                          .nearestEstimatedTimeBetweenSeconds,
                        's',
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-5 text-sm text-slate-400">
          No transition waves occurred.
        </p>
      )}
    </section>
  )
}

function ThresholdTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} threshold simulation
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">
                Threshold
              </th>
              <th className="px-3 py-3">
                Merges
              </th>
              <th className="px-3 py-3">
                Dropped clusters
              </th>
              <th className="px-3 py-3">
                Final groups + peloton
              </th>
              <th className="px-3 py-3">
                Resulting sizes
              </th>
              <th className="px-3 py-3">
                Smallest / largest
              </th>
              <th className="px-3 py-3">
                Finish-compatible / incompatible
              </th>
              <th className="px-3 py-3">
                Max finish spread
              </th>
            </tr>
          </thead>

          <tbody>
            {THRESHOLDS.map(
              (threshold) => {
                const audit =
                  scenario
                    .thresholdAudits[
                      threshold
                    ]

                return (
                  <tr
                    key={threshold}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3 font-semibold">
                      {threshold}s
                    </td>

                    <td className="min-w-[300px] px-3 py-3 text-slate-300">
                      {audit
                        .mergeDecisions
                        .length > 0
                        ? audit
                            .mergeDecisions
                            .join('; ')
                        : 'None'}
                    </td>

                    <td className="px-3 py-3">
                      {audit.clusterCount}
                    </td>

                    <td className="px-3 py-3">
                      {audit
                        .finalRaceGroupCountIncludingPeloton}
                    </td>

                    <td className="min-w-[280px] px-3 py-3">
                      {audit.clusters
                        .map(
                          (cluster) =>
                            `${cluster.memberGroupIds.join('+')}: ${cluster.riderCount}`,
                        )
                        .join('; ')}
                    </td>

                    <td className="px-3 py-3">
                      {audit
                        .smallestClusterSize}
                      {' / '}
                      {audit
                        .largestGruppettoSize}
                    </td>

                    <td className="px-3 py-3">
                      {audit
                        .finishCompatibleClusterCount}
                      {' / '}
                      {audit
                        .finishIncompatibleClusterCount}
                    </td>

                    <td className="px-3 py-3">
                      {audit
                        .maximumFinishSpreadSeconds}s
                    </td>
                  </tr>
                )
              },
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function DroppedWaveConsolidationDiagnostic():
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
            Phase 7B.8D development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped-wave consolidation audit failed
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
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8D development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped-wave proximity and consolidation audit
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Measures every new dropped wave against active dropped groups and
            simulates 5, 10, 15, 20, and 30-second consolidation thresholds.
            No group is actually merged.
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
              ? 'PASS — wave proximity and candidate consolidation are measured deterministically'
              : 'FAIL — consolidation audit invariants need correction'}
          </h2>
        </section>

        <ProximityTable
          scenario={
            value.scenarios
              .moderate5
          }
        />

        <ThresholdTable
          scenario={
            value.scenarios
              .moderate5
          }
        />

        <ProximityTable
          scenario={
            value.scenarios
              .long8
          }
        />

        <ThresholdTable
          scenario={
            value.scenarios
              .long8
          }
        />

        <ProximityTable
          scenario={
            value.scenarios
              .severe12
          }
        />

        <ThresholdTable
          scenario={
            value.scenarios
              .severe12
          }
        />

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
            Finish compatibility definition
          </h2>

          <p className="mt-3">
            A candidate consolidated cluster is marked finish-compatible when
            all of its original groups finish within one current 30-second
            simulation tick. This is an audit rule only, not a merge rule.
          </p>

          <h2 className="mt-6 text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            The diagnostic does not mutate any race state. The integrated
            runner, active tick, events, replay persistence, production routes,
            and Supabase are unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
