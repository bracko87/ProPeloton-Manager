export const ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION =
  'road_scenario_physical_director_v2' as const

type JsonRecord = Record<string, unknown>

export interface RoadScenarioPhysicalInputV1 {
  readonly stage: {
    readonly distanceKm: number
    readonly terrainType: string
  }
  readonly stagePlans: readonly {
    readonly metadata?: Readonly<Record<string, unknown>>
    readonly riders?: readonly {
      readonly commands?: Readonly<Record<string, unknown>>
    }[]
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

const ROAD_SCENARIO_METADATA_KEYS = [
  'flatScenarioV1',
  'hillyScenarioV1',
  'mountainScenarioV1',
  'cobbledScenarioV1',
] as const

function actualScenarioAudit(input: RoadScenarioPhysicalInputV1): JsonRecord | null {
  for (const plan of input.stagePlans) {
    const metadata = object(plan.metadata)
    for (const key of ROAD_SCENARIO_METADATA_KEYS) {
      const audit = object(metadata[key])
      if (text(audit.templateId) && text(audit.templateFamily) && text(audit.scenarioType)) {
        return audit
      }
    }
  }
  return null
}

function recordRuntimeApplication(
  input: RoadScenarioPhysicalInputV1,
  event: 'gap_guidance' | 'fragmentation',
  details: { adjusted: boolean; kmFromStart?: number } = { adjusted: false },
): void {
  const audit = actualScenarioAudit(input)
  if (!audit) return
  const existing = object(audit.runtimeApplicationProof)
  const next: JsonRecord = {
    ...existing,
    contract: 'road_scenario_runtime_application_v2',
    finalEngineSawTemplate: true,
    physicalDirectorVersion: ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION,
  }
  if (event === 'gap_guidance') {
    next.gapGuidanceCalls = Math.max(0, Math.trunc(finite(existing.gapGuidanceCalls, 0))) + 1
    if (details.adjusted) {
      next.gapAdjustments = Math.max(0, Math.trunc(finite(existing.gapAdjustments, 0))) + 1
    }
    if (details.kmFromStart !== undefined) next.lastGuidedKm = round(details.kmFromStart, 3)
  } else {
    next.fragmentationCalls = Math.max(0, Math.trunc(finite(existing.fragmentationCalls, 0))) + 1
    if (details.adjusted) {
      next.fragmentationAdjustments = Math.max(0, Math.trunc(finite(existing.fragmentationAdjustments, 0))) + 1
    }
  }
  audit.runtimeApplicationProof = next
}

export function getRoadScenarioPhysicalAuditV1(
  input: RoadScenarioPhysicalInputV1,
): RoadScenarioPhysicalAuditV1 | null {
  const audit = actualScenarioAudit(input)
  if (!audit) return null
  const scenarioType = text(audit.scenarioType)
  const templateId = text(audit.templateId)
  const templateFamily = text(audit.templateFamily)
  const selectionSeed = text(audit.selectionSeed)
  if (
    !['flat', 'hilly', 'mountain', 'cobbled'].includes(scenarioType) ||
    !templateId ||
    !templateFamily ||
    !selectionSeed
  ) {
    return null
  }
  return {
    ...audit,
    scenarioType,
    templateId,
    templateFamily,
    selectionSeed,
    generatedParameters: object(audit.generatedParameters),
  }
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

interface GapEnvelopeV2 {
  readonly lower: number
  readonly upper: number
  readonly center: number
  readonly chaseActive: boolean
}

function scenarioGapEnvelopeV2(
  input: RoadScenarioPhysicalInputV1,
  progressFraction: number,
): GapEnvelopeV2 | null {
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit) return null
  const directives = instantiatedBreaks(audit)
  if (directives.length === 0) return null

  const progress = clamp(progressFraction, 0, 1)
  for (let index = 0; index < directives.length; index += 1) {
    const directive = directives[index]
    if (progress < directive.formationPct) break
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
    const startingGap = Math.min(55, Math.max(10, directive.targetPeakGapSec * 0.08))
    let center = directive.targetPeakGapSec
    let chaseActive = false

    if (progress <= peakProgress) {
      const fraction = clamp(
        (progress - directive.formationPct) /
          Math.max(0.000001, peakProgress - directive.formationPct),
        0,
        1,
      )
      center = startingGap + (directive.targetPeakGapSec - startingGap) * fraction
    } else if (progress > chaseStart) {
      chaseActive = true
      const endTarget =
        endProgress >= 0.999 && directive.survivalTargetSec !== null
          ? directive.survivalTargetSec
          : 0
      const closureFraction = clamp(
        (progress - chaseStart) / Math.max(0.000001, endProgress - chaseStart),
        0,
        1,
      )
      const eased = closureFraction * closureFraction * (3 - 2 * closureFraction)
      center = directive.targetPeakGapSec + (endTarget - directive.targetPeakGapSec) * eased
    }

    const family = audit.templateFamily
    const lowerFactor = family === 'breakaway' ? 0.48 : family === 'controlled_sprint' ? 0.22 : 0.32
    const upperFactor = family === 'breakaway' ? 1.62 : family === 'controlled_sprint' ? 1.32 : 1.46
    const minimumLower = chaseActive ? 0 : Math.min(12, center * 0.2)
    return {
      center: round(Math.max(0, center), 6),
      lower: round(Math.max(minimumLower, center * lowerFactor), 6),
      upper: round(Math.max(18, center * upperFactor), 6),
      chaseActive,
    }
  }
  return null
}

function currentPhaseNumber(input: RoadScenarioPhysicalInputV1, kmFromStart: number): 1 | 2 | 3 | 4 {
  const distance = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(kmFromStart / distance, 0, 1)
  if (progress < 0.25) return 1
  if (progress < 0.5) return 2
  if (progress < 0.75) return 3
  return 4
}

function commandForPhase(commands: JsonRecord, phase: 1 | 2 | 3 | 4): string {
  return text(commands[`phase${phase}`])
}

function commandChasePressure(
  input: RoadScenarioPhysicalInputV1,
  kmFromStart: number,
): number {
  const phase = currentPhaseNumber(input, kmFromStart)
  const chaseCommands = new Set([
    'chase',
    'chase_breakaway',
    'control_race',
    'control_tempo',
  ])
  let total = 0
  let chase = 0
  input.stagePlans.forEach((plan) => {
    ;(plan.riders ?? []).forEach((rider) => {
      const command = commandForPhase(object(rider.commands), phase)
      if (!command) return
      total += 1
      if (chaseCommands.has(command)) chase += 1
    })
  })
  if (total === 0) return 0
  return clamp((chase / total) * 3.25, 0, 1)
}

/**
 * Flexible peloton director.
 *
 * The engine still creates attacks, bridges and breakaway membership from the
 * real rider commands and rider physics. The template only supplies a broad gap
 * envelope. If the engine is already inside that envelope, nothing is changed.
 * Strong chase/control commands weaken template protection and therefore remain
 * capable of overriding the scenario story.
 */
export function applyRoadScenarioGapGuidanceV1(
  input: RoadScenarioPhysicalInputV1,
  currentGapSeconds: number,
  kmFromStart: number,
  stepDistanceKm: number,
): number {
  const current = Math.max(0, finite(currentGapSeconds, 0))
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit) return current
  recordRuntimeApplication(input, 'gap_guidance', { adjusted: false, kmFromStart })
  if (current <= 0.5) return current

  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(finite(kmFromStart, 0) / distanceKm, 0, 1)
  const envelope = scenarioGapEnvelopeV2(input, progress)
  if (!envelope) return current

  const stepKm = clamp(finite(stepDistanceKm, 0.25), 0.25, 2.5)
  const chasePressure = commandChasePressure(input, kmFromStart)
  let adjusted = current

  if (current < envelope.lower) {
    const difference = envelope.lower - current
    const familyBoost = audit.templateFamily === 'breakaway' ? 1.18 : 1
    const commandResistance = 1 - chasePressure * 0.72
    const maximumGrowth = stepKm * 9.5 * familyBoost * Math.max(0.2, commandResistance)
    const requested = difference * 0.34 * familyBoost * Math.max(0.25, commandResistance)
    adjusted = current + Math.min(requested, maximumGrowth)
  } else if (current > envelope.upper) {
    const difference = current - envelope.upper
    const chaseBoost = 1 + chasePressure * 0.9 + (envelope.chaseActive ? 0.3 : 0)
    const maximumClosure = stepKm * 14 * chaseBoost
    const requested = difference * 0.32 * chaseBoost
    adjusted = current - Math.min(requested, maximumClosure)
  }

  adjusted = round(Math.max(0, adjusted), 6)
  if (Math.abs(adjusted - current) > 0.000001) {
    recordRuntimeApplication(input, 'gap_guidance', { adjusted: true, kmFromStart })
  }
  return adjusted
}

/**
 * Flexible finish fragmentation. The template biases the size of an already
 * existing physical group but no longer forces an exact target group size.
 * Finish energy continues to decide who remains in the stronger group.
 */
export function applyRoadScenarioFinishFragmentationV1<
  T extends RoadScenarioFragmentationStateV1,
>(
  input: RoadScenarioPhysicalInputV1,
  states: readonly T[],
): T[] {
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit || states.length < 3) return [...states]
  recordRuntimeApplication(input, 'fragmentation', { adjusted: false })

