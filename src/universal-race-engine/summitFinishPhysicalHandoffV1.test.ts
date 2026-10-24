import { describe, expect, it } from 'vitest'
import { isFinalSummitApproachV1, getFinalSummitPhysicalGapSecondsV1 } from './summitFinishPhysicalHandoffV1.ts'

describe('physically authoritative near-summit finish handoff', () => {
  it('accepts the Oropa 100-metre finish tail but not distant climbs, descents or flat stages', () => {
    expect(isFinalSummitApproachV1(170.9, 170.8, true)).toBe(true)
    expect(isFinalSummitApproachV1(170.9, 170.9, true)).toBe(true)
    expect(isFinalSummitApproachV1(170.9, 169.5, true)).toBe(false)
    expect(isFinalSummitApproachV1(170.9, 170.8, false)).toBe(false)
    expect(isFinalSummitApproachV1(170.9, 171.5, true)).toBe(false)
  })
  it('uses physically integrated finish gaps from Oropa, not earlier crest gaps', () => {
    const colombo = [
      { kmEnd: 170.8, endGapBehindPelotonSeconds: 18.988381 },
      { kmEnd: 170.9, endGapBehindPelotonSeconds: 19.377333 },
    ]
    const rossi = [
      { kmEnd: 170.8, endGapBehindPelotonSeconds: 14.288383 },
      { kmEnd: 170.9, endGapBehindPelotonSeconds: 14.631837 },
    ]
    expect(getFinalSummitPhysicalGapSecondsV1(colombo, 170.9)).toBe(19.377333)
    expect(getFinalSummitPhysicalGapSecondsV1(rossi, 170.9)).toBe(14.631837)
    expect(getFinalSummitPhysicalGapSecondsV1(colombo.slice(0, 1), 170.9)).toBeNull()
    expect(getFinalSummitPhysicalGapSecondsV1([], 170.9)).toBeNull()
  })
  it('does not fabricate a gap if the finish physically caught the rider', () => {
    expect(getFinalSummitPhysicalGapSecondsV1([
      { kmEnd: 170.9, endGapBehindPelotonSeconds: 0 },
    ], 170.9)).toBeNull()
    expect(getFinalSummitPhysicalGapSecondsV1([
      { kmEnd: 170.9, endGapBehindPelotonSeconds: Number.NaN },
    ], 170.9)).toBeNull()
  })
})
