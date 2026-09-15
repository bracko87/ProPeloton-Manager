import type { UniversalRaceEngineInput, UniversalRaceEngineResult } from './runRaceEngine.ts'
import {
  FLAT_SCENARIO_CATALOG_VERSION,
  FLAT_SCENARIO_TEMPLATES_V1,
} from './flatScenarioV1.ts'
import {
  HILLY_SCENARIO_CATALOG_VERSION,
  HILLY_SCENARIO_TEMPLATES_V1,
} from './hillyScenarioV1.ts'
import {
  MOUNTAIN_SCENARIO_CATALOG_VERSION,
  MOUNTAIN_SCENARIO_TEMPLATES_V1,
} from './mountainScenarioV1.ts'
import {
  COBBLED_SCENARIO_CATALOG_VERSION,
  COBBLED_SCENARIO_TEMPLATES_V1,
} from './cobbledScenarioV1.ts'

export const ROAD_SCENARIO_PRECALCULATION_VERSION =
  'road_scenario_precalculation_template_match_v2' as const
export const ROAD_RACE_DIRECTOR_V2_VERSION = 'road_race_director_v2' as const

type Row = Record<string, unknown>
type JsonRecord = Record<string, unknown>
type NumericRange = readonly [number, number]
type Band = 'none' | 'small' | 'medium' | 'large'
type TimingBand = 'none' | 'early' | 'middle' | 'late'
type DurationBand = 'none' | 'short' | 'medium' | 'long'
type FragmentationBand = 'low' | 'medium' | 'high'
type FinishBand = 'bunch' | 'reduced' | 'small_group' | 'solo' | 'breakaway'

type TemplateLike = {
  readonly id: string
  readonly label: string
  readonly version: number
  readonly family: string
  readonly similarityGroup: string
  readonly breakaways: readonly {
    readonly generation: number
    readonly formationWindowPct: NumericRange
    readonly preferredSize: NumericRange
    readonly targetPeakGapSec: NumericRange
    readonly peakWindowPct: NumericRange
    readonly chaseStartWindowPct?: NumericRange
    readonly catchKmRemaining?: NumericRange
    readonly survivalTargetSec?: NumericRange
  }[]
  readonly fragmentation: {
    readonly pressure: NumericRange
    readonly targetFrontGroup?: NumericRange
    readonly secondaryGapSec?: NumericRange
    readonly allowRegroup: boolean
  }
  readonly finale: {
    readonly type: string
    readonly expectedFrontGroup?: NumericRange
  }
  readonly phases: Readonly<Record<string, {
    readonly controlTeams: NumericRange
    readonly chaseTeams: NumericRange
    readonly pressure?: string
    readonly selectionPressure?: string
  }>>
}

export interface PrecalculationScenarioHistoryEntryV2 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

export interface RoadScenarioPrecalculationSummaryV2 extends JsonRecord {
  readonly modelVersion: typeof ROAD_SCENARIO_PRECALCULATION_VERSION
  readonly directorVersion: typeof ROAD_RACE_DIRECTOR_V2_VERSION
  readonly distanceKm: number
  readonly starterCount: number
  readonly breakawayPresent: boolean
  readonly openingBreakSize: number
  readonly breakSizeBand: Band
  readonly openingAttackKm: number | null
  readonly openingAttackPct: number | null
  readonly formationBand: TimingBand
  readonly maximumPhysicalGapSeconds: number
  readonly gapBand: Band
  readonly physicalCatchKm: number | null
  readonly physicalCatchPct: number | null
  readonly caught: boolean
  readonly catchBand: TimingBand
  readonly breakDurationPct: number
  readonly durationBand: DurationBand
  readonly breakawaySurvived: boolean
  readonly finalFrontGroupSize: number
  readonly finalGroupCount: number
  readonly sameTimeShare: number
  readonly fragmentationBand: FragmentationBand
  readonly finishBand: FinishBand
}

export interface RoadScenarioPrecalculationSelectionV2 {
  readonly input: UniversalRaceEngineInput
  readonly audit: JsonRecord | null
  readonly summary: RoadScenarioPrecalculationSummaryV2 | null
}

