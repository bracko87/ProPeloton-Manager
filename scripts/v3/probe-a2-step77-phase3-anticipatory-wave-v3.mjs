/** Phase3 all-bicycle swept physics candidate search: bounded current-state
 * anticipatory brake and leader-retention waves. Every collision is a strict
 * NO-GO; a green audit does not turn a failed candidate into an approval.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {phase3QueueWaveV3} from './a2Phase3QueueWaveV3.mjs'
import {createMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const r4=(x)=>Math.round(x*10000)/10000
const unitStates=[
 {id:'a',x:600,y:1.25,v:8.4},
 {id:'b',x:594.8,y:1.25,v:9.6}
]
const unitRequests=[
 {id:'a',speed:5,targetY:1.25},
 {id:'b',speed:9.5,targetY:1.25}
]
const saved=JSON.stringify({unitStates,unitRequests})
const test=phase3QueueWaveV3(unitStates,unitRequests,{a:8.7,b:9.7},
 {headwayM:4.5})
assert(test.requests[0].speed>unitRequests[0].speed,
 'A77 leader refused necessary bounded pace retention')
assert(test.requests[1].speed<unitRequests[1].speed,
 'A77 rear did not receive early brake warning')
assert.equal(JSON.stringify({unitStates,unitRequests}),saved,
 'A77 altered a current state or input request')
assert.equal(test.noMotionAuthority,true)
assert.throws(()=>phase3QueueWaveV3(unitStates,
 [unitRequests[0],unitRequests[0]],{a:8.7,b:9.7}))
const trials=[]
for(const n of [32,106,168]){
 for(const geometry of ['staged_pinch','double_pinch']){
  for(const spacing of [5.2,6.5,8]){
   for(const rolling of [null,9]){
    for(const pacePolicy of ['anticipatory_queue_wave',
     'protect_lead_queue_wave']){
     const params={mode:'five_dense',roadGeometry:geometry,
      controllerPolicy:'coordinated_demand',headwayStandOffM:4.5,
      startRowSpacingM:spacing,rollingStartSpeedMps:rolling,
      pacePolicy,coreMergePolicy:'preview_only'}
     const initial=createMultiGatePhysicalCandidateV3(n,params)
     assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
     assert.equal(initial.admission.bookedCount,n*2)
     const initialPhysical=JSON.stringify(initial.physical)
     const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
     const result=multiGatePhysicalMetricsV3(initial,final)
     assert.equal(JSON.stringify(initial.physical),initialPhysical)
     assert.equal(final.officialWrites,0)
     assert(final.physical.at<=180&&final.physical.at>=0)
     assert(final.physical.states.every(s=>s.v>=0&&
      s.energy.remainingWPrimeJoules>=0&&
      Math.abs(s.energy.seconds-final.physical.at)<1e-6))
     if(final.reason){
      assert.equal(final.status,'REJECTED')
      assert.throws(()=>runMultiGatePhysicalCandidateV3(final,{seconds:.5}))
     }else{
      assert.equal(final.physical.at,180)
     }
     trials.push({n,geometry,startRowSpacingM:spacing,
      rollingStartSpeedMps:rolling,pacePolicy,
      acceptedSeconds:final.physical.at,status:result.status,
      rearX:r4(result.rearX),laneChanges:result.laneChanges,
      nearStopTicks:result.nearStops,
      contact:result.firstCollision?.pair??null,
      roadExit:result.firstRoadViolation?.riderId??null,
      queueProtectedLeaderTicks:final.queueProtectedLeaderTicks,
      queueEarlyBrakeRiderTicks:final.queueEarlyBrakeRiderTicks,
      allPastSecondReopening:result.allPastSecondReopening})
    }
   }
  }
 }
}
const wins=trials.filter(t=>t.status==='FULL_HORIZON_CLEAR'&&
 t.allPastSecondReopening&&t.nearStopTicks===0)
const report={study:'A2_STEP77_PHASE3_TRUE_2D_QUEUE_WAVE',
 technicalGate:'PASS_FOR_HONEST_TRIAL_OUTCOMES',
 sportingApproval:'NOT_APPROVED',unitQueueProtectedLead:true,
 trialCount:trials.length,largeFullClear:trials.filter(
  t=>t.n>32&&t.status==='FULL_HORIZON_CLEAR').length,
 collisionSweepsNeverBypassed:true,officialWrites:0,wins,trials}
const dir=process.env.V3_A2_STEP77_WAVE_DIR??'/tmp/a77-wave'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase3-anticipatory-queue-wave.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
