/**
 * DeterministicShadowGateDiagnostic.tsx
 *
 * Browser-only diagnostic for the pure deterministic shadow-execution gate.
 *
 * No database access, persistence, scheduler, environment read, or
 * authoritative promotion is performed.
 */

import {
  useState,
} from 'react'

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  runDeterministicShadow,
} from '../../race-engine/integration/runDeterministicShadow'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

interface DiagnosticCheck {
  readonly name: string
  readonly passed: boolean
}

interface DiagnosticResult {
  readonly checks:
    readonly DiagnosticCheck[]
  readonly allPassed: boolean
}

function createCheck(
  name: string,
  passed: boolean,
): DiagnosticCheck {
  return {
    name,
    passed,
  }
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

  const disabledResult =
    runDeterministicShadow(
      'disabled',
      stageInput,
    )

  const readOnlyResult =
    runDeterministicShadow(
      'shadow_read_only',
      stageInput,
    )

  const persistModeResult =
    runDeterministicShadow(
      'shadow_persist_non_authoritative',
      stageInput,
    )

  const authoritativeModeResult =
    runDeterministicShadow(
      'authoritative',
      stageInput,
    )

  const checks:
    DiagnosticCheck[] = [
      createCheck(
        'disabledIsSkipped',
        disabledResult.status ===
          'skipped',
      ),

      createCheck(
        'disabledHasNoOutput',
        disabledResult.output ===
          null,
      ),

      createCheck(
        'disabledReasonIsExplicit',
        disabledResult.reason ===
          'deterministic_engine_disabled',
      ),

      createCheck(
        'shadowReadOnlyCompletes',
        readOnlyResult.status ===
          'completed',
      ),

      createCheck(
        'persistModeCompletesInMemoryOnly',
        persistModeResult.status ===
          'completed',
      ),

      createCheck(
        'authoritativeModeCompletesInMemoryOnly',
        authoritativeModeResult.status ===
          'completed',
      ),
    ]

  const completedResults = [
    readOnlyResult,
    persistModeResult,
    authoritativeModeResult,
  ].filter(
    (
      result,
    ): result is Extract<
      typeof result,
      {
        readonly status:
          'completed'
      }
    > =>
      result.status ===
      'completed',
  )

  checks.push(
    createCheck(
      'allPermittedModesCompleted',
      completedResults.length ===
        3,
    ),
  )

  checks.push(
    createCheck(
      'allOutputsHave96Riders',
      completedResults.every(
        (result) =>
          result.output
            .finalRiderStates
            .length === 96,
      ),
    ),
  )

  checks.push(
    createCheck(
      'allOutputsHave395Snapshots',
      completedResults.every(
        (result) =>
          result.output
            .snapshots
            .length === 395,
      ),
    ),
  )

  checks.push(
    createCheck(
      'allOutputsHave98Events',
      completedResults.every(
        (result) =>
          result.output
            .events
            .length === 98,
      ),
    ),
  )

  checks.push(
    createCheck(
      'allOutputHashesMatchBaseline',
      completedResults.every(
        (result) =>
          createCanonicalHashedValue(
            result.output,
          ).hash ===
          '229fef0b88e36b02',
      ),
    ),
  )

  const hashes =
    completedResults.map(
      (result) =>
        createCanonicalHashedValue(
          result.output,
        ).hash,
    )

  checks.push(
    createCheck(
      'allPermittedModesProduceIdenticalOutput',
      new Set(hashes).size === 1,
    ),
  )

  return {
    checks,
    allPassed:
      checks.every(
        (check) =>
          check.passed,
      ),
  }
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export default function DeterministicShadowGateDiagnostic() {
  const [
    result,
    setResult,
  ] =
    useState<
      DiagnosticResult | null
    >(null)

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    )

  const handleRun = (): void => {
    setResult(null)
    setErrorMessage(null)

    try {
      setResult(
        runDiagnostic(),
      )
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      )
    }
  }

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
          maxWidth: '900px',
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

        <h1>
          Deterministic Shadow Gate
        </h1>

        <p
          style={{
            maxWidth: '760px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Verifies that disabled mode
          refuses execution and permitted
          modes produce the frozen Rio
          output entirely in memory.
        </p>

        <button
          type="button"
          onClick={handleRun}
          style={{
            marginTop: '12px',
            padding: '12px 20px',
            border: 0,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Run shadow-gate diagnostic
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

        {result !== null && (
          <section
            style={{
              marginTop: '24px',
              padding: '24px',
              border:
                result.allPassed
                  ? '1px solid #44d17a'
                  : '1px solid #ff6b6b',
              borderRadius: '10px',
              background: '#0d1a2a',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              {result.allPassed
                ? 'PASS'
                : 'FAIL'}
            </h2>

            <ul
              style={{
                paddingLeft: '20px',
                lineHeight: 1.8,
              }}
            >
              {result.checks.map(
                (check) => (
                  <li
                    key={check.name}
                  >
                    <strong>
                      {check.passed
                        ? 'PASS'
                        : 'FAIL'}
                    </strong>
                    {' — '}
                    {check.name}
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}