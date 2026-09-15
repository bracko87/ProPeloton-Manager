export interface ReplayPhysicalStateCheckpointV16 {
  readonly checkpointId: string
  readonly finalResultsVisible: boolean
  readonly commentary: readonly {
    readonly eventType: string
    readonly title?: string | null
  }[]
}

/**
 * V16 replay-state rule: Phase 10 may only commit the authoritative final
 * road grouping at the explicit finish-group physical transition. Observational
 * finish-kilometre checkpoints (KOM, bonus/intermediate points, winner call,
 * race status) must keep the physical state that was already authoritative at
 * that step. The final result checkpoint is handled separately because it may
 * expose ranks/times but must not create a new hidden physical transition.
 */
export function shouldCommitPhase10FinalRoadStateV16(
  checkpoint: ReplayPhysicalStateCheckpointV16,
): boolean {
  if (checkpoint.finalResultsVisible) return false

  if (
    checkpoint.checkpointId.endsWith('|replay|finish-group-transition') ||
    checkpoint.checkpointId.endsWith(':phase10-finish-group-transition')
  ) {
    return true
  }

  return checkpoint.commentary.some(
    (entry) =>
      entry.eventType === 'group_split' &&
      entry.title === 'Final gaps open on the line',
  )
}

export interface ReplayPhysicalGroupMembershipV16 {
  readonly displayCode: string
  readonly physicalLineageId?: string | null
  readonly riderIds: readonly string[]
}

/** One rider -> one canonical physical group at one replay checkpoint. */
export function hasUniqueReplayGroupMembershipV16(
  groups: readonly ReplayPhysicalGroupMembershipV16[],
): boolean {
  const seen = new Set<string>()
  for (const group of groups) {
    for (const riderId of group.riderIds) {
      if (seen.has(riderId)) return false
      seen.add(riderId)
    }
  }
  return true
}

/**
 * Closed physical front lineages are forbidden from reappearing after their
 * catch. This helper is intentionally presentation-code agnostic: the stable
 * lineage id, not B/F numbering, is authoritative.
 */
export function containsClosedReplayLineageV16(
  groups: readonly ReplayPhysicalGroupMembershipV16[],
  closedLineageIds: ReadonlySet<string>,
): boolean {
  return groups.some(
    (group) =>
      group.physicalLineageId !== null &&
      group.physicalLineageId !== undefined &&
      closedLineageIds.has(group.physicalLineageId),
  )
}
