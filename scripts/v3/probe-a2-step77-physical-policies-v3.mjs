/** Compare offline A77 bounded candidate controls without accepting unsafe
 * movements. Runs physical motion and reports first collision.
 */
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const attempts=[]
for(const policy of ['timed_safe_corridor','timed_slot_only','timed_speed_only'])
for(const standOff of [3.2,4.5])
for(const geometry of ['double_pinch','staged_pinch']){
 const n=32,initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',roadGeometry:geometry,
  controllerPolicy:'coordinated_demand',
  headwayStandOffM:standOff,pacePolicy:policy})
 const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
 const m=multiGatePhysicalMetricsV3(initial,final)
 attempts.push({policy,standOff,geometry,n,status:m.status,
  seconds:m.acceptedSeconds,rearX:m.rearX,
  laneChanges:m.laneChanges,firstContact:m.firstCollision?.pair??null,
  nearStops:m.nearStops})
}
const initial=createMultiGatePhysicalCandidateV3(32,{
 mode:'five_dense',roadGeometry:'double_pinch'})
let state=initial
const watch=[3,4,8,9,13,14].map(i=>'r'+String(i).padStart(3,'0'))
const timeline=[]
while(state.physical.at<5&&!state.reason){
 timeline.push({t:state.physical.at,riders:state.physical.states
  .filter(s=>watch.includes(s.id))
  .map(s=>({id:s.id,x:+s.x.toFixed(3),y:+s.y.toFixed(3),
   v:+s.v.toFixed(3)}))})
 state=advanceMultiGatePhysicalCandidateV3(state)
}
timeline.push({t:state.physical.at,reason:state.reason,
 firstCollision:state.firstCollision??null})
const report={study:'A77_PHASE2_CAUSAL_POLICY_PROBE',
 attempts,firstRowAndTailTimeline:timeline,officialWrites:0,
 physicalSportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP77_PROBE_DIR??'/tmp/a77phase2probe'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase2-policy-probe.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,attempts,
 timeline,officialWrites:0}))
