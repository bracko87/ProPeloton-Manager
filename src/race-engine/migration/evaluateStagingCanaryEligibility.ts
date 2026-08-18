/**
 * evaluateStagingCanaryEligibility.ts
 *
 * Pure Phase 8J.4 eligibility decision for a future staging canary.
 *
 * It consumes a Phase 8J.3 aggregate report and a proposed staging-only cohort
 * plan. It does not execute a canary or modify any route, flag, writer, replay,
 * database, equipment record, health case, or deployment.
 */

import type {
  StagingShadowAcceptanceReport,
} from './aggregateShadowEvidence'
import {
  validateStagingShadowAcceptanceReport,
} from './validateStagingShadowAcceptanceReport'
import {
  resolveMigrationExecutionMode,
  type MigrationModeDecision,
} from './migrationModeResolver'
import {
  STAGING_CANARY_POLICY,
  expectedCohortForProfile,
  type StagingCanaryPolicy,
  type StagingCanaryRolloutPlan,
} from './stagingCanaryPolicy'
import type {
  MigrationEnvironment,
} from './StagingMigrationPlan'
import type {
  ShadowStageProfile,
} from './stagingShadowAcceptancePolicy'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export type StagingCanaryEligibilityStatus =
  | 'eligible'
  | 'ineligible'
  | 'blocked'

export type StagingCanaryEligibilityFindingSeverity =
  | 'blocker'
  | 'requirement'
  | 'info'

export interface StagingCanaryEligibilityFinding {
  readonly code: string
  readonly severity:
    StagingCanaryEligibilityFindingSeverity
  readonly title: string
  readonly detail: string
}

export interface StagingCanaryEligibilityDecision {
  readonly decisionVersion:
    'phase_8j4_staging_canary_eligibility_v1'
  readonly policyVersion:
    StagingCanaryPolicy[
      'policyVersion'
    ]

  readonly status:
    StagingCanaryEligibilityStatus

  readonly environment:
    MigrationEnvironment
  readonly modeDecision:
    MigrationModeDecision

  readonly aggregateReportHash:
    string
  readonly aggregateReportStatus:
    StagingShadowAcceptanceReport[
      'status'
    ]
  readonly aggregateReportValid:
    boolean

  readonly selectedStageCount:
    number
  readonly distinctStageCount:
    number

  readonly selectedProfileCounts:
    Readonly<
      Record<
        ShadowStageProfile,
        number
      >
    >

  readonly requestedExposurePercent:
    number
  readonly requestedConcurrentStages:
    number

  readonly blockerFindings:
    readonly StagingCanaryEligibilityFinding[]
  readonly requirementFindings:
    readonly StagingCanaryEligibilityFinding[]
  readonly informationFindings:
    readonly StagingCanaryEligibilityFinding[]

  readonly canProceedToCanaryImplementation:
    boolean
  readonly canExecuteCanary:
    false
  readonly canSwitchProduction:
    false
  readonly canEnablePersistence:
    false
  readonly canExposePlayerUi:
    false

  readonly decisionHash:
    string
}

function finding(
  input: {
    readonly code: string
    readonly severity:
      StagingCanaryEligibilityFindingSeverity
    readonly title: string
    readonly detail: string
  },
): StagingCanaryEligibilityFinding {
  return input
}

function profileCounts(
  rolloutPlan:
    StagingCanaryRolloutPlan,
): Record<
  ShadowStageProfile,
  number
> {
  const counts = {
    flat: 0,
    hilly: 0,
    mountain: 0,
  }

  for (
    const stage of
    rolloutPlan.selectedStages
  ) {
    counts[
      stage.profile
    ] += 1
  }

  return counts
}

function duplicateCount(
  values:
    readonly string[],
): number {
  const seen =
    new Set<string>()

  let duplicates = 0

  for (const value of values) {
    if (seen.has(value)) {
      duplicates += 1
    } else {
      seen.add(value)
    }
  }

  return duplicates
}

