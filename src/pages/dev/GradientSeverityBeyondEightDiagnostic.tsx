/**
 * GradientSeverityBeyondEightDiagnostic.tsx
 *
 * Phase 7B.8F browser-only calibration diagnostic.
 *
 * Compares three inactive models at 5%, 8%, 10%, 12%, and 15%:
 * - current_saturated
 * - shelter_extension
 * - progressive_resilience
 *
 * The candidate utility is not connected to movement, pressure state,
 * transitions, events, replay output, persistence, or production execution.
 */

import { useMemo } from 'react'

import type {
  RiderAttributes,
  RiderState,
} from '../../race-engine/domain/RiderState'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  calculateGroupTerrainPace,
} from '../../race-engine/simulation/groupTerrainPace'
import {
  calculateRiderGroupHold,
} from '../../race-engine/simulation/groupHold'
import {
  calculateRiderSeparationEligibility,
} from '../../race-engine/simulation/groupSeparationEligibility'
import {
  getStageTerrainSample,
} from '../../race-engine/simulation/stageProfile'
import {
  calculateSteepGradientTerrainSeverity,
  type SteepGradientSeverityModel,
  type SteepGradientTerrainSeverityResult,
} from '../../race-engine/simulation/steepGradientTerrainSeverity'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

interface HoldCounts {
  readonly comfortable: number
  readonly underPressure: number
  readonly cannotHold: number
}

interface EligibilityCounts {
  readonly at30Seconds: number
  readonly at60Seconds: number
  readonly at90Seconds: number
  readonly at120Seconds: number
}

interface ModelGradientRow {
  readonly model:
    SteepGradientSeverityModel
  readonly gradientPercent: number
  readonly steepnessFactor: number
  readonly groupSpeedKmh: number
  readonly averageBaseCapability: number
  readonly averageAdjustedCapability: number
  readonly shelterBonus: number
  readonly additionalDemandPoints: number
  readonly groupDemandScore: number
  readonly averageCapabilityMargin: number
  readonly minimumCapabilityMargin: number
  readonly maximumCapabilityMargin: number
  readonly holdCounts:
    HoldCounts
  readonly eligibilityCounts:
    EligibilityCounts
  readonly rankingHash: string
  readonly bottomFiveRiderNames:
    readonly string[]
  readonly topFiveRiderNames:
    readonly string[]
}

interface ArchetypeRow {
  readonly gradientPercent: number
  readonly flatSpecialistEffective: number
  readonly climberEffective: number
  readonly allRounderEffective: number
  readonly climberAdvantageOverFlat: number
  readonly flatPenalty: number
  readonly climberPenalty: number
  readonly shelterBonus: number
}

interface RioAudit {
  readonly sampleCount: number
  readonly riderEvaluationCount: number
  readonly maximumGradientPercent: number
  readonly changedEvaluationCount: number
  readonly hash: string
}

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly rows:
    readonly ModelGradientRow[]
  readonly archetypeRows:
    readonly ArchetypeRow[]
  readonly rioAudit:
    RioAudit
  readonly repeatedHashA: string
  readonly repeatedHashB: string
  readonly checks:
    readonly CheckResult[]
}

const GRADIENTS = [
  5,
  8,
  10,
  12,
  15,
] as const

const MODELS:
  readonly SteepGradientSeverityModel[] = [
    'current_saturated',
    'shelter_extension',
    'progressive_resilience',
  ]

const TERRAIN_CAPABILITY_INFLUENCE =
  0.5

const TICK_SECONDS =
  30

const SEPARATION_WINDOW_SECONDS =
  120

const FLAT_SPECIALIST:
  RiderAttributes = {
    flat: 82,
    climbing: 45,
    sprint: 70,
    timeTrial: 75,
    acceleration: 70,
    stamina: 65,
    resistance: 60,
    recovery: 60,
    raceIq: 65,
    teamwork: 50,
  }

const CLIMBER:
  RiderAttributes = {
    flat: 50,
    climbing: 82,
    sprint: 55,
    timeTrial: 55,
    acceleration: 55,
    stamina: 75,
    resistance: 70,
    recovery: 70,
    raceIq: 65,
    teamwork: 50,
  }

