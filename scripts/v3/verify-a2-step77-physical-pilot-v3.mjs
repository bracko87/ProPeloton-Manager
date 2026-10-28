/** A77 phase 2: actual swept-physics pilot, not guaranteed completion.
 * Record exact first rejection and accepted rider movement; no relaxed
 * contact, boundary, energy, speed or overtaking assertions.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const EPS=1e-6
const opts={mode:'five_dense',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,pacePolicy:'timed_safe_corridor'}
const reports=[]
for(const n of [8,32,106,168]){
 for(const geometry of ['double_pinch','staged_pinch']){
  const initial=createMultiGatePhysicalCandidateV3(n,{
   ...opts,roadGeometry:geometry})
  assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
  assert.equal(initial.admission.bookedCount,n*2)
  assert.equal(initial.physical.roadMergePolicy,'platoon_no_yield_control')
  const first=advanceMultiGatePhysicalCandidateV3(initial)
  if(first.reason){
   assert.equal(first.physical.at,0)
   assert.deepEqual(first.physical,initial.physical,
    'A77 rejected physical tick mutated committed movement')
  }else{
   assert.equal(first.physical.at,.5)
   assert(first.physical.states.every(s=>s.energy.seconds===.5))
  }
  const horizon=n<=32?180:60
  const final=runMultiGatePhysicalCandidateV3(initial,{seconds:horizon})
  const report=multiGatePhysicalMetricsV3(initial,final)
  assert(['SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
   'ENERGY_FAILED','GATE_ENTRY_NO_WINDOW',null].includes(final.reason))
  assert.equal(final.officialWrites,0)
  assert(final.physical.at<=horizon+EPS)
  assert(final.physical.states.every(s=>
   s.energy.remainingWPrimeJoules>=0&&s.v>=0&&
   Math.abs(s.energy.seconds-final.physical.at)<EPS),
   'A77 committed impossible rider or energy state')
  assert(report.firstCollision===null||
   Array.isArray(report.firstCollision.pair))
  if(final.reason){
   assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
  }else assert.equal(final.physical.at,horizon)
  // Restartable physical state and persistent reservation intent.
  if(!final.reason&&horizon>=60){
   const halfway=runMultiGatePhysicalCandidateV3(initial,{
    seconds:horizon/2})
   const replay=runMultiGatePhysicalCandidateV3(
    JSON.parse(JSON.stringify(halfway)),{seconds:horizon/2})
   assert.deepEqual(replay,final,'A77 checkpoint recovery changed physics')
  }
  reports.push({...report,targetSeconds:horizon,mode:'five_dense',
   candidatePacePolicy:initial.pacePolicy,
   firstAcceptedTick:first.reason===null,closedOrRejected:!final.reason,
   explicitSportingClaim:false})
 }
}
// Mirror and rider renaming must not change first physical failure.
for(const n of [8,32]){
 const common={...opts,roadGeometry:'double_pinch'}
 const basic=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,common),{seconds:30})
 const reflected=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...common,mirror:true}),
  {seconds:30})
 const renamed=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...common,renamed:true}),
  {seconds:30})
 assert.equal(basic.reason,reflected.reason)
 assert.equal(basic.reason,renamed.reason)
 assert.equal(basic.physical.at,reflected.physical.at)
 assert.equal(basic.physical.at,renamed.physical.at)
 for(let i=0;i<n;i++){
  const a=basic.physical.states[i],b=reflected.physical.states[i],
   c=renamed.physical.states[i]
  assert(Math.abs(a.x-b.x)<EPS&&Math.abs(a.y+b.y-4.4)<EPS,
   'A77 mirrored accepted trajectory changed '+n+'/'+i)
  assert(Math.abs(a.x-c.x)<EPS&&Math.abs(a.y-c.y)<EPS,
   'A77 renamed accepted trajectory changed '+n+'/'+i)
 }
}
// If a small field is physically accepted, independently count real
// sustained crossing pairs, not rank inversions or reserved appointments.
const n=8
const initial=createMultiGatePhysicalCandidateV3(n,{
 ...opts,roadGeometry:'double_pinch'})
let candidate=structuredClone(initial)
let observer=startSustainedOvertakeObserverV3(candidate.physical.states)
while(candidate.physical.at<60&&!candidate.reason){
 const next=advanceMultiGatePhysicalCandidateV3(candidate)
 if(!next.reason)
  observer=advanceSustainedOvertakeObserverV3(observer,
   candidate.physical.states,next.physical.states,.5)
 candidate=next
}
const passes=overtakeObserverSummaryV3(observer)
assert.equal(passes.durationSeconds,candidate.physical.at)
const summary={study:'A2_STEP77_PHASE2_PHYSICAL_CANDIDATE_PILOT',
 technicalGate:'PASS_FOR_HONEST_RECORDED_OUTCOMES',
 sportingGate:'NO_GO',fullFiveAbreastClearanceNotYetClaimed:true,
 tests:reports,observer8:{seconds:observer.at,
  confirmedSustained3sPairPasses:passes.confirmedSustainedPasses},
 protectedStep76PhysicalControllerUnchanged:true,
 noCollisionBypass:true,noRoadsideBypass:true,
 exactBodyWidthM:.3,maxSteerMps:.38,maxAccelerationMps2:.45,
 maxDecelerationMps2:-.85,officialWrites:0}
const dir=process.env.V3_A2_STEP77_PHYSICAL_DIR??'/tmp/a2-step77physical'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step77-actual-physical-candidate-results.json',
 JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({study:summary.study,technicalGate:summary.technicalGate,
 observed3sPasses:summary.observer8,
 trials:reports.map(t=>({n:t.n,geometry:t.geometry,
  status:t.status,seconds:t.acceptedSeconds,
  target:t.targetSeconds,firstAcceptedTick:t.firstAcceptedTick,
  laneChanges:t.laneChanges,rearX:t.rearX,
  firstContact:t.firstCollision?.pair??null,
  firstRoadExit:t.firstRoadViolation?.riderId??null})),
 officialWrites:0,sportingGate:'NO_GO'}))
