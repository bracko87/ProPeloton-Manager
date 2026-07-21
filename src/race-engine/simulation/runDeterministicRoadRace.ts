/**
 * src/race-engine/simulation/runDeterministicRoadRace.ts
 *
 * Pure inactive integration boundary for the deterministic TypeScript race
 * engine.
 *
 * This function accepts a StageInput, creates the initial in-memory state,
 * runs the full deterministic stage, and converts the result into the
 * authoritative SimulationOutput contract.
 *
 * It does not access Supabase, persist output, call RPCs, expose an HTTP route,
 * schedule work, or activate any production runtime.
 */

import type { SimulationOutput } from '../domain/SimulationOutput'
import type { StageInput } from '../domain/StageInput'
import {
  createMultiGroupSimulationOutput,
} from './createMultiGroupSimulationOutput'
import {
  createInitialState,
} from './createInitialState'
import {
  runMultiGroupStage,
  type RunMultiGroupStageOptions,
} from './runMultiGroupStage'

/**
 * RunDeterministicRoadRaceOptions
 *
 * Options for runDeterministicRoadRace. Allows passing runner-specific options
 * through to runMultiGroupStage.
 */
export interface RunDeterministicRoadRaceOptions {
  readonly runnerOptions?: RunMultiGroupStageOptions
}

/**
 * runDeterministicRoadRace
 *
 * Executes one complete deterministic road-race simulation entirely in memory.
 *
 * @param input - StageInput describing the stage to simulate
 * @param options - Optional runner options forwarded to runMultiGroupStage
 * @returns SimulationOutput - authoritative simulation contract (pure in-memory)
 */
export function runDeterministicRoadRace(
  input: StageInput,
  options: RunDeterministicRoadRaceOptions = {},
): SimulationOutput {
  const initialState = createInitialState(input)

  const completedStage = runMultiGroupStage(
    initialState,
    options.runnerOptions,
  )

  return createMultiGroupSimulationOutput(completedStage)
}
