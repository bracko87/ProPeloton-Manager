/**
 * StagingMigrationPlan.ts
 *
 * Phase 8J planning-only staging migration contract.
 *
 * This file does not:
 * - switch production execution;
 * - call Supabase;
 * - persist race results;
 * - create health cases;
 * - mutate equipment;
 * - rewrite historical results;
 * - enable a deployment flag.
 */

export type MigrationExecutionMode =
  | 'legacy_only'
  | 'dual_run_shadow'
  | 'deterministic_canary'
  | 'deterministic_primary_with_legacy_fallback'
  | 'deterministic_only'

export type MigrationEnvironment =
  | 'local'
  | 'development'
  | 'staging'
  | 'production'

export type MigrationGateStatus =
  | 'designed'
  | 'requires_implementation'
  | 'requires_approval'
  | 'blocked'

export type MigrationWorkstream =
  | 'feature_flag'
  | 'dual_run'
  | 'persistence'
  | 'rollback'
  | 'monitoring'
  | 'health_consumer'
  | 'deployment'

export interface MigrationGate {
  readonly id: string
  readonly workstream:
    MigrationWorkstream
  readonly title: string
  readonly status:
    MigrationGateStatus
  readonly evidenceRequired:
    readonly string[]
  readonly blocksProduction: boolean
}

export interface MigrationFeatureFlagContract {
  readonly defaultMode:
    'legacy_only'
  readonly allowedByEnvironment:
    Readonly<
      Record<
        MigrationEnvironment,
        readonly MigrationExecutionMode[]
      >
    >
  readonly productionModeChangeRequiresExplicitApproval:
    true
  readonly automaticProductionPromotion:
    false
  readonly legacyFallbackRequiredUntilFinalApproval:
    true
}

export interface DualRunContract {
  readonly mode:
    'dual_run_shadow'
  readonly authoritativeWriter:
    'legacy'
  readonly deterministicWriter:
    'disabled'
  readonly sourceBundleMustMatch:
    true
  readonly sourceBundleHashRequired:
    true
  readonly deterministicInputHashRequired:
    true
  readonly legacyRunIdRequired:
    true
  readonly deterministicRunIdRequired:
    true
  readonly comparisonReportRequired:
    true
  readonly deterministicReplayValidationRequired:
    true
  readonly productionResultMutationAllowed:
    false
}

export interface PersistenceDesignContract {
  readonly status:
    'design_only'
  readonly writerEnabled:
    false
  readonly transactional:
    true
  readonly idempotencyKeyRequired:
    true
  readonly duplicateRunProtectionRequired:
    true
  readonly immutableSourceSnapshotRequired:
    true
  readonly classificationWriteRequiredBeforeProduction:
    true
  readonly eventWriteRequiredBeforeProduction:
    true
  readonly replaySnapshotWriteRequiredBeforeProduction:
    true
  readonly healthCaseWriteOwnedByRaceEngine:
    false
  readonly historicalRewriteAllowed:
    false
}

export interface RollbackContract {
  readonly legacyRouteRemainsAvailable:
    true
  readonly rollbackMode:
    'legacy_only'
  readonly rollbackMustNotDeleteDeterministicEvidence:
    true
  readonly rollbackRunbookRequired:
    true
  readonly rollbackExerciseRequired:
    true
  readonly dataCompatibilityProofRequired:
    true
}

export interface MonitoringContract {
  readonly requiredSignals:
    readonly [
      'run_started',
      'run_completed',
      'run_failed',
      'runtime_duration_ms',
      'source_bundle_hash',
      'deterministic_input_hash',
      'deterministic_output_hash',
      'replay_validation_status',
      'classification_divergence',
      'event_divergence',
      'duplicate_execution_attempt',
      'persistence_failure',
      'fallback_activation',
    ]
  readonly alertThresholdsApproved:
    false
  readonly dashboardImplemented:
    false
  readonly onCallOwnerAssigned:
    false
  readonly incidentRunbookApproved:
    false
}

export interface HealthConsumerBoundary {
  readonly raceEngineCreatesHealthCases:
    false
  readonly raceEngineEmitsDeterministicIncidentEvents:
    true
  readonly downstreamConsumerRequired:
    true
  readonly downstreamConsumerImplemented:
    false
  readonly duplicateHealthCaseProtectionRequired:
    true
}

export interface StagingMigrationPlan {
  readonly planVersion:
    'phase_8j_staging_migration_design_v1'
  readonly currentProductionMode:
    'legacy_only'
  readonly productionReady:
    false
  readonly productionSwitchApproved:
    false

  readonly featureFlag:
    MigrationFeatureFlagContract
  readonly dualRun:
    DualRunContract
  readonly persistence:
    PersistenceDesignContract
  readonly rollback:
    RollbackContract
  readonly monitoring:
    MonitoringContract
  readonly healthConsumer:
    HealthConsumerBoundary

  readonly gates:
    readonly MigrationGate[]
}

