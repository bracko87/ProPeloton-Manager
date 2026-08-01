/**
 * terrainMovement.ts
 *
 * Applies deterministic terrain and gradient speed multipliers while moving an
 * existing group through one or more normalized road-stage phases.
 *
 * The calculation is deliberately group-neutral. It does not inspect riders,
 * roles or energy and it never changes group membership.
 */

import {
  getTerrainPhaseAtKm,
} from './roadStageProfile'
import type {
  RoadStageProfile,
  TerrainPhase,
  TerrainPhaseType,
} from '../types/stageProfile'
import type {
  TerrainMovementInput,
  TerrainMovementResult,
  TerrainMovementSegment,
} from '../types/terrainMovement'

const EPSILON = 1e-9
const ROUNDING_FACTOR = 1_000_000

function round(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) /
    ROUNDING_FACTOR
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function assertFiniteNumber(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`)
  }
}

function validateProfileCoverage(
  profile: RoadStageProfile,
): void {
  if (profile.terrainPhases.length === 0) {
    throw new Error(
      'profile must contain at least one terrain phase',
    )
  }

  let expectedStartKm = 0

  profile.terrainPhases.forEach(
    (phase, index) => {
      if (
        Math.abs(
          phase.startKm - expectedStartKm,
        ) > EPSILON
      ) {
        throw new Error(
          'terrain phases must cover the stage contiguously',
        )
      }

      if (phase.endKm <= phase.startKm) {
        throw new Error(
          'terrain phase distance must be positive',
        )
      }

      if (phase.phaseIndex !== index) {
        throw new Error(
          'terrain phase indexes must be contiguous',
        )
      }

      expectedStartKm = phase.endKm
    },
  )

  if (
    Math.abs(
      expectedStartKm - profile.distanceKm,
    ) > EPSILON
  ) {
    throw new Error(
      'terrain phases must finish at stage distance',
    )
  }
}

/**
 * Returns the deterministic speed multiplier for one normalized terrain phase.
 *
 * This first B2 movement layer models terrain only:
 * - shallow downhill within a flat phase can add up to 2%;
 * - rolling terrain progressively reduces speed;
 * - sustained climbs apply the largest reduction;
 * - descents increase speed, with a deterministic safety cap.
 */
export function calculateTerrainSpeedMultiplier(
  terrainType: TerrainPhaseType,
  averageGradientPercent: number,
): number {
  assertFiniteNumber(
    averageGradientPercent,
    'averageGradientPercent',
  )

  if (terrainType === 'flat') {
    return round(
      clamp(
        1 - averageGradientPercent * 0.012,
        0.98,
        1.02,
      ),
    )
  }

  if (terrainType === 'rolling') {
    return round(
      clamp(
        0.965 -
          (averageGradientPercent - 1.5) *
            0.018,
        0.92,
        0.965,
      ),
    )
  }

  if (terrainType === 'climb') {
    return round(
      clamp(
        0.86 -
          (averageGradientPercent - 4) *
            0.028,
        0.68,
        0.86,
      ),
    )
  }

  return round(
    clamp(
      1.08 +
        (Math.abs(averageGradientPercent) -
          1.5) *
          0.018,
      1.08,
      1.22,
    ),
  )
}

function calculatePhaseSpeed(
  phase: TerrainPhase,
  baseSpeedKmh: number,
): {
  readonly multiplier: number
  readonly effectiveSpeedKmh: number
} {
  const multiplier =
    calculateTerrainSpeedMultiplier(
      phase.terrainType,
      phase.averageGradientPercent,
    )
  const effectiveSpeedKmh = round(
    baseSpeedKmh * multiplier,
  )

  if (effectiveSpeedKmh <= 0) {
    throw new Error(
      'effective terrain speed must be positive',
    )
  }

  return {
    multiplier,
    effectiveSpeedKmh,
  }
}

function validateInput(
  input: TerrainMovementInput,
): void {
  validateProfileCoverage(input.profile)
  assertFiniteNumber(input.startKm, 'startKm')
  assertFiniteNumber(
    input.durationSeconds,
    'durationSeconds',
  )
  assertFiniteNumber(
    input.baseSpeedKmh,
    'baseSpeedKmh',
  )

  if (
    input.startKm < 0 ||
    input.startKm > input.profile.distanceKm
  ) {
    throw new Error(
      'startKm must be inside the stage distance',
    )
  }

  if (input.durationSeconds <= 0) {
    throw new Error(
      'durationSeconds must be positive',
    )
  }

  if (input.baseSpeedKmh <= 0) {
    throw new Error(
      'baseSpeedKmh must be positive',
    )
  }
}

function createSegment(
  phase: TerrainPhase,
  startKm: number,
  endKm: number,
  durationSeconds: number,
  baseSpeedKmh: number,
  multiplier: number,
  effectiveSpeedKmh: number,
  profile: RoadStageProfile,
): TerrainMovementSegment {
  const reachedPhaseEnd =
    Math.abs(endKm - phase.endKm) <= EPSILON
  const reachedStageFinish =
    Math.abs(
      endKm - profile.distanceKm,
    ) <= EPSILON

  return {
    phaseId: phase.phaseId,
    phaseIndex: phase.phaseIndex,
    terrainType: phase.terrainType,
    averageGradientPercent:
      phase.averageGradientPercent,
    startKm: round(startKm),
    endKm: round(endKm),
    distanceKm: round(endKm - startKm),
    durationSeconds: round(durationSeconds),
    baseSpeedKmh: round(baseSpeedKmh),
    terrainSpeedMultiplier: multiplier,
    effectiveSpeedKmh,
    reachedPhaseEnd,
    reachedStageFinish,
  }
}

/**
 * Moves one existing group for a requested duration and splits the calculation
 * exactly at each normalized terrain-phase boundary.
 */
export function calculateTerrainMovement(
  input: TerrainMovementInput,
): TerrainMovementResult {
  validateInput(input)

  const startedPhase = getTerrainPhaseAtKm(
    input.profile,
    input.startKm,
  )

  if (
    Math.abs(
      input.startKm - input.profile.distanceKm,
    ) <= EPSILON
  ) {
    return {
      profileId: input.profile.profileId,
      startKm: round(input.startKm),
      endKm: round(input.startKm),
      distanceKm: 0,
      requestedDurationSeconds: round(
        input.durationSeconds,
      ),
      elapsedDurationSeconds: 0,
      unusedDurationSeconds: round(
        input.durationSeconds,
      ),
      baseSpeedKmh: round(input.baseSpeedKmh),
      startedPhaseId: startedPhase.phaseId,
      endedPhaseId: startedPhase.phaseId,
      crossedPhaseBoundary: false,
      phaseBoundaryCrossingCount: 0,
      stageFinished: true,
      segments: [],
    }
  }

  let currentKm = input.startKm
  let remainingSeconds = input.durationSeconds
  let elapsedSeconds = 0
  let phaseBoundaryCrossingCount = 0
  const segments: TerrainMovementSegment[] = []

  while (
    remainingSeconds > EPSILON &&
    currentKm < input.profile.distanceKm - EPSILON
  ) {
    const phase = getTerrainPhaseAtKm(
      input.profile,
      currentKm,
    )
    const {
      multiplier,
      effectiveSpeedKmh,
    } = calculatePhaseSpeed(
      phase,
      input.baseSpeedKmh,
    )
    const distanceToPhaseEndKm =
      phase.endKm - currentKm
    const secondsToPhaseEnd =
      (distanceToPhaseEndKm /
        effectiveSpeedKmh) *
      3600

    if (
      remainingSeconds + EPSILON <
      secondsToPhaseEnd
    ) {
      const distanceKm =
        (effectiveSpeedKmh *
          remainingSeconds) /
        3600
      const nextKm = Math.min(
        input.profile.distanceKm,
        currentKm + distanceKm,
      )

      segments.push(
        createSegment(
          phase,
          currentKm,
          nextKm,
          remainingSeconds,
          input.baseSpeedKmh,
          multiplier,
          effectiveSpeedKmh,
          input.profile,
        ),
      )
      elapsedSeconds += remainingSeconds
      currentKm = nextKm
      remainingSeconds = 0
      break
    }

    segments.push(
      createSegment(
        phase,
        currentKm,
        phase.endKm,
        secondsToPhaseEnd,
        input.baseSpeedKmh,
        multiplier,
        effectiveSpeedKmh,
        input.profile,
      ),
    )

    elapsedSeconds += secondsToPhaseEnd
    remainingSeconds = Math.max(
      0,
      remainingSeconds - secondsToPhaseEnd,
    )
    currentKm = phase.endKm

    if (
      currentKm <
      input.profile.distanceKm - EPSILON
    ) {
      phaseBoundaryCrossingCount += 1
    }
  }

  currentKm = Math.min(
    input.profile.distanceKm,
    currentKm,
  )
  const endedPhase = getTerrainPhaseAtKm(
    input.profile,
    currentKm,
  )
  const stageFinished =
    Math.abs(
      currentKm - input.profile.distanceKm,
    ) <= EPSILON

  return {
    profileId: input.profile.profileId,
    startKm: round(input.startKm),
    endKm: round(currentKm),
    distanceKm: round(currentKm - input.startKm),
    requestedDurationSeconds: round(
      input.durationSeconds,
    ),
    elapsedDurationSeconds: round(elapsedSeconds),
    unusedDurationSeconds: round(
      stageFinished ? remainingSeconds : 0,
    ),
    baseSpeedKmh: round(input.baseSpeedKmh),
    startedPhaseId: startedPhase.phaseId,
    endedPhaseId: endedPhase.phaseId,
    crossedPhaseBoundary:
      phaseBoundaryCrossingCount > 0,
    phaseBoundaryCrossingCount,
    stageFinished,
    segments,
  }
}
