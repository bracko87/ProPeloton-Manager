/**
 * flatStage1.ts
 *
 * Controlled flat-stage fixture and small rider roster for deterministic tests.
 *
 * Purpose:
 * - Provide a reproducible stage + riders + deterministic config for unit tests.
 */

import { DeterministicConfig } from '../types/deterministic'
import { StageInput } from '../types/stage'
import { RiderInput } from '../types/rider'

/**
 * config
 * Fixed seed used by the deterministic tests.
 */
export const config: DeterministicConfig = {
  seed: 'flat-stage-1-seed-42',
}

/**
 * stage
 * Minimal flat stage of 50 km with trivial profile points (flat).
 */
export const stage: StageInput = {
  stageId: 'flat-001',
  raceId: 'race-001',
  distanceKm: 50,
  profilePoints: [
    { km: 0, elevationM: 0 },
    { km: 50, elevationM: 0 },
  ],
}

/**
 * riders
 * Controlled roster of 12 riders with varied flat, endurance and freshness.
 */
export const riders: RiderInput[] = [
  {
    riderId: 'r01',
    displayName: 'A. Rider',
    flat: 78,
    climbing: 45,
    sprint: 70,
    endurance: 76,
    startingFreshness: 92,
  },
  {
    riderId: 'r02',
    displayName: 'B. Rider',
    flat: 65,
    climbing: 50,
    sprint: 80,
    endurance: 68,
    startingFreshness: 88,
  },
  {
    riderId: 'r03',
    displayName: 'C. Rider',
    flat: 72,
    climbing: 60,
    sprint: 68,
    endurance: 74,
    startingFreshness: 90,
  },
  {
    riderId: 'r04',
    displayName: 'D. Rider',
    flat: 55,
    climbing: 70,
    sprint: 60,
    endurance: 72,
    startingFreshness: 84,
  },
  {
    riderId: 'r05',
    displayName: 'E. Rider',
    flat: 60,
    climbing: 55,
    sprint: 62,
    endurance: 66,
    startingFreshness: 80,
  },
  {
    riderId: 'r06',
    displayName: 'F. Rider',
    flat: 82,
    climbing: 40,
    sprint: 85,
    endurance: 80,
    startingFreshness: 95,
  },
  {
    riderId: 'r07',
    displayName: 'G. Rider',
    flat: 48,
    climbing: 80,
    sprint: 45,
    endurance: 70,
    startingFreshness: 78,
  },
  {
    riderId: 'r08',
    displayName: 'H. Rider',
    flat: 70,
    climbing: 65,
    sprint: 66,
    endurance: 73,
    startingFreshness: 87,
  },
  {
    riderId: 'r09',
    displayName: 'I. Rider',
    flat: 58,
    climbing: 68,
    sprint: 59,
    endurance: 64,
    startingFreshness: 76,
  },
  {
    riderId: 'r10',
    displayName: 'J. Rider',
    flat: 67,
    climbing: 52,
    sprint: 64,
    endurance: 69,
    startingFreshness: 82,
  },
  {
    riderId: 'r11',
    displayName: 'K. Rider',
    flat: 75,
    climbing: 48,
    sprint: 72,
    endurance: 77,
    startingFreshness: 91,
  },
  {
    riderId: 'r12',
    displayName: 'L. Rider',
    flat: 50,
    climbing: 60,
    sprint: 50,
    endurance: 62,
    startingFreshness: 74,
  },
]

/**
 * controlledAttack
 * One deterministic B1.4 attack at checkpoint index 3.
 */
export const controlledAttack = {
  attackCheckpointIndex: 3,
  attackerRiderIds: ['r01', 'r06'],
  breakawayGroupId: 'breakaway-1',
} as const

/**
 * separateGroupMovement
 * Deterministic B1.5 speed offsets relative to the shared B1.4 peloton speed.
 */
export const separateGroupMovement = {
  splitCheckpointIndex: controlledAttack.attackCheckpointIndex,
  breakawayGroupId: controlledAttack.breakawayGroupId,
  pelotonGroupId: 'peloton-1',
  breakawaySpeedOffsetKmh: 1.2,
  pelotonSpeedOffsetKmh: -0.4,
} as const

