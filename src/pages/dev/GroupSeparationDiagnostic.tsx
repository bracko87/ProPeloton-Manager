/**
 * GroupSeparationDiagnostic.tsx
 *
 * Phase 7B browser-only, read-only diagnostic.
 *
 * Runs the current Rio Stage 1 deterministic engine tick by tick and compares
 * actual group membership with classifications from calculateRiderGroupHold().
 * The steady/hard/severe demand values are diagnostic scenarios only.
 */

import { useMemo } from 'react'

import type { RiderState } from '../../race-engine/domain/RiderState'
import type { SimulationState } from '../../race-engine/domain/SimulationState'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import { createCanonicalHashedValue } from '../../race-engine/simulation/canonicalSerialization'
import { createInitialState } from '../../race-engine/simulation/createInitialState'
import {
  calculateRiderGroupHold,
  type RiderGroupHoldStatus,
} from '../../race-engine/simulation/groupHold'
import { calculatePelotonBasePace } from '../../race-engine/simulation/pelotonPace'
import { simulateMultiGroupTick } from '../../race-engine/simulation/simulateMultiGroupTick'
import { validateSimulationState } from '../../race-engine/validation/validateSimulationState'
import { rioStage1SourceRows } from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type HoldCounts = {
  comfortable: number
  underPressure: number
  cannotHold: number
}

type TickRow = {
  raceSecond: number
  distanceKm: number
  activeGroupCount: number
  racingRiderCount: number
  minimumEnergy: number
  averageEnergy: number
  maximumEnergy: number
  fatiguedRiderCount: number
  steadyDemand: number
  hardDemand: number
  severeDemand: number
  steady: HoldCounts
  hard: HoldCounts
  severe: HoldCounts
}

type Trigger = {
  raceSecond: number
  distanceKm: number
  count: number
}

type Summary = {
  deterministicHash: string
  tickCount: number
  rows: readonly TickRow[]
  selectedRows: readonly TickRow[]
  stateValidationPassed: boolean
  actualMembershipChangeCount: number
  actualCreatedGroupCount: number
  maximumActiveGroupCount: number
  firstSteadyCannotHold: Trigger | null
  firstHardCannotHold: Trigger | null
  firstSevereCannotHold: Trigger | null
  peakSteadyCannotHold: number
  peakHardCannotHold: number
  peakSevereCannotHold: number
  firstFatiguedRider: Trigger | null
  minimumObservedEnergy: number
  uniqueFinishTimeCount: number
  allFinishedAtSameSecond: boolean
  finishSecond: number | null
}

type DiagnosticResult = {
  run: Summary
  repeatedRunIdentical: boolean
  noActualGroupTransition: boolean
  holdPressureExists: boolean
  conclusion:
    | 'transition_missing_with_pressure'
    | 'transition_missing_without_pressure'
    | 'transitions_detected'
}

const FATIGUE_THRESHOLD = 70

function emptyCounts(): HoldCounts {
  return { comfortable: 0, underPressure: 0, cannotHold: 0 }
}

