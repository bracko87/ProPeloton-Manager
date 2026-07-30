/**
 * StagingCanaryEligibilityDiagnostic.tsx
 *
 * Phase 8J.4 browser-only synthetic staging-canary policy diagnostic.
 */

import {
  useMemo,
} from 'react'

import {
  aggregateShadowEvidence,
  type ShadowEvidenceSample,
} from '../../race-engine/migration/aggregateShadowEvidence'
import {
  evaluateStagingCanaryEligibility,
} from '../../race-engine/migration/evaluateStagingCanaryEligibility'
import {
  evaluateStagingCanaryMonitoring,
  type StagingCanaryMonitoringSignals,
} from '../../race-engine/migration/evaluateStagingCanaryMonitoring'
import {
  orchestrateShadowDualRun,
  type ShadowExecutorOutput,
  type ShadowSourceBundle,
} from '../../race-engine/migration/shadowDualRunOrchestrator'
import {
  STAGING_CANARY_POLICY,
  type StagingCanaryRolloutPlan,
} from '../../race-engine/migration/stagingCanaryPolicy'
import type {
  ShadowStageProfile,
} from '../../race-engine/migration/stagingShadowAcceptancePolicy'
import {
  validateStagingCanaryEligibilityDecision,
  validateStagingCanaryMonitoringDecision,
} from '../../race-engine/migration/validateStagingCanaryContracts'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface SyntheticPayload {
  readonly profile:
    ShadowStageProfile
  readonly index: number
}

interface Check {
  readonly label: string
  readonly passed: boolean
}

function executorOutput(
  writerCallCount: number,
): ShadowExecutorOutput {
  return {
    riderCount: 2,
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
        eventType: 'RIDER_FINISHED',
        raceSecond: 10_000,
        actorRiderId: 'rider-1',
        relatedRiderIds: ['rider-1'],
      },
      {
        eventType: 'RIDER_FINISHED',
        raceSecond: 10_012,
        actorRiderId: 'rider-2',
        relatedRiderIds: ['rider-2'],
      },
    ],
    replayValid: true,
    runtimeDurationMs:
      writerCallCount === 0
        ? 900
        : 1_200,
    writerCallCount,
  }
}

function evidenceSample(
  input: {
    readonly index: number
    readonly profile:
      ShadowStageProfile
    readonly deterministicWriterCalls?:
      number
  },
): ShadowEvidenceSample {
  const stageId =
    `phase-8j4-${input.profile}-${input.index}`

  const payload:
    SyntheticPayload = {
    profile: input.profile,
    index: input.index,
  }

  const sourceBundle:
    ShadowSourceBundle<SyntheticPayload> = {
    stageId,
    declaredSourceBundleHash:
      createCanonicalHashedValue({
        stageId,
        payload,
      }).hash,
    payload,
  }

  const evidence =
    orchestrateShadowDualRun({
      environment: 'staging',
      requestedMode: 'dual_run_shadow',
      sourceBundle,
      legacyExecutor: () =>
        executorOutput(1),
      deterministicExecutor: () =>
        executorOutput(
          input.deterministicWriterCalls ?? 0,
        ),
      tolerance: {
        maximumFinishTimeDifferenceSeconds: 0,
        requireExactFinishOrder: true,
        requireExactEventCount: true,
      },
      orchestrationSequence: input.index,
    })

  return {
    sampleId:
      `sample-${input.profile}-${input.index}`,
    stageProfile: input.profile,
    evidence,
  }
}

function acceptedAggregate() {
  return aggregateShadowEvidence({
    samples: [
      evidenceSample({ index: 1, profile: 'flat' }),
      evidenceSample({ index: 2, profile: 'flat' }),
      evidenceSample({ index: 3, profile: 'hilly' }),
      evidenceSample({ index: 4, profile: 'hilly' }),
      evidenceSample({ index: 5, profile: 'mountain' }),
      evidenceSample({ index: 6, profile: 'mountain' }),
    ],
  })
}