/**
 * groupCooperation
 * Deterministic B1.6 cooperation levels applied to the two B1.5 groups.
 */
export const groupCooperation = {
  splitCheckpointIndex: controlledAttack.attackCheckpointIndex,
  cooperationLevelByGroupId: {
    [controlledAttack.breakawayGroupId]: 0.65,
    [separateGroupMovement.pelotonGroupId]: 0.9,
  },
} as const

/**
 * energyModel
 * Deterministic B1.7 live-energy settings.
 */
export const energyModel = {
  attackCheckpointIndex: controlledAttack.attackCheckpointIndex,
  attackerRiderIds: controlledAttack.attackerRiderIds,
  cooperationLevelByGroupId: groupCooperation.cooperationLevelByGroupId,
  attackEnergyCost: 8,
} as const


/**
 * lateStageChase
 * Deterministic B1.8 peloton chase configuration.
 *
 * The chase becomes eligible once the leading group has covered 70% of the
 * flat stage and a breakaway is still ahead. The controlled seven-checkpoint
 * fixture activates the chase at checkpoint index 5 and demonstrates a
 * closing, but not yet eliminated, time gap at checkpoint index 6.
 */
export const lateStageChase = {
  breakawayGroupId: controlledAttack.breakawayGroupId,
  pelotonGroupId: separateGroupMovement.pelotonGroupId,
  chaseStartProgress: 0.7,
  pelotonChaseSpeedBonusKmh: 0.8,
  chaseEnergyCost: 2.5,
  cooperationLevelByGroupId: groupCooperation.cooperationLevelByGroupId,
} as const



/**
 * breakawayCatchScenario
 * Deterministic B1.9 configuration in which the peloton raises its closing
 * speed by another 0.8 km/h after checkpoint seven. The physical gap is then
 * eliminated before the breakaway reaches the 50 km finish.
 */
export const breakawayCatchScenario = {
  expectedOutcome: 'caught',
  breakawayGroupId: controlledAttack.breakawayGroupId,
  pelotonGroupId: separateGroupMovement.pelotonGroupId,
  pelotonClosingSpeedBonusKmh: 0.8,
  chaseEnergyCost: lateStageChase.chaseEnergyCost,
  cooperationLevelByGroupId: groupCooperation.cooperationLevelByGroupId,
  mergedGroupCooperationLevel:
    groupCooperation.cooperationLevelByGroupId[
      separateGroupMovement.pelotonGroupId
    ],
} as const

/**
 * breakawaySurvivalScenario
 * Deterministic B1.9 configuration in which the existing B1.8 chase continues
 * without another speed increase. The breakaway reaches the finish first with
 * a small but positive physical time gap.
 */
export const breakawaySurvivalScenario = {
  expectedOutcome: 'survived',
  breakawayGroupId: controlledAttack.breakawayGroupId,
  pelotonGroupId: separateGroupMovement.pelotonGroupId,
  pelotonClosingSpeedBonusKmh: 0,
  chaseEnergyCost: lateStageChase.chaseEnergyCost,
  cooperationLevelByGroupId: groupCooperation.cooperationLevelByGroupId,
  mergedGroupCooperationLevel:
    groupCooperation.cooperationLevelByGroupId[
      separateGroupMovement.pelotonGroupId
    ],
} as const


/**
 * finalResultModel
 * Deterministic B1.10 ordering for riders who share one physical group time.
 * Sprint is the primary flat-stage tie-break, followed by flat ability,
 * endurance and finally the stable rider id fallback in the result builder.
 */
export const finalResultModel = {
  tieBreakAttributeOrder: ['sprint', 'flat', 'endurance'],
} as const

/**
 * flatStageFixture
 * Aggregate export used by tests.
 */
export const flatStageFixture = {
  config,
  stage,
  riders,
  controlledAttack,
  separateGroupMovement,
  groupCooperation,
  energyModel,
  lateStageChase,
  breakawayCatchScenario,
  breakawaySurvivalScenario,
  finalResultModel,
}
