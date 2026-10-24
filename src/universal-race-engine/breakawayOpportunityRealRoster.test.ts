/**
 * 2026-10-23 read-only snapshot of current production registrants for the
 * three explicitly selected Breakaway V1 research stages.
 * Rider and team UUIDs/names have NOT been copied; the arrays retain only
 * anonymous per-rider team-index and numeric flat/climb/endurance/fatigue.
 * No official stage plan, starting energy or game-time tactics yet exist.
 *
 * IMPORTANT: these are scenario tests of the independent BREAKAWAY
 * opportunity model only. They cannot publish, settle or edit a game race.
 */
import {describe,expect,it} from 'vitest'
import {
  runSelectedBreakawayPreviewV1,
  BREAKAWAY_V1_STAGE_REGISTRY,
  type BreakawayOpportunityInputV1,
  type BreakawayRiderV1,
} from './breakawayOpportunityEngineV1.ts'

const SNAPSHOT_CAPTURE_DATE='2026-10-23' as const
type Source = {
  readonly id:string; readonly label:string; readonly stageFormat:string
  readonly terrainType:string; readonly distanceKm:number
  readonly registered:number; readonly teams:number; readonly notFullyFit:number
  readonly attrs:readonly (readonly [number,number,number,number,number])[]
}
// Each anonymous row = [team bucket, flat, climbing, endurance, fatigue]
const STAGES:readonly Source[]=[{"id":"5523cf76-8fd4-4a12-ab28-7f285c9829ff","label":"Vojvodina Backa flat 139.2km","stageFormat":"road_race","terrainType":"flat","distanceKm":139.2,"registered":96,"teams":16,"notFullyFit":60,"attrs":[[0,71,65,67,100],[0,64,68,69,100],[0,73,67,77,100],[0,73,69,76,100],[0,66,69,75,100],[0,75,75,77,100],[1,61,56,59,65],[1,60,61,64,58],[1,62,68,66,64],[1,72,74,74,42],[1,62,58,63,59],[1,63,63,72,55],[2,71,80,82,99],[2,66,64,70,100],[2,72,74,79,100],[2,63,66,68,100],[2,74,86,77,84],[2,60,62,65,100],[3,75,71,80,31],[3,60,64,69,100],[3,74,69,76,70],[3,57,64,64,100],[3,62,62,70,84],[3,61,62,65,100],[4,90,81,86,100],[4,85,87,92,100],[4,89,87,90,100],[4,84,87,95,94],[4,84,86,91,100],[4,87,79,85,93],[5,75,71,77,84],[5,68,74,79,100],[5,63,66,67,100],[5,67,69,76,100],[5,67,59,71,100],[5,64,69,74,100],[6,55,66,64,100],[6,65,54,65,100],[6,69,78,70,95],[6,58,65,68,100],[6,58,65,65,100],[6,63,59,70,36],[7,64,65,69,36],[7,63,55,63,53],[7,71,70,73,11],[7,53,57,60,0],[7,68,68,66,23],[7,53,56,56,14],[8,66,64,67,83],[8,63,70,70,85],[8,61,58,66,94],[8,62,61,66,94],[8,60,59,62,82],[8,62,64,63,93],[9,67,66,72,48],[9,64,61,68,71],[9,61,59,64,84],[9,55,57,66,81],[9,58,65,63,57],[9,67,76,78,45],[10,59,64,60,83],[10,57,59,64,79],[10,59,71,62,80],[10,54,56,62,94],[10,54,53,61,64],[10,58,60,69,95],[11,63,52,59,87],[11,69,68,71,70],[11,63,57,64,97],[11,67,67,68,31],[11,68,67,70,12],[11,57,63,66,75],[12,62,62,63,80],[12,59,55,63,80],[12,62,59,66,70],[12,70,73,74,34],[12,57,62,61,53],[12,74,75,75,33],[13,63,55,64,84],[13,55,58,60,94],[13,69,69,66,94],[13,59,59,67,40],[13,54,60,65,94],[13,56,51,60,94],[14,62,58,65,65],[14,50,53,58,0],[14,60,65,68,79],[14,57,61,62,65],[14,61,55,66,66],[14,61,63,71,81],[15,69,66,73,67],[15,58,63,61,97],[15,55,63,65,52],[15,66,72,77,12],[15,61,62,66,14],[15,54,60,64,45]]},{"id":"335708f7-d56a-4816-9068-38399e8f74e3","label":"Binche Chimay Binche hilly 203.2km","stageFormat":"road_race","terrainType":"hilly","distanceKm":203.2,"registered":120,"teams":20,"notFullyFit":119,"attrs":[[0,81,79,87,85],[0,78,80,86,85],[0,71,77,84,86],[0,79,73,76,87],[0,77,83,87,87],[0,74,80,85,86],[1,81,83,86,97],[1,78,79,91,95],[1,81,81,83,95],[1,82,80,87,97],[1,75,70,80,96],[1,73,68,79,58],[2,72,72,79,86],[2,73,69,75,86],[2,72,72,77,86],[2,67,71,76,86],[2,71,64,71,86],[2,79,76,81,86],[3,67,72,78,96],[3,66,71,70,96],[3,70,69,69,96],[3,69,79,76,97],[3,71,70,75,96],[3,70,72,79,97],[4,78,82,87,100],[4,77,84,89,100],[4,76,71,77,100],[4,74,77,78,100],[4,70,79,82,100],[4,70,68,72,100],[5,65,58,68,98],[5,74,76,83,97],[5,72,71,71,97],[5,63,60,69,98],[5,62,65,69,97],[5,74,69,72,96],[6,83,81,86,96],[6,82,76,84,97],[6,79,82,82,97],[6,75,77,87,96],[6,67,75,80,97],[6,78,75,84,95],[7,67,67,66,98],[7,59,61,70,97],[7,59,61,68,98],[7,59,62,67,99],[7,68,58,63,98],[7,68,65,75,97],[8,70,73,74,96],[8,70,66,76,98],[8,71,71,72,96],[8,71,76,82,96],[8,67,68,75,97],[8,70,68,76,97],[9,63,63,64,97],[9,64,65,68,97],[9,73,72,73,97],[9,67,64,73,96],[9,65,62,67,97],[9,73,70,74,97],[10,74,76,80,96],[10,72,75,82,97],[10,66,58,69,97],[10,67,69,73,97],[10,61,63,71,97],[10,62,64,63,85],[11,76,74,83,96],[11,70,64,73,98],[11,62,58,65,97],[11,62,59,72,97],[11,58,63,67,98],[11,61,64,65,98],[12,67,73,78,96],[12,66,62,69,97],[12,60,68,69,96],[12,57,64,70,98],[12,61,59,63,98],[12,81,75,83,97],[13,63,66,65,98],[13,61,59,70,96],[13,75,79,83,96],[13,69,74,74,97],[13,58,65,62,97],[13,74,77,81,96],[14,66,61,70,97],[14,73,66,71,84],[14,68,66,72,97],[14,62,60,67,97],[14,60,58,70,97],[14,70,70,73,96],[15,77,77,88,85],[15,59,64,69,97],[15,62,60,66,99],[15,74,72,70,96],[15,76,78,80,91],[15,67,64,72,96],[16,71,65,76,97],[16,67,63,67,67],[16,65,66,68,97],[16,64,61,65,97],[16,64,68,76,96],[16,56,62,65,97],[17,60,60,63,97],[17,69,68,80,88],[17,60,59,67,97],[17,67,72,69,97],[17,65,61,70,97],[17,66,65,74,96],[18,55,66,64,97],[18,66,66,69,98],[18,54,57,61,90],[18,62,65,69,98],[18,64,58,68,98],[18,74,73,73,96],[19,65,68,72,97],[19,59,57,70,96],[19,69,66,70,96],[19,63,64,68,97],[19,53,64,58,97],[19,57,57,64,97]]},{"id":"f5af8665-91c1-4585-937e-11fb94f65819","label":"Vojvodina Fruska Gora hilly 151.6km","stageFormat":"road_race","terrainType":"hilly","distanceKm":151.6,"registered":96,"teams":16,"notFullyFit":60,"attrs":[[0,71,65,67,100],[0,64,68,69,100],[0,73,67,77,100],[0,73,69,76,100],[0,66,69,75,100],[0,75,75,77,100],[1,61,56,59,65],[1,60,61,64,58],[1,62,68,66,64],[1,72,74,74,42],[1,62,58,63,59],[1,63,63,72,55],[2,71,80,82,99],[2,66,64,70,100],[2,72,74,79,100],[2,63,66,68,100],[2,74,86,77,84],[2,60,62,65,100],[3,75,71,80,31],[3,60,64,69,100],[3,74,69,76,70],[3,57,64,64,100],[3,62,62,70,84],[3,61,62,65,100],[4,90,81,86,100],[4,85,87,92,100],[4,89,87,90,100],[4,84,87,95,94],[4,84,86,91,100],[4,87,79,85,93],[5,75,71,77,84],[5,68,74,79,100],[5,63,66,67,100],[5,67,69,76,100],[5,67,59,71,100],[5,64,69,74,100],[6,55,66,64,100],[6,65,54,65,100],[6,69,78,70,95],[6,58,65,68,100],[6,58,65,65,100],[6,63,59,70,36],[7,64,65,69,36],[7,63,55,63,53],[7,71,70,73,11],[7,53,57,60,0],[7,68,68,66,23],[7,53,56,56,14],[8,66,64,67,83],[8,63,70,70,85],[8,61,58,66,94],[8,62,61,66,94],[8,60,59,62,82],[8,62,64,63,93],[9,67,66,72,48],[9,64,61,68,71],[9,61,59,64,84],[9,55,57,66,81],[9,58,65,63,57],[9,67,76,78,45],[10,59,64,60,83],[10,57,59,64,79],[10,59,71,62,80],[10,54,56,62,94],[10,54,53,61,64],[10,58,60,69,95],[11,63,52,59,87],[11,69,68,71,70],[11,63,57,64,97],[11,67,67,68,31],[11,68,67,70,12],[11,57,63,66,75],[12,62,62,63,80],[12,59,55,63,80],[12,62,59,66,70],[12,70,73,74,34],[12,57,62,61,53],[12,74,75,75,33],[13,63,55,64,84],[13,55,58,60,94],[13,69,69,66,94],[13,59,59,67,40],[13,54,60,65,94],[13,56,51,60,94],[14,62,58,65,65],[14,50,53,58,0],[14,60,65,68,79],[14,57,61,62,65],[14,61,55,66,66],[14,61,63,71,81],[15,69,66,73,67],[15,58,63,61,97],[15,55,63,65,52],[15,66,72,77,12],[15,61,62,66,14],[15,54,60,64,45]]}]

