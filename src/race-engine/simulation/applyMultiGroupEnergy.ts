/**
 * applyMultiGroupEnergy.ts
 *
 * Pure deterministic rider-energy application for one verified multi-group
 * movement result.
 *
 * This utility applies group-specific speed, base pace, gradient, tick
 * duration, the optional calibrated weather-consumption multiplier, and
 * optional weather-only runtime fatigue to every racing rider. It does not
 * move groups, advance the clock, finish riders, create events, or activate
 * production execution.
 */

import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import {
  calculateRiderEnergyCost,
  type RiderEnergyCostResult,
} from './energyCost'
import {
  calculateGroupShelter,
  type GroupShelterResult,
} from './groupShelter'
import type {
  MultiGroupMovementProposal,
  MultiGroupMovementResult,
} from './multiGroupMovement'
import {
  calculateWeatherPerformanceEffects,
} from './weatherPerformanceEffects'
import {
  calculateRuntimeWeatherFatigue,
  type RuntimeWeatherFatigueResult,
} from './runtimeWeatherFatigue'

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
  /** Full result after weather and optional shelter adjustment */
  readonly result: RiderEnergyCostResult

  /**
   * Present only when group-shelter energy savings are enabled.
   */
  readonly shelterBonus?: number
  readonly shelterMultiplier?: number
  readonly energyCostBeforeShelter?: number
  readonly shelterEnergySaved?: number
  readonly shelterResult?: GroupShelterResult

  /**
   * Present only when calibrated weather creates runtime fatigue.
   * Neutral, weather-free, and strong-wind-only ticks omit these fields.
   */
  readonly previousRuntimeFatigue?:
    number
  readonly nextRuntimeFatigue?:
    number
  readonly runtimeFatigueGain?:
    number
  readonly runtimeFatigueResult?:
    RuntimeWeatherFatigueResult
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
 *
 * Exact neutral identity is mandatory: when the resolved multiplier is 1,
 * calculateRiderEnergyCost() is returned without rebuilding or rounding it.
 * This preserves every pre-weather existing_v1 and calibrated fixture hash.
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

  const runtimeWeatherFatigueEnabled =
    state
      .weatherPerformanceEffectsEnabled ===
      true &&
    weatherEffects
      .fatigueGainMultiplier >
      1

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

          const weatherAdjustedResult:
            RiderEnergyCostResult =
            weatherConsumptionMultiplier ===
              1
              ? unadjustedResult
              : {
                  ...unadjustedResult,
                  energyCost:
                    roundEnergy(
                      Math.min(
                        rider.energy,
                        unadjustedResult
                          .energyCost *
                          weatherConsumptionMultiplier,
                      ),
                    ),
                  nextEnergy:
                    roundEnergy(
                      Math.max(
                        0,
                        rider.energy -
                          Math.min(
                            rider.energy,
                            unadjustedResult
                              .energyCost *
                              weatherConsumptionMultiplier,
                          ),
                      ),
                    ),
                }

          const shelterEnergyEnabled =
            state
              .groupShelterEnergyEnabled ===
            true

          const shelterResult =
            shelterEnergyEnabled
              ? calculateGroupShelter({
                  groupType:
                    proposal.groupType,
                  groupSize:
                    proposal.riderIds
                      .length,
                  gradientPercent:
                    proposal
                      .gradientPercent,
                })
              : null

          const shelterApplies =
            shelterResult !==
              null &&
            shelterResult
              .shelterBonus >
              0

          const shelterMultiplier =
            shelterResult
              ? Math.max(
                  0,
                  1 -
                    shelterResult
                      .shelterBonus /
                      100,
                )
              : 1

          const shelteredEnergyCost =
            shelterApplies
              ? roundEnergy(
                  Math.min(
                    rider.energy,
                    weatherAdjustedResult
                      .energyCost *
                      shelterMultiplier,
                  ),
                )
              : weatherAdjustedResult
                  .energyCost

          const result:
            RiderEnergyCostResult =
            shelterApplies
              ? {
                  ...weatherAdjustedResult,
                  energyCost:
                    shelteredEnergyCost,
                  nextEnergy:
                    roundEnergy(
                      Math.max(
                        0,
                        rider.energy -
                          shelteredEnergyCost,
                      ),
                    ),
                }
              : weatherAdjustedResult

          const runtimeFatigueResult =
            runtimeWeatherFatigueEnabled
              ? calculateRuntimeWeatherFatigue({
                  currentRuntimeFatigue:
                    rider.runtimeFatigue ??
                    0,
                  tickSeconds:
                    movement.tickSeconds,
                  fatigueGainMultiplier:
                    weatherEffects
                      .fatigueGainMultiplier,
                  resistance:
                    rider.attributes
                      .resistance,
                  recovery:
                    rider.attributes
                      .recovery,
                })
              : null

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
            ...(shelterResult
              ? {
                  shelterBonus:
                    shelterResult
                      .shelterBonus,
                  shelterMultiplier,
                  energyCostBeforeShelter:
                    weatherAdjustedResult
                      .energyCost,
                  shelterEnergySaved:
                    roundEnergy(
                      weatherAdjustedResult
                        .energyCost -
                        result.energyCost,
                    ),
                  shelterResult,
                }
              : {}),
            ...(runtimeFatigueResult
              ? {
                  previousRuntimeFatigue:
                    runtimeFatigueResult
                      .previousRuntimeFatigue,
                  nextRuntimeFatigue:
                    runtimeFatigueResult
                      .nextRuntimeFatigue,
                  runtimeFatigueGain:
                    runtimeFatigueResult
                      .fatigueGain,
                  runtimeFatigueResult,
                }
              : {}),
          })

          return [
            riderId,
            {
              ...rider,
              energy:
                result.nextEnergy,
              ...(runtimeFatigueResult
                ? {
                    runtimeFatigue:
                      runtimeFatigueResult
                        .nextRuntimeFatigue,
                  }
                : {}),
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
