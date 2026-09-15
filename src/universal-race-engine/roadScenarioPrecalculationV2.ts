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

export interface PrecalculationScenarioHistoryEntryV2 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

type JsonRecord = Record<string, unknown>
type NumericRange = readonly [number, number]

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

export interface RoadScenarioPrecalculationSummaryV2 extends JsonRecord {
  readonly modelVersion: typeof ROAD_SCENARIO_PRECALCULATION_VERSION
  readonly distanceKm: number
  readonly starterCount: number
  readonly openingBreakSize: number
  readonly openingAttackKm: number | null
  readonly openingAttackPct: number | null
  readonly maximumPhysicalGapSeconds: number
  readonly physicalCatchKm: number | null
  readonly physicalCatchPct: number | null
  readonly breakawaySurvived: boolean
  readonly finalFrontGroupSize: number
  readonly finalGroupCount: number
  readonly sameTimeShare: number
}

export interface RoadScenarioPrecalculationSelectionV2 {
  readonly input: UniversalRaceEngineInput
  readonly audit: JsonRecord | null
  readonly summary: RoadScenarioPrecalculationSummaryV2 | null
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
  const [minimum, maximum] = range
  return minimum + (maximum - minimum) * unit(seed, key)
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
  if (!range) return 0.65
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
  const maximumPhysicalGapSeconds = Math.max(
    0,
    directMaximum ?? 0,
    ...physicalGapNumbers,
  )

  const gaps = classification.map((row) => Math.max(0, finite(row.gapSeconds ?? row.officialGapSeconds, 0)))
  const finalFrontGroupSize = gaps.filter((gap) => gap <= 0.5).length
  const distinctGroups = new Set(gaps.map((gap) => Math.round(gap * 2) / 2))
  const phase2BreakAtEnd = array(phase2.breakawayRiderIdsAtEnd).length
  const phase3EscapeAtEnd = array(phase3.physicalEscapeRiderIdsAtEnd).length
  const breakawaySurvived =
    openingBreakSize > 0 &&
    catchKm === null &&
    (phase3EscapeAtEnd > 0 || phase2BreakAtEnd > 0 || finalFrontGroupSize < classification.length)

  return {
    modelVersion: ROAD_SCENARIO_PRECALCULATION_VERSION,
    distanceKm,
    starterCount: input.riders.length,
    openingBreakSize,
    openingAttackKm,
    openingAttackPct: openingAttackKm === null ? null : round(openingAttackKm / distanceKm, 6),
    maximumPhysicalGapSeconds: round(maximumPhysicalGapSeconds, 3),
    physicalCatchKm: catchKm,
    physicalCatchPct: catchKm === null ? null : round(catchKm / distanceKm, 6),
    breakawaySurvived,
    finalFrontGroupSize,
    finalGroupCount: distinctGroups.size,
    sameTimeShare: classification.length === 0 ? 0 : round(finalFrontGroupSize / classification.length, 6),
  }
}

function finaleSimilarity(template: TemplateLike, summary: RoadScenarioPrecalculationSummaryV2): number {
  const finale = template.finale.type
  if (finale === 'open') return 0.78
  if (finale === 'breakaway_finish') return summary.breakawaySurvived ? 1 : 0.28
  if (finale === 'solo_finish') return summary.finalFrontGroupSize <= 1 ? 1 : clamp(1 - (summary.finalFrontGroupSize - 1) / 12)
  if (finale === 'large_bunch_sprint') return clamp((summary.sameTimeShare - 0.35) / 0.55)
  if (finale === 'chaotic_bunch_sprint' || finale === 'reduced_sprint' || finale === 'large_reduced_sprint') {
    return summary.finalFrontGroupSize >= 20
      ? clamp(1 - Math.abs(summary.sameTimeShare - 0.58) / 0.58)
      : clamp(summary.finalFrontGroupSize / 20)
  }
  if (
    finale === 'small_reduced_sprint' ||
    finale === 'small_group_sprint' ||
    finale === 'puncheur_group' ||
    finale === 'gc_group' ||
    finale === 'gc_group_sprint' ||
    finale === 'summit_small_group'
  ) {
    return rangeSimilarity(summary.finalFrontGroupSize, template.finale.expectedFrontGroup, 28)
  }
  if (finale === 'multi_group' || finale === 'multi_group_gc') {
    return clamp((summary.finalGroupCount - 1) / 5)
  }
  return 0.65
}

