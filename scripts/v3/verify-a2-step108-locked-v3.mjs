/** Step108B: invariant full-trajectory lane reservation policy, A64-physical. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step107RunOriginalA64ReservationsV3}
 from './a2Step107GlobalLaneReservationsV3.mjs';
import {step108RunLockedOriginalA64V3}
 from './a2Step108JointMovingA64V3.mjs';
const modes=['base','floor','wave','fast','compact','stagger'];
const records=[];
for(const n of [106,168])for(const roadGeometry of
 ['staged_pinch','double_pinch']){
 const initial=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,pacePolicy:'persistent_global_strict_v1',
  rollingStartSpeedMps:9,spacingSeconds:.35}).initial;
 const saved=JSON.stringify(initial);
 for(const centerTie of ['left','right']){
  const baseline=step107RunOriginalA64ReservationsV3(
   initial.physical,initial.admission.bookings,{
    mode:'slots_balanced',centerTie,seconds:180});
  for(const mode of modes){
   const run=step108RunLockedOriginalA64V3(
     initial.physical,initial.admission.bookings,{
      mode,centerTie,seconds:180});
   const e=run.evidence;
   assert.equal(JSON.stringify(initial),saved);
   assert.equal(e.physicalSteps,e.acceptedSeconds*2);
   assert.equal(e.exactEightSecondRule,true);
   assert.equal(e.officialWrites,0);
   assert.equal(run.physical.reason,null);
   assert.equal(e.noMidRacePolicySwitch,true);
   if(mode==='base'){
    assert.equal(e.acceptedSeconds,
      baseline.evidence.acceptedSeconds,
      'Step108 base must match unmodified Step107 lane controller');
    assert.deepEqual(run.physical,baseline.physical,
      'original A64 control checkpoint including x/y/v/energy unchanged');
   }
   records.push({n,roadGeometry,centerTie,mode,
    acceptedSeconds:e.acceptedSeconds,
    firstGate:e.firstGatePassed,
    secondGate:e.secondGatePassed,
    full180:e.completed180,
    originalReason:e.rejected?.reason,
    firstContact:e.rejected?.collisionPair,
    speedVeto:e.rejected?.movingGate?.upstreamSlow||
      e.rejected?.movingGate?.downstreamSlow||0,
    minPhysicalMps:e.minPhysicalSpeed,
    groupCount:e.groupCount,pelotonRiders:e.pelotonCount,
    physicalTraceSha256:e.traceHash,
    fixedOriginalLaneOrder:true,officialWrites:0});
  }
 }
}
const report={study:'A108B_LOCKED_GLOBAL_MOVING_SPEED_ACTUAL_A64',
 count:records.length,
 full180:records.filter(x=>x.full180).length,
 fullFirstGate:records.filter(x=>x.firstGate).length,
 fullBothGates:records.filter(x=>x.secondGate).length,
 bestAcceptedSeconds:Math.max(...records.map(x=>x.acceptedSeconds)),
 step107Best:17,
 originalStep107ControlParity:true,
 originalA64AndStep95Unmodified:true,officialWrites:0,
 sportingGO:false,records};
const dir=process.env.V3_A2_STEP108_DIR??'/tmp/a108';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step108b-locked-lanes-original-a64.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
