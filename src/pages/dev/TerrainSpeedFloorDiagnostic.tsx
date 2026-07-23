/**
 * TerrainSpeedFloorDiagnostic.tsx
 *
 * Phase 7A browser-only, read-only diagnostic.
 *
 * Regression-checks:
 * 1. the actual full-stage multi-group movement speed path; and
 * 2. the intended terrain-floor approach that uses baseSpeedKmh × 0.35.
 *
 * The diagnostic reuses the real Rio Stage 1 rider field only to calculate a
 * production-shaped peloton base pace. It then places that same field on
 * controlled synthetic gradients so the terrain formula can be inspected
 * without changing the engine.
 *
 * No Supabase calls, persistence, schedulers, production activation, or
 * authoritative result changes occur here.
 */

import { useMemo } from 'react'

import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  calculateMultiGroupMovement,
} from '../../race-engine/simulation/multiGroupMovement'
import {
  calculateTerrainSpeed,
} from '../../race-engine/simulation/terrainSpeed'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

const CONTROLLED_GRADIENTS = [
  -12,
  -8,
  -5,
  0,
  3,
  5,
  8,
  10,
  12,
  15,
] as const

type GradientDiagnosticRow = {
  readonly gradientPercent: number
  readonly baseSpeedKmh: number
  readonly terrainMultiplier: number
  readonly unclampedSpeedKmh: number
  readonly configuredMinimumSpeedKmh: number
  readonly currentAppliedSpeedKmh: number
  readonly comparisonTerrainFloorKmh: number
  readonly comparisonAppliedSpeedKmh: number
  readonly currentClampActive: boolean
  readonly comparisonClampActive: boolean
}

type DiagnosticChecks = {
  readonly repeatedRunIdentical: boolean
  readonly flatUsesBaseSpeed: boolean
  readonly downhillFasterThanFlat: boolean
  readonly allRowsMatchComparison: boolean
  readonly fivePercentBelowConfiguredMinimum: boolean
  readonly eightPercentBelowConfiguredMinimum: boolean
  readonly twelvePercentBelowConfiguredMinimum: boolean
  readonly fifteenPercentBelowConfiguredMinimum: boolean
  readonly climbingSpeedDecreasesProgressively: boolean
  readonly noUnexpectedClampThroughFifteenPercent: boolean
}

type DiagnosticResult = {
  readonly rows: readonly GradientDiagnosticRow[]
  readonly checks: DiagnosticChecks
  readonly regressionPassed: boolean
  readonly minimumSpeedKmh: number
  readonly maximumSpeedKmh: number
}

function nearlyEqual(
  left: number,
  right: number,
  tolerance = 1e-9,
): boolean {
  return Math.abs(left - right) <= tolerance
}

function createControlledStageInput({
  baseInput,
  gradientPercent,
}: {
  readonly baseInput: StageInput
  readonly gradientPercent: number
}): StageInput {
  /*
   * Gradient calculation:
   *
   * elevation change / 1,000 metres × 100 = gradient %
   *
   * Therefore a one-kilometre segment needs gradient × 10 metres
   * of elevation change.
   */
  const startElevationMetres = 500
  const finishElevationMetres =
    startElevationMetres +
    gradientPercent * 10

  const gradientSlug =
    gradientPercent < 0
      ? `minus-${Math.abs(gradientPercent)}`
      : `plus-${gradientPercent}`

  return {
    ...baseInput,
    raceId:
      `terrain-speed-diagnostic-race-${gradientSlug}`,
    stageId:
      `terrain-speed-diagnostic-stage-${gradientSlug}`,
    stageName:
      `Controlled ${gradientPercent}% gradient`,
    distanceKm: 1,
    seed:
      `terrain-speed-diagnostic-seed-${gradientSlug}`,
    settings: {
      ...baseInput.settings,
    },
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres:
          startElevationMetres,
      },
      {
        kilometre: 1,
        elevationMetres:
          finishElevationMetres,
      },
    ],
  }
}

