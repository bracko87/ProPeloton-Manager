/**
 * validateStagingCanaryContracts.ts
 *
 * Pure structural validators for Phase 8J.4 eligibility and monitoring
 * decisions.
 */

import type {
  StagingCanaryEligibilityDecision,
} from './evaluateStagingCanaryEligibility'
import type {
  StagingCanaryMonitoringDecision,
} from './evaluateStagingCanaryMonitoring'

export interface StagingCanaryContractValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

function canonicalHash(
  value: string,
): boolean {
  return /^[0-9a-f]{16}$/.test(
    value,
  )
}

export function validateStagingCanaryEligibilityDecision(
  decision:
    StagingCanaryEligibilityDecision,
): StagingCanaryContractValidation {
  const issues:
    string[] = []

  if (
    decision.decisionVersion !==
    'phase_8j4_staging_canary_eligibility_v1'
  ) {
    issues.push(
      'Unexpected staging-canary eligibility decision version.',
    )
  }

  if (
    !canonicalHash(
      decision.decisionHash,
    ) ||
    !canonicalHash(
      decision.aggregateReportHash,
    )
  ) {
    issues.push(
      'Eligibility and aggregate hashes must be canonical.',
    )
  }

  if (
    decision.canExecuteCanary !==
      false ||
    decision.canSwitchProduction !==
      false ||
    decision.canEnablePersistence !==
      false ||
    decision.canExposePlayerUi !==
      false
  ) {
    issues.push(
      'Eligibility may not authorize execution, production, persistence, or player UI.',
    )
  }

  if (
    decision.status ===
      'eligible'
  ) {
    if (
      decision.blockerFindings.length >
        0 ||
      decision
        .requirementFindings
        .length >
        0 ||
      !decision
        .canProceedToCanaryImplementation
    ) {
      issues.push(
        'Eligible decisions require zero blockers/requirements and implementation permission.',
      )
    }
  } else if (
    decision
      .canProceedToCanaryImplementation
  ) {
    issues.push(
      'Non-eligible decisions may not proceed to canary implementation.',
    )
  }

  if (
    decision.status ===
      'blocked' &&
    decision.blockerFindings.length ===
      0
  ) {
    issues.push(
      'Blocked eligibility requires at least one blocker.',
    )
  }

  if (
    decision.status ===
      'ineligible' &&
    decision
      .requirementFindings
      .length ===
      0
  ) {
    issues.push(
      'Ineligible decisions require at least one unmet requirement.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}

export function validateStagingCanaryMonitoringDecision(
  decision:
    StagingCanaryMonitoringDecision,
): StagingCanaryContractValidation {
  const issues:
    string[] = []

  if (
    decision.decisionVersion !==
    'phase_8j4_staging_canary_monitoring_v1'
  ) {
    issues.push(
      'Unexpected staging-canary monitoring decision version.',
    )
  }

  if (
    !canonicalHash(
      decision.decisionHash,
    ) ||
    !canonicalHash(
      decision
        .eligibilityDecisionHash,
    )
  ) {
    issues.push(
      'Monitoring and eligibility hashes must be canonical.',
    )
  }

  if (
    decision.canSwitchProduction !==
      false ||
    decision.canEnablePersistence !==
      false ||
    decision.canExposePlayerUi !==
      false
  ) {
    issues.push(
      'Monitoring may not authorize production, persistence, or player UI.',
    )
  }

  if (
    decision.status ===
      'rollback_required'
  ) {
    if (
      decision.rollbackFindings.length ===
        0 ||
      !decision
        .shouldActivateLegacyFallback ||
      decision.canContinueCanary
    ) {
      issues.push(
        'Rollback decisions require rollback findings, fallback activation, and canContinueCanary=false.',
      )
    }
  } else if (
    decision
      .shouldActivateLegacyFallback
  ) {
    issues.push(
      'Only rollback_required may activate the legacy fallback.',
    )
  }

  if (
    decision.status ===
      'continue' &&
    (
      decision.rollbackFindings.length >
        0 ||
      decision.warningFindings.length >
        0 ||
      !decision.canContinueCanary
    )
  ) {
    issues.push(
      'Continue decisions require no rollback/warning findings and canContinueCanary=true.',
    )
  }

  if (
    decision.status ===
      'warning' &&
    (
      decision.rollbackFindings.length >
        0 ||
      decision.warningFindings.length ===
        0 ||
      !decision.canContinueCanary
    )
  ) {
    issues.push(
      'Warning decisions require warnings, no rollback findings, and canContinueCanary=true.',
    )
  }

  if (
    decision.status ===
      'not_eligible' &&
    decision.canContinueCanary
  ) {
    issues.push(
      'Not-eligible decisions may not continue the canary.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
