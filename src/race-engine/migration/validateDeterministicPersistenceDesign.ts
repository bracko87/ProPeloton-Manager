/**
 * Pure Phase 8J.5 structural validators.
 */

import {
  DETERMINISTIC_PERSISTENCE_CONTRACT,
  type DeterministicPersistenceContract,
} from './deterministicPersistenceContract'
import type {
  DeterministicPersistenceWritePlan,
} from './createDeterministicPersistenceWritePlan'
import type {
  SimulatedPersistenceResult,
} from './simulateDeterministicPersistenceTransaction'

export interface PersistenceDesignValidation {
  readonly valid: boolean
  readonly issues: readonly string[]
}

function isHash(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value)
}

export function validateDeterministicPersistenceContract(
  contract:
    DeterministicPersistenceContract =
      DETERMINISTIC_PERSISTENCE_CONTRACT,
): PersistenceDesignValidation {
  const issues: string[] = []

  if (contract.currentAuthority !== 'legacy') {
    issues.push(
      'Current persistence authority must remain legacy.',
    )
  }

  if (
    contract.writerEnabled ||
    contract.stagingWriteAllowed ||
    contract.productionWriteAllowed
  ) {
    issues.push(
      'The deterministic writer must remain disabled.',
    )
  }

  if (
    !contract.transactionRequired ||
    !contract.stageScopedLockRequired ||
    !contract.idempotencyKeyRequired ||
    !contract.duplicateRunProtectionRequired ||
    !contract.conflictingOutputRejected
  ) {
    issues.push(
      'Transaction, lock, idempotency, duplicate, and conflict protection are mandatory.',
    )
  }

  if (
    contract.historicalRewriteAllowed ||
    contract.healthCaseWritesOwnedByRaceEngine ||
    contract.equipmentMutationAllowed
  ) {
    issues.push(
      'Historical, health, and equipment writes must remain forbidden.',
    )
  }

  const expectedOrder = [
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
  ]

  if (
    JSON.stringify(contract.transactionOrder) !==
    JSON.stringify(expectedOrder)
  ) {
    issues.push(
      'Transaction order does not match the accepted design.',
    )
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

export function validateDeterministicPersistenceWritePlan(
  plan: DeterministicPersistenceWritePlan,
): PersistenceDesignValidation {
  const issues: string[] = []

  for (
    const [name, value] of Object.entries({
      requestHash: plan.requestHash,
      logicalRunKey: plan.logicalRunKey,
      idempotencyKey: plan.idempotencyKey,
      sourceBundleHash: plan.sourceBundleHash,
      deterministicInputHash:
        plan.deterministicInputHash,
      deterministicOutputHash:
        plan.deterministicOutputHash,
      replayHash: plan.replayHash,
      classificationBundleHash:
        plan.classificationBundleHash,
      eventBundleHash: plan.eventBundleHash,
      replaySnapshotBundleHash:
        plan.replaySnapshotBundleHash,
    })
  ) {
    if (!isHash(value)) {
      issues.push(`${name} must be canonical.`)
    }
  }

  if (
    plan.writerEnabled ||
    plan.writeAuthorized ||
    plan.stagingWriteAllowed ||
    plan.productionWriteAllowed
  ) {
    issues.push(
      'A design plan may not authorize writes.',
    )
  }

  const blockers =
    Array.isArray(
      plan.blockers,
    )
      ? plan.blockers
      : null

  if (!blockers) {
    issues.push(
      'Write plan blockers must be an array.',
    )
  } else {
    if (
      plan.validationPassed &&
      blockers.length > 0
    ) {
      issues.push(
        'Passing plans may not contain blockers.',
      )
    }

    if (
      !plan.validationPassed &&
      blockers.length === 0
    ) {
      issues.push(
        'Blocked plans require blockers.',
      )
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

export function validateSimulatedPersistenceResult(
  result: SimulatedPersistenceResult,
): PersistenceDesignValidation {
  const issues: string[] = []

  if (
    !isHash(result.resultHash) ||
    !isHash(result.stateBeforeHash) ||
    !isHash(result.stateAfterHash)
  ) {
    issues.push(
      'Simulation hashes must be canonical.',
    )
  }

  if (
    result.status === 'committed' &&
    (
      !result.stateChanged ||
      result.rollbackApplied ||
      result.exactRetry ||
      result.conflictingOutput
    )
  ) {
    issues.push(
      'Committed result flags are inconsistent.',
    )
  }

  if (
    result.status ===
      'idempotent_existing' &&
    (
      result.stateChanged ||
      !result.exactRetry ||
      result.rollbackApplied ||
      result.conflictingOutput
    )
  ) {
    issues.push(
      'Idempotent result flags are inconsistent.',
    )
  }

  if (
    result.status === 'conflict' &&
    (
      result.stateChanged ||
      !result.conflictingOutput ||
      result.rollbackApplied
    )
  ) {
    issues.push(
      'Conflict result flags are inconsistent.',
    )
  }

  if (
    result.status === 'rolled_back' &&
    (
      result.stateChanged ||
      !result.rollbackApplied
    )
  ) {
    issues.push(
      'Rollback result must preserve state.',
    )
  }

  if (
    result.status === 'blocked' &&
    (
      result.stateChanged ||
      result.plan.validationPassed
    )
  ) {
    issues.push(
      'Blocked result must preserve state and use a blocked plan.',
    )
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}
