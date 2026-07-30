/**
 * evaluateStagingCanaryMonitoring.ts
 *
 * Pure monitoring and rollback decision for a future staging canary.
 *
 * It evaluates supplied counters only. It does not observe a live system,
 * activate a fallback, change a route, write a result, or deploy anything.
 */

import type {
  StagingCanaryEligibilityDecision,
} from './evaluateStagingCanaryEligibility'
import {
  STAGING_CANARY_POLICY,
  type StagingCanaryPolicy,
} from './stagingCanaryPolicy'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export type StagingCanaryMonitoringStatus =
  | 'not_eligible'
  | 'continue'
  | 'warning'
  | 'rollback_required'

export type StagingCanaryMonitoringFindingSeverity =
  | 'rollback'
  | 'warning'
  | 'info'

export interface StagingCanaryMonitoringSignals {
  readonly monitoringSignalsComplete:
    boolean

  readonly runFailures:
    number
  readonly replayValidationFailures:
    number
  readonly classificationDivergences:
    number
  readonly eventDivergences:
    number
  readonly writerViolations:
    number
  readonly sourceIntegrityViolations:
    number
  readonly duplicateExecutions:
    number
  readonly fallbackActivations:
    number

  readonly p95RuntimeRatio:
    number
  readonly maximumRuntimeRatio:
    number

  readonly legacyFallbackAvailable:
    boolean
  readonly deterministicWriterEnabled:
    boolean
  readonly persistenceAttempted:
    boolean
  readonly productionRouteTouched:
    boolean
}

export interface StagingCanaryMonitoringFinding {
  readonly code: string
  readonly severity:
    StagingCanaryMonitoringFindingSeverity
  readonly title: string
  readonly detail: string
}

export interface StagingCanaryMonitoringDecision {
  readonly decisionVersion:
    'phase_8j4_staging_canary_monitoring_v1'
  readonly policyVersion:
    StagingCanaryPolicy[
      'policyVersion'
    ]

  readonly eligibilityDecisionHash:
    string
  readonly eligibilityStatus:
    StagingCanaryEligibilityDecision[
      'status'
    ]

  readonly status:
    StagingCanaryMonitoringStatus

  readonly rollbackFindings:
    readonly StagingCanaryMonitoringFinding[]
  readonly warningFindings:
    readonly StagingCanaryMonitoringFinding[]
  readonly informationFindings:
    readonly StagingCanaryMonitoringFinding[]

  readonly canContinueCanary:
    boolean
  readonly shouldActivateLegacyFallback:
    boolean

  readonly canSwitchProduction:
    false
  readonly canEnablePersistence:
    false
  readonly canExposePlayerUi:
    false

  readonly decisionHash:
    string
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `evaluateStagingCanaryMonitoring: ${fieldName} must be a non-negative integer.`,
    )
  }
}

function assertNonNegativeFinite(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `evaluateStagingCanaryMonitoring: ${fieldName} must be a non-negative finite number.`,
    )
  }
}

function finding(
  input: {
    readonly code: string
    readonly severity:
      StagingCanaryMonitoringFindingSeverity
    readonly title: string
    readonly detail: string
  },
): StagingCanaryMonitoringFinding {
  return input
}

