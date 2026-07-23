/**
 * TerrainRiderCapabilityDiagnostic.tsx
 *
 * Phase 7B.3 browser-only, read-only diagnostic.
 *
 * Verifies terrain-specific rider capability, fatigue influence, and a
 * diagnostic shelter model against the 96-rider Rio Stage 1 field.
 *
 * No rider changes group. No engine movement, events, Supabase data, or
 * production route is changed.
 */

import { useMemo } from 'react'

import type {
  RiderAttributes,
} from '../../race-engine/domain/RiderState'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  calculateGroupShelter,
} from '../../race-engine/simulation/groupShelter'
import {
  calculateRiderGroupHold,
} from '../../race-engine/simulation/groupHold'
import {
  calculateRiderTerrainCapability,
  getTerrainCapabilityWeights,
} from '../../race-engine/simulation/riderTerrainCapability'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type HoldCounts = {
  readonly comfortable: number
  readonly underPressure: number
  readonly cannotHold: number
}

type GradientRow = {
  readonly gradientPercent: number
  readonly averageCapability: number
  readonly minimumCapability: number
  readonly maximumCapability: number
  readonly shelterBonus: number
  readonly counts: HoldCounts
  readonly topRiderName: string
  readonly topCapability: number
  readonly bottomRiderName: string
  readonly bottomCapability: number
  readonly flatWeight: number
  readonly climbingWeight: number
  readonly timeTrialWeight: number
}

type ArchetypeRow = {
  readonly gradientPercent: number
  readonly flatSpecialist: number
  readonly climber: number
  readonly allRounder: number
}

type DiagnosticResult = {
  readonly passed: boolean
  readonly riderCount: number
  readonly gradientRows: readonly GradientRow[]
  readonly archetypeRows: readonly ArchetypeRow[]
  readonly flatStartCannotHold: number
  readonly fivePercentCannotHold: number
  readonly eightPercentCannotHold: number
  readonly flatShelterBonus: number
  readonly eightPercentShelterBonus: number
  readonly soloShelterBonus: number
  readonly breakawayShelterBonus: number
  readonly freshCapability: number
  readonly fatiguedCapability: number
  readonly checks: Readonly<
    Record<string, boolean>
  >
}

const CONTROLLED_GRADIENTS = [
  -8,
  0,
  3,
  5,
  8,
  12,
] as const

const DIAGNOSTIC_GROUP_SPEED_KMH =
  43.34

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
  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / values.length
  )
}

function emptyCounts():
  HoldCounts {
  return {
    comfortable: 0,
    underPressure: 0,
    cannotHold: 0,
  }
}