const ALL_ROUNDER:
  RiderAttributes = {
    flat: 65,
    climbing: 65,
    sprint: 65,
    timeTrial: 65,
    acceleration: 65,
    stamina: 65,
    resistance: 65,
    recovery: 65,
    raceIq: 65,
    teamwork: 65,
  }

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    throw new Error(
      'GradientSeverityBeyondEightDiagnostic: cannot average an empty array.',
    )
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function emptyHoldCounts():
  HoldCounts {
  return {
    comfortable: 0,
    underPressure: 0,
    cannotHold: 0,
  }
}

function addHoldStatus(
  counts: HoldCounts,
  status: string,
): HoldCounts {
  if (
    status ===
    'comfortable'
  ) {
    return {
      ...counts,
      comfortable:
        counts.comfortable + 1,
    }
  }

  if (
    status ===
    'under_pressure'
  ) {
    return {
      ...counts,
      underPressure:
        counts.underPressure + 1,
    }
  }

  return {
    ...counts,
    cannotHold:
      counts.cannotHold + 1,
  }
}

function evaluateEligibility(
  evaluations:
    readonly {
      readonly riderId: string
      readonly status: string
    }[],
): EligibilityCounts {
  const durations:
    Record<string, number> =
      Object.fromEntries(
        evaluations.map(
          (evaluation) => [
            evaluation.riderId,
            0,
          ],
        ),
      )

  const eligibleBySecond:
    Record<number, number> = {
      30: 0,
      60: 0,
      90: 0,
      120: 0,
    }

  for (
    const raceSecond of
    [
      30,
      60,
      90,
      120,
    ]
  ) {
    let eligibleCount = 0

    for (
      const evaluation of
      evaluations
    ) {
      const eligibility =
        calculateRiderSeparationEligibility({
          riderId:
            evaluation.riderId,
          holdStatus:
            evaluation.status as
              | 'comfortable'
              | 'under_pressure'
              | 'cannot_hold',
          previousConsecutiveCannotHoldSeconds:
            durations[
              evaluation.riderId
            ] ?? 0,
          tickSeconds:
            TICK_SECONDS,
          eligibilityWindowsSeconds: [
            SEPARATION_WINDOW_SECONDS,
          ],
        })

      durations[
        evaluation.riderId
      ] =
        eligibility
          .nextConsecutiveCannotHoldSeconds

      if (
        eligibility
          .eligibleWindowsSeconds
          .includes(
            SEPARATION_WINDOW_SECONDS,
          )
      ) {
        eligibleCount += 1
      }
    }

    eligibleBySecond[
      raceSecond
    ] =
      eligibleCount
  }

  return {
    at30Seconds:
      eligibleBySecond[30],
    at60Seconds:
      eligibleBySecond[60],
    at90Seconds:
      eligibleBySecond[90],
    at120Seconds:
      eligibleBySecond[120],
  }
}

