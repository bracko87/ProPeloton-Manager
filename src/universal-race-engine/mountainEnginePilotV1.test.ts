import { describe, expect, it } from 'vitest'
import {
  isMountainEnginePilotStageV1,
  MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1,
} from './mountainEnginePilotV1.ts'

const stage = (
  stageId: string,
  terrainType = 'mountain',
  stageFormat = 'road_race',
) => ({ stageId, terrainType, stageFormat })

describe('explicit mountain pilot isolation', () => {
  it('allows only the three individually approved real acceptance stages', () => {
    expect(MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1).toHaveLength(3)
    for (const stageId of MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1) {
      expect(isMountainEnginePilotStageV1(stage(stageId))).toBe(true)
    }
  })

  it('never auto-enables a mountain stage based solely on its terrain', () => {
    expect(isMountainEnginePilotStageV1(
      stage('eeab7fdd-469d-42c4-a09d-6914518b1fd5'),
    )).toBe(false) // Old-SHA Poyang Stage 1 must stay out.
    expect(isMountainEnginePilotStageV1(stage('a-future-mountain-stage'))).toBe(false)
  })

  it('does not affect flat, hilly, cobbled or time-trial races', () => {
    const approvedId = MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1[2]
    for (const terrain of ['flat', 'hilly', 'cobbled']) {
      expect(isMountainEnginePilotStageV1(stage(approvedId, terrain))).toBe(false)
    }
    expect(isMountainEnginePilotStageV1(
      stage(approvedId, 'mountain', 'individual_time_trial'),
    )).toBe(false)
  })

  it('requires an explicit ID match instead of a race-wide switch', () => {
    expect(isMountainEnginePilotStageV1(stage(
      '00000000-0000-0000-0000-000000000000',
    ))).toBe(false)
    expect(isMountainEnginePilotStageV1(stage(
      MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1[0].toUpperCase(),
    ))).toBe(true)
  })
})
