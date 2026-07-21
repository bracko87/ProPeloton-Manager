/**
 * RaceEngineDeterminismDiagnostic.tsx
 *
 * Temporary in-browser diagnostic page for the Phase 2 deterministic race engine.
 * Runs a small hard-coded stage twice in-memory and compares outputs to verify
 * deterministic behavior of the isolated TypeScript engine.
 *
 * This page:
 * - Does not access Supabase or any database.
 * - Does not use the production race engine or legacy SQL functions.
 * - Uses only hard-coded in-memory test data.
 * - Is intended for temporary development use and should be removed once
 *   automated test infrastructure is available.
 */

import React, { useMemo } from 'react'

import {
  applyMultiGroupEnergy,
  applyMultiGroupFinish,
  applyMultiGroupMovement,
  calculateMultiGroupMovement,
  calculatePelotonBasePace,
  calculateRiderEnergyCost,
  calculateRiderFatigueModifier,
  calculateRiderGroupHold,
  calculateTerrainSpeed,
  createCanonicalHashedValue,
  createDroppedGroup,
  createInitialState,
  createMultiGroupSimulationOutput,
  runDeterministicRoadRace,
  detectMultiGroupFinishCandidates,
  createReplaySnapshot,
  createReplaySnapshotCollection,
  getReplaySnapshotBoundarySeconds,
  getStageTerrainSample,
  runMultiGroupStage,
  simulateMultiGroupTick,
  simulateTick,
  type ApplyMultiGroupEnergyResult,
  type ApplyMultiGroupFinishResult,
  type ApplyMultiGroupMovementResult,
  type CreateDroppedGroupResult,
  type MultiGroupFinishCandidateResult,
  type MultiGroupMovementResult,
  type PelotonPaceResult,
  type ReplaySnapshot,
  type ReplaySnapshotCollection,
  type RiderEnergyCostResult,
  type RiderFatigueModifierResult,
  type RiderGroupHoldResult,
  type RunMultiGroupStageResult,
  type SimulateMultiGroupTickResult,
  type StageTerrainSample,
  type TerrainSpeedResult,
} from '../../race-engine/simulation'
import { validateSimulationState } from '../../race-engine/validation/validateSimulationState'
import type { SimulationState } from '../../race-engine/domain/SimulationState'
import type {
  SimulationOutput,
} from '../../race-engine/domain/SimulationOutput'
import type { StageResult } from '../../race-engine/domain/SimulationOutput'
import type { StageInput } from '../../race-engine/domain/StageInput'

/**
 * DiagnosticRun
 * Result of a single deterministic diagnostic stage run.
 */
interface DiagnosticRun {
  readonly finalState: SimulationState
  readonly results: readonly StageResult[]
  readonly tickCount: number
  readonly canonicalJson: string
  readonly deterministicHash: string
  readonly replaySnapshots: readonly ReplaySnapshot[]
  readonly replayCollection: ReplaySnapshotCollection
  readonly terrainSamples: readonly StageTerrainSample[]
  readonly terrainSpeedSamples: readonly TerrainSpeedResult[]
  readonly tickTraces: readonly DiagnosticTickTrace[]
  readonly pelotonPace: PelotonPaceResult
  readonly riderEnergySamples: readonly DiagnosticRiderEnergySample[]
  readonly riderEnergyTraces: readonly DiagnosticRiderEnergyTrace[]
  readonly fatigueSamples: readonly DiagnosticFatigueSample[]
  readonly fatiguedPelotonPaceComparison:
    DiagnosticFatiguedPelotonPaceComparison
  readonly groupHoldSamples:
    readonly DiagnosticGroupHoldSample[]
  readonly droppedGroupSample:
    CreateDroppedGroupResult
  readonly multiGroupMovementSample:
    MultiGroupMovementResult
  readonly appliedMultiGroupMovementSample:
    ApplyMultiGroupMovementResult
  readonly appliedMultiGroupEnergySample:
    ApplyMultiGroupEnergyResult
  readonly simulatedMultiGroupTickSample:
    SimulateMultiGroupTickResult
  readonly simulatedMultiGroupFinishTickSample:
    SimulateMultiGroupTickResult
  readonly fullMultiGroupStageSample:
    RunMultiGroupStageResult
  readonly fullMultiGroupSimulationOutput:
    SimulationOutput
  readonly deterministicRoadRaceOutput:
    SimulationOutput
  readonly multiGroupFinishCandidateSample:
    MultiGroupFinishCandidateResult
  readonly appliedMultiGroupFinishSample:
    ApplyMultiGroupFinishResult
  readonly finalMultiGroupFinishCandidateSample:
    MultiGroupFinishCandidateResult
  readonly completedMultiGroupFinishSample:
    ApplyMultiGroupFinishResult
}

/**
 * DiagnosticTickTrace
 * Per-tick movement and terrain trace captured for diagnostics.
 */
interface DiagnosticTickTrace {
  readonly tickNumber: number
  readonly previousRaceSecond: number
  readonly nextRaceSecond: number
  readonly previousKm: number
  readonly nextKm: number
  readonly gradientPercent: number
  readonly elevationMetres: number
  readonly baseSpeedKmh: number
  readonly terrainMultiplier: number
  readonly appliedSpeedKmh: number
  readonly distanceAdvancedKm: number
}

interface DiagnosticRiderEnergySample {
  readonly riderId: string
  readonly riderName: string
  readonly stamina: number
  readonly resistance: number
  readonly recovery: number
  readonly result: RiderEnergyCostResult
}

/**
 * DiagnosticRiderEnergyTrace
 * Actual per-rider energy progression captured around every simulation tick.
 */
interface DiagnosticRiderEnergyTrace {
  readonly tickNumber: number
  readonly previousRaceSecond: number
  readonly nextRaceSecond: number
  readonly riderId: string
  readonly riderName: string
  readonly gradientPercent: number
  readonly appliedSpeedKmh: number
  readonly energyBefore: number
  readonly expectedEnergyCost: number
  readonly expectedEnergyAfter: number
  readonly actualEnergyAfter: number
}

/**
 * DiagnosticFatigueSample
 * Controlled fatigue samples used to verify threshold and protection behavior.
 */
interface DiagnosticFatigueSample {
  readonly label: string
  readonly currentEnergy: number
  readonly resistance: number
  readonly recovery: number
  readonly result: RiderFatigueModifierResult
}

interface DiagnosticGroupHoldSample {
  readonly label: string
  readonly riderCapabilityScore: number
  readonly groupDemandScore: number
  readonly groupSpeedKmh: number
  readonly result: RiderGroupHoldResult
}

interface DiagnosticFatiguedPelotonPaceComparison {
  readonly normalPace: PelotonPaceResult
  readonly fatiguedPace: PelotonPaceResult
  readonly normalAverageCapability: number
  readonly fatiguedAverageCapability: number
  readonly normalBaseSpeedKmh: number
  readonly fatiguedBaseSpeedKmh: number
  readonly capabilityReduction: number
  readonly speedReductionKmh: number
}

/**
 * DiagnosticChecks
 * Boolean flags representing each individual determinism and completion check.
 */
interface DiagnosticChecks {
  readonly completeRunA: boolean
  readonly completeRunB: boolean
  readonly identicalCanonicalJson: boolean
  readonly identicalHash: boolean
  readonly identicalResults: boolean
  readonly identicalEvents: boolean
  readonly identicalRiders: boolean
  readonly identicalGroups: boolean
  readonly identicalTickCount: boolean

  /** Replay-specific checks */ 
  readonly identicalReplaySnapshotCount: boolean
  readonly identicalReplaySnapshotTiming: boolean
  readonly identicalReplaySnapshotJson: boolean
  readonly identicalReplaySnapshotHashes: boolean
  readonly identicalReplayCollectionHash: boolean

  readonly finalStateAValidated: boolean
  readonly finalStateBValidated: boolean

  /** Terrain-specific check for determinism */ 
  readonly identicalTerrainSamples: boolean
  readonly identicalTerrainSpeedSamples: boolean

  /** Per-tick trace and rider-based pace determinism */ 
  readonly identicalTickTraces: boolean
  readonly identicalPelotonPace: boolean
  readonly identicalRiderEnergySamples: boolean
  readonly identicalRiderEnergyTraces: boolean
  readonly identicalFatigueSamples: boolean
  readonly identicalFatiguedPelotonPaceComparison: boolean
  readonly identicalGroupHoldSamples: boolean
  readonly identicalDroppedGroupSample: boolean
  readonly identicalMultiGroupMovementSample: boolean
  readonly identicalAppliedMultiGroupMovementSample: boolean
  readonly identicalAppliedMultiGroupEnergySample: boolean
  readonly identicalMultiGroupFinishCandidateSample: boolean
  readonly identicalAppliedMultiGroupFinishSample: boolean
  readonly identicalFinalMultiGroupFinishCandidateSample: boolean
  readonly identicalCompletedMultiGroupFinishSample: boolean
  readonly identicalSimulatedMultiGroupTickSample: boolean
  readonly identicalSimulatedMultiGroupFinishTickSample: boolean
  readonly identicalFullMultiGroupStageSample: boolean
  readonly identicalFullMultiGroupReplaySnapshots: boolean
  readonly identicalFullMultiGroupReplayCollection: boolean
  readonly identicalFullMultiGroupCanonicalJson: boolean
  readonly identicalFullMultiGroupDeterministicHash: boolean
  readonly identicalFullMultiGroupSimulationOutput: boolean
  readonly identicalDeterministicRoadRaceOutput: boolean

  readonly allChecksPassed: boolean
}

/**
 * DiagnosticPageResult
 * Discriminated union for the diagnostic page state: success vs error.
 */
type DiagnosticPageResult =
  | {
      readonly ok: true
      readonly runA: DiagnosticRun
      readonly runB: DiagnosticRun
      readonly checks: DiagnosticChecks
    }
  | {
      readonly ok: false
      readonly message: string
      readonly stack: string | null
    }

/**
 * diagnosticStageInput
 * Hard-coded sample StageInput-like object for deterministic diagnostic use.
 *
 * Note:
 * - Typed as StageInput so the dev-only page matches the engine contract.
 * - Must remain in-memory only and safe if accidentally deployed.
 */
