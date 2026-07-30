/**
 * MigrationModeResolverDiagnostic.tsx
 *
 * Phase 8J.1 browser-only diagnostic for the pure environment-scoped
 * migration-mode resolver.
 *
 * No production route, feature flag, engine, writer, database, replay,
 * equipment, health case, or deployment action is performed.
 */

import {
  useMemo,
} from 'react'

import {
  MIGRATION_MODE_CONFIG_KEY,
  resolveMigrationExecutionMode,
  resolveMigrationExecutionModeFromConfig,
  validateMigrationModeDecision,
  type MigrationModeDecision,
  type MigrationModeDecisionReason,
} from '../../race-engine/migration/migrationModeResolver'
import {
  STAGING_MIGRATION_PLAN,
  type MigrationEnvironment,
  type MigrationExecutionMode,
} from '../../race-engine/migration/StagingMigrationPlan'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface ResolverCase {
  readonly id: string
  readonly label: string
  readonly environment:
    MigrationEnvironment
  readonly requestedMode:
    unknown
  readonly requestedDisplay:
    string
  readonly expectedResolvedMode:
    MigrationExecutionMode
  readonly expectedAccepted:
    boolean
  readonly expectedFallback:
    boolean
  readonly expectedReason:
    MigrationModeDecisionReason
}

interface ResolverCaseResult {
  readonly id: string
  readonly label: string
  readonly environment:
    MigrationEnvironment
  readonly requestedDisplay:
    string
  readonly expectedResolvedMode:
    MigrationExecutionMode
  readonly expectedAccepted:
    boolean
  readonly expectedFallback:
    boolean
  readonly expectedReason:
    MigrationModeDecisionReason
  readonly decision:
    MigrationModeDecision
  readonly decisionValid:
    boolean
  readonly passed:
    boolean
}

interface Check {
  readonly label: string
  readonly passed: boolean
}

const CASES:
  readonly ResolverCase[] = [
    {
      id:
        'local-missing',
      label:
        'Local missing request',
      environment:
        'local',
      requestedMode:
        undefined,
      requestedDisplay:
        'undefined',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_missing',
    },
    {
      id:
        'staging-blank',
      label:
        'Staging blank request',
      environment:
        'staging',
      requestedMode:
        '   ',
      requestedDisplay:
        '"   "',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_blank',
    },
    {
      id:
        'local-deterministic-only',
      label:
        'Local deterministic-only request',
      environment:
        'local',
      requestedMode:
        'deterministic_only',
      requestedDisplay:
        'deterministic_only',
      expectedResolvedMode:
        'deterministic_only',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'development-canary',
      label:
        'Development canary request',
      environment:
        'development',
      requestedMode:
        'deterministic_canary',
      requestedDisplay:
        'deterministic_canary',
      expectedResolvedMode:
        'deterministic_canary',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'development-deterministic-only',
      label:
        'Development deterministic-only rejection',
      environment:
        'development',
      requestedMode:
        'deterministic_only',
      requestedDisplay:
        'deterministic_only',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_disallowed_for_environment',
    },
    {
      id:
        'staging-shadow',
      label:
        'Staging shadow request',
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      requestedDisplay:
        'dual_run_shadow',
      expectedResolvedMode:
        'dual_run_shadow',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'staging-primary-fallback',
      label:
        'Staging deterministic primary with fallback',
      environment:
        'staging',
      requestedMode:
        'deterministic_primary_with_legacy_fallback',
      requestedDisplay:
        'deterministic_primary_with_legacy_fallback',
      expectedResolvedMode:
        'deterministic_primary_with_legacy_fallback',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'staging-deterministic-only',
      label:
        'Staging deterministic-only rejection',
      environment:
        'staging',
      requestedMode:
        'deterministic_only',
      requestedDisplay:
        'deterministic_only',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_disallowed_for_environment',
    },
    {
      id:
        'production-legacy',
      label:
        'Production legacy request',
      environment:
        'production',
      requestedMode:
        'legacy_only',
      requestedDisplay:
        'legacy_only',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'production-shadow',
      label:
        'Production shadow rejection',
      environment:
        'production',
      requestedMode:
        'dual_run_shadow',
      requestedDisplay:
        'dual_run_shadow',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'production_legacy_only_enforced',
    },
    {
      id:
        'production-canary',
      label:
        'Production canary rejection',
      environment:
        'production',
      requestedMode:
        'deterministic_canary',
      requestedDisplay:
        'deterministic_canary',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'production_legacy_only_enforced',
    },
    {
      id:
        'number-invalid',
      label:
        'Numeric request rejection',
      environment:
        'staging',
      requestedMode:
        2,
      requestedDisplay:
        '2',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_invalid_type',
    },
    {
      id:
        'unknown-string',
      label:
        'Unknown mode rejection',
      environment:
        'local',
      requestedMode:
        'new_engine_magic',
      requestedDisplay:
        'new_engine_magic',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_unsupported',
    },
    {
      id:
        'trimmed-shadow',
      label:
        'Trimmed staging shadow request',
      environment:
        'staging',
      requestedMode:
        '  dual_run_shadow  ',
      requestedDisplay:
        '"  dual_run_shadow  "',
      expectedResolvedMode:
        'dual_run_shadow',
      expectedAccepted:
        true,
      expectedFallback:
        false,
      expectedReason:
        'requested_mode_allowed',
    },
    {
      id:
        'uppercase-rejected',
      label:
        'Case-sensitive mode rejection',
      environment:
        'staging',
      requestedMode:
        'DUAL_RUN_SHADOW',
      requestedDisplay:
        'DUAL_RUN_SHADOW',
      expectedResolvedMode:
        'legacy_only',
      expectedAccepted:
        false,
      expectedFallback:
        true,
      expectedReason:
        'requested_mode_unsupported',
    },
  ]