function createGradientDiagnosticRow({
  baseInput,
  gradientPercent,
}: {
  readonly baseInput: StageInput
  readonly gradientPercent: number
}): GradientDiagnosticRow {
  const controlledInput =
    createControlledStageInput({
      baseInput,
      gradientPercent,
    })

  const initialState =
    createInitialState(
      controlledInput,
    )

  const movement =
    calculateMultiGroupMovement(
      initialState,
    )

  const pelotonProposal =
    movement.proposals.find(
      (proposal) =>
        proposal.groupId ===
        INITIAL_PELOTON_GROUP_ID,
    )

  if (!pelotonProposal) {
    throw new Error(
      `Missing ${INITIAL_PELOTON_GROUP_ID} proposal for gradient ${gradientPercent}%.`,
    )
  }

  const comparisonTerrainFloorKmh =
    Math.max(
      1,
      pelotonProposal.baseSpeedKmh *
        0.35,
    )

  const comparison =
    calculateTerrainSpeed({
      baseSpeedKmh:
        pelotonProposal.baseSpeedKmh,
      gradientPercent,
      minimumSpeedKmh:
        comparisonTerrainFloorKmh,
      maximumSpeedKmh:
        controlledInput.settings
          .maximumSpeedKmh,
    })

  return {
    gradientPercent,
    baseSpeedKmh:
      pelotonProposal.baseSpeedKmh,
    terrainMultiplier:
      pelotonProposal.terrainMultiplier,
    unclampedSpeedKmh:
      pelotonProposal.baseSpeedKmh *
      pelotonProposal.terrainMultiplier,
    configuredMinimumSpeedKmh:
      controlledInput.settings
        .minimumSpeedKmh,
    currentAppliedSpeedKmh:
      pelotonProposal.appliedSpeedKmh,
    comparisonTerrainFloorKmh,
    comparisonAppliedSpeedKmh:
      comparison.speedKmh,
    currentClampActive:
      pelotonProposal.appliedSpeedKmh >
        (
          pelotonProposal.baseSpeedKmh *
          pelotonProposal.terrainMultiplier
        ) +
          1e-9,
    comparisonClampActive:
      comparison.speedKmh >
        comparison.unclampedSpeedKmh +
          1e-9,
  }
}

function buildDiagnosticResult():
  DiagnosticResult {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const baseInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const runA =
    CONTROLLED_GRADIENTS.map(
      (gradientPercent) =>
        createGradientDiagnosticRow({
          baseInput,
          gradientPercent,
        }),
    )

  const runB =
    CONTROLLED_GRADIENTS.map(
      (gradientPercent) =>
        createGradientDiagnosticRow({
          baseInput,
          gradientPercent,
        }),
    )

  const rowByGradient =
    new Map(
      runA.map(
        (row) => [
          row.gradientPercent,
          row,
        ],
      ),
    )

  const flat =
    rowByGradient.get(0)

  const downhill =
    rowByGradient.get(-8)

  const climbFive =
    rowByGradient.get(5)

  const climbEight =
    rowByGradient.get(8)

  const climbThree =
    rowByGradient.get(3)

  const climbTwelve =
    rowByGradient.get(12)

  const climbFifteen =
    rowByGradient.get(15)

  if (
    !flat ||
    !downhill ||
    !climbThree ||
    !climbFive ||
    !climbEight ||
    !climbTwelve ||
    !climbFifteen
  ) {
    throw new Error(
      'Required controlled gradient rows are missing.',
    )
  }

  const configuredMinimumSpeedKmh =
    baseInput.settings.minimumSpeedKmh

  const climbingRows =
    runA.filter(
      (row) =>
        row.gradientPercent >= 0 &&
        row.gradientPercent <= 15,
    )

  const checks: DiagnosticChecks = {
    repeatedRunIdentical:
      JSON.stringify(runA) ===
      JSON.stringify(runB),

    flatUsesBaseSpeed:
      nearlyEqual(
        flat.currentAppliedSpeedKmh,
        flat.baseSpeedKmh,
      ),

    downhillFasterThanFlat:
      downhill.currentAppliedSpeedKmh >
      flat.currentAppliedSpeedKmh,

    allRowsMatchComparison:
      runA.every(
        (row) =>
          nearlyEqual(
            row.currentAppliedSpeedKmh,
            row.comparisonAppliedSpeedKmh,
          ),
      ),

    fivePercentBelowConfiguredMinimum:
      climbFive.currentAppliedSpeedKmh <
      configuredMinimumSpeedKmh,

    eightPercentBelowConfiguredMinimum:
      climbEight.currentAppliedSpeedKmh <
      configuredMinimumSpeedKmh,

    twelvePercentBelowConfiguredMinimum:
      climbTwelve.currentAppliedSpeedKmh <
      configuredMinimumSpeedKmh,

    fifteenPercentBelowConfiguredMinimum:
      climbFifteen.currentAppliedSpeedKmh <
      configuredMinimumSpeedKmh,

    climbingSpeedDecreasesProgressively:
      climbThree.currentAppliedSpeedKmh >
        climbFive.currentAppliedSpeedKmh &&
      climbFive.currentAppliedSpeedKmh >
        climbEight.currentAppliedSpeedKmh &&
      climbEight.currentAppliedSpeedKmh >
        climbTwelve.currentAppliedSpeedKmh &&
      climbTwelve.currentAppliedSpeedKmh >
        climbFifteen.currentAppliedSpeedKmh,

    noUnexpectedClampThroughFifteenPercent:
      climbingRows.every(
        (row) =>
          !row.currentClampActive,
      ),
  }

  const regressionPassed =
    Object.values(checks).every(
      (passed) => passed,
    )

  return {
    rows: runA,
    checks,
    regressionPassed,
    minimumSpeedKmh:
      baseInput.settings.minimumSpeedKmh,
    maximumSpeedKmh:
      baseInput.settings.maximumSpeedKmh,
  }
}

function formatSpeed(
  value: number,
): string {
  return `${value.toFixed(2)} km/h`
}

