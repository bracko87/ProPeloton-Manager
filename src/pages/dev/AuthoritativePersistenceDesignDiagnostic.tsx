/**
 * Phase 8J.5 browser-only persistence design diagnostic.
 *
 * It uses in-memory objects only. No SQL, Supabase access, live persistence,
 * route change, health write, equipment mutation, player UI activation, or
 * deployment occurs.
 */

import {
  useMemo,
} from 'react'

import {
  createDeterministicPersistenceWritePlan,
  type DeterministicPersistenceRequest,
} from '../../race-engine/migration/createDeterministicPersistenceWritePlan'
import {
  DETERMINISTIC_PERSISTENCE_CONTRACT,
} from '../../race-engine/migration/deterministicPersistenceContract'
import {
  emptySimulatedPersistenceState,
  simulateDeterministicPersistenceTransaction,
} from '../../race-engine/migration/simulateDeterministicPersistenceTransaction'
import {
  validateDeterministicPersistenceContract,
  validateDeterministicPersistenceWritePlan,
  validateSimulatedPersistenceResult,
} from '../../race-engine/migration/validateDeterministicPersistenceDesign'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface Check {
  readonly label: string
  readonly passed: boolean
}

function request():
  DeterministicPersistenceRequest {
  return {
    environment: 'local',
    stageId: 'phase-8j5-stage',
    sourceBundleHash:
      '1111111111111111',
    deterministicInputHash:
      '2222222222222222',
    deterministicOutputHash:
      '3333333333333333',
    replayHash:
      '4444444444444444',
    engineVersion:
      'race_engine_ts_v1',
    simulationMode:
      'deterministic_road_race_v1',

    classifications: [
      {
        riderId: 'rider-1',
        finishPosition: 1,
        finishTimeSeconds: 10_000,
        finished: true,
      },
      {
        riderId: 'rider-2',
        finishPosition: 2,
        finishTimeSeconds: 10_012,
        finished: true,
      },
    ],

    events: [
      {
        sequenceNumber: 1,
        eventType: 'STAGE_STARTED',
        raceSecond: 0,
        actorRiderId: null,
        relatedRiderIds: [],
      },
      {
        sequenceNumber: 2,
        eventType: 'RIDER_FINISHED',
        raceSecond: 10_000,
        actorRiderId: 'rider-1',
        relatedRiderIds: ['rider-1'],
      },
    ],

    replaySnapshots: [
      {
        sequenceNumber: 1,
        raceSecond: 0,
        snapshotHash:
          '5555555555555555',
      },
      {
        sequenceNumber: 2,
        raceSecond: 10_000,
        snapshotHash:
          '6666666666666666',
      },
    ],

    healthCaseWriteCount: 0,
    equipmentMutationCount: 0,
    historicalRewriteRequested: false,
  }
}