function templateSimilarity(
  template: TemplateLike,
  summary: RoadScenarioPrecalculationSummaryV2,
): number {
  const primaryBreak = template.breakaways[0]
  const breakSizeScore = primaryBreak
    ? rangeSimilarity(summary.openingBreakSize, primaryBreak.preferredSize, 8)
    : summary.openingBreakSize === 0 ? 1 : 0.35
  const formationScore = primaryBreak && summary.openingAttackPct !== null
    ? rangeSimilarity(summary.openingAttackPct, primaryBreak.formationWindowPct, 0.18)
    : summary.openingAttackPct === null ? 0.55 : 0.7
  const gapScore = primaryBreak
    ? rangeSimilarity(summary.maximumPhysicalGapSeconds, primaryBreak.targetPeakGapSec, 360)
    : summary.maximumPhysicalGapSeconds <= 30 ? 1 : 0.45

  let catchScore = 0.7
  if (primaryBreak?.catchKmRemaining && summary.physicalCatchKm !== null) {
    const expectedCatchKm = summary.distanceKm - midpoint(primaryBreak.catchKmRemaining)
    catchScore = clamp(1 - Math.abs(summary.physicalCatchKm - expectedCatchKm) / Math.max(25, summary.distanceKm * 0.35))
  } else if (template.family === 'breakaway') {
    catchScore = summary.breakawaySurvived ? 1 : 0.32
  } else if (summary.physicalCatchKm !== null) {
    catchScore = 0.82
  }

  const expectedFront = template.finale.expectedFrontGroup ?? template.fragmentation.targetFrontGroup
  const groupScore = rangeSimilarity(summary.finalFrontGroupSize, expectedFront, Math.max(18, summary.starterCount * 0.35))
  const finaleScore = finaleSimilarity(template, summary)

  return round(
    breakSizeScore * 0.24 +
    formationScore * 0.10 +
    gapScore * 0.20 +
    catchScore * 0.16 +
    groupScore * 0.20 +
    finaleScore * 0.10,
    6,
  )
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
    targetPeakGapSec: Math.round(between(seed, `break:${index}:gap`, directive.targetPeakGapSec)),
    formationPct: round(between(seed, `break:${index}:formation`, directive.formationWindowPct), 4),
    peakPct: round(between(seed, `break:${index}:peak`, directive.peakWindowPct), 4),
    chaseStartPct: directive.chaseStartWindowPct
      ? round(between(seed, `break:${index}:chase`, directive.chaseStartWindowPct), 4)
      : null,
    catchKmRemaining: directive.catchKmRemaining
      ? round(between(seed, `break:${index}:catch`, directive.catchKmRemaining), 2)
      : null,
    survivalTargetSec: directive.survivalTargetSec
      ? Math.round(between(seed, `break:${index}:survival`, directive.survivalTargetSec))
      : null,
  }))
  const phaseBehavior = ([1, 2, 3, 4] as const).map((phase) => {
    const directive = template.phases[`phase${phase}`]
    return {
      phase,
      pressure: String(directive?.pressure ?? directive?.selectionPressure ?? 'medium'),
      controlTeams: round(midpoint(directive?.controlTeams), 2),
      chaseTeams: round(midpoint(directive?.chaseTeams), 2),
    }
  })
  return {
    breakaways,
    fragmentationPressure: round(between(seed, 'fragmentation:pressure', template.fragmentation.pressure), 4),
    targetFrontGroup: template.fragmentation.targetFrontGroup
      ? integerBetween(seed, 'fragmentation:front', template.fragmentation.targetFrontGroup)
      : null,
    secondaryGapSec: template.fragmentation.secondaryGapSec
      ? Math.round(between(seed, 'fragmentation:gap', template.fragmentation.secondaryGapSec))
      : null,
    allowRegroup: template.fragmentation.allowRegroup,
    finaleType: template.finale.type,
    phaseBehavior,
  }
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

  const candidates = catalog.templates.map((template) => {
    const similarity = templateSimilarity(template, summary)
    const exactUsed = usedSameRace.has(template.id) || usedSameDay.has(template.id)
    const familyPenalty = latestRaceFamily === template.family ? 0.05 : 0
    return {
      template,
      similarity,
      exactUsed,
      familyPenalty,
      score: round(similarity - familyPenalty, 6),
    }
  })
  const unused = candidates.filter((candidate) => !candidate.exactUsed)
  const pool = unused.length > 0 ? unused : candidates
  const selected = [...pool].sort((left, right) =>
    right.score - left.score ||
    right.similarity - left.similarity ||
    left.template.id.localeCompare(right.template.id),
  )[0]
  if (!selected) return { input, audit: null, summary }

  const seed = `road-precalc-v2:${input.race.raceId}:${input.stage.stageId}:${catalog.catalogVersion}`
  const generatedParameters = instantiateTemplate(selected.template, seed)
  const candidateScores = candidates
    .map((candidate) => ({
      templateId: candidate.template.id,
      family: candidate.template.family,
      precalculationSimilarity: candidate.similarity,
      repetitionPenalty: candidate.familyPenalty === 0 ? 0 : -candidate.familyPenalty * 100,
      finalScore: round(candidate.score * 100, 4),
      excluded: unused.length > 0 && candidate.exactUsed,
      exclusionReason: unused.length > 0 && candidate.exactUsed
        ? 'exact_template_already_used_same_race_or_day'
        : null,
    }))
    .sort((left, right) => right.finalScore - left.finalScore || left.templateId.localeCompare(right.templateId))

  const audit: JsonRecord = {
    contract: catalog.contract,
    scenarioType: input.stage.terrainType,
    catalogVersion: catalog.catalogVersion,
    templateId: selected.template.id,
    templateVersion: selected.template.version,
    templateLabel: selected.template.label,
    templateFamily: selected.template.family,
    similarityGroup: selected.template.similarityGroup,
    selectionSeed: seed,
    compatibilityScore: round(selected.similarity * 100, 4),
    gameDate,
    selectionModel: ROAD_SCENARIO_PRECALCULATION_VERSION,
    preCalculationSummary: summary,
    contextSnapshot: {
      modelVersion: ROAD_SCENARIO_PRECALCULATION_VERSION,
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
      contract: 'road_scenario_runtime_application_v2',
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
