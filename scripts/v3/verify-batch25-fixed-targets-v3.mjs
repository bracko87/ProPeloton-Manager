/** Controlled FIXED speed requests; only positions/lane decisions change. OFFLINE. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {diagnosePositionCascadeTickV3} from './positionCascadeDiagnosticsV3.mjs'
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const source=readFileSync(new URL('./fixtures/'+name+'.csv',import.meta.url),'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number))
 const demand=new Map(source.map(([idx,team,flat,hills,climbing])=>['r'+String(idx).padStart(3,'0'),Math.max(7,Math.min(15,10.4+.085*(flat-70)+.025*(climbing-70)))]))
 const seed='batch25-identical-grid',geometry={mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}
 const grid=planNeutralStartFormationV3([...demand.keys()],seed,geometry)
 const initial=grid.map(x=>({riderId:x.riderId,meters:x.meters,lane:x.gridLane,desiredMps:demand.get(x.riderId),energy:.8,tactic:'follow'}))
 const run=(preemptive)=>{
  let state=initial.map(x=>({...x})),blocked=0,cascaded=0,advanced=0,shifted=0,depth=0
  for(let step=0;step<96;step++){
   const before=state.map(x=>({...x,desiredMps:demand.get(x.riderId)}))
   const moves=advanceSpatialPelotonV3(before,{laneCount:4,dtSeconds:10,minWheelGapMeters:1.8})
   const diagnosis=diagnosePositionCascadeTickV3(before,moves,10)
   blocked+=diagnosis.summary.blocked;cascaded+=diagnosis.summary.chainAffected;depth=Math.max(depth,diagnosis.summary.longestChain)
   let lanes=new Map(moves.map(m=>[m.riderId,m.lane]))
   if(preemptive){
    const later=planAnticipatoryLanesV3(before,moves,4)
    shifted+=later.shifted;lanes=new Map(later.riders.map(x=>[x.riderId,x.lane]))
    assert(later.riders.every(x=>Math.abs(x.meters-moves.find(m=>m.riderId===x.riderId).meters)<1e-6),'Preemptive lanes cannot grant longitudinal metres')
   }
   advanced+=moves.reduce((n,m)=>n+m.meters-m.oldMeters,0)
   state=moves.map(x=>({riderId:x.riderId,meters:x.meters,lane:lanes.get(x.riderId),desiredMps:demand.get(x.riderId),energy:.8,tactic:'follow'}))
  }
  return {blocked,cascaded,advanced:Math.round(advanced*1e6)/1e6,shifted,maxChainDepth:depth}
 }
 const baseline=run(false),candidate=run(true),repeat=run(true)
 assert.deepEqual(candidate,repeat,'Geometric shadow must be deterministic')
 assert.equal(demand.size,source.length)
 console.log(JSON.stringify({fixture:name,roster:source.length,mode:'OFFLINE_FIXED_TARGET_GEOMETRY_ONLY',sameSpeedCommands:true,sameInitialGrid:true,zeroInstantFreeDistance:true,sportingApproval:'NOT_APPROVED',officialWrites:0,baseline,candidate,deltaBlocked:candidate.blocked-baseline.blocked,deltaAdvancedMeters:Math.round((candidate.advanced-baseline.advanced)*1e6)/1e6}))
}