function evaluateModelGradient(
  riders:
    readonly RiderState[],
  model:
    SteepGradientSeverityModel,
  gradientPercent: number,
  minimumSpeedKmh: number,
  maximumSpeedKmh: number,
): ModelGradientRow {
  const racingRiders =
    riders
      .filter(
        (rider) =>
          rider.stageStatus ===
          'racing',
      )
      .slice()
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )

  const pace =
    calculateGroupTerrainPace({
      riders:
        racingRiders,
      gradientPercent,
      minimumSpeedKmh,
      maximumSpeedKmh,
      terrainCapabilityInfluence:
        TERRAIN_CAPABILITY_INFLUENCE,
    })

  const severityResults =
    racingRiders.map(
      (rider) =>
        calculateSteepGradientTerrainSeverity({
          riderId:
            rider.riderId,
          attributes:
            rider.attributes,
          currentEnergy:
            rider.energy,
          groupType:
            'peloton',
          groupSize:
            racingRiders.length,
          gradientPercent,
          model,
        }),
    )

  const averageBaseCapability =
    average(
      severityResults.map(
        (result) =>
          result.baseCapability
            .capabilityScore,
      ),
    )

  const averageAdjustedCapability =
    average(
      severityResults.map(
        (result) =>
          result
            .adjustedCapabilityScore,
      ),
    )

  const first =
    severityResults[0]

  if (!first) {
    throw new Error(
      'GradientSeverityBeyondEightDiagnostic: missing first severity result.',
    )
  }

  const groupDemandScore =
    Math.min(
      100,
      averageAdjustedCapability +
      first.additionalDemandPoints,
    )

  let holdCounts =
    emptyHoldCounts()

  const holdEvaluations =
    severityResults.map(
      (severity) => {
        const hold =
          calculateRiderGroupHold({
            riderCapabilityScore:
              severity
                .effectiveCapabilityScore,
            groupDemandScore,
            groupSpeedKmh:
              pace.appliedSpeedKmh,
          })

        holdCounts =
          addHoldStatus(
            holdCounts,
            hold.status,
          )

        const rider =
          racingRiders.find(
            (candidate) =>
              candidate.riderId ===
              severity.riderId,
          )

        if (!rider) {
          throw new Error(
            `GradientSeverityBeyondEightDiagnostic: missing rider ${severity.riderId}.`,
          )
        }

        return {
          riderId:
            severity.riderId,
          riderName:
            rider.riderName,
          adjustedCapabilityScore:
            severity
              .adjustedCapabilityScore,
          effectiveCapabilityScore:
            severity
              .effectiveCapabilityScore,
          capabilityMargin:
            hold.capabilityMargin,
          status:
            hold.status,
        }
      },
    )

  const margins =
    holdEvaluations.map(
      (evaluation) =>
        evaluation
          .capabilityMargin,
    )

  const ranked =
    holdEvaluations
      .slice()
      .sort(
        (left, right) => {
          if (
            left.effectiveCapabilityScore !==
            right.effectiveCapabilityScore
          ) {
            return (
              right.effectiveCapabilityScore -
              left.effectiveCapabilityScore
            )
          }

          return left.riderId.localeCompare(
            right.riderId,
          )
        },
      )

  const rankingHash =
    createCanonicalHashedValue(
      ranked.map(
        (evaluation) => ({
          riderId:
            evaluation.riderId,
          effectiveCapabilityScore:
            evaluation
              .effectiveCapabilityScore,
        }),
      ),
    ).hash

  return {
    model,
    gradientPercent,
    steepnessFactor:
      first.steepnessFactor,
    groupSpeedKmh:
      pace.appliedSpeedKmh,
    averageBaseCapability,
    averageAdjustedCapability,
    shelterBonus:
      first.adjustedShelterBonus,
    additionalDemandPoints:
      first.additionalDemandPoints,
    groupDemandScore,
    averageCapabilityMargin:
      average(
        margins,
      ),
    minimumCapabilityMargin:
      Math.min(
        ...margins,
      ),
    maximumCapabilityMargin:
      Math.max(
        ...margins,
      ),
    holdCounts,
    eligibilityCounts:
      evaluateEligibility(
        holdEvaluations,
      ),
    rankingHash,
    bottomFiveRiderNames:
      ranked
        .slice(-5)
        .reverse()
        .map(
          (evaluation) =>
            evaluation.riderName,
        ),
    topFiveRiderNames:
      ranked
        .slice(
          0,
          5,
        )
        .map(
          (evaluation) =>
            evaluation.riderName,
        ),
  }
}

function archetypeResult(
  riderId: string,
  attributes:
    RiderAttributes,
  gradientPercent: number,
): SteepGradientTerrainSeverityResult {
  return calculateSteepGradientTerrainSeverity({
    riderId,
    attributes,
    currentEnergy: 100,
    groupType:
      'peloton',
    groupSize: 96,
    gradientPercent,
    model:
      'progressive_resilience',
  })
}