function addStatus(counts: HoldCounts, status: RiderGroupHoldStatus): HoldCounts {
  if (status === 'comfortable') {
    return { ...counts, comfortable: counts.comfortable + 1 }
  }

  if (status === 'under_pressure') {
    return { ...counts, underPressure: counts.underPressure + 1 }
  }

  return { ...counts, cannotHold: counts.cannotHold + 1 }
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function getRacingRiders(
  state: SimulationState,
  riderIds: readonly string[],
): RiderState[] {
  return riderIds
    .map((riderId) => {
      const rider = state.riders[riderId]
      if (!rider) {
        throw new Error(`Group separation diagnostic: missing rider ${riderId}.`)
      }
      return rider
    })
    .filter((rider) => rider.stageStatus === 'racing')
    .sort((a, b) => a.riderId.localeCompare(b.riderId))
}

function analyzeState(state: SimulationState): TickRow {
  const activeGroups = Object.values(state.groups)
    .filter((group) => group.active)
    .slice()
    .sort((a, b) => a.groupId.localeCompare(b.groupId))

  const racingRiders = Object.values(state.riders).filter(
    (rider) => rider.stageStatus === 'racing',
  )

  const energies = racingRiders.map((rider) => rider.energy)
  const demandScores: number[] = []

  let steady = emptyCounts()
  let hard = emptyCounts()
  let severe = emptyCounts()

  for (const group of activeGroups) {
    const riders = getRacingRiders(state, group.riderIds)
    if (riders.length === 0) continue

    const pace = calculatePelotonBasePace({
      riders,
      minimumSpeedKmh: state.input.settings.minimumSpeedKmh,
      maximumSpeedKmh: state.input.settings.maximumSpeedKmh,
    })

    // Diagnostic scenarios only. They are not applied to SimulationState.
    const steadyDemand = Math.min(100, Math.max(0, pace.averageCapabilityScore))
    const hardDemand = Math.min(100, steadyDemand + 5)
    const severeDemand = Math.min(100, steadyDemand + 10)

    demandScores.push(steadyDemand)

    const contributionByRiderId = new Map(
      pace.riderContributions.map((contribution) => [
        contribution.riderId,
        contribution,
      ]),
    )

    for (const rider of riders) {
      const contribution = contributionByRiderId.get(rider.riderId)
      if (!contribution) {
        throw new Error(
          `Group separation diagnostic: missing pace contribution for ${rider.riderId}.`,
        )
      }

      const common = {
        riderCapabilityScore: contribution.capabilityScore,
        groupSpeedKmh: Math.max(group.speedKmh, 0.000001),
      }

      steady = addStatus(
        steady,
        calculateRiderGroupHold({
          ...common,
          groupDemandScore: steadyDemand,
        }).status,
      )

      hard = addStatus(
        hard,
        calculateRiderGroupHold({
          ...common,
          groupDemandScore: hardDemand,
        }).status,
      )

      severe = addStatus(
        severe,
        calculateRiderGroupHold({
          ...common,
          groupDemandScore: severeDemand,
        }).status,
      )
    }
  }

  const steadyDemand = average(demandScores)

  return {
    raceSecond: state.raceSecond,
    distanceKm: state.currentKm,
    activeGroupCount: activeGroups.length,
    racingRiderCount: racingRiders.length,
    minimumEnergy: energies.length > 0 ? Math.min(...energies) : 0,
    averageEnergy: average(energies),
    maximumEnergy: energies.length > 0 ? Math.max(...energies) : 0,
    fatiguedRiderCount: racingRiders.filter(
      (rider) => rider.energy < FATIGUE_THRESHOLD,
    ).length,
    steadyDemand,
    hardDemand: Math.min(100, steadyDemand + 5),
    severeDemand: Math.min(100, steadyDemand + 10),
    steady,
    hard,
    severe,
  }
}

function firstTrigger(
  rows: readonly TickRow[],
  getCount: (row: TickRow) => number,
): Trigger | null {
  const row = rows.find((candidate) => getCount(candidate) > 0)
  return row
    ? {
        raceSecond: row.raceSecond,
        distanceKm: row.distanceKm,
        count: getCount(row),
      }
    : null
}

function nearestRow(rows: readonly TickRow[], targetKm: number): TickRow {
  const row = rows
    .slice()
    .sort((a, b) => {
      const difference =
        Math.abs(a.distanceKm - targetKm) - Math.abs(b.distanceKm - targetKm)
      return difference !== 0 ? difference : a.raceSecond - b.raceSecond
    })[0]

  if (!row) throw new Error('Group separation diagnostic produced no rows.')
  return row
}

function selectRows(rows: readonly TickRow[], distanceKm: number): TickRow[] {
  const selected = [0, 0.25, 0.5, 0.75, 0.9, 1].map((fraction) =>
    nearestRow(rows, distanceKm * fraction),
  )

  const firstSteady = rows.find((row) => row.steady.cannotHold > 0)
  const firstFatigued = rows.find((row) => row.fatiguedRiderCount > 0)

  if (firstSteady) selected.push(firstSteady)
  if (firstFatigued) selected.push(firstFatigued)

  return Array.from(new Map(selected.map((row) => [row.raceSecond, row])).values()).sort(
    (a, b) => a.raceSecond - b.raceSecond,
  )
}

function runOnce(): Summary {
  const sourceRows: CreateStageInputFromSourceRowsParams = rioStage1SourceRows
  const input = createStageInputFromSourceRows(sourceRows)

  let state = createInitialState(input)
  validateSimulationState(state)

  const rows: TickRow[] = [analyzeState(state)]
  let actualMembershipChangeCount = 0
  let actualCreatedGroupCount = 0
  let tickCount = 0
  let stateValidationPassed = true

  while (!state.completed) {
    const previousState = state
    const previousGroupIds = new Set(Object.keys(previousState.groups))
    const tick = simulateMultiGroupTick(previousState)

    tickCount += 1

    // Preserve the final racing group before finish application deactivates it.
    rows.push(analyzeState(tick.appliedEnergy.state))

    for (const rider of Object.values(tick.state.riders)) {
      const previousRider = previousState.riders[rider.riderId]
      if (
        previousRider &&
        previousRider.currentGroupId !== rider.currentGroupId
      ) {
        actualMembershipChangeCount += 1
      }
    }

    for (const groupId of Object.keys(tick.state.groups)) {
      if (!previousGroupIds.has(groupId)) actualCreatedGroupCount += 1
    }

    try {
      validateSimulationState(tick.state)
    } catch (error) {
      stateValidationPassed = false
      throw error
    }

    state = tick.state
  }

  const finishTimes = Object.values(state.riders)
    .map((rider) => rider.finishTimeSeconds)
    .filter((value): value is number => typeof value === 'number')

  const uniqueFinishTimes = Array.from(new Set(finishTimes)).sort((a, b) => a - b)

  const canonical = createCanonicalHashedValue({
    finalState: state,
    rows,
    tickCount,
    actualMembershipChangeCount,
    actualCreatedGroupCount,
  })

  return {
    deterministicHash: canonical.hash,
    tickCount,
    rows,
    selectedRows: selectRows(rows, input.distanceKm),
    stateValidationPassed,
    actualMembershipChangeCount,
    actualCreatedGroupCount,
    maximumActiveGroupCount: Math.max(...rows.map((row) => row.activeGroupCount)),
    firstSteadyCannotHold: firstTrigger(rows, (row) => row.steady.cannotHold),
    firstHardCannotHold: firstTrigger(rows, (row) => row.hard.cannotHold),
    firstSevereCannotHold: firstTrigger(rows, (row) => row.severe.cannotHold),
    peakSteadyCannotHold: Math.max(...rows.map((row) => row.steady.cannotHold)),
    peakHardCannotHold: Math.max(...rows.map((row) => row.hard.cannotHold)),
    peakSevereCannotHold: Math.max(...rows.map((row) => row.severe.cannotHold)),
    firstFatiguedRider: firstTrigger(rows, (row) => row.fatiguedRiderCount),
    minimumObservedEnergy: Math.min(...rows.map((row) => row.minimumEnergy)),
    uniqueFinishTimeCount: uniqueFinishTimes.length,
    allFinishedAtSameSecond: uniqueFinishTimes.length === 1,
    finishSecond: uniqueFinishTimes.length === 1 ? uniqueFinishTimes[0] : null,
  }
}

function buildResult(): DiagnosticResult {
  const runA = runOnce()
  const runB = runOnce()

  const repeatedRunIdentical =
    runA.deterministicHash === runB.deterministicHash &&
    JSON.stringify(runA) === JSON.stringify(runB)

  const noActualGroupTransition =
    runA.actualMembershipChangeCount === 0 &&
    runA.actualCreatedGroupCount === 0 &&
    runA.maximumActiveGroupCount === 1

  const holdPressureExists =
    runA.peakSteadyCannotHold > 0 ||
    runA.peakHardCannotHold > 0 ||
    runA.peakSevereCannotHold > 0

  return {
    run: runA,
    repeatedRunIdentical,
    noActualGroupTransition,
    holdPressureExists,
    conclusion: noActualGroupTransition
      ? holdPressureExists
        ? 'transition_missing_with_pressure'
        : 'transition_missing_without_pressure'
      : 'transitions_detected',
  }
}

function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remaining = whole % 60
  return [hours, minutes, remaining]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function formatTrigger(trigger: Trigger | null): string {
  return trigger
    ? `${trigger.distanceKm.toFixed(1)} km · ${formatSeconds(trigger.raceSecond)} · ${trigger.count}`
    : 'Never'
}

function conclusionTitle(conclusion: DiagnosticResult['conclusion']): string {
  if (conclusion === 'transition_missing_with_pressure') {
    return 'CONFIRMED — riders meet diagnostic drop conditions, but no group transition occurs'
  }

  if (conclusion === 'transition_missing_without_pressure') {
    return 'CONFIRMED — no transition occurs, and the tested hold scenarios do not produce a drop'
  }

  return 'Group transitions were detected — review the current engine before adding new logic'
}

function conclusionText(conclusion: DiagnosticResult['conclusion']): string {
  if (conclusion === 'transition_missing_with_pressure') {
    return 'The existing hold utility classifies riders as unable to hold under at least one transparent diagnostic demand scenario. The tick still creates no new group and changes no rider currentGroupId.'
  }

  if (conclusion === 'transition_missing_without_pressure') {
    return 'The tick has no transition step. The tested demand scenarios also never classify a rider as unable to hold, so demand calibration would be required as well.'
  }

  return 'The supplied engine already changes group membership or creates groups. Do not add another transition implementation until this behavior is reviewed.'
}

function Pill({
  passed,
  passLabel = 'PASS',
  failLabel = 'FAIL',
}: {
  passed: boolean
  passLabel?: string
  failLabel?: string
}): JSX.Element {
  return (
    <span
      className={[
        'rounded-full px-3 py-1 text-xs font-semibold',
        passed ? 'bg-emerald-950 text-emerald-200' : 'bg-red-950 text-red-200',
      ].join(' ')}
    >
      {passed ? passLabel : failLabel}
    </span>
  )
}

export default function GroupSeparationDiagnostic(): JSX.Element {
  const result = useMemo(() => {
    try {
      return { ok: true as const, value: buildResult() }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }, [])

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-5xl rounded-3xl border border-red-400 bg-red-950/30 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 7B development diagnostic
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Group separation diagnostic failed</h1>
          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>
        </section>
      </main>
    )
  }

  const {
    run,
    repeatedRunIdentical,
    noActualGroupTransition,
    holdPressureExists,
    conclusion,
  } = result.value

  const cards = [
    ['Ticks', run.tickCount],
    ['Maximum active groups', run.maximumActiveGroupCount],
    ['Actual membership changes', run.actualMembershipChangeCount],
    ['Actual groups created', run.actualCreatedGroupCount],
    ['Peak cannot hold · steady', run.peakSteadyCannotHold],
    ['Peak cannot hold · hard', run.peakHardCannotHold],
    ['Peak cannot hold · severe', run.peakSevereCannotHold],
    ['Unique finish times', run.uniqueFinishTimeCount],
  ] as const

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B development diagnostic
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Group separation</h1>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Runs the current Rio Stage 1 engine tick by tick. Actual membership is compared
            with read-only groupHold classifications. Steady, hard and severe demand scores
            are diagnostic scenarios only and are not applied to the race.
          </p>
        </header>

        <section className="rounded-3xl border border-amber-400 bg-amber-950/25 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            Diagnostic conclusion
          </div>
          <h2 className="mt-2 text-2xl font-semibold">{conclusionTitle(conclusion)}</h2>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            {conclusionText(conclusion)}
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-semibold">{value}</div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">First diagnostic triggers</h2>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              ['First cannot hold · steady', formatTrigger(run.firstSteadyCannotHold)],
              ['First cannot hold · hard', formatTrigger(run.firstHardCannotHold)],
              ['First cannot hold · severe', formatTrigger(run.firstSevereCannotHold)],
              ['First rider below 70 energy', formatTrigger(run.firstFatiguedRider)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-950 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-2 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">Selected race checkpoints</h2>
            <p className="mt-1 text-sm text-slate-400">
              C / P / D means comfortable / under pressure / cannot hold.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Distance</th>
                  <th className="px-3 py-3">Groups</th>
                  <th className="px-3 py-3">Riders</th>
                  <th className="px-3 py-3">Energy min / avg / max</th>
                  <th className="px-3 py-3">Fatigued</th>
                  <th className="px-3 py-3">Demand steady / hard / severe</th>
                  <th className="px-3 py-3">Steady C / P / D</th>
                  <th className="px-3 py-3">Hard C / P / D</th>
                  <th className="px-3 py-3">Severe C / P / D</th>
                </tr>
              </thead>
              <tbody>
                {run.selectedRows.map((row) => (
                  <tr key={row.raceSecond} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-3 py-3">{formatSeconds(row.raceSecond)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.distanceKm.toFixed(1)} km</td>
                    <td className="px-3 py-3">{row.activeGroupCount}</td>
                    <td className="px-3 py-3">{row.racingRiderCount}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.minimumEnergy.toFixed(1)} / {row.averageEnergy.toFixed(1)} / {row.maximumEnergy.toFixed(1)}
                    </td>
                    <td className="px-3 py-3">{row.fatiguedRiderCount}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.steadyDemand.toFixed(1)} / {row.hardDemand.toFixed(1)} / {row.severeDemand.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.steady.comfortable} / {row.steady.underPressure} / {row.steady.cannotHold}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.hard.comfortable} / {row.hard.underPressure} / {row.hard.cannotHold}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.severe.comfortable} / {row.severe.underPressure} / {row.severe.cannotHold}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Structural checks</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between gap-4">
              <span>Repeated full run is identical</span>
              <Pill passed={repeatedRunIdentical} />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Every produced SimulationState validates</span>
              <Pill passed={run.stateValidationPassed} />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>No actual group transition occurs</span>
              <Pill passed={noActualGroupTransition} passLabel="CONFIRMED" />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Diagnostic hold pressure exists</span>
              <Pill passed={holdPressureExists} passLabel="YES" failLabel="NO" />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>All riders receive one identical finish second</span>
              <Pill passed={run.allFinishedAtSameSecond} passLabel="CONFIRMED" />
            </li>
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">Notes</h2>
          <p className="mt-3">
            A rider classified “cannot hold” here is not moved. This diagnostic only shows
            whether the existing hold utility can identify pressure while the tick leaves
            every membership unchanged.
          </p>
          <p className="mt-3">
            Finish time: {run.finishSecond === null ? 'multiple or unavailable' : formatSeconds(run.finishSecond)}.
            {' '}Minimum observed energy: {run.minimumObservedEnergy.toFixed(2)}.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-500">
            Diagnostic hash: {run.deterministicHash}
          </p>
        </section>
      </div>
    </main>
  )
}
