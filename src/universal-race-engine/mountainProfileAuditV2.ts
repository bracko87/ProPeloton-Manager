/**
 * Read-only diagnostic for experimental mountain stage profile quality.
 *
 * Coarsely sampled route elevations underestimate actual cumulative ascent.
 * This function NEVER normalizes stage data, changes terrain, selects an engine,
 * or changes rider times. It only records whether a route requires validation
 * before assessing or calibrating climbing physics.
 */
export interface MountainProfilePointV2 {
  readonly km: number
  readonly elevationM: number
}

export interface MountainProfileAuditV2 {
  readonly declaredGainM: number
  readonly sampledGainM: number
  readonly sampledCoverageFraction: number | null
  readonly validSampleCount: number
  readonly profileNeedsReview: boolean
  readonly notes: readonly string[]
}

export function auditMountainProfileV2(
  declaredGainM: number,
  points: readonly MountainProfilePointV2[],
): MountainProfileAuditV2 {
  const notes: string[] = []
  const valid = points.every((point, index) =>
    Number.isFinite(point.km) &&
    Number.isFinite(point.elevationM) &&
    (index === 0 || point.km > points[index - 1].km)
  )
  if (!valid || points.length < 2) {
    notes.push('missing_or_invalid_ordered_elevation_samples')
  }
  const normalizedGain = Number.isFinite(declaredGainM) && declaredGainM > 0
    ? declaredGainM : 0
  if (normalizedGain === 0) notes.push('missing_declared_elevation_gain')

  let sampledGainM = 0
  if (valid) {
    for (let i = 1; i < points.length; i++) {
      sampledGainM += Math.max(0, points[i].elevationM - points[i - 1].elevationM)
    }
  }
  const sampledCoverageFraction = normalizedGain > 0
    ? sampledGainM / normalizedGain : null
  if (sampledCoverageFraction !== null && sampledCoverageFraction < 0.5) {
    notes.push('coarse_samples_capture_less_than_half_declared_ascent')
  }
  if (sampledCoverageFraction !== null && sampledCoverageFraction > 1.5) {
    notes.push('samples_exceed_declared_ascent')
  }
  return {
    declaredGainM: normalizedGain,
    sampledGainM,
    sampledCoverageFraction,
    validSampleCount: valid ? points.length : 0,
    profileNeedsReview: notes.length > 0,
    notes,
  }
}
