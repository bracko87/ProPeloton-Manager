/**
 * simulateMultiGroupTick.ts
 *
 * Pure deterministic orchestration for one isolated multi-group simulation
 * tick.
 *
 * The orchestration order is:
 * 1. apply eligible pre-race order lifecycle transitions
 * 2. apply executed tactical order effects
 * 3. calculate movement proposals
 * 4. apply group and rider movement
 * 5. apply rider energy costs
 * 6. reconcile breakaway groups
 * 7. detect finish candidates
 * 8. apply finishes when candidates exist
 *
 * This utility does not read or write Supabase, schedule work, persist output,
 * or activate any production runtime.
 */

import type {
  SimulationState,
} from '../domain/SimulationState'
import {
  applyEligibleTeamOrders,
  type ApplyEligibleTeamOrdersResult,
} from './applyEligibleTeamOrders'
import {
  applyExecutedTeamOrderEffects,
  type ApplyExecutedTeamOrderEffectsResult,
} from './applyExecutedTeamOrderEffects'
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
import {
  reconcileBreakawayGroups,
  type ReconcileBreakawayGroupsResult,
} from './reconcileBreakawayGroups'

export interface SimulateMultiGroupTickResult {
  readonly previousState:
    SimulationState

  readonly appliedOrders:
    ApplyEligibleTeamOrdersResult

  readonly appliedOrderEffects:
    ApplyExecutedTeamOrderEffectsResult

  readonly movement:
    MultiGroupMovementResult

  readonly appliedMovement:
    ApplyMultiGroupMovementResult

  readonly appliedEnergy:
    ApplyMultiGroupEnergyResult

  readonly reconciledBreakaways:
    ReconcileBreakawayGroupsResult

  readonly finishDetection:
    MultiGroupFinishCandidateResult

  readonly appliedFinish:
    ApplyMultiGroupFinishResult | null

  readonly state:
    SimulationState

  readonly finishedRiderIds:
    readonly string[]

  readonly completedThisTick:
    boolean
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

  const appliedOrders =
    applyEligibleTeamOrders(
      state,
    )

  const appliedOrderEffects =
    applyExecutedTeamOrderEffects(
      appliedOrders.state,
      appliedOrders.executedOrders,
    )

  const movement =
    calculateMultiGroupMovement(
      appliedOrderEffects.state,
    )

  const appliedMovement =
    applyMultiGroupMovement({
      state:
        appliedOrderEffects.state,
      movement,
    })

  const appliedEnergy =
    applyMultiGroupEnergy({
      state:
        appliedMovement.state,
      movement,
    })

  const reconciledBreakaways =
    reconcileBreakawayGroups(
      appliedEnergy.state,
    )

  const finishDetection =
    detectMultiGroupFinishCandidates(
      reconciledBreakaways.state,
    )

  const appliedFinish =
    finishDetection.candidates.length >
    0
      ? applyMultiGroupFinish({
          state:
            reconciledBreakaways.state,
          detection:
            finishDetection,
        })
      : null

  const nextState =
    appliedFinish
      ? appliedFinish.state
      : reconciledBreakaways.state

  return {
    previousState:
      state,
    appliedOrders,
    appliedOrderEffects,
    movement,
    appliedMovement,
    appliedEnergy,
    reconciledBreakaways,
    finishDetection,
    appliedFinish,
    state:
      nextState,
    finishedRiderIds:
      appliedFinish
        ? appliedFinish
            .newlyFinishedRiderIds
            .slice()
        : [],
    completedThisTick:
      appliedFinish
        ?.completedThisApplication ??
      false,
  }
}