type Scenario = 'cooperative_escape' | 'balanced_chase' | 'organized_peloton' |
  'uncooperative_escape' | 'no_escape'
function buildScenario(source:Source,scenario:Scenario):BreakawayOpportunityInputV1 {
  const cooperation=scenario==='cooperative_escape' ? 0.93 :
    scenario==='uncooperative_escape' ? 0.18 : 0.7
  const chase=scenario==='cooperative_escape' ? 0.15 :
    scenario==='balanced_chase' ? 0.43 :
    scenario==='organized_peloton' ? 0.85 : 0.4
  const wind=scenario==='cooperative_escape' ? 0.10 :
    scenario==='balanced_chase' ? 0.20 : 0.25
  const riders:BreakawayRiderV1[]=source.attrs.map(([team,flat,climbing,endurance,fatigue],idx)=>({
    riderId:'R'+String(idx+1).padStart(3,'0'),
    teamId:'T'+String(team+1).padStart(2,'0'),
    flat,climbing,endurance,fatigue,
    cooperation,intent:'neutral',
  }))
  // Real abilities; imagined orders. An escape is proposed by the five
  // most suitable riders from different teams who are not fully exhausted.
  const hilly=source.terrainType==='hilly'
  const rating=(r:BreakawayRiderV1)=>
    (hilly ? r.climbing*0.58+r.flat*0.42 : r.flat)*0.55+
    r.endurance*0.4-r.fatigue*0.12+(r.cooperation??0.55)*4
  const byTeam=new Map<string,BreakawayRiderV1>()
  for(const rider of riders){
    if(rider.endurance<40 || rider.fatigue>=96)continue
    const prior=byTeam.get(rider.teamId)
    if(!prior || rating(rider)>rating(prior))byTeam.set(rider.teamId,rider)
  }
  const attackers=[...byTeam.values()].sort((a,b)=>
    rating(b)-rating(a)||a.riderId.localeCompare(b.riderId)).slice(0,5)
  if(scenario!=='no_escape'){
    const attackIds=new Set(attackers.map(x=>x.riderId))
    for(const r of riders){
      if(attackIds.has(r.riderId))r.intent='breakaway'
    }
  }
  // New object for every scenario; no state leaking between simulations.
  return {
    stage:{
      stageId:source.id,stageFormat:source.stageFormat,
      terrainType:source.terrainType,distanceKm:source.distanceKm,
    },
    riders,pelotonChaseIntensity:chase,crosswindExposure:wind,
  }
}

