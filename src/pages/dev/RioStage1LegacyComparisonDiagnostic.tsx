/**
 * RioStage1LegacyComparisonDiagnostic.tsx
 *
 * Browser-only, read-only comparison between:
 * - the preserved Rio Stage 1 legacy fixture
 * - the deterministic TypeScript race-engine output
 *
 * No Supabase connection, persistence, API route, or scheduler is used.
 */

import {
  useState,
} from 'react'

import {
  compareLegacyStageResult,
  type LegacyStageComparisonReport,
} from '../../race-engine/integration/compareLegacyStageResult'
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
  rioStage1LegacyOutput,
} from '../../race-engine/tests/fixtures/rioStage1LegacyOutput'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

interface ComparisonDiagnosticResult {
  readonly report:
    LegacyStageComparisonReport

  readonly deterministicOutputHash:
    string

  readonly deterministicSnapshotCount:
    number

  readonly deterministicEventCount:
    number
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function runComparison():
  ComparisonDiagnosticResult {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const deterministicOutput =
    runDeterministicRoadRace(
      stageInput,
    )

  const report =
    compareLegacyStageResult(
      rioStage1LegacyOutput
        .rider_results,
      deterministicOutput,
    )

  const canonicalOutput =
    createCanonicalHashedValue(
      deterministicOutput,
    )

  return {
    report,

    deterministicOutputHash:
      canonicalOutput.hash,

    deterministicSnapshotCount:
      deterministicOutput
        .snapshots.length,

    deterministicEventCount:
      deterministicOutput
        .events.length,
  }
}

function BooleanStatus({
  value,
}: {
  readonly value: boolean
}) {
  return (
    <strong>
      {value
        ? 'YES'
        : 'NO'}
    </strong>
  )
}

export default function RioStage1LegacyComparisonDiagnostic() {
  const [
    result,
    setResult,
  ] =
    useState<
      ComparisonDiagnosticResult | null
    >(null)

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    )

  const [
    running,
    setRunning,
  ] =
    useState(false)