const diagnosticStageInput: StageInput = {
  raceId: 'diagnostic-race-001',
  stageId: 'diagnostic-stage-001',
  stageName: 'Deterministic Engine Diagnostic',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed: 'phase-2-diagnostic-seed-v1',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds: 30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 36,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Diagnostic Team A',
      captainRiderId: 'rider-a1',
      riderIds: ['rider-a1', 'rider-a2'],
    },
    {
      teamId: 'team-b',
      teamName: 'Diagnostic Team B',
      captainRiderId: 'rider-b1',
      riderIds: ['rider-b1', 'rider-b2'],
    },
  ],
  riders: [
    {
      riderId: 'rider-a1',
      teamId: 'team-a',
      riderName: 'Alex Sprinter',
      teamName: 'Diagnostic Team A',
      role: 'captain',
      attributes: {
        flat: 75,
        sprint: 90,
        acceleration: 88,
        stamina: 74,
        resistance: 72,
        recovery: 70,
        teamwork: 78,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'Adrian Rouleur',
      teamName: 'Diagnostic Team A',
      role: 'rouleur',
      attributes: {
        flat: 86,
        sprint: 68,
        acceleration: 70,
        stamina: 84,
        resistance: 83,
        recovery: 78,
        teamwork: 82,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'Bruno Fast',
      teamName: 'Diagnostic Team B',
      role: 'captain',
      attributes: {
        flat: 78,
        sprint: 87,
        acceleration: 91,
        stamina: 76,
        resistance: 74,
        recovery: 73,
        teamwork: 77,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'Boris Worker',
      teamName: 'Diagnostic Team B',
      role: 'domestique',
      attributes: {
        flat: 82,
        sprint: 64,
        acceleration: 65,
        stamina: 87,
        resistance: 86,
        recovery: 81,
        teamwork: 89,
      },
    },
  ],
  profilePoints: [
    {
      kilometre: 0,
      elevationMetres: 100,
    },
    {
      kilometre: 0.3,
      elevationMetres: 100,
    },
    {
      kilometre: 0.7,
      elevationMetres: 120,
    },
    {
      kilometre: 1,
      elevationMetres: 105,
    },
  ],
  orders: [],
}

/**
 * riderNameLookup
 * Simple lookup table from riderId to display name for the diagnostic results table.
 */
const riderNameLookup: Readonly<Record<string, string>> =
  Object.fromEntries(
    diagnosticStageInput.riders.map((rider) => [rider.riderId, rider.riderName]),
  )

/**
 * riderTeamLookup
 * Simple lookup table from riderId to team name for results rendering.
 */
const riderTeamLookup: Readonly<Record<string, string>> =
  Object.fromEntries(
    diagnosticStageInput.riders.map((rider) => [rider.riderId, rider.teamName]),
  )

/**
 * runDiagnosticStage
 * Runs the hard-coded diagnostic stage until completion using the
 * deterministic race engine, returning the final state and results.
 *
 * Behavior:
 * - Creates initial state from diagnosticStageInput.
 * - Validates initial and final state.
 * - Steps with simulateTick until completed or a 1000-tick safety limit.
 * - Captures the final StageResult list from the finishing tick.
 * - Produces a canonical JSON snapshot and deterministic hash for comparison.
 */
function runDiagnosticStage(): DiagnosticRun {
  const initialState = createInitialState(diagnosticStageInput)
  validateSimulationState(initialState)

  const pelotonRiders = Object.values(
    initialState.riders,
  ).filter(
    (rider) =>
      rider.currentGroupId === 'peloton_main' &&
      rider.stageStatus === 'racing',
  )

  const pelotonPace = calculatePelotonBasePace({
    riders: pelotonRiders,
    minimumSpeedKmh:
      diagnosticStageInput.settings.minimumSpeedKmh,
    maximumSpeedKmh:
      diagnosticStageInput.settings.maximumSpeedKmh,
  })

  const expectedAverageCapabilityScore = 80.075
  const expectedBaseSpeedKmh = 45.609

  if (
    Math.abs(
      pelotonPace.averageCapabilityScore -
        expectedAverageCapabilityScore,
    ) > 1e-9
  ) {
    throw new Error(
      `Unexpected peloton capability score: ${pelotonPace.averageCapabilityScore}.`,
    )
  }

  if (
    Math.abs(
      pelotonPace.baseSpeedKmh -
        expectedBaseSpeedKmh,
    ) > 1e-9
  ) {
    throw new Error(
      `Unexpected peloton base speed: ${pelotonPace.baseSpeedKmh}.`,
    )
  }

  if (pelotonPace.eligibleRiderCount !== 4) {
    throw new Error(
      `Expected 4 eligible peloton riders, received ${pelotonPace.eligibleRiderCount}.`,
    )
  }

  const riderEnergySamples: DiagnosticRiderEnergySample[] =
    pelotonRiders
      .slice()
      .sort(
        (riderA, riderB) =>
          riderA.riderId.localeCompare(
            riderB.riderId,
          ),
      )
      .map((rider) => {
        const result =
          calculateRiderEnergyCost({
            currentEnergy: rider.energy,
            speedKmh:
              pelotonPace.baseSpeedKmh,
            baseSpeedKmh:
              pelotonPace.baseSpeedKmh,
            gradientPercent: 0,
            tickSeconds:
              diagnosticStageInput.settings
                .tickSeconds,
            stamina:
              rider.attributes.stamina,
            resistance:
              rider.attributes.resistance,
            recovery:
              rider.attributes.recovery,
          })

        return {
          riderId: rider.riderId,
          riderName: rider.riderName,
          stamina:
            rider.attributes.stamina,
          resistance:
            rider.attributes.resistance,
          recovery:
            rider.attributes.recovery,
          result,
        }
      })

  if (riderEnergySamples.length !== 4) {
    throw new Error(
      `Expected 4 rider energy samples, received ${riderEnergySamples.length}.`,
    )
  }

  for (
    let index = 0;
    index < riderEnergySamples.length;
    index += 1
  ) {
    const sample = riderEnergySamples[index]

    if (
      !Number.isFinite(
        sample.result.energyCost,
      ) ||
      sample.result.energyCost <= 0
    ) {
      throw new Error(
        `Invalid energy cost for rider ${sample.riderId}.`,
      )
    }

    if (
      sample.result.nextEnergy >=
      sample.result.currentEnergy
    ) {
      throw new Error(
        `Energy did not decrease for rider ${sample.riderId}.`,
      )
    }

    if (
      sample.result.nextEnergy < 0 ||
      sample.result.nextEnergy > 100
    ) {
      throw new Error(
        `Energy result is outside 0 to 100 for rider ${sample.riderId}.`,
      )
    }

    if (
      index > 0 &&
      riderEnergySamples[index - 1].riderId.localeCompare(
        sample.riderId,
      ) >= 0
    ) {
      throw new Error(
        'Diagnostic rider energy samples are not sorted by riderId.',
      )
    }
  }

  const referenceRider =
    pelotonRiders
      .slice()
      .sort(
        (riderA, riderB) =>
          riderA.riderId.localeCompare(
            riderB.riderId,
          ),
      )[0]

  if (!referenceRider) {
    throw new Error(
      'Diagnostic energy verification requires at least one rider.',
    )
  }

  const referenceFlatEnergy =
    calculateRiderEnergyCost({
      currentEnergy:
        referenceRider.energy,
      speedKmh:
        pelotonPace.baseSpeedKmh,
      baseSpeedKmh:
        pelotonPace.baseSpeedKmh,
      gradientPercent: 0,
      tickSeconds:
        diagnosticStageInput.settings
          .tickSeconds,
      stamina:
        referenceRider.attributes.stamina,
      resistance:
        referenceRider.attributes.resistance,
      recovery:
        referenceRider.attributes.recovery,
    })

  const referenceUphillEnergy =
    calculateRiderEnergyCost({
      currentEnergy:
        referenceRider.energy,
      speedKmh:
        pelotonPace.baseSpeedKmh * 0.825,
      baseSpeedKmh:
        pelotonPace.baseSpeedKmh,
      gradientPercent: 5,
      tickSeconds:
        diagnosticStageInput.settings
          .tickSeconds,
      stamina:
        referenceRider.attributes.stamina,
      resistance:
        referenceRider.attributes.resistance,
      recovery:
        referenceRider.attributes.recovery,
    })

  if (
    referenceUphillEnergy.energyCost <=
    referenceFlatEnergy.energyCost
  ) {
    throw new Error(
      'Expected uphill terrain to cost more energy than flat terrain.',
    )
  }

  const fatigueSamples: DiagnosticFatigueSample[] = [
    {
      label: 'Full energy',
      currentEnergy: 100,
      resistance: 80,
      recovery: 80,
      result: calculateRiderFatigueModifier({
        currentEnergy: 100,
        resistance: 80,
        recovery: 80,
      }),
    },
    {
      label: 'Threshold',
      currentEnergy: 70,
      resistance: 80,
      recovery: 80,
      result: calculateRiderFatigueModifier({
        currentEnergy: 70,
        resistance: 80,
        recovery: 80,
      }),
    },
    {
      label: 'Moderate fatigue',
      currentEnergy: 50,
      resistance: 80,
      recovery: 80,
      result: calculateRiderFatigueModifier({
        currentEnergy: 50,
        resistance: 80,
        recovery: 80,
      }),
    },
    {
      label: 'Severe fatigue',
      currentEnergy: 20,
      resistance: 80,
      recovery: 80,
      result: calculateRiderFatigueModifier({
        currentEnergy: 20,
        resistance: 80,
        recovery: 80,
      }),
    },
    {
      label: 'Zero energy',
      currentEnergy: 0,
      resistance: 0,
      recovery: 0,
      result: calculateRiderFatigueModifier({
        currentEnergy: 0,
        resistance: 0,
        recovery: 0,
      }),
    },
    {
      label: 'Weak protection',
      currentEnergy: 20,
      resistance: 20,
      recovery: 20,
      result: calculateRiderFatigueModifier({
        currentEnergy: 20,
        resistance: 20,
        recovery: 20,
      }),
    },
    {
      label: 'Strong protection',
      currentEnergy: 20,
      resistance: 90,
      recovery: 90,
      result: calculateRiderFatigueModifier({
        currentEnergy: 20,
        resistance: 90,
        recovery: 90,
      }),
    },
  ]

  if (fatigueSamples.length !== 7) {
    throw new Error(
      `Expected 7 fatigue samples, received ${fatigueSamples.length}.`,
    )
  }

  const fullEnergyFatigue = fatigueSamples[0].result
  const thresholdFatigue = fatigueSamples[1].result
  const moderateFatigue = fatigueSamples[2].result
  const severeFatigue = fatigueSamples[3].result
  const zeroEnergyFatigue = fatigueSamples[4].result
  const weakProtectionFatigue = fatigueSamples[5].result
  const strongProtectionFatigue = fatigueSamples[6].result

  if (
    fullEnergyFatigue.fatigued ||
    fullEnergyFatigue.paceMultiplier !== 1
  ) {
    throw new Error(
      'Full-energy fatigue sample must have no penalty.',
    )
  }

  if (
    thresholdFatigue.fatigued ||
    thresholdFatigue.paceMultiplier !== 1
  ) {
    throw new Error(
      'Fatigue threshold sample must have no penalty.',
    )
  }

  if (
    !moderateFatigue.fatigued ||
    moderateFatigue.paceMultiplier >= 1
  ) {
    throw new Error(
      'Moderate fatigue sample must have a pace penalty.',
    )
  }

  if (
    severeFatigue.paceMultiplier >=
    moderateFatigue.paceMultiplier
  ) {
    throw new Error(
      'Severe fatigue must reduce pace more than moderate fatigue.',
    )
  }

  if (zeroEnergyFatigue.paceMultiplier !== 0.85) {
    throw new Error(
      `Expected zero-energy minimum multiplier 0.85, received ${zeroEnergyFatigue.paceMultiplier}.`,
    )
  }

  if (
    strongProtectionFatigue.paceMultiplier <=
    weakProtectionFatigue.paceMultiplier
  ) {
    throw new Error(
      'Strong fatigue protection must retain more pace than weak protection.',
    )
  }


  const controlledFatiguedEnergyByRiderId:
    Readonly<Record<string, number>> = {
      'rider-a1': 20,
      'rider-a2': 50,
      'rider-b1': 20,
      'rider-b2': 50,
    }

  const controlledFatiguedRiders =
    pelotonRiders
      .slice()
      .sort(
        (riderA, riderB) =>
          riderA.riderId.localeCompare(
            riderB.riderId,
          ),
      )
      .map((rider) => {
        const controlledEnergy =
          controlledFatiguedEnergyByRiderId[
            rider.riderId
          ]

        if (controlledEnergy == null) {
          throw new Error(
            `Missing controlled fatigue energy for rider ${rider.riderId}.`,
          )
        }

        return {
          ...rider,
          energy: controlledEnergy,
        }
      })

  const fatiguedPelotonPace =
    calculatePelotonBasePace({
      riders: controlledFatiguedRiders,
      minimumSpeedKmh:
        diagnosticStageInput.settings
          .minimumSpeedKmh,
      maximumSpeedKmh:
        diagnosticStageInput.settings
          .maximumSpeedKmh,
    })

  const fatiguedPelotonPaceComparison:
    DiagnosticFatiguedPelotonPaceComparison = {
      normalPace: pelotonPace,
      fatiguedPace: fatiguedPelotonPace,
      normalAverageCapability:
        pelotonPace.averageCapabilityScore,
      fatiguedAverageCapability:
        fatiguedPelotonPace
          .averageCapabilityScore,
      normalBaseSpeedKmh:
        pelotonPace.baseSpeedKmh,
      fatiguedBaseSpeedKmh:
        fatiguedPelotonPace.baseSpeedKmh,
      capabilityReduction:
        pelotonPace.averageCapabilityScore -
        fatiguedPelotonPace
          .averageCapabilityScore,
      speedReductionKmh:
        pelotonPace.baseSpeedKmh -
        fatiguedPelotonPace.baseSpeedKmh,
    }

  if (
    fatiguedPelotonPace.eligibleRiderCount !==
    pelotonPace.eligibleRiderCount
  ) {
    throw new Error(
      'Controlled fatigue comparison changed the eligible rider count.',
    )
  }

  if (
    fatiguedPelotonPace.averageCapabilityScore >=
    pelotonPace.averageCapabilityScore
  ) {
    throw new Error(
      'Expected controlled fatigue to reduce average peloton capability.',
    )
  }

  if (
    fatiguedPelotonPace.baseSpeedKmh >=
    pelotonPace.baseSpeedKmh
  ) {
    throw new Error(
      'Expected controlled fatigue to reduce peloton base speed.',
    )
  }

  if (
    fatiguedPelotonPaceComparison
      .capabilityReduction <= 0
  ) {
    throw new Error(
      'Controlled fatigue capability reduction must be positive.',
    )
  }

  if (
    fatiguedPelotonPaceComparison
      .speedReductionKmh <= 0
  ) {
    throw new Error(
      'Controlled fatigue speed reduction must be positive.',
    )
  }

  for (
    let index = 0;
    index <
    fatiguedPelotonPace
      .riderContributions.length;
    index += 1
  ) {
    const fatiguedContribution =
      fatiguedPelotonPace
        .riderContributions[index]

    const normalContribution =
      pelotonPace.riderContributions[index]

    if (
      !normalContribution ||
      normalContribution.riderId !==
        fatiguedContribution.riderId
    ) {
      throw new Error(
        `Fatigued peloton contribution ordering mismatch at index ${index}.`,
      )
    }

    if (
      fatiguedContribution
        .fatigueMultiplier >= 1
    ) {
      throw new Error(
        `Expected rider ${fatiguedContribution.riderId} to receive a fatigue penalty.`,
      )
    }

    if (
      fatiguedContribution
        .capabilityScore >=
      fatiguedContribution
        .rawCapabilityScore
    ) {
      throw new Error(
        `Fatigue did not reduce capability for rider ${fatiguedContribution.riderId}.`,
      )
    }

    if (
      fatiguedContribution
        .capabilityScore >=
      normalContribution.capabilityScore
    ) {
      throw new Error(
        `Controlled fatigue did not reduce the normal capability of rider ${fatiguedContribution.riderId}.`,
      )
    }
  }

  const groupHoldSampleInputs = [
    {
      label: 'Comfortable',
      riderCapabilityScore: 85,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Comfortable boundary',
      riderCapabilityScore: 80,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Slight pressure',
      riderCapabilityScore: 79,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Moderate pressure',
      riderCapabilityScore: 70,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Drop boundary',
      riderCapabilityScore: 67,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Cannot hold',
      riderCapabilityScore: 66,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Severe deficit',
      riderCapabilityScore: 40,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    },
    {
      label: 'Minimum speed floor',
      riderCapabilityScore: 0,
      groupDemandScore: 100,
      groupSpeedKmh: 40,
    },
  ] as const

  const groupHoldSamples:
    DiagnosticGroupHoldSample[] =
    groupHoldSampleInputs.map((sample) => ({
      ...sample,
      result: calculateRiderGroupHold({
        riderCapabilityScore:
          sample.riderCapabilityScore,
        groupDemandScore:
          sample.groupDemandScore,
        groupSpeedKmh:
          sample.groupSpeedKmh,
      }),
    }))

  const comfortableSample =
    groupHoldSamples.find(
      (sample) =>
        sample.label === 'Comfortable',
    )

  const comfortableBoundarySample =
    groupHoldSamples.find(
      (sample) =>
        sample.label ===
        'Comfortable boundary',
    )

  const slightPressureSample =
    groupHoldSamples.find(
      (sample) =>
        sample.label === 'Slight pressure',
    )

  const dropBoundarySample =
    groupHoldSamples.find(
      (sample) =>
        sample.label === 'Drop boundary',
    )

  const cannotHoldSample =
    groupHoldSamples.find(
      (sample) =>
        sample.label === 'Cannot hold',
    )

  const severeDeficitSample =
    groupHoldSamples.find(
      (sample) =>
        sample.label === 'Severe deficit',
    )

  const minimumSpeedFloorSample =
    groupHoldSamples.find(
      (sample) =>
        sample.label ===
        'Minimum speed floor',
    )

  if (
    !comfortableSample ||
    !comfortableBoundarySample ||
    !slightPressureSample ||
    !dropBoundarySample ||
    !cannotHoldSample ||
    !severeDeficitSample ||
    !minimumSpeedFloorSample
  ) {
    throw new Error(
      'Diagnostic group-hold samples are incomplete.',
    )
  }

  if (
    comfortableSample.result.status !==
      'comfortable' ||
    comfortableSample.result
      .sustainableSpeedMultiplier !== 1 ||
    comfortableSample.result
      .shouldDropFromGroup
  ) {
    throw new Error(
      'Comfortable group-hold sample is invalid.',
    )
  }

  if (
    comfortableBoundarySample.result
      .capabilityMargin !== 5 ||
    comfortableBoundarySample.result
      .status !== 'comfortable'
  ) {
    throw new Error(
      'Comfortable group-hold boundary is invalid.',
    )
  }

  if (
    slightPressureSample.result.status !==
      'under_pressure' ||
    slightPressureSample.result
      .sustainableSpeedMultiplier >= 1 ||
    slightPressureSample.result
      .shouldDropFromGroup
  ) {
    throw new Error(
      'Slight-pressure group-hold sample is invalid.',
    )
  }

  if (
    dropBoundarySample.result
      .capabilityMargin !== -8 ||
    dropBoundarySample.result.status !==
      'under_pressure' ||
    dropBoundarySample.result
      .shouldDropFromGroup
  ) {
    throw new Error(
      'Group-hold drop boundary is invalid.',
    )
  }

  if (
    cannotHoldSample.result
      .capabilityMargin !== -9 ||
    cannotHoldSample.result.status !==
      'cannot_hold' ||
    !cannotHoldSample.result
      .shouldDropFromGroup
  ) {
    throw new Error(
      'Cannot-hold group sample is invalid.',
    )
  }

  if (
    severeDeficitSample.result
      .speedDeficitKmh <=
    slightPressureSample.result
      .speedDeficitKmh
  ) {
    throw new Error(
      'Severe group-hold deficit must produce a larger speed deficit.',
    )
  }

  if (
    Math.abs(
      minimumSpeedFloorSample.result
        .sustainableSpeedMultiplier -
        0.85,
    ) > 1e-9
  ) {
    throw new Error(
      'Group-hold minimum sustainable-speed multiplier must be 0.85.',
    )
  }

  if (
    Math.abs(
      minimumSpeedFloorSample.result
        .sustainableSpeedKmh -
        34,
    ) > 1e-9
  ) {
    throw new Error(
      'Group-hold minimum speed floor must equal 34 km/h for a 40 km/h group.',
    )
  }

  const droppedGroupSample =
    createDroppedGroup({
      state: initialState,
      sourceGroupId: 'peloton_main',
      riderIds: [
        'rider-b2',
        'rider-a2',
      ],
      speedKmh: 34,
    })

  if (
    droppedGroupSample.droppedGroupId !==
    'dropped_1'
  ) {
    throw new Error(
      `Expected dropped group ID dropped_1, received ${droppedGroupSample.droppedGroupId}.`,
    )
  }

  if (
    JSON.stringify(
      droppedGroupSample.movedRiderIds,
    ) !==
    JSON.stringify([
      'rider-a2',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'Dropped-group rider ordering is invalid.',
    )
  }

  if (
    JSON.stringify(
      droppedGroupSample.sourceGroup
        .riderIds,
    ) !==
    JSON.stringify([
      'rider-a1',
      'rider-b1',
    ])
  ) {
    throw new Error(
      'Dropped-group source membership is invalid.',
    )
  }

  if (
    droppedGroupSample.droppedGroup
      .groupType !== 'dropped'
  ) {
    throw new Error(
      'Created group must have groupType dropped.',
    )
  }

  if (
    droppedGroupSample.droppedGroup
      .speedKmh !== 34
  ) {
    throw new Error(
      'Dropped-group speed must equal 34 km/h.',
    )
  }

  if (
    droppedGroupSample.state
      .nextDroppedGroupNumber !== 2
  ) {
    throw new Error(
      'Dropped-group counter did not advance to 2.',
    )
  }

  if (
    droppedGroupSample.state.riders[
      'rider-a2'
    ].currentGroupId !== 'dropped_1' ||
    droppedGroupSample.state.riders[
      'rider-b2'
    ].currentGroupId !== 'dropped_1'
  ) {
    throw new Error(
      'Moved riders were not assigned to dropped_1.',
    )
  }

  if (
    droppedGroupSample.state.riders[
      'rider-a1'
    ].currentGroupId !==
      'peloton_main' ||
    droppedGroupSample.state.riders[
      'rider-b1'
    ].currentGroupId !==
      'peloton_main'
  ) {
    throw new Error(
      'Remaining riders must stay in peloton_main.',
    )
  }

  if (
    initialState.groups.dropped_1 != null ||
    initialState.nextDroppedGroupNumber !==
      1 ||
    initialState.groups.peloton_main
      .riderIds.length !== 4
  ) {
    throw new Error(
      'Dropped-group transformation mutated the original initial state.',
    )
  }

  const multiGroupMovementSample =
    calculateMultiGroupMovement(
      droppedGroupSample.state,
    )

  if (
    multiGroupMovementSample
      .proposals.length !== 2
  ) {
    throw new Error(
      'Expected exactly two multi-group movement proposals.',
    )
  }

  if (
    JSON.stringify(
      multiGroupMovementSample
        .proposals.map(
          (proposal) =>
            proposal.groupId,
        ),
    ) !==
    JSON.stringify([
      'dropped_1',
      'peloton_main',
    ])
  ) {
    throw new Error(
      'Multi-group movement proposal ordering is invalid.',
    )
  }

  const droppedMovementProposal =
    multiGroupMovementSample
      .proposals.find(
        (proposal) =>
          proposal.groupId ===
          'dropped_1',
      )

  const pelotonMovementProposal =
    multiGroupMovementSample
      .proposals.find(
        (proposal) =>
          proposal.groupId ===
          'peloton_main',
      )

  if (
    !droppedMovementProposal ||
    !pelotonMovementProposal
  ) {
    throw new Error(
      'Multi-group movement proposals are incomplete.',
    )
  }

  if (
    multiGroupMovementSample
      .leaderGroupId !==
    'dropped_1'
  ) {
    throw new Error(
      `Expected dropped_1 to lead, received ${multiGroupMovementSample.leaderGroupId}.`,
    )
  }

  if (
    droppedMovementProposal
      .nextDistanceKm <=
    pelotonMovementProposal
      .nextDistanceKm
  ) {
    throw new Error(
      'Expected dropped_1 to move farther than peloton_main.',
    )
  }

  if (
    droppedMovementProposal
      .gapFromLeaderSeconds !== 0
  ) {
    throw new Error(
      'Leader group gap must equal zero.',
    )
  }

  if (
    pelotonMovementProposal
      .gapFromLeaderSeconds <= 0
  ) {
    throw new Error(
      'Peloton must have a positive gap from the leader.',
    )
  }

  if (
    droppedMovementProposal
      .baseSpeedKmh <=
    pelotonMovementProposal
      .baseSpeedKmh
  ) {
    throw new Error(
      'Expected the stronger dropped group to have a higher base speed.',
    )
  }

  if (
    multiGroupMovementSample
      .leaderDistanceKm !==
    droppedMovementProposal
      .nextDistanceKm
  ) {
    throw new Error(
      'Leader distance does not match the dropped-group proposal.',
    )
  }

  if (
    droppedGroupSample.state
      .groups.peloton_main
      .distanceKm !== 0 ||
    droppedGroupSample.state
      .groups.dropped_1
      .distanceKm !== 0
  ) {
    throw new Error(
      'Multi-group movement calculation mutated the transformation sample.',
    )
  }

  const appliedMultiGroupMovementSample =
    applyMultiGroupMovement({
      state: droppedGroupSample.state,
      movement: multiGroupMovementSample,
    })

  const appliedDroppedGroup =
    appliedMultiGroupMovementSample
      .state.groups.dropped_1

  const appliedPelotonGroup =
    appliedMultiGroupMovementSample
      .state.groups.peloton_main

  if (
    !appliedDroppedGroup ||
    !appliedPelotonGroup
  ) {
    throw new Error(
      'Applied multi-group movement is missing an expected group.',
    )
  }

  if (
    appliedMultiGroupMovementSample
      .previousRaceSecond !== 0 ||
    appliedMultiGroupMovementSample
      .nextRaceSecond !== 30 ||
    appliedMultiGroupMovementSample
      .state.raceSecond !== 30
  ) {
    throw new Error(
      'Applied multi-group movement did not advance the race clock from 0 to 30 seconds.',
    )
  }

  if (
    appliedMultiGroupMovementSample
      .previousCurrentKm !== 0
  ) {
    throw new Error(
      'Applied multi-group movement previous leader position must equal 0 km.',
    )
  }

  if (
    appliedMultiGroupMovementSample
      .nextCurrentKm !==
    multiGroupMovementSample
      .leaderDistanceKm
  ) {
    throw new Error(
      'Applied movement nextCurrentKm does not match the proposed leader distance.',
    )
  }

  if (
    appliedMultiGroupMovementSample
      .state.currentKm !==
    multiGroupMovementSample
      .leaderDistanceKm
  ) {
    throw new Error(
      'Applied state currentKm does not match the proposed leader distance.',
    )
  }

  const proposedDroppedMovement =
    multiGroupMovementSample
      .proposals.find(
        (proposal) =>
          proposal.groupId ===
          'dropped_1',
      )

  const proposedPelotonMovement =
    multiGroupMovementSample
      .proposals.find(
        (proposal) =>
          proposal.groupId ===
          'peloton_main',
      )

  if (
    !proposedDroppedMovement ||
    !proposedPelotonMovement
  ) {
    throw new Error(
      'Applied movement validation could not resolve both proposals.',
    )
  }

  if (
    appliedDroppedGroup.distanceKm !==
      proposedDroppedMovement
        .nextDistanceKm ||
    appliedDroppedGroup.speedKmh !==
      proposedDroppedMovement
        .appliedSpeedKmh ||
    appliedDroppedGroup
      .gapFromLeaderSeconds !==
      proposedDroppedMovement
        .gapFromLeaderSeconds
  ) {
    throw new Error(
      'Applied dropped-group state does not match its movement proposal.',
    )
  }

  if (
    appliedPelotonGroup.distanceKm !==
      proposedPelotonMovement
        .nextDistanceKm ||
    appliedPelotonGroup.speedKmh !==
      proposedPelotonMovement
        .appliedSpeedKmh ||
    appliedPelotonGroup
      .gapFromLeaderSeconds !==
      proposedPelotonMovement
        .gapFromLeaderSeconds
  ) {
    throw new Error(
      'Applied peloton state does not match its movement proposal.',
    )
  }

  for (
    const riderId of [
      'rider-a2',
      'rider-b2',
    ]
  ) {
    const rider =
      appliedMultiGroupMovementSample
        .state.riders[riderId]

    if (
      rider.distanceKm !==
        proposedDroppedMovement
          .nextDistanceKm ||
      rider.speedKmh !==
        proposedDroppedMovement
          .appliedSpeedKmh ||
      rider.currentGroupId !==
        'dropped_1'
    ) {
      throw new Error(
        `Applied movement is invalid for dropped-group rider ${riderId}.`,
      )
    }
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-b1',
    ]
  ) {
    const rider =
      appliedMultiGroupMovementSample
        .state.riders[riderId]

    if (
      rider.distanceKm !==
        proposedPelotonMovement
          .nextDistanceKm ||
      rider.speedKmh !==
        proposedPelotonMovement
          .appliedSpeedKmh ||
      rider.currentGroupId !==
        'peloton_main'
    ) {
      throw new Error(
        `Applied movement is invalid for peloton rider ${riderId}.`,
      )
    }
  }

  if (
    JSON.stringify(
      appliedMultiGroupMovementSample
        .appliedGroupIds,
    ) !==
    JSON.stringify([
      'dropped_1',
      'peloton_main',
    ])
  ) {
    throw new Error(
      'Applied multi-group movement ordering is invalid.',
    )
  }

  if (
    droppedGroupSample.state
      .raceSecond !== 0 ||
    droppedGroupSample.state
      .currentKm !== 0 ||
    droppedGroupSample.state
      .groups.dropped_1
      .distanceKm !== 0 ||
    droppedGroupSample.state
      .groups.peloton_main
      .distanceKm !== 0
  ) {
    throw new Error(
      'Applying multi-group movement mutated the source transformation state.',
    )
  }

  if (
    multiGroupMovementSample
      .leaderDistanceKm !==
    proposedDroppedMovement
      .nextDistanceKm
  ) {
    throw new Error(
      'Applying movement mutated the original movement proposal.',
    )
  }

  const appliedMultiGroupEnergySample =
    applyMultiGroupEnergy({
      state:
        appliedMultiGroupMovementSample
          .state,
      movement:
        multiGroupMovementSample,
    })

  if (
    appliedMultiGroupEnergySample
      .applications.length !== 4
  ) {
    throw new Error(
      'Expected exactly four multi-group rider-energy applications.',
    )
  }

  if (
    JSON.stringify(
      appliedMultiGroupEnergySample
        .applications.map(
          (application) =>
            application.riderId,
        ),
    ) !==
    JSON.stringify([
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'Multi-group rider-energy application ordering is invalid.',
    )
  }

  for (
    const application of
    appliedMultiGroupEnergySample
      .applications
  ) {
    if (
      application.energyCost <= 0
    ) {
      throw new Error(
        `Expected a positive energy cost for ${application.riderId}.`,
      )
    }

    if (
      application.nextEnergy >=
      application.previousEnergy
    ) {
      throw new Error(
        `Expected energy to decrease for ${application.riderId}.`,
      )
    }

    if (
      appliedMultiGroupEnergySample
        .state.riders[
          application.riderId
        ].energy !==
      application.nextEnergy
    ) {
      throw new Error(
        `Applied energy does not match rider state for ${application.riderId}.`,
      )
    }

    const proposal =
      multiGroupMovementSample
        .proposals.find(
          (candidate) =>
            candidate.groupId ===
            application.groupId,
        )

    if (!proposal) {
      throw new Error(
        `No group movement proposal exists for ${application.riderId}.`,
      )
    }

    if (
      application.baseSpeedKmh !==
        proposal.baseSpeedKmh ||
      application.appliedSpeedKmh !==
        proposal.appliedSpeedKmh ||
      application.gradientPercent !==
        proposal.gradientPercent
    ) {
      throw new Error(
        `Energy application does not use the correct group movement values for ${application.riderId}.`,
      )
    }
  }

  for (
    const riderId of [
      'rider-a2',
      'rider-b2',
    ]
  ) {
    const application =
      appliedMultiGroupEnergySample
        .applications.find(
          (candidate) =>
            candidate.riderId === riderId,
        )

    if (
      !application ||
      application.groupId !==
        'dropped_1'
    ) {
      throw new Error(
        `Expected ${riderId} energy to use dropped_1 movement.`,
      )
    }
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-b1',
    ]
  ) {
    const application =
      appliedMultiGroupEnergySample
        .applications.find(
          (candidate) =>
            candidate.riderId === riderId,
        )

    if (
      !application ||
      application.groupId !==
        'peloton_main'
    ) {
      throw new Error(
        `Expected ${riderId} energy to use peloton_main movement.`,
      )
    }
  }

  if (
    appliedMultiGroupEnergySample
      .state.raceSecond !==
    appliedMultiGroupMovementSample
      .state.raceSecond
  ) {
    throw new Error(
      'Applying multi-group energy changed the race clock.',
    )
  }

  if (
    appliedMultiGroupEnergySample
      .state.currentKm !==
    appliedMultiGroupMovementSample
      .state.currentKm
  ) {
    throw new Error(
      'Applying multi-group energy changed the leader position.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    if (
      appliedMultiGroupEnergySample
        .state.riders[riderId]
        .distanceKm !==
      appliedMultiGroupMovementSample
        .state.riders[riderId]
        .distanceKm
    ) {
      throw new Error(
        `Applying multi-group energy changed the distance of ${riderId}.`,
      )
    }
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    if (
      appliedMultiGroupMovementSample
        .state.riders[riderId]
        .energy !== 100
    ) {
      throw new Error(
        'Applying multi-group energy mutated the applied movement source state.',
      )
    }
  }

  const simulatedMultiGroupTickSample =
    simulateMultiGroupTick(
      droppedGroupSample.state,
    )

  if (
    simulatedMultiGroupTickSample
      .previousState !==
    droppedGroupSample.state
  ) {
    throw new Error(
      'The orchestrated multi-group tick did not preserve its source-state reference.',
    )
  }

  if (
    JSON.stringify(
      simulatedMultiGroupTickSample
        .movement,
    ) !==
    JSON.stringify(
      multiGroupMovementSample,
    )
  ) {
    throw new Error(
      'Orchestrated multi-group movement does not match the verified movement proposal.',
    )
  }

  if (
    JSON.stringify(
      simulatedMultiGroupTickSample
        .appliedMovement,
    ) !==
    JSON.stringify(
      appliedMultiGroupMovementSample,
    )
  ) {
    throw new Error(
      'Orchestrated applied movement does not match the verified applied movement.',
    )
  }

  if (
    JSON.stringify(
      simulatedMultiGroupTickSample
        .appliedEnergy,
    ) !==
    JSON.stringify(
      appliedMultiGroupEnergySample,
    )
  ) {
    throw new Error(
      'Orchestrated rider energy does not match the verified multi-group energy application.',
    )
  }

  if (
    JSON.stringify(
      simulatedMultiGroupTickSample
        .state,
    ) !==
    JSON.stringify(
      appliedMultiGroupEnergySample
        .state,
    )
  ) {
    throw new Error(
      'Orchestrated multi-group tick state does not match the verified energy-applied state.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .finishDetection
      .candidates.length !== 0 ||
    simulatedMultiGroupTickSample
      .finishDetection
      .finishedGroupIds.length !== 0 ||
    simulatedMultiGroupTickSample
      .finishDetection
      .candidateRiderIds.length !== 0
  ) {
    throw new Error(
      'The first orchestrated multi-group tick unexpectedly detected finish candidates.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .appliedFinish !== null
  ) {
    throw new Error(
      'The first orchestrated multi-group tick unexpectedly applied a finish.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .finishedRiderIds.length !== 0
  ) {
    throw new Error(
      'The first orchestrated multi-group tick unexpectedly finished riders.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .completedThisTick !== false ||
    simulatedMultiGroupTickSample
      .state.completed !== false
  ) {
    throw new Error(
      'The first orchestrated multi-group tick unexpectedly completed the simulation.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .previousState.raceSecond !== 0 ||
    simulatedMultiGroupTickSample
      .state.raceSecond !== 30
  ) {
    throw new Error(
      'The orchestrated multi-group tick did not advance the race clock from 0 to 30 seconds.',
    )
  }

  if (
    simulatedMultiGroupTickSample
      .state.currentKm !==
    multiGroupMovementSample
      .leaderDistanceKm
  ) {
    throw new Error(
      'The orchestrated multi-group tick leader position is invalid.',
    )
  }

  for (
    const proposal of
    multiGroupMovementSample
      .proposals
  ) {
    const group =
      simulatedMultiGroupTickSample
        .state.groups[
          proposal.groupId
        ]

    if (
      group.distanceKm !==
        proposal.nextDistanceKm ||
      group.speedKmh !==
        proposal.appliedSpeedKmh ||
      group.gapFromLeaderSeconds !==
        proposal.gapFromLeaderSeconds
    ) {
      throw new Error(
        `Orchestrated group state is invalid for ${proposal.groupId}.`,
      )
    }
  }

  if (
    simulatedMultiGroupTickSample
      .appliedEnergy
      .applications.length !== 4
  ) {
    throw new Error(
      'Expected four rider-energy applications in the orchestrated tick.',
    )
  }

  for (
    const application of
    simulatedMultiGroupTickSample
      .appliedEnergy
      .applications
  ) {
    const rider =
      simulatedMultiGroupTickSample
        .state.riders[
          application.riderId
        ]

    if (
      rider.energy !==
        application.nextEnergy ||
      rider.energy >=
        application.previousEnergy
    ) {
      throw new Error(
        `Orchestrated rider energy is invalid for ${application.riderId}.`,
      )
    }

    const proposal =
      simulatedMultiGroupTickSample
        .movement.proposals.find(
          (candidate) =>
            candidate.groupId ===
            application.groupId,
        )

    if (
      !proposal ||
      rider.distanceKm !==
        proposal.nextDistanceKm ||
      rider.speedKmh !==
        proposal.appliedSpeedKmh
    ) {
      throw new Error(
        `Orchestrated rider movement is invalid for ${application.riderId}.`,
      )
    }
  }

  if (
    droppedGroupSample
      .state.raceSecond !== 0 ||
    droppedGroupSample
      .state.currentKm !== 0
  ) {
    throw new Error(
      'The orchestrated multi-group tick mutated its source race clock or position.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    if (
      droppedGroupSample
        .state.riders[riderId]
        .energy !== 100 ||
      droppedGroupSample
        .state.riders[riderId]
        .distanceKm !== 0
    ) {
      throw new Error(
        `The orchestrated multi-group tick mutated source rider ${riderId}.`,
      )
    }
  }

  const controlledNearFinishTickState = {
    ...appliedMultiGroupEnergySample.state,
  
    raceSecond: 90,
    currentKm: 0.99,
  
    groups: {
      ...appliedMultiGroupEnergySample
        .state.groups,
  
      dropped_1: {
        ...appliedMultiGroupEnergySample
          .state.groups.dropped_1,
  
        distanceKm: 0.99,
        speedKmh: 34,
        gapFromLeaderSeconds: 0,
        active: true,
      },
  
      peloton_main: {
        ...appliedMultiGroupEnergySample
          .state.groups.peloton_main,
  
        distanceKm: 0.5,
        speedKmh: 36,
        gapFromLeaderSeconds: 36,
        active: true,
      },
    },
  
    riders: {
      ...appliedMultiGroupEnergySample
        .state.riders,
  
      'rider-a1': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-a1'],
  
        distanceKm: 0.5,
        speedKmh: 36,
        stageStatus: 'racing',
        finished: false,
        finishPosition: null,
        finishTimeSeconds: null,
      },
  
      'rider-b1': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-b1'],
  
        distanceKm: 0.5,
        speedKmh: 36,
        stageStatus: 'racing',
        finished: false,
        finishPosition: null,
        finishTimeSeconds: null,
      },
  
      'rider-a2': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-a2'],
  
        distanceKm: 0.99,
        speedKmh: 34,
        stageStatus: 'racing',
        finished: false,
        finishPosition: null,
        finishTimeSeconds: null,
      },
  
      'rider-b2': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-b2'],
  
        distanceKm: 0.99,
        speedKmh: 34,
        stageStatus: 'racing',
        finished: false,
        finishPosition: null,
        finishTimeSeconds: null,
      },
    },
  }
  
  
  
  
  const simulatedMultiGroupFinishTickSample =
    simulateMultiGroupTick(
      controlledNearFinishTickState,
    )
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .previousState.raceSecond !== 90 ||
    simulatedMultiGroupFinishTickSample
      .state.raceSecond !== 120
  ) {
    throw new Error(
      'The orchestrated finish tick did not advance from 90 to 120 seconds.',
    )
  }
  
  
  if (
    JSON.stringify(
      simulatedMultiGroupFinishTickSample
        .movement.proposals.map(
          (proposal) =>
            proposal.groupId,
        ),
    ) !==
    JSON.stringify([
      'dropped_1',
      'peloton_main',
    ])
  ) {
    throw new Error(
      'Orchestrated finish-tick movement ordering is invalid.',
    )
  }
  
  
  const finishTickDroppedProposal =
    simulatedMultiGroupFinishTickSample
      .movement.proposals.find(
        (proposal) =>
          proposal.groupId ===
          'dropped_1',
      )
  
  const finishTickPelotonProposal =
    simulatedMultiGroupFinishTickSample
      .movement.proposals.find(
        (proposal) =>
          proposal.groupId ===
          'peloton_main',
      )
  
  if (
    !finishTickDroppedProposal ||
    !finishTickPelotonProposal
  ) {
    throw new Error(
      'Missing orchestrated finish-tick movement proposals.',
    )
  }
  
  if (
    finishTickDroppedProposal
      .nextDistanceKm !== 1
  ) {
    throw new Error(
      'Expected dropped_1 to reach the finish during the orchestrated tick.',
    )
  }
  
  if (
    finishTickPelotonProposal
      .nextDistanceKm >= 1
  ) {
    throw new Error(
      'Expected peloton_main to remain below the finish during the orchestrated tick.',
    )
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .appliedEnergy
      .applications.length !== 4
  ) {
    throw new Error(
      'Expected four energy applications before orchestrated finish detection.',
    )
  }
  
  for (
    const application of
    simulatedMultiGroupFinishTickSample
      .appliedEnergy
      .applications
  ) {
    if (
      application.nextEnergy >=
      application.previousEnergy
    ) {
      throw new Error(
        `Expected energy reduction before finishing for ${application.riderId}.`,
      )
    }
  }
  
  
  if (
    JSON.stringify(
      simulatedMultiGroupFinishTickSample
        .finishDetection
        .finishedGroupIds,
    ) !==
    JSON.stringify([
      'dropped_1',
    ])
  ) {
    throw new Error(
      'The orchestrated tick did not detect only dropped_1 as finished.',
    )
  }
  
  if (
    JSON.stringify(
      simulatedMultiGroupFinishTickSample
        .finishDetection
        .candidateRiderIds,
    ) !==
    JSON.stringify([
      'rider-a2',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'The orchestrated finish candidate ordering is invalid.',
    )
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .appliedFinish === null
  ) {
    throw new Error(
      'The orchestrated tick did not apply detected finish candidates.',
    )
  }
  
  if (
    JSON.stringify(
      simulatedMultiGroupFinishTickSample
        .finishedRiderIds,
    ) !==
    JSON.stringify([
      'rider-a2',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'The orchestrated tick finished the wrong riders.',
    )
  }
  
  
  for (
    const riderId of [
      'rider-a2',
      'rider-b2',
    ]
  ) {
    const rider =
      simulatedMultiGroupFinishTickSample
        .state.riders[riderId]
  
    if (
      rider.stageStatus !==
        'finished' ||
      rider.finished !== true ||
      rider.distanceKm !== 1 ||
      rider.speedKmh !== 0 ||
      rider.finishTimeSeconds !==
        120
    ) {
      throw new Error(
        `Orchestrated finished rider state is invalid for ${riderId}.`,
      )
    }
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .state.riders['rider-a2']
      .finishPosition !== 1 ||
    simulatedMultiGroupFinishTickSample
      .state.riders['rider-b2']
      .finishPosition !== 2
  ) {
    throw new Error(
      'Orchestrated finish positions are invalid.',
    )
  }
  
  
  for (
    const riderId of [
      'rider-a1',
      'rider-b1',
    ]
  ) {
    const rider =
      simulatedMultiGroupFinishTickSample
        .state.riders[riderId]
  
    if (
      rider.stageStatus !== 'racing' ||
      rider.finished !== false ||
      rider.finishPosition !== null ||
      rider.finishTimeSeconds !== null ||
      rider.distanceKm >= 1
    ) {
      throw new Error(
        `Unfinished orchestrated peloton rider state is invalid for ${riderId}.`,
      )
    }
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .state.groups.dropped_1
      .active !== false ||
    simulatedMultiGroupFinishTickSample
      .state.groups.dropped_1
      .speedKmh !== 0
  ) {
    throw new Error(
      'The orchestrated tick did not deactivate dropped_1.',
    )
  }
  
  if (
    simulatedMultiGroupFinishTickSample
      .state.groups.peloton_main
      .active !== true
  ) {
    throw new Error(
      'The orchestrated tick incorrectly deactivated peloton_main.',
    )
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .appliedFinish.newEvents.length !==
      2
  ) {
    throw new Error(
      'Expected exactly two orchestrated rider-finish events.',
    )
  }
  
  if (
    JSON.stringify(
      simulatedMultiGroupFinishTickSample
        .appliedFinish.newEvents.map(
          (event) => ({
            eventType:
              event.eventType,
            riderId:
              event.actorRiderId,
            raceSecond:
              event.raceSecond,
            sourceGroupId:
              event.sourceGroupId,
          }),
        ),
    ) !==
    JSON.stringify([
      {
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-a2',
        raceSecond: 120,
        sourceGroupId:
          'dropped_1',
      },
      {
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-b2',
        raceSecond: 120,
        sourceGroupId:
          'dropped_1',
      },
    ])
  ) {
    throw new Error(
      'Orchestrated rider-finish events are invalid.',
    )
  }
  
  
  if (
    simulatedMultiGroupFinishTickSample
      .completedThisTick !== false ||
    simulatedMultiGroupFinishTickSample
      .state.completed !== false
  ) {
    throw new Error(
      'The orchestrated partial finish incorrectly completed the simulation.',
    )
  }
  
  if (
    simulatedMultiGroupFinishTickSample
      .appliedFinish.newEvents.some(
        (event) =>
          event.eventType ===
          'SIMULATION_COMPLETED',
      )
  ) {
    throw new Error(
      'The orchestrated partial finish created SIMULATION_COMPLETED too early.',
    )
  }
  
  
  if (
    controlledNearFinishTickState
      .raceSecond !== 90 ||
    controlledNearFinishTickState
      .groups.dropped_1
      .distanceKm !== 0.99 ||
    controlledNearFinishTickState
      .groups.dropped_1
      .active !== true
  ) {
    throw new Error(
      'The orchestrated finish tick mutated its controlled source state.',
    )
  }
  
  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    if (
      controlledNearFinishTickState
        .riders[riderId]
        .stageStatus !== 'racing'
    ) {
      throw new Error(
        `The orchestrated finish tick mutated source rider ${riderId}.`,
      )
    }
  }

  const fullMultiGroupStageSample =
    runMultiGroupStage(
      droppedGroupSample.state,
      {
        maximumTickCount: 100,
      },
    )

  if (
    fullMultiGroupStageSample
      .completed !== true ||
    fullMultiGroupStageSample
      .finalState.completed !== true
  ) {
    throw new Error(
      'The full multi-group stage did not complete.',
    )
  }

  if (
    fullMultiGroupStageSample
      .tickCount <= 0 ||
    fullMultiGroupStageSample
      .tickCount !==
    fullMultiGroupStageSample
      .ticks.length
  ) {
    throw new Error(
      'The full multi-group stage tick trace is invalid.',
    )
  }

  const finalMultiGroupTick =
    fullMultiGroupStageSample
      .ticks[
        fullMultiGroupStageSample
          .ticks.length - 1
      ]

  if (
    !finalMultiGroupTick ||
    finalMultiGroupTick
      .state.completed !== true ||
    finalMultiGroupTick
      .completedThisTick !== true
  ) {
    throw new Error(
      'The final full-stage multi-group tick did not complete the simulation.',
    )
  }

  for (
    let tickIndex = 0;
    tickIndex <
    fullMultiGroupStageSample
      .ticks.length;
    tickIndex += 1
  ) {
    const tick =
      fullMultiGroupStageSample
        .ticks[tickIndex]

    const expectedPreviousSecond =
      tickIndex * 30

    const expectedNextSecond =
      expectedPreviousSecond + 30

    if (
      tick.previousState
        .raceSecond !==
        expectedPreviousSecond ||
      tick.state.raceSecond !==
        expectedNextSecond
    ) {
      throw new Error(
        `Full-stage race-clock continuity failed at tick ${tickIndex + 1}.`,
      )
    }
  }

  if (
    fullMultiGroupStageSample
      .results.length !== 4
  ) {
    throw new Error(
      'Expected exactly four full-stage multi-group results.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupStageSample
        .results.map(
          (result) =>
            result.rank,
        ),
    ) !==
    JSON.stringify([
      1,
      2,
      3,
      4,
    ])
  ) {
    throw new Error(
      'Full-stage multi-group result ranks are not contiguous.',
    )
  }

  const fullStageResultRiderIds =
    fullMultiGroupStageSample
      .results.map(
        (result) =>
          result.riderId,
      )

  if (
    new Set(
      fullStageResultRiderIds,
    ).size !== 4
  ) {
    throw new Error(
      'Full-stage multi-group results contain duplicate riders.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    if (
      !fullStageResultRiderIds.includes(
        riderId,
      )
    ) {
      throw new Error(
        `Missing full-stage result for ${riderId}.`,
      )
    }
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    const rider =
      fullMultiGroupStageSample
        .finalState.riders[
          riderId
        ]

    if (
      rider.stageStatus !==
        'finished' ||
      rider.finished !== true ||
      rider.finishPosition === null ||
      rider.finishTimeSeconds === null ||
      rider.distanceKm !== 1 ||
      rider.speedKmh !== 0
    ) {
      throw new Error(
        `Full-stage final rider state is invalid for ${riderId}.`,
      )
    }
  }

  for (
    const group of
    Object.values(
      fullMultiGroupStageSample
        .finalState.groups,
    )
  ) {
    if (
      group.active !== false ||
      group.distanceKm !== 1 ||
      group.speedKmh !== 0
    ) {
      throw new Error(
        `Full-stage final group state is invalid for ${group.groupId}.`,
      )
    }
  }

  const fullStageFinishEvents =
    fullMultiGroupStageSample
      .events.filter(
        (event) =>
          event.eventType ===
          'RIDER_FINISHED',
      )

  if (
    fullStageFinishEvents.length !==
    4
  ) {
    throw new Error(
      'Expected exactly four full-stage rider-finish events.',
    )
  }

  const fullStageCompletionEvents =
    fullMultiGroupStageSample
      .events.filter(
        (event) =>
          event.eventType ===
          'SIMULATION_COMPLETED',
      )

  if (
    fullStageCompletionEvents.length !==
    1
  ) {
    throw new Error(
      'Expected exactly one full-stage simulation-completed event.',
    )
  }

  for (
    let eventIndex = 0;
    eventIndex <
    fullMultiGroupStageSample
      .events.length;
    eventIndex += 1
  ) {
    if (
      fullMultiGroupStageSample
        .events[eventIndex]
        .sequenceNumber !==
        eventIndex + 1
    ) {
      throw new Error(
        'Full-stage event sequence numbers are not contiguous.',
      )
    }
  }

  if (
    JSON.stringify(
      fullMultiGroupStageSample
        .results.map(
          (result) => ({
            riderId:
              result.riderId,
            rank:
              result.rank,
            elapsedSeconds:
              result.elapsedSeconds,
          }),
        ),
    ) !==
    JSON.stringify(
      fullStageFinishEvents.map(
        (event) => ({
          riderId:
            event.actorRiderId,
          rank:
            event.payload.rank,
          elapsedSeconds:
            event.payload
              .elapsedSeconds,
        }),
      ),
    )
  ) {
    throw new Error(
      'Full-stage results and rider-finish events do not agree.',
    )
  }

  const fullStageTicksWithFinishes =
    fullMultiGroupStageSample
      .ticks.filter(
        (tick) =>
          tick.finishedRiderIds
            .length > 0,
      )

  if (
    fullStageTicksWithFinishes
      .length < 1
  ) {
    throw new Error(
      'The full-stage runner did not record any finish ticks.',
    )
  }

  for (
    const tick of
    fullStageTicksWithFinishes
  ) {
    if (
      tick.appliedFinish === null ||
      tick.finishDetection
        .candidates.length === 0
    ) {
      throw new Error(
        'A full-stage finish tick is missing detection or application data.',
      )
    }
  }

  if (
    droppedGroupSample
      .state.completed !== false ||
    droppedGroupSample
      .state.raceSecond !== 0 ||
    droppedGroupSample
      .state.currentKm !== 0 ||
    droppedGroupSample
      .state.events.length !== 1
  ) {
    throw new Error(
      'The full-stage runner mutated its initial source state.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    const rider =
      droppedGroupSample
        .state.riders[riderId]

    if (
      rider.stageStatus !==
        'racing' ||
      rider.finished !== false ||
      rider.distanceKm !== 0 ||
      rider.energy !== 100
    ) {
      throw new Error(
        `The full-stage runner mutated source rider ${riderId}.`,
      )
    }
  }

  if (
    fullMultiGroupStageSample
      .replaySnapshots.length !== 5
  ) {
    throw new Error(
      'Expected exactly five full-stage multi-group replay snapshots.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupStageSample
        .replaySnapshots.map(
          (snapshot) =>
            snapshot.raceSecond,
        ),
    ) !==
    JSON.stringify([
      0,
      30,
      60,
      90,
      120,
    ])
  ) {
    throw new Error(
      'Full-stage multi-group replay snapshot timing is invalid.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupStageSample
        .replaySnapshots.map(
          (snapshot) =>
            snapshot.sequenceNumber,
        ),
    ) !==
    JSON.stringify([
      1,
      2,
      3,
      4,
      5,
    ])
  ) {
    throw new Error(
      'Full-stage multi-group replay snapshot sequence numbers are invalid.',
    )
  }

  const initialFullMultiGroupReplaySnapshot =
    fullMultiGroupStageSample
      .replaySnapshots[0]

  if (
    !initialFullMultiGroupReplaySnapshot ||
    initialFullMultiGroupReplaySnapshot
      .raceSecond !== 0 ||
    initialFullMultiGroupReplaySnapshot
      .currentKm !== 0 ||
    initialFullMultiGroupReplaySnapshot
      .completed !== false
  ) {
    throw new Error(
      'The initial full-stage multi-group replay snapshot is invalid.',
    )
  }

  const finalFullMultiGroupReplaySnapshot =
    fullMultiGroupStageSample
      .replaySnapshots[
        fullMultiGroupStageSample
          .replaySnapshots.length - 1
      ]

  if (
    !finalFullMultiGroupReplaySnapshot ||
    finalFullMultiGroupReplaySnapshot
      .raceSecond !==
      fullMultiGroupStageSample
        .finalState.raceSecond ||
    finalFullMultiGroupReplaySnapshot
      .currentKm !== 1 ||
    finalFullMultiGroupReplaySnapshot
      .completed !== true
  ) {
    throw new Error(
      'The final full-stage multi-group replay snapshot is invalid.',
    )
  }

  for (
    const tick of
    fullMultiGroupStageSample.ticks
  ) {
    const matchingSnapshot =
      fullMultiGroupStageSample
        .replaySnapshots.find(
          (snapshot) =>
            snapshot.raceSecond ===
            tick.state.raceSecond,
        )

    if (!matchingSnapshot) {
      throw new Error(
        `Missing replay snapshot for race second ${tick.state.raceSecond}.`,
      )
    }

    if (
      matchingSnapshot.currentKm !==
        tick.state.currentKm ||
      matchingSnapshot.completed !==
        tick.state.completed
    ) {
      throw new Error(
        `Replay snapshot does not match tick state at race second ${tick.state.raceSecond}.`,
      )
    }
  }

  for (
    const snapshot of
    fullMultiGroupStageSample
      .replaySnapshots
  ) {
    if (
      typeof snapshot
        .deterministicHash !==
        'string' ||
      snapshot
        .deterministicHash.length === 0
    ) {
      throw new Error(
        `Replay snapshot ${snapshot.sequenceNumber} is missing its deterministic hash.`,
      )
    }
  }

  if (
    new Set(
      fullMultiGroupStageSample
        .replaySnapshots.map(
          (snapshot) =>
            snapshot.deterministicHash,
        ),
    ).size !==
    fullMultiGroupStageSample
      .replaySnapshots.length
  ) {
    throw new Error(
      'Expected each full-stage replay snapshot to have a distinct hash.',
    )
  }

  if (
    typeof fullMultiGroupStageSample
      .replayCollection
      .deterministicHash !==
      'string' ||
    fullMultiGroupStageSample
      .replayCollection
      .deterministicHash.length === 0
  ) {
    throw new Error(
      'The full-stage replay collection is missing its deterministic hash.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupStageSample
        .replayCollection
        .snapshots,
    ) !==
    JSON.stringify(
      fullMultiGroupStageSample
        .replaySnapshots,
    )
  ) {
    throw new Error(
      'The full-stage replay collection does not contain the expected snapshots.',
    )
  }

  if (
    typeof fullMultiGroupStageSample
      .canonicalJson !== 'string' ||
    fullMultiGroupStageSample
      .canonicalJson.length === 0
  ) {
    throw new Error(
      'The full multi-group stage is missing canonical JSON.',
    )
  }

  if (
    typeof fullMultiGroupStageSample
      .deterministicHash !==
      'string' ||
    fullMultiGroupStageSample
      .deterministicHash.length === 0
  ) {
    throw new Error(
      'The full multi-group stage is missing its deterministic hash.',
    )
  }

  const parsedFullMultiGroupCanonicalJson =
    JSON.parse(
      fullMultiGroupStageSample
        .canonicalJson,
    ) as {
      readonly raceId: string
      readonly stageId: string
      readonly seed: string
      readonly completed: boolean
      readonly tickCount: number
      readonly finalState:
        typeof fullMultiGroupStageSample.finalState
      readonly results:
        typeof fullMultiGroupStageSample.results
      readonly events:
        typeof fullMultiGroupStageSample.events
      readonly replaySnapshots:
        typeof fullMultiGroupStageSample.replaySnapshots
      readonly replayCollection:
        typeof fullMultiGroupStageSample.replayCollection
    }

  if (
    parsedFullMultiGroupCanonicalJson
      .raceId !==
      fullMultiGroupStageSample
        .finalState.raceId ||
    parsedFullMultiGroupCanonicalJson
      .stageId !==
      fullMultiGroupStageSample
        .finalState.stageId ||
    parsedFullMultiGroupCanonicalJson
      .seed !==
      fullMultiGroupStageSample
        .finalState.seed ||
    parsedFullMultiGroupCanonicalJson
      .completed !== true
  ) {
    throw new Error(
      'The full-stage canonical identifiers or completion status are invalid.',
    )
  }

  if (
    parsedFullMultiGroupCanonicalJson
      .tickCount !==
    fullMultiGroupStageSample
      .tickCount
  ) {
    throw new Error(
      'The full-stage canonical tick count is invalid.',
    )
  }

  if (
    createCanonicalHashedValue(
      parsedFullMultiGroupCanonicalJson
        .finalState,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .finalState,
    ).canonicalJson
  ) {
    throw new Error(
      'The canonical full-stage final state does not match the runner final state.',
    )
  }

  if (
    createCanonicalHashedValue(
      parsedFullMultiGroupCanonicalJson
        .results,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .results,
    ).canonicalJson
  ) {
    throw new Error(
      'The canonical full-stage results do not match the runner results.',
    )
  }

  if (
    createCanonicalHashedValue(
      parsedFullMultiGroupCanonicalJson
        .events,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .events,
    ).canonicalJson
  ) {
    throw new Error(
      'The canonical full-stage events do not match the runner events.',
    )
  }

  if (
    createCanonicalHashedValue(
      parsedFullMultiGroupCanonicalJson
        .replaySnapshots,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .replaySnapshots,
    ).canonicalJson
  ) {
    throw new Error(
      'The canonical full-stage replay snapshots do not match the runner replay snapshots.',
    )
  }

  if (
    createCanonicalHashedValue(
      parsedFullMultiGroupCanonicalJson
        .replayCollection,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .replayCollection,
    ).canonicalJson
  ) {
    throw new Error(
      'The canonical full-stage replay collection does not match the runner replay collection.',
    )
  }

  if (
    'ticks' in
    parsedFullMultiGroupCanonicalJson
  ) {
    throw new Error(
      'The full-stage canonical payload unexpectedly contains the diagnostic tick trace.',
    )
  }

  const fullMultiGroupSimulationOutput =
    createMultiGroupSimulationOutput(
      fullMultiGroupStageSample,
    )

  if (
    fullMultiGroupSimulationOutput
      .raceId !==
      fullMultiGroupStageSample
        .finalState.raceId ||
    fullMultiGroupSimulationOutput
      .stageId !==
      fullMultiGroupStageSample
        .finalState.stageId ||
    fullMultiGroupSimulationOutput
      .seed !==
      fullMultiGroupStageSample
        .finalState.seed
  ) {
    throw new Error(
      'The full multi-group SimulationOutput identifiers are invalid.',
    )
  }

  if (
    fullMultiGroupSimulationOutput
      .engineVersion !==
      'race_engine_ts_v1'
  ) {
    throw new Error(
      'The full multi-group SimulationOutput engine version is invalid.',
    )
  }

  if (
    fullMultiGroupSimulationOutput
      .simulationMode !==
      'deterministic_road_race_v1'
  ) {
    throw new Error(
      'The full multi-group SimulationOutput simulation mode is invalid.',
    )
  }

  if (
    createCanonicalHashedValue(
      fullMultiGroupSimulationOutput
        .events,
    ).canonicalJson !==
    createCanonicalHashedValue(
      fullMultiGroupStageSample
        .events,
    ).canonicalJson
  ) {
    throw new Error(
      'The full multi-group SimulationOutput events do not match the stage events.',
    )
  }

  if (
    fullMultiGroupSimulationOutput
      .snapshots.length !==
    fullMultiGroupStageSample
      .replaySnapshots.length
  ) {
    throw new Error(
      'The full multi-group SimulationOutput snapshot count is invalid.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupSimulationOutput
        .snapshots.map(
          (snapshot) =>
            snapshot.raceSecond,
        ),
    ) !==
    JSON.stringify([
      0,
      30,
      60,
      90,
      120,
    ])
  ) {
    throw new Error(
      'The full multi-group SimulationOutput snapshot timing is invalid.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupSimulationOutput
        .snapshots.map(
          (snapshot) =>
            snapshot.frameNumber,
        ),
    ) !==
    JSON.stringify([
      1,
      2,
      3,
      4,
      5,
    ])
  ) {
    throw new Error(
      'The full multi-group SimulationOutput frame numbers are invalid.',
    )
  }

  for (
    let snapshotIndex = 0;
    snapshotIndex <
    fullMultiGroupSimulationOutput
      .snapshots.length;
    snapshotIndex += 1
  ) {
    const outputSnapshot =
      fullMultiGroupSimulationOutput
        .snapshots[snapshotIndex]

    const runnerSnapshot =
      fullMultiGroupStageSample
        .replaySnapshots[snapshotIndex]

    if (
      !outputSnapshot ||
      !runnerSnapshot ||
      outputSnapshot.raceSecond !==
        runnerSnapshot.raceSecond ||
      outputSnapshot.km !==
        runnerSnapshot.currentKm
    ) {
      throw new Error(
        `The full multi-group SimulationOutput snapshot mapping is invalid at index ${snapshotIndex}.`,
      )
    }
  }

  for (const snapshot of fullMultiGroupSimulationOutput.snapshots) {
    if (
      JSON.stringify(snapshot.groupOrder) !==
      JSON.stringify(snapshot.groups.map((group) => group.groupId))
    ) {
      throw new Error(
        `The full multi-group SimulationOutput group order is invalid for frame ${snapshot.frameNumber}.`,
      )
    }
  }

  for (const snapshot of fullMultiGroupSimulationOutput.snapshots) {
    if (new Set(snapshot.groupOrder).size !== snapshot.groupOrder.length) {
      throw new Error(
        `The full multi-group SimulationOutput contains duplicate groups in frame ${snapshot.frameNumber}.`,
      )
    }
  }

  for (const snapshot of fullMultiGroupSimulationOutput.snapshots) {
    const expectedEventSequenceNumbers =
      fullMultiGroupSimulationOutput.events
        .filter((event) => event.raceSecond <= snapshot.raceSecond)
        .map((event) => event.sequenceNumber)

    if (
      JSON.stringify(snapshot.eventSequenceNumbers) !==
      JSON.stringify(expectedEventSequenceNumbers)
    ) {
      throw new Error(
        `The full multi-group SimulationOutput event sequence mapping is invalid for frame ${snapshot.frameNumber}.`,
      )
    }
  }

  const firstFullMultiGroupOutputSnapshot =
    fullMultiGroupSimulationOutput.snapshots[0]

  if (
    !firstFullMultiGroupOutputSnapshot ||
    firstFullMultiGroupOutputSnapshot.frameNumber !== 1 ||
    firstFullMultiGroupOutputSnapshot.raceSecond !== 0 ||
    firstFullMultiGroupOutputSnapshot.km !== 0 ||
    JSON.stringify(firstFullMultiGroupOutputSnapshot.eventSequenceNumbers) !==
      JSON.stringify([1])
  ) {
    throw new Error(
      'The initial full multi-group SimulationOutput snapshot is invalid.',
    )
  }

  const finalFullMultiGroupOutputSnapshot =
    fullMultiGroupSimulationOutput.snapshots[
      fullMultiGroupSimulationOutput.snapshots.length - 1
    ]

  if (
    !finalFullMultiGroupOutputSnapshot ||
    finalFullMultiGroupOutputSnapshot.frameNumber !== 5 ||
    finalFullMultiGroupOutputSnapshot.raceSecond !== 120 ||
    finalFullMultiGroupOutputSnapshot.km !== 1 ||
    JSON.stringify(finalFullMultiGroupOutputSnapshot.eventSequenceNumbers) !==
      JSON.stringify([1, 2, 3, 4, 5, 6])
  ) {
    throw new Error(
      'The final full multi-group SimulationOutput snapshot is invalid.',
    )
  }

  if (fullMultiGroupSimulationOutput.finalRiderStates.length !== 4) {
    throw new Error(
      'Expected exactly four final rider states in the full multi-group SimulationOutput.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupSimulationOutput.finalRiderStates.map(
        (rider) => rider.finishPosition,
      ),
    ) !== JSON.stringify([1, 2, 3, 4])
  ) {
    throw new Error(
      'The full multi-group SimulationOutput final riders are not ordered by finish position.',
    )
  }

  if (
    JSON.stringify(
      fullMultiGroupSimulationOutput.finalRiderStates.map(
        (rider) => rider.riderId,
      ),
    ) !==
    JSON.stringify(
      fullMultiGroupStageSample.results.map((result) => result.riderId),
    )
  ) {
    throw new Error(
      'The full multi-group SimulationOutput rider order does not match the stage results.',
    )
  }

  for (const rider of fullMultiGroupSimulationOutput.finalRiderStates) {
    if (
      rider.stageStatus !== 'finished' ||
      rider.finished !== true ||
      rider.finishPosition === null ||
      rider.finishTimeSeconds === null ||
      rider.distanceKm !== 1 ||
      rider.speedKmh !== 0
    ) {
      throw new Error(
        `The full multi-group SimulationOutput final rider state is invalid for ${rider.riderId}.`,
      )
    }
  }

  const deterministicRoadRaceOutput =
    runDeterministicRoadRace(
      diagnosticStageInput,
    )

  if (
    deterministicRoadRaceOutput
      .raceId !==
      diagnosticStageInput.raceId ||
    deterministicRoadRaceOutput
      .stageId !==
      diagnosticStageInput.stageId ||
    deterministicRoadRaceOutput
      .seed !==
      diagnosticStageInput.seed
  ) {
    throw new Error(
      'The deterministic road-race entry-point identifiers are invalid.',
    )
  }

  if (
    deterministicRoadRaceOutput
      .engineVersion !==
      'race_engine_ts_v1' ||
    deterministicRoadRaceOutput
      .simulationMode !==
      'deterministic_road_race_v1'
  ) {
    throw new Error(
      'The deterministic road-race entry-point contract is invalid.',
    )
  }

  if (
    deterministicRoadRaceOutput
      .finalRiderStates.length !==
    diagnosticStageInput
      .riders.length
  ) {
    throw new Error(
      'The deterministic road-race entry point returned an invalid rider count.',
    )
  }

  for (
    const rider of
    deterministicRoadRaceOutput
      .finalRiderStates
  ) {
    if (
      rider.finished !== true ||
      rider.stageStatus !==
        'finished' ||
      rider.finishPosition === null ||
      rider.finishTimeSeconds === null ||
      rider.distanceKm !==
        diagnosticStageInput
          .distanceKm ||
      rider.speedKmh !== 0
    ) {
      throw new Error(
        `The deterministic road-race entry point returned an invalid final state for ${rider.riderId}.`,
      )
    }
  }

  const finalDeterministicRoadRaceEvent =
    deterministicRoadRaceOutput
      .events[
        deterministicRoadRaceOutput
          .events.length - 1
      ]

  if (
    !finalDeterministicRoadRaceEvent ||
    finalDeterministicRoadRaceEvent
      .eventType !==
      'SIMULATION_COMPLETED'
  ) {
    throw new Error(
      'The deterministic road-race entry point is missing the completion event.',
    )
  }

  if (
    deterministicRoadRaceOutput
      .snapshots.length === 0
  ) {
    throw new Error(
      'The deterministic road-race entry point returned no replay snapshots.',
    )
  }

  const firstDeterministicRoadRaceSnapshot =
    deterministicRoadRaceOutput
      .snapshots[0]

  const finalDeterministicRoadRaceSnapshot =
    deterministicRoadRaceOutput
      .snapshots[
        deterministicRoadRaceOutput
          .snapshots.length - 1
      ]

  if (
    !firstDeterministicRoadRaceSnapshot ||
    firstDeterministicRoadRaceSnapshot
      .frameNumber !== 1 ||
    firstDeterministicRoadRaceSnapshot
      .raceSecond !== 0 ||
    firstDeterministicRoadRaceSnapshot
      .km !== 0
  ) {
    throw new Error(
      'The initial deterministic road-race snapshot is invalid.',
    )
  }

  if (
    !finalDeterministicRoadRaceSnapshot ||
    finalDeterministicRoadRaceSnapshot
      .km !==
      diagnosticStageInput
        .distanceKm
  ) {
    throw new Error(
      'The final deterministic road-race snapshot is invalid.',
    )
  }

  if (
    droppedGroupSample
      .state.raceSecond !== 0 ||
    droppedGroupSample
      .state.currentKm !== 0 ||
    droppedGroupSample
      .state.completed !== false
  ) {
    throw new Error(
      'Replay capture mutated the full-stage source state.',
    )
  }

  const controlledFinishState = {
    ...appliedMultiGroupEnergySample.state,

    raceSecond: 90,
    currentKm: 1,

    groups: {
      ...appliedMultiGroupEnergySample
        .state.groups,

      dropped_1: {
        ...appliedMultiGroupEnergySample
          .state.groups.dropped_1,

        distanceKm: 1,
        speedKmh: 0,
        gapFromLeaderSeconds: 0,
      },

      peloton_main: {
        ...appliedMultiGroupEnergySample
          .state.groups.peloton_main,

        distanceKm: 0.95,
        speedKmh: 40,
        gapFromLeaderSeconds: 4.5,
      },
    },

    riders: {
      ...appliedMultiGroupEnergySample
        .state.riders,

      'rider-a1': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-a1'],

        distanceKm: 0.95,
        speedKmh: 40,
      },

      'rider-b1': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-b1'],

        distanceKm: 0.95,
        speedKmh: 40,
      },

      'rider-a2': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-a2'],

        distanceKm: 1,
        speedKmh: 0,
      },

      'rider-b2': {
        ...appliedMultiGroupEnergySample
          .state.riders['rider-b2'],

        distanceKm: 1,
        speedKmh: 0,
      },
    },
  }

  const multiGroupFinishCandidateSample =
    detectMultiGroupFinishCandidates(
      controlledFinishState,
    )

  if (
    JSON.stringify(
      multiGroupFinishCandidateSample
        .finishedGroupIds,
    ) !==
    JSON.stringify([
      'dropped_1',
    ])
  ) {
    throw new Error(
      'Expected only dropped_1 to be detected as a finished group.',
    )
  }

  if (
    multiGroupFinishCandidateSample
      .candidates.length !== 2
  ) {
    throw new Error(
      'Expected exactly two multi-group finish candidates.',
    )
  }

  if (
    JSON.stringify(
      multiGroupFinishCandidateSample
        .candidateRiderIds,
    ) !==
    JSON.stringify([
      'rider-a2',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'Multi-group finish candidate ordering is invalid.',
    )
  }

  for (
    const candidate of
    multiGroupFinishCandidateSample
      .candidates
  ) {
    if (
      candidate.groupId !==
      'dropped_1'
    ) {
      throw new Error(
        `Expected ${candidate.riderId} to finish from dropped_1.`,
      )
    }

    if (
      candidate.groupDistanceKm !== 1
    ) {
      throw new Error(
        `Expected ${candidate.riderId} group distance to equal the stage finish.`,
      )
    }

    if (
      candidate.raceSecond !== 90
    ) {
      throw new Error(
        `Expected ${candidate.riderId} candidate race second to equal 90.`,
      )
    }

    if (
      candidate.groupGapFromLeaderSeconds !==
      0
    ) {
      throw new Error(
        `Expected ${candidate.riderId} group gap to equal zero.`,
      )
    }
  }

  if (
    multiGroupFinishCandidateSample
      .candidateRiderIds.includes(
        'rider-a1',
      ) ||
    multiGroupFinishCandidateSample
      .candidateRiderIds.includes(
        'rider-b1',
      )
  ) {
    throw new Error(
      'Riders from the unfinished peloton must not become finish candidates.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    const rider =
      controlledFinishState
        .riders[riderId]

    if (
      rider.stageStatus !== 'racing' ||
      rider.finished !== false ||
      rider.finishPosition !== null ||
      rider.finishTimeSeconds !== null
    ) {
      throw new Error(
        `Finish-candidate detection changed rider finish state for ${riderId}.`,
      )
    }
  }

  if (
    appliedMultiGroupEnergySample
      .state.raceSecond !== 30 ||
    appliedMultiGroupEnergySample
      .state.currentKm !==
        multiGroupMovementSample
          .leaderDistanceKm ||
    appliedMultiGroupEnergySample
      .state.groups.dropped_1
      .distanceKm !==
        multiGroupMovementSample
          .leaderDistanceKm
  ) {
    throw new Error(
      'Finish-candidate detection mutated the applied energy source state.',
    )
  }


  const appliedMultiGroupFinishSample =
    applyMultiGroupFinish({
      state: controlledFinishState,
      detection:
        multiGroupFinishCandidateSample,
    })

  if (
    JSON.stringify(
      appliedMultiGroupFinishSample
        .newlyFinishedRiderIds,
    ) !==
    JSON.stringify([
      'rider-a2',
      'rider-b2',
    ])
  ) {
    throw new Error(
      'Applied multi-group finish rider ordering is invalid.',
    )
  }

  const finishedRiderA2 =
    appliedMultiGroupFinishSample
      .state.riders['rider-a2']

  const finishedRiderB2 =
    appliedMultiGroupFinishSample
      .state.riders['rider-b2']

  if (
    finishedRiderA2.stageStatus !==
      'finished' ||
    finishedRiderA2.finished !== true ||
    finishedRiderA2.finishPosition !== 1 ||
    finishedRiderA2.finishTimeSeconds !==
      90 ||
    finishedRiderA2.distanceKm !== 1 ||
    finishedRiderA2.speedKmh !== 0
  ) {
    throw new Error(
      'Applied finish state is invalid for rider-a2.',
    )
  }

  if (
    finishedRiderB2.stageStatus !==
      'finished' ||
    finishedRiderB2.finished !== true ||
    finishedRiderB2.finishPosition !== 2 ||
    finishedRiderB2.finishTimeSeconds !==
      90 ||
    finishedRiderB2.distanceKm !== 1 ||
    finishedRiderB2.speedKmh !== 0
  ) {
    throw new Error(
      'Applied finish state is invalid for rider-b2.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-b1',
    ]
  ) {
    const rider =
      appliedMultiGroupFinishSample
        .state.riders[riderId]

    if (
      rider.stageStatus !== 'racing' ||
      rider.finished !== false ||
      rider.finishPosition !== null ||
      rider.finishTimeSeconds !== null ||
      rider.distanceKm !== 0.95 ||
      rider.speedKmh !== 40
    ) {
      throw new Error(
        `Unfinished peloton rider ${riderId} was changed incorrectly.`,
      )
    }
  }

  if (
    JSON.stringify(
      appliedMultiGroupFinishSample
        .newlyFinishedGroupIds,
    ) !==
    JSON.stringify([
      'dropped_1',
    ])
  ) {
    throw new Error(
      'Expected only dropped_1 to become inactive.',
    )
  }

  const finishedDroppedGroup =
    appliedMultiGroupFinishSample
      .state.groups.dropped_1

  const activePelotonGroup =
    appliedMultiGroupFinishSample
      .state.groups.peloton_main

  if (
    finishedDroppedGroup.active !== false ||
    finishedDroppedGroup.distanceKm !== 1 ||
    finishedDroppedGroup.speedKmh !== 0
  ) {
    throw new Error(
      'Finished dropped-group state is invalid.',
    )
  }

  if (
    activePelotonGroup.active !== true ||
    activePelotonGroup.distanceKm !==
      0.95 ||
    activePelotonGroup.speedKmh !== 40
  ) {
    throw new Error(
      'Unfinished peloton group was changed incorrectly.',
    )
  }

  if (
    appliedMultiGroupFinishSample
      .newResults.length !== 2
  ) {
    throw new Error(
      'Expected exactly two new partial finish results.',
    )
  }

  if (
    JSON.stringify(
      appliedMultiGroupFinishSample
        .newResults.map(
          (result) => ({
            rank: result.rank,
            riderId: result.riderId,
            elapsedSeconds:
              result.elapsedSeconds,
            gapSeconds:
              result.gapSeconds,
          }),
        ),
    ) !==
    JSON.stringify([
      {
        rank: 1,
        riderId: 'rider-a2',
        elapsedSeconds: 90,
        gapSeconds: 0,
      },
      {
        rank: 2,
        riderId: 'rider-b2',
        elapsedSeconds: 90,
        gapSeconds: 0,
      },
    ])
  ) {
    throw new Error(
      'Partial multi-group finish results are invalid.',
    )
  }

  if (
    appliedMultiGroupFinishSample
      .newEvents.length !== 2
  ) {
    throw new Error(
      'Expected exactly two new finish events.',
    )
  }

  if (
    JSON.stringify(
      appliedMultiGroupFinishSample
        .newEvents.map(
          (event) => ({
            sequenceNumber:
              event.sequenceNumber,
            eventType:
              event.eventType,
            riderId:
              event.actorRiderId,
            sourceGroupId:
              event.sourceGroupId,
          }),
        ),
    ) !==
    JSON.stringify([
      {
        sequenceNumber: 2,
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-a2',
        sourceGroupId:
          'dropped_1',
      },
      {
        sequenceNumber: 3,
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-b2',
        sourceGroupId:
          'dropped_1',
      },
    ])
  ) {
    throw new Error(
      'Partial multi-group finish events are invalid.',
    )
  }

  if (
    appliedMultiGroupFinishSample
      .completedThisApplication !==
      false ||
    appliedMultiGroupFinishSample
      .state.completed !== false
  ) {
    throw new Error(
      'The race must remain incomplete while peloton riders are still racing.',
    )
  }

  if (
    appliedMultiGroupFinishSample
      .newEvents.some(
        (event) =>
          event.eventType ===
          'SIMULATION_COMPLETED',
      )
  ) {
    throw new Error(
      'Partial finish application must not create SIMULATION_COMPLETED.',
    )
  }

  if (
    appliedMultiGroupFinishSample
      .state.raceSecond !== 90 ||
    appliedMultiGroupFinishSample
      .state.currentKm !== 1
  ) {
    throw new Error(
      'Partial finish application changed the controlled race time or leader position.',
    )
  }

  if (
    controlledFinishState
      .riders['rider-a2']
      .stageStatus !== 'racing' ||
    controlledFinishState
      .riders['rider-b2']
      .stageStatus !== 'racing' ||
    controlledFinishState
      .groups.dropped_1.active !==
      true
  ) {
    throw new Error(
      'Applying the partial finish mutated the controlled source state.',
    )
  }

  if (
    multiGroupFinishCandidateSample
      .candidateRiderIds.length !== 2
  ) {
    throw new Error(
      'Applying the partial finish mutated the candidate detection result.',
    )
  }

  const controlledFinalFinishState = {
    ...appliedMultiGroupFinishSample.state,

    raceSecond: 120,
    currentKm: 1,

    groups: {
      ...appliedMultiGroupFinishSample
        .state.groups,

      peloton_main: {
        ...appliedMultiGroupFinishSample
          .state.groups.peloton_main,

        distanceKm: 1,
        speedKmh: 0,
        gapFromLeaderSeconds: 30,
      },
    },

    riders: {
      ...appliedMultiGroupFinishSample
        .state.riders,

      'rider-a1': {
        ...appliedMultiGroupFinishSample
          .state.riders['rider-a1'],

        distanceKm: 1,
        speedKmh: 0,
      },

      'rider-b1': {
        ...appliedMultiGroupFinishSample
          .state.riders['rider-b1'],

        distanceKm: 1,
        speedKmh: 0,
      },
    },
  }

  const finalMultiGroupFinishCandidateSample =
    detectMultiGroupFinishCandidates(
      controlledFinalFinishState,
    )

  if (
    JSON.stringify(
      finalMultiGroupFinishCandidateSample
        .finishedGroupIds,
    ) !==
    JSON.stringify([
      'peloton_main',
    ])
  ) {
    throw new Error(
      'Expected only peloton_main to be detected in the final finish application.',
    )
  }

  if (
    JSON.stringify(
      finalMultiGroupFinishCandidateSample
        .candidateRiderIds,
    ) !==
    JSON.stringify([
      'rider-a1',
      'rider-b1',
    ])
  ) {
    throw new Error(
      'Final multi-group finish candidate ordering is invalid.',
    )
  }

  if (
    finalMultiGroupFinishCandidateSample
      .candidateRiderIds.includes(
        'rider-a2',
      ) ||
    finalMultiGroupFinishCandidateSample
      .candidateRiderIds.includes(
        'rider-b2',
      )
  ) {
    throw new Error(
      'Already-finished dropped-group riders must not become final finish candidates.',
    )
  }

  const completedMultiGroupFinishSample =
    applyMultiGroupFinish({
      state:
        controlledFinalFinishState,
      detection:
        finalMultiGroupFinishCandidateSample,
    })

  if (
    JSON.stringify(
      completedMultiGroupFinishSample
        .newlyFinishedRiderIds,
    ) !==
    JSON.stringify([
      'rider-a1',
      'rider-b1',
    ])
  ) {
    throw new Error(
      'Final applied finish rider ordering is invalid.',
    )
  }

  const finalRiderA1 =
    completedMultiGroupFinishSample
      .state.riders['rider-a1']

  const finalRiderB1 =
    completedMultiGroupFinishSample
      .state.riders['rider-b1']

  if (
    finalRiderA1.stageStatus !==
      'finished' ||
    finalRiderA1.finishPosition !== 3 ||
    finalRiderA1.finishTimeSeconds !==
      120
  ) {
    throw new Error(
      'Final finish state is invalid for rider-a1.',
    )
  }

  if (
    finalRiderB1.stageStatus !==
      'finished' ||
    finalRiderB1.finishPosition !== 4 ||
    finalRiderB1.finishTimeSeconds !==
      120
  ) {
    throw new Error(
      'Final finish state is invalid for rider-b1.',
    )
  }

  for (
    const riderId of [
      'rider-a2',
      'rider-b2',
    ]
  ) {
    const before =
      appliedMultiGroupFinishSample
        .state.riders[riderId]

    const after =
      completedMultiGroupFinishSample
        .state.riders[riderId]

    if (
      after.stageStatus !==
        'finished' ||
      after.finishPosition !==
        before.finishPosition ||
      after.finishTimeSeconds !==
        before.finishTimeSeconds
    ) {
      throw new Error(
        `Previously finished rider ${riderId} changed during final completion.`,
      )
    }
  }

  if (
    JSON.stringify(
      completedMultiGroupFinishSample
        .newResults.map(
          (result) => ({
            rank: result.rank,
            riderId: result.riderId,
            elapsedSeconds:
              result.elapsedSeconds,
            gapSeconds:
              result.gapSeconds,
          }),
        ),
    ) !==
    JSON.stringify([
      {
        rank: 3,
        riderId: 'rider-a1',
        elapsedSeconds: 120,
        gapSeconds: 30,
      },
      {
        rank: 4,
        riderId: 'rider-b1',
        elapsedSeconds: 120,
        gapSeconds: 30,
      },
    ])
  ) {
    throw new Error(
      'Final multi-group finish results are invalid.',
    )
  }

  if (
    completedMultiGroupFinishSample
      .newEvents.length !== 3
  ) {
    throw new Error(
      'Expected two final rider events and one simulation-completed event.',
    )
  }

  if (
    JSON.stringify(
      completedMultiGroupFinishSample
        .newEvents.map(
          (event) => ({
            sequenceNumber:
              event.sequenceNumber,
            eventType:
              event.eventType,
            riderId:
              event.actorRiderId,
          }),
        ),
    ) !==
    JSON.stringify([
      {
        sequenceNumber: 4,
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-a1',
      },
      {
        sequenceNumber: 5,
        eventType:
          'RIDER_FINISHED',
        riderId: 'rider-b1',
      },
      {
        sequenceNumber: 6,
        eventType:
          'SIMULATION_COMPLETED',
        riderId: null,
      },
    ])
  ) {
    throw new Error(
      'Final multi-group completion events are invalid.',
    )
  }

  if (
    completedMultiGroupFinishSample
      .completedThisApplication !==
      true ||
    completedMultiGroupFinishSample
      .state.completed !== true
  ) {
    throw new Error(
      'The final finish application did not complete the simulation.',
    )
  }

  if (
    completedMultiGroupFinishSample
      .state.nextEventSequenceNumber !==
    7
  ) {
    throw new Error(
      'Final event sequence number is invalid.',
    )
  }

  if (
    completedMultiGroupFinishSample
      .state.groups.dropped_1
      .active !== false ||
    completedMultiGroupFinishSample
      .state.groups.peloton_main
      .active !== false
  ) {
    throw new Error(
      'All groups must be inactive after the final finish application.',
    )
  }

  for (
    const riderId of [
      'rider-a1',
      'rider-a2',
      'rider-b1',
      'rider-b2',
    ]
  ) {
    const rider =
      completedMultiGroupFinishSample
        .state.riders[riderId]

    if (
      rider.stageStatus !==
        'finished' ||
      rider.finished !== true ||
      rider.distanceKm !== 1 ||
      rider.speedKmh !== 0
    ) {
      throw new Error(
        `Final completed state is invalid for ${riderId}.`,
      )
    }
  }

  if (
    JSON.stringify(
      Object.values(
        completedMultiGroupFinishSample
          .state.riders,
      )
        .map(
          (rider) =>
            rider.finishPosition,
        )
        .sort(
          (positionA, positionB) =>
            Number(positionA) -
            Number(positionB),
        ),
    ) !==
    JSON.stringify([
      1,
      2,
      3,
      4,
    ])
  ) {
    throw new Error(
      'Completed multi-group finish positions are not contiguous.',
    )
  }

  if (
    controlledFinalFinishState
      .completed !== false ||
    controlledFinalFinishState
      .riders['rider-a1']
      .stageStatus !== 'racing' ||
    controlledFinalFinishState
      .groups.peloton_main
      .active !== true
  ) {
    throw new Error(
      'Final finish application mutated its controlled source state.',
    )
  }

  // Capture initial replay snapshot (sequenceNumber = 1)
  const replaySnapshots: ReplaySnapshot[] = [
    createReplaySnapshot({
      state: initialState,
      sequenceNumber: 1,
    }),
  ]

  let nextReplaySequenceNumber = 2

  let state: SimulationState = initialState
  let results: readonly StageResult[] = []
  let tickCount = 0

  // Tick traces captured each tick for diagnostics.
  const tickTraces: DiagnosticTickTrace[] = []
  const riderEnergyTraces: DiagnosticRiderEnergyTrace[] = []

  // Advance simulation until completion, with a safety limit.
  while (!state.completed) {
    // Preserve previous tick state for boundary calculation.
    const previousState = state

    const previousPeloton =
      previousState.groups.peloton_main

    if (!previousPeloton) {
      throw new Error(
        'Diagnostic tick trace requires peloton_main before each tick.',
      )
    }

    const tickTerrainSample = getStageTerrainSample(
      diagnosticStageInput,
      previousPeloton.distanceKm,
    )

    const tickPelotonRiders =
      previousPeloton.riderIds.map(
        (riderId) => {
          const rider =
            previousState.riders[riderId]

          if (!rider) {
            throw new Error(
              `Diagnostic tick trace could not find rider ${riderId}.`,
            )
          }

          return rider
        },
      )

    const tickPelotonPace =
      calculatePelotonBasePace({
        riders: tickPelotonRiders,
        minimumSpeedKmh:
          diagnosticStageInput.settings
            .minimumSpeedKmh,
        maximumSpeedKmh:
          diagnosticStageInput.settings
            .maximumSpeedKmh,
      })

    const tickBaseSpeedKmh =
      tickPelotonPace.baseSpeedKmh

    const tickTerrainSpeed = calculateTerrainSpeed({
      baseSpeedKmh: tickBaseSpeedKmh,
      gradientPercent: tickTerrainSample.gradientPercent,
      minimumSpeedKmh: tickBaseSpeedKmh * 0.35,
      maximumSpeedKmh:
        diagnosticStageInput.settings.maximumSpeedKmh,
    })

    const expectedEnergyByRiderId: Readonly<
      Record<string, RiderEnergyCostResult>
    > = Object.fromEntries(
      tickPelotonRiders.map((rider) => [
        rider.riderId,
        calculateRiderEnergyCost({
          currentEnergy: rider.energy,
          speedKmh: tickTerrainSpeed.speedKmh,
          baseSpeedKmh: tickBaseSpeedKmh,
          gradientPercent: tickTerrainSample.gradientPercent,
          tickSeconds:
            diagnosticStageInput.settings.tickSeconds,
          stamina: rider.attributes.stamina,
          resistance: rider.attributes.resistance,
          recovery: rider.attributes.recovery,
        }),
      ]),
    )

    const tickResult = simulateTick({
      state,
      settings: diagnosticStageInput.settings,
    })

    state = tickResult.state
    tickCount += 1

    const sortedTickRiderIds = [...previousPeloton.riderIds].sort(
      (riderIdA, riderIdB) =>
        riderIdA.localeCompare(riderIdB),
    )

    for (const riderId of sortedTickRiderIds) {
      const previousRider = previousState.riders[riderId]
      const nextRider = state.riders[riderId]
      const expectedEnergy = expectedEnergyByRiderId[riderId]

      if (!previousRider || !nextRider || !expectedEnergy) {
        throw new Error(
          `Diagnostic energy trace could not resolve rider ${riderId}.`,
        )
      }

      if (
        Math.abs(
          nextRider.energy -
            expectedEnergy.nextEnergy,
        ) > 1e-9
      ) {
        throw new Error(
          `Actual rider energy did not match the expected calculation for ${riderId} at tick ${tickCount}.`,
        )
      }

      riderEnergyTraces.push({
        tickNumber: tickCount,
        previousRaceSecond:
          previousState.raceSecond,
        nextRaceSecond: state.raceSecond,
        riderId,
        riderName: previousRider.riderName,
        gradientPercent:
          tickTerrainSample.gradientPercent,
        appliedSpeedKmh:
          tickTerrainSpeed.speedKmh,
        energyBefore: previousRider.energy,
        expectedEnergyCost:
          expectedEnergy.energyCost,
        expectedEnergyAfter:
          expectedEnergy.nextEnergy,
        actualEnergyAfter: nextRider.energy,
      })
    }

    // Capture replay snapshots for any boundaries crossed by this tick.
    const crossedBoundaries = getReplaySnapshotBoundarySeconds(
      previousState.raceSecond,
      state.raceSecond,
      diagnosticStageInput.settings.replaySnapshotIntervalSeconds,
    )

    for (const boundarySecond of crossedBoundaries) {
      // The diagnostic engine expects snapshot boundaries to align with tick boundaries.
      if (boundarySecond !== state.raceSecond) {
        throw new Error(
          'Diagnostic replay capture requires snapshot boundaries to match tick boundaries.',
        )
      }

      replaySnapshots.push(
        createReplaySnapshot({
          state,
          sequenceNumber: nextReplaySequenceNumber,
        }),
      )

      nextReplaySequenceNumber += 1
    }

    if (tickResult.finishedThisTick) {
      results = tickResult.results
    }

    const nextPeloton =
      state.groups.peloton_main

    if (!nextPeloton) {
      throw new Error(
        'Diagnostic tick trace requires peloton_main after each tick.',
      )
    }

    tickTraces.push({
      tickNumber: tickCount,
      previousRaceSecond: previousState.raceSecond,
      nextRaceSecond: state.raceSecond,
      previousKm: previousPeloton.distanceKm,
      nextKm: nextPeloton.distanceKm,
      gradientPercent: tickTerrainSample.gradientPercent,
      elevationMetres: tickTerrainSample.elevationMetres,
      baseSpeedKmh: tickBaseSpeedKmh,
      terrainMultiplier: tickTerrainSpeed.terrainMultiplier,
      appliedSpeedKmh: tickTerrainSpeed.speedKmh,
      distanceAdvancedKm:
        nextPeloton.distanceKm -
        previousPeloton.distanceKm,
    })

    if (tickCount > 1000) {
      throw new Error(
        'Diagnostic simulation exceeded the 1000-tick safety limit.',
      )
    }
  }

  validateSimulationState(state)

  // Validate captured replay snapshots match expected diagnostic boundaries.
  const replayIntervalSeconds =
    diagnosticStageInput.settings.replaySnapshotIntervalSeconds

  const expectedReplaySeconds: number[] = [0]

  for (
    let raceSecond = replayIntervalSeconds;
    raceSecond <= state.raceSecond;
    raceSecond += replayIntervalSeconds
  ) {
    expectedReplaySeconds.push(raceSecond)
  }

  if (
    expectedReplaySeconds[expectedReplaySeconds.length - 1] !==
    state.raceSecond
  ) {
    throw new Error(
      'Diagnostic finish time must align with a replay snapshot boundary.',
    )
  }

  if (replaySnapshots.length !== expectedReplaySeconds.length) {
    throw new Error(
      `Expected ${expectedReplaySeconds.length} replay snapshots, received ${replaySnapshots.length}.`,
    )
  }

  for (let index = 0; index < replaySnapshots.length; index += 1) {
    const snapshot = replaySnapshots[index]
    const expectedSequence = index + 1
    const expectedRaceSecond = expectedReplaySeconds[index]

    if (snapshot.sequenceNumber !== expectedSequence) {
      throw new Error(
        `Replay snapshot sequence mismatch at index ${index}.`,
      )
    }

    if (snapshot.raceSecond !== expectedRaceSecond) {
      throw new Error(
        `Replay snapshot timing mismatch at index ${index}.`,
      )
    }
  }

  const finalReplaySnapshot =
    replaySnapshots[replaySnapshots.length - 1]

  if (!finalReplaySnapshot.completed) {
    throw new Error(
      'Final replay snapshot must represent a completed simulation.',
    )
  }

  // Create a canonical collection wrapper for the captured snapshots.
  const replayCollection =
    createReplaySnapshotCollection(replaySnapshots)

  const terrainSampleKilometres = [
    0,
    0.25,
    0.5,
    0.75,
    1,
  ] as const

  const terrainSamples = terrainSampleKilometres.map(
    (kilometre) =>
      getStageTerrainSample(
        diagnosticStageInput,
        kilometre,
      ),
  )

  const expectedTerrainSamples = [
    {
      kilometre: 0,
      elevationMetres: 100,
      gradientPercent: 0,
      lowerPointKilometre: 0,
      upperPointKilometre: 0.3,
    },
    {
      kilometre: 0.25,
      elevationMetres: 100,
      gradientPercent: 0,
      lowerPointKilometre: 0,
      upperPointKilometre: 0.3,
    },
    {
      kilometre: 0.5,
      elevationMetres: 110,
      gradientPercent: 5,
      lowerPointKilometre: 0.3,
      upperPointKilometre: 0.7,
    },
    {
      kilometre: 0.75,
      elevationMetres: 117.5,
      gradientPercent: -5,
      lowerPointKilometre: 0.7,
      upperPointKilometre: 1,
    },
    {
      kilometre: 1,
      elevationMetres: 105,
      gradientPercent: -5,
      lowerPointKilometre: 0.7,
      upperPointKilometre: 1,
    },
  ] as const

  for (let index = 0; index < terrainSamples.length; index += 1) {
    const sample = terrainSamples[index]
    const expected = expectedTerrainSamples[index]

    if (
      Math.abs(
        sample.elevationMetres -
          expected.elevationMetres,
      ) > 1e-9
    ) {
      throw new Error(
        `Unexpected terrain elevation at ${sample.kilometre} km.`,
      )
    }

    if (
      Math.abs(
        sample.gradientPercent -
          expected.gradientPercent,
      ) > 1e-9
    ) {
      throw new Error(
        `Unexpected terrain gradient at ${sample.kilometre} km.`,
      )
    }

    if (
      Math.abs(
        sample.lowerPointKilometre -
          expected.lowerPointKilometre,
      ) > 1e-9
    ) {
      throw new Error(
        `Unexpected lower terrain point at ${sample.kilometre} km.`,
      )
    }

    if (
      Math.abs(
        sample.upperPointKilometre -
          expected.upperPointKilometre,
      ) > 1e-9
    ) {
      throw new Error(
        `Unexpected upper terrain point at ${sample.kilometre} km.`,
      )
    }
  }

  const terrainSpeedGradients = [
    -10,
    -5,
    0,
    5,
    10,
  ] as const

  const terrainSpeedSamples = terrainSpeedGradients.map(
    (gradientPercent) =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent,
        minimumSpeedKmh: 10,
        maximumSpeedKmh: 80,
      }),
  )

  if (tickTraces.length !== tickCount) {
    throw new Error(
      'Diagnostic tick trace count does not match tick count.',
    )
  }

  for (let index = 0; index < tickTraces.length; index += 1) {
    const trace = tickTraces[index]

    if (trace.tickNumber !== index + 1) {
      throw new Error(
        `Diagnostic tick trace sequence mismatch at index ${index}.`,
      )
    }

    if (trace.nextRaceSecond <= trace.previousRaceSecond) {
      throw new Error(
        `Diagnostic tick trace time did not advance at tick ${trace.tickNumber}.`,
      )
    }

    if (trace.nextKm < trace.previousKm) {
      throw new Error(
        `Diagnostic tick trace moved backward at tick ${trace.tickNumber}.`,
      )
    }
  }

  const expectedEnergyTraceCount =
    tickCount *
    pelotonPace.eligibleRiderCount

  if (
    riderEnergyTraces.length !==
    expectedEnergyTraceCount
  ) {
    throw new Error(
      `Expected ${expectedEnergyTraceCount} rider energy traces, received ${riderEnergyTraces.length}.`,
    )
  }

  for (
    let index = 0;
    index < riderEnergyTraces.length;
    index += 1
  ) {
    const trace = riderEnergyTraces[index]

    if (
      !Number.isFinite(trace.energyBefore) ||
      !Number.isFinite(
        trace.expectedEnergyCost,
      ) ||
      !Number.isFinite(
        trace.actualEnergyAfter,
      )
    ) {
      throw new Error(
        `Diagnostic rider energy trace contains a non-finite value at index ${index}.`,
      )
    }

    if (
      trace.actualEnergyAfter >
      trace.energyBefore
    ) {
      throw new Error(
        `Diagnostic rider ${trace.riderId} gained energy at tick ${trace.tickNumber}.`,
      )
    }

    if (
      Math.abs(
        trace.actualEnergyAfter -
          trace.expectedEnergyAfter,
      ) > 1e-9
    ) {
      throw new Error(
        `Diagnostic rider ${trace.riderId} has mismatched expected and actual energy at tick ${trace.tickNumber}.`,
      )
    }
  }

  const canonicalValue = {
    finalState: state,
    results,
    tickCount,
    replayCollectionHash: replayCollection.deterministicHash,
    terrainSamples,
    terrainSpeedSamples,
    tickTraces,
    pelotonPace,
    riderEnergySamples,
    riderEnergyTraces,
    fatigueSamples,
    fatiguedPelotonPaceComparison,
    groupHoldSamples,
    droppedGroupSample,
    multiGroupMovementSample,
    appliedMultiGroupMovementSample,
    appliedMultiGroupEnergySample,
    simulatedMultiGroupTickSample,
    simulatedMultiGroupFinishTickSample,
    fullMultiGroupStageSample,
    fullMultiGroupSimulationOutput,
    deterministicRoadRaceOutput,
    multiGroupFinishCandidateSample,
    appliedMultiGroupFinishSample,
    finalMultiGroupFinishCandidateSample,
    completedMultiGroupFinishSample,
  }

  const hashedValue = createCanonicalHashedValue(canonicalValue)

  return {
    finalState: state,
    results,
    tickCount,
    canonicalJson: hashedValue.canonicalJson,
    deterministicHash: hashedValue.hash,
    replaySnapshots,
    replayCollection,
    terrainSamples,
    terrainSpeedSamples,
    tickTraces,
    pelotonPace,
    riderEnergySamples,
    riderEnergyTraces,
    fatigueSamples,
    fatiguedPelotonPaceComparison,
    groupHoldSamples,
    droppedGroupSample,
    multiGroupMovementSample,
    appliedMultiGroupMovementSample,
    appliedMultiGroupEnergySample,
    simulatedMultiGroupTickSample,
    simulatedMultiGroupFinishTickSample,
    fullMultiGroupStageSample,
    fullMultiGroupSimulationOutput,
    deterministicRoadRaceOutput,
    multiGroupFinishCandidateSample,
    appliedMultiGroupFinishSample,
    finalMultiGroupFinishCandidateSample,
    completedMultiGroupFinishSample,
  }
}

