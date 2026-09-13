export const ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION =
  'road_scenario_physical_director_v1' as const

type JsonRecord = Record<string, unknown>

export interface RoadScenarioPhysicalInputV1 {
  readonly stage: {
    readonly distanceKm: number
    readonly terrainType: string
  }
  readonly stagePlans: readonly {
    readonly metadata?: Readonly<Record<string, unknown>>
  }[]
}

export interface RoadScenarioPhysicalAuditV1 extends JsonRecord {
  readonly scenarioType: string
  readonly templateId: string
  readonly templateFamily: string
  readonly selectionSeed: string
  readonly generatedParameters: JsonRecord
}

export interface RoadScenarioFragmentationStateV1 {
  readonly riderId: string
  readonly finalGapSeconds: number
  readonly finalGroupCode: string
  readonly energyAtFinish: number
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
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clamp(value: number, minimum: number, maximum: number): number {
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

function groupCodeForGap(gapSeconds: number): string {
  if (gapSeconds <= 0.5) return 'winning_group'
  if (gapSeconds <= 10) return 'front_chase_group'
  if (gapSeconds <= 60) return 'main_finish_group'
  return 'late_group'
}

export function getRoadScenarioPhysicalAuditV1(
  input: RoadScenarioPhysicalInputV1,
): RoadScenarioPhysicalAuditV1 | null {
  for (const plan of input.stagePlans) {
    const metadata = object(plan.metadata)
    const candidate =
      metadata.flatScenarioV1 ??
      metadata.hillyScenarioV1 ??
      metadata.mountainScenarioV1 ??
      metadata.cobbledScenarioV1
    const audit = object(candidate)
    const scenarioType = text(audit.scenarioType)
    const templateId = text(audit.templateId)
    const templateFamily = text(audit.templateFamily)
    const selectionSeed = text(audit.selectionSeed)
    if (
      ['flat', 'hilly', 'mountain', 'cobbled'].includes(scenarioType) &&
      templateId &&
      templateFamily &&
      selectionSeed
    ) {
      return {
        ...audit,
        scenarioType,
        templateId,
        templateFamily,
        selectionSeed,
        generatedParameters: object(audit.generatedParameters),
      }
    }
  }
  return null
}

interface InstantiatedBreakDirectiveV1 {
  readonly generation: number
  readonly formationPct: number
  readonly peakPct: number
  readonly chaseStartPct: number | null
  readonly targetPeakGapSec: number
  readonly catchKmRemaining: number | null
  readonly survivalTargetSec: number | null
}

function instantiatedBreaks(
  input: RoadScenarioPhysicalInputV1,
  audit: RoadScenarioPhysicalAuditV1,
): readonly InstantiatedBreakDirectiveV1[] {
  return array(audit.generatedParameters.breakaways)
    .map((value) => object(value))
    .map((row) => ({
      generation: Math.max(1, Math.trunc(finite(row.generation, 1))),
      formationPct: clamp(finite(row.formationPct, 0), 0, 1),
      peakPct: clamp(finite(row.peakPct, 0.25), 0, 1),
      chaseStartPct: row.chaseStartPct === null || row.chaseStartPct === undefined
        ? null
        : clamp(finite(row.chaseStartPct, 0.6), 0, 1),
      targetPeakGapSec: Math.max(0, finite(row.targetPeakGapSec, 0)),
      catchKmRemaining: row.catchKmRemaining === null || row.catchKmRemaining === undefined
        ? null
        : Math.max(0, finite(row.catchKmRemaining, 0)),
      survivalTargetSec: row.survivalTargetSec === null || row.survivalTargetSec === undefined
        ? null
        : Math.max(0, finite(row.survivalTargetSec, 0)),
    }))
    .filter((row) => row.targetPeakGapSec > 0)
    .sort((left, right) => left.formationPct - right.formationPct || left.generation - right.generation)
}

function directiveEndProgress(
  input: RoadScenarioPhysicalInputV1,
  directives: readonly InstantiatedBreakDirectiveV1[],
  index: number,
): number {
  const directive = directives[index]
  const next = directives[index + 1] ?? null
  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const catchProgress = directive.catchKmRemaining === null
    ? 1
    : clamp(1 - directive.catchKmRemaining / distanceKm, 0, 1)
  const nextFormationLimit = next
    ? clamp(next.formationPct - 0.02, directive.formationPct + 0.02, 1)
    : 1
  return clamp(
    Math.min(catchProgress, nextFormationLimit),
    directive.formationPct + 0.02,
    1,
  )
}

function scenarioGapTargetSeconds(
  input: RoadScenarioPhysicalInputV1,
  progressFraction: number,
): number | null {
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit) return null
  const directives = instantiatedBreaks(input, audit)
  if (directives.length === 0) return null

  const progress = clamp(progressFraction, 0, 1)
  let latestPastDirectiveIndex = -1

  for (let index = 0; index < directives.length; index += 1) {
    const directive = directives[index]
    if (progress < directive.formationPct) break
    latestPastDirectiveIndex = index
    const endProgress = directiveEndProgress(input, directives, index)
    if (progress > endProgress + 0.000001) continue

    const peakProgress = clamp(
      Math.max(directive.formationPct + 0.01, directive.peakPct),
      directive.formationPct + 0.01,
      endProgress,
    )
    const chaseStart = clamp(
      directive.chaseStartPct ?? Math.max(peakProgress, endProgress - 0.18),
      peakProgress,
      endProgress,
    )
    const startingGap = Math.min(60, Math.max(18, directive.targetPeakGapSec * 0.12))

    if (progress <= peakProgress) {
      const fraction = clamp(
        (progress - directive.formationPct) /
          Math.max(0.000001, peakProgress - directive.formationPct),
        0,
        1,
      )
      return round(
        startingGap + (directive.targetPeakGapSec - startingGap) * fraction,
        6,
      )
    }

    if (progress <= chaseStart) return round(directive.targetPeakGapSec, 6)

    const endTarget =
      endProgress >= 0.999 && directive.survivalTargetSec !== null
        ? directive.survivalTargetSec
        : 0
    const closureFraction = clamp(
      (progress - chaseStart) / Math.max(0.000001, endProgress - chaseStart),
      0,
      1,
    )
    const easedClosure = closureFraction * closureFraction * (3 - 2 * closureFraction)
    return round(
      directive.targetPeakGapSec +
        (endTarget - directive.targetPeakGapSec) * easedClosure,
      6,
    )
  }

  if (latestPastDirectiveIndex >= 0) return 0
  return null
}

/**
 * Soft physical director: the template supplies a target trajectory, while the
 * existing pace/energy/chase model still supplies the actual physical step.
 * The bounded correction cannot create an escape from zero and cannot teleport
 * the gap to the target in a single step.
 */
export function applyRoadScenarioGapGuidanceV1(
  input: RoadScenarioPhysicalInputV1,
  currentGapSeconds: number,
  kmFromStart: number,
  stepDistanceKm: number,
): number {
  const current = Math.max(0, finite(currentGapSeconds, 0))
  if (current <= 0.5) return current

  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(finite(kmFromStart, 0) / distanceKm, 0, 1)
  const target = scenarioGapTargetSeconds(input, progress)
  if (target === null) return current

  // Coarse Phase 3 checkpoints can span a large part of the stage. Cap the
  // physical correction distance so scenario guidance remains gradual rather
  // than effectively teleporting a gap toward its target in one engine step.
  const stepKm = clamp(finite(stepDistanceKm, 0.25), 0.25, 2.5)
  const difference = target - current
  if (Math.abs(difference) <= 0.000001) return round(current, 6)

  const audit = getRoadScenarioPhysicalAuditV1(input)
  const family = audit?.templateFamily ?? ''
  const survivalFamily = family === 'breakaway'
  const responsiveness = survivalFamily ? 0.46 : 0.36
  const maximumGrowth = stepKm * (survivalFamily ? 11 : 9)
  const maximumClosure = stepKm * 16
  const requestedAdjustment = difference * responsiveness
  const boundedAdjustment = requestedAdjustment >= 0
    ? Math.min(requestedAdjustment, maximumGrowth)
    : Math.max(requestedAdjustment, -maximumClosure)

  return round(Math.max(0, current + boundedAdjustment), 6)
}

/**
 * Scenario fragmentation acts on the largest existing physical finish group,
 * not necessarily the race-leading group. That preserves a surviving breakaway
 * while still allowing the peloton behind it to split. Selection is driven by
 * already-calculated finish energy; the template changes macro pressure only.
 */
export function applyRoadScenarioFinishFragmentationV1<
  T extends RoadScenarioFragmentationStateV1,
>(
  input: RoadScenarioPhysicalInputV1,
  states: readonly T[],
): T[] {
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit || states.length < 3 || audit.templateFamily === 'breakaway') {
    return [...states]
  }