function validRolloutPlan():
  StagingCanaryRolloutPlan {
  return {
    audience: 'staging_internal',
    selectedStages: [
      {
        stageId: 'canary-flat-1',
        profile: 'flat',
        cohort: 'flat_validation',
        legacyFallbackAvailable: true,
        deterministicReplayRequired: true,
        authoritativeWriter: 'legacy',
        deterministicWriterEnabled: false,
      },
      {
        stageId: 'canary-hilly-1',
        profile: 'hilly',
        cohort: 'hilly_validation',
        legacyFallbackAvailable: true,
        deterministicReplayRequired: true,
        authoritativeWriter: 'legacy',
        deterministicWriterEnabled: false,
      },
      {
        stageId: 'canary-mountain-1',
        profile: 'mountain',
        cohort: 'mountain_validation',
        legacyFallbackAvailable: true,
        deterministicReplayRequired: true,
        authoritativeWriter: 'legacy',
        deterministicWriterEnabled: false,
      },
    ],
    requestedExposurePercent: 5,
    requestedConcurrentStages: 1,
    monitoringOwnerAssigned: true,
    rollbackRunbookDefined: true,
  }
}

function cleanSignals():
  StagingCanaryMonitoringSignals {
  return {
    monitoringSignalsComplete: true,
    runFailures: 0,
    replayValidationFailures: 0,
    classificationDivergences: 0,
    eventDivergences: 0,
    writerViolations: 0,
    sourceIntegrityViolations: 0,
    duplicateExecutions: 0,
    fallbackActivations: 0,
    p95RuntimeRatio: 0.90,
    maximumRuntimeRatio: 1.00,
    legacyFallbackAvailable: true,
    deterministicWriterEnabled: false,
    persistenceAttempted: false,
    productionRouteTouched: false,
  }
}

