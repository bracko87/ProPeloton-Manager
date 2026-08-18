/**
 * validateStagingIntegrationBoundaryReport.ts
 *
 * Pure structural validation for Phase 8J.7 reports.
 */

import type {
  StagingIntegrationBoundaryReport,
} from './stagingIntegrationBoundary'

export interface StagingIntegrationBoundaryValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

function isHash(
  value: string,
): boolean {
  return /^[0-9a-f]{16}$/.test(
    value,
  )
}

export function validateStagingIntegrationBoundaryReport<
  TPayload,
>(
  report:
    StagingIntegrationBoundaryReport<TPayload>,
): StagingIntegrationBoundaryValidation {
  const issues:
    string[] = []

  if (
    report.reportVersion !==
    'phase_8j7_staging_integration_boundary_report_v1'
  ) {
    issues.push(
      'Unexpected staging integration report version.',
    )
  }

  if (!isHash(report.reportHash)) {
    issues.push(
      'Report hash must be canonical.',
    )
  }

  if (
    report.liveIntegrationComplete !==
      false ||
    report.databaseWriteCount !==
      0 ||
    report
      .officialResultMutationAllowed !==
      false ||
    report
      .deterministicPersistenceEnabled !==
      false ||
    report.productionRouteChanged !==
      false ||
    report.playerUiExposed !==
      false ||
    report.deploymentPerformed !==
      false
  ) {
    issues.push(
      'Phase 8J.7 safety flags must remain disabled.',
    )
  }

  if (
    report.status ===
      'completed'
  ) {
    if (
      !report.passed ||
      !report.sourceLoad ||
      !report.shadowEvidence ||
      !report.genericReplayPreview ||
      !report.deterministicReplayCandidate ||
      !report.replayRoutingDecision
    ) {
      issues.push(
        'Completed reports require all integration evidence and passed=true.',
      )
    }

    if (
      report.failure !==
      null ||
      report.issues.length >
        0
    ) {
      issues.push(
        'Completed reports may not contain a failure or issues.',
      )
    }

    if (
      !report.sourceLoaderInvoked ||
      !report.legacyExecutorInvoked ||
      !report.deterministicExecutorInvoked ||
      !report
        .genericReplayBuilderInvoked
    ) {
      issues.push(
        'Completed reports require every adapter to be invoked.',
      )
    }

    if (
      report
        .shadowEvidence
        ?.passed !==
        true ||
      report
        .shadowEvidence
        ?.status !==
        'completed'
    ) {
      issues.push(
        'Completed integration reports require passed shadow evidence.',
      )
    }

    if (
      report
        .replayRoutingDecision
        ?.routeTarget !==
        'legacy_replay' ||
      report
        .replayRoutingDecision
        ?.genericReplayAvailable !==
        true
    ) {
      issues.push(
        'Completed shadow integration must keep legacy visible while generic replay remains available as preview evidence.',
      )
    }
  }

  if (
    report.status ===
      'blocked'
  ) {
    if (
      report.passed ||
      report.issues.length ===
        0
    ) {
      issues.push(
        'Blocked reports require passed=false and at least one issue.',
      )
    }
  }

  if (
    report.status ===
      'failed'
  ) {
    if (
      report.passed ||
      report.failure ===
        null
    ) {
      issues.push(
        'Failed reports require passed=false and a failure object.',
      )
    }
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
