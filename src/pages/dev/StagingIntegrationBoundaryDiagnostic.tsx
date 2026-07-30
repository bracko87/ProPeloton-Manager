/**
 * StagingIntegrationBoundaryDiagnostic.tsx
 *
 * Phase 8J.7 browser-only synthetic integration-boundary diagnostic.
 *
 * All adapters are local functions. No Supabase client, live staging source,
 * production route, persistence writer, player UI switch, or deployment is
 * used.
 */

import {
  useMemo,
} from 'react'

import type {
  GenericReplayPreview,
  StagingReadOnlySourceLoadResult,
} from '../../race-engine/migration/stagingIntegrationBoundary'
import {
  STAGING_INTEGRATION_ADAPTER_MANIFEST,
} from '../../race-engine/migration/stagingIntegrationBoundary'
import {
  runStagingIntegrationBoundary,
} from '../../race-engine/migration/runStagingIntegrationBoundary'
import type {
  ShadowExecutorOutput,
  ShadowSourceBundle,
} from '../../race-engine/migration/shadowDualRunOrchestrator'
import {
  validateStagingIntegrationBoundaryReport,
} from '../../race-engine/migration/validateStagingIntegrationBoundaryReport'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface SyntheticSourcePayload {
  readonly raceId: string
  readonly stageProfile:
    'flat'
  readonly riderIds:
    readonly string[]
}

interface Check {
  readonly label: string
  readonly passed: boolean
}

const STAGE_ID =
  'phase-8j7-stage'

const PAYLOAD:
  SyntheticSourcePayload = {
    raceId:
      'phase-8j7-race',
    stageProfile:
      'flat',
    riderIds: [
      'rider-1',
      'rider-2',
      'rider-3',
    ],
  }

function sourceBundle(
  overrides:
    Partial<
      ShadowSourceBundle<SyntheticSourcePayload>
    > = {},
):
  ShadowSourceBundle<SyntheticSourcePayload> {
  const base = {
    stageId:
      STAGE_ID,
    payload:
      PAYLOAD,
  }

  return {
    ...base,

    declaredSourceBundleHash:
      createCanonicalHashedValue(
        base,
      ).hash,

    ...overrides,
  }
}

function sourceLoad(
  overrides:
    Partial<
      StagingReadOnlySourceLoadResult<SyntheticSourcePayload>
    > = {},
):
  StagingReadOnlySourceLoadResult<SyntheticSourcePayload> {
  const bundle =
    overrides.sourceBundle ??
    sourceBundle()

  const evidence = {
    contract:
      'phase_8j7_source_load_v1',
    loaderId:
      STAGING_INTEGRATION_ADAPTER_MANIFEST
        .sourceLoaderId,
    stageId:
      STAGE_ID,
    sourceBundleHash:
      bundle
        .declaredSourceBundleHash,
    sourceRowsRead:
      4,
    databaseReadPerformed:
      false,
    liveStagingData:
      false,
    readOnly:
      true,
    databaseWriteCount:
      0,
  }

  return {
    loaderId:
      STAGING_INTEGRATION_ADAPTER_MANIFEST
        .sourceLoaderId,
    stageId:
      STAGE_ID,

    sourceBundle:
      bundle,

    sourceRowsRead:
      4,
    databaseReadPerformed:
      false,
    liveStagingData:
      false,

    readOnly:
      true,
    databaseWriteCount:
      0,

    sourceLoadHash:
      createCanonicalHashedValue(
        evidence,
      ).hash,

    ...overrides,
  }
}

function output(
  input: {
    readonly writerCallCount:
      number
    readonly replayValid?:
      boolean
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
        finished:
          true,
      },
      {
        riderId:
          'rider-2',
        finishPosition:
          secondPosition,
        finishTimeSeconds:
          10_012,
        finished:
          true,
      },
      {
        riderId:
          'rider-3',
        finishPosition: 3,
        finishTimeSeconds:
          10_025,
        finished:
          true,
      },
    ],

    events: [
      {
        eventType:
          'STAGE_STARTED',
        raceSecond: 0,
        actorRiderId:
          null,
        relatedRiderIds: [],
      },
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
    ],

    replayValid:
      input.replayValid ??
      true,

    runtimeDurationMs:
      input.writerCallCount ===
        0
        ? 900
        : 1_100,

    writerCallCount:
      input.writerCallCount,
  }
}

