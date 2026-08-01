import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateTerrainMovement,
  calculateTerrainSpeedMultiplier,
} from '../core/terrainMovement'
import {
  controlledFlatMovementProfile,
  controlledHillyMovementProfile,
  controlledMountainMovementProfile,
} from '../fixtures/terrainMovementProfiles'

describe(
  'B2.2 deterministic terrain-driven movement',
  () => {
    it(
      'produces identical movement for identical input',
      () => {
        const input = {
          profile: controlledMountainMovementProfile,
          startKm: 31,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        } as const

        expect(
          calculateTerrainMovement(input),
        ).toEqual(
          calculateTerrainMovement(input),
        )
      },
    )

    it(
      'keeps a zero-gradient flat phase at the base speed',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'flat',
            0,
          ),
        ).toBe(1)
      },
    )

    it(
      'slows a shallow positive flat gradient',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'flat',
            1,
          ),
        ).toBe(0.988)
      },
    )

    it(
      'speeds a shallow negative flat gradient',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'flat',
            -1,
          ),
        ).toBe(1.012)
      },
    )

    it(
      'makes rolling terrain slower than flat terrain',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'rolling',
            2.5,
          ),
        ).toBeLessThan(
          calculateTerrainSpeedMultiplier(
            'flat',
            0,
          ),
        )
      },
    )

    it(
      'makes a climb slower than rolling terrain',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'climb',
            4.8,
          ),
        ).toBeLessThan(
          calculateTerrainSpeedMultiplier(
            'rolling',
            2.5,
          ),
        )
      },
    )

    it(
      'makes a steeper climb slower than a shallower climb',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'climb',
            5.5,
          ),
        ).toBeLessThan(
          calculateTerrainSpeedMultiplier(
            'climb',
            4.8,
          ),
        )
      },
    )

    it(
      'makes a descent faster than a flat phase',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'descent',
            -1.82,
          ),
        ).toBeGreaterThan(1)
      },
    )

    it(
      'makes a steeper descent faster than a shallow descent',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'descent',
            -4.25,
          ),
        ).toBeGreaterThan(
          calculateTerrainSpeedMultiplier(
            'descent',
            -1.82,
          ),
        )
      },
    )

    it(
      'caps extreme climb and descent multipliers',
      () => {
        expect(
          calculateTerrainSpeedMultiplier(
            'climb',
            25,
          ),
        ).toBe(0.68)
        expect(
          calculateTerrainSpeedMultiplier(
            'descent',
            -25,
          ),
        ).toBe(1.22)
      },
    )

    it(
      'moves one flat phase using effective terrain speed',
      () => {
        const result = calculateTerrainMovement({
          profile: controlledFlatMovementProfile,
          startKm: 0,
          durationSeconds: 600,
          baseSpeedKmh: 42,
        })

        expect(result.endKm).toBe(7)
        expect(result.distanceKm).toBe(7)
        expect(result.segments).toHaveLength(1)
        expect(
          result.segments[0].effectiveSpeedKmh,
        ).toBe(42)
      },
    )

    it(
      'splits movement exactly when it crosses from flat to climb',
      () => {
        const result = calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 31,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        })

        expect(result.segments).toHaveLength(2)
        expect(
          result.segments.map(
            (segment) => segment.terrainType,
          ),
        ).toEqual(['flat', 'climb'])
        expect(result.segments[0].endKm).toBe(32)
        expect(
          result.phaseBoundaryCrossingCount,
        ).toBe(1)
      },
    )

    it(
      'assigns an exact internal boundary to the following phase',
      () => {
        const result = calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 32,
          durationSeconds: 60,
          baseSpeedKmh: 40,
        })

        expect(result.segments).toHaveLength(1)
        expect(
          result.segments[0].terrainType,
        ).toBe('climb')
        expect(result.startedPhaseId).toContain(
          'phase-002',
        )
      },
    )

    it(
      'can cross multiple terrain phases in one movement request',
      () => {
        const result = calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 30,
          durationSeconds: 4000,
          baseSpeedKmh: 50,
        })

        expect(
          result.phaseBoundaryCrossingCount,
        ).toBeGreaterThanOrEqual(2)
        expect(result.segments.length).toBeGreaterThanOrEqual(
          3,
        )
        expect(result.segments[0].terrainType).toBe(
          'flat',
        )
        expect(result.segments[1].terrainType).toBe(
          'climb',
        )
      },
    )

    it(
      'clamps movement at the stage finish and reports unused time',
      () => {
        const result = calculateTerrainMovement({
          profile: controlledFlatMovementProfile,
          startKm: 49,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        })

        expect(result.endKm).toBe(50)
        expect(result.stageFinished).toBe(true)
        expect(result.elapsedDurationSeconds).toBe(90)
        expect(result.unusedDurationSeconds).toBe(510)
        expect(
          result.segments[0].reachedStageFinish,
        ).toBe(true)
      },
    )

    it(
      'returns a finished no-movement result when already at the finish',
      () => {
        const result = calculateTerrainMovement({
          profile: controlledFlatMovementProfile,
          startKm: 50,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        })

        expect(result.distanceKm).toBe(0)
        expect(result.segments).toEqual([])
        expect(result.stageFinished).toBe(true)
        expect(result.unusedDurationSeconds).toBe(600)
      },
    )

    it(
      'applies the confirmed Stage 6 four-point-eight-percent climb',
      () => {
        const result = calculateTerrainMovement({
          profile: controlledHillyMovementProfile,
          startKm: 37,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        })

        expect(
          result.segments[0].averageGradientPercent,
        ).toBe(4.8)
        expect(
          result.segments[0].terrainSpeedMultiplier,
        ).toBe(0.8376)
        expect(
          result.segments[0].effectiveSpeedKmh,
        ).toBe(33.504)
      },
    )

    it(
      'makes the confirmed Stage 3 second climb slower than the Stage 6 climb',
      () => {
        const stage3 = calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 96,
          durationSeconds: 60,
          baseSpeedKmh: 40,
        })
        const stage6 = calculateTerrainMovement({
          profile: controlledHillyMovementProfile,
          startKm: 37,
          durationSeconds: 60,
          baseSpeedKmh: 40,
        })

        expect(
          stage3.segments[0].averageGradientPercent,
        ).toBe(5.5)
        expect(
          stage3.segments[0].effectiveSpeedKmh,
        ).toBeLessThan(
          stage6.segments[0].effectiveSpeedKmh,
        )
      },
    )

    it(
      'applies the confirmed Stage 3 steep descent speed increase',
      () => {
        const result = calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 108,
          durationSeconds: 60,
          baseSpeedKmh: 40,
        })

        expect(
          result.segments[0].averageGradientPercent,
        ).toBe(-4.25)
        expect(
          result.segments[0].effectiveSpeedKmh,
        ).toBeGreaterThan(44)
      },
    )

    it(
      'does not mutate the normalized profile input',
      () => {
        const before = JSON.stringify(
          controlledMountainMovementProfile,
        )

        calculateTerrainMovement({
          profile:
            controlledMountainMovementProfile,
          startKm: 31,
          durationSeconds: 600,
          baseSpeedKmh: 40,
        })

        expect(
          JSON.stringify(
            controlledMountainMovementProfile,
          ),
        ).toBe(before)
      },
    )

    it(
      'rejects invalid start, duration and base-speed values',
      () => {
        expect(() =>
          calculateTerrainMovement({
            profile: controlledFlatMovementProfile,
            startKm: -1,
            durationSeconds: 60,
            baseSpeedKmh: 40,
          }),
        ).toThrow()
        expect(() =>
          calculateTerrainMovement({
            profile: controlledFlatMovementProfile,
            startKm: 0,
            durationSeconds: 0,
            baseSpeedKmh: 40,
          }),
        ).toThrow()
        expect(() =>
          calculateTerrainMovement({
            profile: controlledFlatMovementProfile,
            startKm: 0,
            durationSeconds: 60,
            baseSpeedKmh: 0,
          }),
        ).toThrow()
      },
    )
  },
)