export const STAGING_MIGRATION_PLAN:
  StagingMigrationPlan = {
    planVersion:
      'phase_8j_staging_migration_design_v1',

    currentProductionMode:
      'legacy_only',

    productionReady:
      false,

    productionSwitchApproved:
      false,

    featureFlag: {
      defaultMode:
        'legacy_only',

      allowedByEnvironment: {
        local: [
          'legacy_only',
          'dual_run_shadow',
          'deterministic_canary',
          'deterministic_primary_with_legacy_fallback',
          'deterministic_only',
        ],

        development: [
          'legacy_only',
          'dual_run_shadow',
          'deterministic_canary',
        ],

        staging: [
          'legacy_only',
          'dual_run_shadow',
          'deterministic_canary',
          'deterministic_primary_with_legacy_fallback',
        ],

        production: [
          'legacy_only',
        ],
      },

      productionModeChangeRequiresExplicitApproval:
        true,

      automaticProductionPromotion:
        false,

      legacyFallbackRequiredUntilFinalApproval:
        true,
    },

    dualRun: {
      mode:
        'dual_run_shadow',

      authoritativeWriter:
        'legacy',

      deterministicWriter:
        'disabled',

      sourceBundleMustMatch:
        true,

      sourceBundleHashRequired:
        true,

      deterministicInputHashRequired:
        true,

      legacyRunIdRequired:
        true,

      deterministicRunIdRequired:
        true,

      comparisonReportRequired:
        true,

      deterministicReplayValidationRequired:
        true,

      productionResultMutationAllowed:
        false,
    },

    persistence: {
      status:
        'design_only',

      writerEnabled:
        false,

      transactional:
        true,

      idempotencyKeyRequired:
        true,

      duplicateRunProtectionRequired:
        true,

      immutableSourceSnapshotRequired:
        true,

      classificationWriteRequiredBeforeProduction:
        true,

      eventWriteRequiredBeforeProduction:
        true,

      replaySnapshotWriteRequiredBeforeProduction:
        true,

      healthCaseWriteOwnedByRaceEngine:
        false,

      historicalRewriteAllowed:
        false,
    },

    rollback: {
      legacyRouteRemainsAvailable:
        true,

      rollbackMode:
        'legacy_only',

      rollbackMustNotDeleteDeterministicEvidence:
        true,

      rollbackRunbookRequired:
        true,

      rollbackExerciseRequired:
        true,

      dataCompatibilityProofRequired:
        true,
    },

    monitoring: {
      requiredSignals: [
        'run_started',
        'run_completed',
        'run_failed',
        'runtime_duration_ms',
        'source_bundle_hash',
        'deterministic_input_hash',
        'deterministic_output_hash',
        'replay_validation_status',
        'classification_divergence',
        'event_divergence',
        'duplicate_execution_attempt',
        'persistence_failure',
        'fallback_activation',
      ],

      alertThresholdsApproved:
        false,

      dashboardImplemented:
        false,

      onCallOwnerAssigned:
        false,

      incidentRunbookApproved:
        false,
    },

    healthConsumer: {
      raceEngineCreatesHealthCases:
        false,

      raceEngineEmitsDeterministicIncidentEvents:
        true,

      downstreamConsumerRequired:
        true,

      downstreamConsumerImplemented:
        false,

      duplicateHealthCaseProtectionRequired:
        true,
    },

    gates: [
      {
        id:
          'feature-flag-implementation',

        workstream:
          'feature_flag',

        title:
          'Implement environment-scoped migration mode resolution',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Typed feature-flag reader',
          'Environment allow-list enforcement',
          'Default legacy_only proof',
          'Unauthorized production mode rejection',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'staging-dual-run',

        workstream:
          'dual_run',

        title:
          'Complete staging legacy/new-engine dual runs',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Same source bundle hash',
          'Legacy and deterministic run IDs',
          'Classification comparison report',
          'Event comparison report',
          'Replay validation report',
          'Runtime performance report',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'authoritative-persistence',

        workstream:
          'persistence',

        title:
          'Implement transactional idempotent deterministic persistence',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Reviewed writer contract',
          'Idempotency key',
          'Duplicate-run protection',
          'Transaction rollback proof',
          'Classification writer test',
          'Event writer test',
          'Replay writer test',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'rollback-exercise',

        workstream:
          'rollback',

        title:
          'Exercise rollback to legacy_only',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Rollback runbook',
          'Successful staging rollback',
          'Data compatibility proof',
          'Deterministic evidence retained',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'monitoring-and-alerting',

        workstream:
          'monitoring',

        title:
          'Implement migration monitoring and alerts',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Dashboard',
          'Approved alert thresholds',
          'On-call owner',
          'Incident runbook',
          'Fallback activation alert',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'health-event-consumer',

        workstream:
          'health_consumer',

        title:
          'Connect the separate deterministic incident health consumer',

        status:
          'requires_implementation',

        evidenceRequired: [
          'Consumer contract',
          'Idempotent event consumption',
          'Duplicate health-case protection',
          'No race-engine rider_health_cases writes',
        ],

        blocksProduction:
          true,
      },

      {
        id:
          'production-approval',

        workstream:
          'deployment',

        title:
          'Receive explicit production deployment approval',

        status:
          'requires_approval',

        evidenceRequired: [
          'All technical gates passed',
          'Canary plan approved',
          'Rollback owner assigned',
          'Production window approved',
        ],

        blocksProduction:
          true,
      },
    ],
  }