  const parameters = object(audit.generatedParameters)
  let pressure = clamp(finite(parameters.fragmentationPressure, 0), 0, 1)
  const requestedTarget = Math.trunc(finite(parameters.targetFrontGroup, 0))
  const allowRegroup = parameters.allowRegroup === true
  if (allowRegroup) pressure *= 0.72
  if (audit.templateFamily === 'breakaway') pressure *= 0.78
  if (pressure < 0.28 || requestedTarget < 2) return [...states]

  const groups = new Map<string, T[]>()
  states.forEach((state) => {
    const key = round(Math.max(0, state.finalGapSeconds), 1).toFixed(1)
    const group = groups.get(key) ?? []
    group.push(state)
    groups.set(key, group)
  })
  const largest = [...groups.values()]
    .sort((left, right) => right.length - left.length)[0] ?? []
  if (largest.length < 8 || largest.length <= requestedTarget) return [...states]

  const blend = clamp(0.20 + pressure * 0.46, 0.20, 0.68)
  const softTarget = Math.round(largest.length * (1 - blend) + requestedTarget * blend)
  const naturalRetention = Math.ceil(largest.length * Math.max(0.30, 1 - pressure * 0.58))
  const keepCount = clamp(
    Math.max(softTarget, naturalRetention),
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
  const configuredGap = finite(parameters.secondaryGapSec, 12 + pressure * 70)
  const secondaryGap = Math.max(6, configuredGap * (0.58 + pressure * 0.30))
  const baseGap = Math.min(...largest.map((state) => Math.max(0, state.finalGapSeconds)))
  const firstBandSize = Math.max(1, Math.ceil(detached.length * 0.62))

  const result = states.map((state) => {
    if (!largest.some((candidate) => candidate.riderId === state.riderId)) return state
    if (retainedIds.has(state.riderId)) return state
    const rank = detachedRank.get(state.riderId) ?? 0
    const bandMultiplier = rank < firstBandSize ? 0.62 : 1
    const gap = round(baseGap + secondaryGap * bandMultiplier, 6)
    const energyPenalty = rank < firstBandSize
      ? 0.35 + pressure * 0.9
      : 0.7 + pressure * 1.5
    return {
      ...state,
      finalGapSeconds: gap,
      finalGroupCode: groupCodeForGap(gap),
      energyAtFinish: round(Math.max(0, state.energyAtFinish - energyPenalty), 6),
    }
  })
  recordRuntimeApplication(input, 'fragmentation', { adjusted: true })
  return result
}
