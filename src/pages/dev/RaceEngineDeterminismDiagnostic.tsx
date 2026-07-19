/**
 * RaceEngineDeterminismDiagnostic.tsx
 *
 * Temporary in-browser diagnostic page for the Phase 2 deterministic race engine.
 * Runs a small hard-coded stage twice in-memory and compares outputs to verify
 * deterministic behavior of the isolated TypeScript engine.
 *
 * This page:
 * - Does not access Supabase or any database.
 * - Does not use the production race engine or legacy SQL functions.
 * - Uses only hard-coded in-memory test data.
 * - Is intended for temporary development use and should be removed once
 *   automated test infrastructure is available.
 */

import React, { useMemo } from 'react'

import {
  createCanonicalHashedValue,
  createInitialState,
  simulateTick,
} from '../../race-engine/simulation'
import { validateSimulationState } from '../../race-engine/validation/validateSimulationState'
import type { SimulationState } from '../../race-engine/domain/SimulationState'
import type { StageResult } from '../../race-engine/domain/SimulationOutput'
import type { StageInput } from '../../race-engine/domain/StageInput'

/**
 * DiagnosticRun
 * Result of a single deterministic diagnostic stage run.
 */
interface DiagnosticRun {
  readonly finalState: SimulationState
  readonly results: readonly StageResult[]
  readonly tickCount: number
  readonly canonicalJson: string
  readonly deterministicHash: string
}

/**
 * DiagnosticChecks
 * Boolean flags representing each individual determinism and completion check.
 */
interface DiagnosticChecks {
  readonly completeRunA: boolean
  readonly completeRunB: boolean
  readonly identicalCanonicalJson: boolean
  readonly identicalHash: boolean
  readonly identicalResults: boolean
  readonly identicalEvents: boolean
  readonly identicalRiders: boolean
  readonly identicalGroups: boolean
  readonly identicalTickCount: boolean
  readonly finalStateAValidated: boolean
  readonly finalStateBValidated: boolean
  readonly allChecksPassed: boolean
}

/**
 * DiagnosticPageResult
 * Discriminated union for the diagnostic page state: success vs error.
 */
type DiagnosticPageResult =
  | {
      readonly ok: true
      readonly runA: DiagnosticRun
      readonly runB: DiagnosticRun
      readonly checks: DiagnosticChecks
    }
  | {
      readonly ok: false
      readonly message: string
      readonly stack: string | null
    }

/**
 * diagnosticStageInput
 * Hard-coded sample StageInput-like object for deterministic diagnostic use.
 *
 * Note:
 * - Typed as StageInput so the dev-only page matches the engine contract.
 * - Must remain in-memory only and safe if accidentally deployed.
 */
