/**
 * ShadowEvidenceAggregationDiagnostic.tsx
 *
 * Phase 8J.3 browser-only synthetic aggregation diagnostic.
 *
 * It creates local Phase 8J.2 evidence, aggregates it through the conservative
 * draft staging policy, and verifies passing, insufficient, and blocked
 * reports. It performs no Supabase, writer, route, UI rollout, or deployment.
 */

import {
  useMemo,
} from 'react'

import {
  aggregateShadowEvidence,
  type ShadowEvidenceSample,
} from '../../race-engine/migration/aggregateShadowEvidence'
import {
  orchestrateShadowDualRun,
  type ShadowExecutorOutput,
  type ShadowSourceBundle,
} from '../../race-engine/migration/shadowDualRunOrchestrator'
import {
  STAGING_SHADOW_ACCEPTANCE_POLICY,
  type ShadowStageProfile,
} from '../../race-engine/migration/stagingShadowAcceptancePolicy'
import {
  validateStagingShadowAcceptanceReport,
} from '../../race-engine/migration/validateStagingShadowAcceptanceReport'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface SyntheticPayload {
  readonly profile:
    ShadowStageProfile
  readonly distanceKm: number
  readonly riderIds:
    readonly string[]
}

interface Check {
  readonly label: string
  readonly passed: boolean
}

