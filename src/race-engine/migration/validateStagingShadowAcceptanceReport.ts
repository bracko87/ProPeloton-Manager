/**
 * validateStagingShadowAcceptanceReport.ts
 *
 * Pure structural validation for Phase 8J.3 aggregate reports.
 */

import type {
  StagingShadowAcceptanceReport,
} from './aggregateShadowEvidence'

export interface StagingShadowAcceptanceReportValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

export function validateStagingShadowAcceptanceReport(
  report:
    StagingShadowAcceptanceReport,
): StagingShadowAcceptanceReportValidation {
  const issues:
    string[] = []

  if (
    report.reportVersion !==
    'phase_8j3_shadow_evidence_report_v1'
  ) {
    issues.push(
      'Unexpected staging shadow report version.',
    )
  }

  if (
    !/^[0-9a-f]{16}$/.test(
      report.reportHash,
    )
  ) {
    issues.push(
      'Report hash must be a canonical 16-character lowercase hexadecimal hash.',
    )
  }

  if (
    report.canSwitchProduction !==
      false ||
    report.canEnablePersistence !==
      false ||
    report.canExposePlayerUi !==
      false
  ) {
    issues.push(
      'Phase 8J.3 may not authorize production, persistence, or player UI.',
    )
  }

  if (
    report.totalSamples !==
    report.completedSamples +
      report.blockedSamples +
      report.failedSamples
  ) {
    issues.push(
      'Sample status totals do not reconcile.',
    )
  }

  const profileTotal =
    report
      .profileSummary
      .flat
      .total +
    report
      .profileSummary
      .hilly
      .total +
    report
      .profileSummary
      .mountain
      .total

  if (
    profileTotal !==
    report.totalSamples
  ) {
    issues.push(
      'Profile totals do not equal totalSamples.',
    )
  }

  const profileCompleted =
    report
      .profileSummary
      .flat
      .completed +
    report
      .profileSummary
      .hilly
      .completed +
    report
      .profileSummary
      .mountain
      .completed

  if (
    profileCompleted !==
    report.completedSamples
  ) {
    issues.push(
      'Profile completed totals do not reconcile.',
    )
  }

  const profilePassing =
    report
      .profileSummary
      .flat
      .passing +
    report
      .profileSummary
      .hilly
      .passing +
    report
      .profileSummary
      .mountain
      .passing

  if (
    profilePassing !==
    report.passingSamples
  ) {
    issues.push(
      'Profile passing totals do not reconcile.',
    )
  }

  if (
    report.status ===
      'passed'
  ) {
    if (
      report.blockerFindings.length >
      0
    ) {
      issues.push(
        'Passed reports may not contain blocker findings.',
      )
    }

    if (
      !report
        .canProceedToStagingCanaryDesign
    ) {
      issues.push(
        'Passed reports must permit only staging-canary design.',
      )
    }
  } else if (
    report
      .canProceedToStagingCanaryDesign
  ) {
    issues.push(
      'Non-passing reports may not proceed to staging-canary design.',
    )
  }

  if (
    report.status ===
      'blocked' &&
    report.blockerFindings.length ===
      0
  ) {
    issues.push(
      'Blocked reports require at least one blocker finding.',
    )
  }

  if (
    report.status ===
      'insufficient_evidence' &&
    !report
      .informationFindings
      .some(
        (finding) =>
          finding.code ===
          'INSUFFICIENT_SAMPLE_COVERAGE',
      )
  ) {
    issues.push(
      'Insufficient reports require a sample-coverage finding.',
    )
  }

  if (
    report
      .sampleEvidenceHashes
      .length !==
    report.totalSamples
  ) {
    issues.push(
      'sampleEvidenceHashes length must equal totalSamples.',
    )
  }

  if (
    report
      .sampleEvidenceHashes
      .some(
        (hash) =>
          !/^[0-9a-f]{16}$/.test(
            hash,
          ),
      )
  ) {
    issues.push(
      'Every sample evidence hash must be canonical.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