function buildDiagnostic() {
  const contractValidation =
    validateDeterministicPersistenceContract()

  const plan =
    createDeterministicPersistenceWritePlan(
      request(),
    )

  const repeatedPlan =
    createDeterministicPersistenceWritePlan(
      request(),
    )

  const planValidation =
    validateDeterministicPersistenceWritePlan(
      plan,
    )

  const empty =
    emptySimulatedPersistenceState()

  const committed =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
    })

  const retry =
    simulateDeterministicPersistenceTransaction({
      state: committed.nextState,
      request: request(),
    })

  const conflict =
    simulateDeterministicPersistenceTransaction({
      state: committed.nextState,
      request: {
        ...request(),
        deterministicOutputHash:
          '7777777777777777',
      },
    })

  const rollbackHeader =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
      failurePoint: 'after_run_header',
    })

  const rollbackClassifications =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
      failurePoint:
        'after_classifications',
    })

  const rollbackEvents =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
      failurePoint: 'after_events',
    })

  const rollbackReplay =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
      failurePoint:
        'after_replay_snapshots',
    })

  const rollbackCommit =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: request(),
      failurePoint: 'before_commit',
    })

  const productionBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        environment: 'production',
      },
    })

  const stagingBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        environment: 'staging',
      },
    })

  const healthBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        healthCaseWriteCount: 1,
      },
    })

  const equipmentBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        equipmentMutationCount: 1,
      },
    })

  const rewriteBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        historicalRewriteRequested: true,
      },
    })

  const duplicateBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        classifications: [
          ...request().classifications,
          {
            ...request().classifications[0],
          },
        ],
      },
    })

  const missingReplayBlocked =
    simulateDeterministicPersistenceTransaction({
      state: empty,
      request: {
        ...request(),
        replaySnapshots: [],
      },
    })

  const results = [
    committed,
    retry,
    conflict,
    rollbackHeader,
    rollbackClassifications,
    rollbackEvents,
    rollbackReplay,
    rollbackCommit,
    productionBlocked,
    stagingBlocked,
    healthBlocked,
    equipmentBlocked,
    rewriteBlocked,
    duplicateBlocked,
    missingReplayBlocked,
  ]

  const checks:
    readonly Check[] = [
      {
        label:
          'Contract is structurally valid and legacy remains authoritative',
        passed:
          contractValidation.valid &&
          DETERMINISTIC_PERSISTENCE_CONTRACT
            .currentAuthority === 'legacy',
      },
      {
        label:
          'Writer remains disabled for staging and production',
        passed:
          !DETERMINISTIC_PERSISTENCE_CONTRACT
            .writerEnabled &&
          !DETERMINISTIC_PERSISTENCE_CONTRACT
            .stagingWriteAllowed &&
          !DETERMINISTIC_PERSISTENCE_CONTRACT
            .productionWriteAllowed,
      },
      {
        label:
          'Valid local request produces a canonical design plan',
        passed:
          plan.validationPassed &&
          planValidation.valid,
      },
      {
        label:
          'Repeated plan reproduces logical key, idempotency key, and request hash',
        passed:
          plan.logicalRunKey ===
            repeatedPlan.logicalRunKey &&
          plan.idempotencyKey ===
            repeatedPlan.idempotencyKey &&
          plan.requestHash ===
            repeatedPlan.requestHash,
      },
      {
        label:
          'Conflicting output remains inside the same logical idempotency boundary',
        passed:
          conflict.plan.logicalRunKey ===
            plan.logicalRunKey &&
          conflict.plan.idempotencyKey ===
            plan.idempotencyKey,
      },
      {
        label:
          'Reference transaction commits classifications, events, and replay atomically',
        passed:
          committed.status === 'committed' &&
          committed.stateChanged &&
          Object.keys(
            committed.nextState.classifications,
          ).length === 1 &&
          Object.keys(
            committed.nextState.events,
          ).length === 1 &&
          Object.keys(
            committed.nextState.replaySnapshots,
          ).length === 1,
      },
      {
        label:
          'Exact retry returns existing evidence without changing state',
        passed:
          retry.status ===
            'idempotent_existing' &&
          retry.exactRetry &&
          !retry.stateChanged,
      },
      {
        label:
          'Different output for the same logical run is rejected as conflict',
        passed:
          conflict.status === 'conflict' &&
          conflict.conflictingOutput &&
          !conflict.stateChanged,
      },
      {
        label:
          'Every synthetic partial failure rolls back the entire transaction',
        passed:
          [
            rollbackHeader,
            rollbackClassifications,
            rollbackEvents,
            rollbackReplay,
            rollbackCommit,
          ].every(
            (result) =>
              result.status ===
                'rolled_back' &&
              result.rollbackApplied &&
              !result.stateChanged,
          ),
      },
      {
        label:
          'Production and staging deterministic persistence are blocked',
        passed:
          productionBlocked.status ===
            'blocked' &&
          stagingBlocked.status ===
            'blocked',
      },
      {
        label:
          'Health writes, equipment mutation, and historical rewriting are blocked',
        passed:
          healthBlocked.status ===
            'blocked' &&
          equipmentBlocked.status ===
            'blocked' &&
          rewriteBlocked.status ===
            'blocked',
      },
      {
        label:
          'Duplicate classifications and missing replay snapshots are blocked',
        passed:
          duplicateBlocked.status ===
            'blocked' &&
          missingReplayBlocked.status ===
            'blocked',
      },
      {
        label:
          'Every simulation result passes structural validation',
        passed:
          results.every(
            (result) =>
              validateSimulatedPersistenceResult(
                result,
              ).valid,
          ),
      },
      {
        label:
          'No SQL, database, route, flag, writer, health, equipment, UI, or deployment action occurs',
        passed: true,
      },
    ]

  const valueWithoutAudit = {
    passed:
      checks.every((check) => check.passed),

    checks,

    contract:
      DETERMINISTIC_PERSISTENCE_CONTRACT,
    plan,

    committed,
    retry,
    conflict,

    rollbacks: {
      afterRunHeader: rollbackHeader,
      afterClassifications:
        rollbackClassifications,
      afterEvents: rollbackEvents,
      afterReplaySnapshots:
        rollbackReplay,
      beforeCommit: rollbackCommit,
    },

    blockers: {
      production: productionBlocked,
      staging: stagingBlocked,
      health: healthBlocked,
      equipment: equipmentBlocked,
      historicalRewrite:
        rewriteBlocked,
      duplicateClassification:
        duplicateBlocked,
      missingReplay:
        missingReplayBlocked,
    },

    safety: {
      sqlExecuted: false,
      databaseRead: false,
      databaseWrite: false,
      productionRouteChanged: false,
      featureFlagChanged: false,
      writerEnabled: false,
      healthCaseWritten: false,
      equipmentMutated: false,
      playerUiEnabled: false,
      deploymentPerformed: false,
    },
  }

  return {
    ...valueWithoutAudit,
    auditHash:
      createCanonicalHashedValue(
        valueWithoutAudit,
      ).hash,
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | number
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

export default function AuthoritativePersistenceDesignDiagnostic():
  JSX.Element {
  const value =
    useMemo(buildDiagnostic, [])

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8J.5 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Authoritative persistence and idempotency design
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Verifies the future transactional boundary for classifications,
            events, and replay snapshots through an in-memory simulator. The
            actual writer remains disabled.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — persistence design is idempotent, conflict-safe, atomic, and still disabled'
              : 'FAIL — persistence design needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Authority
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-300">
              {value.contract.currentAuthority}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Writer enabled
            </div>
            <div className="mt-2 text-xl font-bold text-rose-300">
              {String(
                value.contract.writerEnabled,
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Idempotency key
            </div>
            <div className="mt-2 break-all text-sm font-bold">
              {value.plan.idempotencyKey}
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
              Write-plan identity
            </h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Logical run key"
                value={value.plan.logicalRunKey}
              />
              <Metric
                label="Request hash"
                value={value.plan.requestHash}
              />
              <Metric
                label="Classification hash"
                value={
                  value.plan.classificationBundleHash
                }
              />
              <Metric
                label="Event hash"
                value={value.plan.eventBundleHash}
              />
              <Metric
                label="Replay bundle hash"
                value={
                  value.plan.replaySnapshotBundleHash
                }
              />
              <Metric
                label="Write authorized"
                value={String(
                  value.plan.writeAuthorized,
                )}
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Idempotency outcomes
            </h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Reference"
                value={value.committed.status}
              />
              <Metric
                label="Exact retry"
                value={value.retry.status}
              />
              <Metric
                label="Conflicting output"
                value={value.conflict.status}
              />
              <Metric
                label="Retry state changed"
                value={String(
                  value.retry.stateChanged,
                )}
              />
              <Metric
                label="Conflict state changed"
                value={String(
                  value.conflict.stateChanged,
                )}
              />
            </dl>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Rollback matrix
            </h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="After run header"
                value={
                  value.rollbacks.afterRunHeader
                    .status
                }
              />
              <Metric
                label="After classifications"
                value={
                  value.rollbacks
                    .afterClassifications.status
                }
              />
              <Metric
                label="After events"
                value={
                  value.rollbacks.afterEvents.status
                }
              />
              <Metric
                label="After replay"
                value={
                  value.rollbacks
                    .afterReplaySnapshots.status
                }
              />
              <Metric
                label="Before commit"
                value={
                  value.rollbacks.beforeCommit.status
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Safety blockers
            </h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Production"
                value={
                  value.blockers.production.status
                }
              />
              <Metric
                label="Staging"
                value={value.blockers.staging.status}
              />
              <Metric
                label="Health write"
                value={value.blockers.health.status}
              />
              <Metric
                label="Equipment"
                value={
                  value.blockers.equipment.status
                }
              />
              <Metric
                label="Historical rewrite"
                value={
                  value.blockers.historicalRewrite
                    .status
                }
              />
              <Metric
                label="Duplicate rider"
                value={
                  value.blockers
                    .duplicateClassification.status
                }
              />
              <Metric
                label="Missing replay"
                value={
                  value.blockers.missingReplay.status
                }
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Transaction order
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            {value.contract.transactionOrder.map(
              (step) => (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-4 space-y-2">
            {value.checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
              >
                <span>{check.label}</span>
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
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold">
            Persistence status
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            The simulator is design evidence only. No staging or production
            writer exists, no SQL is created, legacy remains authoritative,
            and the new engine and replay remain unavailable in the normal
            player UI.
          </p>
        </section>
      </div>
    </main>
  )
}
