import { describe, expect, it, vi } from 'vitest'
import {
  dispatchSelectedRaceEngineV1,
  selectMountainEngineLaneV1,
} from './mountainEngineLaneV1.ts'

const XINGTAI = '62c7ca62-b6aa-470f-bf32-0822f64849c0'
const POYANG_STAGE7 = '9c329adc-ccbf-45cf-8b5f-5b07604b341a'
const OROPA = '0885f370-5082-4bbe-994f-3938f00b7b11'
const excludedStageId = 'eeab7fdd-469d-42c4-a09d-6914518b1fd5'

const input = (stageId: string, terrainType = 'mountain', stageFormat = 'road_race') => ({
  stage: { stageId, terrainType, stageFormat },
  deterministicSeed: 'immutable-deterministic-seed',
})

describe('isolated mountain solver dispatch', () => {
  it('calls experimental solver exactly once for explicitly approved mountain stages', () => {
    for (const id of [XINGTAI, POYANG_STAGE7, OROPA]) {
      const baseline = vi.fn(() => 'baseline')
      const experimentalMountain = vi.fn(() => 'mountain')
      expect(selectMountainEngineLaneV1(input(id).stage)).toBe('experimental_mountain_v1')
      expect(dispatchSelectedRaceEngineV1(input(id), {
        baseline,
        experimentalMountain,
      })).toBe('mountain')
      expect(experimentalMountain).toHaveBeenCalledOnce()
      expect(baseline).not.toHaveBeenCalled()
    }
  })

  it('calls the original solver exactly once for old-sha and arbitrary mountain stages', () => {
    for (const id of [excludedStageId, 'unapproved-future-mountain-stage']) {
      const baseline = vi.fn((value: ReturnType<typeof input>) => value)
      const experimentalMountain = vi.fn((value: ReturnType<typeof input>) => value)
      const fixture = input(id)
      expect(dispatchSelectedRaceEngineV1(fixture, { baseline, experimentalMountain })).toBe(fixture)
      expect(baseline).toHaveBeenCalledOnce()
      expect(experimentalMountain).not.toHaveBeenCalled()
    }
  })

  it('does not route flat, hilly, cobbled or TT stages into the mountain pilot', () => {
    for (const terrainType of ['flat', 'hilly', 'cobbled']) {
      const baseline = vi.fn(() => 'standard')
      const experimentalMountain = vi.fn(() => 'experimental')
      expect(dispatchSelectedRaceEngineV1(input(OROPA, terrainType), {
        baseline, experimentalMountain,
      })).toBe('standard')
      expect(experimentalMountain).not.toHaveBeenCalled()
    }
    expect(selectMountainEngineLaneV1(
      input(OROPA, 'mountain', 'individual_time_trial').stage,
    )).toBe('baseline_universal')
  })
})
