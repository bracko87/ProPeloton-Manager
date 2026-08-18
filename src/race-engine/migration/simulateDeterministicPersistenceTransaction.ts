/**
 * In-memory Phase 8J.5 transaction simulator.
 *
 * It proves idempotency, conflict rejection, and rollback semantics without a
 * database. It is not a production writer.
 */

import {
  createDeterministicPersistenceWritePlan,
  type DeterministicPersistenceRequest,
  type DeterministicPersistenceWritePlan,
  type PersistenceClassificationRow,
  type PersistenceEventRow,
  type PersistenceReplaySnapshotRow,
} from './createDeterministicPersistenceWritePlan'
import type {
  PersistenceFailurePoint,
  PersistenceWriteStatus,
} from './deterministicPersistenceContract'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export interface SimulatedPersistedRun {
  readonly idempotencyKey: string
  readonly logicalRunKey: string
  readonly requestHash: string
  readonly stageId: string
  readonly deterministicOutputHash: string
  readonly replayHash: string
  readonly classificationBundleHash: string
  readonly eventBundleHash: string
  readonly replaySnapshotBundleHash: string
}

export interface SimulatedPersistenceState {
  readonly runs:
    Readonly<Record<string, SimulatedPersistedRun>>
  readonly classifications:
    Readonly<
      Record<
        string,
        readonly PersistenceClassificationRow[]
      >
    >
  readonly events:
    Readonly<
      Record<string, readonly PersistenceEventRow[]>
    >
  readonly replaySnapshots:
    Readonly<
      Record<
        string,
        readonly PersistenceReplaySnapshotRow[]
      >
    >
}

export interface SimulatedPersistenceResult {
  readonly status: PersistenceWriteStatus
  readonly plan: DeterministicPersistenceWritePlan

  readonly stateBeforeHash: string
  readonly stateAfterHash: string
  readonly stateChanged: boolean

  readonly exactRetry: boolean
  readonly conflictingOutput: boolean
  readonly rollbackApplied: boolean

  readonly message: string
  readonly nextState: SimulatedPersistenceState
  readonly resultHash: string
}

export function emptySimulatedPersistenceState():
  SimulatedPersistenceState {
  return {
    runs: {},
    classifications: {},
    events: {},
    replaySnapshots: {},
  }
}

function cloneState(
  state: SimulatedPersistenceState,
): SimulatedPersistenceState {
  return {
    runs: {
      ...state.runs,
    },

    classifications:
      Object.fromEntries(
        Object.entries(
          state.classifications,
        ).map(
          ([key, rows]) => [
            key,
            rows.map((row) => ({
              ...row,
            })),
          ],
        ),
      ),

    events:
      Object.fromEntries(
        Object.entries(
          state.events,
        ).map(
          ([key, rows]) => [
            key,
            rows.map((row) => ({
              ...row,
              relatedRiderIds:
                row.relatedRiderIds.slice(),
            })),
          ],
        ),
      ),

    replaySnapshots:
      Object.fromEntries(
        Object.entries(
          state.replaySnapshots,
        ).map(
          ([key, rows]) => [
            key,
            rows.map((row) => ({
              ...row,
            })),
          ],
        ),
      ),
  }
}

function hashState(
  state: SimulatedPersistenceState,
): string {
  return createCanonicalHashedValue(state).hash
}

function finish(
  input: {
    readonly status: PersistenceWriteStatus
    readonly plan: DeterministicPersistenceWritePlan
    readonly stateBeforeHash: string
    readonly nextState: SimulatedPersistenceState
    readonly exactRetry: boolean
    readonly conflictingOutput: boolean
    readonly rollbackApplied: boolean
    readonly message: string
  },
): SimulatedPersistenceResult {
  const stateAfterHash =
    hashState(input.nextState)

  const withoutHash = {
    status: input.status,
    plan: input.plan,

    stateBeforeHash:
      input.stateBeforeHash,
    stateAfterHash,
    stateChanged:
      input.stateBeforeHash !== stateAfterHash,

    exactRetry: input.exactRetry,
    conflictingOutput:
      input.conflictingOutput,
    rollbackApplied:
      input.rollbackApplied,

    message: input.message,
    nextState: input.nextState,
  }

  return {
    ...withoutHash,
    resultHash:
      createCanonicalHashedValue(withoutHash).hash,
  }
}