  const parameters = object(audit.generatedParameters)
  const pressure = clamp(finite(parameters.fragmentationPressure, 0), 0, 1)
  const requestedTarget = Math.trunc(finite(parameters.targetFrontGroup, 0))
  if (pressure < 0.18 || requestedTarget < 2) return [...states]

  const groups = new Map<string, T[]>()
  states.forEach((state) => {
    const key = round(Math.max(0, state.finalGapSeconds), 1).toFixed(1)
    const group = groups.get(key) ?? []
    group.push(state)
    groups.set(key, group)
  })
  const largest = [...groups.values()]
    .sort((left, right) => right.length - left.length)[0] ?? []
  if (largest.length <= requestedTarget || largest.length < 8) return [...states]

  const pressureRetention = Math.ceil(largest.length * Math.max(0.08, 1 - pressure))
  const keepCount = clamp(
    Math.max(requestedTarget, pressureRetention),
    2,
    largest.length,
  )
  if (keepCount >= largest.length) return [...states]

  const selected = [...largest].sort((left, right) =>
    right.energyAtFinish - left.energyAtFinish ||
    stableHash(`${audit.selectionSeed}:${left.riderId}`) -
      stableHash(`${audit.selectionSeed}:${right.riderId}`),
  )
  const retainedIds = new Set(selected.slice(0, keepCount).map((state) => state.riderId))
  const detached = selected.slice(keepCount)
  const detachedRank = new Map(detached.map((state, index) => [state.riderId, index] as const))
  const secondaryGap = Math.max(
    8,
    finite(parameters.secondaryGapSec, 12 + pressure * 70),
  )
  const baseGap = Math.min(...largest.map((state) => Math.max(0, state.finalGapSeconds)))
  const firstBandSize = Math.max(1, Math.ceil(detached.length * 0.62))

  return states.map((state) => {
    if (!largest.some((candidate) => candidate.riderId === state.riderId)) return state
    if (retainedIds.has(state.riderId)) return state
    const rank = detachedRank.get(state.riderId) ?? 0
    const bandMultiplier = rank < firstBandSize ? 0.65 : 1
    const gap = round(baseGap + secondaryGap * bandMultiplier, 6)
    const energyPenalty = rank < firstBandSize
      ? 0.5 + pressure * 1.2
      : 1 + pressure * 2
    return {
      ...state,
      finalGapSeconds: gap,
      finalGroupCode: groupCodeForGap(gap),
      energyAtFinish: round(Math.max(0, state.energyAtFinish - energyPenalty), 6),
    }
  })
}