function preview(
  input: {
    readonly stageId: string
    readonly deterministicRunId:
      string
    readonly sourceBundleHash:
      string
    readonly classificationCount:
      number
    readonly eventCount:
      number
    readonly replaySnapshotCount?:
      number
  },
): GenericReplayPreview {
  const withoutHash = {
    previewVersion:
      'phase_8j7_generic_replay_preview_v1' as const,

    builderId:
      STAGING_INTEGRATION_ADAPTER_MANIFEST
        .genericReplayBuilderId,

    stageId:
      input.stageId,
    deterministicRunId:
      input.deterministicRunId,

    sourceBundleHash:
      input.sourceBundleHash,
    deterministicOutputHash:
      '1111111111111111',
    replayHash:
      '2222222222222222',
    genericReplayModelHash:
      '3333333333333333',

    classificationCount:
      input.classificationCount,
    eventCount:
      input.eventCount,
    replaySnapshotCount:
      input.replaySnapshotCount ??
      120,

    replayValid:
      true,

    previewOnly:
      true as const,
    persistenceWriteCount:
      0 as const,
    routeApplied:
      false as const,
    playerUiExposed:
      false as const,
  }

  return {
    ...withoutHash,

    previewHash:
      createCanonicalHashedValue(
        withoutHash,
      ).hash,
  }
}

function validInput() {
  return {
    environment:
      'staging' as const,
    requestedMode:
      'dual_run_shadow',
    stageId:
      STAGE_ID,

    sourceLoader:
      () =>
        sourceLoad(),

    legacyExecutor:
      () =>
        output({
          writerCallCount:
            0,
        }),

    deterministicExecutor:
      () =>
        output({
          writerCallCount:
            0,
        }),

    genericReplayBuilder:
      ({
        stageId,
        deterministicRun,
      }: {
        readonly stageId:
          string
        readonly deterministicRun: {
          readonly runId: string
          readonly sourceBundleHash:
            string
          readonly classifications:
            readonly unknown[]
          readonly events:
            readonly unknown[]
        }
      }) =>
        preview({
          stageId,
          deterministicRunId:
            deterministicRun.runId,
          sourceBundleHash:
            deterministicRun
              .sourceBundleHash,
          classificationCount:
            deterministicRun
              .classifications
              .length,
          eventCount:
            deterministicRun
              .events
              .length,
        }),

    legacyReplay: {
      available:
        true,
      stageId:
        STAGE_ID,
      replayIdentifier:
        'legacy-replay-phase-8j7',
    },

    candidateDiscoverySource:
      'synthetic_fixture' as const,

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
  }
}

