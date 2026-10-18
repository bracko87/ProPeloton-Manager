import { describe, expect, it } from 'vitest'
import { calculateSummitFinishSelectivityV1 } from './summitFinishSelectivityV1.ts'

/**
 * Read-only French Tour 2000 stage-profile fixtures (not simulated official
 * results). Synthetic rider distributions are intentionally explicit, so
 * fixture tests never claim to have replayed the historical race.
 */
const field = Array.from({ length: 168 }, (_, i) => 82 - i * 0.26)
const profile = (
  distance: number, totalGain: number, climb: number, gradient: number,
) => ({
  stageDistanceKm: distance,
  stageElevationGainM: totalGain,
  climbStartKm: distance - climb,
  climbEndKm: distance,
  climbDistanceKm: climb,
  averageGradientPercent: gradient,
  climbElevationGainM: climb * gradient * 10,
  climbHardness: 0.8,
  summitFinish: true,
  holdScores: field,
})

describe('future-only high-mountain contact selectivity', () => {
  it('tests real French Tour summit route parameters without writing history', () => {
    const hautacam = calculateSummitFinishSelectivityV1(
      profile(171.5, 3650, 12.8, 6.7),
    )
    const ventoux = calculateSummitFinishSelectivityV1(
      profile(171.5, 2929, 21, 7.5),
    )
    const laPlagne = calculateSummitFinishSelectivityV1(
      profile(93.1, 3431, 19.1, 7.2),
    )
    for (const result of [hautacam, ventoux, laPlagne]) {
      expect(result.active).toBe(true)
      expect(result.requiredHoldScore).toBeGreaterThan(0)
      expect(result.minimumEnergyToHold).toBeGreaterThan(7)
    }
    expect(ventoux.requiredHoldScore).toBeGreaterThan(
      hautacam.requiredHoldScore,
    )
    // Difficulty and prior climbs are combined, never treated as a scripted
    // ten-rider front group or a fixed number of seconds at the finish.
    const survivors = [hautacam, ventoux, laPlagne].map(
      (result) => field.filter((s) => s >= result.requiredHoldScore).length,
    )
    expect(survivors.every((n) => n > 0 && n < field.length / 2)).toBe(true)
    expect(survivors[1]).toBeLessThan(survivors[0])
  })

  it('reacts to the actual skill distribution rather than a preset headcount', () => {
    const stage = profile(171.5, 2929, 21, 7.5)
    const strong = calculateSummitFinishSelectivityV1({
      ...stage, holdScores: [93, 91, 87, 84, 78, 62, 56, 51, 47, 42, 41],
    })
    const balanced = calculateSummitFinishSelectivityV1({
      ...stage, holdScores: [76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66],
    })
    const count = (r: typeof strong, scores: readonly number[]) =>
      scores.filter((x) => x >= r.requiredHoldScore).length
    expect(count(strong, [93, 91, 87, 84, 78, 62, 56, 51, 47, 42, 41]))
      .not.toBe(count(balanced, [76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66]))
  })

  it('does not activate on Paris flat finish, on a descent, or on a short hill', () => {
    const hard = profile(171.5, 2929, 21, 7.5)
    expect(calculateSummitFinishSelectivityV1({
      ...hard, summitFinish: false,
    }).active).toBe(false)
    expect(calculateSummitFinishSelectivityV1({
      ...hard, climbEndKm: hard.stageDistanceKm - 12,
    }).active).toBe(false)
    expect(calculateSummitFinishSelectivityV1(
      profile(172, 850, 2.5, 5.3),
    ).active).toBe(false)
  })

  it('does not introduce a gap between identical riders after the finish', () => {
    const same = calculateSummitFinishSelectivityV1({
      ...profile(171.5, 2929, 21, 7.5), holdScores: [65, 65, 65, 65],
    })
    expect(same.active).toBe(true)
    expect([65, 65, 65, 65].every((s) => s >= same.requiredHoldScore))
      .toBe(true)
    // Downstream seconds come only from the existing group-speed integrator.
    expect('gapSeconds' in same).toBe(false)
  })
})