function addStatus(
  counts: HoldCounts,
  status: string,
): HoldCounts {
  if (status === 'comfortable') {
    return {
      ...counts,
      comfortable:
        counts.comfortable + 1,
    }
  }

  if (status === 'under_pressure') {
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

function capability(
  riderId: string,
  attributes: RiderAttributes,
  gradientPercent: number,
  currentEnergy = 100,
): number {
  return calculateRiderTerrainCapability({
    riderId,
    attributes,
    gradientPercent,
    currentEnergy,
  }).capabilityScore
}

function runDiagnostic():
  DiagnosticResult {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const gradientRows:
    GradientRow[] = []

  for (
    const gradientPercent of
    CONTROLLED_GRADIENTS
  ) {
    const capabilities =
      stageInput.riders
        .map((rider) => ({
          riderId:
            rider.riderId,
          riderName:
            rider.riderName,
          value:
            capability(
              rider.riderId,
              rider.attributes,
              gradientPercent,
            ),
        }))
        .sort(
          (left, right) => {
            if (
              left.value !==
              right.value
            ) {
              return (
                right.value -
                left.value
              )
            }

            return left.riderId
              .localeCompare(
                right.riderId,
              )
          },
        )

    const values =
      capabilities.map(
        (entry) =>
          entry.value,
      )

    const averageCapability =
      average(values)

    const shelter =
      calculateGroupShelter({
        groupType: 'peloton',
        groupSize:
          stageInput.riders.length,
        gradientPercent,
      })

    let counts =
      emptyCounts()

    for (
      const entry of
      capabilities
    ) {
      const hold =
        calculateRiderGroupHold({
          riderCapabilityScore:
            entry.value +
            shelter.shelterBonus,
          groupDemandScore:
            averageCapability,
          groupSpeedKmh:
            DIAGNOSTIC_GROUP_SPEED_KMH,
        })

      counts =
        addStatus(
          counts,
          hold.status,
        )
    }

    const weights =
      getTerrainCapabilityWeights(
        gradientPercent,
      )

    const top =
      capabilities[0]

    const bottom =
      capabilities[
        capabilities.length - 1
      ]

    gradientRows.push({
      gradientPercent,
      averageCapability,
      minimumCapability:
        Math.min(...values),
      maximumCapability:
        Math.max(...values),
      shelterBonus:
        shelter.shelterBonus,
      counts,
      topRiderName:
        top.riderName,
      topCapability:
        top.value,
      bottomRiderName:
        bottom.riderName,
      bottomCapability:
        bottom.value,
      flatWeight:
        weights.flat,
      climbingWeight:
        weights.climbing,
      timeTrialWeight:
        weights.timeTrial,
    })
  }

  const archetypeRows =
    CONTROLLED_GRADIENTS.map(
      (
        gradientPercent,
      ): ArchetypeRow => ({
        gradientPercent,
        flatSpecialist:
          capability(
            'synthetic-flat',
            FLAT_SPECIALIST,
            gradientPercent,
          ),
        climber:
          capability(
            'synthetic-climber',
            CLIMBER,
            gradientPercent,
          ),
        allRounder:
          capability(
            'synthetic-all-rounder',
            ALL_ROUNDER,
            gradientPercent,
          ),
      }),
    )

  const flatRow =
    gradientRows.find(
      (row) =>
        row.gradientPercent === 0,
    )

  const fivePercentRow =
    gradientRows.find(
      (row) =>
        row.gradientPercent === 5,
    )

  const eightPercentRow =
    gradientRows.find(
      (row) =>
        row.gradientPercent === 8,
    )

  const flatArchetype =
    archetypeRows.find(
      (row) =>
        row.gradientPercent === 0,
    )

  const eightPercentArchetype =
    archetypeRows.find(
      (row) =>
        row.gradientPercent === 8,
    )

  if (
    !flatRow ||
    !fivePercentRow ||
    !eightPercentRow ||
    !flatArchetype ||
    !eightPercentArchetype
  ) {
    throw new Error(
      'Terrain capability diagnostic: required controlled row is missing.',
    )
  }

  const soloShelter =
    calculateGroupShelter({
      groupType: 'peloton',
      groupSize: 1,
      gradientPercent: 0,
    })

  const breakawayShelter =
    calculateGroupShelter({
      groupType: 'breakaway',
      groupSize: 8,
      gradientPercent: 0,
    })

  const freshCapability =
    capability(
      'fresh-climber',
      CLIMBER,
      8,
      100,
    )

  const fatiguedCapability =
    capability(
      'fatigued-climber',
      CLIMBER,
      8,
      50,
    )

  const climbingWeights =
    gradientRows
      .filter(
        (row) =>
          row.gradientPercent >= 0,
      )
      .map(
        (row) =>
          row.climbingWeight,
      )

  const flatWeights =
    gradientRows
      .filter(
        (row) =>
          row.gradientPercent >= 0,
      )
      .map(
        (row) =>
          row.flatWeight,
      )

  const climbingWeightMonotonic =
    climbingWeights.every(
      (value, index) =>
        index === 0 ||
        value >=
          climbingWeights[
            index - 1
          ],
    )

  const flatWeightMonotonic =
    flatWeights.every(
      (value, index) =>
        index === 0 ||
        value <=
          flatWeights[
            index - 1
          ],
    )

  const checks = {
    exactly96Riders:
      stageInput.riders.length ===
      96,

    flatSpecialistLeadsClimberOnFlat:
      flatArchetype
        .flatSpecialist >
      flatArchetype.climber,

    climberLeadsFlatSpecialistOnSteepClimb:
      eightPercentArchetype
        .climber >
      eightPercentArchetype
        .flatSpecialist,

    climbingWeightIncreasesWithGradient:
      climbingWeightMonotonic,

    flatWeightDecreasesWithGradient:
      flatWeightMonotonic,

    flatPelotonHasNoImmediateDrops:
      flatRow.counts
        .cannotHold === 0,

    moderateClimbCanCreatePressure:
      fivePercentRow.counts
        .cannotHold > 0,

    steepClimbCreatesMorePressure:
      eightPercentRow.counts
        .cannotHold >
      flatRow.counts
        .cannotHold,

    steepClimbReducesShelter:
      eightPercentRow
        .shelterBonus <
      flatRow.shelterBonus,

    soloRiderHasNoShelter:
      soloShelter
        .shelterBonus === 0,

    breakawayHasLessShelterThanPeloton:
      breakawayShelter
        .shelterBonus <
      flatRow.shelterBonus,

    fatigueReducesCapability:
      fatiguedCapability <
      freshCapability,
  }

  return {
    passed:
      Object.values(
        checks,
      ).every(Boolean),

    riderCount:
      stageInput.riders.length,

    gradientRows,
    archetypeRows,

    flatStartCannotHold:
      flatRow.counts
        .cannotHold,

    fivePercentCannotHold:
      fivePercentRow.counts
        .cannotHold,

    eightPercentCannotHold:
      eightPercentRow.counts
        .cannotHold,

    flatShelterBonus:
      flatRow.shelterBonus,

    eightPercentShelterBonus:
      eightPercentRow
        .shelterBonus,

    soloShelterBonus:
      soloShelter
        .shelterBonus,

    breakawayShelterBonus:
      breakawayShelter
        .shelterBonus,

    freshCapability,
    fatiguedCapability,
    checks,
  }
}

function format(
  value: number,
  digits = 2,
): string {
  return value.toFixed(digits)
}

function Check({
  label,
  passed,
}: {
  readonly label: string
  readonly passed: boolean
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {passed ? 'PASS' : 'FAIL'}
      </span>
    </div>
  )
}

export default function TerrainRiderCapabilityDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => {
        try {
          return {
            ok: true as const,
            value:
              runDiagnostic(),
          }
        } catch (error) {
          return {
            ok: false as const,
            message:
              error instanceof Error
                ? error.message
                : String(error),
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
            Phase 7B.3 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain rider capability failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>
        </section>
      </main>
    )
  }

  const value =
    result.value

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.3 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain rider capability
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Read-only calibration of terrain-specific rider capability and
            group shelter. The formulas are not connected to movement or group
            transitions.
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
              ? 'PASS — terrain capability and shelter behave directionally as intended'
              : 'FAIL — one or more terrain-capability checks need recalibration'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              'Riders',
              value.riderCount,
            ],
            [
              'Cannot hold · 0%',
              value.flatStartCannotHold,
            ],
            [
              'Cannot hold · 5%',
              value.fivePercentCannotHold,
            ],
            [
              'Cannot hold · 8%',
              value.eightPercentCannotHold,
            ],
          ].map(
            ([label, number]) => (
              <article
                key={String(label)}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {label}
                </div>

                <div className="mt-2 text-2xl font-semibold">
                  {number}
                </div>
              </article>
            ),
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Real Rio rider field
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Demand equals the field’s average terrain capability. Shelter is
              added to each rider before the existing groupHold classification.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Gradient
                  </th>
                  <th className="px-3 py-3">
                    Capability min / avg / max
                  </th>
                  <th className="px-3 py-3">
                    Shelter
                  </th>
                  <th className="px-3 py-3">
                    C / P / D
                  </th>
                  <th className="px-3 py-3">
                    Flat / climb / TT weights
                  </th>
                  <th className="px-3 py-3">
                    Top rider
                  </th>
                  <th className="px-3 py-3">
                    Bottom rider
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.gradientRows.map(
                  (row) => (
                    <tr
                      key={row.gradientPercent}
                      className="border-t border-slate-800"
                    >
                      <td className="px-3 py-3">
                        {row.gradientPercent > 0
                          ? '+'
                          : ''}
                        {row.gradientPercent}%
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {format(
                          row.minimumCapability,
                        )}
                        {' / '}
                        {format(
                          row.averageCapability,
                        )}
                        {' / '}
                        {format(
                          row.maximumCapability,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.shelterBonus,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.counts.comfortable}
                        {' / '}
                        {row.counts.underPressure}
                        {' / '}
                        {row.counts.cannotHold}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {format(
                          row.flatWeight,
                          3,
                        )}
                        {' / '}
                        {format(
                          row.climbingWeight,
                          3,
                        )}
                        {' / '}
                        {format(
                          row.timeTrialWeight,
                          3,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {row.topRiderName}
                        {' · '}
                        {format(
                          row.topCapability,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {row.bottomRiderName}
                        {' · '}
                        {format(
                          row.bottomCapability,
                        )}
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
              Controlled rider archetypes
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
                </tr>
              </thead>

              <tbody>
                {value.archetypeRows.map(
                  (row) => (
                    <tr
                      key={row.gradientPercent}
                      className="border-t border-slate-800"
                    >
                      <td className="px-3 py-3">
                        {row.gradientPercent > 0
                          ? '+'
                          : ''}
                        {row.gradientPercent}%
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.flatSpecialist,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.climber,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.allRounder,
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
            Shelter and fatigue
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                96-rider peloton · 0%
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.flatShelterBonus,
                )}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                96-rider peloton · 8%
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.eightPercentShelterBonus,
                )}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Solo rider · 0%
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.soloShelterBonus,
                )}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                8-rider breakaway · 0%
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.breakawayShelterBonus,
                )}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Fresh climber · 8%
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.freshCapability,
                )}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Same climber at 50 energy
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {format(
                  value.fatiguedCapability,
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            <Check
              label="Exactly 96 real riders were evaluated"
              passed={
                value.checks
                  .exactly96Riders
              }
            />

            <Check
              label="Flat specialist beats climber on flat terrain"
              passed={
                value.checks
                  .flatSpecialistLeadsClimberOnFlat
              }
            />

            <Check
              label="Climber beats flat specialist on an 8% climb"
              passed={
                value.checks
                  .climberLeadsFlatSpecialistOnSteepClimb
              }
            />

            <Check
              label="Climbing weight increases as the road rises"
              passed={
                value.checks
                  .climbingWeightIncreasesWithGradient
              }
            />

            <Check
              label="Flat weight decreases as the road rises"
              passed={
                value.checks
                  .flatWeightDecreasesWithGradient
              }
            />

            <Check
              label="A sheltered full peloton has no immediate flat-road drops"
              passed={
                value.checks
                  .flatPelotonHasNoImmediateDrops
              }
            />

            <Check
              label="A 5% climb can create rider pressure"
              passed={
                value.checks
                  .moderateClimbCanCreatePressure
              }
            />

            <Check
              label="An 8% climb creates more separation pressure than flat"
              passed={
                value.checks
                  .steepClimbCreatesMorePressure
              }
            />

            <Check
              label="An 8% climb reduces peloton shelter"
              passed={
                value.checks
                  .steepClimbReducesShelter
              }
            />

            <Check
              label="A solo rider receives no shelter"
              passed={
                value.checks
                  .soloRiderHasNoShelter
              }
            />

            <Check
              label="An 8-rider breakaway receives less shelter than the peloton"
              passed={
                value.checks
                  .breakawayHasLessShelterThanPeloton
              }
            />

            <Check
              label="Fatigue reduces terrain capability"
              passed={
                value.checks
                  .fatigueReducesCapability
              }
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            This diagnostic does not replace pelotonPace, does not call a group
            transition, and does not modify SimulationState. The formulas must
            be reviewed from the browser results before they are connected to
            the active engine.
          </p>
        </section>
      </div>
    </main>
  )
}