interface SimilarityBreakdown {
  readonly breakPresence: number
  readonly breakSize: number
  readonly formationTiming: number
  readonly peakGap: number
  readonly catchOutcome: number
  readonly catchTiming: number
  readonly breakDuration: number
  readonly finalFrontGroup: number
  readonly fragmentation: number
  readonly finishStyle: number
}

function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function nullableFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number, digits = 6): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function unit(seed: string, key: string): number {
  return stableHash(`${seed}:${key}`) / 0xffffffff
}

function between(seed: string, key: string, range: NumericRange): number {
  const low = Math.min(range[0], range[1])
  const high = Math.max(range[0], range[1])
  return low + (high - low) * unit(seed, key)
}

function integerBetween(seed: string, key: string, range: NumericRange): number {
  const minimum = Math.ceil(Math.min(range[0], range[1]))
  const maximum = Math.floor(Math.max(range[0], range[1]))
  if (maximum <= minimum) return minimum
  return minimum + Math.floor(unit(seed, key) * (maximum - minimum + 1))
}

function midpoint(range: NumericRange | undefined, fallback = 0): number {
  if (!range) return fallback
  return (finite(range[0], fallback) + finite(range[1], fallback)) / 2
}

function rangeSimilarity(value: number, range: NumericRange | undefined, naturalScale: number): number {
  if (!range) return 0.68
  const low = Math.min(range[0], range[1])
  const high = Math.max(range[0], range[1])
  if (value >= low && value <= high) return 1
  const distance = value < low ? low - value : value - high
  const scale = Math.max(naturalScale, high - low, 0.000001)
  return clamp(1 - distance / scale)
}

function collectGapNumbers(value: unknown, depth = 0): number[] {
  if (depth > 5 || value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((entry) => collectGapNumbers(entry, depth + 1))
  if (typeof value !== 'object') return []
  const row = value as JsonRecord
  const result: number[] = []
  Object.entries(row).forEach(([key, nested]) => {
    if (/gap.*seconds|seconds.*gap|endgapseconds|initialgapseconds/i.test(key)) {
      const number = finite(nested, -1)
      if (number >= 0 && number <= 3600) result.push(number)
    }
    if (nested && typeof nested === 'object') result.push(...collectGapNumbers(nested, depth + 1))
  })
  return result
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const number = nullableFinite(value)
    if (number !== null) return number
  }
  return null
}

function sizeBand(size: number): Band {
  if (size <= 0) return 'none'
  if (size <= 4) return 'small'
  if (size <= 10) return 'medium'
  return 'large'
}

function gapBand(seconds: number): Band {
  if (seconds <= 5) return 'none'
  if (seconds < 120) return 'small'
  if (seconds <= 420) return 'medium'
  return 'large'
}

function timingBand(progress: number | null): TimingBand {
  if (progress === null) return 'none'
  if (progress < 0.25) return 'early'
  if (progress < 0.62) return 'middle'
  return 'late'
}

function durationBand(duration: number, present: boolean): DurationBand {
  if (!present) return 'none'
  if (duration < 0.28) return 'short'
  if (duration < 0.62) return 'medium'
  return 'long'
}

function fragmentationBand(sameTimeShare: number, finalGroupCount: number): FragmentationBand {
  if (sameTimeShare >= 0.62 && finalGroupCount <= 4) return 'low'
  if (sameTimeShare <= 0.28 || finalGroupCount >= 8) return 'high'
  return 'medium'
}

function finishBand(
  breakawaySurvived: boolean,
  finalFrontGroupSize: number,
  starterCount: number,
): FinishBand {
  if (breakawaySurvived) return 'breakaway'
  if (finalFrontGroupSize <= 1) return 'solo'
  if (finalFrontGroupSize <= 8) return 'small_group'
  if (finalFrontGroupSize <= Math.max(30, Math.round(starterCount * 0.45))) return 'reduced'
  return 'bunch'
}

