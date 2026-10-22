import { describe, expect, it } from 'vitest'
import {
  hasProvenOpeningCatchV1,
  repairMountainPilotCatchCommentaryV1,
  type MountainReplayCheckpointV1,
} from './mountainPilotReplayContinuityV1.ts'

const stage = {
  stageId: '62c7ca62-b6aa-470f-bf32-0822f64849c0',
  stageFormat: 'road_race',
  terrainType: 'mountain',
}
const initial: MountainReplayCheckpointV1 = {
  checkpointId: 'xingtai:incident-2:37.449028',
  groups: [
    { displayCode: 'B1', riderIds: ['r1', 'r2', 'r3', 'r4'] },
    { displayCode: 'P', riderIds: ['r5', 'r6'] },
    { displayCode: 'C1', riderIds: ['r7'] },
  ],
  gaps: [
    { displayCode: 'B1', gapSeconds: 0 },
    { displayCode: 'P', gapSeconds: 0.615596 },
    { displayCode: 'C1', gapSeconds: 71.615596 },
  ],
  commentary: [],
}
const contact: MountainReplayCheckpointV1 = {
  checkpointId: 'xingtai:race-status-30:38.52',
  groups: [
    { displayCode: 'P', riderIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] },
    { displayCode: 'C1', riderIds: ['r7'] },
  ],
  gaps: [
    { displayCode: 'P', gapSeconds: 0 },
    { displayCode: 'C1', gapSeconds: 66.720712 },
  ],
  commentary: [{
    commentaryId: 'xingtai:race-status-30:38.52:physical-group-transition',
    eventType: 'group_split',
    title: 'Road groups reorganize',
    riderIds: ['r1', 'r2', 'r3', 'r4'],
    teamIds: [],
  }],
}

describe('pilot safe-resume physical catch continuity', () => {
  it('recognizes Xingtai-like B1-to-P contact from gap and exact group union', () => {
    expect(hasProvenOpeningCatchV1(initial, contact)?.caughtRiderIds)
      .toEqual(['r1', 'r2', 'r3', 'r4'])
    const outcome = repairMountainPilotCatchCommentaryV1(stage, [initial, contact], () => 'team-a')
    expect(outcome.provenCatchCount).toBe(1)
    expect(outcome.unresolvedTransitions).toHaveLength(0)
    const repaired = outcome.checkpoints[1]
    expect(repaired.groups).toEqual(contact.groups)
    expect(repaired.gaps).toEqual(contact.gaps)
    expect(repaired.commentary.map((e) => e.eventType)).toEqual(['catch'])
    expect(repaired.commentary[0].riderIds).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(repaired.commentary[0].teamIds).toEqual(['team-a'])
  })

  it('never manufactures a catch with a large physical gap', () => {
    const far = { ...initial, gaps: [{ displayCode: 'B1', gapSeconds: 0 }, { displayCode: 'P', gapSeconds: 20 }] }
    expect(hasProvenOpeningCatchV1(far, contact)).toBeNull()
    const outcome = repairMountainPilotCatchCommentaryV1(stage, [far, contact], () => null)
    expect(outcome.provenCatchCount).toBe(0)
    expect(outcome.unresolvedTransitions).toEqual([contact.checkpointId])
    expect(outcome.checkpoints[1]).toBe(contact)
  })

  it('never hides missing riders or false physical group membership', () => {
    const missing = { ...contact, groups: [{ displayCode: 'P', riderIds: ['r1', 'r2', 'r3', 'r5', 'r6'] }] }
    expect(hasProvenOpeningCatchV1(initial, missing)).toBeNull()
    const outcome = repairMountainPilotCatchCommentaryV1(stage, [initial, missing], () => null)
    expect(outcome.unresolvedTransitions).toHaveLength(1)
    expect(outcome.checkpoints[1]).toBe(missing)
  })

  it('keeps the normal engine and every nonpilot race completely unchanged', () => {
    const other = { ...stage, stageId: 'unapproved-mountain-stage' }
    const checkpoints = [initial, contact]
    const outcome = repairMountainPilotCatchCommentaryV1(other, checkpoints, () => null)
    expect(outcome.checkpoints).toBe(checkpoints)
    expect(outcome.provenCatchCount).toBe(0)
  })

  it('is replay-only and idempotent for an already documented catch', () => {
    const alreadyDocumented = {
      ...contact,
      commentary: [{
        commentaryId: 'existing-physical-catch',
        eventType: 'catch', title: 'The breakaway is caught',
        riderIds: ['r1', 'r2', 'r3', 'r4'], teamIds: [],
      }],
    }
    const result = repairMountainPilotCatchCommentaryV1(stage, [initial, alreadyDocumented], () => null)
    expect(result.checkpoints[1]).toBe(alreadyDocumented)
  })
})
