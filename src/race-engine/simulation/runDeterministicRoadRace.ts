/**
 * src/race-engine/simulation/runDeterministicRoadRace.ts
 *
 * Pure in-memory integration boundary for the deterministic TypeScript race
 * engine.
 *
 * The existing execution path remains the default. The complete calibrated
 * terrain-separation package is available only through one explicit mode.
 *
 * This function does not access Supabase, persist output, call RPCs, expose an
 * HTTP route, schedule work, or activate any production runtime.
 */

import type {
  SimulationOutput,
} from '../domain/SimulationOutput'
import type {
  StageInput,
} from '../domain/StageInput'
import {
  createMultiGroupSimulationOutput,
} from './createMultiGroupSimulationOutput'
import {
  createInitialState,
} from './createInitialState'
import {
  runCalibratedTerrainSeparationStage,
} from './runCalibratedTerrainSeparationStage'
import {
  runMultiGroupStage,
  type RunMultiGroupStageOptions,
} from './runMultiGroupStage'

export type MultiGroupSimulationMode =
  | 'existing_v1'
  | 'terrain_separation_calibrated_v1'

/**
 * Options for runDeterministicRoadRace.
 *
 * simulationMode defaults to existing_v1.
 *
 * runnerOptions remains backward compatible and supplies only the shared
 * maximumTickCount safety bound. No individual calibrated rule can be toggled
 * here.
 */
export interface RunDeterministicRoadRaceOptions {
  readonly simulationMode?:
    MultiGroupSimulationMode
  readonly runnerOptions?:
    RunMultiGroupStageOptions
}

function resolveSimulationMode(
  mode:
    MultiGroupSimulationMode | undefined,
): MultiGroupSimulationMode {
  const resolved =
    mode ??
    'existing_v1'

  if (
    resolved !==
      'existing_v1' &&
    resolved !==
      'terrain_separation_calibrated_v1'
  ) {
    throw new Error(
      `runDeterministicRoadRace: unsupported simulation mode "${String(resolved)}".`,
    )
  }

  return resolved
}

/**
 * Executes one complete deterministic road-race simulation entirely in memory.
 *
 * Omitted options and explicit existing_v1 use the original runMultiGroupStage
 * path exactly.
 *
 * terrain_separation_calibrated_v1 uses one fixed coherent package:
 * - 50% terrain-capability influence;
 * - 120-second sustained separation;
 * - progressive pressure and movement severity;
 * - five-second consolidation thresholds;
 * - deterministic transition events;
 * - sub-tick finish interpolation;
 * - authoritative pressure in SimulationState.
 */
export function runDeterministicRoadRace(
  input: StageInput,
  options:
    RunDeterministicRoadRaceOptions = {},
): SimulationOutput {
  const simulationMode =
    resolveSimulationMode(
      options
        .simulationMode,
    )

  const initialState =
    createInitialState(
      input,
    )

  if (
    simulationMode ===
    'existing_v1'
  ) {
    const completedStage =
      runMultiGroupStage(
        initialState,
        options.runnerOptions,
      )

    return createMultiGroupSimulationOutput(
      completedStage,
    )
  }

  const completedStage =
    runCalibratedTerrainSeparationStage(
      initialState,
      {
        maximumTickCount:
          options.runnerOptions
            ?.maximumTickCount,
      },
    )

  return createMultiGroupSimulationOutput(
    completedStage,
  )
}