export function summarizeRoadPrecalculationV2(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): RoadScenarioPrecalculationSummaryV2 {
  const root = result as unknown as JsonRecord
  const road = object(root.roadRaceResolution)
  const phase1 = object(road.phase1Opening)
  const phase2 = object(road.phase2Development)
  const phase3 = object(road.phase3Decisive)
  const calibration = object(root.calibrationSummary)
  const finish = object(root.finishResolution)
  const classification = array(finish.classification).map(object)
  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))

  const openingBreakIds = array(phase1.breakawayRiderIds)
  const openingBreakSize = Math.max(
    openingBreakIds.length,
    Math.trunc(finite(phase1.openingBreakawaySize, 0)),
    Math.trunc(finite(calibration.openingBreakawaySize, 0)),
  )
  const openingAttackKm = firstFinite(
    phase1.firstWaveAttemptKm,
    phase1.openingAttackKm,
    calibration.openingAttackKm,
  )
  const catchKm = firstFinite(
    phase1.breakawayCatchKm,
    phase2.breakawayCatchKm,
    phase3.physicalCatchKm,
    phase3.breakawayCatchKm,
    calibration.catchKm,
  )
  const directMaximum = firstFinite(
    calibration.maximumBreakawayGapSeconds,
    road.maximumBreakawayGapSeconds,
    phase2.maximumBreakawayGapSeconds,
    phase3.maximumBreakawayGapSeconds,
  )
  const physicalGapNumbers = collectGapNumbers(road)
  const maximumPhysicalGapSeconds = Math.max(0, directMaximum ?? 0, ...physicalGapNumbers)

  const gaps = classification.map((row) => Math.max(0, finite(row.gapSeconds ?? row.officialGapSeconds, 0)))
  const finalFrontGroupSize = gaps.filter((gap) => gap <= 0.5).length
  const distinctGroups = new Set(gaps.map((gap) => Math.round(gap * 2) / 2))
  const phase2BreakAtEnd = array(phase2.breakawayRiderIdsAtEnd).length
  const phase3EscapeAtEnd = array(phase3.physicalEscapeRiderIdsAtEnd).length
  const breakawayPresent = openingBreakSize > 0
  const openingAttackPct = openingAttackKm === null ? null : clamp(openingAttackKm / distanceKm)
  const physicalCatchPct = catchKm === null ? null : clamp(catchKm / distanceKm)
  const caught = breakawayPresent && catchKm !== null
  const breakawaySurvived =
    breakawayPresent &&
    !caught &&
    (phase3EscapeAtEnd > 0 || phase2BreakAtEnd > 0 || finalFrontGroupSize < classification.length)
  const breakDurationPct = breakawayPresent && openingAttackPct !== null
    ? clamp((physicalCatchPct ?? 1) - openingAttackPct)
    : 0
  const sameTimeShare = classification.length === 0
    ? 0
    : round(finalFrontGroupSize / classification.length, 6)
  const finalGroupCount = distinctGroups.size

  return {
    modelVersion: ROAD_SCENARIO_PRECALCULATION_VERSION,
    directorVersion: ROAD_RACE_DIRECTOR_V2_VERSION,
    distanceKm,
    starterCount: input.riders.length,
    breakawayPresent,
    openingBreakSize,
    breakSizeBand: sizeBand(openingBreakSize),
    openingAttackKm,
    openingAttackPct,
    formationBand: timingBand(openingAttackPct),
    maximumPhysicalGapSeconds: round(maximumPhysicalGapSeconds, 3),
    gapBand: gapBand(maximumPhysicalGapSeconds),
    physicalCatchKm: catchKm,
    physicalCatchPct,
    caught,
    catchBand: timingBand(physicalCatchPct),
    breakDurationPct: round(breakDurationPct, 6),
    durationBand: durationBand(breakDurationPct, breakawayPresent),
    breakawaySurvived,
    finalFrontGroupSize,
    finalGroupCount,
    sameTimeShare,
    fragmentationBand: fragmentationBand(sameTimeShare, finalGroupCount),
    finishBand: finishBand(breakawaySurvived, finalFrontGroupSize, input.riders.length),
  }
}

function expectedCatch(template: TemplateLike): boolean | null {
  const primary = template.breakaways[0]
  if (!primary) return null
  if (template.finale.type === 'breakaway_finish') return false
  if (primary.catchKmRemaining) return true
  if (template.family === 'breakaway') return false
  return null
}

function expectedCatchProgress(
  template: TemplateLike,
  distanceKm: number,
): NumericRange | undefined {
  const remaining = template.breakaways[0]?.catchKmRemaining
  if (!remaining) return undefined
  const low = clamp(1 - Math.max(remaining[0], remaining[1]) / Math.max(1, distanceKm))
  const high = clamp(1 - Math.min(remaining[0], remaining[1]) / Math.max(1, distanceKm))
  return [low, high]
}

