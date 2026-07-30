/**
 * discoverDeterministicReplayCandidate.ts
 *
 * Pure deterministic-run discovery over a caller-supplied read-only catalog.
 * No database query occurs here.
 */

import type {
  DeterministicReplayCandidate,
} from './replayRoutingContract'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export type DeterministicReplayDiscoveryStatus =
  | 'available'
  | 'missing'
  | 'incomplete'
  | 'invalid'
  | 'ambiguous'

export interface DeterministicReplayDiscovery {
  readonly discoveryVersion:
    'phase_8j6_deterministic_replay_discovery_v1'

  readonly stageId: string
  readonly status:
    DeterministicReplayDiscoveryStatus

  readonly matchingCandidateCount:
    number
  readonly completeCandidateCount:
    number

  readonly selectedCandidate:
    DeterministicReplayCandidate | null

  readonly issues:
    readonly string[]

  readonly discoveryHash: string
}

function isHash(
  value: string,
): boolean {
  return /^[0-9a-f]{16}$/.test(
    value,
  )
}

function isNonNegativeInteger(
  value: number,
): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0
  )
}

function validateCompleteCandidate(
  candidate:
    DeterministicReplayCandidate,
): readonly string[] {
  const issues:
    string[] = []

  if (!candidate.runId.trim()) {
    issues.push(
      'runId must be non-empty.',
    )
  }

  if (!candidate.stageId.trim()) {
    issues.push(
      'stageId must be non-empty.',
    )
  }

  if (!candidate.engineVersion.trim()) {
    issues.push(
      'engineVersion must be non-empty.',
    )
  }

  if (!candidate.simulationMode.trim()) {
    issues.push(
      'simulationMode must be non-empty.',
    )
  }

  for (
    const [name, hash] of
    Object.entries({
      sourceBundleHash:
        candidate.sourceBundleHash,
      deterministicOutputHash:
        candidate.deterministicOutputHash,
      replayHash:
        candidate.replayHash,
      genericReplayModelHash:
        candidate.genericReplayModelHash,
    })
  ) {
    if (!isHash(hash)) {
      issues.push(
        `${name} must be canonical.`,
      )
    }
  }

  if (
    !isNonNegativeInteger(
      candidate.classificationCount,
    ) ||
    candidate.classificationCount ===
      0
  ) {
    issues.push(
      'classificationCount must be a positive integer.',
    )
  }

  if (
    !isNonNegativeInteger(
      candidate.eventCount,
    ) ||
    candidate.eventCount ===
      0
  ) {
    issues.push(
      'eventCount must be a positive integer.',
    )
  }

  if (
    !isNonNegativeInteger(
      candidate.replaySnapshotCount,
    ) ||
    candidate.replaySnapshotCount ===
      0
  ) {
    issues.push(
      'replaySnapshotCount must be a positive integer.',
    )
  }

  if (!candidate.replayValid) {
    issues.push(
      'Deterministic replay validation failed.',
    )
  }

  if (
    !isNonNegativeInteger(
      candidate
        .deterministicWriterCallCount,
    ) ||
    candidate
      .deterministicWriterCallCount !==
      0
  ) {
    issues.push(
      'Deterministic replay candidate must have zero writer calls.',
    )
  }

  return issues
}

export function discoverDeterministicReplayCandidate(
  input: {
    readonly stageId: string
    readonly candidates:
      readonly DeterministicReplayCandidate[]
  },
): DeterministicReplayDiscovery {
  if (!input.stageId.trim()) {
    throw new Error(
      'discoverDeterministicReplayCandidate: stageId must be non-empty.',
    )
  }

  const matching =
    input.candidates.filter(
      (candidate) =>
        candidate.stageId ===
        input.stageId &&
        candidate.status !==
        'superseded',
    )

  const complete =
    matching.filter(
      (candidate) =>
        candidate.status ===
        'complete',
    )

  let status:
    DeterministicReplayDiscoveryStatus

  let selectedCandidate:
    DeterministicReplayCandidate | null =
      null

  const issues:
    string[] = []

  if (matching.length === 0) {
    status = 'missing'
    issues.push(
      'No deterministic replay candidate exists for the requested stage.',
    )
  } else if (complete.length === 0) {
    status = 'incomplete'
    issues.push(
      'Matching deterministic replay candidates exist, but none are complete.',
    )
  } else if (complete.length > 1) {
    status = 'ambiguous'
    issues.push(
      'More than one complete deterministic replay candidate exists for the stage.',
    )
  } else {
    const candidate =
      complete[0]

    if (!candidate) {
      throw new Error(
        'discoverDeterministicReplayCandidate: complete candidate was unexpectedly missing.',
      )
    }

    const candidateIssues =
      validateCompleteCandidate(
        candidate,
      )

    if (
      candidateIssues.length >
      0
    ) {
      status = 'invalid'
      issues.push(
        ...candidateIssues,
      )
    } else {
      status = 'available'
      selectedCandidate =
        candidate
    }
  }

  const withoutHash = {
    discoveryVersion:
      'phase_8j6_deterministic_replay_discovery_v1' as const,

    stageId:
      input.stageId,
    status,

    matchingCandidateCount:
      matching.length,
    completeCandidateCount:
      complete.length,

    selectedCandidate,

    issues,
  }

  return {
    ...withoutHash,

    discoveryHash:
      createCanonicalHashedValue(
        withoutHash,
      ).hash,
  }
}
