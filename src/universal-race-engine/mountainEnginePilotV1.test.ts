import { describe, expect, it } from 'vitest'
import {
  isMountainEnginePilotStageV1,
  MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1,
  MOUNTAIN_ENGINE_OCTOBER_PILOT_STAGE_IDS_V1,
} from './mountainEnginePilotV1.ts'

const stage = (
  stageId: string,
  terrainType = 'mountain',
  stageFormat = 'road_race',
) => ({ stageId, terrainType, stageFormat })

describe('explicit mountain pilot isolation', () => {
  it('allows exactly the approved historical and eight October mountain stages', () => {
    expect(MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1).toHaveLength(11)
    expect(new Set(MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1).size).toBe(11)
    expect(MOUNTAIN_ENGINE_OCTOBER_PILOT_STAGE_IDS_V1).toHaveLength(8)
    expect(MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1.slice(3)).toEqual(MOUNTAIN_ENGINE_OCTOBER_PILOT_STAGE_IDS_V1)
    for (const stageId of MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1) {
      expect(isMountainEnginePilotStageV1(stage(stageId))).toBe(true)
    }
  })


  it('authorizes only the eight scheduled October 2000 pilot additions', () => {
    expect(MOUNTAIN_ENGINE_OCTOBER_PILOT_STAGE_IDS_V1).toEqual([
      'e00c9ead-91fd-41ce-95f0-de3e4d241e16',
      'dd6681d1-e565-43f3-8449-0bb203b0eb07',
      'a448f8a2-7c9a-426f-8482-d098de506bdb',
      '1f651095-bea0-4e3b-a0f5-d45c9159de92',
      '17a68003-e433-4927-ab0b-c62c57aebc7b',
      'fbe8548d-19c6-4c1b-a8cb-dc8e2bf52dc9',
      '8a320efa-36af-40ab-b106-0af6e4a9ff31',
      'eb74b4c3-1930-4c90-9092-1cd964c138aa',
    ])
    // October stages already officially completed remain on their existing solver.
    expect(isMountainEnginePilotStageV1(stage('333b9184-bb82-4f26-a05e-5cd40744c370'))).toBe(false)
    // November/December remain unapproved, even where the stage is a summit finish.
    expect(isMountainEnginePilotStageV1(stage('612205b9-6d2a-4d30-a5b4-6d6ae2af1d0a'))).toBe(false)
    expect(isMountainEnginePilotStageV1(stage('326cee1d-bbad-4ea3-bf78-f7387da6de46'))).toBe(false)
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