export function evaluateStagingCanaryMonitoring(
  input: {
    readonly eligibility:
      StagingCanaryEligibilityDecision
    readonly signals:
      StagingCanaryMonitoringSignals
    readonly policy?:
      StagingCanaryPolicy
  },
): StagingCanaryMonitoringDecision {
  const policy =
    input.policy ??
    STAGING_CANARY_POLICY

  const countFields = {
    runFailures:
      input.signals.runFailures,
    replayValidationFailures:
      input
        .signals
        .replayValidationFailures,
    classificationDivergences:
      input
        .signals
        .classificationDivergences,
    eventDivergences:
      input
        .signals
        .eventDivergences,
    writerViolations:
      input
        .signals
        .writerViolations,
    sourceIntegrityViolations:
      input
        .signals
        .sourceIntegrityViolations,
    duplicateExecutions:
      input
        .signals
        .duplicateExecutions,
    fallbackActivations:
      input
        .signals
        .fallbackActivations,
  }

  for (
    const [
      fieldName,
      value,
    ] of
    Object.entries(
      countFields,
    )
  ) {
    assertNonNegativeInteger(
      value,
      fieldName,
    )
  }

  assertNonNegativeFinite(
    input
      .signals
      .p95RuntimeRatio,
    'p95RuntimeRatio',
  )

  assertNonNegativeFinite(
    input
      .signals
      .maximumRuntimeRatio,
    'maximumRuntimeRatio',
  )

  const rollbackFindings:
    StagingCanaryMonitoringFinding[] = []

  const warningFindings:
    StagingCanaryMonitoringFinding[] = []

  const informationFindings:
    StagingCanaryMonitoringFinding[] = []

  if (
    input.eligibility.status !==
    'eligible'
  ) {
    informationFindings.push(
      finding({
        code:
          'CANARY_NOT_ELIGIBLE',
        severity:
          'info',
        title:
          'Monitoring cannot authorize an ineligible canary',
        detail:
          `Eligibility status is ${input.eligibility.status}.`,
      }),
    )
  }

  if (
    !input
      .signals
      .monitoringSignalsComplete
  ) {
    rollbackFindings.push(
      finding({
        code:
          'MONITORING_SIGNAL_GAP',
        severity:
          'rollback',
        title:
          'Required monitoring signals are incomplete',
        detail:
          'A canary must return to legacy when monitoring coverage is incomplete.',
      }),
    )
  }

  const thresholdChecks = [
    {
      code:
        'RUN_FAILURE',
      title:
        'Canary run failure detected',
      value:
        input
          .signals
          .runFailures,
      maximum:
        policy
          .monitoring
          .maximumRunFailures,
    },
    {
      code:
        'REPLAY_VALIDATION_FAILURE',
      title:
        'Replay validation failure detected',
      value:
        input
          .signals
          .replayValidationFailures,
      maximum:
        policy
          .monitoring
          .maximumReplayValidationFailures,
    },
    {
      code:
        'CLASSIFICATION_DIVERGENCE',
      title:
        'Classification divergence detected',
      value:
        input
          .signals
          .classificationDivergences,
      maximum:
        policy
          .monitoring
          .maximumClassificationDivergences,
    },
    {
      code:
        'EVENT_DIVERGENCE',
      title:
        'Event divergence detected',
      value:
        input
          .signals
          .eventDivergences,
      maximum:
        policy
          .monitoring
          .maximumEventDivergences,
    },
    {
      code:
        'WRITER_VIOLATION',
      title:
        'Deterministic writer activity detected',
      value:
        input
          .signals
          .writerViolations,
      maximum:
        policy
          .monitoring
          .maximumWriterViolations,
    },
    {
      code:
        'SOURCE_INTEGRITY_VIOLATION',
      title:
        'Source integrity violation detected',
      value:
        input
          .signals
          .sourceIntegrityViolations,
      maximum:
        policy
          .monitoring
          .maximumSourceIntegrityViolations,
    },
    {
      code:
        'DUPLICATE_EXECUTION',
      title:
        'Duplicate execution detected',
      value:
        input
          .signals
          .duplicateExecutions,
      maximum:
        policy
          .monitoring
          .maximumDuplicateExecutions,
    },
    {
      code:
        'FALLBACK_ACTIVATION',
      title:
        'Legacy fallback activation detected',
      value:
        input
          .signals
          .fallbackActivations,
      maximum:
        policy
          .monitoring
          .maximumFallbackActivations,
    },
  ] as const

  for (
    const check of
    thresholdChecks
  ) {
    if (
      check.value >
      check.maximum
    ) {
      rollbackFindings.push(
        finding({
          code:
            check.code,
          severity:
            'rollback',
          title:
            check.title,
          detail:
            `${check.value} observed; maximum is ${check.maximum}.`,
        }),
      )
    }
  }

  if (
    !input
      .signals
      .legacyFallbackAvailable
  ) {
    rollbackFindings.push(
      finding({
        code:
          'LEGACY_FALLBACK_UNAVAILABLE',
        severity:
          'rollback',
        title:
          'Legacy fallback is unavailable',
        detail:
          'The canary cannot continue without an immediately available legacy path.',
      }),
    )
  }

  if (
    input
      .signals
      .deterministicWriterEnabled
  ) {
    rollbackFindings.push(
      finding({
        code:
          'DETERMINISTIC_WRITER_ENABLED',
        severity:
          'rollback',
        title:
          'Deterministic writer was enabled',
        detail:
          'Phase 8J.4 requires deterministic writes to remain disabled.',
      }),
    )
  }

  if (
    input
      .signals
      .persistenceAttempted
  ) {
    rollbackFindings.push(
      finding({
        code:
          'PERSISTENCE_ATTEMPTED',
        severity:
          'rollback',
        title:
          'Authoritative persistence was attempted',
        detail:
          'Staging-canary design does not authorize deterministic persistence.',
      }),
    )
  }

  if (
    input
      .signals
      .productionRouteTouched
  ) {
    rollbackFindings.push(
      finding({
        code:
          'PRODUCTION_ROUTE_TOUCHED',
        severity:
          'rollback',
        title:
          'Production route activity was detected',
        detail:
          'Phase 8J.4 is staging-only and may not touch the production race route.',
      }),
    )
  }

  if (
    input
      .signals
      .maximumRuntimeRatio >
    policy
      .monitoring
      .rollbackRuntimeRatio
  ) {
    rollbackFindings.push(
      finding({
        code:
          'RUNTIME_ROLLBACK_THRESHOLD',
        severity:
          'rollback',
        title:
          'Maximum runtime ratio exceeds the rollback threshold',
        detail:
          `${input.signals.maximumRuntimeRatio} observed; rollback threshold is ${policy.monitoring.rollbackRuntimeRatio}.`,
      }),
    )
  } else if (
    input
      .signals
      .p95RuntimeRatio >
    policy
      .monitoring
      .warningRuntimeRatio
  ) {
    warningFindings.push(
      finding({
        code:
          'RUNTIME_WARNING_THRESHOLD',
        severity:
          'warning',
        title:
          'P95 runtime ratio exceeds the warning threshold',
        detail:
          `${input.signals.p95RuntimeRatio} observed; warning threshold is ${policy.monitoring.warningRuntimeRatio}.`,
      }),
    )
  }

  informationFindings.push(
    finding({
      code:
        'STAGING_ONLY_MONITORING',
      severity:
        'info',
      title:
        'Monitoring decisions remain staging-only',
      detail:
        'No monitoring result can authorize production, persistence, or player UI.',
    }),
  )

  const status:
    StagingCanaryMonitoringStatus =
      input.eligibility.status !==
      'eligible'
        ? 'not_eligible'
        : rollbackFindings.length >
            0
          ? 'rollback_required'
          : warningFindings.length >
              0
            ? 'warning'
            : 'continue'

  const decisionWithoutHash = {
    decisionVersion:
      'phase_8j4_staging_canary_monitoring_v1' as const,
    policyVersion:
      policy.policyVersion,

    eligibilityDecisionHash:
      input
        .eligibility
        .decisionHash,
    eligibilityStatus:
      input
        .eligibility
        .status,

    status,

    rollbackFindings,
    warningFindings,
    informationFindings,

    canContinueCanary:
      status ===
        'continue' ||
      status ===
        'warning',
    shouldActivateLegacyFallback:
      status ===
      'rollback_required',

    canSwitchProduction:
      false as const,
    canEnablePersistence:
      false as const,
    canExposePlayerUi:
      false as const,
  }

  return {
    ...decisionWithoutHash,

    decisionHash:
      createCanonicalHashedValue(
        decisionWithoutHash,
      ).hash,
  }
}
