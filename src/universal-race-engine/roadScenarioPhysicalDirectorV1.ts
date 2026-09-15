export const ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION =
  'road_scenario_physical_director_v2' as const
export const ROAD_RACE_DIRECTOR_RUNTIME_VERSION =
  'road_race_director_v2_runtime' as const

type JsonRecord = Record<string, unknown>
type NumericRange = readonly [number, number]

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

interface InstantiatedBreakDirectiveV2 {
  readonly generation: number
  readonly formationPct: number
  readonly formationWindowPct: NumericRange | null
  readonly peakPct: number
  readonly peakWindowPct: NumericRange | null
  readonly chaseStartPct: number | null
  readonly chaseStartWindowPct: NumericRange | null
  readonly targetPeakGapSec: number
  readonly targetPeakGapRangeSec: NumericRange | null
  readonly catchKmRemaining: number | null
  readonly catchKmRemainingRange: NumericRange | null
  readonly survivalTargetSec: number | null
  readonly survivalTargetRangeSec: NumericRange | null
}

interface GapEnvelopeV2 {
  readonly lower: number
  readonly upper: number
  readonly center: number
  readonly storyStrength: number
  readonly centerPullStrength: number
  readonly chaseActive: boolean
  readonly catchExpected: boolean
  readonly survivalExpected: boolean
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

function numericRange(value: unknown): NumericRange | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const first = Number(value[0])
  const second = Number(value[1])
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  return [first, second]
}

