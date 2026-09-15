import { describe, expect, it } from 'vitest'

import {
  containsClosedReplayLineageV16,
  hasUniqueReplayGroupMembershipV16,
  shouldCommitPhase10FinalRoadStateV16,
} from './replayPhysicalStateV16.ts'

describe('V16 replay physical-state stabilization', () => {
  it('does not silently commit final groups at observational finish-km checkpoints', () => {
    expect(
      shouldCommitPhase10FinalRoadStateV16({
        checkpointId: 'stage|replay|point-finish-kom',
        finalResultsVisible: false,
        commentary: [{ eventType: 'kom', title: 'Final KOM' }],
      }),
    ).toBe(false)

    expect(
      shouldCommitPhase10FinalRoadStateV16({
        checkpointId: 'stage|replay|winner-finish',
        finalResultsVisible: false,
        commentary: [{ eventType: 'finish', title: 'Stage winner' }],
      }),
    ).toBe(false)
  })

  it('commits final groups only at the explicit finish physical transition', () => {
    expect(
      shouldCommitPhase10FinalRoadStateV16({
        checkpointId: 'stage|replay|finish-group-transition',
        finalResultsVisible: false,
        commentary: [
          { eventType: 'group_split', title: 'Final gaps open on the line' },
        ],
      }),
    ).toBe(true)

    // Result publication is separate from physical state mutation.
    expect(
      shouldCommitPhase10FinalRoadStateV16({
        checkpointId: 'stage|replay|final-results',
        finalResultsVisible: true,
        commentary: [{ eventType: 'finish', title: 'Results' }],
      }),
    ).toBe(false)
  })

  it('enforces one canonical group membership per rider per checkpoint', () => {
    expect(
      hasUniqueReplayGroupMembershipV16([
        { displayCode: 'P', riderIds: ['r1', 'r2'] },
        { displayCode: 'C1', riderIds: ['r3'] },
      ]),
    ).toBe(true)

    expect(
      hasUniqueReplayGroupMembershipV16([
        { displayCode: 'P', riderIds: ['r1', 'r2'] },
        { displayCode: 'C1', riderIds: ['r2', 'r3'] },
      ]),
    ).toBe(false)
  })

  it('detects resurrection of a closed break/front lineage', () => {
    const closed = new Set(['opening-break-generation-1'])
    expect(
      containsClosedReplayLineageV16(
        [
          {
            displayCode: 'B1',
            physicalLineageId: 'opening-break-generation-1',
            riderIds: ['r1', 'r2'],
          },
          { displayCode: 'P', physicalLineageId: null, riderIds: ['r3'] },
        ],
        closed,
      ),
    ).toBe(true)

    expect(
      containsClosedReplayLineageV16(
        [
          { displayCode: 'P', physicalLineageId: null, riderIds: ['r1', 'r2', 'r3'] },
        ],
        closed,
      ),
    ).toBe(false)
  })
})
