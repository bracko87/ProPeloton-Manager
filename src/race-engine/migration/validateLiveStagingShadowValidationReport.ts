/**
 * validateLiveStagingShadowValidationReport.ts
 *
 * Pure structural validation for Phase 8J.8A stage and batch reports.
 */

import type {
  LiveStagingShadowBatchReport,
  LiveStagingShadowStageReport,
} from './liveStagingShadowValidation'

export interface LiveStagingShadowValidation {
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

export function validateLiveStagingShadowStageReport(
  report:
    LiveStagingShadowStageReport,
): LiveStagingShadowValidation {
  const issues:
    string[] = []

  if (
    report.reportVersion !==
    'phase_8j8a_live_shadow_stage_report_v1'
  ) {
    issues.push(
      'Unexpected live shadow stage report version.',
    )
  }

  for (
    const [
      name,
      value,
    ] of
    Object.entries({
      reportHash:
        report.reportHash,
      sourceRowsHash:
        report.sourceRowsHash,
      repeatedSourceRowsHash:
        report
          .repeatedSourceRowsHash,
      stageInputHash:
        report.stageInputHash,
      repeatedStageInputHash:
        report
          .repeatedStageInputHash,
      deterministicOutputHash:
        report
          .deterministicOutputHash,
      repeatedDeterministicOutputHash:
        report
          .repeatedDeterministicOutputHash,
      replayModelHash:
        report.replayModelHash,
      repeatedReplayModelHash:
        report
          .repeatedReplayModelHash,
    })
  ) {
    if (!isHash(value)) {
      issues.push(
        `${name} must be canonical.`,
      )
    }
  }

  if (
    !report.stageId.trim() ||
    !report.label.trim() ||
    !report.raceName.trim() ||
    !report.stageName.trim()
  ) {
    issues.push(
      'Stage identity fields must be non-empty.',
    )
  }

  if (
    !Number.isFinite(
      report.distanceKm,
    ) ||
    report.distanceKm <=
      0
  ) {
    issues.push(
      'distanceKm must be positive.',
    )
  }

  for (
    const [
      name,
      value,
    ] of
    Object.entries({
      sourceRowCount:
        report.sourceRowCount,
      executableTeamCount:
        report.executableTeamCount,
      executableRiderCount:
        report.executableRiderCount,
      profilePointCount:
        report.profilePointCount,
      orderCount:
        report.orderCount,
      officialResultCount:
        report.officialResultCount,
      officialSimulationRunCount:
        report
          .officialSimulationRunCount,
      deterministicSnapshotCount:
        report
          .deterministicSnapshotCount,
      deterministicEventCount:
        report
          .deterministicEventCount,
      replayFrameCount:
        report.replayFrameCount,
      comparedTimeCount:
        report.comparedTimeCount,
    })
  ) {
    if (
      !Number.isInteger(value) ||
      value < 0
    ) {
      issues.push(
        `${name} must be a non-negative integer.`,
      )
    }
  }

  if (
    report.executableRiderCount ===
      0 ||
    report.officialResultCount ===
      0 ||
    report.replayFrameCount ===
      0
  ) {
    issues.push(
      'Live stage evidence requires riders, official results, and replay frames.',
    )
  }

  if (
    report.executionPassed &&
    (
      report.checks.some(
        (
          check,
        ) =>
          !check.passed,
      ) ||
      !report.sourceReadOnly ||
      report
        .databaseWritesPerformed ||
      report
        .deterministicWriterCalls !==
        0
    )
  ) {
    issues.push(
      'Passing execution evidence has inconsistent safety or check values.',
    )
  }

  if (
    report
      .strictMigrationComparisonPassed &&
    (
      !report.executionPassed ||
      !report.winnerMatches ||
      !report
        .exactFinishOrderMatches ||
      !report
        .finishTimeTolerancePassed
    )
  ) {
    issues.push(
      'Strict comparison may pass only when execution, winner, order, and time tolerance all pass.',
    )
  }

  if (
    report
      .databaseWritesPerformed !==
      false ||
    report
      .deterministicWriterCalls !==
      0 ||
    report
      .officialResultMutationAllowed !==
      false ||
    report.replayPersisted !==
      false ||
    report.routeChanged !==
      false ||
    report.playerUiExposed !==
      false
  ) {
    issues.push(
      'Phase 8J.8A stage safety flags must remain disabled.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}

export function validateLiveStagingShadowBatchReport(
  report:
    LiveStagingShadowBatchReport,
): LiveStagingShadowValidation {
  const issues:
    string[] = []

  if (
    report.reportVersion !==
    'phase_8j8a_live_shadow_batch_report_v1'
  ) {
    issues.push(
      'Unexpected live shadow batch report version.',
    )
  }

  if (
    !isHash(
      report.reportHash,
    ) ||
    !isHash(
      report
        .connectedProjectHostHash,
    )
  ) {
    issues.push(
      'Batch and project-host hashes must be canonical.',
    )
  }

  if (
    report.stageCount !==
      report.stages.length
  ) {
    issues.push(
      'stageCount must match stages.length.',
    )
  }

  if (
    report.flatCount +
      report.hillyCount +
      report.mountainCount !==
    report.stageCount
  ) {
    issues.push(
      'Profile counts must sum to stageCount.',
    )
  }

  const stageValidations =
    report.stages.map(
      validateLiveStagingShadowStageReport,
    )

  if (
    stageValidations.some(
      (
        validation,
      ) =>
        !validation.valid,
    )
  ) {
    issues.push(
      'One or more live stage reports are structurally invalid.',
    )
  }

  if (
    report.executionPassingStageCount !==
    report.stages.filter(
      (
        stage,
      ) =>
        stage.executionPassed,
    ).length
  ) {
    issues.push(
      'executionPassingStageCount is inconsistent.',
    )
  }

  if (
    report.strictComparisonPassingStageCount !==
    report.stages.filter(
      (
        stage,
      ) =>
        stage
          .strictMigrationComparisonPassed,
    ).length
  ) {
    issues.push(
      'strictComparisonPassingStageCount is inconsistent.',
    )
  }

  if (
    report.executionPassed &&
    report.checks.some(
      (
        check,
      ) =>
        !check.passed,
    )
  ) {
    issues.push(
      'Passing batch execution may not contain failed checks.',
    )
  }

  if (
    report
      .strictMigrationAcceptancePassed &&
    (
      !report.executionPassed ||
      report
        .strictComparisonPassingStageCount !==
        report.stageCount
    )
  ) {
    issues.push(
      'Strict migration acceptance requires every stage comparison to pass.',
    )
  }

  if (
    report
      .databaseWritesPerformed !==
      false ||
    report.persistenceEnabled !==
      false ||
    report.productionRouteChanged !==
      false ||
    report.playerUiExposed !==
      false ||
    report.deploymentPerformed !==
      false
  ) {
    issues.push(
      'Phase 8J.8A batch safety flags must remain disabled.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
