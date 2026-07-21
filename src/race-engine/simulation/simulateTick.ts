/**
 * simulateTick.ts
 *
 * Deterministic basic movement step for the race engine.
 *
 * Phase 2 constraints:
 * - No attacks, breakaways, chases, sprints, fatigue, commentary, or results.
 * - All active riders remain together in the peloton_main group.
 * - No events are created or modified during this tick.
 * - When the stage distance is reached, an optional finish step is triggered.
 */

import type { SimulationState } from '../domain/SimulationState'
import type {
  RiderState,
  RiderStageStatus,
} from '../domain/RiderState'
import type { GroupState } from '../domain/GroupState'
import type { StageSimulationSettings } from '../domain/StageInput'
import type { StageResult } from '../domain/SimulationOutput'
import { advanceRaceClock } from './raceClock'
import { validateSimulationState } from '../validation/validateSimulationState'
import { INITIAL_PELOTON_GROUP_ID } from './createInitialState'
import { finishBasicPelotonStage } from './finishStage'
import { getStageTerrainSample } from './stageProfile'
import { calculateTerrainSpeed } from './terrainSpeed'
import { calculatePelotonBasePace } from './pelotonPace'
import { calculateRiderEnergyCost } from './energyCost'

/**
 * SimulateTickInput
 * Input contract for a single basic movement tick.
 */
export interface SimulateTickInput {
  readonly state: SimulationState
  readonly settings: StageSimulationSettings
}

/**
 * SimulateTickResult
 * Output of a basic movement tick, including optional finish results.
 */
export interface SimulateTickResult {
  readonly state: SimulationState
  readonly results: readonly StageResult[]
  readonly finishedThisTick: boolean
}

/**
 * isPositiveInteger
 * Utility to check that a number is a positive integer.
 */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/**
 * isFiniteNumber
 * Utility to check that a value is a finite number.
 */
function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

/**
 * terminalStageStatuses
 * Set of rider stage statuses that are considered terminal.
 */
const terminalStageStatuses: ReadonlySet<RiderStageStatus | string> = new Set([
  'finished',
  'dnf',
  'dns',
  'otl',
])

/**
 * simulateTick
 * Performs a single, deterministic simulation tick:
 * - Validates the existing state and settings.
 * - Ensures all active riders are in a single peloton_main group.
 * - Advances the race clock and peloton position.
 * - Moves all racing riders with the peloton while preserving groups and events.
 * - Validates invariants and the resulting SimulationState.
 * - If the finish distance is reached, completes the basic peloton stage.
 */
