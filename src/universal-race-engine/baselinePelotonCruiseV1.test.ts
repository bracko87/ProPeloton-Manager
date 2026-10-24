import { describe, expect, it } from 'vitest'
import { calculateBaselinePelotonCruiseMultiplierV1 } from './runRaceEngine.ts'

const flat = {
  stageFormat: 'road_race',
  terrainType: 'flat',
  finishType: 'flat_finish',
} as const

describe('Baseline flat-road Phase-4 real chase participation', () => {
  it('does not give an uninterested peloton organized pursuit pace', () => {
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 0, 0)).toBe(0.885)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 0, 3)).toBe(0.91375)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 0, 6)).toBe(0.9425)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 0, 12)).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 0, 80)).toBe(1)
  })

  it('preserves explicit chases, no-breakaway races and all other terrain lanes', () => {
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 2, 1, 0)).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 0, 0, 0)).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(
      { ...flat, terrainType: 'hilly' }, 2, 0, 0,
    )).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(
      { ...flat, terrainType: 'mountain' }, 2, 0, 0,
    )).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(
      { ...flat, finishType: 'uphill_finish' }, 2, 0, 0,
    )).toBe(1)
    expect(calculateBaselinePelotonCruiseMultiplierV1(
      { ...flat, stageFormat: 'individual_time_trial' }, 2, 0, 0,
    )).toBe(1)
  })

  it('never creates negative, invalid or above-one cruise multipliers', () => {
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 1, 0, -10)).toBe(0.885)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 1, 0, Number.NaN)).toBe(0.885)
    expect(calculateBaselinePelotonCruiseMultiplierV1(flat, 1, 0, Number.POSITIVE_INFINITY)).toBe(0.885)
  })
})
