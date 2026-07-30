/**
 * validateShadowDualRunEvidence.ts
 *
 * Pure structural validation for Phase 8J.2 shadow dual-run evidence.
 */

import type {
  ShadowDualRunEvidence,
} from './shadowDualRunOrchestrator'

export interface ShadowDualRunEvidenceValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

function hashOrNull(
  value:
    string | null,
): boolean {
  return (
    value === null ||
    /^[0-9a-f]{16}$/.test(
      value,
    )
  )
}

export function validateShadowDualRunEvidence(
  evidence:
    ShadowDualRunEvidence,
): ShadowDualRunEvidenceValidation {
  const issues:
    string[] = []

  if (
    evidence.contractVersion !==
    'phase_8j2_shadow_dual_run_v1'
  ) {
    issues.push(
      'Unexpected shadow dual-run contract version.',
    )
  }

  if (
    !/^[0-9a-f]{16}$/.test(
      evidence.sourceBundleHash,
    ) ||
    !/^[0-9a-f]{16}$/.test(
      evidence
        .declaredSourceBundleHash,
    )
  ) {
    issues.push(
      'Source-bundle hashes must be canonical 16-character lowercase hexadecimal hashes.',
    )
  }

  if (
    !hashOrNull(
      evidence
        .sourceHashAfterLegacy,
    ) ||
    !hashOrNull(
      evidence
        .sourceHashAfterDeterministic,
    )
  ) {
    issues.push(
      'Post-execution source hashes must be null or canonical hashes.',
    )
  }

  if (
    !/^[0-9a-f]{16}$/.test(
      evidence.evidenceHash,
    )
  ) {
    issues.push(
      'Evidence hash must be canonical.',
    )
  }

  if (
    evidence.environment ===
      'production' &&
    evidence.status !==
      'blocked'
  ) {
    issues.push(
      'Production shadow execution must be blocked in Phase 8J.2.',
    )
  }

  if (
    evidence.status ===
      'completed'
  ) {
    if (
      !evidence.legacyRun ||
      !evidence.deterministicRun ||
      !evidence.comparison
    ) {
      issues.push(
        'Completed evidence requires both runs and a comparison report.',
      )
    }

    if (
      evidence.executionFailure !==
      null
    ) {
      issues.push(
        'Completed evidence may not include an execution failure.',
      )
    }

    if (
      evidence.authoritativeRunId !==
        evidence
          .legacyRun
          ?.runId
    ) {
      issues.push(
        'Legacy run must be the authoritative run.',
      )
    }

    if (
      evidence.shadowRunId !==
        evidence
          .deterministicRun
          ?.runId
    ) {
      issues.push(
        'Deterministic run must be the shadow run.',
      )
    }

    if (
      evidence.passed &&
      evidence
        .deterministicRun
        ?.writerCallCount !==
      0
    ) {
      issues.push(
        'Passing deterministic shadow execution must have zero writer calls.',
      )
    }

    if (
      evidence.passed &&
      (
        !evidence
          .comparison
          ?.passed ||
        !evidence
          .sourceObjectShared ||
        !evidence
          .sourceUnchanged ||
        !evidence
          .sourceBundleHashMatches ||
        evidence.issues.length >
          0
      )
    ) {
      issues.push(
        'Passed evidence requires a passed comparison, shared unchanged source, matching source hash, and no issues.',
      )
    }
  }

  if (
    evidence.status ===
      'blocked'
  ) {
    if (
      evidence.legacyRun !==
        null ||
      evidence.deterministicRun !==
        null ||
      evidence.comparison !==
        null ||
      evidence.authoritativeRunId !==
        null ||
      evidence.shadowRunId !==
        null
    ) {
      issues.push(
        'Blocked evidence may not execute or identify runs.',
      )
    }

    if (evidence.passed) {
      issues.push(
        'Blocked evidence may not pass.',
      )
    }
  }

  if (
    evidence.status ===
      'failed' &&
    evidence.executionFailure ===
      null
  ) {
    issues.push(
      'Failed evidence requires an executionFailure.',
    )
  }

  if (
    evidence
      .officialResultMutationAllowed !==
      false ||
    evidence
      .deterministicWriterEnabled !==
      false ||
    evidence
      .productionRouteChanged !==
      false ||
    evidence
      .databaseAccessed !==
      false ||
    evidence
      .deploymentPerformed !==
      false
  ) {
    issues.push(
      'Phase 8J.2 safety flags must all remain false.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