const diagnosticStageInput: StageInput = {
  raceId: 'diagnostic-race-001',
  stageId: 'diagnostic-stage-001',
  stageName: 'Deterministic Engine Diagnostic',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed: 'phase-2-diagnostic-seed-v1',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds: 30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 36,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Diagnostic Team A',
      captainRiderId: 'rider-a1',
      riderIds: ['rider-a1', 'rider-a2'],
    },
    {
      teamId: 'team-b',
      teamName: 'Diagnostic Team B',
      captainRiderId: 'rider-b1',
      riderIds: ['rider-b1', 'rider-b2'],
    },
  ],
  riders: [
    {
      riderId: 'rider-a1',
      teamId: 'team-a',
      riderName: 'Alex Sprinter',
      teamName: 'Diagnostic Team A',
      role: 'captain',
      attributes: {
        flat: 75,
        sprint: 90,
        acceleration: 88,
        stamina: 74,
        resistance: 72,
        recovery: 70,
        teamwork: 78,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'Adrian Rouleur',
      teamName: 'Diagnostic Team A',
      role: 'rouleur',
      attributes: {
        flat: 86,
        sprint: 68,
        acceleration: 70,
        stamina: 84,
        resistance: 83,
        recovery: 78,
        teamwork: 82,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'Bruno Fast',
      teamName: 'Diagnostic Team B',
      role: 'captain',
      attributes: {
        flat: 78,
        sprint: 87,
        acceleration: 91,
        stamina: 76,
        resistance: 74,
        recovery: 73,
        teamwork: 77,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'Boris Worker',
      teamName: 'Diagnostic Team B',
      role: 'domestique',
      attributes: {
        flat: 82,
        sprint: 64,
        acceleration: 65,
        stamina: 87,
        resistance: 86,
        recovery: 81,
        teamwork: 89,
      },
    },
  ],
  orders: [],
}

/**
 * riderNameLookup
 * Simple lookup table from riderId to display name for the diagnostic results table.
 */
const riderNameLookup: Readonly<Record<string, string>> =
  Object.fromEntries(
    diagnosticStageInput.riders.map((rider) => [rider.riderId, rider.riderName]),
  )

/**
 * riderTeamLookup
 * Simple lookup table from riderId to team name for results rendering.
 */
const riderTeamLookup: Readonly<Record<string, string>> =
  Object.fromEntries(
    diagnosticStageInput.riders.map((rider) => [rider.riderId, rider.teamName]),
  )

/**
 * runDiagnosticStage
 * Runs the hard-coded diagnostic stage until completion using the
 * deterministic race engine, returning the final state and results.
 *
 * Behavior:
 * - Creates initial state from diagnosticStageInput.
 * - Validates initial and final state.
 * - Steps with simulateTick until completed or a 1000-tick safety limit.
 * - Captures the final StageResult list from the finishing tick.
 * - Produces a canonical JSON snapshot and deterministic hash for comparison.
 */
function runDiagnosticStage(): DiagnosticRun {
  const initialState = createInitialState(diagnosticStageInput)
  validateSimulationState(initialState)

  let state: SimulationState = initialState
  let results: readonly StageResult[] = []
  let tickCount = 0

  // Advance simulation until completion, with a safety limit.
  while (!state.completed) {
    const tickResult = simulateTick({
      state,
      settings: diagnosticStageInput.settings,
    })

    state = tickResult.state
    tickCount += 1

    if (tickResult.finishedThisTick) {
      results = tickResult.results
    }

    if (tickCount > 1000) {
      throw new Error(
        'Diagnostic simulation exceeded the 1000-tick safety limit.',
      )
    }
  }

  validateSimulationState(state)

  const canonicalValue = {
    finalState: state,
    results,
    tickCount,
  }

  const hashedValue = createCanonicalHashedValue(canonicalValue)

  return {
    finalState: state,
    results,
    tickCount,
    canonicalJson: hashedValue.canonicalJson,
    deterministicHash: hashedValue.hash,
  }
}

/**
 * getStatusColor
 * Tailwind color selection helper for check indicators.
 */
function getStatusColor(ok: boolean): string {
  return ok ? 'text-emerald-500' : 'text-red-500'
}

/**
 * getBadgeClasses
 * Returns Tailwind classes for PASS/FAIL/ERROR badges.
 */
function getBadgeClasses(kind: 'pass' | 'fail' | 'error'): string {
  if (kind === 'pass') {
    return 'inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/40'
  }

  if (kind === 'fail') {
    return 'inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/40'
  }

  return 'inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/40'
}

/**
 * RaceEngineDeterminismDiagnostic
 * Main React component rendering the deterministic engine diagnostic UI.
 */
export default function RaceEngineDeterminismDiagnostic(): JSX.Element {
  const diagnosticResult = useMemo<DiagnosticPageResult>(() => {
    try {
      const runA = runDiagnosticStage()
      const runB = runDiagnosticStage()

      const identicalCanonicalJson = runA.canonicalJson === runB.canonicalJson

      const identicalHash = runA.deterministicHash === runB.deterministicHash

      const identicalResults =
        JSON.stringify(runA.results) === JSON.stringify(runB.results)

      const identicalEvents =
        JSON.stringify(runA.finalState.events) ===
        JSON.stringify(runB.finalState.events)

      const identicalRiders =
        JSON.stringify(runA.finalState.riders) ===
        JSON.stringify(runB.finalState.riders)

      const identicalGroups =
        JSON.stringify(runA.finalState.groups) ===
        JSON.stringify(runB.finalState.groups)

      const identicalTickCount = runA.tickCount === runB.tickCount

      const allChecksPassed =
        identicalCanonicalJson &&
        identicalHash &&
        identicalResults &&
        identicalEvents &&
        identicalRiders &&
        identicalGroups &&
        runA.finalState.completed &&
        runB.finalState.completed &&
        identicalTickCount

      const checks: DiagnosticChecks = {
        completeRunA: runA.finalState.completed,
        completeRunB: runB.finalState.completed,
        identicalCanonicalJson,
        identicalHash,
        identicalResults,
        identicalEvents,
        identicalRiders,
        identicalGroups,
        identicalTickCount,
        finalStateAValidated: true,
        finalStateBValidated: true,
        allChecksPassed,
      }

      return {
        ok: true,
        runA,
        runB,
        checks,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack ?? null : null

      return {
        ok: false,
        message,
        stack,
      }
    }
  }, [])

  const isOk = diagnosticResult.ok

  const seed: string = diagnosticStageInput.seed
  const distanceKm: number = diagnosticStageInput.distanceKm
  const tickSeconds: number = diagnosticStageInput.settings.tickSeconds

  const winningResult: StageResult | undefined =
    isOk && diagnosticResult.runA.results.length > 0
      ? diagnosticResult.runA.results[0]
      : undefined

  const winningRiderId = winningResult?.riderId ?? null
  const winningRiderName =
    winningRiderId != null ? riderNameLookup[winningRiderId] ?? winningRiderId : '—'
  const winningTeamName =
    winningRiderId != null ? riderTeamLookup[winningRiderId] ?? '—' : '—'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Race Engine Determinism Diagnostic
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Temporary in-browser verification for the isolated Phase 2
            TypeScript engine. This runs a hard-coded 1 km stage twice and
            compares the outputs to confirm deterministic behavior.
          </p>
          <p className="max-w-3xl text-xs text-slate-400">
            This is temporary development tooling. It uses only hard-coded
            in-memory data, does not access Supabase, and does not activate
            the production race engine.
          </p>
        </header>

        {/* Status panel */}
        <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Determinism status
              </p>
              {isOk ? (
                diagnosticResult.checks.allChecksPassed ? (
                  <p className="text-sm font-semibold text-emerald-400">
                    PASS — IDENTICAL DETERMINISTIC OUTPUT
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-red-400">
                    FAIL — OUTPUTS ARE NOT IDENTICAL
                  </p>
                )
              ) : (
                <p className="text-sm font-semibold text-amber-400">
                  ERROR — DIAGNOSTIC COULD NOT COMPLETE
                </p>
              )}
            </div>
            <div>
              {isOk ? (
                diagnosticResult.checks.allChecksPassed ? (
                  <span className={getBadgeClasses('pass')}>All checks passed</span>
                ) : (
                  <span className={getBadgeClasses('fail')}>One or more checks failed</span>
                )
              ) : (
                <span className={getBadgeClasses('error')}>Engine error</span>
              )}
            </div>
          </div>

          {/* Individual checks */}
          <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
            {isOk ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.completeRunA)}>●</span>
                  <span>Complete run A</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.completeRunB)}>●</span>
                  <span>Complete run B</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalCanonicalJson)}>●</span>
                  <span>Identical canonical JSON</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalHash)}>●</span>
                  <span>Identical deterministic hash</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalResults)}>●</span>
                  <span>Identical results</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalEvents)}>●</span>
                  <span>Identical events</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalRiders)}>●</span>
                  <span>Identical riders</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalGroups)}>●</span>
                  <span>Identical groups</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.identicalTickCount)}>●</span>
                  <span>Identical tick count</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.finalStateAValidated)}>●</span>
                  <span>Final state A validated</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getStatusColor(diagnosticResult.checks.finalStateBValidated)}>●</span>
                  <span>Final state B validated</span>
                </div>
              </>
            ) : (
              <div className="text-xs text-amber-300">
                The diagnostic failed before completing. See the error details below.
              </div>
            )}
          </div>
        </section>

        {/* Error details */}
        {!isOk && (
          <section className="mb-6 rounded-lg border border-amber-700/70 bg-amber-950/40 p-4 text-xs text-amber-100">
            <p className="mb-1 font-semibold">Error details</p>
            <p className="mb-2 break-words text-amber-200">{diagnosticResult.message}</p>
            {diagnosticResult.stack && (
              <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug text-amber-200">
                {diagnosticResult.stack}
              </pre>
            )}
          </section>
        )}

        {/* Summary and tables */}
        {isOk && (
          <>
            {/* Summary cards */}
            <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Stage configuration
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Seed</dt>
                    <dd className="font-mono text-[11px]">{seed}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Stage distance</dt>
                    <dd>{distanceKm} km</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Tick seconds</dt>
                    <dd>{tickSeconds} s</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Run statistics
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A tick count</dt>
                    <dd>{diagnosticResult.runA.tickCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B tick count</dt>
                    <dd>{diagnosticResult.runB.tickCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A race seconds</dt>
                    <dd>{diagnosticResult.runA.finalState.raceSecond}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B race seconds</dt>
                    <dd>{diagnosticResult.runB.finalState.raceSecond}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Outcome summary
                </p>
                <dl className="space-y-1 text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Result count</dt>
                    <dd>{diagnosticResult.runA.results.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Event count</dt>
                    <dd>{diagnosticResult.runA.finalState.events.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Winning rider</dt>
                    <dd>{winningRiderName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Winning team</dt>
                    <dd>{winningTeamName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run A hash</dt>
                    <dd className="font-mono text-[11px] break-all">{diagnosticResult.runA.deterministicHash}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Run B hash</dt>
                    <dd className="font-mono text-[11px] break-all">{diagnosticResult.runB.deterministicHash}</dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* Results table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Stage results (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Rank</th>
                      <th className="px-3 py-2 text-left font-medium">Rider ID</th>
                      <th className="px-3 py-2 text-left font-medium">Rider name</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Elapsed s</th>
                      <th className="px-3 py-2 text-right font-medium">Gap s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.results.map((result) => {
                      const name = riderNameLookup[result.riderId] ?? result.riderId
                      const teamName = riderTeamLookup[result.riderId] ?? result.teamId

                      return (
                        <tr
                          key={result.rank}
                          className="border-t border-slate-800/80 odd:bg-slate-900/40"
                        >
                          <td className="px-3 py-1.5 text-left">{result.rank}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{result.riderId}</td>
                          <td className="px-3 py-1.5">{name}</td>
                          <td className="px-3 py-1.5">{teamName}</td>
                          <td className="px-3 py-1.5 capitalize">{result.status}</td>
                          <td className="px-3 py-1.5 text-right">{result.elapsedSeconds ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right">{result.gapSeconds ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Events table */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Events (Run A)</h2>
              <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Seq #</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Race s</th>
                      <th className="px-3 py-2 text-right font-medium">Km</th>
                      <th className="px-3 py-2 text-left font-medium">Actor rider</th>
                      <th className="px-3 py-2 text-left font-medium">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticResult.runA.finalState.events.map((event) => (
                      <tr
                        key={event.sequenceNumber}
                        className="border-t border-slate-800/80 odd:bg-slate-900/40"
                      >
                        <td className="px-3 py-1.5 text-left">{event.sequenceNumber}</td>
                        <td className="px-3 py-1.5 text-left">{event.eventType}</td>
                        <td className="px-3 py-1.5 text-right">{event.raceSecond}</td>
                        <td className="px-3 py-1.5 text-right">{event.kmMarker}</td>
                        <td className="px-3 py-1.5 text-left">{event.actorRiderId ?? '—'}</td>
                        <td className="px-3 py-1.5 text-left">{event.teamId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* JSON panels */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <h2 className="mb-2 text-sm font-semibold text-slate-100">Run A canonical JSON</h2>
                <pre className="max-h-72 overflow-auto rounded bg-black/60 p-2 text-[11px] leading-snug text-slate-100">
                  {diagnosticResult.runA.canonicalJson}
                </pre>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <h2 className="mb-2 text-sm font-semibold text-slate-100">Run B canonical JSON</h2>
                <pre className="max-h-72 overflow-auto rounded bg-black/60 p-2 text-[11px] leading-snug text-slate-100">
                  {diagnosticResult.runB.canonicalJson}
                </pre>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
