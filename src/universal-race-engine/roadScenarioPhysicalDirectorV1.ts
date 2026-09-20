export const ROAD_SCENARIO_PHYSICAL_DIRECTOR_VERSION =
  'road_scenario_physical_director_v2_2' as const
export const ROAD_RACE_DIRECTOR_RUNTIME_VERSION =
  'road_race_director_v2_2_runtime' as const

type JsonRecord = Record<string, unknown>
type NumericRange = readonly [number, number]
type GenerationLifecycle =
  | 'waiting'
  | 'forming'
  | 'established'
  | 'free'
  | 'chase'
  | 'caught'
  | 'survived'
  | 'closed'

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
  readonly generation: number
  readonly formationStartProgress: number
  readonly formationProgress: number
  readonly peakProgress: number
  readonly chaseStartProgress: number
  readonly endProgress: number
  readonly catchWindowProgress: NumericRange | null
  readonly targetPeakGapRangeSec: NumericRange | null
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
  return [Math.min(first, second), Math.max(first, second)]
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
    // V2.2 treats the scenario as tactical guidance rather than an outcome
    // blueprint. Keep enough pull to create a recognizable race shape, but do
    // not drag a physically valid gap toward one generated target too strongly.
    centerPullStrength: clamp(finite(settings.centerPullStrength, 0.25) * 0.68, 0.06, 0.26),
    variationFactor: clamp(finite(settings.variationFactor, 1), 0.82, 1.18),
  }
}

function formationStartProgress(directive: InstantiatedBreakDirectiveV2): number {
  const windowStart = directive.formationWindowPct?.[0] ?? directive.formationPct
  return clamp(Math.min(windowStart, directive.formationPct), 0, directive.formationPct)
}

function catchWindowProgress(
  input: RoadScenarioPhysicalInputV1,
  directive: InstantiatedBreakDirectiveV2,
): NumericRange | null {
  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const remainingRange = directive.catchKmRemainingRange
  if (remainingRange) {
    return [
      clamp(1 - remainingRange[1] / distanceKm, 0, 1),
      clamp(1 - remainingRange[0] / distanceKm, 0, 1),
    ]
  }
  if (directive.catchKmRemaining === null) return null
  const center = clamp(1 - directive.catchKmRemaining / distanceKm, 0, 1)
  return [Math.max(0, center - 0.035), Math.min(1, center + 0.035)]
}

function directiveEndProgress(
  input: RoadScenarioPhysicalInputV1,
  directives: readonly InstantiatedBreakDirectiveV2[],
  index: number,
): number {
  const directive = directives[index]
  const next = directives[index + 1] ?? null
  const catchWindow = catchWindowProgress(input, directive)
  const catchProgress = catchWindow?.[1] ?? 1
  const nextFormationLimit = next
    ? clamp(formationStartProgress(next) - 0.01, directive.formationPct + 0.02, 1)
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
  let activeRiders = 0
  let chaseRiders = 0
  let chaseTeams = 0

  input.stagePlans.forEach((plan) => {
    let teamChaseRiders = 0
    ;(plan.riders ?? []).forEach((rider) => {
      const command = commandForPhase(object(rider.commands), phase)
      if (!command) return
      activeRiders += 1
      if (chaseCommands.has(command)) {
        chaseRiders += 1
        teamChaseRiders += 1
      }
    })
    if (teamChaseRiders > 0) chaseTeams += 1
  })

  if (activeRiders === 0 || chaseTeams === 0) return 0
  const teamShare = chaseTeams / Math.max(1, input.stagePlans.length)
  const riderShare = chaseRiders / activeRiders
  return clamp(teamShare * 2.35 + riderShare * 0.45, 0, 1)
}

function runtimeGenerationStates(audit: JsonRecord): JsonRecord {
  const proof = object(audit.runtimeApplicationProof)
  return object(proof.generationStates)
}

function generationIsClosed(input: RoadScenarioPhysicalInputV1, generation: number): boolean {
  const audit = actualScenarioAudit(input)
  if (!audit) return false
  const state = object(runtimeGenerationStates(audit)[String(generation)])
  return ['caught', 'closed'].includes(text(state.state))
}

function lifecycleForEnvelope(
  envelope: GapEnvelopeV2,
  progress: number,
): GenerationLifecycle {
  if (progress < envelope.formationProgress) return 'forming'
  if (progress < envelope.peakProgress) return 'established'
  if (progress < envelope.chaseStartProgress) return 'free'
  return 'chase'
}