function expectedDurationRange(
  template: TemplateLike,
  distanceKm: number,
): NumericRange | undefined {
  const primary = template.breakaways[0]
  if (!primary) return undefined
  const catchProgress = expectedCatchProgress(template, distanceKm)
  if (!catchProgress) {
    return expectedCatch(template) === false ? [0.48, 1] : undefined
  }
  const formationLow = Math.min(primary.formationWindowPct[0], primary.formationWindowPct[1])
  const formationHigh = Math.max(primary.formationWindowPct[0], primary.formationWindowPct[1])
  return [
    clamp(catchProgress[0] - formationHigh),
    clamp(catchProgress[1] - formationLow),
  ]
}

function observedFragmentationPressure(summary: RoadScenarioPrecalculationSummaryV2): number {
  if (summary.fragmentationBand === 'low') return 0.18
  if (summary.fragmentationBand === 'high') return 0.86
  return 0.53
}

function finishStyleSimilarity(template: TemplateLike, summary: RoadScenarioPrecalculationSummaryV2): number {
  const finale = template.finale.type
  const observed = summary.finishBand
  if (finale === 'open') return 0.78
  if (finale === 'breakaway_finish') return observed === 'breakaway' ? 1 : 0.18
  if (finale === 'solo_finish') return observed === 'solo' ? 1 : observed === 'small_group' ? 0.7 : 0.28
  if (finale === 'large_bunch_sprint') return observed === 'bunch' ? 1 : observed === 'reduced' ? 0.68 : 0.2
  if (['chaotic_bunch_sprint', 'reduced_sprint', 'large_reduced_sprint'].includes(finale)) {
    return observed === 'reduced' ? 1 : observed === 'bunch' ? 0.72 : observed === 'small_group' ? 0.45 : 0.22
  }
  if (['small_reduced_sprint', 'small_group_sprint', 'puncheur_group', 'gc_group', 'gc_group_sprint', 'summit_small_group'].includes(finale)) {
    return observed === 'small_group' ? 1 : observed === 'reduced' ? 0.65 : observed === 'solo' ? 0.58 : 0.25
  }
  if (['multi_group', 'multi_group_gc'].includes(finale)) {
    return summary.fragmentationBand === 'high' ? 1 : summary.fragmentationBand === 'medium' ? 0.7 : 0.3
  }
  return 0.62
}

function questionSimilarity(
  template: TemplateLike,
  summary: RoadScenarioPrecalculationSummaryV2,
): SimilarityBreakdown {
  const primary = template.breakaways[0]
  const expectsBreak = template.breakaways.length > 0
  const catchExpectation = expectedCatch(template)
  const catchRange = expectedCatchProgress(template, summary.distanceKm)
  const durationRange = expectedDurationRange(template, summary.distanceKm)
  const expectedFront = template.finale.expectedFrontGroup ?? template.fragmentation.targetFrontGroup

  return {
    breakPresence: expectsBreak === summary.breakawayPresent ? 1 : 0.2,
    breakSize: primary
      ? rangeSimilarity(summary.openingBreakSize, primary.preferredSize, 7)
      : summary.openingBreakSize === 0 ? 1 : 0.3,
    formationTiming: primary && summary.openingAttackPct !== null
      ? rangeSimilarity(summary.openingAttackPct, primary.formationWindowPct, 0.22)
      : summary.openingAttackPct === null ? 0.62 : 0.55,
    peakGap: primary
      ? rangeSimilarity(summary.maximumPhysicalGapSeconds, primary.targetPeakGapSec, 360)
      : summary.maximumPhysicalGapSeconds <= 20 ? 1 : 0.35,
    catchOutcome: catchExpectation === null
      ? 0.72
      : catchExpectation === summary.caught ? 1 : 0.2,
    catchTiming: catchRange && summary.physicalCatchPct !== null
      ? rangeSimilarity(summary.physicalCatchPct, catchRange, 0.24)
      : catchExpectation === false && !summary.caught ? 1 : 0.66,
    breakDuration: durationRange
      ? rangeSimilarity(summary.breakDurationPct, durationRange, 0.30)
      : 0.7,
    finalFrontGroup: rangeSimilarity(
      summary.finalFrontGroupSize,
      expectedFront,
      Math.max(18, summary.starterCount * 0.32),
    ),
    fragmentation: rangeSimilarity(
      observedFragmentationPressure(summary),
      template.fragmentation.pressure,
      0.45,
    ),
    finishStyle: finishStyleSimilarity(template, summary),
  }
}

