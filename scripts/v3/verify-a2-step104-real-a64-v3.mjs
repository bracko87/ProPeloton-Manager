/** Step104 106/168 physical original A64 experiments.
 * Failing collisions are honest sporting NO-GO, never fake CI failure.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step104OriginalA64PassageV3}
 from './a2Step104GlobalMultiRowPrecedenceV3.mjs';
const cases=[],modes=['chain_soft','chain_strict',
  'global_reserve','stepped_release','early_ordered_merge',
  'zipper_uniform','zipper_soft','zipper_pace',
  'zipper_slower','zipper_window',
  'zipper_brake','zipper_brake_strict','zipper_brake_fast','global_brake'];
for(const n of [106,168])for(const roadGeometry of
 ['staged_pinch','double_pinch']){
 const f=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry,pacePolicy:'persistent_global_strict_v1',
   rollingStartSpeedMps:9,spacingSeconds:.35});
 const before=JSON.stringify(f.initial);
 for(const mode of modes){
  const r=step104OriginalA64PassageV3(
   f.initial.physical,f.initial.admission.bookings,{mode,seconds:30});
  const e=r.evidence;
  assert.equal(JSON.stringify(f.initial),before);
  assert.equal(e.officialWrites,0);
  assert.equal(e.eightSecondGroupRule,true);
  assert.equal(r.physical.reason,null);
  assert.equal(e.acceptedSamples,e.acceptedSeconds*2);
  assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=30);
  assert(!e.firstRejection||e.acceptedSeconds<30);
  cases.push({n,roadGeometry,mode,
    acceptedSeconds:e.acceptedSeconds,
    completed30:e.completedRequestedPrefix,
    firstGate:e.allFirstGatePassed,
    secondGate:e.allSecondGatePassed,
    pelotonRiders:e.pelotonRiders,groups:e.groupCount,
    forcedTaperRiderTicks:e.forceRiderTicks,
    globalPrecedenceConstraints:e.globalPairConstraints,
    cappedCommands:e.caps,minAchievedMps:e.minAchievedMps,
    firstRejection:e.firstRejection,
    physicalStateDigest:e.traceSha256,
    full180SportingApproved:false});
 }
}
const result={study:'A104_MULTIROW_GLOBAL_PRECEDENCE_REAL_A64',
 cases:cases.length,full30:cases.filter(x=>x.completed30).length,
 allThroughFirstGate:cases.filter(x=>x.firstGate).length,
 bestAcceptedSeconds:Math.max(...cases.map(x=>x.acceptedSeconds)),
 comparedStep103BestSeconds:11,officialWrites:0,
 researchOnly:true,originalA64Unmodified:true,
 eightSecondGroupRulePreserved:true,full180SportingGO:false,cases};
const dir=process.env.V3_A2_STEP104_DIR??'/tmp/a104';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step104-real-a64-global-precedence.json',
 JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
