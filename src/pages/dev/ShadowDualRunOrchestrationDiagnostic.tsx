/**
 * ShadowDualRunOrchestrationDiagnostic.tsx
 *
 * Phase 8J.2 browser-only synthetic shadow dual-run diagnostic.
 *
 * Both executors are local functions. No Supabase, production route, official
 * result writer, replay writer, health writer, equipment mutation, or
 * deployment is used.
 */

import {
  useMemo,
} from 'react'

import {
  orchestrateShadowDualRun,
  type ShadowExecutor,
  type ShadowExecutorOutput,
  type ShadowSourceBundle,
} from '../../race-engine/migration/shadowDualRunOrchestrator'
import {
  validateShadowDualRunEvidence,
} from '../../race-engine/migration/validateShadowDualRunEvidence'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface SyntheticSourcePayload {
  readonly raceName: string
  readonly distanceKm: number
  readonly riderIds:
    readonly string[]
  readonly weather: {
    readonly condition: string
    readonly windSpeedKmh:
      number
  }
}

interface Check {
  readonly label: string
  readonly passed: boolean
}

const SOURCE_PAYLOAD:
  SyntheticSourcePayload = {
    raceName:
      'Phase 8J.2 synthetic staging race',
    distanceKm: 120,
    riderIds: [
      'rider-1',
      'rider-2',
      'rider-3',
    ],
    weather: {
      condition:
        'clear',
      windSpeedKmh: 8,
    },
  }

function sourceBundle():
  ShadowSourceBundle<
    SyntheticSourcePayload
  > {
  const declaredSourceBundleHash =
    createCanonicalHashedValue({
      stageId:
        'phase-8j2-stage',
      payload:
        SOURCE_PAYLOAD,
    }).hash

  return {
    stageId:
      'phase-8j2-stage',
    declaredSourceBundleHash,
    payload:
      SOURCE_PAYLOAD,
  }
}

function validOutput(
  writerCallCount: number,
): ShadowExecutorOutput {
  return {
    riderCount: 3,

    classifications: [
      {
        riderId:
          'rider-1',
        finishPosition: 1,
        finishTimeSeconds:
          10_000,
        finished: true,
      },
      {
        riderId:
          'rider-2',
        finishPosition: 2,
        finishTimeSeconds:
          10_012,
        finished: true,
      },
      {
        riderId:
          'rider-3',
        finishPosition: 3,
        finishTimeSeconds:
          10_025,
        finished: true,
      },
    ],

    events: [
      {
        eventType:
          'RIDER_FINISHED',
        raceSecond:
          10_000,
        actorRiderId:
          'rider-1',
        relatedRiderIds: [
          'rider-1',
        ],
      },
      {
        eventType:
          'RIDER_FINISHED',
        raceSecond:
          10_012,
        actorRiderId:
          'rider-2',
        relatedRiderIds: [
          'rider-2',
        ],
      },
      {
        eventType:
          'RIDER_FINISHED',
        raceSecond:
          10_025,
        actorRiderId:
          'rider-3',
        relatedRiderIds: [
          'rider-3',
        ],
      },
    ],

    replayValid: true,
    runtimeDurationMs:
      writerCallCount ===
        0
        ? 920
        : 1_180,

    writerCallCount,
  }
}

