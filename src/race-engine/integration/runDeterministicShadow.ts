/**
 * runDeterministicShadow.ts
 *
 * Pure execution gate for manually initiated deterministic shadow runs.
 *
 * This module:
 * - performs no database access
 * - performs no persistence
 * - reads no environment variables
 * - creates no authoritative records
 * - executes only when the supplied mode permits execution
 */

import type {
  SimulationOutput,
} from '../domain/SimulationOutput'
import type {
  StageInput,
} from '../domain/StageInput'
import {
  runDeterministicRoadRace,
} from '../simulation/runDeterministicRoadRace'
import {
  getDeterministicEngineCapabilities,
  type DeterministicRaceEngineMode,
} from './deterministicEngineMode'

export interface DeterministicShadowSkippedResult {
  readonly status: 'skipped'
  readonly mode:
    DeterministicRaceEngineMode
  readonly reason:
    'deterministic_engine_disabled'
  readonly output: null
}

export interface DeterministicShadowCompletedResult {
  readonly status: 'completed'
  readonly mode:
    DeterministicRaceEngineMode
  readonly reason: null
  readonly output:
    SimulationOutput
}

export type DeterministicShadowRunResult =
  | DeterministicShadowSkippedResult
  | DeterministicShadowCompletedResult

/**
 * Run the deterministic engine only when the validated mode grants
 * execution permission.
 *
 * This function does not persist the returned output regardless of mode.
 */
export function runDeterministicShadow(
  mode: DeterministicRaceEngineMode,
  stageInput: StageInput,
): DeterministicShadowRunResult {
  const capabilities =
    getDeterministicEngineCapabilities(
      mode,
    )

  if (!capabilities.canRun) {
    return {
      status: 'skipped',
      mode,
      reason:
        'deterministic_engine_disabled',
      output: null,
    }
  }

  return {
    status: 'completed',
    mode,
    reason: null,
    output:
      runDeterministicRoadRace(
        stageInput,
      ),
  }
}