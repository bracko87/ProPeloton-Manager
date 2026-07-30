/**
 * Phase 8J.5 design-only persistence contract.
 *
 * No SQL, Supabase access, route switch, live writer, health-case write,
 * equipment mutation, or deployment is performed by this file.
 */

export type PersistenceEnvironment =
  | 'local'
  | 'development'
  | 'staging'
  | 'production'

export type PersistenceFailurePoint =
  | 'none'
  | 'after_run_header'
  | 'after_classifications'
  | 'after_events'
  | 'after_replay_snapshots'
  | 'before_commit'

export type PersistenceWriteStatus =
  | 'blocked'
  | 'committed'
  | 'idempotent_existing'
  | 'conflict'
  | 'rolled_back'

export type PersistenceTransactionStep =
  | 'validate_request'
  | 'acquire_stage_lock'
  | 'resolve_idempotency_key'
  | 'inspect_existing_run'
  | 'insert_run_header'
  | 'insert_classifications'
  | 'insert_events'
  | 'insert_replay_snapshots'
  | 'validate_written_bundle'
  | 'commit_transaction'
  | 'release_stage_lock'

export interface DeterministicPersistenceContract {
  readonly contractVersion:
    'phase_8j5_authoritative_persistence_contract_v1'

  readonly currentAuthority: 'legacy'
  readonly futureAuthority: 'deterministic'

  readonly writerEnabled: false
  readonly stagingWriteAllowed: false
  readonly productionWriteAllowed: false

  readonly transactionRequired: true
  readonly stageScopedLockRequired: true
  readonly immutableSourceBundleRequired: true
  readonly idempotencyKeyRequired: true
  readonly duplicateRunProtectionRequired: true
  readonly conflictingOutputRejected: true

  readonly exactRetryBehavior:
    'return_existing_without_write'
  readonly conflictBehavior:
    'reject_without_write'
  readonly partialFailureBehavior:
    'rollback_entire_transaction'

  readonly classificationsRequired: true
  readonly eventsRequired: true
  readonly replaySnapshotsRequired: true

  readonly historicalRewriteAllowed: false
  readonly healthCaseWritesOwnedByRaceEngine: false
  readonly equipmentMutationAllowed: false
  readonly legacyFallbackRequired: true

  readonly transactionOrder:
    readonly PersistenceTransactionStep[]
}

export const DETERMINISTIC_PERSISTENCE_CONTRACT:
  DeterministicPersistenceContract = {
    contractVersion:
      'phase_8j5_authoritative_persistence_contract_v1',

    currentAuthority: 'legacy',
    futureAuthority: 'deterministic',

    writerEnabled: false,
    stagingWriteAllowed: false,
    productionWriteAllowed: false,

    transactionRequired: true,
    stageScopedLockRequired: true,
    immutableSourceBundleRequired: true,
    idempotencyKeyRequired: true,
    duplicateRunProtectionRequired: true,
    conflictingOutputRejected: true,

    exactRetryBehavior:
      'return_existing_without_write',
    conflictBehavior:
      'reject_without_write',
    partialFailureBehavior:
      'rollback_entire_transaction',

    classificationsRequired: true,
    eventsRequired: true,
    replaySnapshotsRequired: true,

    historicalRewriteAllowed: false,
    healthCaseWritesOwnedByRaceEngine: false,
    equipmentMutationAllowed: false,
    legacyFallbackRequired: true,

    transactionOrder: [
      'validate_request',
      'acquire_stage_lock',
      'resolve_idempotency_key',
      'inspect_existing_run',
      'insert_run_header',
      'insert_classifications',
      'insert_events',
      'insert_replay_snapshots',
      'validate_written_bundle',
      'commit_transaction',
      'release_stage_lock',
    ],
  }
