/** Actual original-A64 witnesses; a failed full-race is sporting NO-GO.
 * Do not treat a passing diagnostic test as a physically completed race.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {step105RunOriginalA64ZipperV3} from './a2Step105CoupledZipperV3.mjs';
const rows=[];
for(const n of [106,168])for(const roadGeometry of
  ['staged_pinch','double_pinch']){
 const base=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,pacePolicy:'persistent_global_strict_v1',
  rollingStartSpeedMps:9,spacingSeconds:.35}).initial;
 const untouched=JSON.stringify(base);
 for(const mode of ['conservative','early','adaptive']){
  const run=step105RunOriginalA64ZipperV3(
   base.physical,base.admission.bookings,{mode,seconds:180});
  const e=run.evidence;
  assert.equal(JSON.stringify(base),untouched);
  assert.equal(run.physical.reason,null);
  assert.equal(e.onlyRealA64SweptAccepted,true);
  assert.equal(e.exactEightSecondRule,true);
  assert.equal(e.officialWrites,0);
  assert.equal(e.acceptedSteps,e.acceptedSeconds*2);
  assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=180);
  rows.push({n,roadGeometry,mode,acceptedSeconds:e.acceptedSeconds,
   requestedSeconds:180,firstGateAllRidersPassed:e.firstGateAllRidersPassed,
   secondGateAllRidersPassed:e.secondGateAllRidersPassed,
   minimumAchievedSpeed:e.minActualSpeed,
   racingGroups:e.eightSecondGroupCount,pelotonRiders:e.pelotonCount,
   physicallySweptCandidateEvaluations:e.physicalCandidateEvaluations,
   firstRejection:e.firstRejection,
   prefixHash:e.traceHash,
   collisionFreeFull180:e.acceptedSeconds===180&&!e.firstRejection,
   fullSportingGO:false});
 }
}
const result={study:'A105_GLOBAL_CONSTRAINED_ZIPPER_TRUE_A64',
 attempts:rows.length,
 reached180s:rows.filter(r=>r.collisionFreeFull180).length,
 passedFirstGate:rows.filter(r=>r.firstGateAllRidersPassed).length,
 passedBothGates:rows.filter(r=>r.secondGateAllRidersPassed).length,
 maxPhysicallyAcceptedSeconds:Math.max(...rows.map(r=>r.acceptedSeconds)),
 previousStep104BestSeconds:14,
 validatedEightSecondGroupRule:true,
 originalA64Unmodified:true,officialWrites:0,
 milestoneA:'SPORTING_NO_GO_PENDING_180S_BOTH_GATES_AND_OVERTAKES',
 rows};
const dir=process.env.V3_A2_STEP105_DIR??'/tmp/a105';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step105-original-a64-joint-zipper.json',
  JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