export function simulateDeterministicPersistenceTransaction(
  input: {
    readonly state: SimulatedPersistenceState
    readonly request: DeterministicPersistenceRequest
    readonly failurePoint?: PersistenceFailurePoint
  },
): SimulatedPersistenceResult {
  const plan =
    createDeterministicPersistenceWritePlan(
      input.request,
    )

  const stateBeforeHash =
    hashState(input.state)

  const planBlockers =
    Array.isArray(
      plan.blockers,
    )
      ? plan.blockers
      : [
          'Persistence write plan did not provide a blockers array.',
        ]

  if (
    !plan.validationPassed ||
    !Array.isArray(
      plan.blockers,
    )
  ) {
    return finish({
      status: 'blocked',
      plan,
      stateBeforeHash,
      nextState: cloneState(input.state),
      exactRetry: false,
      conflictingOutput: false,
      rollbackApplied: false,
      message:
        planBlockers.join(
          '; ',
        ),
    })
  }

  const existing =
    input.state.runs[plan.idempotencyKey]

  if (existing) {
    const exactRetry =
      existing.requestHash === plan.requestHash &&
      existing.deterministicOutputHash ===
        plan.deterministicOutputHash &&
      existing.replayHash === plan.replayHash &&
      existing.classificationBundleHash ===
        plan.classificationBundleHash &&
      existing.eventBundleHash ===
        plan.eventBundleHash &&
      existing.replaySnapshotBundleHash ===
        plan.replaySnapshotBundleHash

    if (exactRetry) {
      return finish({
        status: 'idempotent_existing',
        plan,
        stateBeforeHash,
        nextState: cloneState(input.state),
        exactRetry: true,
        conflictingOutput: false,
        rollbackApplied: false,
        message:
          'Exact retry returns the existing run without another write.',
      })
    }

    return finish({
      status: 'conflict',
      plan,
      stateBeforeHash,
      nextState: cloneState(input.state),
      exactRetry: false,
      conflictingOutput: true,
      rollbackApplied: false,
      message:
        'The logical run already exists with different output evidence.',
    })
  }

  const failurePoint =
    input.failurePoint ?? 'none'

  const working =
    cloneState(input.state)

  const rollback =
    (message: string):
      SimulatedPersistenceResult =>
      finish({
        status: 'rolled_back',
        plan,
        stateBeforeHash,
        nextState: cloneState(input.state),
        exactRetry: false,
        conflictingOutput: false,
        rollbackApplied: true,
        message,
      })

  working.runs[plan.idempotencyKey] = {
    idempotencyKey: plan.idempotencyKey,
    logicalRunKey: plan.logicalRunKey,
    requestHash: plan.requestHash,
    stageId: plan.stageId,
    deterministicOutputHash:
      plan.deterministicOutputHash,
    replayHash: plan.replayHash,
    classificationBundleHash:
      plan.classificationBundleHash,
    eventBundleHash: plan.eventBundleHash,
    replaySnapshotBundleHash:
      plan.replaySnapshotBundleHash,
  }

  if (failurePoint === 'after_run_header') {
    return rollback(
      'Synthetic failure after run header.',
    )
  }

  working.classifications[
    plan.idempotencyKey
  ] =
    input.request.classifications.map(
      (row) => ({
        ...row,
      }),
    )

  if (
    failurePoint ===
    'after_classifications'
  ) {
    return rollback(
      'Synthetic failure after classifications.',
    )
  }

  working.events[plan.idempotencyKey] =
    input.request.events.map((row) => ({
      ...row,
      relatedRiderIds:
        row.relatedRiderIds.slice(),
    }))

  if (failurePoint === 'after_events') {
    return rollback(
      'Synthetic failure after events.',
    )
  }

  working.replaySnapshots[
    plan.idempotencyKey
  ] =
    input.request.replaySnapshots.map(
      (row) => ({
        ...row,
      }),
    )

  if (
    failurePoint ===
      'after_replay_snapshots' ||
    failurePoint === 'before_commit'
  ) {
    return rollback(
      `Synthetic failure at ${failurePoint}.`,
    )
  }

  return finish({
    status: 'committed',
    plan,
    stateBeforeHash,
    nextState: working,
    exactRetry: false,
    conflictingOutput: false,
    rollbackApplied: false,
    message:
      'In-memory reference transaction committed atomically.',
  })
}
