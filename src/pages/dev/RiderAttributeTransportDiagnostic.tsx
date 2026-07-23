/**
 * RiderAttributeTransportDiagnostic.tsx
 *
 * Phase 7B.2 browser-only, read-only diagnostic.
 *
 * Runs two isolated full-stage passes, but retains only a compact verification
 * summary from each pass. This avoids keeping two complete SimulationOutputs
 * and two complete canonical output strings in browser memory simultaneously.
 */

import { useMemo } from 'react'

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type Stats = {
  readonly minimum: number
  readonly average: number
  readonly maximum: number
}

type CompactRun = {
  readonly hash: string
  readonly canonicalJson: string
  readonly snapshots: number
  readonly events: number
  readonly finishers: number
}

type Success = {
  readonly passed: boolean
  readonly riderCount: number
  readonly exactMatches: number
  readonly missing: readonly string[]
  readonly mismatched: readonly string[]
  readonly stageInputHash: string
  readonly compactSimulationHash: string
  readonly repeatedStageInputIdentical: boolean
  readonly repeatedSimulationIdentical: boolean
  readonly snapshots: number
  readonly events: number
  readonly finishers: number
  readonly climbing: Stats
  readonly timeTrial: Stats
  readonly raceIq: Stats
}

type PageResult =
  | {
      readonly ok: true
      readonly value: Success
    }
  | {
      readonly ok: false
      readonly step: string
      readonly message: string
      readonly stack: string | null
    }

function validAttribute(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
}

function stats(
  values: readonly number[],
): Stats {
  if (values.length === 0) {
    return {
      minimum: 0,
      average: 0,
      maximum: 0,
    }
  }

  return {
    minimum: Math.min(...values),
    average:
      values.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / values.length,
    maximum: Math.max(...values),
  }
}

function compactRun(
  sourceRows:
    CreateStageInputFromSourceRowsParams,
): CompactRun {
  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const output =
    runDeterministicRoadRace(
      stageInput,
    )

  const compact =
    createCanonicalHashedValue({
      raceId: output.raceId,
      stageId: output.stageId,
      engineVersion:
        output.engineVersion,
      simulationMode:
        output.simulationMode,
      seed: output.seed,

      snapshots:
        output.snapshots.map(
          (snapshot) => ({
            frameNumber:
              snapshot.frameNumber,
            raceSecond:
              snapshot.raceSecond,
            km: snapshot.km,
            groupOrder:
              snapshot.groupOrder,
            eventSequenceNumbers:
              snapshot
                .eventSequenceNumbers,
          }),
        ),

      events:
        output.events,

      finalRiderStates:
        output.finalRiderStates.map(
          (rider) => ({
            riderId:
              rider.riderId,
            currentGroupId:
              rider.currentGroupId,
            stageStatus:
              rider.stageStatus,
            finished:
              rider.finished,
            finishPosition:
              rider.finishPosition,
            finishTimeSeconds:
              rider.finishTimeSeconds,
            distanceKm:
              rider.distanceKm,
            speedKmh:
              rider.speedKmh,
            energy:
              rider.energy,
            attributes:
              rider.attributes,
          }),
        ),
    })

  return {
    hash: compact.hash,
    canonicalJson:
      compact.canonicalJson,
    snapshots:
      output.snapshots.length,
    events:
      output.events.length,
    finishers:
      output.finalRiderStates
        .filter(
          (rider) =>
            rider.finished &&
            rider.stageStatus ===
              'finished',
        )
        .length,
  }
}

