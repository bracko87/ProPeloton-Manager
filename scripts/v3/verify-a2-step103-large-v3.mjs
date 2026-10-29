/** Real original A64 106 and 168 rider safety witnesses.
 * A failed original collision is a NO-GO, not a test infrastructure failure.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step103RunA64ClearanceV3}
 from './a2Step103PreTaperClearanceV3.mjs';
const results=[],modes=['preopen_moderate','preopen_deep','row_phase',
 'early_join','frontload_inner'];
for(const n of [106,168]){
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  const f=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry,pacePolicy:'persistent_global_strict_v1',
   rollingStartSpeedMps:9,spacingSeconds:.35});
  const before=JSON.stringify(f.initial);
  for(const mode of modes){
   const run=step103RunA64ClearanceV3(
     f.initial.physical,f.initial.admission.bookings,
     {mode,seconds:30});
   const e=run.evidence;
   assert.equal(JSON.stringify(f.initial),before);
   assert.equal(e.exactEightSecondGroupRule,true);
   assert.equal(e.officialWrites,0);
   assert.equal(run.physical.reason,null);
   assert.equal(e.acceptedSteps,e.acceptedSeconds*2);
   assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=30);
   assert(!e.firstRejectReason||!e.complete30Seconds);
   results.push({n,roadGeometry,mode,
     acceptedSeconds:e.acceptedSeconds,
     failure:e.firstRejectReason,
     firstRejectAt:e.firstRejectAt,
     allFirstGatePassed:e.allFirstGatePassed,
     allSecondGatePassed:e.allSecondGatePassed,
     groups:e.physicalGroupCount,pelotonRiders:e.pelotonRiders,
     minAchievedMps:e.minAcceptedMps,
     roadPreviewForceTicks:e.forcedRoadPreviewRequests,
     acceptedSteeringTicks:e.acceptedSteeringRiderTicks,
     physicalHash:e.stableCheckpointHash,
     originalA64AcceptedPhysical:true,
     full180SportingSuccess:e.full180SportingSuccess});
  }
 }
}
const summary={study:'A103_PRETAPER_REAL_A64_106_168',
cases:results.length,full30:results.filter(r=>r.acceptedSeconds===30).length,
firstGateFull:results.filter(r=>r.allFirstGatePassed).length,
bestAcceptedSeconds:Math.max(...results.map(r=>r.acceptedSeconds)),
bestPriorStep102Seconds:10,
originalA64Unmodified:true,exactEightSecondGroups:true,
sportingGO:false,officialWrites:0,results};
const dir=process.env.V3_A2_STEP103_DIR??'/tmp/a103';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step103-physical-formation-results.json',
 JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
