/**
 * DeterministicEngineModeDiagnostic.tsx
 *
 * Browser-only diagnostic for the deterministic race-engine feature-mode
 * contract.
 *
 * This page:
 * - does not execute the race engine
 * - performs no persistence
 * - performs no Supabase access
 * - reads no environment variables
 * - changes no runtime configuration
 */

import {
  useState,
} from 'react'

import {
  canDeterministicOutputBecomeAuthoritative,
  canPersistShadowOutput,
  canRunReadOnlyShadow,
  DETERMINISTIC_RACE_ENGINE_MODES,
  getDeterministicEngineCapabilities,
  isDeterministicEngineEnabled,
  parseDeterministicRaceEngineMode,
  resolveDeterministicEngineCapabilities,
  type DeterministicRaceEngineMode,
} from '../../race-engine/integration/deterministicEngineMode'

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
  const checks:
    DiagnosticCheck[] = []

  checks.push(
    createCheck(
      'supportedModes',
      JSON.stringify(
        DETERMINISTIC_RACE_ENGINE_MODES,
      ) ===
        JSON.stringify([
          'disabled',
          'shadow_read_only',
          'shadow_persist_non_authoritative',
          'authoritative',
        ]),
    ),
  )

  const invalidValues:
    readonly unknown[] = [
      undefined,
      null,
      true,
      false,
      0,
      1,
      {},
      [],
      '',
      'unknown',
      'shadow',
      'enabled',
      'production',
    ]

  checks.push(
    createCheck(
      'invalidValuesDefaultToDisabled',
      invalidValues.every(
        (value) =>
          parseDeterministicRaceEngineMode(
            value,
          ) === 'disabled',
      ),
    ),
  )

  checks.push(
    createCheck(
      'normalizesWhitespaceAndCase',
      parseDeterministicRaceEngineMode(
        '  SHADOW_READ_ONLY  ',
      ) ===
        'shadow_read_only' &&
        parseDeterministicRaceEngineMode(
          'Authoritative',
        ) ===
          'authoritative',
    ),
  )

  const expectedCapabilities:
    readonly {
      readonly mode:
        DeterministicRaceEngineMode
      readonly canRun: boolean
      readonly canPersist: boolean
      readonly canBecomeAuthoritative:
        boolean
    }[] = [
      {
        mode: 'disabled',
        canRun: false,
        canPersist: false,
        canBecomeAuthoritative:
          false,
      },
      {
        mode: 'shadow_read_only',
        canRun: true,
        canPersist: false,
        canBecomeAuthoritative:
          false,
      },
      {
        mode:
          'shadow_persist_non_authoritative',
        canRun: true,
        canPersist: true,
        canBecomeAuthoritative:
          false,
      },
      {
        mode: 'authoritative',
        canRun: true,
        canPersist: true,
        canBecomeAuthoritative:
          true,
      },
    ]

  for (
    const expected of
    expectedCapabilities
  ) {
    const capabilities =
      getDeterministicEngineCapabilities(
        expected.mode,
      )

    checks.push(
      createCheck(
        `${expected.mode}:canRun`,
        capabilities.canRun ===
          expected.canRun &&
          isDeterministicEngineEnabled(
            expected.mode,
          ) === expected.canRun &&
          canRunReadOnlyShadow(
            expected.mode,
          ) === expected.canRun,
      ),
    )

    checks.push(
      createCheck(
        `${expected.mode}:canPersist`,
        capabilities.canPersist ===
          expected.canPersist &&
          canPersistShadowOutput(
            expected.mode,
          ) ===
            expected.canPersist,
      ),
    )

    checks.push(
      createCheck(
        `${expected.mode}:canBecomeAuthoritative`,
        capabilities
          .canBecomeAuthoritative ===
          expected
            .canBecomeAuthoritative &&
          canDeterministicOutputBecomeAuthoritative(
            expected.mode,
          ) ===
            expected
              .canBecomeAuthoritative,
      ),
    )
  }

  checks.push(
    createCheck(
      'invalidRuntimeConfigurationIsFullyDisabled',
      JSON.stringify(
        resolveDeterministicEngineCapabilities(
          'unsupported-mode',
        ),
      ) ===
        JSON.stringify({
          mode: 'disabled',
          canRun: false,
          canPersist: false,
          canBecomeAuthoritative:
            false,
        }),
    ),
  )

  checks.push(
    createCheck(
      'nonAuthoritativePersistenceCannotGainAuthority',
      resolveDeterministicEngineCapabilities(
        'shadow_persist_non_authoritative',
      ).canBecomeAuthoritative ===
        false,
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

export default function DeterministicEngineModeDiagnostic() {
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
          Deterministic Engine Mode
        </h1>

        <p
          style={{
            maxWidth: '760px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Verifies the disabled-by-default
          permission contract without
          executing the race engine or
          reading runtime configuration.
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
          Run mode diagnostic
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
                    key={
                      check.name
                    }
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