function runDiagnostic():
  PageResult {
  let step =
    'initializing'

  try {
    step =
      'reading Rio fixture'

    const sourceRows:
      CreateStageInputFromSourceRowsParams =
        rioStage1SourceRows

    step =
      'creating StageInput A'

    const stageInputA =
      createStageInputFromSourceRows(
        sourceRows,
      )

    step =
      'creating StageInput B'

    const stageInputB =
      createStageInputFromSourceRows(
        sourceRows,
      )

    step =
      'hashing StageInput A'

    const inputHashA =
      createCanonicalHashedValue(
        stageInputA,
      )

    step =
      'hashing StageInput B'

    const inputHashB =
      createCanonicalHashedValue(
        stageInputB,
      )

    step =
      'checking transported values'

    const sourceById =
      new Map(
        sourceRows.riders.map(
          (rider) => [
            rider.id,
            rider,
          ],
        ),
      )

    const missing:
      string[] = []

    const mismatched:
      string[] = []

    const climbing:
      number[] = []

    const timeTrial:
      number[] = []

    const raceIq:
      number[] = []

    let exactMatches = 0

    for (
      const rider of
      stageInputA.riders
    ) {
      const source =
        sourceById.get(
          rider.riderId,
        )

      if (!source) {
        mismatched.push(
          rider.riderId,
        )
        continue
      }

      const attributes =
        rider.attributes

      if (
        !validAttribute(
          attributes.climbing,
        ) ||
        !validAttribute(
          attributes.timeTrial,
        ) ||
        !validAttribute(
          attributes.raceIq,
        )
      ) {
        missing.push(
          rider.riderId,
        )
        continue
      }

      climbing.push(
        attributes.climbing,
      )

      timeTrial.push(
        attributes.timeTrial,
      )

      raceIq.push(
        attributes.raceIq,
      )

      if (
        attributes.climbing !==
          source.climbing ||
        attributes.timeTrial !==
          source.time_trial ||
        attributes.raceIq !==
          source.race_iq
      ) {
        mismatched.push(
          rider.riderId,
        )
        continue
      }

      exactMatches += 1
    }

    step =
      'running compact simulation A'

    const simulationA =
      compactRun(sourceRows)

    step =
      'running compact simulation B'

    const simulationB =
      compactRun(sourceRows)

    step =
      'comparing results'

    const repeatedStageInputIdentical =
      inputHashA.hash ===
        inputHashB.hash &&
      inputHashA.canonicalJson ===
        inputHashB.canonicalJson

    const repeatedSimulationIdentical =
      simulationA.hash ===
        simulationB.hash &&
      simulationA.canonicalJson ===
        simulationB.canonicalJson

    const value: Success = {
      passed:
        stageInputA.riders.length ===
          96 &&
        exactMatches === 96 &&
        missing.length === 0 &&
        mismatched.length === 0 &&
        repeatedStageInputIdentical &&
        repeatedSimulationIdentical &&
        simulationA.snapshots ===
          395 &&
        simulationA.events === 98 &&
        simulationA.finishers === 96,

      riderCount:
        stageInputA.riders.length,

      exactMatches,
      missing,
      mismatched,

      stageInputHash:
        inputHashA.hash,

      compactSimulationHash:
        simulationA.hash,

      repeatedStageInputIdentical,
      repeatedSimulationIdentical,

      snapshots:
        simulationA.snapshots,

      events:
        simulationA.events,

      finishers:
        simulationA.finishers,

      climbing:
        stats(climbing),

      timeTrial:
        stats(timeTrial),

      raceIq:
        stats(raceIq),
    }

    return {
      ok: true,
      value,
    }
  } catch (error) {
    return {
      ok: false,
      step,
      message:
        error instanceof Error
          ? error.message
          : String(error),
      stack:
        error instanceof Error
          ? error.stack ?? null
          : null,
    }
  }
}

function formatStats(
  value: Stats,
): string {
  return (
    `${value.minimum.toFixed(0)} / ` +
    `${value.average.toFixed(2)} / ` +
    `${value.maximum.toFixed(0)}`
  )
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

export default function RiderAttributeTransportDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => runDiagnostic(),
      [],
    )

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-5xl rounded-3xl border border-red-400 bg-red-950/30 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 7B.2 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Rider attribute transport failed
          </h1>

          <div className="mt-5 rounded-2xl bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-wide text-red-300">
              Failed step
            </div>

            <div className="mt-2 font-semibold">
              {result.step}
            </div>
          </div>

          <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
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
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.2 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Rider attribute transport
          </h1>
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
              ? 'PASS — exact rider performance attributes are preserved'
              : 'FAIL — rider performance attributes are incomplete or changed'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Riders', value.riderCount],
            [
              'Exact matches',
              value.exactMatches,
            ],
            [
              'Snapshots',
              value.snapshots,
            ],
            ['Events', value.events],
            [
              'Finishers',
              value.finishers,
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

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Attribute distributions
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Minimum / average / maximum
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Climbing
              </div>

              <div className="mt-2 text-lg font-semibold">
                {formatStats(
                  value.climbing,
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Time trial
              </div>

              <div className="mt-2 text-lg font-semibold">
                {formatStats(
                  value.timeTrial,
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Race IQ
              </div>

              <div className="mt-2 text-lg font-semibold">
                {formatStats(
                  value.raceIq,
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            <Check
              label="Exactly 96 riders were adapted"
              passed={
                value.riderCount === 96
              }
            />

            <Check
              label="Every rider exactly matches the exported source values"
              passed={
                value.exactMatches ===
                  96 &&
                value.mismatched
                  .length === 0
              }
            />

            <Check
              label="No required attribute is missing"
              passed={
                value.missing.length ===
                0
              }
            />

            <Check
              label="Repeated StageInput construction is identical"
              passed={
                value
                  .repeatedStageInputIdentical
              }
            />

            <Check
              label="Repeated compact simulation verification is identical"
              passed={
                value
                  .repeatedSimulationIdentical
              }
            />

            <Check
              label="All 96 riders still finish"
              passed={
                value.finishers === 96
              }
            />

            <Check
              label="Snapshot and event counts remain 395 / 98"
              passed={
                value.snapshots ===
                  395 &&
                value.events === 98
              }
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Hashes
          </h2>

          <p className="mt-3 font-mono text-xs">
            StageInput:
            {' '}
            {value.stageInputHash}
          </p>

          <p className="mt-2 font-mono text-xs">
            Compact simulation:
            {' '}
            {value
              .compactSimulationHash}
          </p>

          <p className="mt-4 leading-6">
            The compact simulation hash is not the frozen full
            SimulationOutput hash. It checks deterministic snapshots, events,
            final rider state, and attributes without retaining two complete
            outputs and canonical strings at the same time.
          </p>
        </section>
      </div>
    </main>
  )
}