function createArchetypeRows():
  readonly ArchetypeRow[] {
  return [
    8,
    10,
    12,
    15,
  ].map(
    (gradientPercent) => {
      const flat =
        archetypeResult(
          'flat-specialist',
          FLAT_SPECIALIST,
          gradientPercent,
        )

      const climber =
        archetypeResult(
          'climber',
          CLIMBER,
          gradientPercent,
        )

      const allRounder =
        archetypeResult(
          'all-rounder',
          ALL_ROUNDER,
          gradientPercent,
        )

      return {
        gradientPercent,
        flatSpecialistEffective:
          flat
            .effectiveCapabilityScore,
        climberEffective:
          climber
            .effectiveCapabilityScore,
        allRounderEffective:
          allRounder
            .effectiveCapabilityScore,
        climberAdvantageOverFlat:
          climber
            .effectiveCapabilityScore -
          flat
            .effectiveCapabilityScore,
        flatPenalty:
          flat
            .capabilityPenaltyPoints,
        climberPenalty:
          climber
            .capabilityPenaltyPoints,
        shelterBonus:
          climber
            .adjustedShelterBonus,
      }
    },
  )
}

function auditRio(
  riders:
    readonly RiderState[],
): RioAudit {
  const stageInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const samples =
    Array.from(
      {
        length:
          Math.floor(
            stageInput.distanceKm,
          ) +
          1,
      },
      (
        _,
        kilometre,
      ) =>
        getStageTerrainSample(
          stageInput,
          kilometre,
        ),
    )

  let changedEvaluationCount = 0

  const compact:
    {
      readonly kilometre: number
      readonly gradientPercent: number
      readonly riders:
        readonly {
          readonly riderId: string
          readonly capabilityScore: number
          readonly shelterBonus: number
          readonly effectiveCapabilityScore: number
        }[]
    }[] = []

  for (
    const sample of
    samples
  ) {
    const riderRows =
      riders
        .slice()
        .sort(
          (left, right) =>
            left.riderId.localeCompare(
              right.riderId,
            ),
        )
        .map(
          (rider) => {
            const current =
              calculateSteepGradientTerrainSeverity({
                riderId:
                  rider.riderId,
                attributes:
                  rider.attributes,
                currentEnergy:
                  rider.energy,
                groupType:
                  'peloton',
                groupSize:
                  riders.length,
                gradientPercent:
                  sample
                    .gradientPercent,
                model:
                  'current_saturated',
              })

            const progressive =
              calculateSteepGradientTerrainSeverity({
                riderId:
                  rider.riderId,
                attributes:
                  rider.attributes,
                currentEnergy:
                  rider.energy,
                groupType:
                  'peloton',
                groupSize:
                  riders.length,
                gradientPercent:
                  sample
                    .gradientPercent,
                model:
                  'progressive_resilience',
              })

            if (
              current
                .adjustedCapabilityScore !==
                progressive
                  .adjustedCapabilityScore ||
              current
                .adjustedShelterBonus !==
                progressive
                  .adjustedShelterBonus ||
              current
                .additionalDemandPoints !==
                progressive
                  .additionalDemandPoints ||
              current
                .effectiveCapabilityScore !==
                progressive
                  .effectiveCapabilityScore
            ) {
              changedEvaluationCount +=
                1
            }

            return {
              riderId:
                rider.riderId,
              capabilityScore:
                progressive
                  .adjustedCapabilityScore,
              shelterBonus:
                progressive
                  .adjustedShelterBonus,
              effectiveCapabilityScore:
                progressive
                  .effectiveCapabilityScore,
            }
          },
        )

    compact.push({
      kilometre:
        sample.kilometre,
      gradientPercent:
        sample.gradientPercent,
      riders:
        riderRows,
    })
  }

  return {
    sampleCount:
      samples.length,
    riderEvaluationCount:
      samples.length *
      riders.length,
    maximumGradientPercent:
      Math.max(
        ...samples.map(
          (sample) =>
            sample.gradientPercent,
        ),
      ),
    changedEvaluationCount,
    hash:
      createCanonicalHashedValue(
        compact,
      ).hash,
  }
}