function report(source:Source,scenario:Scenario){
  const input=buildScenario(source,scenario)
  const inputBefore=JSON.stringify(input)
  const result=runSelectedBreakawayPreviewV1(input)
  expect(result.authority).toBe('shadow_only')
  expect(JSON.stringify(input)).toBe(inputBefore)
  expect(result.status).not.toBe('not_selected')
  expect(result).toEqual(runSelectedBreakawayPreviewV1(input))
  if(result.status==='not_selected')throw new Error('Wrong stage registry entry')
  expect(result.breakawayRiderIds.length).toBeLessThanOrEqual(8)
  expect(result.checkpoints.every(cp=>
    Number.isFinite(cp.km)&&Number.isFinite(cp.escapeGapSeconds)&&
    Number.isFinite(cp.escapeSpeedKmh)&&Number.isFinite(cp.pelotonSpeedKmh)))
    .toBe(true)
  expect(result.checkpoints.every((cp,i)=>
    i===0 || cp.km>result.checkpoints[i-1].km)).toBe(true)
  if(result.status==='survived'){
    expect(result.checkpoints.at(-1)?.km).toBeCloseTo(source.distanceKm,2)
    expect(result.finishGapSeconds).toBeGreaterThan(0)
    expect(result.provisionalEscapeWinnerId).not.toBeNull()
  }
  if(result.status==='caught'){
    expect(result.captureKm).toBeGreaterThan(0)
    expect(result.captureKm).toBeLessThan(source.distanceKm)
    expect(result.provisionalEscapeWinnerId).toBeNull()
  }
  const summary={
    stage:source.label,stageId:source.id,snapshotDate:SNAPSHOT_CAPTURE_DATE,
    registered:source.registered,teams:source.teams,notFullyFit:source.notFullyFit,
    scenario,chaseIntensity:input.pelotonChaseIntensity,
    result:result.status,potentialWinner:result.provisionalEscapeWinnerId,
    breakawayRiders:result.breakawayRiderIds.length,
    captureKm:result.captureKm,
    finalGapSeconds:result.finishGapSeconds,
    checkpointCount:result.checkpoints.length,
    gapAtLastCheckpoint:result.checkpoints.at(-1)?.escapeGapSeconds??null,
  }
  console.log('BREAKAWAY_REAL_ROSTER_SCENARIO='+JSON.stringify(summary))
  return result
}
describe('registered rosters — breakaway experimental scenario matrix',()=>{
  it('keeps the three historical captured rosters immutable while new Zeeland candidate has separate synthetic coverage',()=>{
    expect(STAGES).toHaveLength(3)
    expect(STAGES.map(s=>s.id)).toEqual(
      BREAKAWAY_V1_STAGE_REGISTRY.filter(s=>s.stageId!=='7f69e552-b116-453c-bf55-16ef655ea021').map(s=>s.stageId))
    expect(BREAKAWAY_V1_STAGE_REGISTRY.some(s=>s.stageId==='7f69e552-b116-453c-bf55-16ef655ea021')).toBe(true)
    for(const source of STAGES){
      expect(source.attrs).toHaveLength(source.registered)
      expect(new Set(source.attrs.map(r=>r[0])).size).toBe(source.teams)
      expect(source.attrs.every(r=>r.every(x=>Number.isFinite(x)))).toBe(true)
      expect(source.registered).toBeGreaterThanOrEqual(90)
    }
  })
  for(const source of STAGES){
    for(const scenario of [
      'cooperative_escape','balanced_chase','organized_peloton',
      'uncooperative_escape','no_escape',
    ] as const){
      it(source.label+' / '+scenario,()=>{
        const result=report(source,scenario)
        if(scenario==='cooperative_escape'){
          expect(result.status).toBe('survived')
        }
        if(scenario==='organized_peloton'||scenario==='uncooperative_escape'){
          expect(result.status).toBe('caught')
        }
        if(scenario==='no_escape'){
          expect(result.status).toBe('no_escape')
        }
      })
    }
    it(source.label+' / physical chase-intensity sweep',()=>{
      const statuses:string[]=[]
      for(const chase of [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]){
        const basic=buildScenario(source,'cooperative_escape')
        const output=runSelectedBreakawayPreviewV1({...basic,pelotonChaseIntensity:chase})
        statuses.push(output.status)
      }
      expect(statuses).toContain('survived')
      expect(statuses).toContain('caught')
      // A more determined chase cannot create an escape that failed with a
      // less determined chase, on the same abilities and cooperative turns.
      const firstCaught=statuses.indexOf('caught')
      expect(statuses.slice(firstCaught).every(x=>x==='caught')).toBe(true)
      console.log('BREAKAWAY_REAL_ROSTER_SWEEP='+JSON.stringify({
        stage:source.label,stageId:source.id,
        chaseValues:[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9],statuses,
      }))
    })
  }
})
