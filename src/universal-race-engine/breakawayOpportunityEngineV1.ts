/**
 * Breakaway Opportunity Engine V1 — entirely isolated deterministic research model.
 *
 * This is a THIRD candidate engine, neither the accepted universal engine nor
 * Mountain V1/V2. It cannot change actual game standings, stage replay, points,
 * GC, money, rider fitness or race scheduling. Enabling a stage below ONLY
 * enables a read-only shadow calculation through runSelectedBreakawayPreviewV1().
 *
 * Successful long-range escapes are possible, NOT guaranteed or hard-coded.
 * Peloton pursuit and early/late race dynamics can still catch the escape.
 */
export interface BreakawayStageV1 {
  readonly stageId: string
  readonly stageFormat: string
  readonly terrainType: string
  readonly distanceKm: number
}

export interface BreakawayRiderV1 {
  readonly riderId: string
  readonly teamId: string
  readonly flat: number
  readonly climbing: number
  readonly endurance: number
  readonly fatigue: number
  readonly intent: 'breakaway' | 'chase' | 'neutral'
  /** Rider contribution to an escape, 0 (refuses turns) to 1 (cooperates). */
  readonly cooperation?: number
}

export interface BreakawayOpportunityInputV1 {
  readonly stage: BreakawayStageV1
  readonly riders: readonly BreakawayRiderV1[]
  /** Intensity of interested teams' pursuit, 0–1. Includes tactical choices. */
  readonly pelotonChaseIntensity: number
  /** Wind penalty against a small escape, 0–1. */
  readonly crosswindExposure?: number
}

export type BreakawayStageApprovalV1 = {
  readonly stageId: string
  readonly stageName: string
  readonly gameDate: string
  readonly terrainType: 'flat' | 'hilly'
  /** Route opportunity, not a fixed finish probability or guaranteed result. */
  readonly escapeOpportunity: number
  readonly authority: 'shadow_only'
}

/**
 * Exact stage-UUID allowlist. Does NOT select every stage in a given race.
 * These are experiment candidates, not activated production stages.
 */
export const BREAKAWAY_V1_STAGE_REGISTRY: readonly BreakawayStageApprovalV1[] = [
  {
    stageId: '5523cf76-8fd4-4a12-ab28-7f285c9829ff',
    stageName: 'Trka kroz Vojvodinu — Backa Plains Opener',
    gameDate: '2000-10-06',
    terrainType: 'flat',
    escapeOpportunity: 0.72,
    authority: 'shadow_only',
  },
  {
    stageId: '335708f7-d56a-4816-9068-38399e8f74e3',
    stageName: 'Binche–Chimay–Binche Classic',
    gameDate: '2000-10-07',
    terrainType: 'hilly',
    escapeOpportunity: 0.70,
    authority: 'shadow_only',
  },
  {
    stageId: '7f69e552-b116-453c-bf55-16ef655ea021',
    stageName: 'Tacx Zeeland Classic / Ronde van Zeeland',
    gameDate: '2000-10-12',
    terrainType: 'flat',
    escapeOpportunity: 0.72,
    authority: 'shadow_only',
  },
  {
    stageId: 'f5af8665-91c1-4585-937e-11fb94f65819',
    stageName: 'Trka kroz Vojvodinu — Danube and Fruska Gora Finale',
    gameDate: '2000-10-08',
    terrainType: 'hilly',
    escapeOpportunity: 0.76,
    authority: 'shadow_only',
  },
] as const

const registry = new Map(BREAKAWAY_V1_STAGE_REGISTRY.map(row => [row.stageId, row]))
if (registry.size !== BREAKAWAY_V1_STAGE_REGISTRY.length) {
  throw new Error('Duplicate breakaway pilot stage ID')
}

export function selectBreakawayOpportunityStageV1(
  stage: BreakawayStageV1,
): BreakawayStageApprovalV1 | null {
  const row = registry.get(stage.stageId.toLowerCase())
  if (!row || stage.stageFormat !== 'road_race' ||
      stage.terrainType !== row.terrainType || !Number.isFinite(stage.distanceKm) ||
      stage.distanceKm <= 0) return null
  return row
}

export type BreakawayCheckpointV1 = {
  readonly km: number
  readonly escapeGapSeconds: number
  readonly escapeSpeedKmh: number
  readonly pelotonSpeedKmh: number
  readonly pelotonChaseIntensity: number
  readonly escapeRiderIds: readonly string[]
}

export type BreakawayShadowV1 =
  | { readonly authority: 'shadow_only'; readonly status: 'not_selected'; readonly checkpoints: readonly []; readonly breakawayWon: false }
  | {
      readonly authority: 'shadow_only'
      readonly status: 'no_escape' | 'caught' | 'survived'
      readonly stageId: string
      readonly launchKm: number
      readonly captureKm: number | null
      readonly finishGapSeconds: number
      readonly breakawayWon: boolean
      /** Potential escape winner for comparison ONLY, not official finish order. */
      readonly provisionalEscapeWinnerId: string | null
      readonly breakawayRiderIds: readonly string[]
      readonly checkpoints: readonly BreakawayCheckpointV1[]
    }

function bounded(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}
function round(value: number): number { return Math.round(value * 100) / 100 }
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
function eligibleRating(rider: BreakawayRiderV1, hilly: boolean): number {
  const terrainSkill = hilly
    ? rider.climbing * 0.58 + rider.flat * 0.42 : rider.flat
  return terrainSkill * 0.55 + rider.endurance * 0.4 -
    rider.fatigue * 0.12 + bounded(rider.cooperation ?? 0.55, 0, 1) * 4
}