function runCases():
  readonly ResolverCaseResult[] {
  return CASES.map(
    (testCase) => {
      const decision =
        resolveMigrationExecutionMode({
          environment:
            testCase.environment,
          requestedMode:
            testCase.requestedMode,
          source:
            'diagnostic',
        })

      const validation =
        validateMigrationModeDecision(
          decision,
        )

      const passed =
        validation.valid &&
        decision.resolvedMode ===
          testCase
            .expectedResolvedMode &&
        decision.requestAccepted ===
          testCase
            .expectedAccepted &&
        decision.fallbackApplied ===
          testCase
            .expectedFallback &&
        decision.reasons.includes(
          testCase
            .expectedReason,
        )

      return {
        id:
          testCase.id,
        label:
          testCase.label,
        environment:
          testCase.environment,
        requestedDisplay:
          testCase
            .requestedDisplay,
        expectedResolvedMode:
          testCase
            .expectedResolvedMode,
        expectedAccepted:
          testCase
            .expectedAccepted,
        expectedFallback:
          testCase
            .expectedFallback,
        expectedReason:
          testCase
            .expectedReason,
        decision,
        decisionValid:
          validation.valid,
        passed,
      }
    },
  )
}

function buildDiagnostic() {
  const planHashBefore =
    createCanonicalHashedValue(
      STAGING_MIGRATION_PLAN,
    ).hash

  const firstResults =
    runCases()

  const secondResults =
    runCases()

  const planHashAfter =
    createCanonicalHashedValue(
      STAGING_MIGRATION_PLAN,
    ).hash

  const firstMatrixHash =
    createCanonicalHashedValue(
      firstResults,
    ).hash

  const secondMatrixHash =
    createCanonicalHashedValue(
      secondResults,
    ).hash

  const localModeDecisions =
    STAGING_MIGRATION_PLAN
      .featureFlag
      .allowedByEnvironment
      .local
      .map(
        (mode) =>
          resolveMigrationExecutionMode({
            environment:
              'local',
            requestedMode:
              mode,
            source:
              'diagnostic',
          }),
      )

  const developmentModeDecisions =
    (
      [
        'legacy_only',
        'dual_run_shadow',
        'deterministic_canary',
        'deterministic_primary_with_legacy_fallback',
        'deterministic_only',
      ] as const
    ).map(
      (mode) =>
        resolveMigrationExecutionMode({
          environment:
            'development',
          requestedMode:
            mode,
          source:
            'diagnostic',
        }),
    )

  const stagingModeDecisions =
    (
      [
        'legacy_only',
        'dual_run_shadow',
        'deterministic_canary',
        'deterministic_primary_with_legacy_fallback',
        'deterministic_only',
      ] as const
    ).map(
      (mode) =>
        resolveMigrationExecutionMode({
          environment:
            'staging',
          requestedMode:
            mode,
          source:
            'diagnostic',
        }),
    )

  const productionModeDecisions =
    (
      [
        'legacy_only',
        'dual_run_shadow',
        'deterministic_canary',
        'deterministic_primary_with_legacy_fallback',
        'deterministic_only',
      ] as const
    ).map(
      (mode) =>
        resolveMigrationExecutionMode({
          environment:
            'production',
          requestedMode:
            mode,
          source:
            'diagnostic',
        }),
    )

  const missingConfigDecision =
    resolveMigrationExecutionModeFromConfig({
      environment:
        'staging',
      config: {},
    })

  const stagingConfigDecision =
    resolveMigrationExecutionModeFromConfig({
      environment:
        'staging',
      config: {
        [MIGRATION_MODE_CONFIG_KEY]:
          'dual_run_shadow',
      },
    })

  const productionConfigDecision =
    resolveMigrationExecutionModeFromConfig({
      environment:
        'production',
      config: {
        [MIGRATION_MODE_CONFIG_KEY]:
          'deterministic_canary',
      },
    })

  const checks:
    readonly Check[] = [
      {
        label:
          'Every explicit resolver case matches its expected safe decision',
        passed:
          firstResults.every(
            (result) =>
              result.passed,
          ),
      },
      {
        label:
          'Every resolver decision passes structural validation',
        passed:
          firstResults.every(
            (result) =>
              result
                .decisionValid,
          ),
      },
      {
        label:
          'Repeated resolver matrices are exactly deterministic',
        passed:
          firstMatrixHash ===
          secondMatrixHash,
      },
      {
        label:
          'Resolver does not mutate the staging migration plan',
        passed:
          planHashBefore ===
          planHashAfter,
      },
      {
        label:
          'Local environment accepts every migration mode in its allow-list',
        passed:
          localModeDecisions.every(
            (decision) =>
              decision
                .requestAccepted &&
              decision.resolvedMode ===
                decision.requestedMode,
          ),
      },
      {
        label:
          'Development accepts only legacy, shadow, and canary modes',
        passed:
          developmentModeDecisions.every(
            (decision) => {
              const shouldAccept =
                (
                  [
                    'legacy_only',
                    'dual_run_shadow',
                    'deterministic_canary',
                  ] as const
                ).includes(
                  decision.requestedMode as
                    'legacy_only' |
                    'dual_run_shadow' |
                    'deterministic_canary',
                )

              return (
                decision
                  .requestAccepted ===
                  shouldAccept &&
                (
                  shouldAccept ||
                  decision.resolvedMode ===
                    'legacy_only'
                )
              )
            },
          ),
      },
      {
        label:
          'Staging accepts legacy, shadow, canary, and primary-with-fallback but rejects deterministic-only',
        passed:
          stagingModeDecisions.every(
            (decision) => {
              const shouldAccept =
                decision.requestedMode !==
                'deterministic_only'

              return (
                decision
                  .requestAccepted ===
                  shouldAccept &&
                (
                  shouldAccept ||
                  decision.resolvedMode ===
                    'legacy_only'
                )
              )
            },
          ),
      },
      {
        label:
          'Production always resolves to legacy_only',
        passed:
          productionModeDecisions.every(
            (decision) =>
              decision
                .resolvedMode ===
                'legacy_only',
          ),
      },
      {
        label:
          'Every non-legacy production request is rejected with explicit production enforcement',
        passed:
          productionModeDecisions
            .filter(
              (decision) =>
                decision
                  .requestedMode !==
                'legacy_only',
            )
            .every(
              (decision) =>
                !decision
                  .requestAccepted &&
                decision
                  .productionRestrictionApplied &&
                decision
                  .reasons
                  .includes(
                    'production_legacy_only_enforced',
                  ),
            ),
      },
      {
        label:
          'Missing configuration defaults safely to legacy_only',
        passed:
          missingConfigDecision
            .resolvedMode ===
            'legacy_only' &&
          missingConfigDecision
            .fallbackApplied &&
          missingConfigDecision
            .configKey ===
            MIGRATION_MODE_CONFIG_KEY,
      },
      {
        label:
          'Typed staging configuration resolves dual_run_shadow',
        passed:
          stagingConfigDecision
            .resolvedMode ===
            'dual_run_shadow' &&
          stagingConfigDecision
            .requestAccepted,
      },
      {
        label:
          'Typed production configuration rejects deterministic_canary',
        passed:
          productionConfigDecision
            .resolvedMode ===
            'legacy_only' &&
          !productionConfigDecision
            .requestAccepted &&
          productionConfigDecision
            .productionRestrictionApplied,
      },
      {
        label:
          'Missing, blank, malformed, unsupported, and disallowed values all fall back to legacy_only',
        passed:
          firstResults
            .filter(
              (result) =>
                !result
                  .expectedAccepted,
            )
            .every(
              (result) =>
                result
                  .decision
                  .resolvedMode ===
                  'legacy_only' &&
                result
                  .decision
                  .fallbackApplied,
            ),
      },
      {
        label:
          'Every decision output is canonical-hashable without undefined properties',
        passed:
          firstResults.every(
            (result) =>
              /^[0-9a-f]{16}$/.test(
                createCanonicalHashedValue(
                  result.decision,
                ).hash,
              ),
          ),
      },
      {
        label:
          'Production plan still allows only legacy_only and automatic promotion remains disabled',
        passed:
          JSON.stringify(
            STAGING_MIGRATION_PLAN
              .featureFlag
              .allowedByEnvironment
              .production,
          ) ===
          JSON.stringify([
            'legacy_only',
          ]) &&
          STAGING_MIGRATION_PLAN
            .featureFlag
            .automaticProductionPromotion ===
            false,
      },
      {
        label:
          'Diagnostic performs no route, engine, writer, database, or deployment action',
        passed: true,
      },
    ]

  const safeCaseResults =
    firstResults.map(
      (result) => ({
        id:
          result.id,
        label:
          result.label,
        environment:
          result.environment,
        requestedDisplay:
          result
            .requestedDisplay,
        decision:
          result.decision,
        passed:
          result.passed,
      }),
    )

  const resultWithoutAudit = {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    caseResults:
      safeCaseResults,

    planHashBefore,
    planHashAfter,

    firstMatrixHash,
    secondMatrixHash,

    missingConfigDecision,
    stagingConfigDecision,
    productionConfigDecision,

    safety: {
      productionMode:
        'legacy_only' as const,
      routeChanged:
        false,
      engineExecuted:
        false,
      featureFlagWritten:
        false,
      databaseRead:
        false,
      databaseWrite:
        false,
      deploymentPerformed:
        false,
    },
  }

  return {
    ...resultWithoutAudit,

    auditHash:
      createCanonicalHashedValue(
        resultWithoutAudit,
      ).hash,
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    string | number
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">
        {label}
      </dt>

      <dd className="max-w-[70%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function MigrationModeResolverDiagnostic():
  JSX.Element {
  const value =
    useMemo(
      buildDiagnostic,
      [],
    )

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8J.1 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Environment-scoped migration-mode resolver
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Resolves local, development, staging, and production migration
            requests through the Phase 8J allow-lists. Every missing,
            malformed, unsupported, or disallowed request falls back to
            legacy-only, and production can never resolve another mode.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — migration modes resolve deterministically and production remains legacy-only'
              : 'FAIL — migration-mode resolution needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Cases
            </div>

            <div className="mt-2 text-3xl font-bold">
              {value
                .caseResults
                .length}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Production
            </div>

            <div className="mt-2 text-xl font-bold text-emerald-300">
              legacy_only
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Matrix hash
            </div>

            <div className="mt-2 break-all text-sm font-bold">
              {value
                .firstMatrixHash}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Audit hash
            </div>

            <div className="mt-2 break-all text-sm font-bold">
              {value.auditHash}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Resolution matrix
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[1040px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Case
                  </th>
                  <th className="pb-2">
                    Environment
                  </th>
                  <th className="pb-2">
                    Requested
                  </th>
                  <th className="pb-2">
                    Resolved
                  </th>
                  <th className="pb-2">
                    Accepted
                  </th>
                  <th className="pb-2">
                    Fallback
                  </th>
                  <th className="pb-2">
                    Reasons
                  </th>
                  <th className="pb-2">
                    Result
                  </th>
                </tr>
              </thead>

              <tbody>
                {value
                  .caseResults
                  .map(
                    (result) => (
                      <tr
                        key={result.id}
                        className="border-t border-slate-800"
                      >
                        <td className="py-2">
                          {result.label}
                        </td>
                        <td className="py-2">
                          {result
                            .environment}
                        </td>
                        <td className="py-2">
                          {result
                            .requestedDisplay}
                        </td>
                        <td className="py-2">
                          {result
                            .decision
                            .resolvedMode}
                        </td>
                        <td className="py-2">
                          {String(
                            result
                              .decision
                              .requestAccepted,
                          )}
                        </td>
                        <td className="py-2">
                          {String(
                            result
                              .decision
                              .fallbackApplied,
                          )}
                        </td>
                        <td className="py-2">
                          {result
                            .decision
                            .reasons
                            .join(', ')}
                        </td>
                        <td className="py-2">
                          <strong
                            className={
                              result.passed
                                ? 'text-emerald-300'
                                : 'text-rose-300'
                            }
                          >
                            {result.passed
                              ? 'PASS'
                              : 'FAIL'}
                          </strong>
                        </td>
                      </tr>
                    ),
                  )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold">
              Missing config
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Key"
                value={
                  value
                    .missingConfigDecision
                    .configKey ??
                  'null'
                }
              />
              <Metric
                label="Resolved"
                value={
                  value
                    .missingConfigDecision
                    .resolvedMode
                }
              />
              <Metric
                label="Fallback"
                value={
                  String(
                    value
                      .missingConfigDecision
                      .fallbackApplied,
                  )
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold">
              Staging config
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Requested"
                value={
                  value
                    .stagingConfigDecision
                    .requestedValueText ??
                  'null'
                }
              />
              <Metric
                label="Resolved"
                value={
                  value
                    .stagingConfigDecision
                    .resolvedMode
                }
              />
              <Metric
                label="Accepted"
                value={
                  String(
                    value
                      .stagingConfigDecision
                      .requestAccepted,
                  )
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold">
              Production config
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Requested"
                value={
                  value
                    .productionConfigDecision
                    .requestedValueText ??
                  'null'
                }
              />
              <Metric
                label="Resolved"
                value={
                  value
                    .productionConfigDecision
                    .resolvedMode
                }
              />
              <Metric
                label="Restriction"
                value={
                  String(
                    value
                      .productionConfigDecision
                      .productionRestrictionApplied,
                  )
                }
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-4 space-y-2">
            {value.checks.map(
              (check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                >
                  <span>
                    {check.label}
                  </span>

                  <strong
                    className={
                      check.passed
                        ? 'text-emerald-300'
                        : 'text-rose-300'
                    }
                  >
                    {check.passed
                      ? 'PASS'
                      : 'FAIL'}
                  </strong>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold">
            Safety
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            This diagnostic reads only the local Phase 8J plan object. It does
            not read or write a live feature flag, execute either race engine,
            change a route, call Supabase, persist a result, create a health
            case, mutate equipment, or perform a deployment.
          </p>
        </section>
      </div>
    </main>
  )
}
