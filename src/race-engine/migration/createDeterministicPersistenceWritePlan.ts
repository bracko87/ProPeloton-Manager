/**
 * Pure Phase 8J.5 design-time write-plan builder.
 *
 * It validates and hashes an already-produced deterministic bundle. It never
 * performs a persistence write.
 */

import {
  DETERMINISTIC_PERSISTENCE_CONTRACT,
  type PersistenceEnvironment,
  type PersistenceTransactionStep,
} from './deterministicPersistenceContract'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export interface PersistenceClassificationRow {
  readonly riderId: string
  readonly finishPosition: number | null
  readonly finishTimeSeconds: number | null
  readonly finished: boolean
}

export interface PersistenceEventRow {
  readonly sequenceNumber: number
  readonly eventType: string
  readonly raceSecond: number
  readonly actorRiderId: string | null
  readonly relatedRiderIds: readonly string[]
}

export interface PersistenceReplaySnapshotRow {
  readonly sequenceNumber: number
  readonly raceSecond: number
  readonly snapshotHash: string
}

export interface DeterministicPersistenceRequest {
  readonly environment: PersistenceEnvironment
  readonly stageId: string
  readonly sourceBundleHash: string
  readonly deterministicInputHash: string
  readonly deterministicOutputHash: string
  readonly replayHash: string
  readonly engineVersion: string
  readonly simulationMode: string

  readonly classifications:
    readonly PersistenceClassificationRow[]
  readonly events:
    readonly PersistenceEventRow[]
  readonly replaySnapshots:
    readonly PersistenceReplaySnapshotRow[]

  readonly healthCaseWriteCount: number
  readonly equipmentMutationCount: number
  readonly historicalRewriteRequested: boolean
}

export interface DeterministicPersistenceWritePlan {
  readonly planVersion:
    'phase_8j5_deterministic_persistence_write_plan_v1'

  readonly requestHash: string
  readonly logicalRunKey: string
  readonly idempotencyKey: string

  readonly environment: PersistenceEnvironment
  readonly stageId: string

  readonly sourceBundleHash: string
  readonly deterministicInputHash: string
  readonly deterministicOutputHash: string
  readonly replayHash: string

  readonly classificationCount: number
  readonly eventCount: number
  readonly replaySnapshotCount: number

  readonly classificationBundleHash: string
  readonly eventBundleHash: string
  readonly replaySnapshotBundleHash: string

  readonly transactionSteps:
    readonly PersistenceTransactionStep[]

  readonly writerEnabled: false
  readonly writeAuthorized: false
  readonly stagingWriteAllowed: false
  readonly productionWriteAllowed: false

  readonly validationPassed: boolean
  readonly blockers: readonly string[]
}

function isHash(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value)
}

function duplicates(values: readonly string[]): number {
  const seen = new Set<string>()
  let count = 0

  for (const value of values) {
    if (seen.has(value)) {
      count += 1
    } else {
      seen.add(value)
    }
  }

  return count
}

