import { describe, expect, it } from 'vitest'
import { mountainOpeningBreakawayPhysicallyActiveV1 } from './mountainOpeningBreakawayV1.ts'

describe('mountain replay opening breakaway physical continuity', () => {
  it('keeps Xingtai B1 until the authoritative 46.1 km catch', () => {
    // Based on the stored production physical trajectory; synthetic pure test.
    expect(mountainOpeningBreakawayPhysicallyActiveV1(3.690225, 0.75, 46.1, 38.52)).toBe(true)
    expect(mountainOpeningBreakawayPhysicallyActiveV1(3.690225, 0.75, 46.1, 40.1)).toBe(true)
    expect(mountainOpeningBreakawayPhysicallyActiveV1(3.690225, 0.75, 46.1, 45.881753)).toBe(true)
    expect(mountainOpeningBreakawayPhysicallyActiveV1(3.690225, 0.75, 46.1, 46.1)).toBe(false)
  })
  it('does not confuse the five-second official grouping tolerance with a physical catch', () => {
    expect(mountainOpeningBreakawayPhysicallyActiveV1(3.690225, 0.75, null, 34.1)).toBe(true)
    expect(mountainOpeningBreakawayPhysicallyActiveV1(0.65, 0.75, null, 34.1)).toBe(false)
    expect(mountainOpeningBreakawayPhysicallyActiveV1(0, 0.75, null, 34.1)).toBe(false)
  })
})