function templateSimilarity(
  template: TemplateLike,
  summary: RoadScenarioPrecalculationSummaryV2,
): { score: number; breakdown: SimilarityBreakdown } {
  const breakdown = questionSimilarity(template, summary)
  const score =
    breakdown.breakPresence * 0.12 +
    breakdown.breakSize * 0.11 +
    breakdown.formationTiming * 0.10 +
    breakdown.peakGap * 0.13 +
    breakdown.catchOutcome * 0.12 +
    breakdown.catchTiming * 0.10 +
    breakdown.breakDuration * 0.08 +
    breakdown.finalFrontGroup * 0.09 +
    breakdown.fragmentation * 0.08 +
    breakdown.finishStyle * 0.07
  return { score: round(score, 6), breakdown }
}

function catalogForTerrain(terrainType: string): {
  templates: readonly TemplateLike[]
  catalogVersion: string
  metadataKey: string
  contract: string
} | null {
  if (terrainType === 'flat') return {
    templates: FLAT_SCENARIO_TEMPLATES_V1 as readonly TemplateLike[],
    catalogVersion: FLAT_SCENARIO_CATALOG_VERSION,
    metadataKey: 'flatScenarioV1',
    contract: 'flat_scenario_selection_v1',
  }
  if (terrainType === 'hilly') return {
    templates: HILLY_SCENARIO_TEMPLATES_V1 as readonly TemplateLike[],
    catalogVersion: HILLY_SCENARIO_CATALOG_VERSION,
    metadataKey: 'hillyScenarioV1',
    contract: 'hilly_scenario_selection_v1',
  }
  if (terrainType === 'mountain') return {
    templates: MOUNTAIN_SCENARIO_TEMPLATES_V1 as readonly TemplateLike[],
    catalogVersion: MOUNTAIN_SCENARIO_CATALOG_VERSION,
    metadataKey: 'mountainScenarioV1',
    contract: 'mountain_scenario_selection_v1',
  }
  if (terrainType === 'cobbled') return {
    templates: COBBLED_SCENARIO_TEMPLATES_V1 as readonly TemplateLike[],
    catalogVersion: COBBLED_SCENARIO_CATALOG_VERSION,
    metadataKey: 'cobbledScenarioV1',
    contract: 'cobbled_scenario_selection_v1',
  }
  return null
}