  const handleRun = (): void => {
    setRunning(true)
    setResult(null)
    setErrorMessage(null)

    try {
      setResult(
        runComparison(),
      )
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      )
    } finally {
      setRunning(false)
    }
  }

  const report =
    result?.report ?? null

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px',
        background: '#07111f',
        color: '#f5f7fa',
        fontFamily:
          'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            color: '#8aa4c2',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform:
              'uppercase',
          }}
        >
          Development diagnostic
        </p>

        <h1
          style={{
            margin: '0 0 12px',
          }}
        >
          Rio Stage 1 Legacy Comparison
        </h1>

        <p
          style={{
            maxWidth: '800px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Compares the preserved legacy
          visual-test fixture against the
          deterministic TypeScript engine.
          Sporting differences are reported,
          not treated as failures.
        </p>

        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          style={{
            marginTop: '12px',
            padding: '12px 20px',
            border: 0,
            borderRadius: '8px',
            cursor:
              running
                ? 'not-allowed'
                : 'pointer',
            fontWeight: 700,
          }}
        >
          {running
            ? 'Comparing…'
            : 'Run legacy comparison'}
        </button>

        {errorMessage !== null && (
          <section
            style={{
              marginTop: '24px',
              padding: '20px',
              border:
                '1px solid #ff6b6b',
              borderRadius: '10px',
              background:
                'rgba(255, 107, 107, 0.08)',
            }}
          >
            <h2>FAIL</h2>
            <pre
              style={{
                whiteSpace:
                  'pre-wrap',
              }}
            >
              {errorMessage}
            </pre>
          </section>
        )}

        {result !== null &&
          report !== null && (
            <>
              <section
                style={{
                  marginTop: '24px',
                  padding: '24px',
                  border:
                    '1px solid #23364d',
                  borderRadius: '10px',
                  background: '#0d1a2a',
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Coverage
                </h2>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(250px, 1fr) 2fr',
                    gap: '10px 20px',
                  }}
                >
                  <dt>Legacy riders</dt>
                  <dd>
                    {
                      report
                        .legacyRiderCount
                    }
                  </dd>

                  <dt>
                    Deterministic riders
                  </dt>
                  <dd>
                    {
                      report
                        .deterministicRiderCount
                    }
                  </dd>

                  <dt>Matched riders</dt>
                  <dd>
                    {
                      report
                        .matchedRiderCount
                    }
                  </dd>

                  <dt>
                    Full rider coverage
                  </dt>
                  <dd>
                    <BooleanStatus
                      value={
                        report
                          .fullRiderCoverageMatch
                      }
                    />
                  </dd>

                  <dt>
                    Missing from legacy
                  </dt>
                  <dd>
                    {
                      report
                        .missingFromLegacy
                        .length
                    }
                  </dd>

                  <dt>
                    Missing from deterministic
                  </dt>
                  <dd>
                    {
                      report
                        .missingFromDeterministic
                        .length
                    }
                  </dd>
                </dl>
              </section>

              <section
                style={{
                  marginTop: '20px',
                  padding: '24px',
                  border:
                    '1px solid #23364d',
                  borderRadius: '10px',
                  background: '#0d1a2a',
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Sporting comparison
                </h2>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(250px, 1fr) 2fr',
                    gap: '10px 20px',
                  }}
                >
                  <dt>
                    Legacy winner
                  </dt>
                  <dd>
                    {
                      report
                        .legacyWinnerRiderId ??
                      'None'
                    }
                  </dd>

                  <dt>
                    Deterministic winner
                  </dt>
                  <dd>
                    {
                      report
                        .deterministicWinnerRiderId ??
                      'None'
                    }
                  </dd>

                  <dt>Same winner</dt>
                  <dd>
                    <BooleanStatus
                      value={
                        report.sameWinner
                      }
                    />
                  </dd>

                  <dt>
                    Exact position matches
                  </dt>
                  <dd>
                    {
                      report
                        .exactPositionMatchCount
                    }
                  </dd>

                  <dt>
                    Position differences
                  </dt>
                  <dd>
                    {
                      report
                        .positionDifferences
                        .length
                    }
                  </dd>

                  <dt>
                    Maximum position delta
                  </dt>
                  <dd>
                    {
                      report
                        .maximumAbsolutePositionDelta
                    }
                  </dd>

                  <dt>
                    Total position delta
                  </dt>
                  <dd>
                    {
                      report
                        .totalAbsolutePositionDelta
                    }
                  </dd>

                  <dt>
                    Exact finish-time matches
                  </dt>
                  <dd>
                    {
                      report
                        .exactFinishTimeMatchCount
                    }
                  </dd>

                  <dt>
                    Finish-time differences
                  </dt>
                  <dd>
                    {
                      report
                        .finishTimeDifferences
                        .length
                    }
                  </dd>

                  <dt>
                    Maximum time delta
                  </dt>
                  <dd>
                    {
                      report
                        .maximumAbsoluteFinishTimeDeltaSeconds
                    }{' '}
                    seconds
                  </dd>

                  <dt>
                    Total time delta
                  </dt>
                  <dd>
                    {
                      report
                        .totalAbsoluteFinishTimeDeltaSeconds
                    }{' '}
                    seconds
                  </dd>
                </dl>
              </section>

              <section
                style={{
                  marginTop: '20px',
                  padding: '24px',
                  border:
                    '1px solid #23364d',
                  borderRadius: '10px',
                  background: '#0d1a2a',
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Contract checks
                </h2>

                <ul>
                  <li>
                    Team IDs match:{' '}
                    <BooleanStatus
                      value={
                        report
                          .allTeamIdsMatch
                      }
                    />
                  </li>

                  <li>
                    Statuses match:{' '}
                    <BooleanStatus
                      value={
                        report
                          .allStatusesMatch
                      }
                    />
                  </li>

                  <li>
                    All positions match:{' '}
                    <BooleanStatus
                      value={
                        report
                          .allPositionsMatch
                      }
                    />
                  </li>

                  <li>
                    All finish times match:{' '}
                    <BooleanStatus
                      value={
                        report
                          .allFinishTimesMatch
                      }
                    />
                  </li>
                </ul>
              </section>

              <section
                style={{
                  marginTop: '20px',
                  padding: '24px',
                  border:
                    '1px solid #23364d',
                  borderRadius: '10px',
                  background: '#0d1a2a',
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Deterministic output
                </h2>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(250px, 1fr) 2fr',
                    gap: '10px 20px',
                  }}
                >
                  <dt>Output hash</dt>
                  <dd>
                    <code>
                      {
                        result
                          .deterministicOutputHash
                      }
                    </code>
                  </dd>

                  <dt>Snapshots</dt>
                  <dd>
                    {
                      result
                        .deterministicSnapshotCount
                    }
                  </dd>

                  <dt>Events</dt>
                  <dd>
                    {
                      result
                        .deterministicEventCount
                    }
                  </dd>
                </dl>
              </section>
            </>
          )}
      </div>
    </main>
  )
}