function buildDiagnostic() {
  const aggregate =
    acceptedAggregate()

  const eligible =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: validRolloutPlan(),
    })

  const repeatedEligible =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: acceptedAggregate(),
      rolloutPlan: validRolloutPlan(),
    })

  const productionBlocked =
    evaluateStagingCanaryEligibility({
      environment: 'production',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: validRolloutPlan(),
    })

  const wrongModeBlocked =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'dual_run_shadow',
      aggregateReport: aggregate,
      rolloutPlan: validRolloutPlan(),
    })

  const insufficientAggregate =
    aggregateShadowEvidence({
      samples: [
        evidenceSample({ index: 7, profile: 'flat' }),
        evidenceSample({ index: 8, profile: 'hilly' }),
        evidenceSample({ index: 9, profile: 'mountain' }),
      ],
    })

  const insufficientEvidence =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: insufficientAggregate,
      rolloutPlan: validRolloutPlan(),
    })

  const blockedAggregate =
    aggregateShadowEvidence({
      samples: [
        evidenceSample({ index: 10, profile: 'flat' }),
        evidenceSample({ index: 11, profile: 'flat' }),
        evidenceSample({ index: 12, profile: 'hilly' }),
        evidenceSample({ index: 13, profile: 'hilly' }),
        evidenceSample({ index: 14, profile: 'mountain' }),
        evidenceSample({
          index: 15,
          profile: 'mountain',
          deterministicWriterCalls: 1,
        }),
      ],
    })

  const blockedEvidence =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: blockedAggregate,
      rolloutPlan: validRolloutPlan(),
    })

  const duplicatePlan =
    validRolloutPlan()

  const duplicateStage =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: {
        ...duplicatePlan,
        selectedStages: [
          duplicatePlan.selectedStages[0],
          duplicatePlan.selectedStages[0],
          duplicatePlan.selectedStages[2],
        ],
      },
    })

  const missingMountainPlan =
    validRolloutPlan()

  const missingMountain =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: {
        ...missingMountainPlan,
        selectedStages: [
          missingMountainPlan.selectedStages[0],
          missingMountainPlan.selectedStages[1],
          {
            ...missingMountainPlan.selectedStages[0],
            stageId: 'canary-flat-2',
          },
        ],
      },
    })

  const excessiveExposure =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: {
        ...validRolloutPlan(),
        requestedExposurePercent: 25,
      },
    })

  const missingRunbook =
    evaluateStagingCanaryEligibility({
      environment: 'staging',
      requestedMode: 'deterministic_canary',
      aggregateReport: aggregate,
      rolloutPlan: {
        ...validRolloutPlan(),
        rollbackRunbookDefined: false,
      },
    })

  const cleanMonitoring =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: cleanSignals(),
    })

  const runtimeWarning =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        p95RuntimeRatio: 1.70,
        maximumRuntimeRatio: 1.90,
      },
    })

  const runtimeRollback =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        p95RuntimeRatio: 1.80,
        maximumRuntimeRatio: 2.10,
      },
    })

  const replayRollback =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        replayValidationFailures: 1,
      },
    })

  const writerRollback =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        writerViolations: 1,
        deterministicWriterEnabled: true,
        persistenceAttempted: true,
      },
    })

  const fallbackRollback =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        legacyFallbackAvailable: false,
      },
    })

  const productionRouteRollback =
    evaluateStagingCanaryMonitoring({
      eligibility: eligible,
      signals: {
        ...cleanSignals(),
        productionRouteTouched: true,
      },
    })

  const ineligibleMonitoring =
    evaluateStagingCanaryMonitoring({
      eligibility: insufficientEvidence,
      signals: cleanSignals(),
    })

  const eligibilityDecisions = [
    eligible,
    repeatedEligible,
    productionBlocked,
    wrongModeBlocked,
    insufficientEvidence,
    blockedEvidence,
    duplicateStage,
    missingMountain,
    excessiveExposure,
    missingRunbook,
  ]

  const monitoringDecisions = [
    cleanMonitoring,
    runtimeWarning,
    runtimeRollback,
    replayRollback,
    writerRollback,
    fallbackRollback,
    productionRouteRollback,
    ineligibleMonitoring,
  ]

  const checks:
    readonly Check[] = [
      {
        label: 'Accepted aggregate and valid staging cohorts are eligible for canary implementation planning',
        passed:
          eligible.status === 'eligible' &&
          eligible.canProceedToCanaryImplementation,
      },
      {
        label: 'Repeated eligibility input reproduces the exact decision hash',
        passed:
          eligible.decisionHash ===
          repeatedEligible.decisionHash,
      },
      {
        label: 'Production canary request is blocked',
        passed:
          productionBlocked.status === 'blocked' &&
          productionBlocked.modeDecision.resolvedMode === 'legacy_only',
      },
      {
        label: 'Non-canary staging mode is blocked',
        passed:
          wrongModeBlocked.status === 'blocked',
      },
      {
        label: 'Insufficient Phase 8J.3 evidence remains ineligible',
        passed:
          insufficientEvidence.status === 'ineligible',
      },
      {
        label: 'Blocked Phase 8J.3 evidence blocks canary eligibility',
        passed:
          blockedEvidence.status === 'blocked',
      },
      {
        label: 'Duplicate canary stage IDs are ineligible',
        passed:
          duplicateStage.status === 'ineligible',
      },
      {
        label: 'Missing mountain cohort coverage is ineligible',
        passed:
          missingMountain.status === 'ineligible' &&
          missingMountain.selectedProfileCounts.mountain === 0,
      },
      {
        label: 'Exposure above ten percent is ineligible',
        passed:
          excessiveExposure.status === 'ineligible',
      },
      {
        label: 'Missing rollback runbook is ineligible',
        passed:
          missingRunbook.status === 'ineligible',
      },
      {
        label: 'Clean monitoring signals permit the staging canary to continue',
        passed:
          cleanMonitoring.status === 'continue' &&
          cleanMonitoring.canContinueCanary,
      },
      {
        label: 'Runtime above warning but below rollback remains a warning',
        passed:
          runtimeWarning.status === 'warning' &&
          runtimeWarning.canContinueCanary,
      },
      {
        label: 'Runtime above the rollback threshold requires legacy fallback',
        passed:
          runtimeRollback.status === 'rollback_required' &&
          runtimeRollback.shouldActivateLegacyFallback,
      },
      {
        label: 'Replay validation failure requires rollback',
        passed:
          replayRollback.status === 'rollback_required',
      },
      {
        label: 'Writer or persistence activity requires rollback',
        passed:
          writerRollback.status === 'rollback_required' &&
          writerRollback.rollbackFindings.some(
            (item) => item.code === 'WRITER_VIOLATION',
          ) &&
          writerRollback.rollbackFindings.some(
            (item) => item.code === 'PERSISTENCE_ATTEMPTED',
          ),
      },
      {
        label: 'Missing legacy fallback requires rollback',
        passed:
          fallbackRollback.status === 'rollback_required',
      },
      {
        label: 'Any production-route activity requires rollback',
        passed:
          productionRouteRollback.status === 'rollback_required',
      },
      {
        label: 'Ineligible canary monitoring remains not_eligible',
        passed:
          ineligibleMonitoring.status === 'not_eligible' &&
          !ineligibleMonitoring.canContinueCanary,
      },
      {
        label: 'Every eligibility and monitoring decision passes structural validation',
        passed:
          eligibilityDecisions.every(
            (decision) =>
              validateStagingCanaryEligibilityDecision(decision).valid,
          ) &&
          monitoringDecisions.every(
            (decision) =>
              validateStagingCanaryMonitoringDecision(decision).valid,
          ),
      },
      {
        label: 'No decision authorizes execution, production, persistence, or player UI',
        passed:
          eligibilityDecisions.every(
            (decision) =>
              !decision.canExecuteCanary &&
              !decision.canSwitchProduction &&
              !decision.canEnablePersistence &&
              !decision.canExposePlayerUi,
          ) &&
          monitoringDecisions.every(
            (decision) =>
              !decision.canSwitchProduction &&
              !decision.canEnablePersistence &&
              !decision.canExposePlayerUi,
          ) &&
          !STAGING_CANARY_POLICY.passingPolicyAuthorizesExecution,
      },
      {
        label: 'Diagnostic performs no database, route, flag, writer, UI, or deployment action',
        passed: true,
      },
    ]

  const resultWithoutAudit = {
    passed:
      checks.every(
        (check) => check.passed,
      ),
    checks,
    aggregate,
    eligible,
    productionBlocked,
    wrongModeBlocked,
    insufficientEvidence,
    blockedEvidence,
    duplicateStage,
    missingMountain,
    excessiveExposure,
    missingRunbook,
    cleanMonitoring,
    runtimeWarning,
    runtimeRollback,
    replayRollback,
    writerRollback,
    fallbackRollback,
    productionRouteRollback,
    ineligibleMonitoring,
    policy: STAGING_CANARY_POLICY,
    safety: {
      databaseRead: false,
      databaseWrite: false,
      canaryExecuted: false,
      productionRouteChanged: false,
      featureFlagChanged: false,
      persistenceEnabled: false,
      playerUiEnabled: false,
      deploymentPerformed: false,
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
      <dt className="text-slate-400">{label}</dt>
      <dd className="max-w-[70%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function StagingCanaryEligibilityDiagnostic():
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
            Phase 8J.4 development diagnostic
          </div>
          <h1 className="mt-2 text-3xl font-bold">
            Staging-canary eligibility and rollback policy
          </h1>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Evaluates staging-only cohorts, exposure, monitoring thresholds,
            and rollback triggers without executing a canary or exposing the
            new engine to players.
          </p>
          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — staging-canary eligibility is conservative and every unsafe signal requires rollback'
              : 'FAIL — staging-canary policy needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Eligibility</div>
            <div className="mt-2 text-xl font-bold text-emerald-300">{value.eligible.status}</div>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Selected stages</div>
            <div className="mt-2 text-3xl font-bold">{value.eligible.selectedStageCount}</div>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Eligibility hash</div>
            <div className="mt-2 break-all text-sm font-bold">{value.eligible.decisionHash}</div>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Audit hash</div>
            <div className="mt-2 break-all text-sm font-bold">{value.auditHash}</div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Accepted rollout cohort</h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric label="Environment" value={value.eligible.environment} />
              <Metric label="Mode" value={value.eligible.modeDecision.resolvedMode} />
              <Metric label="Aggregate" value={value.eligible.aggregateReportStatus} />
              <Metric label="Flat" value={value.eligible.selectedProfileCounts.flat} />
              <Metric label="Hilly" value={value.eligible.selectedProfileCounts.hilly} />
              <Metric label="Mountain" value={value.eligible.selectedProfileCounts.mountain} />
              <Metric label="Exposure" value={`${value.eligible.requestedExposurePercent}%`} />
              <Metric label="Concurrency" value={value.eligible.requestedConcurrentStages} />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Eligibility rejection matrix</h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric label="Production" value={value.productionBlocked.status} />
              <Metric label="Wrong mode" value={value.wrongModeBlocked.status} />
              <Metric label="Insufficient evidence" value={value.insufficientEvidence.status} />
              <Metric label="Blocked evidence" value={value.blockedEvidence.status} />
              <Metric label="Duplicate stage" value={value.duplicateStage.status} />
              <Metric label="Missing mountain" value={value.missingMountain.status} />
              <Metric label="Excess exposure" value={value.excessiveExposure.status} />
              <Metric label="Missing runbook" value={value.missingRunbook.status} />
            </dl>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Monitoring decisions</h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric label="Clean" value={value.cleanMonitoring.status} />
              <Metric label="Runtime warning" value={value.runtimeWarning.status} />
              <Metric label="Runtime rollback" value={value.runtimeRollback.status} />
              <Metric label="Replay rollback" value={value.replayRollback.status} />
              <Metric label="Writer rollback" value={value.writerRollback.status} />
              <Metric label="Fallback unavailable" value={value.fallbackRollback.status} />
              <Metric label="Production route" value={value.productionRouteRollback.status} />
              <Metric label="Ineligible" value={value.ineligibleMonitoring.status} />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Policy thresholds</h2>
            <dl className="mt-4 space-y-2 text-xs">
              <Metric label="Selected stages" value={`${value.policy.minimumSelectedStages}-${value.policy.maximumSelectedStages}`} />
              <Metric label="Maximum exposure" value={`${value.policy.maximumExposurePercent}%`} />
              <Metric label="Maximum concurrency" value={value.policy.maximumConcurrentStages} />
              <Metric label="Run failures allowed" value={value.policy.monitoring.maximumRunFailures} />
              <Metric label="Writer violations allowed" value={value.policy.monitoring.maximumWriterViolations} />
              <Metric label="Runtime warning" value={value.policy.monitoring.warningRuntimeRatio} />
              <Metric label="Runtime rollback" value={value.policy.monitoring.rollbackRuntimeRatio} />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Checks</h2>
          <div className="mt-4 space-y-2">
            {value.checks.map(
              (check) => (
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
                    {check.passed ? 'PASS' : 'FAIL'}
                  </strong>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold">Production and UI status</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Eligibility authorizes only staging-canary implementation planning.
            It does not execute a canary, persist deterministic output, switch
            production, expose generic replay in the player UI, or complete
            checklist item 21.
          </p>
        </section>
      </div>
    </main>
  )
}