function recordGenerationRuntime(
  input: RoadScenarioPhysicalInputV1,
  envelope: GapEnvelopeV2,
  currentGapSeconds: number,
  adjustedGapSeconds: number,
  kmFromStart: number,
  reason: string,
): void {
  const audit = actualScenarioAudit(input)
  if (!audit) return
  const proof = object(audit.runtimeApplicationProof)
  const generationStates = runtimeGenerationStates(audit)
  const key = String(envelope.generation)
  const existing = object(generationStates[key])
  const previousState = text(existing.state) as GenerationLifecycle
  const progress = clamp(kmFromStart / Math.max(1, finite(input.stage.distanceKm, 1)), 0, 1)
  const observedGap = Math.max(currentGapSeconds, adjustedGapSeconds)
  const hadLiveBreak = existing.firstSeenKm !== undefined || finite(existing.peakGapSeconds, 0) > 0.5
  let state: GenerationLifecycle = lifecycleForEnvelope(envelope, progress)

  if (['caught', 'closed'].includes(previousState)) {
    state = 'closed'
  } else if (observedGap <= 0.5 && hadLiveBreak) {
    state = 'caught'
  } else if (progress > envelope.endProgress && observedGap > 0.5) {
    state = 'survived'
  }

  const next: JsonRecord = {
    ...existing,
    generation: envelope.generation,
    state,
    calls: Math.max(0, Math.trunc(finite(existing.calls, 0))) + 1,
    lastSeenKm: round(kmFromStart, 3),
    lastGapSeconds: round(adjustedGapSeconds, 3),
    peakGapSeconds: round(Math.max(finite(existing.peakGapSeconds, 0), observedGap), 3),
    plannedFormationWindowPct: [envelope.formationStartProgress, envelope.formationProgress],
    plannedPeakGapRangeSec: envelope.targetPeakGapRangeSec,
    plannedCatchWindowProgress: envelope.catchWindowProgress,
    lastDirectorReason: reason,
  }
  if (observedGap > 0.5 && existing.firstSeenKm === undefined) {
    next.firstSeenKm = round(kmFromStart, 3)
  }
  if (state === 'caught' && existing.catchKm === undefined) {
    next.catchKm = round(kmFromStart, 3)
    next.prematureCatch = envelope.catchWindowProgress
      ? progress < envelope.catchWindowProgress[0]
      : false
  }
  generationStates[key] = next
  proof.generationStates = generationStates
  audit.runtimeApplicationProof = proof
}

