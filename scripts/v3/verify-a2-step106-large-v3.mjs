/**
 * Step106 8 bounded original-A64 large-field experiments.
 * Actual 0.5s accepted physical states only; failed first future contacts
 * are research NO-GO, not successful race finish.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step106RunPhysicalSpaceTimeV3}
 from './a2Step106PhysicalSpaceTimeTubesV3.mjs';
const rows=[];
for(const n of [106,168])for(const roadGeometry of
 ['staged_pinch','double_pinch']){
 const a=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,pacePolicy:'persistent_global_strict_v1',
  rollingStartSpeedMps:9,spacingSeconds:.35}).initial;
 const frozen=JSON.stringify(a);
 for(const horizonTicks of [8,12]){
  const p=step106RunPhysicalSpaceTimeV3(a.physical,
   a.admission.bookings,{seconds:30,horizonTicks,
    baseModes:['zipper_brake_strict','zipper_window'],
    efforts:[1.25]});
  const e=p.evidence;
  assert.equal(JSON.stringify(a),frozen);
  assert.equal(e.officialWrites,0);
  assert.equal(e.exactlyEightSecondGroups,true);
  assert.equal(p.physical.reason,null);
  assert.equal(e.originalA64AcceptedTicks,e.acceptedSeconds*2);
  assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=30);
  rows.push({n,roadGeometry,horizonTicks,
   acceptedSeconds:e.acceptedSeconds,
   fullRequestedHorizonAccepted:e.fullRequestedHorizonAccepted,
   firstGateClearedByAll:e.firstGateClearedByAll,
   secondGateClearedByAll:e.secondGateClearedByAll,
   minimumActualSpeed:e.minimumActualSpeed,
   physicalPreviews:e.triedPhysicalTubes,
   discardedA64PreviewTicks:e.discardedA64PreviewTicks,
   actualGroupCount:e.groupCount,
   pelotonRiders:e.pelotonCount,
   firstPhysicalRejection:e.firstRejection,
   physicsUnmodified:true,officialWrites:0});
 }
}
const result={study:'A106_TRUE_ORIGINAL_A64_CONFLICT_DIRECTED_TUBE_SEARCH',
 attempts:rows.length,
 physicallyClear30:rows.filter(r=>r.fullRequestedHorizonAccepted).length,
 passedFirstGate:rows.filter(r=>r.firstGateClearedByAll).length,
 physicallyAcceptedBestSeconds:Math.max(...rows.map(r=>r.acceptedSeconds)),
 priorStep104RecordSeconds:14,
 firstGateProven:false,bothNarrowingsProven:false,
 sportingMilestoneA:'NO_GO',
 allLiveWrites:0,rows};
const dir=process.env.V3_A2_STEP106_DIR??'/tmp/a106';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step106-a64-physical-conflict-directed.json',
 JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