function rowFor(
  rows:
    readonly ModelGradientRow[],
  model:
    SteepGradientSeverityModel,
  gradientPercent: number,
): ModelGradientRow {
  const row =
    rows.find(
      (candidate) =>
        candidate.model ===
          model &&
        candidate.gradientPercent ===
          gradientPercent,
    )

  if (!row) {
    throw new Error(
      `GradientSeverityBeyondEightDiagnostic: missing ${model} row at ${gradientPercent}%.`,
    )
  }

  return row
}

function sameLegacyValues(
  left:
    ModelGradientRow,
  right:
    ModelGradientRow,
): boolean {
  return (
    left.averageAdjustedCapability ===
      right.averageAdjustedCapability &&
    left.shelterBonus ===
      right.shelterBonus &&
    left.additionalDemandPoints ===
      right.additionalDemandPoints &&
    left.groupDemandScore ===
      right.groupDemandScore &&
    left.averageCapabilityMargin ===
      right.averageCapabilityMargin &&
    JSON.stringify(
      left.holdCounts,
    ) ===
      JSON.stringify(
        right.holdCounts,
      ) &&
    left.rankingHash ===
      right.rankingHash
  )
}

function buildRows(
  riders:
    readonly RiderState[],
  minimumSpeedKmh: number,
  maximumSpeedKmh: number,
): readonly ModelGradientRow[] {
  return MODELS.flatMap(
    (model) =>
      GRADIENTS.map(
        (gradientPercent) =>
          evaluateModelGradient(
            riders,
            model,
            gradientPercent,
            minimumSpeedKmh,
            maximumSpeedKmh,
          ),
      ),
  )
}