export function simulateTick(input: SimulateTickInput): SimulateTickResult {
  const { state, settings } = input

  // 1. Validate the input state before doing anything.
  validateSimulationState(state)

  // Reject ticks when simulation is already completed.
  if (state.completed) {
    throw new Error('simulateTick: cannot tick a completed simulation.')
  }

  // 2. Validate settings.
  if (!isPositiveInteger(settings.tickSeconds)) {
    throw new RangeError(
      'simulateTick: settings.tickSeconds must be a positive integer.',
    )
  }

  if (
    !isFiniteNumber(settings.minimumSpeedKmh) ||
    settings.minimumSpeedKmh <= 0
  ) {
    throw new RangeError(
      'simulateTick: settings.minimumSpeedKmh must be a finite number greater than zero.',
    )
  }

  if (
    !isFiniteNumber(settings.maximumSpeedKmh) ||
    settings.maximumSpeedKmh <= settings.minimumSpeedKmh
  ) {
    throw new RangeError(
      'simulateTick: settings.maximumSpeedKmh must be a finite number greater than minimumSpeedKmh.',
    )
  }

  // 3. For this basic version, enforce a single active peloton_main group.
  const groupsArray: readonly GroupState[] = Object.values(state.groups)
  const activeGroups = groupsArray.filter((group) => group.active)

  if (activeGroups.length !== 1) {
    throw new Error(
      'simulateTick: basic movement requires exactly one active group.',
    )
  }

  const peloton = activeGroups[0]

  if (
    peloton.groupId !== INITIAL_PELOTON_GROUP_ID ||
    peloton.groupType !== 'peloton'
  ) {
    throw new Error(
      'simulateTick: sole active group must be peloton_main of type peloton.',
    )
  }

  // All non-terminal riders must belong to this peloton group.
  const ridersArray: readonly RiderState[] = Object.values(state.riders)

  for (const rider of ridersArray) {
    if (!terminalStageStatuses.has(rider.stageStatus)) {
      if (rider.currentGroupId !== peloton.groupId) {
        throw new Error(
          `simulateTick: non-terminal rider ${rider.riderId} is not in the peloton_main group.`,
        )
      }

      if (!peloton.riderIds.includes(rider.riderId)) {
        throw new Error(
          `simulateTick: non-terminal rider ${rider.riderId} is not listed in peloton_main.riderIds.`,
        )
      }
    }
  }

  // 4. Sample terrain at the peloton's current position.
  const terrainSample = getStageTerrainSample(
    state.input,
    peloton.distanceKm,
  )

  /*
   * Phase 3 rider-based baseline speed:
   *
   * Calculate a stable intended peloton pace from the attributes of riders
   * currently racing in peloton_main.
   *
   * Terrain is applied separately afterward. We deliberately do not use
   * peloton.speedKmh as the next tick's base because it already contains the
   * previous tick's terrain adjustment and would cause terrain effects to
   * compound repeatedly.
   */
  const pelotonRiders = peloton.riderIds.map(
    (riderId) => {
      const rider = state.riders[riderId]

      if (!rider) {
        throw new Error(
          `simulateTick: peloton rider ${riderId} does not exist in state.riders.`,
        )
      }

      return rider
    },
  )

  const pelotonPaceResult =
    calculatePelotonBasePace({
      riders: pelotonRiders,
      minimumSpeedKmh:
        settings.minimumSpeedKmh,
      maximumSpeedKmh:
        settings.maximumSpeedKmh,
    })

  const basePelotonSpeedKmh =
    pelotonPaceResult.baseSpeedKmh

  /*
   * calculateTerrainSpeed clamps its final output to a minimum speed.
   *
   * The normal configured minimumSpeedKmh is the baseline cruising speed, not
   * the absolute speed floor after terrain. Derive the terrain floor from the
   * utility's minimum allowed multiplier of 0.35.
   */
  const terrainMinimumSpeedKmh =
    basePelotonSpeedKmh * 0.35

  const terrainSpeedResult = calculateTerrainSpeed({
    baseSpeedKmh: basePelotonSpeedKmh,
    gradientPercent: terrainSample.gradientPercent,
    minimumSpeedKmh: terrainMinimumSpeedKmh,
    maximumSpeedKmh: settings.maximumSpeedKmh,
  })

  const pelotonSpeedKmh =
    terrainSpeedResult.speedKmh

  // 5. Advance race time using the deterministic race clock.
  const previousRaceSecond = state.raceSecond
  const clockAdvance = advanceRaceClock(
    previousRaceSecond,
    settings.tickSeconds,
  )
  const nextRaceSecond = clockAdvance.nextRaceSecond

  // 6. Calculate tick distance.
  const previousPelotonDistance = peloton.distanceKm
  const tickDistanceKm =
    (pelotonSpeedKmh * settings.tickSeconds) / 3600

  // 7. Calculate next peloton distance, bounded by stage distance.
  const nextDistanceKm = Math.min(
    state.stageDistanceKm,
    previousPelotonDistance + tickDistanceKm,
  )

  // 8. Normal tick must never move backward.
  if (nextDistanceKm < previousPelotonDistance) {
    throw new Error(
      'simulateTick: peloton distance would move backward, which is not allowed.',
    )
  }

  // 9. Update the peloton group immutably, keeping the identity stable.
  const updatedPeloton: GroupState = {
    ...peloton,
    distanceKm: nextDistanceKm,
    speedKmh: pelotonSpeedKmh,
    gapFromLeaderSeconds: 0,
  }

  const nextGroups: typeof state.groups = {
    ...state.groups,
    [INITIAL_PELOTON_GROUP_ID]: updatedPeloton,
  }

  // 10. Update all racing riders immutably.
  //
  // Every racing rider:
  // - moves with the peloton;
  // - receives the same applied group speed;
  // - spends deterministic energy according to terrain, duration, and
  //   individual stamina/resistance/recovery attributes.
  const nextRidersEntries: Array<[string, RiderState]> = []

  for (const [riderId, rider] of Object.entries(state.riders)) {
    if (rider.stageStatus === 'racing') {
      const energyResult =
        calculateRiderEnergyCost({
          currentEnergy: rider.energy,
          speedKmh: pelotonSpeedKmh,
          baseSpeedKmh: basePelotonSpeedKmh,
          gradientPercent:
            terrainSample.gradientPercent,
          tickSeconds: settings.tickSeconds,
          stamina: rider.attributes.stamina,
          resistance:
            rider.attributes.resistance,
          recovery: rider.attributes.recovery,
        })

      const updatedRider: RiderState = {
        ...rider,
        distanceKm: nextDistanceKm,
        speedKmh: pelotonSpeedKmh,
        energy: energyResult.nextEnergy,
      }

      nextRidersEntries.push([
        riderId,
        updatedRider,
      ])
    } else {
      // Terminal or otherwise non-racing riders are not modified.
      nextRidersEntries.push([
        riderId,
        rider,
      ])
    }
  }

  const nextRiders: typeof state.riders =
    Object.fromEntries(nextRidersEntries)

  // 11. Determine if finish distance was reached.
  const reachedFinish = nextDistanceKm >= state.stageDistanceKm

  // For this phase:
  // - Reaching the finish distance in the movement step does not itself
  //   mark riders finished or complete the simulation.
  // - currentKm is advanced up to the finish line; completion is handled
  //   by finishBasicPelotonStage below when appropriate.
  const previousCurrentKm = state.currentKm
  const nextCurrentKm = Math.max(previousCurrentKm, nextDistanceKm)

  if (reachedFinish && nextCurrentKm !== state.stageDistanceKm) {
    // Defensive check; in practice nextCurrentKm should equal stageDistanceKm here.
    throw new Error(
      'simulateTick: reachedFinish is true but currentKm does not equal stageDistanceKm.',
    )
  }

  // 12–14. Assemble the next SimulationState (immutable update) before finish logic.
  const nextState: SimulationState = {
    ...state,
    raceSecond: nextRaceSecond,
    currentKm: nextCurrentKm,
    riders: nextRiders,
    groups: nextGroups,
    completed: false,
  }

  // 3. ADDITIONAL MOVEMENT INVARIANTS

  // Invariant: raceSecond strictly increases.
  if (nextState.raceSecond <= previousRaceSecond) {
    throw new Error(
      'simulateTick invariant: raceSecond did not advance strictly forward.',
    )
  }

  // Invariant: currentKm is not below previous currentKm.
  if (nextState.currentKm < previousCurrentKm) {
    throw new Error(
      'simulateTick invariant: currentKm moved backward.',
    )
  }

  // Helper counts for invariants.
  const previousRiderCount = Object.keys(state.riders).length
  const nextRiderCount = Object.keys(nextState.riders).length

  const previousTeamCount = Object.keys(state.teams).length
  const nextTeamCount = Object.keys(nextState.teams).length

  const previousOrderCount = Object.keys(state.orders).length
  const nextOrderCount = Object.keys(nextState.orders).length

  const previousEventCount = state.events.length
  const nextEventCount = nextState.events.length

  const previousGroupIds = Object.keys(state.groups).sort()
  const nextGroupIds = Object.keys(nextState.groups).sort()

  // Invariant: group ID remains peloton_main and no additional group is created.
  if (!nextState.groups[INITIAL_PELOTON_GROUP_ID]) {
    throw new Error(
      'simulateTick invariant: peloton_main group is missing in next state.',
    )
  }

  if (previousGroupIds.length !== nextGroupIds.length) {
    throw new Error(
      'simulateTick invariant: group count changed during basic movement tick.',
    )
  }

  for (let i = 0; i < previousGroupIds.length; i += 1) {
    if (previousGroupIds[i] !== nextGroupIds[i]) {
      throw new Error(
        'simulateTick invariant: group identifiers changed during basic movement tick.',
      )
    }
  }

  // Invariant: every racing rider matches peloton distance and speed,
  // remains in peloton_main, has valid non-increasing energy, and
  // rider/team/order/event counts are stable.
  const pelotonAfter =
    nextState.groups[INITIAL_PELOTON_GROUP_ID]

  if (!Number.isFinite(terrainSample.gradientPercent)) {
    throw new Error(
      'simulateTick invariant: terrain gradient is not finite.',
    )
  }

  if (!Number.isFinite(terrainSample.elevationMetres)) {
    throw new Error(
      'simulateTick invariant: terrain elevation is not finite.',
    )
  }

  if (
    !Number.isFinite(
      pelotonPaceResult.averageCapabilityScore,
    )
  ) {
    throw new Error(
      'simulateTick invariant: peloton capability score is not finite.',
    )
  }

  if (
    !Number.isFinite(basePelotonSpeedKmh) ||
    basePelotonSpeedKmh <
      settings.minimumSpeedKmh ||
    basePelotonSpeedKmh >
      settings.maximumSpeedKmh
  ) {
    throw new Error(
      'simulateTick invariant: rider-based peloton base speed is outside configured limits.',
    )
  }

  if (
    pelotonAfter.speedKmh < terrainMinimumSpeedKmh ||
    pelotonAfter.speedKmh > settings.maximumSpeedKmh
  ) {
    throw new Error(
      'simulateTick invariant: terrain-adjusted peloton speed is outside terrain speed limits.',
    )
  }

  for (const rider of Object.values(nextState.riders)) {
    if (rider.stageStatus === 'racing') {
      if (rider.currentGroupId !== INITIAL_PELOTON_GROUP_ID) {
        throw new Error(
          `simulateTick invariant: racing rider ${rider.riderId} is not in peloton_main after tick.`,
        )
      }

      if (rider.distanceKm !== pelotonAfter.distanceKm) {
        throw new Error(
          `simulateTick invariant: racing rider ${rider.riderId} distance does not match peloton distance.`,
        )
      }

      if (rider.speedKmh !== pelotonAfter.speedKmh) {
        throw new Error(
          `simulateTick invariant: racing rider ${rider.riderId} speed does not match peloton speed.`,
        )
      }

      if (
        !Number.isFinite(rider.energy) ||
        rider.energy < 0 ||
        rider.energy > 100
      ) {
        throw new Error(
          `simulateTick invariant: racing rider ${rider.riderId} energy is outside 0 to 100.`,
        )
      }

      const previousRider =
        state.riders[rider.riderId]

      if (!previousRider) {
        throw new Error(
          `simulateTick invariant: previous rider ${rider.riderId} is missing.`,
        )
      }

      if (rider.energy > previousRider.energy) {
        throw new Error(
          `simulateTick invariant: racing rider ${rider.riderId} gained energy during a movement tick.`,
        )
      }
    }
  }

  if (previousRiderCount !== nextRiderCount) {
    throw new Error(
      'simulateTick invariant: rider count changed during basic movement tick.',
    )
  }

  if (previousTeamCount !== nextTeamCount) {
    throw new Error(
      'simulateTick invariant: team count changed during basic movement tick.',
    )
  }

  if (previousOrderCount !== nextOrderCount) {
    throw new Error(
      'simulateTick invariant: order count changed during basic movement tick.',
    )
  }

  if (previousEventCount !== nextEventCount) {
    throw new Error(
      'simulateTick invariant: event count changed during basic movement tick.',
    )
  }

  // 15. Validate the new pre-finish state.
  validateSimulationState(nextState)

  // 16. Optionally complete the stage if we have reached or passed the finish distance.
  if (nextState.currentKm >= nextState.stageDistanceKm) {
    const finishResult = finishBasicPelotonStage(nextState)

    return {
      state: finishResult.state,
      results: finishResult.results,
      finishedThisTick: true,
    }
  }

  // No finish this tick; return movement-only update.
  return {
    state: nextState,
    results: [],
    finishedThisTick: false,
  }
}