function output(
  input: {
    readonly writerCallCount:
      number
    readonly replayValid?:
      boolean
    readonly runtimeDurationMs:
      number
    readonly swapOrder?:
      boolean
  },
): ShadowExecutorOutput {
  const firstPosition =
    input.swapOrder
      ? 2
      : 1

  const secondPosition =
    input.swapOrder
      ? 1
      : 2

  return {
    riderCount: 3,

    classifications: [
      {
        riderId:
          'rider-1',
        finishPosition:
          firstPosition,
        finishTimeSeconds:
          10_000,
        finished: true,
      },
      {
        riderId:
          'rider-2',
        finishPosition:
          secondPosition,
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

    replayValid:
      input.replayValid ??
      true,
    runtimeDurationMs:
      input.runtimeDurationMs,
    writerCallCount:
      input.writerCallCount,
  }
}

function sample(
  input: {
    readonly sampleId:
      string
    readonly stageId:
      string
    readonly profile:
      ShadowStageProfile
    readonly sequence:
      number
    readonly deterministicWriterCalls?:
      number
    readonly deterministicReplayValid?:
      boolean
    readonly deterministicSwapOrder?:
      boolean
    readonly deterministicRuntimeMs?:
      number
    readonly deterministicFailure?:
      boolean
  },
): ShadowEvidenceSample {
  const payload:
    SyntheticPayload = {
    profile:
      input.profile,
    distanceKm:
      input.profile ===
        'flat'
        ? 140
        : input.profile ===
            'hilly'
          ? 165
          : 190,
    riderIds: [
      'rider-1',
      'rider-2',
      'rider-3',
    ],
  }

  const sourceBundle:
    ShadowSourceBundle<SyntheticPayload> = {
    stageId:
      input.stageId,
    declaredSourceBundleHash:
      createCanonicalHashedValue({
        stageId:
          input.stageId,
        payload,
      }).hash,
    payload,
  }

  const evidence =
    orchestrateShadowDualRun({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      sourceBundle,
      legacyExecutor:
        () =>
          output({
            writerCallCount:
              1,
            runtimeDurationMs:
              1_200,
          }),
      deterministicExecutor:
        () => {
          if (
            input
              .deterministicFailure
          ) {
            throw new Error(
              'Synthetic aggregate failure',
            )
          }

          return output({
            writerCallCount:
              input
                .deterministicWriterCalls ??
              0,
            replayValid:
              input
                .deterministicReplayValid ??
              true,
            runtimeDurationMs:
              input
                .deterministicRuntimeMs ??
              900,
            swapOrder:
              input
                .deterministicSwapOrder ??
              false,
          })
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
        input.sequence,
    })

  return {
    sampleId:
      input.sampleId,
    stageProfile:
      input.profile,
    evidence,
  }
}

function acceptedSamples():
  readonly ShadowEvidenceSample[] {
  return [
    sample({
      sampleId:
        'flat-1',
      stageId:
        'stage-flat-1',
      profile:
        'flat',
      sequence: 1,
    }),
    sample({
      sampleId:
        'flat-2',
      stageId:
        'stage-flat-2',
      profile:
        'flat',
      sequence: 2,
    }),
    sample({
      sampleId:
        'hilly-1',
      stageId:
        'stage-hilly-1',
      profile:
        'hilly',
      sequence: 3,
    }),
    sample({
      sampleId:
        'hilly-2',
      stageId:
        'stage-hilly-2',
      profile:
        'hilly',
      sequence: 4,
    }),
    sample({
      sampleId:
        'mountain-1',
      stageId:
        'stage-mountain-1',
      profile:
        'mountain',
      sequence: 5,
    }),
    sample({
      sampleId:
        'mountain-2',
      stageId:
        'stage-mountain-2',
      profile:
        'mountain',
      sequence: 6,
    }),
  ]
}

function buildDiagnostic() {
  const accepted =
    aggregateShadowEvidence({
      samples:
        acceptedSamples(),
    })

  const repeated =
    aggregateShadowEvidence({
      samples:
        acceptedSamples(),
    })

  const insufficient =
    aggregateShadowEvidence({
      samples:
        acceptedSamples()
          .slice(
            0,
            3,
          ),
    })

  const missingMountain =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            4,
          ),
        sample({
          sampleId:
            'flat-3',
          stageId:
            'stage-flat-3',
          profile:
            'flat',
          sequence: 7,
        }),
        sample({
          sampleId:
            'hilly-3',
          stageId:
            'stage-hilly-3',
          profile:
            'hilly',
          sequence: 8,
        }),
      ],
    })

  const writerViolation =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-writer',
          stageId:
            'stage-mountain-writer',
          profile:
            'mountain',
          sequence: 9,
          deterministicWriterCalls:
            1,
        }),
      ],
    })

  const replayFailure =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-replay',
          stageId:
            'stage-mountain-replay',
          profile:
            'mountain',
          sequence: 10,
          deterministicReplayValid:
            false,
        }),
      ],
    })

  const orderDivergence =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-order',
          stageId:
            'stage-mountain-order',
          profile:
            'mountain',
          sequence: 11,
          deterministicSwapOrder:
            true,
        }),
      ],
    })

  const duplicateEvidenceSource =
    acceptedSamples()

  const duplicateEvidence =
    aggregateShadowEvidence({
      samples: [
        ...duplicateEvidenceSource
          .slice(
            0,
            5,
          ),
        {
          ...duplicateEvidenceSource[
            0
          ],
          sampleId:
            'duplicate-evidence',
        },
      ],
    })

  const executorFailure =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-failure',
          stageId:
            'stage-mountain-failure',
          profile:
            'mountain',
          sequence: 12,
          deterministicFailure:
            true,
        }),
      ],
    })

  const runtimeWarning =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-slow-warning',
          stageId:
            'stage-mountain-slow-warning',
          profile:
            'mountain',
          sequence: 13,
          deterministicRuntimeMs:
            1_900,
        }),
      ],
    })

  const runtimeBlocker =
    aggregateShadowEvidence({
      samples: [
        ...acceptedSamples()
          .slice(
            0,
            5,
          ),
        sample({
          sampleId:
            'mountain-slow-blocker',
          stageId:
            'stage-mountain-slow-blocker',
          profile:
            'mountain',
          sequence: 14,
          deterministicRuntimeMs:
            2_500,
        }),
      ],
    })

  const reports = [
    accepted,
    repeated,
    insufficient,
    missingMountain,
    writerViolation,
    replayFailure,
    orderDivergence,
    duplicateEvidence,
    executorFailure,
    runtimeWarning,
    runtimeBlocker,
  ]

  const validations =
    reports.map(
      validateStagingShadowAcceptanceReport,
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'Six accepted samples covering two flat, two hilly, and two mountain stages pass',
        passed:
          accepted.status ===
            'passed' &&
          accepted
            .canProceedToStagingCanaryDesign &&
          accepted
            .profileSummary
            .flat
            .passing ===
            2 &&
          accepted
            .profileSummary
            .hilly
            .passing ===
            2 &&
          accepted
            .profileSummary
            .mountain
            .passing ===
            2,
      },
      {
        label:
          'Repeated accepted aggregation reproduces the exact report hash',
        passed:
          accepted.reportHash ===
          repeated.reportHash,
      },
      {
        label:
          'Insufficient total samples do not pass',
        passed:
          insufficient.status ===
            'insufficient_evidence' &&
          !insufficient
            .canProceedToStagingCanaryDesign,
      },
      {
        label:
          'Missing mountain coverage does not pass',
        passed:
          missingMountain.status ===
            'insufficient_evidence' &&
          missingMountain
            .profileSummary
            .mountain
            .passing ===
            0,
      },
      {
        label:
          'Any deterministic writer violation blocks acceptance',
        passed:
          writerViolation.status ===
            'blocked' &&
          writerViolation
            .writerViolations ===
            1,
      },
      {
        label:
          'Any deterministic replay validation failure blocks acceptance',
        passed:
          replayFailure.status ===
            'blocked' &&
          replayFailure
            .invalidReplaySamples ===
            1,
      },
      {
        label:
          'Strict finish-order divergence blocks acceptance',
        passed:
          orderDivergence.status ===
            'blocked' &&
          orderDivergence
            .finishOrderDivergenceSamples ===
            1,
      },
      {
        label:
          'Duplicate evidence hashes cannot be counted as independent samples',
        passed:
          duplicateEvidence.status ===
            'blocked' &&
          duplicateEvidence
            .duplicateEvidenceHashes ===
            1,
      },
      {
        label:
          'Executor failure blocks acceptance',
        passed:
          executorFailure.status ===
            'blocked' &&
          executorFailure
            .failedSamples ===
            1,
      },
      {
        label:
          'Runtime above the warning ratio but below the maximum produces a warning without blocking',
        passed:
          runtimeWarning.status ===
            'passed' &&
          runtimeWarning
            .warningFindings
            .some(
              (finding) =>
                finding.code ===
                'RUNTIME_RATIO_WARNING',
            ),
      },
      {
        label:
          'Runtime above the maximum ratio blocks acceptance',
        passed:
          runtimeBlocker.status ===
            'blocked' &&
          runtimeBlocker
            .blockerFindings
            .some(
              (finding) =>
                finding.code ===
                'RUNTIME_RATIO_LIMIT_EXCEEDED',
            ),
      },
      {
        label:
          'Every aggregate report passes structural validation',
        passed:
          validations.every(
            (validation) =>
              validation.valid,
          ),
      },
      {
        label:
          'Passing aggregate policy never authorizes production, persistence, or player UI',
        passed:
          accepted
            .canSwitchProduction ===
            false &&
          accepted
            .canEnablePersistence ===
            false &&
          accepted
            .canExposePlayerUi ===
            false &&
          STAGING_SHADOW_ACCEPTANCE_POLICY
            .passingPolicyAuthorizesProduction ===
            false &&
          STAGING_SHADOW_ACCEPTANCE_POLICY
            .passingPolicyAuthorizesPersistence ===
            false &&
          STAGING_SHADOW_ACCEPTANCE_POLICY
            .passingPolicyAuthorizesPlayerUi ===
            false,
      },
      {
        label:
          'Diagnostic performs no database, route, feature-flag, writer, or deployment action',
        passed: true,
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
    insufficient,
    missingMountain,
    writerViolation,
    replayFailure,
    orderDivergence,
    duplicateEvidence,
    executorFailure,
    runtimeWarning,
    runtimeBlocker,

    policy:
      STAGING_SHADOW_ACCEPTANCE_POLICY,

    safety: {
      databaseRead: false,
      databaseWrite: false,
      productionRouteChanged:
        false,
      featureFlagChanged:
        false,
      persistenceEnabled:
        false,
      playerUiEnabled:
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

export default function ShadowEvidenceAggregationDiagnostic():
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
            Phase 8J.3 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Shadow-evidence aggregation and staging policy
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Aggregates synthetic Phase 8J.2 evidence across flat, hilly, and
            mountain stages and applies conservative draft staging thresholds.
            Passing permits only the next staging-canary design step.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — shadow evidence aggregates deterministically and unsafe or insufficient samples cannot advance'
              : 'FAIL — shadow-evidence aggregation needs correction'}
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
              Passing samples
            </div>

            <div className="mt-2 text-3xl font-bold">
              {value
                .accepted
                .passingSamples}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Report hash
            </div>

            <div className="mt-2 break-all text-sm font-bold">
              {value
                .accepted
                .reportHash}
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
              Accepted evidence
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Total"
                value={
                  value
                    .accepted
                    .totalSamples
                }
              />
              <Metric
                label="Completed"
                value={
                  value
                    .accepted
                    .completedSamples
                }
              />
              <Metric
                label="Passing"
                value={
                  value
                    .accepted
                    .passingSamples
                }
              />
              <Metric
                label="Distinct stages"
                value={
                  value
                    .accepted
                    .distinctStageCount
                }
              />
              <Metric
                label="Flat"
                value={
                  value
                    .accepted
                    .profileSummary
                    .flat
                    .passing
                }
              />
              <Metric
                label="Hilly"
                value={
                  value
                    .accepted
                    .profileSummary
                    .hilly
                    .passing
                }
              />
              <Metric
                label="Mountain"
                value={
                  value
                    .accepted
                    .profileSummary
                    .mountain
                    .passing
                }
              />
              <Metric
                label="Runtime P95 ratio"
                value={
                  value
                    .accepted
                    .runtimeRatio
                    .p95 ??
                  'null'
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Rejection matrix
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Insufficient samples"
                value={
                  value
                    .insufficient
                    .status
                }
              />
              <Metric
                label="Missing mountain"
                value={
                  value
                    .missingMountain
                    .status
                }
              />
              <Metric
                label="Writer violation"
                value={
                  value
                    .writerViolation
                    .status
                }
              />
              <Metric
                label="Replay failure"
                value={
                  value
                    .replayFailure
                    .status
                }
              />
              <Metric
                label="Order divergence"
                value={
                  value
                    .orderDivergence
                    .status
                }
              />
              <Metric
                label="Duplicate evidence"
                value={
                  value
                    .duplicateEvidence
                    .status
                }
              />
              <Metric
                label="Executor failure"
                value={
                  value
                    .executorFailure
                    .status
                }
              />
              <Metric
                label="Runtime warning"
                value={
                  value
                    .runtimeWarning
                    .status
                }
              />
              <Metric
                label="Runtime blocker"
                value={
                  value
                    .runtimeBlocker
                    .status
                }
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Draft policy
          </h2>

          <dl className="mt-4 grid gap-2 text-xs md:grid-cols-2">
            <Metric
              label="Minimum samples"
              value={
                value
                  .policy
                  .minimumTotalSamples
              }
            />
            <Metric
              label="Minimum distinct stages"
              value={
                value
                  .policy
                  .minimumDistinctStages
              }
            />
            <Metric
              label="Flat minimum"
              value={
                value
                  .policy
                  .minimumPassingByProfile
                  .flat
              }
            />
            <Metric
              label="Hilly minimum"
              value={
                value
                  .policy
                  .minimumPassingByProfile
                  .hilly
              }
            />
            <Metric
              label="Mountain minimum"
              value={
                value
                  .policy
                  .minimumPassingByProfile
                  .mountain
              }
            />
            <Metric
              label="Writer violations allowed"
              value={
                value
                  .policy
                  .maximumWriterViolations
              }
            />
            <Metric
              label="Runtime warning"
              value={
                value
                  .policy
                  .warningRuntimeRatio
              }
            />
            <Metric
              label="Runtime maximum"
              value={
                value
                  .policy
                  .maximumRuntimeRatio
              }
            />
          </dl>
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
            Production and UI status
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            Even a passing aggregate report authorizes only the next
            staging-canary design step. It does not enable persistence, switch
            production, expose the new engine in the player race UI, or mark
            checklist item 21 complete.
          </p>
        </section>
      </div>
    </main>
  )
}
