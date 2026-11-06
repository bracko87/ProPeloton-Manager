import { describe, expect, it } from 'vitest'
import { isClubApplicationRestrictedRace } from './raceClubApplicationPolicy'

describe('club applications are only for club/team races', () => {
  it('blocks all national qualification and individual championship classes', () => {
    for (const category of ['NCQ', 'NC', 'WNQ', 'WRC', 'National Association']) {
      expect(isClubApplicationRestrictedRace({ category })).toBe(true)
    }
  })
  it('blocks national and representative events by authoritative metadata', () => {
    for (const metadata of [
      { individual_only: true },
      { national_championship: 'true' },
      { world_road_championship: true },
      { nations_competition: true },
      { world_road_championship_edition_id: 'an-edition-id' },
    ]) {
      expect(isClubApplicationRestrictedRace({ category: '1.1', metadata })).toBe(true)
    }
  })
  it('allows ordinary international tours and one-day club races', () => {
    for (const category of ['1.2', '2.2', '1.Pro', '2.UWT', '1.UWT']) {
      expect(isClubApplicationRestrictedRace({ category, metadata: {} })).toBe(false)
    }
  })
  it('does not make a decision based on the country or word international', () => {
    expect(isClubApplicationRestrictedRace({ category: '2.2' })).toBe(false)
    expect(isClubApplicationRestrictedRace(null)).toBe(false)
  })
})