function scenarioGapEnvelopeV2(
  input: RoadScenarioPhysicalInputV1,
  progressFraction: number,
  includeClosed = false,
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
    const configuredFormationStart = formationStartProgress(directive)
    // The first successful road move may form before the template's preferred
    // formation window. Once the physical engine has created a real positive
    // gap, let the first story envelope guide it from race start instead of
    // waiting until the preferred window and allowing an immediate re-catch.
    // Later generations still respect their configured formation windows.
    const formationStart = index === 0 ? 0 : configuredFormationStart
    if (progress < formationStart) break
    if (!includeClosed && generationIsClosed(input, directive.generation)) continue
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
    const startingGap = Math.min(24, Math.max(5, targetGap * 0.035))
    const formationTarget = Math.min(70, Math.max(12, targetGap * 0.20))
    let center = targetGap
    let chaseActive = false

    if (progress < directive.formationPct) {
      const fraction = clamp(
        (progress - formationStart) /
          Math.max(0.000001, directive.formationPct - formationStart),
        0,
        1,
      )
      const eased = fraction * fraction * (3 - 2 * fraction)
      center = startingGap + (formationTarget - startingGap) * eased
    } else if (progress <= peakProgress) {
      const fraction = clamp(
        (progress - directive.formationPct) /
          Math.max(0.000001, peakProgress - directive.formationPct),
        0,
        1,
      )
      const eased = fraction * fraction * (3 - 2 * fraction)
      center = formationTarget + (targetGap - formationTarget) * eased
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

    const rangeLow = targetRange ? targetRange[0] : targetGap * 0.62
    const rangeHigh = targetRange ? targetRange[1] : targetGap * 1.42
    const widthScale = chaseActive ? 0.24 : 0.34
    const naturalHalfWidth = Math.max(12, center * widthScale)
    let lower = Math.max(0, center - naturalHalfWidth)
    let upper = Math.max(10, center + naturalHalfWidth)

    if (!chaseActive && progress >= peakProgress) {
      lower = Math.max(lower, rangeLow * 0.72)
      upper = Math.min(Math.max(upper, center + 18), rangeHigh * 1.18)
    }
    if (catchExpected && progress > chaseStart) {
      const nearCatch = clamp(
        (progress - chaseStart) / Math.max(0.000001, endProgress - chaseStart),
        0,
        1,
      )
      upper = Math.min(upper, Math.max(10, center + 45 * (1 - nearCatch)))
      lower = Math.min(lower, center)
    }

    return {
      generation: directive.generation,
      formationStartProgress: formationStart,
      formationProgress: directive.formationPct,
      peakProgress,
      chaseStartProgress: chaseStart,
      endProgress,
      catchWindowProgress: catchWindowProgress(input, directive),
      targetPeakGapRangeSec: targetRange,
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
 * Race Director V2.2 tactical-envelope guidance.
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

  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  const progress = clamp(finite(kmFromStart, 0) / distanceKm, 0, 1)

  // During the first formation window a successful physical move should not be
  // erased by one aggressive peloton step before it has had any chance to
  // establish itself. Protect only the sub-catch formation state, and only when
  // user chase pressure is not overwhelming. After formation is complete, a
  // physical catch remains final and the generation is closed as before.
  if (current <= 0.5) {
    const caughtEnvelope = scenarioGapEnvelopeV2(input, progress, true)
    if (caughtEnvelope) {
      const userChase = commandChasePressure(input, kmFromStart)
      const earlyFormation =
        progress < caughtEnvelope.formationProgress - 0.000001
      if (earlyFormation && userChase < 0.8) {
        const protectionFactor = clamp((0.8 - userChase) / 0.8, 0, 1)
        const protectedGap = round(
          clamp(
            1 + protectionFactor * 3,
            1,
            Math.max(1, Math.min(4, caughtEnvelope.lower)),
          ),
          6,
        )
        recordRuntimeApplication(input, 'gap_guidance', {
          adjusted: true,
          kmFromStart,
          reason: 'protect_early_formation_from_premature_catch',
        })
        recordGenerationRuntime(
          input,
          caughtEnvelope,
          current,
          protectedGap,
          kmFromStart,
          'protect_early_formation_from_premature_catch',
        )
        return protectedGap
      }

      // A credible, already-established break can otherwise disappear in one
      // physical step long before a late-catch story has even reached its
      // tactical closing window. Treat that as a numerical/tactical overshoot,
      // not as a scripted result: preserve only a tiny residual gap, and only
      // when the observed break previously earned a material advantage. Strong
      // real rider/team chase commands always override this protection.
      const rawAudit = actualScenarioAudit(input)
      const generationState = rawAudit
        ? object(runtimeGenerationStates(rawAudit)[String(caughtEnvelope.generation)])
        : {}
      const previousPeakGap = Math.max(0, finite(generationState.peakGapSeconds, 0))
      const previousLiveGap = Math.max(0, finite(generationState.lastGapSeconds, 0))
      const targetFloor = caughtEnvelope.targetPeakGapRangeSec?.[0] ?? caughtEnvelope.center
      const credibleEstablishedBreak =
        generationState.firstSeenKm !== undefined &&
        previousPeakGap >= Math.max(45, targetFloor * 0.25)
      const catchWindowStart = caughtEnvelope.catchWindowProgress?.[0] ?? null
      const tacticalProtectionDeadline = catchWindowStart !== null
        ? Math.max(caughtEnvelope.chaseStartProgress, catchWindowStart - 0.08)
        : caughtEnvelope.survivalExpected
          ? Math.max(0.72, caughtEnvelope.chaseStartProgress)
          : 0
      const materiallyPrematureCatch =
        credibleEstablishedBreak &&
        progress < tacticalProtectionDeadline - 0.000001

      if (materiallyPrematureCatch && userChase < 0.75) {
        const protectionFactor = clamp((0.75 - userChase) / 0.75, 0, 1)
        const residualBase = clamp(previousLiveGap * 0.18, 0.75, 8)
        const protectedGap = round(
          clamp(residualBase * (0.68 + protectionFactor * 0.32), 0.75, 8),
          6,
        )
        recordRuntimeApplication(input, 'gap_guidance', {
          adjusted: true,
          kmFromStart,
          reason: 'prevent_one_step_premature_catch',
        })
        recordGenerationRuntime(
          input,
          caughtEnvelope,
          current,
          protectedGap,
          kmFromStart,
          'prevent_one_step_premature_catch',
        )
        return protectedGap
      }

      recordGenerationRuntime(
        input,
        caughtEnvelope,
        current,
        current,
        kmFromStart,
        'physical_catch_observed',
      )
    }
    return current
  }

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
    const commandResistance = 1 - userChase * 0.76
    const templateResistance = envelope.chaseActive ? 0.52 : 1
    const earlyFormationBoost = progress < envelope.formationProgress ? 1.28 : 1
    const maximumGrowth =
      stepKm * (9 + 10 * envelope.storyStrength) * Math.max(0.12, commandResistance) * earlyFormationBoost
    const requested =
      difference * (0.30 + envelope.storyStrength * 0.34) * commandResistance * templateResistance
    adjusted = current + Math.min(requested, maximumGrowth)
    reason = progress < envelope.formationProgress
      ? 'protect_formation_window'
      : 'protect_break_story'
  } else if (current > envelope.upper) {
    const difference = current - envelope.upper
    const chaseBoost = 1 + combinedChase * 1.05 + (envelope.chaseActive ? 0.55 : 0)
    const maximumClosure = stepKm * (11 + 11 * envelope.storyStrength) * chaseBoost
    const requested = difference * (0.27 + envelope.storyStrength * 0.25) * chaseBoost
    adjusted = current - Math.min(requested, maximumClosure)
    reason = 'rein_in_excess_gap'
  } else {
    const difference = envelope.center - current
    const userOverride = difference > 0 ? 1 - userChase * 0.72 : 1
    const chaseMultiplier = difference < 0
      ? 1 + combinedChase * 0.55 + (envelope.chaseActive ? 0.30 : 0)
      : Math.max(0.20, userOverride)
    const requested = difference * envelope.centerPullStrength * envelope.storyStrength * chaseMultiplier
    const cap = stepKm * (difference < 0 ? 7.5 : 6.5)
    adjusted = current + clamp(requested, -cap, cap)
    reason = Math.abs(adjusted - current) > 0.000001 ? 'gentle_story_center_pull' : reason
  }

  if (envelope.catchExpected && envelope.chaseActive) {
    // Catch pressure is physical and progressive. Positive gaps are never snapped
    // to zero by the Director; the underlying engine still completes the catch.
    adjusted = Math.max(0.51, adjusted)
  }

  adjusted = round(Math.max(0, adjusted), 6)
  const changed = Math.abs(adjusted - current) > 0.000001
  if (changed) {
    recordRuntimeApplication(input, 'gap_guidance', {
      adjusted: true,
      kmFromStart,
      reason,
    })
  }
  recordGenerationRuntime(input, envelope, current, adjusted, kmFromStart, reason)
  return adjusted
}

function finalizeGenerationAdherence(input: RoadScenarioPhysicalInputV1): void {
  const audit = actualScenarioAudit(input)
  if (!audit) return
  const typedAudit = getRoadScenarioPhysicalAuditV1(input)
  if (!typedAudit) return
  const proof = object(audit.runtimeApplicationProof)
  const states = runtimeGenerationStates(audit)
  const distanceKm = Math.max(1, finite(input.stage.distanceKm, 1))
  let deviations = 0

  const adherence = instantiatedBreaks(typedAudit).map((directive) => {
    const state = object(states[String(directive.generation)])
    const peakGap = finite(state.peakGapSeconds, 0)
    const targetRange = directive.targetPeakGapRangeSec
    let peakStatus = 'not_observed'
    if (peakGap > 0.5) {
      if (!targetRange) peakStatus = 'observed'
      else if (peakGap < targetRange[0]) peakStatus = 'undershot'
      else if (peakGap > targetRange[1]) peakStatus = 'overshot'
      else peakStatus = 'inside_range'
    }
    if (peakStatus === 'not_observed' || peakStatus === 'undershot' || peakStatus === 'overshot') {
      deviations += 1
    }

    const catchKm = state.catchKm === undefined ? null : finite(state.catchKm, 0)
    const actualCatchKmRemaining = catchKm === null ? null : Math.max(0, distanceKm - catchKm)
    const catchRange = directive.catchKmRemainingRange
    let catchStatus = directive.catchKmRemaining === null ? 'not_required' : 'not_observed'
    if (actualCatchKmRemaining !== null && directive.catchKmRemaining !== null) {
      if (!catchRange) catchStatus = 'observed'
      else if (actualCatchKmRemaining > catchRange[1]) catchStatus = 'too_early'
      else if (actualCatchKmRemaining < catchRange[0]) catchStatus = 'too_late'
      else catchStatus = 'inside_range'
    }
    if (['not_observed', 'too_early', 'too_late'].includes(catchStatus) && directive.catchKmRemaining !== null) {
      deviations += 1
    }

    return {
      generation: directive.generation,
      state: text(state.state) || 'waiting',
      firstSeenKm: state.firstSeenKm ?? null,
      peakGapSeconds: round(peakGap, 3),
      plannedPeakGapRangeSec: targetRange,
      peakStatus,
      catchKm,
      actualCatchKmRemaining: actualCatchKmRemaining === null ? null : round(actualCatchKmRemaining, 3),
      plannedCatchKmRemainingRange: catchRange,
      catchStatus,
      prematureCatch: state.prematureCatch === true,
    }
  })

  proof.generationAdherence = adherence
  proof.generationDeviationCount = deviations
  audit.runtimeApplicationProof = proof
}

/**
 * Finale shaping remains secondary to the physical race. V2.2 deliberately
 * keeps targetFrontGroupRange as an audit expectation instead of steering the
 * survivor count toward it. Template fragmentation pressure can influence the
 * character of a hilly/mountain/cobbled finale, while physical topology and
 * rider energy remain authoritative.
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
  finalizeGenerationAdherence(input)

  // Flat road stages should keep the physical engine's peloton topology.
  // A scenario template may shape breakaway/chase behaviour, but it must not
  // manufacture extra finish-line fragmentation on an otherwise flat race.
  if (input.stage.terrainType === 'flat') return [...states]

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
  let keepCount = Math.max(2, Math.min(largest.length, Math.ceil(largest.length * retentionFraction)))

  // Keep the generated front-group range for audit/comparison only. The old
  // V2.1 code nudged keepCount back inside that range, which made the template
  // too close to an outcome blueprint. V2.2 lets terrain pressure, rider energy
  // and the physical topology decide the actual survivor count.
  const targetRange = numericRange(parameters.targetFrontGroupRange)

  if (keepCount >= largest.length) return [...states]

  const selected = [...largest].sort((left, right) =>
    right.energyAtFinish - left.energyAtFinish ||
    stableHash(`${audit.selectionSeed}:${left.riderId}`) -
      stableHash(`${audit.selectionSeed}:${right.riderId}`),
  )
  const retainedIds = new Set(selected.slice(0, keepCount).map((state) => state.riderId))
  const detached = selected.slice(keepCount)
  const detachedRank = new Map(detached.map((state, index) => [state.riderId, index] as const))
  const naturalGap = 12 + pressure * 70
  const configuredGap = finite(parameters.secondaryGapSec, naturalGap)
  // Scenario secondary-gap values are now only a minority influence. This
  // preserves tactical character without prescribing a finish-line time gap.
  const tacticalGap = naturalGap * 0.70 + configuredGap * 0.30
  const secondaryGap = Math.max(6, tacticalGap * (0.52 + pressure * 0.34))
  const baseGap = Math.min(...largest.map((state) => Math.max(0, state.finalGapSeconds)))
  const topologyBands = pressure >= 0.78 ? 3 : pressure >= 0.48 ? 2 : 1

  const result = states.map((state) => {
    if (!largest.some((candidate) => candidate.riderId === state.riderId)) return state
    if (retainedIds.has(state.riderId)) return state
    const rank = detachedRank.get(state.riderId) ?? 0
    const normalizedRank = detached.length <= 1 ? 0 : rank / (detached.length - 1)
    const band = Math.min(topologyBands - 1, Math.floor(normalizedRank * topologyBands))
    const bandMultiplier = topologyBands === 1 ? 0.72 : 0.52 + band * (0.48 / Math.max(1, topologyBands - 1))
    const gap = round(baseGap + secondaryGap * bandMultiplier, 6)
    const energyPenalty = 0.30 + pressure * 0.82 + band * (0.20 + pressure * 0.18)
    return {
      ...state,
      finalGapSeconds: gap,
      finalGroupCode: groupCodeForGap(gap),
      energyAtFinish: round(Math.max(0, state.energyAtFinish - energyPenalty), 6),
    }
  })

  const rawAudit = actualScenarioAudit(input)
  if (rawAudit) {
    const proof = object(rawAudit.runtimeApplicationProof)
    proof.fragmentationTopology = {
      pressure: round(pressure, 4),
      topologyBands,
      largestGroupBefore: largest.length,
      frontGroupAfter: keepCount,
      targetFrontGroupRange: targetRange,
      allowRegroup,
    }
    rawAudit.runtimeApplicationProof = proof
  }
  recordRuntimeApplication(input, 'fragmentation', { adjusted: true })
  return result
}
