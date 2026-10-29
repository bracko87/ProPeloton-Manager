/** Step108: actual 180-second A64 + achieved speed veto, all rider fields. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step108RunOriginalA64V3}
 from './a2Step108JointMovingA64V3.mjs';
const rows=[];
for(const n of [106,168])for(const roadGeometry of
 ['staged_pinch','double_pinch']){
 const f=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,rollingStartSpeedMps:9,
  pacePolicy:'persistent_global_strict_v1',
  spacingSeconds:.35}).initial;
 const untouched=JSON.stringify(f);
 for(const centerTie of ['left','right']){
  const actual=step108RunOriginalA64V3(
   f.physical,f.admission.bookings,{
    centerTie,seconds:180,depth:3});
  const e=actual.evidence;
  assert.equal(JSON.stringify(f),untouched);
  assert.equal(e.originalA64Unmodified,true);
  assert.equal(e.step95NeverBypassed,true);
  assert.equal(e.eachTickIndependentlyReswept,true);
  assert.equal(e.exactEightSecondRule,true);
  assert.equal(actual.physical.reason,null);
  assert.equal(e.acceptedTicks,e.acceptedSeconds*2);
  assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=180);
  rows.push({n,roadGeometry,centerTie,
    acceptedSeconds:e.acceptedSeconds,
    firstGate:e.firstGatePassed,secondGate:e.secondGatePassed,
    full180:e.full180Accepted,
    firstRejection:e.rejection,
    minAchievedMps:e.achievedMin,groupCount:e.groupCount,
    pelotonRiders:e.pelotonCount,selectedModes:e.modesChosen,
    sweptPreviewChoices:e.previewsConsidered,
    stateHash:e.traceHash,originalA64Unmodified:true});
 }
}
const report={study:'A108_A64_ACHIEVED_MOVING_TWO_LANE',
 attempts:rows.length,
 bestAcceptedSeconds:Math.max(...rows.map(r=>r.acceptedSeconds)),
 previousStep107Best:17,
 complete180:rows.filter(r=>r.full180).length,
 firstGateCleared:rows.filter(r=>r.firstGate).length,
 bothGatesCleared:rows.filter(r=>r.secondGate).length,
 noPhysicalRuleChanges:true,noProdWrites:true,sportingGO:false,rows};
const dir=process.env.V3_A2_STEP108_DIR??'/tmp/a108';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step108-joint-moving-actual-a64.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
