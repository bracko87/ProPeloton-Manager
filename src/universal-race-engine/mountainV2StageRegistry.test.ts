import { describe, expect, it } from 'vitest'
import type { UniversalRaceEngineInput } from './runMountainExperimentalEngineV1.ts'
import {
  MOUNTAIN_V2_STAGE_REGISTRY,
  selectMountainV2Stage,
  canMountainV2WriteOfficialResults,
} from './mountainV2StageRegistry.ts'
import { evaluateSelectedMountainV2Stage } from './runSelectedMountainV2Stage.ts'
import { selectMountainEngineLaneV1 } from './mountainEngineLaneV1.ts'

const DURMITOR='be7ce2aa-ec52-4b6b-a6c6-48bfab89ab9b'
const URUBICI='1c4b77a8-5102-40c9-bf0d-8695b0deb877'
const OROPA='0885f370-5082-4bbe-994f-3938f00b7b11'

function fixture(stageId:string, terrainType='mountain', stageFormat='road_race'):UniversalRaceEngineInput {
  return {
    stage:{
      stageId,terrainType,stageFormat,distanceKm:12,elevationGainM:450,
      profilePoints:[
        {km:0,elevationM:100},
        {km:4,elevationM:250},
        {km:8,elevationM:550},
        {km:12,elevationM:250},
      ],
    },
    riders:[
      {
        riderId:'climber-1',teamId:'team-1',startStatus:'starter',
        climbing:96,endurance:92,startStamina:94,fatigueBeforeStage:6,
      },
      {
        riderId:'rider-2',teamId:'team-2',startStatus:'starter',
        climbing:58,endurance:65,startStamina:86,fatigueBeforeStage:8,
      },
    ],
    stagePlans:[],
  } as unknown as UniversalRaceEngineInput
}

describe('Mountain V2 explicit stage registry and execution isolation',()=>{
  it('contains exactly three unique, named, sandbox-only, stage-ID choices',()=>{
    expect(MOUNTAIN_V2_STAGE_REGISTRY.map(x=>x.stageId)).toEqual([DURMITOR,URUBICI,OROPA])
    expect(new Set(MOUNTAIN_V2_STAGE_REGISTRY.map(x=>x.stageId)).size).toBe(3)
    expect(MOUNTAIN_V2_STAGE_REGISTRY.every(x=>x.mode==='sandbox_shadow_only')).toBe(true)
  })
  it('never enables arbitrary mountain stages, unlisted stages of the same race, or other terrain',()=>{
    const excluded=['9c329adc-ccbf-45cf-8b5f-5b07604b341a','nonlisted-mountain-id']
    for(const stageId of excluded){
      expect(selectMountainV2Stage(fixture(stageId).stage).mode).toBe('baseline_universal')
      expect(evaluateSelectedMountainV2Stage(fixture(stageId)).preview).toBeNull()
    }
    for(const terrain of ['flat','hilly','cobbled']){
      expect(evaluateSelectedMountainV2Stage(fixture(DURMITOR,terrain)).preview).toBeNull()
    }
    expect(evaluateSelectedMountainV2Stage(fixture(DURMITOR,'mountain','individual_time_trial')).preview).toBeNull()
  })
  it('never simulates a nonlisted stage, even when its roster fields are missing',()=>{
    const minimal={ stage:{stageId:'unknown',stageFormat:'road_race',terrainType:'mountain'} } as unknown as UniversalRaceEngineInput
    expect(evaluateSelectedMountainV2Stage(minimal)).toMatchObject({
      selection:{mode:'baseline_universal'},preview:null,
    })
  })
  it('runs selected Mountain V2 model without granting official authority',()=>{
    for(const id of [DURMITOR,URUBICI,OROPA]){
      const input=fixture(id)
      const before=JSON.stringify(input)
      const result=evaluateSelectedMountainV2Stage(input)
      expect(result.selection.mode).toBe('sandbox_shadow_only')
      expect(result.preview?.status).toBe('evaluated_non_authoritative')
      expect(result.preview?.authority).toBe('non_authoritative')
      expect(result.preview?.syntheticTiming?.finish).toHaveLength(2)
      expect(result.preview?.syntheticTiming?.finish[0].riderId).toBe('climber-1')
      expect(result.preview?.syntheticTiming?.replay).toHaveLength(3)
      expect(JSON.stringify(input)).toBe(before)
      expect(canMountainV2WriteOfficialResults(input.stage)).toBe(false)
    }
  })
  it('fails closed on incomplete or inconsistent climbing geometry',()=>{
    const input=fixture(DURMITOR)
    const unsuitable={
      ...input,stage:{...input.stage,elevationGainM:2000},
    }
    const result=evaluateSelectedMountainV2Stage(unsuitable)
    expect(result.selection.mode).toBe('sandbox_shadow_only')
    expect(result.preview?.status).toBe('geometry_review_required')
    expect(result.preview?.syntheticTiming).toBeUndefined()
  })
  it('does not secretly change the production V1/baseline stage solver selection',()=>{
    // Enrolling a stage for V2 sandbox evaluation must never promote it
    // into official V1 or V2. The Oropa V1 pilot remains independent.
    expect(selectMountainEngineLaneV1(fixture(DURMITOR).stage)).toBe('baseline_universal')
    expect(selectMountainEngineLaneV1(fixture(URUBICI).stage)).toBe('baseline_universal')
    expect(selectMountainEngineLaneV1(fixture(OROPA).stage)).toBe('experimental_mountain_v1')
  })
  it('never upgrades any listed or unlisted stage to authoritative output',()=>{
    for(const id of [DURMITOR,URUBICI,OROPA,'random']){
      expect(canMountainV2WriteOfficialResults(fixture(id).stage)).toBe(false)
    }
  })
})