function buildDiagnostic():
  DiagnosticResult {
  const stageInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const initialState =
    createInitialState(
      stageInput,
    )

  const riders =
    Object.values(
      initialState.riders,
    )

  const rowsA =
    buildRows(
      riders,
      stageInput.settings
        .minimumSpeedKmh,
      stageInput.settings
        .maximumSpeedKmh,
    )

  const rowsB =
    buildRows(
      riders,
      stageInput.settings
        .minimumSpeedKmh,
      stageInput.settings
        .maximumSpeedKmh,
    )

  const repeatedHashA =
    createCanonicalHashedValue(
      rowsA,
    ).hash

  const repeatedHashB =
    createCanonicalHashedValue(
      rowsB,
    ).hash

  const archetypeRows =
    createArchetypeRows()

  const rioAudit =
    auditRio(
      riders,
    )

  const current8 =
    rowFor(
      rowsA,
      'current_saturated',
      8,
    )

  const current10 =
    rowFor(
      rowsA,
      'current_saturated',
      10,
    )

  const current12 =
    rowFor(
      rowsA,
      'current_saturated',
      12,
    )

  const current15 =
    rowFor(
      rowsA,
      'current_saturated',
      15,
    )

  const progressive5 =
    rowFor(
      rowsA,
      'progressive_resilience',
      5,
    )

  const progressive8 =
    rowFor(
      rowsA,
      'progressive_resilience',
      8,
    )

  const progressive10 =
    rowFor(
      rowsA,
      'progressive_resilience',
      10,
    )

  const progressive12 =
    rowFor(
      rowsA,
      'progressive_resilience',
      12,
    )

  const progressive15 =
    rowFor(
      rowsA,
      'progressive_resilience',
      15,
    )

  const shelter8 =
    rowFor(
      rowsA,
      'shelter_extension',
      8,
    )

  const shelter10 =
    rowFor(
      rowsA,
      'shelter_extension',
      10,
    )

  const shelter12 =
    rowFor(
      rowsA,
      'shelter_extension',
      12,
    )

  const shelter15 =
    rowFor(
      rowsA,
      'shelter_extension',
      15,
    )

  const legacyPreservedThroughEight =
    [
      5,
      8,
    ].every(
      (gradientPercent) => {
        const current =
          rowFor(
            rowsA,
            'current_saturated',
            gradientPercent,
          )

        return (
          sameLegacyValues(
            current,
            rowFor(
              rowsA,
              'shelter_extension',
              gradientPercent,
            ),
          ) &&
          sameLegacyValues(
            current,
            rowFor(
              rowsA,
              'progressive_resilience',
              gradientPercent,
            ),
          )
        )
      },
    )

  const currentSaturatesAboveEight =
    current8
      .averageAdjustedCapability ===
      current10
        .averageAdjustedCapability &&
    current8.shelterBonus ===
      current10.shelterBonus &&
    current8.holdCounts
      .cannotHold ===
      current10.holdCounts
        .cannotHold &&
    current8
      .averageAdjustedCapability ===
      current12
        .averageAdjustedCapability &&
    current8.shelterBonus ===
      current12.shelterBonus &&
    current8.holdCounts
      .cannotHold ===
      current12.holdCounts
        .cannotHold &&
    current8
      .averageAdjustedCapability ===
      current15
        .averageAdjustedCapability &&
    current8.shelterBonus ===
      current15.shelterBonus &&
    current8.holdCounts
      .cannotHold ===
      current15.holdCounts
        .cannotHold

  const progressiveHarderAt12 =
    progressive12
      .averageCapabilityMargin <=
      progressive8
        .averageCapabilityMargin -
        1

  const progressiveHarderAt15 =
    progressive15
      .averageCapabilityMargin <=
      progressive12
        .averageCapabilityMargin -
        0.75

  const progressiveMarginsMonotonic =
    progressive5
      .averageCapabilityMargin >=
      progressive8
        .averageCapabilityMargin &&
    progressive8
      .averageCapabilityMargin >
      progressive10
        .averageCapabilityMargin &&
    progressive10
      .averageCapabilityMargin >
      progressive12
        .averageCapabilityMargin &&
    progressive12
      .averageCapabilityMargin >
      progressive15
        .averageCapabilityMargin

  const cannotHoldNonDecreasing =
    progressive8.holdCounts
      .cannotHold <=
      progressive10.holdCounts
        .cannotHold &&
    progressive10.holdCounts
      .cannotHold <=
      progressive12.holdCounts
        .cannotHold &&
    progressive12.holdCounts
      .cannotHold <=
      progressive15.holdCounts
        .cannotHold

  const shelterProgressive =
    progressive8.shelterBonus >
      progressive10.shelterBonus &&
    progressive10.shelterBonus >
      progressive12.shelterBonus &&
    progressive12.shelterBonus >
      progressive15.shelterBonus

  const shelterOnlyProgressive =
    shelter8.shelterBonus >
      shelter10.shelterBonus &&
    shelter10.shelterBonus >
      shelter12.shelterBonus &&
    shelter12.shelterBonus >
      shelter15.shelterBonus

  const noInstantEligibility =
    [
      progressive10,
      progressive12,
      progressive15,
    ].every(
      (row) =>
        row.eligibilityCounts
          .at30Seconds === 0 &&
        row.eligibilityCounts
          .at60Seconds === 0 &&
        row.eligibilityCounts
          .at90Seconds === 0 &&
        row.eligibilityCounts
          .at120Seconds ===
          row.holdCounts
            .cannotHold,
    )

  const noMassSeparation =
    progressive15.holdCounts
      .cannotHold <
      riders.length / 2

  const archetypeAdvantages =
    archetypeRows.map(
      (row) =>
        row
          .climberAdvantageOverFlat,
    )

  const climberAdvantageIncreases =
    archetypeAdvantages.every(
      (
        value,
        index,
      ) =>
        index === 0 ||
        value >
          archetypeAdvantages[
            index - 1
          ],
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated candidate evaluation is identical',
        passed:
          repeatedHashA ===
          repeatedHashB,
      },
      {
        label:
          'All candidate models preserve current behaviour at 5% and 8%',
        passed:
          legacyPreservedThroughEight,
      },
      {
        label:
          'The current model is confirmed to saturate above 8%',
        passed:
          currentSaturatesAboveEight,
      },
      {
        label:
          'Shelter-only and progressive models continue reducing shelter above 8%',
        passed:
          shelterOnlyProgressive &&
          shelterProgressive,
      },
      {
        label:
          'The progressive model makes 12% meaningfully harder than 8%',
        passed:
          progressiveHarderAt12,
      },
      {
        label:
          'The progressive model makes 15% meaningfully harder than 12%',
        passed:
          progressiveHarderAt15,
      },
      {
        label:
          'Progressive average capability margin worsens monotonically from 8% to 15%',
        passed:
          progressiveMarginsMonotonic,
      },
      {
        label:
          'Progressive cannot-hold count never decreases from 8% to 15%',
        passed:
          cannotHoldNonDecreasing,
      },
      {
        label:
          'The climber advantage grows as gradients become steeper',
        passed:
          climberAdvantageIncreases,
      },
      {
        label:
          'No rider becomes separation-eligible before the full 120-second window',
        passed:
          noInstantEligibility,
      },
      {
        label:
          'The 15% candidate does not cause immediate mass separation',
        passed:
          noMassSeparation,
      },
      {
        label:
          'Every controlled row contains a deterministic rider ranking',
        passed:
          rowsA.every(
            (row) =>
              row.rankingHash
                .length > 0 &&
              row.topFiveRiderNames
                .length === 5 &&
              row.bottomFiveRiderNames
                .length === 5,
          ),
      },
      {
        label:
          'Rio Stage 1 candidate evaluations remain exactly unchanged',
        passed:
          rioAudit
            .changedEvaluationCount ===
          0,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    rows:
      rowsA,
    archetypeRows,
    rioAudit,
    repeatedHashA,
    repeatedHashB,
    checks,
  }
}

