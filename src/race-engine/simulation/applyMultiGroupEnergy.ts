/**
 * applyMultiGroupEnergy.ts
 *
 * Pure deterministic rider-energy application for one verified multi-group
 * movement result.
 *
 * This utility applies group-specific speed, base pace, gradient, tick
 * duration, and the optional calibrated weather-consumption multiplier to
 * every racing rider. It does not move groups, advance the clock, finish
 * riders, create events, or activate production execution.
 */

import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import {
  calculateRiderEnergyCost,
  type RiderEnergyCostResult,
} from './energyCost'
import type {
  MultiGroupMovementProposal,
  MultiGroupMovementResult,
} from './multiGroupMovement'
import {
  calculateWeatherPerformanceEffects,
} from './weatherPerformanceEffects'

/**
 * MultiGroupRiderEnergyApplication
 *
 * Describes the energy application result for a single rider when applying a
 * multi-group movement result.
 */
export interface MultiGroupRiderEnergyApplication {
  /** Rider id */
  readonly riderId: string
  /** Rider display name */
  readonly riderName: string
  /** Group id the rider was part of for this tick */
  readonly groupId: string
  /** Energy prior to application */
  readonly previousEnergy: number
  /** Energy after application */
  readonly nextEnergy: number
  /** Energy cost incurred during the tick */
  readonly energyCost: number
  /** Base speed used for the energy calculation */
  readonly baseSpeedKmh: number
  /** Applied speed used for the energy calculation */
  readonly appliedSpeedKmh: number
  /** Gradient percent used for the energy calculation */
  readonly gradientPercent: number
  /** Full result from calculateRiderEnergyCost after weather adjustment */
  readonly result: RiderEnergyCostResult
}

/**
 * ApplyMultiGroupEnergyInput
 *
 * Input arguments for applyMultiGroupEnergy.
 */
export interface ApplyMultiGroupEnergyInput {
  /** Simulation state expected to reflect positions/speeds from the movement */
  readonly state: SimulationState
  /** Previously calculated multi-group movement result (must match state) */
  readonly movement: MultiGroupMovementResult
}

/**
 * ApplyMultiGroupEnergyResult
 *
 * Output after energy application: updated simulation state and per-rider
 * applications.
 */
export interface ApplyMultiGroupEnergyResult {
  /** Updated simulation state with rider energy updated */
  readonly state: SimulationState
  /** Ordered list of per-rider energy applications */
  readonly applications:
    readonly MultiGroupRiderEnergyApplication[]
}

function createProposalMap(
  proposals:
    readonly MultiGroupMovementProposal[],
): Readonly<
  Record<
    string,
    MultiGroupMovementProposal
  >
> {
  const entries:
    Array<
      [
        string,
        MultiGroupMovementProposal,
      ]
    > = []

  for (const proposal of proposals) {
    if (
      entries.some(
        ([groupId]) =>
          groupId === proposal.groupId,
      )
    ) {
      throw new Error(
        `applyMultiGroupEnergy: duplicate movement proposal for group ${proposal.groupId}.`,
      )
    }

    entries.push([
      proposal.groupId,
      proposal,
    ])
  }

  return Object.fromEntries(entries)
}

function roundEnergy(
  value: number,
): number {
  return Number(
    value.toFixed(6),
  )
}

/**
 * Applies deterministic energy cost to every racing rider.
 *
 * Runtime rider.energy is the engine's stage stamina/energy reserve. When the
 * calibrated wrapper enables weather performance, the larger of the weather
 * energy-consumption and stamina-consumption multipliers is applied to the
 * canonical energy cost. Current weather rules keep those two multipliers
 * equal, while the maximum preserves safe behavior if they diverge later.
 */
