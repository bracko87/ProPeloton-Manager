/** 
 * Durmitor *current registered roster* read-only snapshot captured 2026-10-23T11:38:24Z.
 * Anonymous numeric attributes are taken directly from the production database;
 * NEVER real IDs, display names, team names, authentication or race-run data.
 * Official race start stamina/locked plans are not available on 2026-10-23T11:38:24Z.
 * This is a one-time research fixture, not a live worker invocation.
 */
import { describe, expect, it } from 'vitest'
import { runMountainV2SyntheticStage } from './mountainV2SyntheticStage.ts'
import type { MountainV2Rider, MountainV2Segment } from './mountainContactPhysicsV2.ts'
const stageId='be7ce2aa-ec52-4b6b-a6c6-48bfab89ab9b'
const capturedUTC='2026-10-23T11:38:24Z'
const profile:readonly (readonly [number,number])[]=[[0,45],[12,90],[24,220],[32,410],[44,760],[54,610],[58,640],[60,660],[70,720],[82,1040],[92,820],[100,900],[108,1180],[119,1520],[126,1420],[133.2,1450]]
// team, climbing, endurance, fatigue, morale, availability_not_fully_fit
const ridersSnapshot:readonly (readonly [number,number,number,number,number,number])[]=[[0,65,67,100,100,1],[0,68,69,100,99,1],[0,66,77,100,100,1],[0,69,76,100,100,1],[0,69,74,100,100,1],[0,74,76,100,100,1],[1,55,59,28,80,0],[1,60,64,20,84,0],[1,67,66,29,75,0],[1,73,74,14,98,0],[1,58,62,20,71,0],[1,62,71,18,78,0],[2,79,81,72,100,0],[2,63,69,90,100,1],[2,73,78,66,100,0],[2,65,68,82,100,0],[2,85,76,54,100,0],[2,61,65,75,100,0],[3,81,86,100,100,1],[3,86,92,86,100,1],[3,87,90,100,100,1],[3,87,94,77,100,1],[3,85,91,91,100,1],[3,79,85,75,100,1],[4,71,77,61,100,0],[4,74,79,100,99,1],[4,66,67,100,100,1],[4,68,76,100,100,1],[4,59,71,100,100,1],[4,69,74,100,100,1],[5,66,64,83,100,1],[5,53,65,93,100,1],[5,77,69,74,100,0],[5,65,68,92,100,1],[5,65,65,99,100,1],[5,59,70,18,100,1],[6,65,69,25,100,0],[6,55,63,42,100,0],[6,70,73,0,100,0],[6,76,78,15,100,0],[6,68,66,14,100,0],[6,56,56,3,100,0],[7,79,83,35,100,0],[7,72,77,48,100,0],[7,70,81,61,100,1],[7,82,85,35,100,0],[7,74,86,48,100,0],[7,72,76,61,100,1],[8,64,67,73,100,1],[8,70,70,76,100,1],[8,57,66,82,100,1],[8,61,66,82,100,1],[8,59,62,71,100,1],[8,64,63,81,100,1],[9,67,70,0,100,1],[9,77,79,62,100,1],[9,70,67,64,100,1],[9,57,62,73,100,1],[9,63,66,82,100,1],[9,70,76,73,100,1],[10,64,60,73,100,1],[10,59,64,68,100,1],[10,71,62,70,100,1],[10,56,61,82,100,1],[10,53,61,53,100,0],[10,60,69,82,100,1],[11,52,59,68,100,1],[11,68,71,60,100,1],[11,57,64,83,100,1],[11,67,68,21,100,0],[11,67,69,0,100,0],[11,63,66,62,100,1],[12,62,63,68,100,1],[12,55,63,68,100,1],[12,59,66,58,100,0],[12,73,74,25,100,0],[12,62,61,42,100,0],[12,75,75,25,100,0],[13,55,63,73,100,1],[13,58,60,82,100,1],[13,69,66,82,100,1],[13,59,66,31,100,0],[13,60,65,82,100,1],[13,51,60,82,100,1],[14,58,65,54,100,0],[14,65,75,19,100,0],[14,65,67,69,100,1],[14,61,62,54,100,0],[14,55,66,55,100,0],[14,63,71,70,100,1],[15,66,73,56,100,0],[15,63,61,84,100,1],[15,63,65,41,100,0],[15,72,77,0,100,0],[15,62,66,0,100,0],[15,60,64,34,100,0]]
const segments:MountainV2Segment[]=profile.slice(1).map(([km,elev],i)=>{
  const [priorKm,priorElev]=profile[i]
  const lengthKm=km-priorKm,gradientPercent=(elev-priorElev)/(10*lengthKm)
  return { lengthKm,gradientPercent,
    terrain:gradientPercent>1?'climb':gradientPercent< -1?'descent':'flat' }
})
type Scenario='steady_current'|'team_attacks_current'|'fitness_sensitivity_current'
function simulate(scenario:Scenario){
  const entrants:MountainV2Rider[]=ridersSnapshot.map(([team,climbing,endurance,fatigue,morale,limited],i)=>({
    riderId:'R'+String(i+1).padStart(3,'0'),
    teamId:'T'+String(team+1).padStart(2,'0'),
    climbing,endurance,descending:65,
    // The current real race input (startStamina) does not yet exist.
    // This is an explicit synthetic assumption, NOT actual on-day fitness.
    energy:Math.max(0,Math.min(100,
      85-fatigue*0.2+(scenario==='fitness_sensitivity_current'
        ? -7*limited+(morale-75)*0.03:0))),
    effort:'steady',gapSeconds:0,
  }))
  if(scenario==='team_attacks_current'){
    const strongest=new Map<string,number>(),helper=new Map<string,number>()
    entrants.forEach((r,i)=>{
      const oldA=strongest.get(r.teamId),oldB=helper.get(r.teamId)
      if(oldA===undefined||r.climbing>entrants[oldA].climbing)strongest.set(r.teamId,i)
      if(oldB===undefined||r.climbing<entrants[oldB].climbing)helper.set(r.teamId,i)
    })
    entrants.forEach((r,i)=>{
      if(strongest.get(r.teamId)===i)entrants[i]={...r,effort:'attack'}
      else if(helper.get(r.teamId)===i)entrants[i]={...r,effort:'support'}
    })
  }
  const out=runMountainV2SyntheticStage(entrants,segments)
  const finish=out.finish,physical=out.physicalCheckpoints.at(-1)!,timed=out.timedCheckpoints.at(-1)!
  const groupFor=new Map(physical.groups.flatMap(g=>g.riderIds.map(r=>[r,g.groupId] as const)))
  const energyFor=new Map(physical.riders.map(r=>[r.riderId,r.energy] as const))
  expect(finish).toHaveLength(96)
  expect(physical.km).toBeCloseTo(133.2,6)
  expect(out.replay).toHaveLength(15)
  expect(new Set(physical.groups.flatMap(g=>g.riderIds)).size).toBe(96)
  expect(finish.every(r=>Number.isFinite(r.gapSeconds)&&Number.isFinite(r.elapsedSeconds))).toBe(true)
  for(const row of finish){
    expect(row.elapsedSeconds).toBe(timed.riderElapsedSeconds[row.riderId])
    expect(row.elapsedSeconds).toBe(out.replay.at(-1)!.riderElapsedSeconds[row.riderId])
  }
  expect(physical.riders.filter(r=>r.energy===0).length).toBeLessThan(20)
  const result={
    capturedUTC,stageId,scenario,authority:'synthetic_only',
    starters:96,teams:new Set(entrants.map(x=>x.teamId)).size,
    notFullyFit:ridersSnapshot.filter(r=>r[5]===1).length,
    gradeSegments:segments.length,
    groups:physical.groups.length,
    largestGroup:Math.max(...physical.groups.map(g=>g.riderIds.length)),
    soloCount:physical.groups.filter(g=>g.riderIds.length===1).length,
    zeroEnergy:physical.riders.filter(r=>r.energy===0).length,
    winner:finish[0].riderId,winnerSeconds:Number(finish[0].elapsedSeconds.toFixed(2)),
    gap10:Number(finish[9].gapSeconds.toFixed(2)),gapLast:Number(finish.at(-1)!.gapSeconds.toFixed(2)),
    top15:finish.slice(0,15).map(r=>({
      rider:r.riderId,rank:r.rank,gap:Number(r.gapSeconds.toFixed(2)),
      elapsed:Number(r.elapsedSeconds.toFixed(2)),group:groupFor.get(r.riderId),
      energy:Number(energyFor.get(r.riderId)!.toFixed(2)),
    })),
  }
  console.log('MOUNTAIN_V2_CURRENT_ROSTER='+JSON.stringify(result))
  return result
}
describe('Durmitor current anonymous registered roster (read-only 2026-10-23T11:38:24Z)',()=>{
  it('has complete current rider abilities, fatigue and availability status',()=>{
    expect(ridersSnapshot).toHaveLength(96)
    expect(new Set(ridersSnapshot.map(r=>r[0])).size).toBe(16)
    expect(ridersSnapshot.filter(r=>r[5]===1)).toHaveLength(56)
  })
  it('runs actual Mountain V2 continuous physics with current fatigue',()=>{simulate('steady_current')})
  it('runs synthetic team attacks using the current abilities',()=>{simulate('team_attacks_current')})
  it('measures sensitivity to currently reduced fitness and morale',()=>{simulate('fitness_sensitivity_current')})
})
