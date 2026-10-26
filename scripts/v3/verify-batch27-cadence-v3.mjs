/** Controlled same-speed, same-grid cooldown study. No racing physics or DB changes. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {chooseSingleLaneV3} from './singleLaneBranchV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const source=readFileSync(new URL('./fixtures/'+name+'.csv',import.meta.url),'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number))
 const demand=new Map(source.map(([idx,team,flat,hills,climbing])=>['r'+String(idx).padStart(3,'0'),Math.max(7,Math.min(15,10.4+.085*(flat-70)+.025*(climbing-70)))]))
 const init=planNeutralStartFormationV3([...demand.keys()],'batch27-identical-grid',{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}).map(r=>({riderId:r.riderId,meters:r.meters,lane:r.gridLane,desiredMps:demand.get(r.riderId),energy:.8,tactic:'follow'}))
 function run(cooldown){
  let state=init.map(x=>({...x})),blocked=0,shifted=0,cascaded=0,advanced=0,rejected=0
  const last=new Map()
  for(let tick=0;tick<96;tick++){
   const before=state.map(x=>({...x}))
   const moves=advanceSpatialPelotonV3(before,{laneCount:4,dtSeconds:10,minWheelGapMeters:1.8})
   blocked+=moves.filter(x=>x.wheelLimited).length
   const target=new Map(moves.map(x=>[x.riderId,x.lane]))
   if(Number.isFinite(cooldown)){
    let planned=null
    try{planned=planAnticipatoryLanesV3(before,moves,4)}
    catch(e){if(e instanceof Error&&e.message==='Invalid anticipatory bicycle placement')rejected++;else throw e}
    if(planned){
     const filtered={...planned,riders:planned.riders.map(x=>({...x,promoted:x.promoted&&tick-(last.get(x.riderId)??-9999)>=cooldown}))}
     const c=chooseSingleLaneV3(before,moves,filtered)
     if(c){target.set(c.riderId,c.toLane);shifted++;last.set(c.riderId,tick)}
    }
   }
   advanced+=moves.reduce((n,m)=>n+m.meters-m.oldMeters,0)
   state=moves.map(x=>({riderId:x.riderId,meters:x.meters,lane:target.get(x.riderId),desiredMps:demand.get(x.riderId),energy:.8,tactic:'follow'}))
  }
  return {cooldown:Number.isFinite(cooldown)?cooldown:'no intervention',blocked,shifted,rejected,aggregateForwardMeters:Math.round(advanced*1e6)/1e6,separations:measurePelotonSeparationsV3({riders:state.map(x=>({...x,finishSeconds:null}))})}
 }
 const untreated=run(Infinity),every4=run(4),every16=run(16)
 assert.deepEqual(run(4),every4,'Non-deterministic lane cadence')
 assert(every4.shifted>0&&every16.shifted>0)
 assert.equal(untreated.shifted,0)
 console.log(JSON.stringify({fixture:name,roster:source.length,mode:'OFFLINE_FIXED_TARGET_LANE_CADENCE',sameSpeedTargets:true,sameInitialGrid:true,officialWrites:0,sportingApproval:'NOT_APPROVED',untreated,every4,every16}))
}