export function applyMultiGroupEnergy(
  input: ApplyMultiGroupEnergyInput,
): ApplyMultiGroupEnergyResult {
  const {
    state,
    movement,
  } = input

  if (state.completed) {
    throw new Error(
      'applyMultiGroupEnergy: cannot apply energy to a completed simulation.',
    )
  }

  if (
    movement.tickSeconds !==
    state.input.settings.tickSeconds
  ) {
    throw new Error(
      'applyMultiGroupEnergy: movement tick duration does not match simulation settings.',
    )
  }

  const weatherEffects =
    state
      .weatherPerformanceEffectsEnabled ===
      true
      ? calculateWeatherPerformanceEffects(
          state.input.weather,
        )
      : calculateWeatherPerformanceEffects(
          undefined,
        )

  const weatherConsumptionMultiplier =
    Math.max(
      weatherEffects
        .energyConsumptionMultiplier,
      weatherEffects
        .staminaConsumptionMultiplier,
    )

  const proposalByGroupId =
    createProposalMap(
      movement.proposals,
    )

  const applications:
    MultiGroupRiderEnergyApplication[] =
      []

  const nextRidersEntries:
    Array<[string, RiderState]> =
    Object.entries(state.riders)
      .sort(
        (
          [riderIdA],
          [riderIdB],
        ) =>
          riderIdA.localeCompare(
            riderIdB,
          ),
      )
      .map(
        ([riderId, rider]) => {
          if (
            rider.stageStatus !==
            'racing'
          ) {
            return [
              riderId,
              rider,
            ]
          }

          const groupId =
            rider.currentGroupId

          if (!groupId) {
            throw new Error(
              `applyMultiGroupEnergy: racing rider ${riderId} has no current group.`,
            )
          }

          const proposal =
            proposalByGroupId[
              groupId
            ]

          if (!proposal) {
            throw new Error(
              `applyMultiGroupEnergy: no movement proposal exists for rider ${riderId} group ${groupId}.`,
            )
          }

          if (
            !proposal.riderIds.includes(
              riderId,
            )
          ) {
            throw new Error(
              `applyMultiGroupEnergy: proposal ${groupId} does not include rider ${riderId}.`,
            )
          }

          if (
            rider.distanceKm !==
            proposal.nextDistanceKm
          ) {
            throw new Error(
              `applyMultiGroupEnergy: rider ${riderId} distance does not match the applied movement proposal.`,
            )
          }

          if (
            rider.speedKmh !==
            proposal.appliedSpeedKmh
          ) {
            throw new Error(
              `applyMultiGroupEnergy: rider ${riderId} speed does not match the applied movement proposal.`,
            )
          }

          const unadjustedResult =
            calculateRiderEnergyCost({
              currentEnergy:
                rider.energy,
              speedKmh:
                proposal
                  .appliedSpeedKmh,
              baseSpeedKmh:
                proposal.baseSpeedKmh,
              gradientPercent:
                proposal
                  .gradientPercent,
              tickSeconds:
                movement.tickSeconds,
              stamina:
                rider.attributes
                  .stamina,
              resistance:
                rider.attributes
                  .resistance,
              recovery:
                rider.attributes
                  .recovery,
            })

          const weatherAdjustedEnergyCost =
            roundEnergy(
              Math.min(
                rider.energy,
                unadjustedResult
                  .energyCost *
                  weatherConsumptionMultiplier,
              ),
            )

          const weatherAdjustedNextEnergy =
            roundEnergy(
              Math.max(
                0,
                rider.energy -
                  weatherAdjustedEnergyCost,
              ),
            )

          const result:
            RiderEnergyCostResult = {
              ...unadjustedResult,
              energyCost:
                weatherAdjustedEnergyCost,
              nextEnergy:
                weatherAdjustedNextEnergy,
            }

          applications.push({
            riderId,
            riderName:
              rider.riderName,
            groupId,
            previousEnergy:
              rider.energy,
            nextEnergy:
              result.nextEnergy,
            energyCost:
              result.energyCost,
            baseSpeedKmh:
              proposal.baseSpeedKmh,
            appliedSpeedKmh:
              proposal
                .appliedSpeedKmh,
            gradientPercent:
              proposal
                .gradientPercent,
            result,
          })

          return [
            riderId,
            {
              ...rider,
              energy:
                result.nextEnergy,
            },
          ]
        },
      )

  return {
    state: {
      ...state,
      riders:
        Object.fromEntries(
          nextRidersEntries,
        ),
    },
    applications,
  }
}