function formatGradient(
  value: number,
): string {
  if (value > 0) {
    return `+${value}%`
  }

  return `${value}%`
}

function CheckRow({
  label,
  passed,
}: {
  readonly label: string
  readonly passed: boolean
}): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-slate-800 py-2 last:border-b-0">
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
    </li>
  )
}

export default function TerrainSpeedFloorDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => {
        try {
          return {
            ok: true as const,
            value:
              buildDiagnosticResult(),
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
            Phase 7A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain-speed diagnostic failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>
        </section>
      </main>
    )
  }

  const {
    rows,
    checks,
    regressionPassed,
    minimumSpeedKmh,
    maximumSpeedKmh,
  } = result.value

  const checkEntries: Array<
    [string, boolean]
  > = [
    [
      'Repeated controlled run is identical',
      checks.repeatedRunIdentical,
    ],
    [
      'Flat speed equals calculated base pace',
      checks.flatUsesBaseSpeed,
    ],
    [
      'Downhill speed is faster than flat speed',
      checks.downhillFasterThanFlat,
    ],
    [
      'Current movement matches the 35% terrain-floor comparison at every gradient',
      checks.allRowsMatchComparison,
    ],
    [
      '5% climb may fall below the configured cruising minimum',
      checks.fivePercentBelowConfiguredMinimum,
    ],
    [
      '8% climb may fall below the configured cruising minimum',
      checks.eightPercentBelowConfiguredMinimum,
    ],
    [
      '12% climb may fall below the configured cruising minimum',
      checks.twelvePercentBelowConfiguredMinimum,
    ],
    [
      '15% climb may fall below the configured cruising minimum',
      checks.fifteenPercentBelowConfiguredMinimum,
    ],
    [
      'Climbing speed decreases progressively from 3% to 15%',
      checks.climbingSpeedDecreasesProgressively,
    ],
    [
      'No unexpected terrain-floor clamp occurs through 15%',
      checks.noUnexpectedClampThroughFifteenPercent,
    ],
  ]

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain speed floor
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            This runs the actual multi-group movement proposal on controlled
            gradients using the production-shaped Rio rider field. It compares
            the current configured minimum-speed floor with the earlier
            terrain-only floor of 35% of calculated base pace.
          </p>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2">
              Configured minimum: {formatSpeed(minimumSpeedKmh)}
            </span>

            <span className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2">
              Configured maximum: {formatSpeed(maximumSpeedKmh)}
            </span>
          </div>
        </header>

        <section
          className={[
            'rounded-3xl border p-6',
            regressionPassed
              ? 'border-emerald-400 bg-emerald-950/25'
              : 'border-red-400 bg-red-950/25',
          ].join(' ')}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            Diagnostic conclusion
          </div>

          <h2 className="mt-2 text-2xl font-semibold">
            {regressionPassed
              ? 'PASS — terrain-speed floor regression is fixed'
              : 'FAIL — terrain-speed floor regression remains'}
          </h2>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            {regressionPassed
              ? 'The configured 36 km/h value remains the normal cruising baseline, while terrain-adjusted speed may now fall below it. Controlled climbs slow progressively and match the 35% terrain-floor comparison.'
              : 'Review the failed checks and table values before continuing.'}
          </p>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Controlled gradient results
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              “Current applied” is the exact speed returned by
              calculateMultiGroupMovement(). The configured 36 km/h value is
              shown for reference; it is no longer the final terrain floor.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Gradient</th>
                  <th className="px-4 py-3">Base pace</th>
                  <th className="px-4 py-3">Multiplier</th>
                  <th className="px-4 py-3">Unclamped</th>
                  <th className="px-4 py-3">Configured cruising minimum</th>
                  <th className="px-4 py-3">Current applied</th>
                  <th className="px-4 py-3">Current clamp</th>
                  <th className="px-4 py-3">35% floor</th>
                  <th className="px-4 py-3">Comparison applied</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.gradientPercent}
                    className="border-t border-slate-800"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {formatGradient(
                        row.gradientPercent,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatSpeed(
                        row.baseSpeedKmh,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {row.terrainMultiplier.toFixed(4)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatSpeed(
                        row.unclampedSpeedKmh,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatSpeed(
                        row.configuredMinimumSpeedKmh,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-sky-200">
                      {formatSpeed(
                        row.currentAppliedSpeedKmh,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {row.currentClampActive
                        ? 'ACTIVE'
                        : 'No'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatSpeed(
                        row.comparisonTerrainFloorKmh,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-200">
                      {formatSpeed(
                        row.comparisonAppliedSpeedKmh,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <ul className="mt-3">
            {checkEntries.map(
              ([label, passed]) => (
                <CheckRow
                  key={label}
                  label={label}
                  passed={passed}
                />
              ),
            )}
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            This page changes no engine file and performs no database work.
            It is now a permanent regression check confirming that the normal
            cruising minimum is not reused as the final terrain-adjusted floor.
          </p>
        </section>
      </div>
    </main>
  )
}
