/**
 * stagingShadowAcceptancePolicy.ts
 *
 * Phase 8J.3 development-only staging shadow-evidence policy.
 *
 * The values are intentionally conservative draft thresholds. Passing this
 * policy permits only the next staging-design step. It never authorizes a
 * production route, writer, feature flag, deployment, or player-visible UI.
 */

export type ShadowStageProfile =
  | 'flat'
  | 'hilly'
  | 'mountain'

export interface StageProfileMinimums {
  readonly flat: number
  readonly hilly: number
  readonly mountain: number
}

export interface StagingShadowAcceptancePolicy {
  readonly policyVersion:
    'phase_8j3_staging_shadow_acceptance_v1'

  readonly minimumTotalSamples:
    number
  readonly minimumCompletedSamples:
    number
  readonly minimumPassingSamples:
    number
  readonly minimumDistinctStages:
    number

  readonly minimumPassingByProfile:
    StageProfileMinimums

  readonly maximumBlockedSamples:
    number
  readonly maximumFailedSamples:
    number

  readonly maximumWriterViolations:
    number
  readonly maximumSourceIntegrityViolations:
    number
  readonly maximumInvalidReplaySamples:
    number

  readonly maximumFinishOrderDivergenceSamples:
    number
  readonly maximumFinishTimeToleranceFailureSamples:
    number
  readonly maximumEventCountDivergenceSamples:
    number

  readonly maximumDuplicateEvidenceHashes:
    number
  readonly maximumDuplicateSampleIds:
    number

  readonly warningRuntimeRatio:
    number
  readonly maximumRuntimeRatio:
    number

  readonly passingPolicyAuthorizesProduction:
    false
  readonly passingPolicyAuthorizesPersistence:
    false
  readonly passingPolicyAuthorizesPlayerUi:
    false
}

export const STAGING_SHADOW_ACCEPTANCE_POLICY:
  StagingShadowAcceptancePolicy = {
    policyVersion:
      'phase_8j3_staging_shadow_acceptance_v1',

    minimumTotalSamples:
      6,
    minimumCompletedSamples:
      6,
    minimumPassingSamples:
      6,
    minimumDistinctStages:
      6,

    minimumPassingByProfile: {
      flat: 2,
      hilly: 2,
      mountain: 2,
    },

    maximumBlockedSamples:
      0,
    maximumFailedSamples:
      0,

    maximumWriterViolations:
      0,
    maximumSourceIntegrityViolations:
      0,
    maximumInvalidReplaySamples:
      0,

    maximumFinishOrderDivergenceSamples:
      0,
    maximumFinishTimeToleranceFailureSamples:
      0,
    maximumEventCountDivergenceSamples:
      0,

    maximumDuplicateEvidenceHashes:
      0,
    maximumDuplicateSampleIds:
      0,

    warningRuntimeRatio:
      1.50,
    maximumRuntimeRatio:
      2.00,

    passingPolicyAuthorizesProduction:
      false,
    passingPolicyAuthorizesPersistence:
      false,
    passingPolicyAuthorizesPlayerUi:
      false,
  }