function instantiateTemplate(template: TemplateLike, seed: string): JsonRecord {
  const breakaways = template.breakaways.map((directive, index) => ({
    generation: directive.generation,
    preferredSize: integerBetween(seed, `break:${index}:size`, directive.preferredSize),
    preferredSizeRange: [...directive.preferredSize],
    targetPeakGapSec: Math.round(between(seed, `break:${index}:gap`, directive.targetPeakGapSec)),
    targetPeakGapRangeSec: [...directive.targetPeakGapSec],
    formationPct: round(between(seed, `break:${index}:formation`, directive.formationWindowPct), 4),
    formationWindowPct: [...directive.formationWindowPct],
    peakPct: round(between(seed, `break:${index}:peak`, directive.peakWindowPct), 4),
    peakWindowPct: [...directive.peakWindowPct],
    chaseStartPct: directive.chaseStartWindowPct
      ? round(between(seed, `break:${index}:chase`, directive.chaseStartWindowPct), 4)
      : null,
    chaseStartWindowPct: directive.chaseStartWindowPct ? [...directive.chaseStartWindowPct] : null,
    catchKmRemaining: directive.catchKmRemaining
      ? round(between(seed, `break:${index}:catch`, directive.catchKmRemaining), 2)
      : null,
    catchKmRemainingRange: directive.catchKmRemaining ? [...directive.catchKmRemaining] : null,
    survivalTargetSec: directive.survivalTargetSec
      ? Math.round(between(seed, `break:${index}:survival`, directive.survivalTargetSec))
      : null,
    survivalTargetRangeSec: directive.survivalTargetSec ? [...directive.survivalTargetSec] : null,
  }))
  const phaseBehavior = ([1, 2, 3, 4] as const).map((phase) => {
    const directive = template.phases[`phase${phase}`]
    return {
      phase,
      pressure: String(directive?.pressure ?? directive?.selectionPressure ?? 'medium'),
      controlTeams: directive?.controlTeams
        ? round(between(seed, `phase:${phase}:control`, directive.controlTeams), 2)
        : 0,
      chaseTeams: directive?.chaseTeams
        ? round(between(seed, `phase:${phase}:chase`, directive.chaseTeams), 2)
        : 0,
    }
  })
  return {
    breakaways,
    fragmentationPressure: round(between(seed, 'fragmentation:pressure', template.fragmentation.pressure), 4),
    fragmentationPressureRange: [...template.fragmentation.pressure],
    targetFrontGroup: template.fragmentation.targetFrontGroup
      ? integerBetween(seed, 'fragmentation:front', template.fragmentation.targetFrontGroup)
      : null,
    targetFrontGroupRange: template.fragmentation.targetFrontGroup
      ? [...template.fragmentation.targetFrontGroup]
      : null,
    secondaryGapSec: template.fragmentation.secondaryGapSec
      ? Math.round(between(seed, 'fragmentation:gap', template.fragmentation.secondaryGapSec))
      : null,
    secondaryGapRangeSec: template.fragmentation.secondaryGapSec
      ? [...template.fragmentation.secondaryGapSec]
      : null,
    allowRegroup: template.fragmentation.allowRegroup,
    finaleType: template.finale.type,
    phaseBehavior,
    directorV2: {
      storyStrength: round(0.68 + unit(seed, 'story-strength') * 0.20, 4),
      centerPullStrength: round(0.18 + unit(seed, 'center-pull') * 0.16, 4),
      variationFactor: round(0.90 + unit(seed, 'variation-factor') * 0.20, 4),
    },
  }
}

function weightedChoice<T extends { score: number; template: TemplateLike }>(
  candidates: readonly T[],
  seed: string,
): T | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const best = Math.max(...candidates.map((candidate) => candidate.score))
  const floor = best - 0.12
  const weighted = candidates.map((candidate) => {
    const normalized = clamp((candidate.score - floor) / 0.12, 0.08, 1)
    const weight = normalized * normalized
    return { candidate, weight }
  })
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = unit(seed, 'weighted-template-choice') * total
  for (const entry of weighted) {
    roll -= entry.weight
    if (roll <= 0) return entry.candidate
  }
  return weighted.at(-1)?.candidate ?? candidates[0]
}

