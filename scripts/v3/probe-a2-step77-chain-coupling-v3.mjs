/** A77 off-line chain-coupling parameter study on five-abreast starts.
 * Uses EXISTING bounded physical follower solver; no physics relaxations.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const outcomes=[]
for(const coreMergePolicy of ['platoon_chain','platoon_soft_yield']){
 for(const start of [null,9.0]){
  for(const n of [32,106,168]){
   for(const geometry of ['staged_pinch','double_pinch']){
    const opts={mode:'five_dense',coreMergePolicy,
     roadGeometry:geometry,headwayStandOffM:4.5,
     rollingStartSpeedMps:start,pacePolicy:'timed_safe_corridor'}
    const initial=createMultiGatePhysicalCandidateV3(n,opts)
    const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
    const r=multiGatePhysicalMetricsV3(initial,final)
    assert(final.physical.at<=180)
    assert(final.physical.states.every(s=>s.v>=0&&
     s.energy.remainingWPrimeJoules>=0&&
     Math.abs(s.energy.seconds-final.physical.at)<1e-6))
    if(final.reason)assert.equal(final.status,'REJECTED')
    else assert.equal(final.physical.at,180)
    outcomes.push({coreMergePolicy,rollingStartSpeedMps:start,
     n,geometry,status:r.status,seconds:r.acceptedSeconds,
     rearX:r.rearX,nearStops:r.nearStops,
     laneChanges:r.laneChanges,collision:r.firstCollision?.pair??null,
     roadExit:r.firstRoadViolation?.riderId??null,
     allPastSecondReopening:r.allPastSecondReopening})
   }
  }
 }
}
const report={study:'A77_PHASE2_EXISTING_CHAIN_AND_YIELD_PHYSICS_PROBE',
 sportingApproval:'NO_GO',officialWrites:0,outcomes}
const dir=process.env.V3_A2_STEP77_CHAIN_DIR??'/tmp/a2-step77-chain'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-physical-chain-probe.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
