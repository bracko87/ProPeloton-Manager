/** A77 offline neutral rolling-start hypothesis, without altering the
 * accepted solver state, bounding constants, collisions or static road.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const tests=[]
for(const speed of [8.5,9.0]){
 for(const n of [32,106,168]){
  for(const geometry of ['staged_pinch','double_pinch']){
   const opts={mode:'five_dense',rollingStartSpeedMps:speed,
    headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
    pacePolicy:'timed_safe_corridor',roadGeometry:geometry}
   const initial=createMultiGatePhysicalCandidateV3(n,opts)
   assert(initial.physical.states.every(s=>s.v===speed&&
    s.energy.seconds===0))
   assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
   const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
   const m=multiGatePhysicalMetricsV3(initial,final)
   assert.equal(final.officialWrites,0)
   assert(final.physical.states.every(s=>s.v>=0&&
    s.energy.remainingWPrimeJoules>=0&&
    Math.abs(s.energy.seconds-final.physical.at)<1e-6))
   if(final.reason)assert.equal(final.status,'REJECTED')
   else assert.equal(final.physical.at,180)
   tests.push({n,geometry,startSpeedMps:speed,
    acceptedSeconds:m.acceptedSeconds,status:m.status,
    lanes:m.laneChanges,nearStops:m.nearStops,
    rearX:m.rearX,allPastSecondOpening:m.allPastSecondReopening,
    collision:m.firstCollision?.pair??null,
    roadViolation:m.firstRoadViolation?.riderId??null})
  }
 }
}
const doc={study:'A77_PHASE2_NEUTRAL_ROLLING_FIVE_ABREAST',
 tests,firstContactIsNotOverridden:true,
 fullStageSportingApproval:'NOT_APPROVED',officialWrites:0}
const dir=process.env.V3_A2_STEP77_NEUTRAL_DIR??'/tmp/a77neutral'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase2-neutral-rolling-start.json',
 JSON.stringify(doc,null,2)+'\n')
console.log(JSON.stringify(doc))