export function evaluateStagingCanaryEligibility(
  input: {
    readonly environment:
      MigrationEnvironment
    readonly requestedMode:
      unknown

    readonly aggregateReport:
      StagingShadowAcceptanceReport
    readonly rolloutPlan:
      StagingCanaryRolloutPlan

    readonly policy?:
      StagingCanaryPolicy
  },
): StagingCanaryEligibilityDecision {
  const policy =
    input.policy ??
    STAGING_CANARY_POLICY

  const modeDecision =
    resolveMigrationExecutionMode({
      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      source:
        'diagnostic',
    })

  const aggregateValidation =
    validateStagingShadowAcceptanceReport(
      input.aggregateReport,
    )

  const blockerFindings:
    StagingCanaryEligibilityFinding[] = []

  const requirementFindings:
    StagingCanaryEligibilityFinding[] = []

  const informationFindings:
    StagingCanaryEligibilityFinding[] = []

  if (
    input.environment !==
    policy.requiredEnvironment
  ) {
    blockerFindings.push(
      finding({
        code:
          'NON_STAGING_ENVIRONMENT',
        severity:
          'blocker',
        title:
          'Canary eligibility is restricted to staging',
        detail:
          `Environment ${input.environment} is not allowed; required environment is ${policy.requiredEnvironment}.`,
      }),
    )
  }

  if (
    !modeDecision.requestAccepted ||
    modeDecision.resolvedMode !==
      policy.requiredMode
  ) {
    blockerFindings.push(
      finding({
        code:
          'CANARY_MODE_NOT_RESOLVED',
        severity:
          'blocker',
        title:
          'The requested migration mode did not resolve to deterministic_canary',
        detail:
          `Resolved mode is ${modeDecision.resolvedMode}.`,
      }),
    )
  }

  if (!aggregateValidation.valid) {
    blockerFindings.push(
      finding({
        code:
          'INVALID_AGGREGATE_REPORT',
        severity:
          'blocker',
        title:
          'The Phase 8J.3 aggregate report is structurally invalid',
        detail:
          aggregateValidation
            .issues
            .join('; '),
      }),
    )
  }

  if (
    input
      .aggregateReport
      .status ===
    'blocked'
  ) {
    blockerFindings.push(
      finding({
        code:
          'BLOCKED_SHADOW_AGGREGATE',
        severity:
          'blocker',
        title:
          'The shadow-evidence aggregate is blocked',
        detail:
          'Blocked Phase 8J.3 evidence cannot proceed to staging-canary implementation.',
      }),
    )
  } else if (
    input
      .aggregateReport
      .status !==
      'passed' ||
    !input
      .aggregateReport
      .canProceedToStagingCanaryDesign
  ) {
    requirementFindings.push(
      finding({
        code:
          'SHADOW_EVIDENCE_INSUFFICIENT',
        severity:
          'requirement',
        title:
          'The shadow-evidence aggregate has not passed',
        detail:
          `Aggregate status is ${input.aggregateReport.status}.`,
      }),
    )
  }

  if (
    input
      .aggregateReport
      .canSwitchProduction ||
    input
      .aggregateReport
      .canEnablePersistence ||
    input
      .aggregateReport
      .canExposePlayerUi
  ) {
    blockerFindings.push(
      finding({
        code:
          'AGGREGATE_SCOPE_VIOLATION',
        severity:
          'blocker',
        title:
          'The aggregate report claims authority outside Phase 8J.3',
        detail:
          'Aggregate evidence may not authorize production, persistence, or player UI.',
      }),
    )
  }

  if (
    input
      .rolloutPlan
      .audience !==
    policy.requiredAudience
  ) {
    requirementFindings.push(
      finding({
        code:
          'INVALID_CANARY_AUDIENCE',
        severity:
          'requirement',
        title:
          'The canary audience must remain staging_internal',
        detail:
          `Audience ${input.rolloutPlan.audience} is not accepted.`,
      }),
    )
  }

  const selectedStageCount =
    input
      .rolloutPlan
      .selectedStages
      .length

  const selectedStageIds =
    input
      .rolloutPlan
      .selectedStages
      .map(
        (stage) =>
          stage.stageId,
      )

  const distinctStageCount =
    new Set(
      selectedStageIds,
    ).size

  const duplicateStageIds =
    duplicateCount(
      selectedStageIds,
    )

  if (
    selectedStageCount <
    policy.minimumSelectedStages
  ) {
    requirementFindings.push(
      finding({
        code:
          'TOO_FEW_CANARY_STAGES',
        severity:
          'requirement',
        title:
          'Too few stages are selected',
        detail:
          `${selectedStageCount} selected; minimum is ${policy.minimumSelectedStages}.`,
      }),
    )
  }

  if (
    selectedStageCount >
    policy.maximumSelectedStages
  ) {
    requirementFindings.push(
      finding({
        code:
          'TOO_MANY_CANARY_STAGES',
        severity:
          'requirement',
        title:
          'Too many stages are selected',
        detail:
          `${selectedStageCount} selected; maximum is ${policy.maximumSelectedStages}.`,
      }),
    )
  }

  if (duplicateStageIds > 0) {
    requirementFindings.push(
      finding({
        code:
          'DUPLICATE_CANARY_STAGE',
        severity:
          'requirement',
        title:
          'Canary stage IDs must be unique',
        detail:
          `${duplicateStageIds} duplicate stage occurrence(s) were found.`,
      }),
    )
  }

  const selectedProfileCounts =
    profileCounts(
      input.rolloutPlan,
    )

  for (
    const profile of
    [
      'flat',
      'hilly',
      'mountain',
    ] as const
  ) {
    const selected =
      selectedProfileCounts[
        profile
      ]

    const required =
      policy
        .requiredProfileCounts[
          profile
        ]

    if (selected < required) {
      requirementFindings.push(
        finding({
          code:
            `MISSING_${profile.toUpperCase()}_COHORT`,
          severity:
            'requirement',
          title:
            `Missing required ${profile} canary coverage`,
          detail:
            `${selected} selected; ${required} required.`,
        }),
      )
    }
  }

  for (
    const stage of
    input
      .rolloutPlan
      .selectedStages
  ) {
    if (
      stage.cohort !==
      expectedCohortForProfile(
        stage.profile,
      )
    ) {
      requirementFindings.push(
        finding({
          code:
            'COHORT_PROFILE_MISMATCH',
          severity:
            'requirement',
          title:
            'Stage cohort does not match its profile',
          detail:
            `${stage.stageId} uses ${stage.cohort} for profile ${stage.profile}.`,
        }),
      )
    }

    if (
      !stage
        .legacyFallbackAvailable
    ) {
      requirementFindings.push(
        finding({
          code:
            'LEGACY_FALLBACK_UNAVAILABLE',
          severity:
            'requirement',
          title:
            'Every canary stage requires a legacy fallback',
          detail:
            `${stage.stageId} does not declare a legacy fallback.`,
        }),
      )
    }

    if (
      stage.authoritativeWriter !==
        policy.authoritativeWriter ||
      stage
        .deterministicWriterEnabled !==
        policy.deterministicWriterEnabled
    ) {
      blockerFindings.push(
        finding({
          code:
            'CANARY_WRITER_CONTRACT_VIOLATION',
          severity:
            'blocker',
          title:
            'Canary writer roles violate the policy',
          detail:
            `${stage.stageId} must keep legacy authoritative and deterministic writes disabled.`,
        }),
      )
    }
  }

  if (
    !Number.isFinite(
      input
        .rolloutPlan
        .requestedExposurePercent,
    ) ||
    input
      .rolloutPlan
      .requestedExposurePercent <=
      0 ||
    input
      .rolloutPlan
      .requestedExposurePercent >
      policy.maximumExposurePercent
  ) {
    requirementFindings.push(
      finding({
        code:
          'CANARY_EXPOSURE_OUT_OF_RANGE',
        severity:
          'requirement',
        title:
          'Requested canary exposure exceeds the policy',
        detail:
          `${input.rolloutPlan.requestedExposurePercent}% requested; maximum is ${policy.maximumExposurePercent}%.`,
      }),
    )
  }

  if (
    !Number.isInteger(
      input
        .rolloutPlan
        .requestedConcurrentStages,
    ) ||
    input
      .rolloutPlan
      .requestedConcurrentStages <
      1 ||
    input
      .rolloutPlan
      .requestedConcurrentStages >
      policy.maximumConcurrentStages
  ) {
    requirementFindings.push(
      finding({
        code:
          'CANARY_CONCURRENCY_OUT_OF_RANGE',
        severity:
          'requirement',
        title:
          'Requested canary concurrency exceeds the policy',
        detail:
          `${input.rolloutPlan.requestedConcurrentStages} requested; maximum is ${policy.maximumConcurrentStages}.`,
      }),
    )
  }

  if (
    !input
      .rolloutPlan
      .monitoringOwnerAssigned
  ) {
    requirementFindings.push(
      finding({
        code:
          'MONITORING_OWNER_MISSING',
        severity:
          'requirement',
        title:
          'A monitoring owner must be assigned',
        detail:
          'The staging canary may not proceed without an assigned owner.',
      }),
    )
  }

  if (
    !input
      .rolloutPlan
      .rollbackRunbookDefined
  ) {
    requirementFindings.push(
      finding({
        code:
          'ROLLBACK_RUNBOOK_MISSING',
        severity:
          'requirement',
        title:
          'A rollback runbook must be defined',
        detail:
          'The staging canary may not proceed without a rollback runbook.',
      }),
    )
  }

  informationFindings.push(
    finding({
      code:
        'IMPLEMENTATION_ONLY_ELIGIBILITY',
      severity:
        'info',
      title:
        'Eligibility permits implementation planning only',
      detail:
        'No canary execution, persistence, production switch, or player UI activation is authorized.',
    }),
  )

  const status:
    StagingCanaryEligibilityStatus =
      blockerFindings.length >
      0
        ? 'blocked'
        : requirementFindings.length >
            0
          ? 'ineligible'
          : 'eligible'

  const decisionWithoutHash = {
    decisionVersion:
      'phase_8j4_staging_canary_eligibility_v1' as const,
    policyVersion:
      policy.policyVersion,

    status,

    environment:
      input.environment,
    modeDecision,

    aggregateReportHash:
      input
        .aggregateReport
        .reportHash,
    aggregateReportStatus:
      input
        .aggregateReport
        .status,
    aggregateReportValid:
      aggregateValidation.valid,

    selectedStageCount,
    distinctStageCount,

    selectedProfileCounts,

    requestedExposurePercent:
      input
        .rolloutPlan
        .requestedExposurePercent,
    requestedConcurrentStages:
      input
        .rolloutPlan
        .requestedConcurrentStages,

    blockerFindings,
    requirementFindings,
    informationFindings,

    canProceedToCanaryImplementation:
      status ===
      'eligible',
    canExecuteCanary:
      false as const,
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
