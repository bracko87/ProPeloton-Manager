/**
 * Absolute V1 road-stage winner clock. This deliberately does not decide
 * attacks, catches, finishing groups, riders or time gaps.
 *
 * Older Phase 4 used distance / finish-type speed, so every flat-finish road
 * stage averaged 42 km/h, even when most of the route was mountainous.
 *
 * Integrate the stored elevation profile and account for terrain mix and
 * climbing that the (often simplified) profile points do not represent.
 * Keep this deterministic and independent of result publication.
 */
export interface UniversalRoadStageClockInputV1 {
  readonly distanceKm: number
  readonly elevationGainM: number
  readonly terrainPercentages: {
    readonly flat: number
    readonly hilly: number
    readonly mountain: number
    readonly cobbled: number
  }
  readonly profilePoints: readonly {
    readonly km: number
    readonly elevationM: number
  }[]
}

export interface UniversalRoadStageClockWeatherV1 {
  readonly windKmh?: number | null
}

const clampRoadClock = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

function referenceRoadSpeedKmh(gradientPercent: number): number {
  const gradient = clampRoadClock(gradientPercent, -20, 20)
  const base =
    gradient <= -3
      ? 48
      : gradient >= 6
        ? 25.5
        : gradient >= 2.5
          ? 31.5
          : gradient >= 0.8
            ? 39
            : 42
  const gradientAdjustment =
    gradient > 0
      ? -Math.min(9, gradient * 0.85)
      : Math.min(5.5, Math.abs(gradient) * 0.45)
  return clampRoadClock(base + gradientAdjustment, 20, 55)
}

export function calculateUniversalRoadStageWinnerTimeSecondsV1(
  stage: UniversalRoadStageClockInputV1,
  weather?: UniversalRoadStageClockWeatherV1 | null,
): number {
  const distanceKm = stage.distanceKm
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error('Road stage winner clock requires positive finite distance')
  }

  // The stored profile can be sparse or omit sections. Account for every
  // kilometre exactly once; unknown sections use the neutral road reference.
  const points = stage.profilePoints
    .filter((point) => Number.isFinite(point.km) && Number.isFinite(point.elevationM))
    .slice()
    .sort((a, b) => a.km - b.km)
  let profiledAscentM = 0
  let accountedKm = 0
  let profileHours = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const sourceDistanceKm = end.km - start.km
    if (sourceDistanceKm <= 0) continue

    const overlapStart = Math.max(accountedKm, 0, start.km)
    const overlapEnd = Math.min(distanceKm, end.km)
    if (overlapEnd <= overlapStart) continue
    if (overlapStart > accountedKm) {
      profileHours += (overlapStart - accountedKm) / 42
    }

    const coveredDistanceKm = overlapEnd - overlapStart
    const gradientPercent =
      (end.elevationM - start.elevationM) / (sourceDistanceKm * 10)
    profileHours += coveredDistanceKm / referenceRoadSpeedKmh(gradientPercent)
    profiledAscentM +=
      Math.max(0, end.elevationM - start.elevationM) *
      (coveredDistanceKm / sourceDistanceKm)
    accountedKm = overlapEnd
  }
  if (accountedKm < distanceKm) {
    profileHours += (distanceKm - accountedKm) / 42
  }

  const profileSpeedKmh = distanceKm / Math.max(profileHours, 1e-6)
  const terrain = stage.terrainPercentages
  const terrainTotal = Math.max(
    1,
    terrain.flat + terrain.hilly + terrain.mountain + terrain.cobbled,
  )
  // Terrain shares capture repeated rollers/climbs not resolved by sparse
  // elevation samples; they must not overwrite the physical group time gaps.
  const terrainPenaltyKmh =
    (terrain.hilly / terrainTotal) * 2 +
    (terrain.mountain / terrainTotal) * 5 +
    (terrain.cobbled / terrainTotal) * 4
  const unprofiledAscentM = Math.max(
    0,
    stage.elevationGainM - profiledAscentM,
  )
  const ascentPenaltyKmh = clampRoadClock(
    (unprofiledAscentM / distanceKm) * 0.1,
    0,
    4,
  )
  const windKmh = Number.isFinite(weather?.windKmh)
    ? Math.max(0, weather!.windKmh!)
    : 0
  const windPenaltyKmh = clampRoadClock((windKmh - 10) * 0.035, 0, 1.25)
  const averageSpeedKmh = clampRoadClock(
    profileSpeedKmh -
      terrainPenaltyKmh -
      ascentPenaltyKmh -
      windPenaltyKmh,
    20,
    52,
  )

  return Math.max(60, Math.round((distanceKm / averageSpeedKmh) * 3600))
}
