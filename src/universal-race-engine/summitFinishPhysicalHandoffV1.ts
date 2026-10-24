/** A near-summit finish can have a short recorded profile tail. Preserve
 * the actual physical finish-line gap, never an earlier crest gap or a scripted one. */
export const SUMMIT_FINISH_FINAL_APPROACH_KM_V1 = 0.55

export function isFinalSummitApproachV1(
  stageDistanceKm: number,
  climbEndKm: number,
  summitFinish: boolean,
): boolean {
  const remainingKm = stageDistanceKm - climbEndKm
  return summitFinish && Number.isFinite(stageDistanceKm) &&
    Number.isFinite(climbEndKm) && stageDistanceKm > 0 &&
    remainingKm >= -0.000001 &&
    remainingKm <= SUMMIT_FINISH_FINAL_APPROACH_KM_V1 + 0.000001
}

export function getFinalSummitPhysicalGapSecondsV1(
  samples: readonly {
    readonly kmEnd: number
    readonly endGapBehindPelotonSeconds: number
  }[],
  stageDistanceKm: number,
): number | null {
  const last = samples.at(-1)
  if (!last || !Number.isFinite(last.kmEnd) ||
    !Number.isFinite(last.endGapBehindPelotonSeconds) ||
    Math.abs(last.kmEnd - stageDistanceKm) > 0.000001 ||
    last.endGapBehindPelotonSeconds <= 0
  ) return null
  return last.endGapBehindPelotonSeconds
}
