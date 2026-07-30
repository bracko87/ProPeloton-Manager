/**
 * aggregateShadowEvidence.ts
 *
 * Pure Phase 8J.3 aggregation of already-produced Phase 8J.2 shadow evidence.
 *
 * It does not execute an engine, call Supabase, write classifications, persist
 * replay, change a route, enable a feature flag, or deploy anything.
 */

import type {
  ShadowDualRunEvidence,
} from './shadowDualRunOrchestrator'
import {
  validateShadowDualRunEvidence,
} from './validateShadowDualRunEvidence'
import {
  STAGING_SHADOW_ACCEPTANCE_POLICY,
  type ShadowStageProfile,
  type StagingShadowAcceptancePolicy,
} from './stagingShadowAcceptancePolicy'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export interface ShadowEvidenceSample {
  readonly sampleId: string
  readonly stageProfile:
    ShadowStageProfile
  readonly evidence:
    ShadowDualRunEvidence
}

export type StagingShadowAcceptanceStatus =
  | 'passed'
  | 'insufficient_evidence'
  | 'blocked'

export type StagingShadowFindingSeverity =
  | 'blocker'
  | 'warning'
  | 'info'

export interface StagingShadowFinding {
  readonly code: string
  readonly severity:
    StagingShadowFindingSeverity
  readonly title: string
  readonly detail: string
}

export interface ProfileEvidenceSummary {
  readonly total: number
  readonly completed: number
  readonly passing: number
}

export interface RuntimeRatioSummary {
  readonly sampleCount: number
  readonly minimum: number | null
  readonly average: number | null
  readonly p95: number | null
  readonly maximum: number | null
}

export interface StagingShadowAcceptanceReport {
  readonly reportVersion:
    'phase_8j3_shadow_evidence_report_v1'
  readonly policyVersion:
    StagingShadowAcceptancePolicy[
      'policyVersion'
    ]

  readonly status:
    StagingShadowAcceptanceStatus

  readonly canProceedToStagingCanaryDesign:
    boolean
  readonly canSwitchProduction:
    false
  readonly canEnablePersistence:
    false
  readonly canExposePlayerUi:
    false

  readonly totalSamples: number
  readonly completedSamples:
    number
  readonly passingSamples:
    number
  readonly blockedSamples:
    number
  readonly failedSamples:
    number

  readonly distinctStageCount:
    number

  readonly profileSummary:
    Readonly<
      Record<
        ShadowStageProfile,
        ProfileEvidenceSummary
      >
    >

  readonly structurallyInvalidEvidenceSamples:
    number
  readonly writerViolations:
    number
  readonly sourceIntegrityViolations:
    number
  readonly invalidReplaySamples:
    number

  readonly finishOrderDivergenceSamples:
    number
  readonly finishTimeToleranceFailureSamples:
    number
  readonly eventCountDivergenceSamples:
    number

  readonly duplicateEvidenceHashes:
    number
  readonly duplicateSampleIds:
    number

  readonly runtimeRatio:
    RuntimeRatioSummary

  readonly blockerFindings:
    readonly StagingShadowFinding[]
  readonly warningFindings:
    readonly StagingShadowFinding[]
  readonly informationFindings:
    readonly StagingShadowFinding[]

  readonly sampleEvidenceHashes:
    readonly string[]

  readonly reportHash: string
}

function assertNonEmpty(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `aggregateShadowEvidence: ${fieldName} must be a non-empty string.`,
    )
  }
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

function roundSix(
  value: number,
): number {
  return Number(
    value.toFixed(6),
  )
}

function percentile95(
  values:
    readonly number[],
): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted =
    values
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left - right,
      )

  const index =
    Math.max(
      0,
      Math.ceil(
        sorted.length *
          0.95,
      ) - 1,
    )

  return roundSix(
    sorted[index] ??
      0,
  )
}

function runtimeSummary(
  ratios:
    readonly number[],
): RuntimeRatioSummary {
  if (ratios.length === 0) {
    return {
      sampleCount: 0,
      minimum: null,
      average: null,
      p95: null,
      maximum: null,
    }
  }

  const minimum =
    Math.min(
      ...ratios,
    )

  const maximum =
    Math.max(
      ...ratios,
    )

  const average =
    ratios.reduce(
      (
        total,
        ratio,
      ) =>
        total + ratio,
      0,
    ) /
    ratios.length

  return {
    sampleCount:
      ratios.length,
    minimum:
      roundSix(
        minimum,
      ),
    average:
      roundSix(
        average,
      ),
    p95:
      percentile95(
        ratios,
      ),
    maximum:
      roundSix(
        maximum,
      ),
  }
}

function finding(
  input: {
    readonly code: string
    readonly severity:
      StagingShadowFindingSeverity
    readonly title: string
    readonly detail: string
  },
): StagingShadowFinding {
  return input
}

