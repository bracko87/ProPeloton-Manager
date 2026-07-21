/**
 * simulateMultiGroupTick.ts
 *
 * Pure deterministic orchestration for one isolated multi-group simulation
 * tick.
 *
 * The orchestration order is:
 * 1. calculate movement proposals
 * 2. apply group and rider movement
 * 3. apply rider energy costs
 * 4. detect finish candidates
 * 5. apply finishes when candidates exist
 *
 * This utility does not read or write Supabase, schedule work, persist output,
 * or activate any production runtime.
 */

import type { SimulationState } from '../domain/SimulationState'
import {
  applyMultiGroupEnergy,
  type ApplyMultiGroupEnergyResult,
} from './applyMultiGroupEnergy'
import {
  applyMultiGroupFinish,
  type ApplyMultiGroupFinishResult,
} from './applyMultiGroupFinish'
import {
  applyMultiGroupMovement,
  type ApplyMultiGroupMovementResult,
} from './applyMultiGroupMovement'
import {
  detectMultiGroupFinishCandidates,
  type MultiGroupFinishCandidateResult,
} from './multiGroupFinishCandidates'
import {
  calculateMultiGroupMovement,
  type MultiGroupMovementResult,
} from './multiGroupMovement'

export interface SimulateMultiGroupTickResult {
  readonly previousState: SimulationState
  readonly movement: MultiGroupMovementResult
  readonly appliedMovement: ApplyMultiGroupMovementResult
  readonly appliedEnergy: ApplyMultiGroupEnergyResult
  readonly finishDetection: MultiGroupFinishCandidateResult
  readonly appliedFinish: ApplyMultiGroupFinishResult | null
  readonly state: SimulationState
  readonly finishedRiderIds: readonly string[]
  readonly completedThisTick: boolean
}

/**
 * Runs exactly one deterministic multi-group tick.
 */
export function simulateMultiGroupTick(
  state: SimulationState,
): SimulateMultiGroupTickResult {
  if (state.completed) {
    throw new Error(
      'simulateMultiGroupTick: cannot advance a completed simulation.',
    )
  }

  const movement =
    calculateMultiGroupMovement(state)

  const appliedMovement =
    applyMultiGroupMovement({
      state,
      movement,
    })

  const appliedEnergy =
    applyMultiGroupEnergy({
      state: appliedMovement.state,
      movement,
    })

  const finishDetection =
    detectMultiGroupFinishCandidates(
      appliedEnergy.state,
    )

  const appliedFinish =
    finishDetection.candidates.length > 0
      ? applyMultiGroupFinish({
          state: appliedEnergy.state,
          detection: finishDetection,
        })
      : null

  const nextState =
    appliedFinish
      ? appliedFinish.state
      : appliedEnergy.state

  return {
    previousState: state,
    movement,
    appliedMovement,
    appliedEnergy,
    finishDetection,
    appliedFinish,
    state: nextState,
    finishedRiderIds:
      appliedFinish
        ? appliedFinish.newlyFinishedRiderIds.slice()
        : [],
    completedThisTick:
      appliedFinish?.completedThisApplication ??
      false,
  }
}
