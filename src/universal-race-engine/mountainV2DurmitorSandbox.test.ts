/** Real-route, anonymized-roster sandbox-only Mountain V2 test.
 * Source: ProPeloton race_stages/race_stage_profile_details and registered rider
 * attributes for Montenegro Tour Stage 3, Durmitor Finale, game 2000-10-03.
 * Snapshot collected 2026-10-23; no real IDs, names, or live input mutations.
 * The riding tactics are synthetic, and this is NOT an official race replay.
 */
import { describe, expect, it } from 'vitest'
import { auditMountainProfileV2 } from './mountainProfileAuditV2.ts'
import { runMountainV2SyntheticStage } from './mountainV2SyntheticStage.ts'
import type { MountainV2Rider, MountainV2Segment, MountainV2Effort } from './mountainContactPhysicsV2.ts'

const SOURCE_STAGE_ID = 'be7ce2aa-ec52-4b6b-a6c6-48bfab89ab9b'
const EXPECTED_DISTANCE_KM = 133.2
const DECLARED_GAIN_M = 2150
const route: readonly (readonly [number,number])[] = [[0,45],[12,90],[24,220],[32,410],[44,760],[54,610],[58,640],[60,660],[70,720],[82,1040],[92,820],[100,900],[108,1180],[119,1520],[126,1420],[133.2,1450]]
// [anonymized team bucket, climbing, endurance, snapshot fatigue]; all 96 entries
// retain the registered cohort's skill distribution without exposing rider IDs.
const attributes: readonly (readonly [number,number,number,number])[] = [[0,65,67,97],[0,68,69,97],[0,66,77,96],[0,69,76,96],[0,69,74,97],[0,74,76,91],[1,55,59,9],[1,60,64,1],[1,67,66,10],[1,73,74,0],[1,58,62,0],[1,62,71,0],[2,79,81,60],[2,63,69,61],[2,73,78,51],[2,65,68,55],[2,85,76,40],[2,61,65,58],[3,81,86,82],[3,86,92,74],[3,87,90,77],[3,87,94,69],[3,85,91,76],[3,79,85,67],[4,71,77,45],[4,74,79,97],[4,66,67,97],[4,68,76,97],[4,59,71,97],[4,69,74,97],[5,66,64,69],[5,53,65,69],[5,77,69,62],[5,65,68,69],[5,65,65,76],[5,59,70,0],[6,65,69,29],[6,55,63,45],[6,70,73,0],[6,76,78,18],[6,68,66,17],[6,56,56,6],[7,79,83,40],[7,72,77,52],[7,70,81,64],[7,82,85,40],[7,74,86,52],[7,72,76,64],[8,64,67,76],[8,70,70,79],[8,57,66,84],[8,61,66,84],[8,59,62,74],[8,64,63,83],[9,67,70,0],[9,77,79,66],[9,70,67,68],[9,57,62,76],[9,63,66,84],[9,70,76,76],[10,64,60,76],[10,59,64,71],[10,71,62,72],[10,56,61,84],[10,53,61,56],[10,60,69,84],[11,52,59,70],[11,68,71,63],[11,57,64,84],[11,67,68,25],[11,67,69,0],[11,63,66,65],[12,62,63,70],[12,55,63,70],[12,59,66,60],[12,73,74,29],[12,62,61,45],[12,75,75,29],[13,55,63,76],[13,58,60,84],[13,69,66,84],[13,59,66,34],[13,60,65,84],[13,51,60,84],[14,58,65,57],[14,65,75,23],[14,65,67,71],[14,61,62,57],[14,55,66,58],[14,63,71,73],[15,66,73,59],[15,63,61,85],[15,63,65,44],[15,72,77,0],[15,62,66,0],[15,60,64,37]]

const road: MountainV2Segment[] = route.slice(1).map(([km,elevation],index) => {
  const prev = route[index]
  const lengthKm = km - prev[0]
  const gradientPercent = (elevation - prev[1]) / (10 * lengthKm)
  return {
    lengthKm,gradientPercent,
    terrain:gradientPercent > 1 ? 'climb' as const :
      gradientPercent < -1 ? 'descent' as const : 'flat' as const,
  }
})

function createRiders(scenario:'steady'|'tactics'): MountainV2Rider[] {
  const attackerPerTeam=new Map<number,number>()
  const supporterPerTeam=new Map<number,number>()
  for(const [index,attr] of attributes.entries()){
    const team=attr[0],priorAttacker=attackerPerTeam.get(team)
    if(priorAttacker===undefined || attr[1]>attributes[priorAttacker][1])
      attackerPerTeam.set(team,index)
    const priorSupporter=supporterPerTeam.get(team)
    if(priorSupporter===undefined || attr[1]<attributes[priorSupporter][1])
      supporterPerTeam.set(team,index)
  }
  return attributes.map(([team,climbing,endurance,fatigue],index) => {
    let effort:MountainV2Effort='steady'
    if(scenario==='tactics'){
      if(attackerPerTeam.get(team)===index) effort='attack'
      else if(supporterPerTeam.get(team)===index) effort='support'
    }
    return {
      riderId:`R${String(index+1).padStart(3,'0')}`,
      teamId:`T${String(team+1).padStart(2,'0')}`,
      climbing,endurance,descending:65,
      energy:Math.max(0,Math.min(100,85-fatigue*0.2)),
      effort,gapSeconds:0,
    }
  })
}