export function createDeterministicPersistenceWritePlan(
  request: DeterministicPersistenceRequest,
): DeterministicPersistenceWritePlan {
  const blockers: string[] = []

  if (!request.stageId.trim()) {
    blockers.push('stageId must be non-empty.')
  }

  if (!request.engineVersion.trim()) {
    blockers.push('engineVersion must be non-empty.')
  }

  if (!request.simulationMode.trim()) {
    blockers.push('simulationMode must be non-empty.')
  }

  for (
    const [name, value] of Object.entries({
      sourceBundleHash: request.sourceBundleHash,
      deterministicInputHash:
        request.deterministicInputHash,
      deterministicOutputHash:
        request.deterministicOutputHash,
      replayHash: request.replayHash,
    })
  ) {
    if (!isHash(value)) {
      blockers.push(`${name} must be a canonical hash.`)
    }
  }

  if (request.classifications.length === 0) {
    blockers.push('At least one classification is required.')
  }

  if (request.events.length === 0) {
    blockers.push('At least one event is required.')
  }

  if (request.replaySnapshots.length === 0) {
    blockers.push('At least one replay snapshot is required.')
  }

  if (
    duplicates(
      request.classifications.map(
        (row) => row.riderId,
      ),
    ) > 0
  ) {
    blockers.push('Duplicate classification riders are forbidden.')
  }

  if (
    duplicates(
      request.events.map(
        (row) => String(row.sequenceNumber),
      ),
    ) > 0
  ) {
    blockers.push('Duplicate event sequences are forbidden.')
  }

  if (
    duplicates(
      request.replaySnapshots.map(
        (row) => String(row.sequenceNumber),
      ),
    ) > 0
  ) {
    blockers.push('Duplicate replay sequences are forbidden.')
  }

  if (
    !Number.isInteger(request.healthCaseWriteCount) ||
    request.healthCaseWriteCount < 0
  ) {
    blockers.push('healthCaseWriteCount must be non-negative.')
  } else if (request.healthCaseWriteCount > 0) {
    blockers.push(
      'Race-engine persistence may not create health cases.',
    )
  }

  if (
    !Number.isInteger(request.equipmentMutationCount) ||
    request.equipmentMutationCount < 0
  ) {
    blockers.push('equipmentMutationCount must be non-negative.')
  } else if (request.equipmentMutationCount > 0) {
    blockers.push(
      'Race-engine persistence may not mutate equipment.',
    )
  }

  if (request.historicalRewriteRequested) {
    blockers.push('Historical rewriting is forbidden.')
  }

  if (request.environment === 'staging') {
    blockers.push(
      'Staging deterministic persistence is not authorized.',
    )
  }

  if (request.environment === 'production') {
    blockers.push(
      'Production deterministic persistence is not authorized.',
    )
  }

  const classificationBundleHash =
    createCanonicalHashedValue(
      request.classifications,
    ).hash

  const eventBundleHash =
    createCanonicalHashedValue(
      request.events,
    ).hash

  const replaySnapshotBundleHash =
    createCanonicalHashedValue(
      request.replaySnapshots,
    ).hash

  const logicalRunKey =
    createCanonicalHashedValue({
      contract: 'phase_8j5_logical_run_key_v1',
      stageId: request.stageId,
      sourceBundleHash: request.sourceBundleHash,
      deterministicInputHash:
        request.deterministicInputHash,
      engineVersion: request.engineVersion,
      simulationMode: request.simulationMode,
    }).hash

  const idempotencyKey =
    createCanonicalHashedValue({
      contract: 'phase_8j5_idempotency_key_v1',
      logicalRunKey,
    }).hash

  const requestHash =
    createCanonicalHashedValue({
      contract: 'phase_8j5_persistence_request_v1',
      logicalRunKey,
      deterministicOutputHash:
        request.deterministicOutputHash,
      replayHash: request.replayHash,
      classificationBundleHash,
      eventBundleHash,
      replaySnapshotBundleHash,
    }).hash

  return {
    planVersion:
      'phase_8j5_deterministic_persistence_write_plan_v1',

    requestHash,
    logicalRunKey,
    idempotencyKey,

    environment: request.environment,
    stageId: request.stageId,

    sourceBundleHash: request.sourceBundleHash,
    deterministicInputHash:
      request.deterministicInputHash,
    deterministicOutputHash:
      request.deterministicOutputHash,
    replayHash: request.replayHash,

    classificationCount:
      request.classifications.length,
    eventCount: request.events.length,
    replaySnapshotCount:
      request.replaySnapshots.length,

    classificationBundleHash,
    eventBundleHash,
    replaySnapshotBundleHash,

    transactionSteps:
      DETERMINISTIC_PERSISTENCE_CONTRACT
        .transactionOrder
        .slice(),

    writerEnabled: false,
    writeAuthorized: false,
    stagingWriteAllowed: false,
    productionWriteAllowed: false,

    validationPassed: blockers.length === 0,
    blockers,
  }
}
