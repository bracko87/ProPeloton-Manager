import assert from 'node:assert/strict'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
const inputs=[106,168]
for(const count of inputs){
 const ids=Array.from({length:count},(_,i)=>'r'+String(i).padStart(3,'0'))
 const init=planNeutralStartFormationV3(ids,'v3-spatial-stress',{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2})
 let states=init.map(r=>({...r,lane:r.gridLane,energy:1,desiredMps:10+((Number(r.riderId.slice(1))*7)%13)/8,tactic:Number(r.riderId.slice(1))%11===0?'attack':'follow'}))
 let moves=0, limited=0, maximum=0
 for(let step=0;step<30;step++){
   states=states.map(r=>({...r,desiredMps:10+((Number(r.riderId.slice(1))*7+step*3)%13)/8,energy:Math.max(.1,r.energy-.001)}))
   const results=advanceSpatialPelotonV3(states,{laneCount:4,dtSeconds:10,minWheelGapMeters:1.8,crosswindMps:5,gradePercent:1})
   for(const r of results){
     assert(r.meters+1e-6>=states.find(x=>x.riderId===r.riderId).meters)
     assert(r.speedMps<=r.commandedMps+1e-5)
     assert(r.lateralMoves<=1)
     assert(r.slipstreamFraction>=0&&r.slipstreamFraction<=.30)
     moves+=r.lateralMoves;limited+=Number(r.wheelLimited)
     maximum=Math.max(maximum,r.meters)
   }
   for(let i=0;i<results.length;i++)for(let j=i+1;j<results.length;j++){
     if(results[i].lane===results[j].lane)assert(Math.abs(results[i].meters-results[j].meters)>=1.8-.0001)
   }
   states=states.map(r=>({...r,meters:results.find(x=>x.riderId===r.riderId).meters,lane:results.find(x=>x.riderId===r.riderId).lane}))
 }
 console.log(JSON.stringify({riders:count,ticks:30,simulatedSeconds:300,legalLateralMoves:moves,wheelLimitedEvents:limited,maxMeters:maximum,passed:true}))
}
