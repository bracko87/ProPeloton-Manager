/**
 * runB1RoadStageSimulation.ts
 *
 * One additive orchestration entry point for the complete accepted B1 road
 * stage vertical slice.
 *
 * This file deliberately contains no terrain logic. The restoration milestone
 * must reproduce the exact B1 checkpoint and result contracts before terrain
 * is reintroduced as a modifier inside group movement.
 */

import {
  createBreakawayOutcomeCheckpointSequence,
  type BreakawayOutcome,
  type BreakawayOutcomeCheckpointSequenceOptions,
  type BreakawayOutcomeCheckpointSequenceResult,
} from './breakawayOutcomeCheckpointSequence'
import {
  createControlledAttackCheckpointSequence,
  type ControlledAttackOptions,
} from './controlledAttackCheckpointSequence'
import {
  createCooperativeGroupMovementCheckpointSequence,
  type CooperativeGroupMovementOptions,
} from './cooperativeGroupMovementCheckpointSequence'
import {
  createDeterministicStageResults,
  type DeterministicStageResultsOptions,
} from './deterministicStageResults'
import {
  createEnergyCheckpointSequence,
  type EnergyCheckpointSequenceOptions,
} from './energyCheckpointSequence'
import { createInitialCheckpoint } from './initialCheckpoint'
import {
  createLateStageChaseCheckpointSequence,
  type LateStageChaseCheckpointSequenceOptions,
} from './lateStageChaseCheckpointSequence'
import {
  createSeparateGroupMovementCheckpointSequence,
  type SeparateGroupMovementOptions,
} from './separateGroupMovementCheckpointSequence'
import {
  createStaticPelotonCheckpointSequence,
  type StaticPelotonCheckpointSequenceOptions,
} from './staticPelotonCheckpointSequence'
import type { Checkpoint } from '../types/checkpoint'
import type { DeterministicConfig } from '../types/deterministic'
import type { RiderInput } from '../types/rider'
import type { StageInput } from '../types/stage'
import type { DeterministicStageResults } from '../types/stageResult'

export interface B1RoadStageSimulationDefinition {
  config: DeterministicConfig
  stage: StageInput
  riders: RiderInput[]
  controlledAttack: ControlledAttackOptions
  separateGroupMovement: SeparateGroupMovementOptions
  groupCooperation: CooperativeGroupMovementOptions
  energyModel: EnergyCheckpointSequenceOptions
  lateStageChase: LateStageChaseCheckpointSequenceOptions
  breakawayCatchScenario: BreakawayOutcomeCheckpointSequenceOptions
  breakawaySurvivalScenario: BreakawayOutcomeCheckpointSequenceOptions
  finalResultModel: DeterministicStageResultsOptions
}

export interface RunB1RoadStageSimulationOptions {
  outcome: BreakawayOutcome
  checkpointSequence?: StaticPelotonCheckpointSequenceOptions
}

export interface B1RoadStageSimulationResult {
  outcome: BreakawayOutcome
  stage: StageInput
  initialCheckpoint: Checkpoint
  pelotonCheckpoints: Checkpoint[]
  attackCheckpoints: Checkpoint[]
  separateGroupMovementCheckpoints: Checkpoint[]
  cooperativeGroupMovementCheckpoints: Checkpoint[]
  energyCheckpoints: Checkpoint[]
  chaseCheckpoints: Checkpoint[]
  outcomeSequence: BreakawayOutcomeCheckpointSequenceResult
  stageResults: DeterministicStageResults
}

const DEFAULT_CHECKPOINT_SEQUENCE: StaticPelotonCheckpointSequenceOptions = {
  checkpointCount: 7,
  intervalSeconds: 600,
}

function resolveOutcomeScenario(
  definition: B1RoadStageSimulationDefinition,
  outcome: BreakawayOutcome,
): BreakawayOutcomeCheckpointSequenceOptions {
  const scenario =
    outcome === 'caught'
      ? definition.breakawayCatchScenario
      : definition.breakawaySurvivalScenario

  if (scenario.expectedOutcome !== outcome) {
    throw new Error(
      `B1 ${outcome} scenario declares ${scenario.expectedOutcome}`,
    )
  }

  return scenario
}

/**
 * Execute the complete accepted B1 chain without replacing any earlier step.
 */
export function runB1RoadStageSimulation(
  definition: B1RoadStageSimulationDefinition,
  options: RunB1RoadStageSimulationOptions,
): B1RoadStageSimulationResult {
  const checkpointSequence =
    options.checkpointSequence ?? DEFAULT_CHECKPOINT_SEQUENCE

  const initialCheckpoint = createInitialCheckpoint(
    definition.config,
    definition.stage,
    definition.riders,
  )

  const pelotonCheckpoints = createStaticPelotonCheckpointSequence(
    definition.stage,
    initialCheckpoint,
    checkpointSequence,
  )

  const attackCheckpoints = createControlledAttackCheckpointSequence(
    pelotonCheckpoints,
    definition.controlledAttack,
  )

  const separateGroupMovementCheckpoints =
    createSeparateGroupMovementCheckpointSequence(
      definition.stage,
      attackCheckpoints,
      definition.separateGroupMovement,
    )

  const cooperativeGroupMovementCheckpoints =
    createCooperativeGroupMovementCheckpointSequence(
      definition.stage,
      separateGroupMovementCheckpoints,
      definition.groupCooperation,
    )

  const energyCheckpoints = createEnergyCheckpointSequence(
    cooperativeGroupMovementCheckpoints,
    definition.riders,
    definition.energyModel,
  )

  const chaseCheckpoints = createLateStageChaseCheckpointSequence(
    definition.stage,
    energyCheckpoints,
    definition.riders,
    definition.lateStageChase,
  )

  const outcomeSequence = createBreakawayOutcomeCheckpointSequence(
    definition.stage,
    chaseCheckpoints,
    definition.riders,
    resolveOutcomeScenario(definition, options.outcome),
  )

  const stageResults = createDeterministicStageResults(
    definition.stage,
    definition.riders,
    outcomeSequence,
    definition.finalResultModel,
  )

  return {
    outcome: options.outcome,
    stage: definition.stage,
    initialCheckpoint,
    pelotonCheckpoints,
    attackCheckpoints,
    separateGroupMovementCheckpoints,
    cooperativeGroupMovementCheckpoints,
    energyCheckpoints,
    chaseCheckpoints,
    outcomeSequence,
    stageResults,
  }
}
