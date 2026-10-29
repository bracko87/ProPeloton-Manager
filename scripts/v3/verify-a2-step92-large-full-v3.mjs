/** A92 decisive large five-abreast FULL 180s race attempts.
 * Every 106/168 + both gate profiles + both policies is asked to run
 * the complete 180s, not just an early pilot. True first rejected tick
 * is preserved and expressly reported as a SPORTING NO-GO.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const results=[]
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of ['cohort_strict_v1','cohort_balanced_v1']){
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',pacePolicy,roadGeometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',rollingStartSpeedMps:9})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.admission.bookedCount,2*n)
 const serialized=JSON.stringify(initial)
 const out=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
 assert.equal(JSON.stringify(initial),serialized)
 assert.equal(out.officialWrites,0)
 const m=multiGatePhysicalMetricsV3(initial,out)
 assert(out.physical.at>=0&&out.physical.at<=180)
 if(pacePolicy==='cohort_strict_v1')
  assert.equal(m.nearStops,0,'A92 strict 180s committed near-stop')
 if(out.reason){
  assert.equal(out.status,'REJECTED')
  assert.equal(out.physical.reason,null,
   'A92 incorrectly committed rejected original physical motion')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(out))
 }else assert.equal(out.physical.at,180)
 assert(out.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-out.physical.at)<.00001))
 results.push({n,roadGeometry,pacePolicy,
  actualAcceptedSeconds:out.physical.at,
  targetSeconds:180,
  status:out.reason??'FULL_PHYSICAL_DURATION',
  nearStopRiderTicks:m.nearStops,
  physicalLaneChanges:m.laneChanges,
  rearX:m.rearX,
  everyRiderBeyondSecondGate:m.allPastSecondReopening,
  firstSweptContact:m.firstCollision?.pair??null,
  firstRoadExit:m.firstRoadViolation?.riderId??null,
  noPhysicalRepair:true,officialWrites:0,
  sportingFull180Pass:!out.reason&&out.physical.at===180&&
   m.nearStops===0&&m.allPastSecondReopening})
}
const report={study:'A92_LARGE_106_168_FULL180_ATTEMPTS',
 cases:results.length,
 cleanLargeFull180Passes:results.filter(r=>r.sportingFull180Pass).length,
 sportingDecision:results.every(x=>x.sportingFull180Pass)?
  'NEEDS_ADDITIONAL_PASSING_REPLAY_AND_REAL_ROUTE_GATES':'NO_GO',
 originalA64FullBodyAuthority:true,officialWrites:0,results}
const dir=process.env.V3_A2_STEP92_LARGE_DIR??'/tmp/a92large'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a92-106-168-full-180-attempts.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