function buildDiagnostic() {
  let acceptedSourceCalls = 0
  let acceptedLegacyCalls = 0
  let acceptedDeterministicCalls =
    0
  let acceptedPreviewCalls = 0

  const accepted =
    runStagingIntegrationBoundary({
      ...validInput(),

      sourceLoader:
        () => {
          acceptedSourceCalls +=
            1

          return sourceLoad()
        },

      legacyExecutor:
        () => {
          acceptedLegacyCalls +=
            1

          return output({
            writerCallCount:
              0,
          })
        },

      deterministicExecutor:
        () => {
          acceptedDeterministicCalls +=
            1

          return output({
            writerCallCount:
              0,
          })
        },

      genericReplayBuilder:
        ({
          stageId,
          deterministicRun,
        }) => {
          acceptedPreviewCalls +=
            1

          return preview({
            stageId,
            deterministicRunId:
              deterministicRun.runId,
            sourceBundleHash:
              deterministicRun
                .sourceBundleHash,
            classificationCount:
              deterministicRun
                .classifications
                .length,
            eventCount:
              deterministicRun
                .events
                .length,
          })
        },
    })

  const repeated =
    runStagingIntegrationBoundary(
      validInput(),
    )

  let productionCalls = 0

  const productionBlocked =
    runStagingIntegrationBoundary({
      ...validInput(),
      environment:
        'production',

      sourceLoader:
        () => {
          productionCalls +=
            1

          return sourceLoad()
        },

      legacyExecutor:
        () => {
          productionCalls +=
            1

          return output({
            writerCallCount:
              0,
          })
        },

      deterministicExecutor:
        () => {
          productionCalls +=
            1

          return output({
            writerCallCount:
              0,
          })
        },

      genericReplayBuilder:
        () => {
          productionCalls +=
            1

          throw new Error(
            'Production preview builder must not run.',
          )
        },
    })

  let developmentCalls = 0

  const developmentBlocked =
    runStagingIntegrationBoundary({
      ...validInput(),
      environment:
        'development',

      sourceLoader:
        () => {
          developmentCalls +=
            1

          return sourceLoad()
        },
    })

  let wrongModeCalls = 0

  const wrongModeBlocked =
    runStagingIntegrationBoundary({
      ...validInput(),
      requestedMode:
        'deterministic_canary',

      sourceLoader:
        () => {
          wrongModeCalls +=
            1

          return sourceLoad()
        },
    })

  const stageMismatch =
    runStagingIntegrationBoundary({
      ...validInput(),

      sourceLoader:
        () => {
          const bundle =
            sourceBundle({
              stageId:
                'other-stage',
            })

          return sourceLoad({
            sourceBundle:
              bundle,
          })
        },
    })

  const hashMismatch =
    runStagingIntegrationBoundary({
      ...validInput(),

      sourceLoader:
        () => {
          const bundle =
            sourceBundle({
              declaredSourceBundleHash:
                '0000000000000000',
            })

          return sourceLoad({
            sourceBundle:
              bundle,

            sourceLoadHash:
              createCanonicalHashedValue({
                contract:
                  'phase_8j7_source_load_v1',
                loaderId:
                  STAGING_INTEGRATION_ADAPTER_MANIFEST
                    .sourceLoaderId,
                stageId:
                  STAGE_ID,
                sourceBundleHash:
                  bundle
                    .declaredSourceBundleHash,
                sourceRowsRead:
                  4,
                databaseReadPerformed:
                  false,
                liveStagingData:
                  false,
                readOnly:
                  true,
                databaseWriteCount:
                  0,
              }).hash,
          })
        },
    })

  const sourceWriteViolation =
    runStagingIntegrationBoundary({
      ...validInput(),

      sourceLoader:
        () =>
          ({
            ...sourceLoad(),
            databaseWriteCount:
              1,
          } as unknown as
            StagingReadOnlySourceLoadResult<SyntheticSourcePayload>),
    })

  const loaderFailure =
    runStagingIntegrationBoundary({
      ...validInput(),

      sourceLoader:
        () => {
          throw new Error(
            'Synthetic source-loader failure',
          )
        },
    })

  const legacyWriterViolation =
    runStagingIntegrationBoundary({
      ...validInput(),

      legacyExecutor:
        () =>
          output({
            writerCallCount:
              1,
          }),
    })

  const deterministicWriterViolation =
    runStagingIntegrationBoundary({
      ...validInput(),

      deterministicExecutor:
        () =>
          output({
            writerCallCount:
              1,
          }),
    })

  const comparisonDivergence =
    runStagingIntegrationBoundary({
      ...validInput(),

      deterministicExecutor:
        () =>
          output({
            writerCallCount:
              0,
            swapOrder:
              true,
          }),
    })

  const replayInvalid =
    runStagingIntegrationBoundary({
      ...validInput(),

      deterministicExecutor:
        () =>
          output({
            writerCallCount:
              0,
            replayValid:
              false,
          }),
    })

  const previewFailure =
    runStagingIntegrationBoundary({
      ...validInput(),

      genericReplayBuilder:
        () => {
          throw new Error(
            'Synthetic preview-builder failure',
          )
        },
    })

  const missingPreviewSnapshots =
    runStagingIntegrationBoundary({
      ...validInput(),

      genericReplayBuilder:
        ({
          stageId,
          deterministicRun,
        }) =>
          preview({
            stageId,
            deterministicRunId:
              deterministicRun.runId,
            sourceBundleHash:
              deterministicRun
                .sourceBundleHash,
            classificationCount:
              deterministicRun
                .classifications
                .length,
            eventCount:
              deterministicRun
                .events
                .length,
            replaySnapshotCount:
              0,
          }),
    })

  const previewWriteViolation =
    runStagingIntegrationBoundary({
      ...validInput(),

      genericReplayBuilder:
        ({
          stageId,
          deterministicRun,
        }) =>
          ({
            ...preview({
              stageId,
              deterministicRunId:
                deterministicRun.runId,
              sourceBundleHash:
                deterministicRun
                  .sourceBundleHash,
              classificationCount:
                deterministicRun
                  .classifications
                  .length,
              eventCount:
                deterministicRun
                  .events
                  .length,
            }),

            persistenceWriteCount:
              1,
          } as unknown as
            GenericReplayPreview),
    })

  const reports = [
    accepted,
    repeated,
    productionBlocked,
    developmentBlocked,
    wrongModeBlocked,
    stageMismatch,
    hashMismatch,
    sourceWriteViolation,
    loaderFailure,
    legacyWriterViolation,
    deterministicWriterViolation,
    comparisonDivergence,
    replayInvalid,
    previewFailure,
    missingPreviewSnapshots,
    previewWriteViolation,
  ]

  const validations =
    reports.map(
      validateStagingIntegrationBoundaryReport,
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'Valid staging shadow boundary produces passed source, execution, and generic replay preview evidence',
        passed:
          accepted.status ===
            'completed' &&
          accepted.passed &&
          accepted
            .shadowEvidence
            ?.passed ===
            true &&
          accepted
            .genericReplayPreview
            ?.replayValid ===
            true,
      },
      {
        label:
          'Read-only source loader and both executors receive exactly one invocation',
        passed:
          acceptedSourceCalls ===
            1 &&
          acceptedLegacyCalls ===
            1 &&
          acceptedDeterministicCalls ===
            1 &&
          acceptedPreviewCalls ===
            1,
      },
      {
        label:
          'Repeated integration input reproduces the exact report hash',
        passed:
          accepted.reportHash ===
          repeated.reportHash,
      },
      {
        label:
          'Shadow mode keeps the visible route on legacy while generic preview remains discoverable',
        passed:
          accepted
            .replayRoutingDecision
            ?.routeTarget ===
            'legacy_replay' &&
          accepted
            .replayRoutingDecision
            ?.genericReplayAvailable ===
            true &&
          accepted
            .genericReplayPreview
            ?.previewOnly ===
            true,
      },
      {
        label:
          'Production is blocked before any source loader or executor invocation',
        passed:
          productionBlocked.status ===
            'blocked' &&
          productionCalls ===
            0,
      },
      {
        label:
          'Development is blocked because this integration boundary is staging-only',
        passed:
          developmentBlocked.status ===
            'blocked' &&
          developmentCalls ===
            0,
      },
      {
        label:
          'Any mode other than dual_run_shadow is blocked before source loading',
        passed:
          wrongModeBlocked.status ===
            'blocked' &&
          wrongModeCalls ===
            0,
      },
      {
        label:
          'Stage mismatch or source-bundle hash mismatch blocks execution',
        passed:
          stageMismatch.status ===
            'blocked' &&
          hashMismatch.status ===
            'blocked' &&
          !stageMismatch
            .legacyExecutorInvoked &&
          !hashMismatch
            .legacyExecutorInvoked,
      },
      {
        label:
          'Any source-loader write activity blocks execution',
        passed:
          sourceWriteViolation.status ===
            'blocked' &&
          !sourceWriteViolation
            .legacyExecutorInvoked,
      },
      {
        label:
          'Source-loader failure is captured without engine execution',
        passed:
          loaderFailure.status ===
            'failed' &&
          loaderFailure
            .failure
            ?.step ===
            'source_loader' &&
          !loaderFailure
            .legacyExecutorInvoked,
      },
      {
        label:
          'Legacy or deterministic adapter writer activity cannot pass the read-only boundary',
        passed:
          !legacyWriterViolation
            .passed &&
          !deterministicWriterViolation
            .passed,
      },
      {
        label:
          'Classification divergence blocks the integration preview',
        passed:
          comparisonDivergence.status ===
            'blocked' &&
          comparisonDivergence
            .shadowEvidence
            ?.comparison
            ?.finishOrderMatches ===
            false,
      },
      {
        label:
          'Invalid deterministic replay blocks generic replay preview creation',
        passed:
          replayInvalid.status ===
            'blocked' &&
          replayInvalid
            .genericReplayPreview ===
            null,
      },
      {
        label:
          'Generic replay builder failure is captured safely',
        passed:
          previewFailure.status ===
            'failed' &&
          previewFailure
            .failure
            ?.step ===
            'generic_replay_builder',
      },
      {
        label:
          'Missing replay snapshots or preview persistence activity blocks the preview',
        passed:
          missingPreviewSnapshots
            .status ===
            'blocked' &&
          previewWriteViolation.status ===
            'blocked',
      },
      {
        label:
          'Accepted evidence reports no live staging access because this diagnostic uses synthetic adapters',
        passed:
          accepted
            .liveStagingDataAccessed ===
            false &&
          accepted
            .sourceLoad
            ?.databaseReadPerformed ===
            false,
      },
      {
        label:
          'Every report passes structural validation',
        passed:
          validations.every(
            (validation) =>
              validation.valid,
          ),
      },
      {
        label:
          'No report enables persistence, changes production routing, exposes player UI, or marks live integration complete',
        passed:
          reports.every(
            (report) =>
              report
                .databaseWriteCount ===
                0 &&
              report
                .officialResultMutationAllowed ===
                false &&
              report
                .deterministicPersistenceEnabled ===
                false &&
              report
                .productionRouteChanged ===
                false &&
              report
                .playerUiExposed ===
                false &&
              report
                .liveIntegrationComplete ===
                false &&
              report
                .deploymentPerformed ===
                false,
          ),
      },
      {
        label:
          'Diagnostic performs no SQL, Supabase, live staging, writer, route, UI, or deployment action',
        passed:
          true,
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

    blocked: {
      production:
        productionBlocked,
      development:
        developmentBlocked,
      wrongMode:
        wrongModeBlocked,
      stageMismatch,
      hashMismatch,
      sourceWriteViolation,
      legacyWriterViolation,
      deterministicWriterViolation,
      comparisonDivergence,
      replayInvalid,
      missingPreviewSnapshots,
      previewWriteViolation,
    },

    failures: {
      sourceLoader:
        loaderFailure,
      genericReplayBuilder:
        previewFailure,
    },

    adapterCalls: {
      sourceLoader:
        acceptedSourceCalls,
      legacyExecutor:
        acceptedLegacyCalls,
      deterministicExecutor:
        acceptedDeterministicCalls,
      genericReplayBuilder:
        acceptedPreviewCalls,
      production:
        productionCalls,
      development:
        developmentCalls,
      wrongMode:
        wrongModeCalls,
    },

    manifest:
      STAGING_INTEGRATION_ADAPTER_MANIFEST,

    safety: {
      sqlExecuted:
        false,
      supabaseAccessed:
        false,
      liveStagingDataAccessed:
        false,
      databaseWrite:
        false,
      productionRouteChanged:
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

export default function StagingIntegrationBoundaryDiagnostic():
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
            Phase 8J.7 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Staging integration boundary
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Verifies the injected read-only source, legacy executor,
            deterministic executor, and generic replay preview boundaries using
            synthetic adapters. Actual live staging wiring is not performed.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — staging adapters are read-only, shadow evidence is deterministic, and generic replay remains preview-only'
              : 'FAIL — staging integration boundary needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Boundary status
            </div>

            <div className="mt-2 text-xl font-bold text-emerald-300">
              {value
                .accepted
                .status}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Visible replay
            </div>

            <div className="mt-2 text-xl font-bold">
              {value
                .accepted
                .replayRoutingDecision
                ?.routeTarget ??
                'null'}
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
              Accepted boundary evidence
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Environment"
                value={
                  value
                    .accepted
                    .environment
                }
              />
              <Metric
                label="Mode"
                value={
                  String(
                    value
                      .accepted
                      .requestedMode,
                  )
                }
              />
              <Metric
                label="Source rows"
                value={
                  value
                    .accepted
                    .sourceLoad
                    ?.sourceRowsRead ??
                  0
                }
              />
              <Metric
                label="Source hash"
                value={
                  value
                    .accepted
                    .sourceLoad
                    ?.sourceBundle
                    .declaredSourceBundleHash ??
                  'null'
                }
              />
              <Metric
                label="Shadow evidence"
                value={
                  value
                    .accepted
                    .shadowEvidence
                    ?.evidenceHash ??
                  'null'
                }
              />
              <Metric
                label="Preview hash"
                value={
                  value
                    .accepted
                    .genericReplayPreview
                    ?.previewHash ??
                  'null'
                }
              />
              <Metric
                label="Generic available"
                value={
                  String(
                    value
                      .accepted
                      .replayRoutingDecision
                      ?.genericReplayAvailable ??
                    false,
                  )
                }
              />
              <Metric
                label="Live staging data"
                value={
                  String(
                    value
                      .accepted
                      .liveStagingDataAccessed,
                  )
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Blocking matrix
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Production"
                value={
                  value
                    .blocked
                    .production
                    .status
                }
              />
              <Metric
                label="Development"
                value={
                  value
                    .blocked
                    .development
                    .status
                }
              />
              <Metric
                label="Wrong mode"
                value={
                  value
                    .blocked
                    .wrongMode
                    .status
                }
              />
              <Metric
                label="Stage mismatch"
                value={
                  value
                    .blocked
                    .stageMismatch
                    .status
                }
              />
              <Metric
                label="Hash mismatch"
                value={
                  value
                    .blocked
                    .hashMismatch
                    .status
                }
              />
              <Metric
                label="Source write"
                value={
                  value
                    .blocked
                    .sourceWriteViolation
                    .status
                }
              />
              <Metric
                label="Comparison divergence"
                value={
                  value
                    .blocked
                    .comparisonDivergence
                    .status
                }
              />
              <Metric
                label="Invalid replay"
                value={
                  value
                    .blocked
                    .replayInvalid
                    .status
                }
              />
              <Metric
                label="Missing snapshots"
                value={
                  value
                    .blocked
                    .missingPreviewSnapshots
                    .status
                }
              />
              <Metric
                label="Preview write"
                value={
                  value
                    .blocked
                    .previewWriteViolation
                    .status
                }
              />
            </dl>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Adapter calls
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Source loader"
                value={
                  value
                    .adapterCalls
                    .sourceLoader
                }
              />
              <Metric
                label="Legacy executor"
                value={
                  value
                    .adapterCalls
                    .legacyExecutor
                }
              />
              <Metric
                label="Deterministic executor"
                value={
                  value
                    .adapterCalls
                    .deterministicExecutor
                }
              />
              <Metric
                label="Replay builder"
                value={
                  value
                    .adapterCalls
                    .genericReplayBuilder
                }
              />
              <Metric
                label="Production calls"
                value={
                  value
                    .adapterCalls
                    .production
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Failure evidence
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Source loader"
                value={
                  value
                    .failures
                    .sourceLoader
                    .status
                }
              />
              <Metric
                label="Replay builder"
                value={
                  value
                    .failures
                    .genericReplayBuilder
                    .status
                }
              />
              <Metric
                label="Live integration complete"
                value={
                  String(
                    value
                      .accepted
                      .liveIntegrationComplete,
                  )
                }
              />
              <Metric
                label="Persistence enabled"
                value={
                  String(
                    value
                      .accepted
                      .deterministicPersistenceEnabled,
                  )
                }
              />
              <Metric
                label="Player UI exposed"
                value={
                  String(
                    value
                      .accepted
                      .playerUiExposed,
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
            Live integration status
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            This phase completes the adapter boundary only. It does not connect
            the real staging source loader, actual engine adapters, or live
            generic replay preview. Production remains legacy-only.
          </p>
        </section>
      </div>
    </main>
  )
}