function format(
  value: number,
  digits = 2,
): string {
  return value.toFixed(
    digits,
  )
}

function modelLabel(
  model:
    SteepGradientSeverityModel,
): string {
  if (
    model ===
    'current_saturated'
  ) {
    return 'Current saturated'
  }

  if (
    model ===
    'shelter_extension'
  ) {
    return 'Shelter extension'
  }

  return 'Progressive resilience'
}

function Check({
  result,
}: {
  readonly result:
    CheckResult
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {result.label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          result.passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {result.passed
          ? 'PASS'
          : 'FAIL'}
      </span>
    </div>
  )
}

export default function GradientSeverityBeyondEightDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => {
        try {
          return {
            ok: true as const,
            value:
              buildDiagnostic(),
          }
        } catch (error) {
          return {
            ok: false as const,
            message:
              error instanceof Error
                ? error.message
                : String(error),
            stack:
              error instanceof Error
                ? error.stack ??
                  null
                : null,
          }
        }
      },
      [],
    )

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-5xl rounded-3xl border border-red-400 bg-red-950/30 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 7B.8F development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Gradient severity audit failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>

          {result.stack ? (
            <details className="mt-4 rounded-2xl bg-slate-950 p-4">
              <summary className="cursor-pointer font-semibold">
                Browser stack
              </summary>

              <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-400">
                {result.stack}
              </pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }

  const value =
    result.value

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1850px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8F development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Gradient severity beyond eight percent
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Compares the current saturated calculation with a shelter-only
            extension and a progressive rider-resilience candidate. Behaviour
            through 8% must remain exact.
          </p>
        </header>

        <section
          className={[
            'rounded-3xl border p-6',
            value.passed
              ? 'border-emerald-400 bg-emerald-950/25'
              : 'border-red-400 bg-red-950/25',
          ].join(' ')}
        >
          <h2 className="text-2xl font-semibold">
            {value.passed
              ? 'PASS — steep-gradient severity increases beyond 8% while preserving all behaviour through 8%'
              : 'FAIL — the steep-gradient candidate needs recalibration'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Evaluation hash
            </div>
            <div className="mt-2 break-all font-mono text-sm">
              {value.repeatedHashA}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Rio maximum gradient
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {format(
                value.rioAudit
                  .maximumGradientPercent,
                3,
              )}%
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Rio evaluations
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {value.rioAudit
                .riderEvaluationCount}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Rio changed
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {value.rioAudit
                .changedEvaluationCount}
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Full-field model comparison
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Model / gradient
                  </th>
                  <th className="px-3 py-3">
                    Steep factor
                  </th>
                  <th className="px-3 py-3">
                    Group speed
                  </th>
                  <th className="px-3 py-3">
                    Base / adjusted capability
                  </th>
                  <th className="px-3 py-3">
                    Shelter / demand premium
                  </th>
                  <th className="px-3 py-3">
                    Group demand
                  </th>
                  <th className="px-3 py-3">
                    Margin avg / min / max
                  </th>
                  <th className="px-3 py-3">
                    Comfortable / pressure / cannot
                  </th>
                  <th className="px-3 py-3">
                    Eligible 30 / 60 / 90 / 120
                  </th>
                  <th className="px-3 py-3">
                    Ranking hash
                  </th>
                  <th className="px-3 py-3">
                    Bottom five
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.rows.map(
                  (row) => (
                    <tr
                      key={`${row.model}-${row.gradientPercent}`}
                      className="border-t border-slate-800"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-semibold">
                        {modelLabel(
                          row.model,
                        )}
                        {' · '}
                        {row.gradientPercent}%
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.steepnessFactor,
                          3,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.groupSpeedKmh,
                        )} km/h
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {format(
                          row.averageBaseCapability,
                        )}
                        {' / '}
                        {format(
                          row.averageAdjustedCapability,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {format(
                          row.shelterBonus,
                        )}
                        {' / +'}
                        {format(
                          row.additionalDemandPoints,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.groupDemandScore,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {format(
                          row.averageCapabilityMargin,
                        )}
                        {' / '}
                        {format(
                          row.minimumCapabilityMargin,
                        )}
                        {' / '}
                        {format(
                          row.maximumCapabilityMargin,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.holdCounts
                          .comfortable}
                        {' / '}
                        {row.holdCounts
                          .underPressure}
                        {' / '}
                        {row.holdCounts
                          .cannotHold}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row
                          .eligibilityCounts
                          .at30Seconds}
                        {' / '}
                        {row
                          .eligibilityCounts
                          .at60Seconds}
                        {' / '}
                        {row
                          .eligibilityCounts
                          .at90Seconds}
                        {' / '}
                        {row
                          .eligibilityCounts
                          .at120Seconds}
                      </td>

                      <td className="font-mono px-3 py-3">
                        {row.rankingHash}
                      </td>

                      <td className="min-w-[300px] px-3 py-3 text-slate-300">
                        {row.bottomFiveRiderNames
                          .join(', ')}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Controlled archetypes · progressive model
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Gradient
                  </th>
                  <th className="px-3 py-3">
                    Flat specialist
                  </th>
                  <th className="px-3 py-3">
                    Climber
                  </th>
                  <th className="px-3 py-3">
                    All-rounder
                  </th>
                  <th className="px-3 py-3">
                    Climber advantage
                  </th>
                  <th className="px-3 py-3">
                    Flat / climber penalty
                  </th>
                  <th className="px-3 py-3">
                    Shelter
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.archetypeRows.map(
                  (row) => (
                    <tr
                      key={row.gradientPercent}
                      className="border-t border-slate-800"
                    >
                      <td className="px-3 py-3 font-semibold">
                        {row.gradientPercent}%
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.flatSpecialistEffective,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.climberEffective,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.allRounderEffective,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.climberAdvantageOverFlat,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.flatPenalty,
                        )}
                        {' / '}
                        {format(
                          row.climberPenalty,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {format(
                          row.shelterBonus,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Rio Stage 1 preservation
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Samples
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.rioAudit
                  .sampleCount}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Rider evaluations
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.rioAudit
                  .riderEvaluationCount}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Maximum gradient
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {format(
                  value.rioAudit
                    .maximumGradientPercent,
                  3,
                )}%
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Changed evaluations
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.rioAudit
                  .changedEvaluationCount}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Hash
              </dt>
              <dd className="mt-2 break-all font-mono text-xs">
                {value.rioAudit.hash}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            {value.checks.map(
              (check) => (
                <Check
                  key={check.label}
                  result={check}
                />
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            This page evaluates a separate candidate utility only. Existing
            terrain capability, shelter, group pace, group hold, movement,
            pressure state, transitions, events, replay persistence,
            production routes, and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
