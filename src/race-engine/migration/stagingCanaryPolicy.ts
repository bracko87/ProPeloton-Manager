/**
 * stagingCanaryPolicy.ts
 *
 * Phase 8J.4 development-only staging-canary policy.
 *
 * Passing this policy authorizes only implementation planning for a controlled
 * staging canary. It never authorizes production, persistence, or player UI.
 */

import type {
  ShadowStageProfile,
} from './stagingShadowAcceptancePolicy'

export type StagingCanaryCohort =
  | 'flat_validation'
  | 'hilly_validation'
  | 'mountain_validation'

export interface StagingCanaryStageSelection {
  readonly stageId: string
  readonly profile:
    ShadowStageProfile
  readonly cohort:
    StagingCanaryCohort

  readonly legacyFallbackAvailable:
    boolean
  readonly deterministicReplayRequired:
    true

  readonly authoritativeWriter:
    'legacy'
  readonly deterministicWriterEnabled:
    false
}

export interface StagingCanaryRolloutPlan {
  readonly audience:
    'staging_internal'

  readonly selectedStages:
    readonly StagingCanaryStageSelection[]

  readonly requestedExposurePercent:
    number
  readonly requestedConcurrentStages:
    number

  readonly monitoringOwnerAssigned:
    boolean
  readonly rollbackRunbookDefined:
    boolean
}

export interface StagingCanaryMonitoringThresholds {
  readonly maximumRunFailures:
    number
  readonly maximumReplayValidationFailures:
    number
  readonly maximumClassificationDivergences:
    number
  readonly maximumEventDivergences:
    number
  readonly maximumWriterViolations:
    number
  readonly maximumSourceIntegrityViolations:
    number
  readonly maximumDuplicateExecutions:
    number
  readonly maximumFallbackActivations:
    number

  readonly warningRuntimeRatio:
    number
  readonly rollbackRuntimeRatio:
    number
}

export interface StagingCanaryPolicy {
  readonly policyVersion:
    'phase_8j4_staging_canary_policy_v1'

  readonly requiredEnvironment:
    'staging'
  readonly requiredMode:
    'deterministic_canary'
  readonly requiredAudience:
    'staging_internal'

  readonly minimumSelectedStages:
    number
  readonly maximumSelectedStages:
    number

  readonly requiredProfileCounts:
    Readonly<
      Record<
        ShadowStageProfile,
        number
      >
    >

  readonly maximumExposurePercent:
    number
  readonly maximumConcurrentStages:
    number

  readonly legacyFallbackRequired:
    true
  readonly deterministicReplayRequired:
    true
  readonly authoritativeWriter:
    'legacy'
  readonly deterministicWriterEnabled:
    false

  readonly monitoring:
    StagingCanaryMonitoringThresholds

  readonly passingPolicyAuthorizesExecution:
    false
  readonly passingPolicyAuthorizesProduction:
    false
  readonly passingPolicyAuthorizesPersistence:
    false
  readonly passingPolicyAuthorizesPlayerUi:
    false
}

export const STAGING_CANARY_POLICY:
  StagingCanaryPolicy = {
    policyVersion:
      'phase_8j4_staging_canary_policy_v1',

    requiredEnvironment:
      'staging',
    requiredMode:
      'deterministic_canary',
    requiredAudience:
      'staging_internal',

    minimumSelectedStages:
      3,
    maximumSelectedStages:
      3,

    requiredProfileCounts: {
      flat: 1,
      hilly: 1,
      mountain: 1,
    },

    maximumExposurePercent:
      10,
    maximumConcurrentStages:
      1,

    legacyFallbackRequired:
      true,
    deterministicReplayRequired:
      true,
    authoritativeWriter:
      'legacy',
    deterministicWriterEnabled:
      false,

    monitoring: {
      maximumRunFailures:
        0,
      maximumReplayValidationFailures:
        0,
      maximumClassificationDivergences:
        0,
      maximumEventDivergences:
        0,
      maximumWriterViolations:
        0,
      maximumSourceIntegrityViolations:
        0,
      maximumDuplicateExecutions:
        0,
      maximumFallbackActivations:
        0,

      warningRuntimeRatio:
        1.50,
      rollbackRuntimeRatio:
        2.00,
    },

    passingPolicyAuthorizesExecution:
      false,
    passingPolicyAuthorizesProduction:
      false,
    passingPolicyAuthorizesPersistence:
      false,
    passingPolicyAuthorizesPlayerUi:
      false,
  }

export function expectedCohortForProfile(
  profile:
    ShadowStageProfile,
): StagingCanaryCohort {
  if (profile === 'flat') {
    return 'flat_validation'
  }

  if (profile === 'hilly') {
    return 'hilly_validation'
  }

  return 'mountain_validation'
}
