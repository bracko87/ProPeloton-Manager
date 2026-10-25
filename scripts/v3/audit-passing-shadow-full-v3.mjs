import assert from 'node:assert/strict'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {auditPassingOpportunitiesV3} from '../../src/race-engine-v3/passingOpportunityShadowV3.ts'
for(const count of [106,168]){
 const ids=Array.from({length:count},(_,i)=>'r'+String(i).padStart(3,'0'))
 const grid={mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}
 let states=planNeutralStartFormationV3(ids,'v3-spatial-stress',grid).map(r=>({...r,lane:r.gridLane,energy:1,desiredMps:10+((Number(r.riderId.slice(1))*7)%13)/8,tactic:Number(r.riderId.slice(1))%11===0?'attack':'follow'}))
 let blocked=0,opportunities=0,appliedMoves=0,executedPasses=0,shadowGain=0
 for(let tick=0;tick<30;tick++){
  states=states.map(r=>({...r,desiredMps:10+((Number(r.riderId.slice(1))*7+tick*3)%13)/8,energy:Math.max(.1,r.energy-.001)}))
  const road={laneCount:4,dtSeconds:10,minWheelGapMeters:1.8,crosswindMps:5,gradePercent:1}
  const snapshot=JSON.stringify(states)
  const advisory=auditPassingOpportunitiesV3(states,road)
  const actual=advanceSpatialPelotonV3(states,road)
  assert.equal(JSON.stringify(states),snapshot,'Read-only shadow may not mutate physical snapshot')
  assert.equal(advisory.mode,'SHADOW_ONLY_DO_NOT_APPLY')
  assert.equal(advisory.decisions.length,count)
  blocked+=advisory.blockedRiders
  opportunities+=advisory.opportunities
  shadowGain+=advisory.potentialTotalGainMeters
  appliedMoves+=actual.reduce((acc,x)=>acc+x.lateralMoves,0)
  executedPasses+=actual.filter(x=>x.overtook).length
  states=states.map(r=>({...r,meters:actual.find(x=>x.riderId===r.riderId).meters,lane:actual.find(x=>x.riderId===r.riderId).lane}))
 }
 assert(opportunities>0,'Expect at least one *advisory* lane opportunity')
 console.log(JSON.stringify({mode:'SHADOW_ONLY_DO_NOT_APPLY',riders:count,ticks:30,physicalPassesExecuted:executedPasses,physicalLaneChanges:appliedMoves,blockedRiderTicks:blocked,advisoryLaneOpportunities:opportunities,advisoryUnexecutedPotentialGainMeters:Math.round(shadowGain*100)/100,sportingApproval:'NOT_APPROVED'}))
}