function midpoint(range: NumericRange | null, fallback: number): number {
  if (!range) return fallback
  return (range[0] + range[1]) / 2
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
  details: { adjusted: boolean; kmFromStart?: number; reason?: string } = { adjusted: false },
): void {
  const audit = actualScenarioAudit(input)
  if (!audit) return
  const existing = object(audit.runtimeApplicationProof)
  const next: JsonRecord = {
    ...existing,
    contract: ROAD_RACE_DIRECTOR_RUNTIME_VERSION,
    finalEngineSawTemplate: true,
    physicalDirectorVersion: ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION,
    raceDirectorRuntimeVersion: ROAD_RACE_DIRECTOR_RUNTIME_VERSION,
  }
  if (event === 'gap_guidance') {
    next.gapGuidanceCalls = Math.max(0, Math.trunc(finite(existing.gapGuidanceCalls, 0))) + 1
    if (details.adjusted) {
      next.gapAdjustments = Math.max(0, Math.trunc(finite(existing.gapAdjustments, 0))) + 1
    }
    if (details.kmFromStart !== undefined) next.lastGuidedKm = round(details.kmFromStart, 3)
    if (details.reason) next.lastGapAdjustmentReason = details.reason
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

function instantiatedBreaks(
  audit: RoadScenarioPhysicalAuditV1,
): readonly InstantiatedBreakDirectiveV2[] {
  return array(audit.generatedParameters.breakaways)
    .map((value) => object(value))
    .map((row) => ({
      generation: Math.max(1, Math.trunc(finite(row.generation, 1))),
      formationPct: clamp(finite(row.formationPct, midpoint(numericRange(row.formationWindowPct), 0)), 0, 1),
      formationWindowPct: numericRange(row.formationWindowPct),
      peakPct: clamp(finite(row.peakPct, midpoint(numericRange(row.peakWindowPct), 0.25)), 0, 1),
      peakWindowPct: numericRange(row.peakWindowPct),
      chaseStartPct: row.chaseStartPct === null || row.chaseStartPct === undefined
        ? null
        : clamp(finite(row.chaseStartPct, 0.62), 0, 1),
      chaseStartWindowPct: numericRange(row.chaseStartWindowPct),
      targetPeakGapSec: Math.max(0, finite(row.targetPeakGapSec, midpoint(numericRange(row.targetPeakGapRangeSec), 0))),
      targetPeakGapRangeSec: numericRange(row.targetPeakGapRangeSec),
      catchKmRemaining: row.catchKmRemaining === null || row.catchKmRemaining === undefined
        ? null
        : Math.max(0, finite(row.catchKmRemaining, 0)),
      catchKmRemainingRange: numericRange(row.catchKmRemainingRange),
      survivalTargetSec: row.survivalTargetSec === null || row.survivalTargetSec === undefined
        ? null
        : Math.max(0, finite(row.survivalTargetSec, 0)),
      survivalTargetRangeSec: numericRange(row.survivalTargetRangeSec),
    }))
    .filter((row) => row.targetPeakGapSec > 0)
    .sort((left, right) => left.formationPct - right.formationPct || left.generation - right.generation)
}

function directorSettings(audit: RoadScenarioPhysicalAuditV1): {
  storyStrength: number
  centerPullStrength: number
  variationFactor: number
} {
  const settings = object(audit.generatedParameters.directorV2)
  return {
    storyStrength: clamp(finite(settings.storyStrength, 0.78), 0.45, 0.95),
    centerPullStrength: clamp(finite(settings.centerPullStrength, 0.25), 0.08, 0.42),
    variationFactor: clamp(finite(settings.variationFactor, 1), 0.82, 1.18),
  }
}

function directiveEndProgress(
  input: RoadScenarioPhysicalInputV1,
  directives: readonly InstantiatedBreakDirectiveV2[],
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

function phaseNumber(input: RoadScenarioPhysicalInputV1, kmFromStart: number): 1 | 2 | 3 | 4 {
  const distance = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(kmFromStart / distance, 0, 1)
  if (progress < 0.25) return 1
  if (progress < 0.5) return 2
  if (progress < 0.75) return 3
  return 4
}

function phaseBehavior(
  audit: RoadScenarioPhysicalAuditV1,
  phase: 1 | 2 | 3 | 4,
): JsonRecord {
  return array(audit.generatedParameters.phaseBehavior)
    .map((entry) => object(entry))
    .find((entry) => Math.trunc(finite(entry.phase, 0)) === phase) ?? {}
}

function pressureWord(value: unknown): number {
  const normalized = text(value).toLowerCase()
  if (['very_high', 'very high', 'extreme', 'maximum'].includes(normalized)) return 1
  if (['high', 'strong', 'hard'].includes(normalized)) return 0.82
  if (['medium', 'normal', 'moderate'].includes(normalized)) return 0.54
  if (['low', 'light', 'soft'].includes(normalized)) return 0.28
  if (['very_low', 'very low', 'minimal'].includes(normalized)) return 0.12
  return 0.5
}

function templateChasePressure(
  audit: RoadScenarioPhysicalAuditV1,
  input: RoadScenarioPhysicalInputV1,
  kmFromStart: number,
): number {
  const phase = phaseNumber(input, kmFromStart)
  const behavior = phaseBehavior(audit, phase)
  const chaseTeams = Math.max(0, finite(behavior.chaseTeams, 0))
  const controlTeams = Math.max(0, finite(behavior.controlTeams, 0))
  const declaredPressure = pressureWord(behavior.pressure)
  const teamPressure = clamp((chaseTeams * 0.18 + controlTeams * 0.08), 0, 1)
  return clamp(declaredPressure * 0.55 + teamPressure * 0.45, 0, 1)
}

function commandForPhase(commands: JsonRecord, phase: 1 | 2 | 3 | 4): string {
  return text(commands[`phase${phase}`]).toLowerCase()
}

function commandChasePressure(
  input: RoadScenarioPhysicalInputV1,
  kmFromStart: number,
): number {
  const phase = phaseNumber(input, kmFromStart)
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

function scenarioGapEnvelopeV2(
  input: RoadScenarioPhysicalInputV1,
  progressFraction: number,
): GapEnvelopeV2 | null {
  const audit = getRoadScenarioPhysicalAuditV1(input)
  if (!audit) return null
  const directives = instantiatedBreaks(audit)
  if (directives.length === 0) return null
  const settings = directorSettings(audit)
  const progress = clamp(progressFraction, 0, 1)
  const finaleType = text(audit.generatedParameters.finaleType)

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
    const catchExpected = directive.catchKmRemaining !== null
    const survivalExpected =
      directive.survivalTargetSec !== null ||
      finaleType === 'breakaway_finish' ||
      (!catchExpected && audit.templateFamily === 'breakaway')
    const chaseStart = clamp(
      directive.chaseStartPct ??
        (catchExpected ? Math.max(peakProgress, endProgress - 0.20) : Math.max(peakProgress, 0.72)),
      peakProgress,
      endProgress,
    )
    const targetRange = directive.targetPeakGapRangeSec
    const targetGap = Math.max(18, directive.targetPeakGapSec * settings.variationFactor)
    const startingGap = Math.min(55, Math.max(8, targetGap * 0.07))
    let center = targetGap
    let chaseActive = false

    if (progress <= peakProgress) {
      const fraction = clamp(
        (progress - directive.formationPct) /
          Math.max(0.000001, peakProgress - directive.formationPct),
        0,
        1,
      )
      const eased = fraction * fraction * (3 - 2 * fraction)
      center = startingGap + (targetGap - startingGap) * eased
    } else if (progress > chaseStart) {
      chaseActive = true
      const endTarget = survivalExpected
        ? Math.max(8, directive.survivalTargetSec ?? Math.max(18, targetGap * 0.18))
        : 0
      const closureFraction = clamp(
        (progress - chaseStart) / Math.max(0.000001, endProgress - chaseStart),
        0,
        1,
      )
      const eased = closureFraction * closureFraction * (3 - 2 * closureFraction)
      center = targetGap + (endTarget - targetGap) * eased
    }

    const rangeLow = targetRange ? Math.min(targetRange[0], targetRange[1]) : targetGap * 0.62
    const rangeHigh = targetRange ? Math.max(targetRange[0], targetRange[1]) : targetGap * 1.42
    const widthScale = chaseActive ? 0.24 : 0.34
    const naturalHalfWidth = Math.max(18, center * widthScale)
    let lower = Math.max(0, center - naturalHalfWidth)
    let upper = Math.max(18, center + naturalHalfWidth)

    if (!chaseActive && progress >= peakProgress) {
      lower = Math.max(lower, rangeLow * 0.72)
      upper = Math.min(Math.max(upper, center + 18), rangeHigh * 1.18)
    }
    if (catchExpected && progress > chaseStart) {
      const catchProgress = endProgress
      const nearCatch = clamp(
        (progress - chaseStart) / Math.max(0.000001, catchProgress - chaseStart),
        0,
        1,
      )
      upper = Math.min(upper, Math.max(10, center + 45 * (1 - nearCatch)))
      lower = Math.min(lower, center)
    }

    return {
      center: round(Math.max(0, center), 6),
      lower: round(Math.max(0, lower), 6),
      upper: round(Math.max(Math.max(0, lower) + 4, upper), 6),
      storyStrength: settings.storyStrength,
      centerPullStrength: settings.centerPullStrength,
      chaseActive,
      catchExpected,
      survivalExpected,
    }
  }
  return null
}

/**
 * Race Director V2 macro guidance.
 *
 * The core engine still decides who attacks, who belongs to the break, rider
 * speeds, energy, terrain response and the sporting result. The selected
 * template supplies only a flexible race-story envelope: how much freedom the
 * break tends to receive, when peloton control rises, and whether the gap tends
 * to close or survive. Existing rider commands are never replaced.
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

  // A physically completed catch stays completed. Director V2 never resurrects
  // an already closed break just because the template preferred a larger gap.
  if (current <= 0.5) return current

  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(finite(kmFromStart, 0) / distanceKm, 0, 1)
  const envelope = scenarioGapEnvelopeV2(input, progress)
  if (!envelope) return current

  const stepKm = clamp(finite(stepDistanceKm, 0.25), 0.25, 2.5)
  const userChase = commandChasePressure(input, kmFromStart)
  const templateChase = templateChasePressure(audit, input, kmFromStart)
  const combinedChase = clamp(userChase * 0.72 + templateChase * 0.46, 0, 1)
  let adjusted = current
  let reason = 'inside_story_envelope'

  if (current < envelope.lower) {
    const difference = envelope.lower - current
    const commandResistance = 1 - userChase * 0.82
    const templateResistance = envelope.chaseActive ? 0.52 : 1
    const maximumGrowth = stepKm * (8 + 8 * envelope.storyStrength) * Math.max(0.10, commandResistance)
    const requested = difference * (0.24 + envelope.storyStrength * 0.28) * commandResistance * templateResistance
    adjusted = current + Math.min(requested, maximumGrowth)
    reason = 'protect_break_story'
  } else if (current > envelope.upper) {
    const difference = current - envelope.upper
    const chaseBoost = 1 + combinedChase * 1.05 + (envelope.chaseActive ? 0.55 : 0)
    const maximumClosure = stepKm * (11 + 11 * envelope.storyStrength) * chaseBoost
    const requested = difference * (0.27 + envelope.storyStrength * 0.25) * chaseBoost
    adjusted = current - Math.min(requested, maximumClosure)
    reason = 'rein_in_excess_gap'
  } else {
    // Inside the allowed range the director applies only a gentle center pull.
    // This makes the selected template visible in the race flow without turning
    // the target into a fixed script.
    const difference = envelope.center - current
    const userOverride = difference > 0 ? 1 - userChase * 0.78 : 1
    const chaseMultiplier = difference < 0
      ? 1 + combinedChase * 0.55 + (envelope.chaseActive ? 0.30 : 0)
      : Math.max(0.16, userOverride)
    const requested = difference * envelope.centerPullStrength * envelope.storyStrength * chaseMultiplier
    const cap = stepKm * (difference < 0 ? 7.5 : 5.5)
    adjusted = current + clamp(requested, -cap, cap)
    reason = Math.abs(adjusted - current) > 0.000001 ? 'gentle_story_center_pull' : reason
  }

  if (envelope.catchExpected && envelope.chaseActive) {
    // The template may make a catch increasingly likely, but the state still has
    // to close physically. We never snap a positive gap directly to zero.
    adjusted = Math.max(0.51, adjusted)
  }

  adjusted = round(Math.max(0, adjusted), 6)
  if (Math.abs(adjusted - current) > 0.000001) {
    recordRuntimeApplication(input, 'gap_guidance', {
      adjusted: true,
      kmFromStart,
      reason,
    })
  }
  return adjusted
}

/**
 * Finale shaping remains deliberately secondary to the main race story. The
 * template supplies only fragmentation pressure; rider finish energy determines
 * which riders hold the stronger group. No exact survivor count is forced.
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
  const allowRegroup = parameters.allowRegroup === true
  const settings = directorSettings(audit)
  if (allowRegroup) pressure *= 0.68
  if (audit.templateFamily === 'breakaway') pressure *= 0.80
  pressure *= settings.variationFactor
  pressure = clamp(pressure, 0, 1)
  if (pressure < 0.30) return [...states]

  const groups = new Map<string, T[]>()
  states.forEach((state) => {
    const key = round(Math.max(0, state.finalGapSeconds), 1).toFixed(1)
    const group = groups.get(key) ?? []
    group.push(state)
    groups.set(key, group)
  })
  const largest = [...groups.values()]
    .sort((left, right) => right.length - left.length)[0] ?? []
  if (largest.length < 8) return [...states]

  const seedBias = (stableHash(`${audit.selectionSeed}:fragmentation-retention`) / 0xffffffff - 0.5) * 0.12
  const retentionFraction = clamp(0.91 - pressure * 0.48 + seedBias, 0.34, 0.94)
  const keepCount = Math.max(2, Math.min(largest.length, Math.ceil(largest.length * retentionFraction)))
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
  const secondaryGap = Math.max(6, configuredGap * (0.52 + pressure * 0.34))
  const baseGap = Math.min(...largest.map((state) => Math.max(0, state.finalGapSeconds)))
  const firstBandSize = Math.max(1, Math.ceil(detached.length * 0.62))

  const result = states.map((state) => {
    if (!largest.some((candidate) => candidate.riderId === state.riderId)) return state
    if (retainedIds.has(state.riderId)) return state
    const rank = detachedRank.get(state.riderId) ?? 0
    const bandMultiplier = rank < firstBandSize ? 0.62 : 1
    const gap = round(baseGap + secondaryGap * bandMultiplier, 6)
    const energyPenalty = rank < firstBandSize
      ? 0.30 + pressure * 0.82
      : 0.62 + pressure * 1.35
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