function emptyProfileSummary():
  Record<
    ShadowStageProfile,
    ProfileEvidenceSummary
  > {
  return {
    flat: {
      total: 0,
      completed: 0,
      passing: 0,
    },
    hilly: {
      total: 0,
      completed: 0,
      passing: 0,
    },
    mountain: {
      total: 0,
      completed: 0,
      passing: 0,
    },
  }
}

function replaceProfileSummary(
  summary:
    Record<
      ShadowStageProfile,
      ProfileEvidenceSummary
    >,
  profile:
    ShadowStageProfile,
  value:
    ProfileEvidenceSummary,
): void {
  summary[profile] =
    value
}

export function aggregateShadowEvidence(
  input: {
    readonly samples:
      readonly ShadowEvidenceSample[]
    readonly policy?:
      StagingShadowAcceptancePolicy
  },
): StagingShadowAcceptanceReport {
  const policy =
    input.policy ??
    STAGING_SHADOW_ACCEPTANCE_POLICY

  const profileSummary =
    emptyProfileSummary()

  const sampleIds:
    string[] = []

  const evidenceHashes:
    string[] = []

  const stageIds =
    new Set<string>()

  const runtimeRatios:
    number[] = []

  let completedSamples = 0
  let passingSamples = 0
  let blockedSamples = 0
  let failedSamples = 0

  let structurallyInvalidEvidenceSamples =
    0
  let writerViolations = 0
  let sourceIntegrityViolations =
    0
  let invalidReplaySamples = 0

  let finishOrderDivergenceSamples =
    0
  let finishTimeToleranceFailureSamples =
    0
  let eventCountDivergenceSamples =
    0

  for (
    const sample of
    input.samples
  ) {
    assertNonEmpty(
      sample.sampleId,
      'sample.sampleId',
    )

    sampleIds.push(
      sample.sampleId,
    )

    evidenceHashes.push(
      sample
        .evidence
        .evidenceHash,
    )

    stageIds.add(
      sample
        .evidence
        .stageId,
    )

    const currentProfile =
      profileSummary[
        sample.stageProfile
      ]

    replaceProfileSummary(
      profileSummary,
      sample.stageProfile,
      {
        ...currentProfile,
        total:
          currentProfile.total +
          1,
      },
    )

    const evidenceValidation =
      validateShadowDualRunEvidence(
        sample.evidence,
      )

    if (!evidenceValidation.valid) {
      structurallyInvalidEvidenceSamples +=
        1
    }

    if (
      sample.evidence.status ===
      'completed'
    ) {
      completedSamples +=
        1

      const completedProfile =
        profileSummary[
          sample.stageProfile
        ]

      replaceProfileSummary(
        profileSummary,
        sample.stageProfile,
        {
          ...completedProfile,
          completed:
            completedProfile.completed +
            1,
        },
      )
    } else if (
      sample.evidence.status ===
      'blocked'
    ) {
      blockedSamples +=
        1
    } else {
      failedSamples +=
        1
    }

    if (sample.evidence.passed) {
      passingSamples +=
        1

      const passingProfile =
        profileSummary[
          sample.stageProfile
        ]

      replaceProfileSummary(
        profileSummary,
        sample.stageProfile,
        {
          ...passingProfile,
          passing:
            passingProfile.passing +
            1,
        },
      )
    }

    const deterministicRun =
      sample
        .evidence
        .deterministicRun

    const legacyRun =
      sample
        .evidence
        .legacyRun

    if (
      deterministicRun &&
      deterministicRun
        .writerCallCount >
        0
    ) {
      writerViolations +=
        1
    }

    if (
      !sample
        .evidence
        .sourceBundleHashMatches ||
      !sample
        .evidence
        .sourceObjectShared ||
      !sample
        .evidence
        .sourceUnchanged
    ) {
      sourceIntegrityViolations +=
        1
    }

    if (
      deterministicRun &&
      !deterministicRun.replayValid
    ) {
      invalidReplaySamples +=
        1
    }

    const comparison =
      sample
        .evidence
        .comparison

    if (
      comparison &&
      !comparison.finishOrderMatches
    ) {
      finishOrderDivergenceSamples +=
        1
    }

    if (
      comparison &&
      !comparison
        .finishTimeTolerancePassed
    ) {
      finishTimeToleranceFailureSamples +=
        1
    }

    if (
      comparison &&
      !comparison.eventCountMatches
    ) {
      eventCountDivergenceSamples +=
        1
    }

    if (
      deterministicRun &&
      legacyRun &&
      legacyRun.runtimeDurationMs >
        0
    ) {
      runtimeRatios.push(
        deterministicRun
          .runtimeDurationMs /
          legacyRun.runtimeDurationMs,
      )
    }
  }

  const totalSamples =
    input.samples.length

  const distinctStageCount =
    stageIds.size

  const duplicateEvidenceHashes =
    duplicateCount(
      evidenceHashes,
    )

  const duplicateSampleIds =
    duplicateCount(
      sampleIds,
    )

  const runtimeRatio =
    runtimeSummary(
      runtimeRatios,
    )

  const blockerFindings:
    StagingShadowFinding[] = []

  const warningFindings:
    StagingShadowFinding[] = []

  const informationFindings:
    StagingShadowFinding[] = []

  if (
    structurallyInvalidEvidenceSamples >
    0
  ) {
    blockerFindings.push(
      finding({
        code:
          'STRUCTURALLY_INVALID_EVIDENCE',
        severity:
          'blocker',
        title:
          'One or more evidence objects are structurally invalid',
        detail:
          `${structurallyInvalidEvidenceSamples} sample(s) failed Phase 8J.2 evidence validation.`,
      }),
    )
  }

  if (
    writerViolations >
    policy.maximumWriterViolations
  ) {
    blockerFindings.push(
      finding({
        code:
          'DETERMINISTIC_WRITER_VIOLATION',
        severity:
          'blocker',
        title:
          'Deterministic writer activity detected',
        detail:
          `${writerViolations} sample(s) reported deterministic writer calls; the maximum is ${policy.maximumWriterViolations}.`,
      }),
    )
  }

  if (
    sourceIntegrityViolations >
    policy.maximumSourceIntegrityViolations
  ) {
    blockerFindings.push(
      finding({
        code:
          'SOURCE_INTEGRITY_VIOLATION',
        severity:
          'blocker',
        title:
          'Immutable source-bundle integrity failed',
        detail:
          `${sourceIntegrityViolations} sample(s) failed source hash, shared-object, or immutability checks.`,
      }),
    )
  }

  if (
    invalidReplaySamples >
    policy.maximumInvalidReplaySamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'REPLAY_VALIDATION_FAILURE',
        severity:
          'blocker',
        title:
          'Deterministic replay validation failed',
        detail:
          `${invalidReplaySamples} sample(s) contain invalid deterministic replay evidence.`,
      }),
    )
  }

  if (
    finishOrderDivergenceSamples >
    policy.maximumFinishOrderDivergenceSamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'FINISH_ORDER_DIVERGENCE',
        severity:
          'blocker',
        title:
          'Finish-order divergence exceeds the draft policy',
        detail:
          `${finishOrderDivergenceSamples} sample(s) diverged; the maximum is ${policy.maximumFinishOrderDivergenceSamples}.`,
      }),
    )
  }

  if (
    finishTimeToleranceFailureSamples >
    policy.maximumFinishTimeToleranceFailureSamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'FINISH_TIME_TOLERANCE_FAILURE',
        severity:
          'blocker',
        title:
          'Finish-time tolerance failed',
        detail:
          `${finishTimeToleranceFailureSamples} sample(s) exceeded their explicit comparison tolerance.`,
      }),
    )
  }

  if (
    eventCountDivergenceSamples >
    policy.maximumEventCountDivergenceSamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'EVENT_COUNT_DIVERGENCE',
        severity:
          'blocker',
        title:
          'Event-count divergence exceeds the draft policy',
        detail:
          `${eventCountDivergenceSamples} sample(s) diverged; the maximum is ${policy.maximumEventCountDivergenceSamples}.`,
      }),
    )
  }

  if (
    blockedSamples >
    policy.maximumBlockedSamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'BLOCKED_SHADOW_SAMPLE',
        severity:
          'blocker',
        title:
          'Blocked shadow samples are present',
        detail:
          `${blockedSamples} sample(s) were blocked; the maximum is ${policy.maximumBlockedSamples}.`,
      }),
    )
  }

  if (
    failedSamples >
    policy.maximumFailedSamples
  ) {
    blockerFindings.push(
      finding({
        code:
          'FAILED_SHADOW_SAMPLE',
        severity:
          'blocker',
        title:
          'Failed shadow samples are present',
        detail:
          `${failedSamples} sample(s) failed; the maximum is ${policy.maximumFailedSamples}.`,
      }),
    )
  }

  if (
    duplicateEvidenceHashes >
    policy.maximumDuplicateEvidenceHashes
  ) {
    blockerFindings.push(
      finding({
        code:
          'DUPLICATE_EVIDENCE_HASH',
        severity:
          'blocker',
        title:
          'Duplicate evidence was counted',
        detail:
          `${duplicateEvidenceHashes} duplicate evidence hash occurrence(s) were detected.`,
      }),
    )
  }

  if (
    duplicateSampleIds >
    policy.maximumDuplicateSampleIds
  ) {
    blockerFindings.push(
      finding({
        code:
          'DUPLICATE_SAMPLE_ID',
        severity:
          'blocker',
        title:
          'Duplicate sample IDs were counted',
        detail:
          `${duplicateSampleIds} duplicate sample ID occurrence(s) were detected.`,
      }),
    )
  }

  if (
    runtimeRatio.maximum !==
      null &&
    runtimeRatio.maximum >
      policy.maximumRuntimeRatio
  ) {
    blockerFindings.push(
      finding({
        code:
          'RUNTIME_RATIO_LIMIT_EXCEEDED',
        severity:
          'blocker',
        title:
          'Deterministic runtime exceeds the maximum ratio',
        detail:
          `Maximum deterministic/legacy runtime ratio is ${runtimeRatio.maximum}; the maximum is ${policy.maximumRuntimeRatio}.`,
      }),
    )
  } else if (
    runtimeRatio.p95 !==
      null &&
    runtimeRatio.p95 >
      policy.warningRuntimeRatio
  ) {
    warningFindings.push(
      finding({
        code:
          'RUNTIME_RATIO_WARNING',
        severity:
          'warning',
        title:
          'Deterministic runtime is above the warning ratio',
        detail:
          `P95 deterministic/legacy runtime ratio is ${runtimeRatio.p95}; the warning threshold is ${policy.warningRuntimeRatio}.`,
      }),
    )
  }

  const insufficientReasons:
    string[] = []

  if (
    totalSamples <
    policy.minimumTotalSamples
  ) {
    insufficientReasons.push(
      `total samples ${totalSamples}/${policy.minimumTotalSamples}`,
    )
  }

  if (
    completedSamples <
    policy.minimumCompletedSamples
  ) {
    insufficientReasons.push(
      `completed samples ${completedSamples}/${policy.minimumCompletedSamples}`,
    )
  }

  if (
    passingSamples <
    policy.minimumPassingSamples
  ) {
    insufficientReasons.push(
      `passing samples ${passingSamples}/${policy.minimumPassingSamples}`,
    )
  }

  if (
    distinctStageCount <
    policy.minimumDistinctStages
  ) {
    insufficientReasons.push(
      `distinct stages ${distinctStageCount}/${policy.minimumDistinctStages}`,
    )
  }

  for (
    const profile of
    [
      'flat',
      'hilly',
      'mountain',
    ] as const
  ) {
    const passing =
      profileSummary[
        profile
      ].passing

    const minimum =
      policy
        .minimumPassingByProfile[
          profile
        ]

    if (passing < minimum) {
      insufficientReasons.push(
        `${profile} passing samples ${passing}/${minimum}`,
      )
    }
  }

  if (
    insufficientReasons.length >
    0
  ) {
    informationFindings.push(
      finding({
        code:
          'INSUFFICIENT_SAMPLE_COVERAGE',
        severity:
          'info',
        title:
          'More accepted shadow evidence is required',
        detail:
          insufficientReasons.join(
            '; ',
          ),
      }),
    )
  }

  informationFindings.push(
    finding({
      code:
        'NO_PRODUCTION_AUTHORIZATION',
      severity:
        'info',
      title:
        'Passing the shadow policy does not authorize production',
      detail:
        'The report can permit only the next staging-canary design step. Production, persistence, and player UI remain disabled.',
    }),
  )

  const status:
    StagingShadowAcceptanceStatus =
      blockerFindings.length >
      0
        ? 'blocked'
        : insufficientReasons.length >
            0
          ? 'insufficient_evidence'
          : 'passed'

  const reportWithoutHash = {
    reportVersion:
      'phase_8j3_shadow_evidence_report_v1' as const,
    policyVersion:
      policy.policyVersion,

    status,

    canProceedToStagingCanaryDesign:
      status ===
      'passed',
    canSwitchProduction:
      false as const,
    canEnablePersistence:
      false as const,
    canExposePlayerUi:
      false as const,

    totalSamples,
    completedSamples,
    passingSamples,
    blockedSamples,
    failedSamples,

    distinctStageCount,

    profileSummary,

    structurallyInvalidEvidenceSamples,
    writerViolations,
    sourceIntegrityViolations,
    invalidReplaySamples,

    finishOrderDivergenceSamples,
    finishTimeToleranceFailureSamples,
    eventCountDivergenceSamples,

    duplicateEvidenceHashes,
    duplicateSampleIds,

    runtimeRatio,

    blockerFindings,
    warningFindings,
    informationFindings,

    sampleEvidenceHashes:
      evidenceHashes.slice(),
  }

  return {
    ...reportWithoutHash,
    reportHash:
      createCanonicalHashedValue(
        reportWithoutHash,
      ).hash,
  }
}