/**
 * A second simulation path requiring explicit selection and explicit input.
 * The engine never imports or invokes the official and mountain engines.
 * There are no writes or mutation of the supplied rider/state objects.
 */
export function runSelectedBreakawayPreviewV1(
  input: BreakawayOpportunityInputV1,
): BreakawayShadowV1 {
  const selected = selectBreakawayOpportunityStageV1(input.stage)
  if (!selected) {
    return { status: 'not_selected', authority: 'shadow_only', breakawayWon: false, checkpoints: [] }
  }
  const { stage, riders } = input
  if (!Number.isFinite(input.pelotonChaseIntensity) ||
      input.pelotonChaseIntensity < 0 || input.pelotonChaseIntensity > 1 ||
      !Number.isFinite(input.crosswindExposure ?? 0) ||
      (input.crosswindExposure ?? 0) < 0 || (input.crosswindExposure ?? 0) > 1 ||
      riders.some(r => !r.riderId || !r.teamId ||
        [r.flat, r.climbing, r.endurance, r.fatigue, r.cooperation ?? 0.5]
          .some(v => !Number.isFinite(v) || v < 0 || v > 100))) {
    throw new Error('Invalid breakaway shadow input')
  }
  if (new Set(riders.map(r => r.riderId)).size !== riders.length) {
    throw new Error('Duplicate rider in breakaway shadow input')
  }
  const hilly = stage.terrainType === 'hilly'
  const launchKm = round(stage.distanceKm * 0.06)
  // Only riders with a breakaway instruction can join the initial escape.
  // A suitable roster and cooperative turns matter more than the stage list.
  const escape = riders
    .filter(r => r.intent === 'breakaway' && r.endurance >= 40 && r.fatigue < 96)
    .sort((a, b) => eligibleRating(b, hilly) - eligibleRating(a, hilly) ||
      a.riderId.localeCompare(b.riderId))
    .slice(0, 8)
  if (escape.length === 0) {
    return {
      authority: 'shadow_only', status: 'no_escape', stageId: stage.stageId,
      launchKm, captureKm: null, finishGapSeconds: 0,
      breakawayWon: false, provisionalEscapeWinnerId: null,
      breakawayRiderIds: [], checkpoints: [],
    }
  }

  const avgCooperation = mean(escape.map(r => bounded(r.cooperation ?? 0.55, 0, 1)))
  const avgTerrain = mean(escape.map(r =>
    hilly ? r.climbing * 0.58 + r.flat * 0.42 : r.flat))
  const avgEndurance = mean(escape.map(r => r.endurance))
  const avgFatigue = mean(escape.map(r => r.fatigue))
  const teamCount = new Set(escape.map(r => r.teamId)).size
  // Multi-team cooperation, route, and team choices influence speed.
  const teamworkBonus = teamCount >= 3 ? 0.15 : 0
  const wind = input.crosswindExposure ?? 0
  const baseSpeed = hilly ? 36.5 : 41.5
  let gapSeconds = 10 + 8 * selected.escapeOpportunity + 6 * avgCooperation
  let captureKm: number | null = null
  const checkpoints: BreakawayCheckpointV1[] = []
  const stepCount = 30
  const stepKm = (stage.distanceKm - launchKm) / stepCount
  for (let i = 0; i < stepCount; i += 1) {
    const progress = (i + 0.5) / stepCount
    const km = launchKm + (i + 1) * stepKm
    const depletion = Math.pow(progress, 1.6) *
      (0.4 + Math.max(0, 80 - avgEndurance) * 0.03 + avgFatigue * 0.008)
    const escapeSpeedKmh = bounded(baseSpeed +
      0.035 * (avgTerrain - 70) + 0.023 * (avgEndurance - 70) +
      avgCooperation * 0.95 + teamworkBonus +
      selected.escapeOpportunity * 0.85 - depletion - wind * 0.7, 15, 80)
    const chaseIntensity = bounded(input.pelotonChaseIntensity +
      Math.max(0, gapSeconds - 150) / 900 * 0.3 +
      Math.pow(progress, 3) * 0.35, 0, 1)
    const pelotonSpeedKmh = bounded(baseSpeed + chaseIntensity * 3.6, 15, 80)
    gapSeconds += stepKm * 3600 *
      (1 / pelotonSpeedKmh - 1 / escapeSpeedKmh)
    if (gapSeconds <= 0) {
      gapSeconds = 0
      captureKm = km
    }
    checkpoints.push({
      km: round(km), escapeGapSeconds: round(gapSeconds),
      escapeSpeedKmh: round(escapeSpeedKmh),
      pelotonSpeedKmh: round(pelotonSpeedKmh),
      pelotonChaseIntensity: round(chaseIntensity),
      escapeRiderIds: escape.map(r => r.riderId),
    })
    if (captureKm !== null) break
  }
  const survived = captureKm === null && gapSeconds > 0
  const potentialWinner = survived
    ? [...escape].sort((a, b) => eligibleRating(b, hilly) -
      eligibleRating(a, hilly) || a.riderId.localeCompare(b.riderId))[0].riderId
    : null
  return {
    authority: 'shadow_only', status: survived ? 'survived' : 'caught',
    stageId: stage.stageId, launchKm,
    captureKm: captureKm === null ? null : round(captureKm),
    finishGapSeconds: round(gapSeconds), breakawayWon: survived,
    provisionalEscapeWinnerId: potentialWinner,
    breakawayRiderIds: escape.map(r => r.riderId),
    checkpoints,
  }
}