function report(scenario:'steady'|'tactics'){
  const riders=createRiders(scenario)
  const result=runMountainV2SyntheticStage(riders,road)
  const frames=result.physicalCheckpoints
  const final=frames.at(-1)!
  const times=result.finish
  const finishGroupSizes=final.groups.map(g=>g.riderIds.length)
  const checkpoints=frames.map((cp,index)=>({
    km:cp.km,terrain:cp.terrain,groups:cp.groups.length,
    leaderGroupSize:cp.groups[0].riderIds.length,
    largestGroupSize:Math.max(...cp.groups.map(g=>g.riderIds.length)),
    soloRiders:cp.groups.filter(g=>g.riderIds.length===1).length,
    tenthGapSeconds:Number((cp.riders[Math.min(9,cp.riders.length-1)].gapSeconds).toFixed(1)),
    lastGapSeconds:Number(cp.riders.at(-1)!.gapSeconds.toFixed(1)),
    leaderId:cp.riders[0].riderId,
  }))
  const topTen=times.slice(0,10).map(r=>({
    riderId:r.riderId,rank:r.rank,gapSeconds:Number(r.gapSeconds.toFixed(1)),
    elapsedSeconds:Number(r.elapsedSeconds.toFixed(1)),
  }))
  const output={
    stageId:SOURCE_STAGE_ID,
    stage:'Durmitor Finale',scenario,authority:'synthetic_only',
    declaredAscentM:DECLARED_GAIN_M,
    sampledAscentM:route.slice(1).reduce((acc,p,index)=>acc+Math.max(0,p[1]-route[index][1]),0),
    starters:riders.length,teams:new Set(riders.map(r=>r.teamId)).size,
    distanceKm:final.km,segmentCount:road.length,
    finalGroupCount:finishGroupSizes.length,
    finalGroupSizes:finishGroupSizes,finishWinnerSeconds:Number(times[0].elapsedSeconds.toFixed(1)),
    finalGapP10Seconds:Number(times[9].gapSeconds.toFixed(1)),
    finalGapLastSeconds:Number(times.at(-1)!.gapSeconds.toFixed(1)),
    ridersWithZeroEnergy:final.riders.filter(r=>r.energy===0).length,
    topTen,checkpoints,
  }
  expect(result.authority).toBe('synthetic_only')
  expect(result.finish).toHaveLength(96)
  expect(result.replay).toHaveLength(15)
  expect(final.km).toBeCloseTo(EXPECTED_DISTANCE_KM,6)
  expect(final.groups.flatMap(g=>g.riderIds)).toHaveLength(96)
  expect(new Set(final.groups.flatMap(g=>g.riderIds)).size).toBe(96)
  expect(result.finish.every(r=>Number.isFinite(r.elapsedSeconds)&&Number.isFinite(r.gapSeconds))).toBe(true)
  for(const rider of result.finish){
    expect(rider.elapsedSeconds).toBe(result.replay.at(-1)!.riderElapsedSeconds[rider.riderId])
  }
  for(const cp of frames){
    expect(new Set(cp.groups.flatMap(g=>g.riderIds)).size).toBe(96)
    expect(cp.riders[0].gapSeconds).toBe(0)
    expect(cp.riders.every(r=>r.gapSeconds>=0&&Number.isFinite(r.gapSeconds))).toBe(true)
  }
  console.log('MOUNTAIN_V2_DURMITOR_REPORT='+JSON.stringify(output))
  const groupByRiderId = new Map(final.groups.flatMap(group =>
    group.riderIds.map(id=>[id,group.groupId] as const)))
  const energyByRiderId = new Map(final.riders.map(row=>[row.riderId,row.energy] as const))
  const teamByRiderId = new Map(riders.map(row=>[row.riderId,row.teamId] as const))
  console.log('MOUNTAIN_V2_DURMITOR_STANDINGS='+JSON.stringify({
    scenario,
    rows: times.map(row=>[
      row.riderId,
      row.rank,
      Number(row.elapsedSeconds.toFixed(3)),
      Number(row.gapSeconds.toFixed(3)),
      groupByRiderId.get(row.riderId),
      teamByRiderId.get(row.riderId),
      energyByRiderId.get(row.riderId),
    ]),
  }))

  return output
}

describe('Durmitor Finale live-calendar geometry with anonymized registered riders — sandbox only',()=>{
  it('validates route completeness and ascent sampling',()=>{
    expect(route[0][0]).toBe(0)
    expect(route.at(-1)![0]).toBe(EXPECTED_DISTANCE_KM)
    expect(road.length).toBe(15)
    const audit=auditMountainProfileV2(DECLARED_GAIN_M,route.map(([km,elevationM])=>({km,elevationM})))
    expect(audit.profileNeedsReview).toBe(false)
    expect(audit.sampledGainM).toBe(1875)
    expect(attributes).toHaveLength(96)
    expect(new Set(attributes.map(a=>a[0])).size).toBe(16)
  })
  it('runs actual V2 physics with the anonymized 96-rider cohort at steady effort',()=>{
    report('steady')
  })
  it('runs actual V2 physics with synthetic team attacks and support',()=>{
    report('tactics')
  })
})
