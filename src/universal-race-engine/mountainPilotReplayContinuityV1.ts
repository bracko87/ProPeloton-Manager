import {
  isMountainEnginePilotStageV1,
  type MountainEnginePilotStageV1,
} from './mountainEnginePilotV1.ts'

/**
 * Pilot-only, replay-only physical catch repair.
 *
 * An interrupted safe-resume replay can show an actual B1 -> P group union
 * before it emits its scripted catch commentary. Do not invent a group split
 * to conceal the transition: recognize a catch only when the previous B1/P
 * states, physical gap and new P membership establish contact.
 *
 * NO official result, finishing time or sport-engine state is mutated here.
 * Non-pilot stages are returned untouched. Unprovable transfers are left
 * visible for the existing synchronization validator to reject/degrade.
 */
export interface MountainReplayGroupV1 {
  readonly displayCode: string
  readonly riderIds: readonly string[]
}

export interface MountainReplayGapV1 {
  readonly displayCode: string
  readonly gapSeconds: number
}

export interface MountainReplayCommentaryV1 {
  readonly commentaryId: string
  readonly eventType: string
  readonly title: string
  readonly description?: string
  readonly riderIds: readonly string[]
  readonly teamIds: readonly string[]
}

export interface MountainReplayCheckpointV1 {
  readonly checkpointId: string
  readonly groups: readonly MountainReplayGroupV1[]
  readonly gaps: readonly MountainReplayGapV1[]
  readonly commentary: readonly MountainReplayCommentaryV1[]
}

const CONTACT_TOLERANCE_SECONDS = 1

const sameRiders = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  [...a].sort().every((id, i) => id === [...b].sort()[i])

export function hasProvenOpeningCatchV1(
  before: MountainReplayCheckpointV1,
  after: MountainReplayCheckpointV1,
): { readonly caughtRiderIds: readonly string[] } | null {
  const front = before.groups.find((g) => g.displayCode === 'B1')
  const beforePeloton = before.groups.find((g) => g.displayCode === 'P')
  const afterPeloton = after.groups.find((g) => g.displayCode === 'P')
  if (!front || !beforePeloton || !afterPeloton) return null
  if (after.groups.some((g) => g.displayCode.startsWith('B'))) return null
  if (front.riderIds.length === 0) return null

  const frontGap = before.gaps.find((g) => g.displayCode === 'B1')?.gapSeconds
  const pelotonGap = before.gaps.find((g) => g.displayCode === 'P')?.gapSeconds
  if (
    frontGap === undefined || pelotonGap === undefined ||
    pelotonGap < frontGap ||
    pelotonGap - frontGap > CONTACT_TOLERANCE_SECONDS
  ) return null

  // Enforce an exact B1/P union. A rider must not teleport from another group,
  // disappear, or rejoin without a separately supported physical incident.
  const expected = [...new Set([...front.riderIds, ...beforePeloton.riderIds])]
  if (!sameRiders(expected, afterPeloton.riderIds)) return null
  return { caughtRiderIds: [...front.riderIds].sort() }
}

export function repairMountainPilotCatchCommentaryV1<
  C extends MountainReplayCheckpointV1,
>(
  stage: MountainEnginePilotStageV1,
  checkpoints: readonly C[],
  teamIdForRider: (riderId: string) => string | null,
): {
  readonly checkpoints: readonly C[]
  readonly provenCatchCount: number
  readonly unresolvedTransitions: readonly string[]
} {
  if (!isMountainEnginePilotStageV1(stage) || checkpoints.length < 2) {
    return { checkpoints, provenCatchCount: 0, unresolvedTransitions: [] }
  }

  let caught = false
  let provenCatchCount = 0
  const unresolvedTransitions: string[] = []

  const corrected = checkpoints.map((current, i) => {
    if (i === 0 || caught) return current
    const before = checkpoints[i - 1]
    const front = before.groups.find((g) => g.displayCode === 'B1')
    if (!front || current.groups.some((g) => g.displayCode.startsWith('B'))) {
      return current
    }
    const contact = hasProvenOpeningCatchV1(before, current)
    if (!contact) {
      unresolvedTransitions.push(current.checkpointId)
      return current
    }
    caught = true
    provenCatchCount++
    if (current.commentary.some((entry) =>
      entry.eventType === 'catch' &&
      contact.caughtRiderIds.every((id) => entry.riderIds.includes(id))
    )) return current
    const teams = [...new Set(contact.caughtRiderIds
      .map(teamIdForRider)
      .filter((team): team is string => Boolean(team)))].sort()
    // Replace only the safe-resume synthetic statement; keep legitimate
    // commentary, incident events and physical group membership unchanged.
    return {
      ...current,
      commentary: [
        ...current.commentary.filter((entry) =>
          !(entry.title === 'Road groups reorganize' &&
            entry.commentaryId.endsWith(':physical-group-transition'))
        ),
        {
          commentaryId: current.checkpointId + ':verified-opening-catch',
          eventType: 'catch',
          title: 'The opening breakaway is caught',
          description: 'The peloton makes physical contact with the opening move.',
          riderIds: contact.caughtRiderIds,
          teamIds: teams,
        },
      ],
    } as C
  })
  return { checkpoints: corrected, provenCatchCount, unresolvedTransitions }
}
