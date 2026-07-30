/**
 * StagingMigrationDesignDiagnostic.tsx
 *
 * Phase 8J planning-only diagnostic.
 *
 * It validates the staging migration contract and exercises the pure dual-run
 * comparison logic with synthetic summaries. It never runs a production race,
 * changes a route, calls Supabase, writes a result, or enables a feature flag.
 */

import {
  useMemo,
} from 'react'

import {
  compareStagingDualRun,
  type StageRunComparisonInput,
} from '../../race-engine/migration/stagingDualRunComparison'
import {
  STAGING_MIGRATION_PLAN,
} from '../../race-engine/migration/StagingMigrationPlan'
import {
  validateStagingMigrationPlan,
} from '../../race-engine/migration/validateStagingMigrationPlan'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface Check {
  readonly label: string
  readonly passed: boolean
}

function baseRun(
  runId: string,
): StageRunComparisonInput {
  return {
    runId,
    stageId:
      'phase-8j-controlled-stage',
    sourceBundleHash:
      '0123456789abcdef',

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
      1_500,

    writerCallCount: 1,
  }
}

function buildDiagnostic() {
  const planValidation =
    validateStagingMigrationPlan(
      STAGING_MIGRATION_PLAN,
    )

  const legacy =
    baseRun(
      'legacy-run-1',
    )

  const deterministic = {
    ...baseRun(
      'deterministic-run-1',
    ),
    writerCallCount: 0,
  }

  const strictTolerance = {
    maximumFinishTimeDifferenceSeconds:
      0,
    requireExactFinishOrder:
      true,
    requireExactEventCount:
      true,
  } as const

  const identicalReport =
    compareStagingDualRun({
      legacy,
      deterministic,
      tolerance:
        strictTolerance,
    })

  const sourceMismatchReport =
    compareStagingDualRun({
      legacy,
      deterministic: {
        ...deterministic,
        sourceBundleHash:
          'fedcba9876543210',
      },
      tolerance:
        strictTolerance,
    })

  const writerViolationReport =
    compareStagingDualRun({
      legacy,
      deterministic: {
        ...deterministic,
        writerCallCount: 1,
      },
      tolerance:
        strictTolerance,
    })

  const orderMismatchReport =
    compareStagingDualRun({
      legacy,
      deterministic: {
        ...deterministic,
        classifications:
          deterministic
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
      },
      tolerance:
        strictTolerance,
    })

  const tolerancePassReport =
    compareStagingDualRun({
      legacy,
      deterministic: {
        ...deterministic,
        classifications:
          deterministic
            .classifications
            .map(
              (classification) => ({
                ...classification,
                finishTimeSeconds:
                  classification
                    .finishTimeSeconds ===
                    null
                    ? null
                    : classification
                        .finishTimeSeconds +
                      2,
              })),
      },
      tolerance: {
        maximumFinishTimeDifferenceSeconds:
          2,
        requireExactFinishOrder:
          true,
        requireExactEventCount:
          true,
      },
    })

  const checks:
    readonly Check[] = [
      {
        label:
          'Staging migration plan is structurally valid',
        passed:
          planValidation.valid,
      },
      {
        label:
          'Production mode remains legacy_only',
        passed:
          STAGING_MIGRATION_PLAN
            .currentProductionMode ===
            'legacy_only',
      },
      {
        label:
          'Production allow-list contains only legacy_only',
        passed:
          JSON.stringify(
            STAGING_MIGRATION_PLAN
              .featureFlag
              .allowedByEnvironment
              .production,
          ) ===
          JSON.stringify([
            'legacy_only',
          ]),
      },
      {
        label:
          'Automatic production promotion is disabled',
        passed:
          STAGING_MIGRATION_PLAN
            .featureFlag
            .automaticProductionPromotion ===
            false,
      },
      {
        label:
          'Shadow dual run keeps legacy authoritative and deterministic writes disabled',
        passed:
          STAGING_MIGRATION_PLAN
            .dualRun
            .authoritativeWriter ===
            'legacy' &&
          STAGING_MIGRATION_PLAN
            .dualRun
            .deterministicWriter ===
            'disabled',
      },
      {
        label:
          'Persistence remains design-only and disabled',
        passed:
          STAGING_MIGRATION_PLAN
            .persistence
            .status ===
            'design_only' &&
          STAGING_MIGRATION_PLAN
            .persistence
            .writerEnabled ===
            false,
      },
      {
        label:
          'Race engine does not own health-case persistence',
        passed:
          STAGING_MIGRATION_PLAN
            .persistence
            .healthCaseWriteOwnedByRaceEngine ===
            false &&
          STAGING_MIGRATION_PLAN
            .healthConsumer
            .raceEngineCreatesHealthCases ===
            false,
      },
      {
        label:
          'Every migration gate blocks production',
        passed:
          STAGING_MIGRATION_PLAN
            .gates
            .every(
              (gate) =>
                gate
                  .blocksProduction,
            ),
      },
      {
        label:
          'Identical synthetic dual run passes strict comparison',
        passed:
          identicalReport.passed,
      },
      {
        label:
          'Source-bundle mismatch blocks dual-run acceptance',
        passed:
          !sourceMismatchReport
            .passed &&
          !sourceMismatchReport
            .sourceBundleMatches,
      },
      {
        label:
          'Deterministic writer activity blocks shadow acceptance',
        passed:
          !writerViolationReport
            .passed &&
          !writerViolationReport
            .legacyWriterOnly,
      },
      {
        label:
          'Finish-order divergence blocks strict acceptance',
        passed:
          !orderMismatchReport
            .passed &&
          !orderMismatchReport
            .finishOrderMatches,
      },
      {
        label:
          'Configured finish-time tolerance is applied deterministically',
        passed:
          tolerancePassReport
            .passed &&
          tolerancePassReport
            .finishTimeTolerancePassed,
      },
      {
        label:
          'Rollback contract preserves the legacy route and legacy_only mode',
        passed:
          STAGING_MIGRATION_PLAN
            .rollback
            .legacyRouteRemainsAvailable &&
          STAGING_MIGRATION_PLAN
            .rollback
            .rollbackMode ===
            'legacy_only',
      },
      {
        label:
          'Monitoring contract includes divergence, failure, duplicate, and fallback signals',
        passed:
          [
            'classification_divergence',
            'event_divergence',
            'run_failed',
            'duplicate_execution_attempt',
            'persistence_failure',
            'fallback_activation',
          ].every(
            (signal) =>
              STAGING_MIGRATION_PLAN
                .monitoring
                .requiredSignals
                .includes(
                  signal as
                    typeof STAGING_MIGRATION_PLAN.monitoring.requiredSignals[number],
                ),
          ),
      },
      {
        label:
          'Phase 8J does not claim production readiness or approval',
        passed:
          STAGING_MIGRATION_PLAN
            .productionReady ===
            false &&
          STAGING_MIGRATION_PLAN
            .productionSwitchApproved ===
            false,
      },
    ]

  const resultWithoutHash = {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    planValidation,

    productionMode:
      STAGING_MIGRATION_PLAN
        .currentProductionMode,

    gateCount:
      STAGING_MIGRATION_PLAN
        .gates
        .length,

    productionBlockingGateCount:
      planValidation
        .productionBlockingGateCount,

    comparisonReports: {
      identical:
        identicalReport,
      sourceMismatch:
        sourceMismatchReport,
      writerViolation:
        writerViolationReport,
      orderMismatch:
        orderMismatchReport,
      tolerancePass:
        tolerancePassReport,
    },

    safety: {
      sqlExecuted: false,
      databaseRead: false,
      databaseWrite: false,
      productionRouteChanged: false,
      featureFlagChanged: false,
      persistenceWriterEnabled:
        false,
      deploymentPerformed: false,
    },
  }

  return {
    ...resultWithoutHash,

    auditHash:
      createCanonicalHashedValue(
        resultWithoutHash,
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

export default function StagingMigrationDesignDiagnostic():
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
            Phase 8J development audit
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Staging migration design
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Validates the feature-flag, shadow dual-run, persistence,
            rollback, monitoring, health-consumer, and approval contracts
            without changing production execution.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — staging migration design is internally consistent; production remains legacy-only'
              : 'FAIL — staging migration design needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Production mode
            </div>

            <div className="mt-2 text-xl font-bold text-emerald-300">
              {value
                .productionMode}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Gates
            </div>

            <div className="mt-2 text-3xl font-bold">
              {value.gateCount}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Production blockers
            </div>

            <div className="mt-2 text-3xl font-bold text-rose-300">
              {value
                .productionBlockingGateCount}
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
            Migration gates
          </h2>

          <div className="mt-4 space-y-3">
            {STAGING_MIGRATION_PLAN
              .gates
              .map(
                (gate) => (
                  <div
                    key={gate.id}
                    className="rounded-2xl border border-slate-800 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold">
                        {gate.title}
                      </div>

                      <div className="rounded-full border border-amber-700 px-3 py-1 text-xs font-semibold text-amber-300">
                        {gate.status}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-400">
                      {gate.workstream}
                      {' · '}
                      blocks production
                    </div>

                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                      {gate
                        .evidenceRequired
                        .map(
                          (item) => (
                            <li key={item}>
                              {item}
                            </li>
                          ),
                        )}
                    </ul>
                  </div>
                ),
              )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Shadow dual-run contract
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Metric
                label="Authoritative writer"
                value={
                  STAGING_MIGRATION_PLAN
                    .dualRun
                    .authoritativeWriter
                }
              />
              <Metric
                label="Deterministic writer"
                value={
                  STAGING_MIGRATION_PLAN
                    .dualRun
                    .deterministicWriter
                }
              />
              <Metric
                label="Same source bundle"
                value="required"
              />
              <Metric
                label="Replay validation"
                value="required"
              />
              <Metric
                label="Production mutation"
                value="forbidden"
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Synthetic comparator
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Metric
                label="Identical run"
                value={
                  value
                    .comparisonReports
                    .identical
                    .passed
                    ? 'PASS'
                    : 'FAIL'
                }
              />
              <Metric
                label="Source mismatch"
                value={
                  value
                    .comparisonReports
                    .sourceMismatch
                    .passed
                    ? 'incorrectly accepted'
                    : 'blocked'
                }
              />
              <Metric
                label="Writer violation"
                value={
                  value
                    .comparisonReports
                    .writerViolation
                    .passed
                    ? 'incorrectly accepted'
                    : 'blocked'
                }
              />
              <Metric
                label="Order mismatch"
                value={
                  value
                    .comparisonReports
                    .orderMismatch
                    .passed
                    ? 'incorrectly accepted'
                    : 'blocked'
                }
              />
              <Metric
                label="Configured tolerance"
                value={
                  value
                    .comparisonReports
                    .tolerancePass
                    .passed
                    ? 'PASS'
                    : 'FAIL'
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
            Production status
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            Production remains legacy-only. Every migration gate blocks
            production. No feature flag, writer, route, deployment, historical
            result, equipment record, replay record, or health case is changed.
          </p>
        </section>
      </div>
    </main>
  )
}
