import { describe, expect, it } from 'vitest'
import {
  BREAKAWAY_V1_STAGE_REGISTRY,
  runSelectedBreakawayPreviewV1,
  selectBreakawayOpportunityStageV1,
  type BreakawayOpportunityInputV1,
  type BreakawayRiderV1,
} from './breakawayOpportunityEngineV1.ts'

const BACKA='5523cf76-8fd4-4a12-ab28-7f285c9829ff'
const BINCHE='335708f7-d56a-4816-9068-38399e8f74e3'
const FRUSKA='f5af8665-91c1-4585-937e-11fb94f65819'

function fixture(
  stageId=BACKA,
  chase=0.25,
  terrainType='flat',
): BreakawayOpportunityInputV1 {
  const riders: BreakawayRiderV1[] = [
    ...Array.from({length:5},(_,i)=>({
      riderId:'E'+i,teamId:'ET'+i,flat:89-i,climbing:86-i,
      endurance:90-i,fatigue:9,cooperation:0.9,
      intent:'breakaway' as const,
    })),
    ...Array.from({length:12},(_,i)=>({
      riderId:'C'+i,teamId:'CT'+(i%3),flat:78,climbing:72,
      endurance:76,fatigue:12,intent:'chase' as const,
    })),
  ]
  return {
    stage:{stageId,stageFormat:'road_race',terrainType,
      distanceKm:terrainType==='flat'?139.2:203.2},
    pelotonChaseIntensity:chase,crosswindExposure:0,
    riders,
  }
}

describe('independent breakaway opportunity engine: shadow only',()=>{
  it('limits stage selection to three exact flat/hilly road-race UUIDs',()=>{
    expect(BREAKAWAY_V1_STAGE_REGISTRY.map(row=>row.stageId))
      .toEqual([BACKA,BINCHE,FRUSKA])
    expect(new Set(BREAKAWAY_V1_STAGE_REGISTRY.map(row=>row.stageId)).size).toBe(3)
    for(const id of [BACKA,BINCHE,FRUSKA]){
      const type=id===BACKA?'flat':'hilly'
      expect(selectBreakawayOpportunityStageV1(fixture(id,.25,type).stage)?.authority)
        .toBe('shadow_only')
      expect(selectBreakawayOpportunityStageV1(fixture(id,.25,'mountain').stage))
        .toBeNull()
      expect(selectBreakawayOpportunityStageV1({
        ...fixture(id).stage,stageFormat:'individual_time_trial',
      })).toBeNull()
    }
    expect(selectBreakawayOpportunityStageV1(fixture('nonlisted-stage').stage)).toBeNull()
  })

  it('returns immediately for unlisted stages without invoking physical calculations',()=>{
    expect(runSelectedBreakawayPreviewV1({
      stage:{stageId:'unlisted',stageFormat:'road_race',terrainType:'flat',distanceKm:150},
      riders:[],pelotonChaseIntensity:0.25,
    })).toEqual({authority:'shadow_only',status:'not_selected',
      breakawayWon:false,checkpoints:[]})
  })

  it('allows a well-organized breakaway to remain clear on a selected stage',()=>{
    const input=fixture()
    const before=JSON.stringify(input)
    const r=runSelectedBreakawayPreviewV1(input)
    expect(r.status).toBe('survived')
    if(r.status!=='survived')return
    expect(r.breakawayWon).toBe(true)
    expect(r.finishGapSeconds).toBeGreaterThan(10)
    expect(r.provisionalEscapeWinnerId).toMatch(/^E/)
    expect(r.breakawayRiderIds).toHaveLength(5)
    expect(r.checkpoints).toHaveLength(30)
    expect(r.checkpoints.at(-1)?.km).toBeCloseTo(input.stage.distanceKm,2)
    expect(r.checkpoints.every(c=>c.escapeGapSeconds>=0 &&
      Number.isFinite(c.escapeSpeedKmh)&&Number.isFinite(c.pelotonSpeedKmh))).toBe(true)
    for(let i=1;i<r.checkpoints.length;i++){
      expect(r.checkpoints[i].km).toBeGreaterThan(r.checkpoints[i-1].km)
    }
    expect(JSON.stringify(input)).toBe(before)
    expect(runSelectedBreakawayPreviewV1(input)).toEqual(r)
    expect(r.authority).toBe('shadow_only')
  })

  it('catches the SAME strong breakaway when the peloton organizes a harder chase',()=>{
    const easy=runSelectedBreakawayPreviewV1(fixture(BACKA,0.2))
    const hard=runSelectedBreakawayPreviewV1(fixture(BACKA,0.98))
    expect(easy.status).toBe('survived')
    expect(hard.status).toBe('caught')
    if(hard.status==='caught'){
      expect(hard.captureKm).toBeGreaterThan(0)
      expect(hard.captureKm).toBeLessThan(139.2)
      expect(hard.breakawayWon).toBe(false)
      expect(hard.provisionalEscapeWinnerId).toBeNull()
    }
  })

  it('catches a weak, non-cooperating escape without forcing a fixed winner',()=>{
    const strong=fixture(BACKA,0.45)
    const weak={...strong,riders:strong.riders.map(r=>r.intent==='breakaway'
      ? {...r,flat:52,climbing:53,endurance:55,cooperation:0.1,fatigue:50}
      : r)}
    const result=runSelectedBreakawayPreviewV1(weak)
    expect(result.status).toBe('caught')
    expect(result.breakawayWon).toBe(false)
  })

  it('works on the explicit hilly candidate but refuses mountain stages',()=>{
    const good=runSelectedBreakawayPreviewV1(fixture(BINCHE,0.15,'hilly'))
    expect(good.status).toBe('survived')
    expect(good.authority).toBe('shadow_only')
    const excluded=runSelectedBreakawayPreviewV1(fixture(BINCHE,.15,'mountain'))
    expect(excluded.status).toBe('not_selected')
  })

  it('does not invent a breakaway without riders selecting the attack tactic',()=>{
    const input=fixture()
    const outcome=runSelectedBreakawayPreviewV1({
      ...input,riders:input.riders.map(r=>({...r,intent:'neutral' as const})),
    })
    expect(outcome.status).toBe('no_escape')
    if(outcome.status==='no_escape')expect(outcome.provisionalEscapeWinnerId).toBeNull()
  })

  it('fails closed on invalid scores, duplicates and invalid chase settings',()=>{
    expect(()=>runSelectedBreakawayPreviewV1({
      ...fixture(),pelotonChaseIntensity:Number.NaN,
    })).toThrow('Invalid breakaway shadow input')
    const input=fixture()
    expect(()=>runSelectedBreakawayPreviewV1({
      ...input,riders:[input.riders[0],input.riders[0]],
    })).toThrow('Duplicate rider')
    expect(()=>runSelectedBreakawayPreviewV1({
      ...input,riders:[{...input.riders[0],endurance:Number.POSITIVE_INFINITY}],
    })).toThrow('Invalid breakaway shadow input')
  })
})