export function applyRoadScenarioFromPrecalculationV2(
  input: UniversalRaceEngineInput,
  preCalculation: UniversalRaceEngineResult,
  gameDate: string,
  history: readonly PrecalculationScenarioHistoryEntryV2[] = [],
): RoadScenarioPrecalculationSelectionV2 {
  const catalog = catalogForTerrain(input.stage.terrainType)
  if (input.stage.stageFormat !== 'road_race' || !catalog || catalog.templates.length === 0) {
    return { input, audit: null, summary: null }
  }

  const summary = summarizeRoadPrecalculationV2(input, preCalculation)
  const usedSameRace = new Set(
    history.filter((entry) => entry.raceId === input.race.raceId).map((entry) => entry.templateId),
  )
  const usedSameDay = new Set(
    history.filter((entry) => entry.gameDate === gameDate).map((entry) => entry.templateId),
  )
  const latestRaceFamily = [...history]
    .filter((entry) => entry.raceId === input.race.raceId)
    .at(-1)?.family ?? null
  const seed = `race-director-v2:${input.race.raceId}:${input.stage.stageId}:${catalog.catalogVersion}`

  const candidates = catalog.templates.map((template) => {
    const similarity = templateSimilarity(template, summary)
    const exactUsed = usedSameRace.has(template.id) || usedSameDay.has(template.id)
    const familyPenalty = latestRaceFamily === template.family ? 0.045 : 0
    const varietyJitter = (unit(seed, `candidate:${template.id}`) - 0.5) * 0.04
    return {
      template,
      similarity: similarity.score,
      breakdown: similarity.breakdown,
      exactUsed,
      familyPenalty,
      varietyJitter,
      score: round(similarity.score - familyPenalty + varietyJitter, 6),
    }
  })

  const unused = candidates.filter((candidate) => !candidate.exactUsed)
  const basePool = unused.length > 0 ? unused : candidates
  const ranked = [...basePool].sort((left, right) =>
    right.score - left.score ||
    right.similarity - left.similarity ||
    left.template.id.localeCompare(right.template.id),
  )
  const best = ranked[0]
  if (!best) return { input, audit: null, summary }

  const plausiblePool = ranked
    .filter((candidate) =>
      candidate.score >= best.score - 0.10 &&
      candidate.similarity >= best.similarity - 0.14,
    )
    .slice(0, 5)
  const selected = weightedChoice(plausiblePool, seed) ?? best

  const generatedParameters = instantiateTemplate(selected.template, seed)
  const candidateScores = candidates
    .map((candidate) => ({
      templateId: candidate.template.id,
      family: candidate.template.family,
      questionScores: candidate.breakdown,
      precalculationSimilarity: round(candidate.similarity * 100, 4),
      repetitionPenalty: candidate.familyPenalty === 0 ? 0 : round(-candidate.familyPenalty * 100, 4),
      varietyJitter: round(candidate.varietyJitter * 100, 4),
      finalScore: round(candidate.score * 100, 4),
      excluded: unused.length > 0 && candidate.exactUsed,
      plausible: plausiblePool.some((entry) => entry.template.id === candidate.template.id),
      exclusionReason: unused.length > 0 && candidate.exactUsed
        ? 'exact_template_already_used_same_race_or_day'
        : null,
    }))
    .sort((left, right) => right.finalScore - left.finalScore || left.templateId.localeCompare(right.templateId))

  const audit: JsonRecord = {
    contract: catalog.contract,
    directorVersion: ROAD_RACE_DIRECTOR_V2_VERSION,
    scenarioType: input.stage.terrainType,
    catalogVersion: catalog.catalogVersion,
    templateId: selected.template.id,
    templateVersion: selected.template.version,
    templateLabel: selected.template.label,
    templateFamily: selected.template.family,
    similarityGroup: selected.template.similarityGroup,
    selectionSeed: seed,
    compatibilityScore: round(selected.similarity * 100, 4),
    weightedSelectionPoolSize: plausiblePool.length,
    gameDate,
    selectionModel: ROAD_RACE_DIRECTOR_V2_VERSION,
    preCalculationSummary: summary,
    raceFingerprint: {
      breakaway: summary.breakawayPresent,
      breakSize: summary.breakSizeBand,
      formation: summary.formationBand,
      breakDuration: summary.durationBand,
      peakGap: summary.gapBand,
      caught: summary.caught,
      catchTiming: summary.catchBand,
      fragmentation: summary.fragmentationBand,
      finish: summary.finishBand,
      finalFrontGroupSize: summary.finalFrontGroupSize,
    },
    contextSnapshot: {
      modelVersion: ROAD_RACE_DIRECTOR_V2_VERSION,
      terrainType: input.stage.terrainType,
      preCalculationSummary: summary,
      commandsPreservedForFinalPass: true,
    },
    candidateScores,
    repeatAllowedRace: unused.length === 0,
    repeatAllowedDay: unused.length === 0,
    generatedParameters,
    appliedDirectives: {
      syntheticCommands: 0,
      syntheticTeamTactics: 0,
      commandAssignments: [],
    },
    runtimeApplicationProof: {
      contract: 'road_race_director_v2_runtime',
      selectedFromPrecalculation: true,
      commandsPreserved: true,
      finalEngineSawTemplate: false,
      gapGuidanceCalls: 0,
      gapAdjustments: 0,
      fragmentationCalls: 0,
      fragmentationAdjustments: 0,
      lastGuidedKm: null,
    },
  }

  const stagePlans = input.stagePlans.map((plan, index) => index === 0
    ? {
        ...plan,
        metadata: {
          ...plan.metadata,
          [catalog.metadataKey]: audit,
        },
      }
    : plan)

  return {
    input: { ...input, stagePlans },
    audit,
    summary,
  }
}