/**
 * getStatusColor
 * Tailwind color selection helper for check indicators.
 */
function getStatusColor(ok: boolean): string {
  return ok ? 'text-emerald-500' : 'text-red-500'
}

/**
 * getBadgeClasses
 * Returns Tailwind classes for PASS/FAIL/ERROR badges.
 */
function getBadgeClasses(kind: 'pass' | 'fail' | 'error'): string {
  if (kind === 'pass') {
    return 'inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/40'
  }

  if (kind === 'fail') {
    return 'inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/40'
  }

  return 'inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/40'
}

/**
 * RaceEngineDeterminismDiagnostic
 * Main React component rendering the deterministic engine diagnostic UI.
 */
export default function RaceEngineDeterminismDiagnostic(): JSX.Element {
  const diagnosticResult = useMemo<DiagnosticPageResult>(() => {
    try {
      const runA = runDiagnosticStage()
      const runB = runDiagnosticStage()

      const identicalCanonicalJson = runA.canonicalJson === runB.canonicalJson

      const identicalHash = runA.deterministicHash === runB.deterministicHash

      const identicalResults =
        JSON.stringify(runA.results) === JSON.stringify(runB.results)

      const identicalEvents =
        JSON.stringify(runA.finalState.events) ===
        JSON.stringify(runB.finalState.events)

      const identicalRiders =
        JSON.stringify(runA.finalState.riders) ===
        JSON.stringify(runB.finalState.riders)

      const identicalGroups =
        JSON.stringify(runA.finalState.groups) ===
        JSON.stringify(runB.finalState.groups)

      const identicalTickCount = runA.tickCount === runB.tickCount

      // Replay comparisons
      const identicalReplaySnapshotCount =
        runA.replaySnapshots.length === runB.replaySnapshots.length

      const identicalReplaySnapshotTiming =
        JSON.stringify(
          runA.replaySnapshots.map((snapshot) => snapshot.raceSecond),
        ) ===
        JSON.stringify(
          runB.replaySnapshots.map((snapshot) => snapshot.raceSecond),
        )

      const identicalReplaySnapshotJson =
        JSON.stringify(
          runA.replaySnapshots.map((snapshot) => snapshot.canonicalJson),
        ) ===
        JSON.stringify(
          runB.replaySnapshots.map((snapshot) => snapshot.canonicalJson),
        )

      const identicalReplaySnapshotHashes =
        JSON.stringify(
          runA.replaySnapshots.map((snapshot) => snapshot.deterministicHash),
        ) ===
        JSON.stringify(
          runB.replaySnapshots.map((snapshot) => snapshot.deterministicHash),
        )

      const identicalReplayCollectionHash =
        runA.replayCollection.deterministicHash ===
        runB.replayCollection.deterministicHash

      // Terrain comparisons
      const identicalTerrainSamples =
        JSON.stringify(runA.terrainSamples) ===
        JSON.stringify(runB.terrainSamples)

      const identicalTerrainSpeedSamples =
        JSON.stringify(runA.terrainSpeedSamples) ===
        JSON.stringify(runB.terrainSpeedSamples)

      // Tick trace comparisons
      const identicalTickTraces =
        JSON.stringify(runA.tickTraces) ===
        JSON.stringify(runB.tickTraces)

      const identicalPelotonPace =
        JSON.stringify(runA.pelotonPace) ===
        JSON.stringify(runB.pelotonPace)


      const identicalRiderEnergySamples =
        JSON.stringify(
          runA.riderEnergySamples,
        ) ===
        JSON.stringify(
          runB.riderEnergySamples,
        )

      const identicalRiderEnergyTraces =
        JSON.stringify(
          runA.riderEnergyTraces,
        ) ===
        JSON.stringify(
          runB.riderEnergyTraces,
        )

      const identicalFatigueSamples =
        JSON.stringify(
          runA.fatigueSamples,
        ) ===
        JSON.stringify(
          runB.fatigueSamples,
        )

      const identicalFatiguedPelotonPaceComparison =
        JSON.stringify(
          runA.fatiguedPelotonPaceComparison,
        ) ===
        JSON.stringify(
          runB.fatiguedPelotonPaceComparison,
        )

      const identicalGroupHoldSamples =
        JSON.stringify(
          runA.groupHoldSamples,
        ) ===
        JSON.stringify(
          runB.groupHoldSamples,
        )

      const identicalDroppedGroupSample =
        JSON.stringify(
          runA.droppedGroupSample,
        ) ===
        JSON.stringify(
          runB.droppedGroupSample,
        )

      const identicalMultiGroupMovementSample =
        JSON.stringify(
          runA.multiGroupMovementSample,
        ) ===
        JSON.stringify(
          runB.multiGroupMovementSample,
        )

      const identicalAppliedMultiGroupMovementSample =
        JSON.stringify(
          runA.appliedMultiGroupMovementSample,
        ) ===
        JSON.stringify(
          runB.appliedMultiGroupMovementSample,
        )

      const identicalAppliedMultiGroupEnergySample =
        JSON.stringify(
          runA.appliedMultiGroupEnergySample,
        ) ===
        JSON.stringify(
          runB.appliedMultiGroupEnergySample,
        )

      const identicalMultiGroupFinishCandidateSample =
        JSON.stringify(
          runA.multiGroupFinishCandidateSample,
        ) ===
        JSON.stringify(
          runB.multiGroupFinishCandidateSample,
        )

      const identicalAppliedMultiGroupFinishSample =
        JSON.stringify(
          runA.appliedMultiGroupFinishSample,
        ) ===
        JSON.stringify(
          runB.appliedMultiGroupFinishSample,
        )

      const identicalFinalMultiGroupFinishCandidateSample =
        JSON.stringify(
          runA.finalMultiGroupFinishCandidateSample,
        ) ===
        JSON.stringify(
          runB.finalMultiGroupFinishCandidateSample,
        )

      const identicalCompletedMultiGroupFinishSample =
        JSON.stringify(
          runA.completedMultiGroupFinishSample,
        ) ===
        JSON.stringify(
          runB.completedMultiGroupFinishSample,
        )

      const identicalSimulatedMultiGroupTickSample =
        JSON.stringify(
          runA.simulatedMultiGroupTickSample,
        ) ===
        JSON.stringify(
          runB.simulatedMultiGroupTickSample,
        )

      const identicalSimulatedMultiGroupFinishTickSample =
        JSON.stringify(
          runA.simulatedMultiGroupFinishTickSample,
        ) ===
        JSON.stringify(
          runB.simulatedMultiGroupFinishTickSample,
        )

      const identicalFullMultiGroupStageSample =
        JSON.stringify(
          runA.fullMultiGroupStageSample,
        ) ===
        JSON.stringify(
          runB.fullMultiGroupStageSample,
        )

      const identicalFullMultiGroupReplaySnapshots =
        JSON.stringify(
          runA.fullMultiGroupStageSample
            .replaySnapshots,
        ) ===
        JSON.stringify(
          runB.fullMultiGroupStageSample
            .replaySnapshots,
        )

      const identicalFullMultiGroupReplayCollection =
        JSON.stringify(
          runA.fullMultiGroupStageSample
            .replayCollection,
        ) ===
        JSON.stringify(
          runB.fullMultiGroupStageSample
            .replayCollection,
        )

      const identicalFullMultiGroupCanonicalJson =
        runA.fullMultiGroupStageSample
          .canonicalJson ===
        runB.fullMultiGroupStageSample
          .canonicalJson

      const identicalFullMultiGroupDeterministicHash =
        runA.fullMultiGroupStageSample
          .deterministicHash ===
        runB.fullMultiGroupStageSample
          .deterministicHash

      const identicalFullMultiGroupSimulationOutput =
        createCanonicalHashedValue(
          runA.fullMultiGroupSimulationOutput,
        ).canonicalJson ===
        createCanonicalHashedValue(
          runB.fullMultiGroupSimulationOutput,
        ).canonicalJson

      const identicalDeterministicRoadRaceOutput =
        createCanonicalHashedValue(
          runA.deterministicRoadRaceOutput,
        ).canonicalJson ===
        createCanonicalHashedValue(
          runB.deterministicRoadRaceOutput,
        ).canonicalJson

      const allChecksPassed =
        identicalCanonicalJson &&
        identicalHash &&
        identicalResults &&
        identicalEvents &&
        identicalRiders &&
        identicalGroups &&
        runA.finalState.completed &&
        runB.finalState.completed &&
        identicalTickCount &&
        identicalReplaySnapshotCount &&
        identicalReplaySnapshotTiming &&
        identicalReplaySnapshotJson &&
        identicalReplaySnapshotHashes &&
        identicalReplayCollectionHash &&
        identicalTerrainSamples &&
        identicalTerrainSpeedSamples &&
        identicalTickTraces &&
        identicalPelotonPace &&
        identicalRiderEnergySamples &&
        identicalRiderEnergyTraces &&
        identicalFatigueSamples &&
        identicalFatiguedPelotonPaceComparison &&
        identicalGroupHoldSamples &&
        identicalDroppedGroupSample &&
        identicalMultiGroupMovementSample &&
        identicalAppliedMultiGroupMovementSample &&
        identicalAppliedMultiGroupEnergySample &&
        identicalMultiGroupFinishCandidateSample &&
        identicalAppliedMultiGroupFinishSample &&
        identicalFinalMultiGroupFinishCandidateSample &&
        identicalCompletedMultiGroupFinishSample &&
        identicalSimulatedMultiGroupTickSample &&
        identicalSimulatedMultiGroupFinishTickSample &&
        identicalFullMultiGroupStageSample &&
        identicalFullMultiGroupReplaySnapshots &&
        identicalFullMultiGroupReplayCollection &&
        identicalFullMultiGroupCanonicalJson &&
        identicalFullMultiGroupDeterministicHash &&
        identicalFullMultiGroupSimulationOutput &&
        identicalDeterministicRoadRaceOutput

      const checks: DiagnosticChecks = {
        completeRunA: runA.finalState.completed,
        completeRunB: runB.finalState.completed,
        identicalCanonicalJson,
        identicalHash,
        identicalResults,
        identicalEvents,
        identicalRiders,
        identicalGroups,
        identicalTickCount,
        identicalReplaySnapshotCount,
        identicalReplaySnapshotTiming,
        identicalReplaySnapshotJson,
        identicalReplaySnapshotHashes,
        identicalReplayCollectionHash,
        finalStateAValidated: true,
        finalStateBValidated: true,
        identicalTerrainSamples,
        identicalTerrainSpeedSamples,
        identicalTickTraces,
        identicalPelotonPace,
        identicalRiderEnergySamples,
        identicalRiderEnergyTraces,
        identicalFatigueSamples,
        identicalFatiguedPelotonPaceComparison,
        identicalGroupHoldSamples,
        identicalDroppedGroupSample,
        identicalMultiGroupMovementSample,
        identicalAppliedMultiGroupMovementSample,
        identicalAppliedMultiGroupEnergySample,
        identicalMultiGroupFinishCandidateSample,
        identicalAppliedMultiGroupFinishSample,
        identicalFinalMultiGroupFinishCandidateSample,
        identicalCompletedMultiGroupFinishSample,
        identicalSimulatedMultiGroupTickSample,
        identicalSimulatedMultiGroupFinishTickSample,
        identicalFullMultiGroupStageSample,
        identicalFullMultiGroupReplaySnapshots,
        identicalFullMultiGroupReplayCollection,
        identicalFullMultiGroupCanonicalJson,
        identicalFullMultiGroupDeterministicHash,
        identicalFullMultiGroupSimulationOutput,
        identicalDeterministicRoadRaceOutput,
        allChecksPassed,
      }

      return {
        ok: true,
        runA,
        runB,
        checks,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack ?? null : null

      return {
        ok: false,
        message,
        stack,
      }
    }
  }, [])

  const isOk = diagnosticResult.ok

  const seed: string = diagnosticStageInput.seed
  const distanceKm: number = diagnosticStageInput.distanceKm
  const tickSeconds: number = diagnosticStageInput.settings.tickSeconds

  const winningResult: StageResult | undefined =
    isOk && diagnosticResult.runA.results.length > 0
      ? diagnosticResult.runA.results[0]
      : undefined

  const winningRiderId = winningResult?.riderId ?? null
  const winningRiderName =
    winningRiderId != null ? riderNameLookup[winningRiderId] ?? winningRiderId : '—'
  const winningTeamName =
    winningRiderId != null ? riderTeamLookup[winningRiderId] ?? '—' : '—'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Race Engine Determinism Diagnostic
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Temporary in-browser verification for the isolated Phase 2
            TypeScript engine. This runs a hard-coded 1 km stage twice and
            compares the outputs to confirm deterministic behavior.
          </p>
          <p className="max-w-3xl text-xs text-slate-400">
            This is temporary development tooling. It uses only hard-coded
            in-memory data, does not access Supabase, and does not activate
            the production race engine.
          </p>
        </header>

        {/* Status panel */}
        <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Determinism status
              </p>
              {isOk ? (
                diagnosticResult.checks.allChecksPassed ? (
                  <p className="text-sm font-semibold text-emerald-400">
                    PASS — IDENTICAL DETERMINISTIC OUTPUT
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-red-400">
                    FAIL — OUTPUTS ARE NOT IDENTICAL
                  </p>
                )
              ) : (
                <p className="text-sm font-semibold text-amber-400">
                  ERROR — DIAGNOSTIC COULD NOT COMPLETE
                </p>
              )}
            </div>
            <div>
              {isOk ? (
                diagnosticResult.checks.allChecksPassed ? (
                  <span className={getBadgeClasses('pass')}>All checks passed</span>
                ) : (
                  <span className={getBadgeClasses('fail')}>One or more checks failed</span>
                )
              ) : (
                <span className={getBadgeClasses('error')}>Engine error</span>
              )}
            </div>
          </div>

          {/* Individual checks */}
          <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
            {isOk ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.completeRunA)}>●</span>
                  <span>Complete run A</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.completeRunB)}>●</span>
                  <span>Complete run B</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalCanonicalJson)}>●</span>
                  <span>Identical canonical JSON</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalHash)}>●</span>
                  <span>Identical deterministic hash</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalResults)}>●</span>
                  <span>Identical results</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalEvents)}>●</span>
                  <span>Identical events</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalRiders)}>●</span>
                  <span>Identical riders</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalGroups)}>●</span>
                  <span>Identical groups</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalTickCount)}>●</span>
                  <span>Identical tick count</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalReplaySnapshotCount,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical replay snapshot count</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalReplaySnapshotTiming,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical replay snapshot timing</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalReplaySnapshotJson,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical replay snapshot JSON</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalReplaySnapshotHashes,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical replay snapshot hashes</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalReplayCollectionHash,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical replay collection hash</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.finalStateAValidated)}>●</span>
                  <span>Final state A validated</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.finalStateBValidated)}>●</span>
                  <span>Final state B validated</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalTerrainSamples,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical terrain samples</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalTerrainSpeedSamples,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical terrain speed samples</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalTickTraces,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical per-tick movement traces</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks.identicalPelotonPace,
                    )}
                  >
                    ●
                  </span>
                  <span>Identical rider-based peloton pace</span>
                </div>


                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalRiderEnergySamples,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical rider energy samples
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalRiderEnergyTraces,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical per-tick rider energy traces
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFatigueSamples,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical fatigue modifier samples
                  </span>
                </div>


                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFatiguedPelotonPaceComparison,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical low-energy peloton pace comparison
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalGroupHoldSamples,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical rider group-hold samples
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalDroppedGroupSample,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical dropped-group transformation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalMultiGroupMovementSample,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical multi-group movement proposal
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalAppliedMultiGroupMovementSample,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical applied multi-group movement
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalAppliedMultiGroupEnergySample,
                    )}
                  >
                    ●
                  </span>
                  <span>
                    Identical applied multi-group energy
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalMultiGroupFinishCandidateSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical multi-group finish candidates
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalAppliedMultiGroupFinishSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical applied multi-group finish
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFinalMultiGroupFinishCandidateSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical final multi-group finish candidates
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalCompletedMultiGroupFinishSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical completed multi-group finish
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalSimulatedMultiGroupTickSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical orchestrated multi-group tick
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalSimulatedMultiGroupFinishTickSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical orchestrated multi-group finish tick
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupStageSample,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group stage
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupReplaySnapshots,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group replay snapshots
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupReplayCollection,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group replay collection
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupCanonicalJson,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group canonical JSON
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupDeterministicHash,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group deterministic hash
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalFullMultiGroupSimulationOutput,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical full multi-group SimulationOutput
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={getStatusColor(
                      diagnosticResult.checks
                        .identicalDeterministicRoadRaceOutput,
                    )}
                  >
                    ●
                  </span>

                  <span>
                    Identical deterministic road-race entry output
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-amber-300">
                The diagnostic failed before completing. See the error details below.
              </div>
            )}
          </div>
        </section>

        {/* Error details */}
        {!isOk && (
          <section className="mb-6 rounded-lg border border-amber-700/70 bg-amber-950/40 p-4 text-xs text-amber-100">
            <p className="mb-1 font-semibold">Error details</p>
            <p className="mb-2 break-words text-amber-200">{diagnosticResult.message}</p>
            {diagnosticResult.stack && (
              <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug text-amber-200">
                {diagnosticResult.stack}
              </pre>
            )}
          </section>
        )}

        {/* Summary and tables */}
        {isOk && (
          <>
            {/* Summary cards */}
            <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Stage configuration
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Seed</dt>
                    <dd className="font-mono text-[11px]">{seed}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Stage distance</dt>
                    <dd>{distanceKm} km</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Tick seconds</dt>
                    <dd>{tickSeconds} s</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Run statistics
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A tick count</dt>
                    <dd>{diagnosticResult.runA.tickCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B tick count</dt>
                    <dd>{diagnosticResult.runB.tickCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A race seconds</dt>
                    <dd>{diagnosticResult.runA.finalState.raceSecond}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B race seconds</dt>
                    <dd>{diagnosticResult.runB.finalState.raceSecond}</dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Replay snapshot count</dt>
                    <dd>{diagnosticResult.runA.replaySnapshots.length}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Outcome summary
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Result count</dt>
                    <dd>{diagnosticResult.runA.results.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Event count</dt>
                    <dd>{diagnosticResult.runA.finalState.events.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Winning rider</dt>
                    <dd>{winningRiderName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Winning team</dt>
                    <dd>{winningTeamName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A hash</dt>
                    <dd className="font-mono text-[11px] break-all">{diagnosticResult.runA.deterministicHash}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B hash</dt>
                    <dd className="font-mono text-[11px] break-all">{diagnosticResult.runB.deterministicHash}</dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A replay hash</dt>
                    <dd className="font-mono text-[11px] break-all">
                      {diagnosticResult.runA.replayCollection.deterministicHash}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B replay hash</dt>
                    <dd className="font-mono text-[11px] break-all">
                      {diagnosticResult.runB.replayCollection.deterministicHash}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* Results table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Stage results (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Rank</th>
                      <th className="px-3 py-2 text-left font-medium">Rider ID</th>
                      <th className="px-3 py-2 text-left font-medium">Rider name</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Elapsed s</th>
                      <th className="px-3 py-2 text-right font-medium">Gap s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.results.map((result) => {
                      const name = riderNameLookup[result.riderId] ?? result.riderId
                      const teamName = riderTeamLookup[result.riderId] ?? result.teamId

                      return (
                        <tr
                          key={result.rank}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-left">{result.rank}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{result.riderId}</td>
                          <td className="px-3 py-1.5">{name}</td>
                          <td className="px-3 py-1.5">{teamName}</td>
                          <td className="px-3 py-1.5 capitalize">{result.status}</td>
                          <td className="px-3 py-1.5 text-right">{result.elapsedSeconds ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right">{result.gapSeconds ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Events table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Events (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Seq #</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Race s</th>
                      <th className="px-3 py-2 text-right font-medium">Km</th>
                      <th className="px-3 py-2 text-left font-medium">Actor rider</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.finalState.events.map((event) => (
                      <tr
                        key={event.sequenceNumber}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 text-left">{event.sequenceNumber}</td>
                        <td className="px-3 py-1.5 text-left">{event.eventType}</td>
                        <td className="px-3 py-1.5 text-right">{event.raceSecond}</td>
                        <td className="px-3 py-1.5 text-right">{event.kmMarker}</td>
                        <td className="px-3 py-1.5 text-left">{event.actorRiderId ?? '—'}</td>
                        <td className="px-3 py-1.5 text-left">{event.teamId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Replay snapshots table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Replay snapshots (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Sequence</th>
                      <th className="px-3 py-2 text-left font-medium">Race second</th>
                      <th className="px-3 py-2 text-right font-medium">Kilometre</th>
                      <th className="px-3 py-2 text-left font-medium">Completed</th>
                      <th className="px-3 py-2 text-right font-medium">Riders</th>
                      <th className="px-3 py-2 text-right font-medium">Groups</th>
                      <th className="px-3 py-2 text-right font-medium">Active groups</th>
                      <th className="px-3 py-2 text-right font-medium">Events</th>
                      <th className="px-3 py-2 text-left font-medium">Snapshot hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.replaySnapshots.map((snapshot) => (
                      <tr
                        key={snapshot.sequenceNumber}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 text-left">{snapshot.sequenceNumber}</td>
                        <td className="px-3 py-1.5 text-left">{snapshot.raceSecond}</td>
                        <td className="px-3 py-1.5 text-right">{snapshot.currentKm.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-left">{snapshot.completed ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-1.5 text-right">{snapshot.riderCount}</td>
                        <td className="px-3 py-1.5 text-right">{snapshot.groupCount}</td>
                        <td className="px-3 py-1.5 text-right">{snapshot.activeGroupCount}</td>
                        <td className="px-3 py-1.5 text-right">{snapshot.eventCount}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] break-all">{snapshot.deterministicHash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Per-tick movement trace (Run A) */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Per-tick movement trace (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">Tick</th>
                      <th className="px-3 py-2 text-right font-medium">From second</th>
                      <th className="px-3 py-2 text-right font-medium">To second</th>
                      <th className="px-3 py-2 text-right font-medium">From km</th>
                      <th className="px-3 py-2 text-right font-medium">To km</th>
                      <th className="px-3 py-2 text-right font-medium">Gradient %</th>
                      <th className="px-3 py-2 text-right font-medium">Elevation m</th>
                      <th className="px-3 py-2 text-right font-medium">Base speed</th>
                      <th className="px-3 py-2 text-right font-medium">Multiplier</th>
                      <th className="px-3 py-2 text-right font-medium">Applied speed</th>
                      <th className="px-3 py-2 text-right font-medium">Advanced km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.tickTraces.map((trace) => (
                      <tr
                        key={trace.tickNumber}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 text-right">{trace.tickNumber}</td>
                        <td className="px-3 py-1.5 text-right">{trace.previousRaceSecond}</td>
                        <td className="px-3 py-1.5 text-right">{trace.nextRaceSecond}</td>
                        <td className="px-3 py-1.5 text-right">{trace.previousKm.toFixed(4)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.nextKm.toFixed(4)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.gradientPercent.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.elevationMetres.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.baseSpeedKmh.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.terrainMultiplier.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.appliedSpeedKmh.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right">{trace.distanceAdvancedKm.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Rider-based peloton pace */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Rider-based peloton pace (Run A)
              </h2>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Eligible riders
                  </div>
                  <div className="mt-1 font-semibold">
                    {
                      diagnosticResult.runA.pelotonPace
                        .eligibleRiderCount
                    }
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Average capability
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA.pelotonPace
                      .averageCapabilityScore.toFixed(3)}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Speed-range usage
                  </div>
                  <div className="mt-1 font-semibold">
                    {(
                      diagnosticResult.runA.pelotonPace
                        .speedRangeUsage * 100
                    ).toFixed(3)}
                    %
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Calculated base speed
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA.pelotonPace
                      .baseSpeedKmh.toFixed(3)}{' '}
                    km/h
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Flat
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Stamina
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Resistance
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Teamwork
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Capability
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA.pelotonPace
                      .riderContributions.map(
                        (contribution) => (
                          <tr
                            key={contribution.riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5 text-left font-mono text-[11px]">
                              {contribution.riderId}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {contribution.flatContribution.toFixed(
                                3,
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {contribution.staminaContribution.toFixed(
                                3,
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {contribution.resistanceContribution.toFixed(
                                3,
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {contribution.teamworkContribution.toFixed(
                                3,
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold">
                              {contribution.capabilityScore.toFixed(
                                3,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Rider energy samples */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Rider energy samples — one flat tick (Run A)
              </h2>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Stamina
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Resistance
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Recovery
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Attribute score
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Efficiency
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Gross cost
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Energy cost
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Next energy
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .riderEnergySamples.map(
                        (sample) => (
                          <tr
                            key={sample.riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5 text-left">
                              <div className="font-medium">
                                {sample.riderName}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {sample.riderId}
                              </div>
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.stamina.toFixed(3)}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.resistance.toFixed(3)}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.recovery.toFixed(3)}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.result.attributeScore.toFixed(
                                3,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.result.efficiencyMultiplier.toFixed(
                                4,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.result.grossEnergyCost.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right font-semibold">
                              {sample.result.energyCost.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {sample.result.nextEnergy.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Actual per-tick rider energy trace */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Per-tick rider energy trace (Run A)
              </h2>

              <div className="max-h-96 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">Tick</th>
                      <th className="px-3 py-2 text-right font-medium">From s</th>
                      <th className="px-3 py-2 text-right font-medium">To s</th>
                      <th className="px-3 py-2 text-left font-medium">Rider</th>
                      <th className="px-3 py-2 text-right font-medium">Gradient %</th>
                      <th className="px-3 py-2 text-right font-medium">Speed</th>
                      <th className="px-3 py-2 text-right font-medium">Before</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Expected after</th>
                      <th className="px-3 py-2 text-right font-medium">Actual after</th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA.riderEnergyTraces.map(
                      (trace) => (
                        <tr
                          key={`${trace.tickNumber}-${trace.riderId}`}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-right">
                            {trace.tickNumber}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.previousRaceSecond}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.nextRaceSecond}
                          </td>
                          <td className="px-3 py-1.5 text-left">
                            <div className="font-medium">
                              {trace.riderName}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {trace.riderId}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.gradientPercent.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.appliedSpeedKmh.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.energyBefore.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {trace.expectedEnergyCost.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.expectedEnergyAfter.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trace.actualEnergyAfter.toFixed(6)}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled fatigue modifier samples */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Fatigue modifier samples (Run A)
              </h2>

              <p className="mb-3 text-xs text-slate-400">
                Controlled diagnostic inputs only. These multipliers are not
                connected to race movement yet.
              </p>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Sample
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Energy
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Resistance
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Recovery
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Deficit
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Protection
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Effective deficit
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Pace multiplier
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Fatigued
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA.fatigueSamples.map(
                      (sample) => (
                        <tr
                          key={sample.label}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-left font-medium">
                            {sample.label}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.currentEnergy.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.resistance.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.recovery.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.result.energyDeficit.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.result.protectionFactor.toFixed(4)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.result.effectiveDeficit.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {sample.result.paceMultiplier.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 text-left">
                            {sample.result.fatigued ? 'Yes' : 'No'}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled low-energy peloton pace comparison */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled low-energy peloton pace comparison
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only rider-energy overrides. The real race input and
                movement remain unchanged.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Normal average capability
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .normalAverageCapability.toFixed(6)}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Fatigued average capability
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .fatiguedAverageCapability.toFixed(6)}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Capability reduction
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .capabilityReduction.toFixed(6)}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Normal base speed
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .normalBaseSpeedKmh.toFixed(6)}{' '}
                    km/h
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Fatigued base speed
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .fatiguedBaseSpeedKmh.toFixed(6)}{' '}
                    km/h
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Speed reduction
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .speedReductionKmh.toFixed(6)}{' '}
                    km/h
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Raw capability
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Fatigue multiplier
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Final capability
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .fatiguedPelotonPaceComparison
                      .fatiguedPace
                      .riderContributions.map(
                        (contribution) => (
                          <tr
                            key={contribution.riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5 text-left font-mono text-[11px]">
                              {contribution.riderId}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {contribution.rawCapabilityScore.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {contribution.fatigueMultiplier.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right font-semibold">
                              {contribution.capabilityScore.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled rider group-hold samples */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Rider ability-to-hold-group samples
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only calculations. No rider is actually removed from
                the peloton in this step.
              </p>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Sample
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Rider capability
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Group demand
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Margin
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Group speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Sustainable multiplier
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Sustainable speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Speed deficit
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Drop
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA.groupHoldSamples.map(
                      (sample) => (
                        <tr
                          key={sample.label}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-left font-medium">
                            {sample.label}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.riderCapabilityScore.toFixed(
                              3,
                            )}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.groupDemandScore.toFixed(
                              3,
                            )}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.result.capabilityMargin.toFixed(
                              3,
                            )}
                          </td>

                          <td className="px-3 py-1.5 text-left">
                            {sample.result.status}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.groupSpeedKmh.toFixed(3)}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.result
                              .sustainableSpeedMultiplier.toFixed(
                                6,
                              )}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.result.sustainableSpeedKmh.toFixed(
                              6,
                            )}
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {sample.result.speedDeficitKmh.toFixed(
                              6,
                            )}
                          </td>

                          <td className="px-3 py-1.5 text-left">
                            {sample.result.shouldDropFromGroup
                              ? 'Yes'
                              : 'No'}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled dropped-group transformation */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled dropped-group transformation
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only immutable state transformation. The actual race
                continues with all four riders in peloton_main.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    New group ID
                  </div>
                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .droppedGroupSample
                      .droppedGroupId}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Group type
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .droppedGroupSample
                      .droppedGroup.groupType}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Dropped-group speed
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .droppedGroupSample
                      .droppedGroup.speedKmh.toFixed(3)}{' '}
                    km/h
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Next group number
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .droppedGroupSample
                      .state.nextDroppedGroupNumber}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Riders
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Distance km
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Speed km/h
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Active
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {[
                      diagnosticResult.runA
                        .droppedGroupSample
                        .sourceGroup,
                      diagnosticResult.runA
                        .droppedGroupSample
                        .droppedGroup,
                    ].map((group) => (
                      <tr
                        key={group.groupId}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 font-mono text-[11px]">
                          {group.groupId}
                        </td>
                        <td className="px-3 py-1.5">
                          {group.groupType}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px]">
                          {group.riderIds.join(', ')}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {group.distanceKm.toFixed(6)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {group.speedKmh.toFixed(6)}
                        </td>
                        <td className="px-3 py-1.5">
                          {group.active ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled multi-group movement proposal */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled multi-group movement proposal
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only proposed movement. No group position in the real
                simulation is changed.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Leader group
                  </div>
                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .multiGroupMovementSample
                      .leaderGroupId}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Leader distance
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .multiGroupMovementSample
                      .leaderDistanceKm.toFixed(6)}{' '}
                    km
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Tick duration
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .multiGroupMovementSample
                      .tickSeconds}{' '}
                    seconds
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Type
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Previous km
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Base speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Gradient %
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Applied speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Next km
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Advanced km
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Gap seconds
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .multiGroupMovementSample
                      .proposals.map(
                        (proposal) => (
                          <tr
                            key={proposal.groupId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {proposal.groupId}
                            </td>

                            <td className="px-3 py-1.5">
                              {proposal.groupType}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.previousDistanceKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.baseSpeedKmh.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.gradientPercent.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.appliedSpeedKmh.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.nextDistanceKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.distanceAdvancedKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.gapFromLeaderSeconds.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled applied multi-group movement */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled applied multi-group movement
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only immutable application. The real diagnostic race
                remains unchanged.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Previous race second
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupMovementSample
                      .previousRaceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Next race second
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupMovementSample
                      .nextRaceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Previous leader km
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupMovementSample
                      .previousCurrentKm.toFixed(6)}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Next leader km
                  </div>
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupMovementSample
                      .nextCurrentKm.toFixed(6)}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Riders
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Applied distance
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Applied speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Leader gap
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .appliedMultiGroupMovementSample
                      .appliedGroupIds.map(
                        (groupId) => {
                          const group =
                            diagnosticResult.runA
                              .appliedMultiGroupMovementSample
                              .state.groups[groupId]

                          return (
                            <tr
                              key={groupId}
                              className="border-t border-slate-800/80 odd:bg-slate-900/40"
                            >
                              <td className="px-3 py-1.5 font-mono text-[11px]">
                                {group.groupId}
                              </td>

                              <td className="px-3 py-1.5 font-mono text-[11px]">
                                {group.riderIds.join(', ')}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {group.distanceKm.toFixed(6)}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {group.speedKmh.toFixed(6)}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {group.gapFromLeaderSeconds.toFixed(
                                  6,
                                )}
                              </td>
                            </tr>
                          )
                        },
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled applied multi-group energy */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled applied multi-group energy
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only rider energy application using each rider’s
                own group speed and terrain values.
              </p>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Base speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Applied speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Gradient %
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Before
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Cost
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        After
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .appliedMultiGroupEnergySample
                      .applications.map(
                        (application) => (
                          <tr
                            key={application.riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5">
                              <div>
                                {application.riderName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {application.riderId}
                              </div>
                            </td>

                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {application.groupId}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.baseSpeedKmh.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.appliedSpeedKmh.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.gradientPercent.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.previousEnergy.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.energyCost.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {application.nextEnergy.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled orchestrated multi-group tick */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled orchestrated multi-group tick
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only orchestration of movement, movement application,
                rider energy, finish detection, and conditional finish application.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race second
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .previousState.raceSecond}
                    {' → '}
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .state.raceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Leader position
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .state.currentKm.toFixed(
                        6,
                      )}{' '}
                    km
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Finish candidates
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .finishDetection
                      .candidates.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Finish applied
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .appliedFinish
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Distance
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Speed
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Gap
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Riders
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .simulatedMultiGroupTickSample
                      .movement.proposals.map(
                        (proposal) => (
                          <tr
                            key={proposal.groupId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {proposal.groupId}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.nextDistanceKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.appliedSpeedKmh.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.gapFromLeaderSeconds.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {proposal.riderIds.length}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled orchestrated multi-group finish tick */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled orchestrated multi-group finish tick
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only near-finish tick. Movement, energy, finish detection,
                and partial finish application are executed by one orchestration call.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race second
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupFinishTickSample
                      .previousState.raceSecond}
                    {' → '}
                    {diagnosticResult.runA
                      .simulatedMultiGroupFinishTickSample
                      .state.raceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Finished group
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupFinishTickSample
                      .finishDetection
                      .finishedGroupIds.join(', ')}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Finished riders
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupFinishTickSample
                      .finishedRiderIds.join(', ')}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race completed
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .simulatedMultiGroupFinishTickSample
                      .state.completed
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Distance
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Finish position
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Energy
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {[
                      'rider-a1',
                      'rider-a2',
                      'rider-b1',
                      'rider-b2',
                    ].map(
                      (riderId) => {
                        const rider =
                          diagnosticResult.runA
                            .simulatedMultiGroupFinishTickSample
                            .state.riders[riderId]

                        return (
                          <tr
                            key={riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5">
                              <div>
                                {rider.riderName}
                              </div>

                              <div className="font-mono text-[11px] text-slate-400">
                                {riderId}
                              </div>
                            </td>

                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {rider.currentGroupId}
                            </td>

                            <td className="px-3 py-1.5">
                              {rider.stageStatus}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {rider.distanceKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {rider.finishPosition ??
                                '—'}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {rider.energy.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled full multi-group stage */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled full multi-group stage
              </h2>
            
              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only complete stage execution using repeated isolated
                multi-group ticks.
              </p>
            
              <div className="mb-4 grid gap-3 text-xs md:grid-cols-7">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Tick count
                  </div>
            
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .tickCount}
                  </div>
                </div>
            
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Final race second
                  </div>
            
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .finalState.raceSecond}
                  </div>
                </div>
            
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Results
                  </div>
            
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .results.length}
                  </div>
                </div>
            
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Completed
                  </div>
            
                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .completed
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Replay snapshots
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .replaySnapshots.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Replay hash
                  </div>

                  <div className="mt-1 break-all font-mono text-[11px] font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .replayCollection
                      .deterministicHash}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Stage hash
                  </div>

                  <div className="mt-1 break-all font-mono text-[11px] font-semibold">
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .deterministicHash}
                  </div>
                </div>
              </div>
            
              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rank
                      </th>
            
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
            
                      <th className="px-3 py-2 text-left font-medium">
                        Team
                      </th>
            
                      <th className="px-3 py-2 text-right font-medium">
                        Finish second
                      </th>
            
                      <th className="px-3 py-2 text-right font-medium">
                        Gap
                      </th>
                    </tr>
                  </thead>
            
                  <tbody>
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .results.map(
                        (result) => {
                          const rider =
                            diagnosticResult.runA
                              .fullMultiGroupStageSample
                              .finalState.riders[
                                result.riderId
                              ]
            
                          return (
                            <tr
                              key={result.riderId}
                              className="border-t border-slate-800/80 odd:bg-slate-900/40"
                            >
                              <td className="px-3 py-1.5">
                                {result.rank}
                              </td>
            
                              <td className="px-3 py-1.5">
                                <div>
                                  {rider.riderName}
                                </div>
            
                                <div className="font-mono text-[11px] text-slate-400">
                                  {result.riderId}
                                </div>
                              </td>
            
                              <td className="px-3 py-1.5">
                                {rider.teamName}
                              </td>
            
                              <td className="px-3 py-1.5 text-right">
                                {result.elapsedSeconds}
                              </td>
            
                              <td className="px-3 py-1.5 text-right">
                                {result.gapSeconds}
                              </td>
                            </tr>
                          )
                        },
                      )}
                  </tbody>
                </table>
              </div>
            
              <div className="mt-4 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Sequence
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Race second
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Kilometre
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Completed
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Snapshot hash
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .fullMultiGroupStageSample
                      .replaySnapshots.map(
                        (snapshot) => (
                          <tr
                            key={
                              snapshot.sequenceNumber
                            }
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5">
                              {snapshot.sequenceNumber}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {snapshot.raceSecond}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {snapshot.currentKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5">
                              {snapshot.completed
                                ? 'Yes'
                                : 'No'}
                            </td>

                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {snapshot.deterministicHash}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">
                  Canonical full-stage JSON
                </h3>

                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-slate-950/60 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
                  {diagnosticResult.runA
                    .fullMultiGroupStageSample
                    .canonicalJson}
                </pre>
              </div>
            </section>

            {/* Standard multi-group SimulationOutput */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Standard multi-group SimulationOutput
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Pure conversion of the completed isolated multi-group stage into the
                authoritative engine output contract.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-6">
                {[
                  ['Engine version', diagnosticResult.runA.fullMultiGroupSimulationOutput.engineVersion],
                  ['Simulation mode', diagnosticResult.runA.fullMultiGroupSimulationOutput.simulationMode],
                  ['Events', diagnosticResult.runA.fullMultiGroupSimulationOutput.events.length],
                  ['Frames', diagnosticResult.runA.fullMultiGroupSimulationOutput.snapshots.length],
                  ['Final riders', diagnosticResult.runA.fullMultiGroupSimulationOutput.finalRiderStates.length],
                  [
                    'Final race second',
                    diagnosticResult.runA.fullMultiGroupSimulationOutput.snapshots[
                      diagnosticResult.runA.fullMultiGroupSimulationOutput.snapshots.length - 1
                    ]?.raceSecond ?? '—',
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="text-slate-400">{label}</div>
                    <div className="mt-1 font-mono text-[11px] font-semibold">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Frame</th>
                      <th className="px-3 py-2 text-right font-medium">Race second</th>
                      <th className="px-3 py-2 text-right font-medium">Kilometre</th>
                      <th className="px-3 py-2 text-left font-medium">Group order</th>
                      <th className="px-3 py-2 text-left font-medium">Event sequences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.fullMultiGroupSimulationOutput.snapshots.map(
                      (snapshot) => (
                        <tr
                          key={snapshot.frameNumber}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5">{snapshot.frameNumber}</td>
                          <td className="px-3 py-1.5 text-right">{snapshot.raceSecond}</td>
                          <td className="px-3 py-1.5 text-right">
                            {snapshot.km.toFixed(6)}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">
                            {snapshot.groupOrder.join(', ')}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">
                            {snapshot.eventSequenceNumbers.join(', ')}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>


            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Deterministic road-race entry point
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                In-memory verification of the inactive top-level engine boundary.
              </p>

              <div className="grid gap-3 text-xs md:grid-cols-6">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race ID
                  </div>

                  <div className="mt-1 font-mono text-[11px]">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .raceId}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Engine
                  </div>

                  <div className="mt-1 font-mono text-[11px]">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .engineVersion}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Mode
                  </div>

                  <div className="mt-1 font-mono text-[11px]">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .simulationMode}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Events
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .events.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Frames
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .snapshots.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Final riders
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .deterministicRoadRaceOutput
                      .finalRiderStates.length}
                  </div>
                </div>
              </div>
            </section>

            {/* Controlled multi-group finish candidates */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled multi-group finish candidates
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only finish detection. Riders are identified as candidates
                but are not marked finished and no events or results are created.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Detection race second
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .multiGroupFinishCandidateSample
                      .raceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Finished groups
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .multiGroupFinishCandidateSample
                      .finishedGroupIds.join(', ')}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Candidate count
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .multiGroupFinishCandidateSample
                      .candidates.length}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Order
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Group
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Distance km
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Gap seconds
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Sprint
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Acceleration
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Energy
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .multiGroupFinishCandidateSample
                      .candidates.map(
                        (
                          candidate,
                          candidateIndex,
                        ) => (
                          <tr
                            key={candidate.riderId}
                            className="border-t border-slate-800/80 odd:bg-slate-900/40"
                          >
                            <td className="px-3 py-1.5">
                              {candidateIndex + 1}
                            </td>

                            <td className="px-3 py-1.5">
                              <div>
                                {candidate.riderName}
                              </div>

                              <div className="font-mono text-[11px] text-slate-400">
                                {candidate.riderId}
                              </div>
                            </td>

                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {candidate.groupId}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {candidate.groupDistanceKm.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {candidate.groupGapFromLeaderSeconds.toFixed(
                                6,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {candidate.sprintScore.toFixed(
                                3,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {candidate.accelerationScore.toFixed(
                                3,
                              )}
                            </td>

                            <td className="px-3 py-1.5 text-right">
                              {candidate.energy.toFixed(
                                6,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled applied multi-group finish */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled applied multi-group finish
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only partial finish application. The finished group is
                deactivated while the unfinished peloton remains active.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Newly finished riders
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupFinishSample
                      .newlyFinishedRiderIds.join(
                        ', ',
                      )}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Deactivated groups
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupFinishSample
                      .newlyFinishedGroupIds.join(
                        ', ',
                      )}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    New events
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupFinishSample
                      .newEvents.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race completed
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .appliedMultiGroupFinishSample
                      .completedThisApplication
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rank
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>

                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Finish time
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Gap
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .appliedMultiGroupFinishSample
                      .newResults.map(
                        (result) => {
                          const rider =
                            diagnosticResult.runA
                              .appliedMultiGroupFinishSample
                              .state.riders[
                                result.riderId
                              ]

                          return (
                            <tr
                              key={result.riderId}
                              className="border-t border-slate-800/80 odd:bg-slate-900/40"
                            >
                              <td className="px-3 py-1.5">
                                {result.rank}
                              </td>

                              <td className="px-3 py-1.5">
                                <div>
                                  {rider.riderName}
                                </div>

                                <div className="font-mono text-[11px] text-slate-400">
                                  {result.riderId}
                                </div>
                              </td>

                              <td className="px-3 py-1.5">
                                {rider.stageStatus}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {result.elapsedSeconds}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {result.gapSeconds}
                              </td>
                            </tr>
                          )
                        },
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Controlled completed multi-group finish */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                Controlled completed multi-group finish
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Diagnostic-only second finish application. The remaining peloton
                finishes and the controlled simulation completes.
              </p>

              <div className="mb-4 grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Final candidates
                  </div>

                  <div className="mt-1 font-mono font-semibold">
                    {diagnosticResult.runA
                      .finalMultiGroupFinishCandidateSample
                      .candidateRiderIds.join(', ')}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Final finish second
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .completedMultiGroupFinishSample
                      .state.raceSecond}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    New events
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .completedMultiGroupFinishSample
                      .newEvents.length}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-400">
                    Race completed
                  </div>

                  <div className="mt-1 font-semibold">
                    {diagnosticResult.runA
                      .completedMultiGroupFinishSample
                      .state.completed
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Rank
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Rider
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Finish second
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Gap seconds
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA
                      .completedMultiGroupFinishSample
                      .newResults.map(
                        (result) => {
                          const rider =
                            diagnosticResult.runA
                              .completedMultiGroupFinishSample
                              .state.riders[
                                result.riderId
                              ]

                          return (
                            <tr
                              key={result.riderId}
                              className="border-t border-slate-800/80 odd:bg-slate-900/40"
                            >
                              <td className="px-3 py-1.5">
                                {result.rank}
                              </td>

                              <td className="px-3 py-1.5">
                                <div>
                                  {rider.riderName}
                                </div>

                                <div className="font-mono text-[11px] text-slate-400">
                                  {result.riderId}
                                </div>
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {result.elapsedSeconds}
                              </td>

                              <td className="px-3 py-1.5 text-right">
                                {result.gapSeconds}
                              </td>
                            </tr>
                          )
                        },
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Terrain samples table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Terrain samples (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Kilometre</th>
                      <th className="px-3 py-2 text-left font-medium">Elevation metres</th>
                      <th className="px-3 py-2 text-left font-medium">Gradient percent</th>
                      <th className="px-3 py-2 text-left font-medium">Lower point km</th>
                      <th className="px-3 py-2 text-left font-medium">Upper point km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.terrainSamples.map((sample) => (
                      <tr
                        key={sample.kilometre}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 text-left">{sample.kilometre.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-left">{sample.elevationMetres.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-left">{sample.gradientPercent.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-left">{sample.lowerPointKilometre.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-left">{sample.upperPointKilometre.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Terrain speed samples table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Terrain speed samples (Run A)
              </h2>

              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">
                        Gradient %
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Base speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Multiplier
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Unclamped speed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Final speed
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {diagnosticResult.runA.terrainSpeedSamples.map(
                      (sample) => (
                        <tr
                          key={sample.gradientPercent}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-right">
                            {sample.gradientPercent.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.baseSpeedKmh.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.terrainMultiplier.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.unclampedSpeedKmh.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {sample.speedKmh.toFixed(3)}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* JSON panels */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <h2 className="mb-2 text-sm font-semibold text-slate-100">Run A canonical JSON</h2>
                <pre className="max-h-72 overflow-auto rounded bg-black/60 p-2 text-[11px] leading-snug text-slate-100">
                  {diagnosticResult.runA.canonicalJson}
                </pre>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <h2 className="mb-2 text-sm font-semibold text-slate-100">Run B canonical JSON</h2>
                <pre className="max-h-72 overflow-auto rounded bg-black/60 p-2 text-[11px] leading-snug text-slate-100">
                  {diagnosticResult.runB.canonicalJson}
                </pre>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