function buildDiagnostic() {
  let legacyExecutorCalls = 0
  let deterministicExecutorCalls = 0

  let legacySourceReference:
    unknown = null

  let deterministicSourceReference:
    unknown = null

  const legacyExecutor:
    ShadowExecutor<SyntheticSourcePayload> =
      (
        context,
      ) => {
        legacyExecutorCalls +=
          1

        legacySourceReference =
          context.sourceBundle

        if (
          !context.authoritative ||
          !context.writerEnabled
        ) {
          throw new Error(
            'Legacy context is not authoritative.',
          )
        }

        return validOutput(
          1,
        )
      }

  const deterministicExecutor:
    ShadowExecutor<SyntheticSourcePayload> =
      (
        context,
      ) => {
        deterministicExecutorCalls +=
          1

        deterministicSourceReference =
          context.sourceBundle

        if (
          context.authoritative ||
          context.writerEnabled
        ) {
          throw new Error(
            'Deterministic context incorrectly enables authority or writes.',
          )
        }

        return validOutput(
          0,
        )
      }

  const accepted =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor,
      deterministicExecutor,
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
      orchestrationSequence:
        1,
    })

  const repeated =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () =>
          validOutput(
            1,
          ),
      deterministicExecutor:
        () =>
          validOutput(
            0,
          ),
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
      orchestrationSequence:
        1,
    })

  const divergence =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () =>
          validOutput(
            1,
          ),
      deterministicExecutor:
        () => {
          const output =
            validOutput(
              0,
            )

          return {
            ...output,
            classifications:
              output
                .classifications
                .map(
                  (classification) =>
                    classification.riderId ===
                      'rider-1'
                      ? {
                          ...classification,
                          finishPosition: 2,
                        }
                      : classification.riderId ===
                          'rider-2'
                        ? {
                            ...classification,
                            finishPosition: 1,
                          }
                        : classification,
                ),
          }
        },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
      orchestrationSequence:
        2,
    })

  const writerViolation =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () =>
          validOutput(
            1,
          ),
      deterministicExecutor:
        () =>
          validOutput(
            1,
          ),
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
      orchestrationSequence:
        3,
    })

  let productionExecutorCalls = 0

  const productionBlocked =
    orchestrateShadowDualRun({
      environment:
        'production',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () => {
          productionExecutorCalls +=
            1

          return validOutput(
            1,
          )
        },
      deterministicExecutor:
        () => {
          productionExecutorCalls +=
            1

          return validOutput(
            0,
          )
        },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
    })

  let fallbackExecutorCalls = 0

  const missingModeBlocked =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        undefined,
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () => {
          fallbackExecutorCalls +=
            1

          return validOutput(
            1,
          )
        },
      deterministicExecutor:
        () => {
          fallbackExecutorCalls +=
            1

          return validOutput(
            0,
          )
        },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
    })

  let hashMismatchExecutorCalls =
    0

  const hashMismatchBlocked =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle: {
        ...sourceBundle(),
        declaredSourceBundleHash:
          '0000000000000000',
      },
      legacyExecutor:
        () => {
          hashMismatchExecutorCalls +=
            1

          return validOutput(
            1,
          )
        },
      deterministicExecutor:
        () => {
          hashMismatchExecutorCalls +=
            1

          return validOutput(
            0,
          )
        },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
    })

  const deterministicFailure =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle:
        sourceBundle(),
      legacyExecutor:
        () =>
          validOutput(
            1,
          ),
      deterministicExecutor:
        () => {
          throw new Error(
            'Synthetic deterministic failure',
          )
        },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          0,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
      orchestrationSequence:
        4,
    })

  const acceptedValidation =
    validateShadowDualRunEvidence(
      accepted,
    )

  const repeatedValidation =
    validateShadowDualRunEvidence(
      repeated,
    )

  const divergenceValidation =
    validateShadowDualRunEvidence(
      divergence,
    )

  const writerViolationValidation =
    validateShadowDualRunEvidence(
      writerViolation,
    )

  const productionValidation =
    validateShadowDualRunEvidence(
      productionBlocked,
    )

  const missingModeValidation =
    validateShadowDualRunEvidence(
      missingModeBlocked,
    )

  const hashMismatchValidation =
    validateShadowDualRunEvidence(
      hashMismatchBlocked,
    )

  const failureValidation =
    validateShadowDualRunEvidence(
      deterministicFailure,
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'Valid staging shadow execution passes',
        passed:
          accepted.passed &&
          accepted.status ===
            'completed' &&
          accepted
            .comparison
            ?.passed ===
            true,
      },
      {
        label:
          'Legacy and deterministic executors receive the same immutable source object',
        passed:
          legacySourceReference ===
            deterministicSourceReference &&
          accepted
            .sourceObjectShared &&
          accepted
            .sourceUnchanged,
      },
      {
        label:
          'Legacy is authoritative and deterministic is the shadow run',
        passed:
          accepted
            .authoritativeRunId ===
            accepted
              .legacyRun
              ?.runId &&
          accepted
            .shadowRunId ===
            accepted
              .deterministicRun
              ?.runId &&
          accepted
            .authoritativeRunId !==
            accepted
              .shadowRunId,
      },
      {
        label:
          'Deterministic writer remains disabled with zero writer calls',
        passed:
          accepted
            .deterministicRun
            ?.writerCallCount ===
            0 &&
          accepted
            .deterministicWriterEnabled ===
            false,
      },
      {
        label:
          'The same orchestration input reproduces the exact evidence hash',
        passed:
          accepted.evidenceHash ===
          repeated.evidenceHash,
      },
      {
        label:
          'Strict classification divergence is rejected',
        passed:
          divergence.status ===
            'completed' &&
          !divergence.passed &&
          divergence
            .comparison
            ?.finishOrderMatches ===
            false,
      },
      {
        label:
          'Deterministic writer activity is rejected',
        passed:
          writerViolation.status ===
            'completed' &&
          !writerViolation.passed &&
          writerViolation
            .comparison
            ?.legacyWriterOnly ===
            false,
      },
      {
        label:
          'Production shadow request is blocked before either executor runs',
        passed:
          productionBlocked.status ===
            'blocked' &&
          productionExecutorCalls ===
            0 &&
          productionBlocked
            .modeDecision
            .resolvedMode ===
            'legacy_only',
      },
      {
        label:
          'Missing migration mode falls back to legacy_only and blocks execution',
        passed:
          missingModeBlocked.status ===
            'blocked' &&
          fallbackExecutorCalls ===
            0 &&
          missingModeBlocked
            .modeDecision
            .fallbackApplied,
      },
      {
        label:
          'Declared source hash mismatch blocks execution before either executor runs',
        passed:
          hashMismatchBlocked.status ===
            'blocked' &&
          hashMismatchExecutorCalls ===
            0 &&
          !hashMismatchBlocked
            .sourceBundleHashMatches,
      },
      {
        label:
          'Deterministic executor failure is captured without official mutation',
        passed:
          deterministicFailure.status ===
            'failed' &&
          deterministicFailure
            .executionFailure
            ?.role ===
            'deterministic' &&
          deterministicFailure
            .officialResultMutationAllowed ===
            false,
      },
      {
        label:
          'Every evidence variant passes structural validation',
        passed:
          [
            acceptedValidation,
            repeatedValidation,
            divergenceValidation,
            writerViolationValidation,
            productionValidation,
            missingModeValidation,
            hashMismatchValidation,
            failureValidation,
          ].every(
            (validation) =>
              validation.valid,
          ),
      },
      {
        label:
          'Accepted execution calls each executor exactly once',
        passed:
          legacyExecutorCalls ===
            1 &&
          deterministicExecutorCalls ===
            1,
      },
      {
        label:
          'Accepted source hash remains identical before and after both runs',
        passed:
          accepted
            .sourceHashBefore ===
            accepted
              .sourceHashAfterLegacy &&
          accepted
            .sourceHashBefore ===
            accepted
              .sourceHashAfterDeterministic,
      },
      {
        label:
          'No database, production route, official writer, or deployment action occurs',
        passed:
          [
            accepted,
            repeated,
            divergence,
            writerViolation,
            productionBlocked,
            missingModeBlocked,
            hashMismatchBlocked,
            deterministicFailure,
          ].every(
            (evidence) =>
              evidence
                .databaseAccessed ===
                false &&
              evidence
                .productionRouteChanged ===
                false &&
              evidence
                .officialResultMutationAllowed ===
                false &&
              evidence
                .deploymentPerformed ===
                false,
          ),
      },
    ]

  const resultWithoutAudit = {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    accepted,
    repeated,
    divergence,
    writerViolation,
    productionBlocked,
    missingModeBlocked,
    hashMismatchBlocked,
    deterministicFailure,

    executorCalls: {
      acceptedLegacy:
        legacyExecutorCalls,
      acceptedDeterministic:
        deterministicExecutorCalls,
      production:
        productionExecutorCalls,
      fallback:
        fallbackExecutorCalls,
      hashMismatch:
        hashMismatchExecutorCalls,
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

export default function ShadowDualRunOrchestrationDiagnostic():
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
            Phase 8J.2 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Shadow dual-run orchestration
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Executes synthetic legacy and deterministic functions against one
            immutable source bundle, keeps legacy authoritative, disables
            deterministic writes, and produces comparison evidence only.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — shadow dual runs are deterministic, immutable, legacy-authoritative, and write-safe'
              : 'FAIL — shadow dual-run orchestration needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Accepted status
            </div>

            <div className="mt-2 text-xl font-bold text-emerald-300">
              {value
                .accepted
                .status}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Legacy writer
            </div>

            <div className="mt-2 text-3xl font-bold">
              {value
                .accepted
                .legacyRun
                ?.writerCallCount ??
                '-'}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Deterministic writer
            </div>

            <div className="mt-2 text-3xl font-bold text-emerald-300">
              {value
                .accepted
                .deterministicRun
                ?.writerCallCount ??
                '-'}
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

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Accepted shadow evidence
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Evidence hash"
                value={
                  value
                    .accepted
                    .evidenceHash
                }
              />
              <Metric
                label="Stage"
                value={
                  value
                    .accepted
                    .stageId
                }
              />
              <Metric
                label="Source hash"
                value={
                  value
                    .accepted
                    .sourceBundleHash
                }
              />
              <Metric
                label="Legacy run"
                value={
                  value
                    .accepted
                    .authoritativeRunId ??
                  'null'
                }
              />
              <Metric
                label="Shadow run"
                value={
                  value
                    .accepted
                    .shadowRunId ??
                  'null'
                }
              />
              <Metric
                label="Comparison"
                value={
                  value
                    .accepted
                    .comparison
                    ?.passed
                    ? 'PASS'
                    : 'FAIL'
                }
              />
              <Metric
                label="Source unchanged"
                value={
                  String(
                    value
                      .accepted
                      .sourceUnchanged,
                  )
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Rejection evidence
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Classification divergence"
                value={
                  value
                    .divergence
                    .passed
                    ? 'incorrectly accepted'
                    : 'blocked'
                }
              />
              <Metric
                label="Writer violation"
                value={
                  value
                    .writerViolation
                    .passed
                    ? 'incorrectly accepted'
                    : 'blocked'
                }
              />
              <Metric
                label="Production request"
                value={
                  value
                    .productionBlocked
                    .status
                }
              />
              <Metric
                label="Missing mode"
                value={
                  value
                    .missingModeBlocked
                    .status
                }
              />
              <Metric
                label="Source hash mismatch"
                value={
                  value
                    .hashMismatchBlocked
                    .status
                }
              />
              <Metric
                label="Executor failure"
                value={
                  value
                    .deterministicFailure
                    .status
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
            This diagnostic uses only synthetic local executors and comparison
            evidence. Production remains legacy-only. No Supabase call,
            official-result write, deterministic persistence, replay write,
            health-case write, equipment mutation, production route change, or
            deployment occurs.
          </p>
        </section>
      </div>
    </main>
  )
}
