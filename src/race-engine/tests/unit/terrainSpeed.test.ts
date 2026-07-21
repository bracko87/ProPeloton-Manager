/**
 * terrainSpeed.test.ts
 *
 * Unit tests for the deterministic terrain speed utility.
 *
 * Focus:
 * - Deterministic behavior for a variety of gradients.
 * - Correct multiplier and clamping logic.
 * - Strict validation of invalid inputs.
 */

import { describe, expect, it } from 'vitest'
import { calculateTerrainSpeed, type TerrainSpeedInput } from '../../simulation/terrainSpeed'

describe('calculateTerrainSpeed', () => {
  const baseInput: TerrainSpeedInput = {
    baseSpeedKmh: 40,
    gradientPercent: 0,
    minimumSpeedKmh: 10,
    maximumSpeedKmh: 80,
  }

  it('flat terrain keeps multiplier at 1', () => {
    const result = calculateTerrainSpeed(baseInput)
    expect(result.terrainMultiplier).toBe(1)
  })

  it('flat terrain keeps base speed when within limits', () => {
    const result = calculateTerrainSpeed(baseInput)
    expect(result.speedKmh).toBe(40)
    expect(result.unclampedSpeedKmh).toBe(40)
  })

  it('positive gradient reduces speed', () => {
    const result = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: 2,
    })

    expect(result.terrainMultiplier).toBeLessThan(1)
    expect(result.speedKmh).toBeLessThan(baseInput.baseSpeedKmh)
  })

  it('steeper uphill reduces speed more', () => {
    const mild = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: 2,
    })
    const steep = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: 5,
    })

    expect(steep.speedKmh).toBeLessThan(mild.speedKmh)
  })

  it('negative gradient increases speed', () => {
    const result = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: -2,
    })

    expect(result.terrainMultiplier).toBeGreaterThan(1)
    expect(result.speedKmh).toBeGreaterThan(baseInput.baseSpeedKmh)
  })

  it('steeper downhill increases speed more', () => {
    const mild = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: -2,
    })
    const steep = calculateTerrainSpeed({
      ...baseInput,
      gradientPercent: -5,
    })

    expect(steep.speedKmh).toBeGreaterThan(mild.speedKmh)
  })

  it('uses documented example values for uphill at 5%', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 40,
      gradientPercent: 5,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.terrainMultiplier).toBeCloseTo(0.825, 6)
    expect(result.unclampedSpeedKmh).toBeCloseTo(33, 6)
  })

  it('uses documented example values for downhill at -5%', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 40,
      gradientPercent: -5,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.terrainMultiplier).toBeCloseTo(1.09, 6)
    expect(result.unclampedSpeedKmh).toBeCloseTo(43.6, 6)
  })

  it('uphill multiplier cannot fall below 0.35', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 40,
      gradientPercent: 30,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.terrainMultiplier).toBeGreaterThanOrEqual(0.35)
  })

  it('downhill multiplier cannot exceed 1.35', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 40,
      gradientPercent: -30,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.terrainMultiplier).toBeLessThanOrEqual(1.35)
  })

  it('final speed is clamped to minimumSpeedKmh', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 5,
      gradientPercent: 0,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.unclampedSpeedKmh).toBeLessThan(10)
    expect(result.speedKmh).toBe(10)
  })

  it('final speed is clamped to maximumSpeedKmh', () => {
    const result = calculateTerrainSpeed({
      baseSpeedKmh: 100,
      gradientPercent: -10,
      minimumSpeedKmh: 10,
      maximumSpeedKmh: 80,
    })

    expect(result.unclampedSpeedKmh).toBeGreaterThan(80)
    expect(result.speedKmh).toBe(80)
  })

  it('non-finite inputs are rejected', () => {
    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: Number.NaN,
        gradientPercent: 0,
        minimumSpeedKmh: 10,
        maximumSpeedKmh: 80,
      }),
    ).toThrow()

    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent: Number.POSITIVE_INFINITY,
        minimumSpeedKmh: 10,
        maximumSpeedKmh: 80,
      }),
    ).toThrow()
  })

  it('invalid minimum and maximum speeds are rejected', () => {
    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent: 0,
        minimumSpeedKmh: 0,
        maximumSpeedKmh: 80,
      }),
    ).toThrow()

    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent: 0,
        minimumSpeedKmh: 20,
        maximumSpeedKmh: 10,
      }),
    ).toThrow()
  })

  it('gradient below -30 is rejected', () => {
    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent: -31,
        minimumSpeedKmh: 10,
        maximumSpeedKmh: 80,
      }),
    ).toThrow()
  })

  it('gradient above 30 is rejected', () => {
    expect(() =>
      calculateTerrainSpeed({
        baseSpeedKmh: 40,
        gradientPercent: 31,
        minimumSpeedKmh: 10,
        maximumSpeedKmh: 80,
      }),
    ).toThrow()
  })

  it('same input produces identical output', () => {
    const input: TerrainSpeedInput = {
      baseSpeedKmh: 47.5,
      gradientPercent: -3.2,
      minimumSpeedKmh: 15,
      maximumSpeedKmh: 75,
    }

    const resultA = calculateTerrainSpeed(input)
    const resultB = calculateTerrainSpeed(input)

    expect(resultA).toStrictEqual(resultB)
  })
})