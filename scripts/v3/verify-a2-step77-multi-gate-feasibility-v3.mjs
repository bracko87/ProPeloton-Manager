/** A77 necessary multi-gate geometry + body-valid grid screen.
 * Does NOT certify an accepted 2D trajectory. Step76 physics regressions
 * must run separately; no production writer is imported here.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs'
import {discoverMultiGateGeometryV3,auditMultiGateAdmissionV3,
 multiGateLateralCapacityV3} from './a2MultiGateAdmissionV3.mjs'
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
const close=(a,b)=>Math.abs(a-b)<=1e-5
const expected={
 constant:[],mild_pinch:[[780,3.3,4]],
 strong_pinch:[[780,2.2,2]],
 double_pinch:[[780,2.2,2],[1230,2.2,2]],
 staged_pinch:[[780,3.3,4],[1230,2.2,2]]
}
for(const [kind,gates] of Object.entries(expected)){
 const got=discoverMultiGateGeometryV3(kind)
 assert.equal(got.gates.length,gates.length,'A77 missing narrowing: '+kind)
 assert.equal(got.referenceCapacity,5)
 for(let i=0;i<gates.length;i++){
  assert(close(got.gates[i].gateX,gates[i][0]))
  assert(close(got.gates[i].widthM,gates[i][1]))
  assert.equal(got.gates[i].capacity,gates[i][2])
  assert(got.gates[i].entryX<got.gates[i].gateX)
  assert(got.gates[i].gateX<got.gates[i].exitX)
 }
}
assert.equal(multiGateLateralCapacityV3(2.2,.3),2)
assert.equal(multiGateLateralCapacityV3(3.3,.3),4)
assert.equal(multiGateLateralCapacityV3(4.4,.3),5)
assert.throws(()=>discoverMultiGateGeometryV3('unknown'))
assert.throws(()=>discoverMultiGateGeometryV3('strong_pinch',{stepM:0}))
const evidence=[]
for(const n of [32,106,168])for(const mode of ['corridor','five_dense']){
 for(const kind of ['double_pinch','staged_pinch']){
  const opts={mode,controllerPolicy:'coordinated_demand',
   roadGeometry:kind,bodyHalfWidthM:.3,
   roadMergePolicy:'preview_only'}
  const ordinary=createNormalStartV3(n,opts)
  const reflected=createNormalStartV3(n,{...opts,mirror:true})
  const renamed=createNormalStartV3(n,{...opts,renamed:true})
  const a=auditMultiGateAdmissionV3(ordinary.states,kind)
  const b=auditMultiGateAdmissionV3(reflected.states,kind)
  const c=auditMultiGateAdmissionV3(renamed.states,kind)
  for(const report of [a,b,c]){
   assert.equal(report.status,'NECESSARY_WINDOWS_EXIST',
    'A77 missed conservative windows: '+n+'/'+mode+'/'+kind)
   assert.equal(report.bookedCount,n*2)
   assert.equal(report.expectedCount,n*2)
   assert.equal(report.officialWrites,0)
   assert.equal(report.noCollisionGuarantee,true)
   assert.equal(report.noPhysicalTrajectoryClaim,true)
   assert.equal(report.sportingApproval,'NOT_APPROVED')
   assert.equal(report.unresolved.length,0)
   for(const gate of report.gates){
    const entries=report.bookings.filter(x=>x.gateId===gate.id)
    assert.equal(entries.length,n)
    for(const entry of entries){
     assert(entry.scheduledSeconds>=entry.earliestSeconds-1e-6)
     assert(entry.scheduledSeconds<=entry.latestSeconds+1e-6)
     const box=researchRoadEnvelopeV3(kind,entry.gateX)
     assert(entry.targetY-.3>=box.minY-1e-5)
     assert(entry.targetY+.3<=box.maxY+1e-5)
    }
    const waves=new Map()
    for(const entry of entries){
     const key=String(Math.round(entry.scheduledSeconds*1e6))
     if(!waves.has(key))waves.set(key,[])
     waves.get(key).push(entry)
    }
    for(const simultaneous of waves.values()){
     assert(simultaneous.length<=gate.capacity)
     const sorted=[...simultaneous].sort((x,y)=>x.targetY-y.targetY)
     for(let k=1;k<sorted.length;k++)
      assert(sorted[k].targetY-sorted[k-1].targetY>.8000,
       'A77 double-booked same lateral corridor')
    }
   }
  }
  for(let i=0;i<n;i++){
   const x=a.bookings.filter(q=>q.id===ordinary.states[i].id)
   const y=b.bookings.filter(q=>q.id===reflected.states[i].id)
   const z=c.bookings.filter(q=>q.id===renamed.states[i].id)
   assert.equal(x.length,2)
   for(let j=0;j<2;j++){
    assert(close(x[j].scheduledSeconds,y[j].scheduledSeconds),
     'A77 mirror changed scheduled time')
    assert(close(x[j].scheduledSeconds,z[j].scheduledSeconds),
     'A77 renamed rider changed scheduled time')
    assert(close(x[j].targetY+y[j].targetY,4.4),
     'A77 mirror changed the target corridor')
    assert(close(x[j].targetY,z[j].targetY))
   }
  }
  // A76 legacy physical policy must remain independent and fail closed
  // on five-abreast without pretending A77 windows are accepted physics.
  if(mode==='five_dense'&&kind==='double_pinch'){
   const old=createNormalStartV3(n,{...opts,
    roadMergePolicy:'platoon_gate_tail_surge'})
   assert.equal(old.roadGateStatus,'UNRESOLVED')
   const rejected=advanceNormalStartV3(old)
   assert.equal(rejected.reason,'GATE_ENTRY_NO_WINDOW')
   assert.equal(rejected.acceptedSteps,0)
  }
  evidence.push({n,mode,kind,status:a.status,
   gates:a.gates.map(g=>({x:g.gateX,widthM:g.widthM,capacity:g.capacity})),
   requiredBookings:a.expectedCount,bookedCount:a.bookedCount,
   oldPhysicalControllerUnchanged:true,officialWrites:0})
 }
}
// Impossible availability and malformed input must not create approvals.
const baseline=createNormalStartV3(32,{mode:'five_dense',
 roadGeometry:'strong_pinch',bodyHalfWidthM:.3}).states
const tooSoon=auditMultiGateAdmissionV3(baseline,'strong_pinch',{
 deadlineSeconds:5})
assert.equal(tooSoon.status,'UNRESOLVED')
assert(tooSoon.bookedCount<32)
assert(tooSoon.unresolved.some(x=>x.reason==='NO_REACHABLE_SLOT_WINDOW'))
const invalid=structuredClone(baseline)
invalid[0].y=0
const invalidReport=auditMultiGateAdmissionV3(invalid,'strong_pinch')
assert.equal(invalidReport.status,'INVALID_START_BODY')
assert.equal(invalidReport.bookings.length,0)
const duplicate=structuredClone(baseline)
duplicate[1].id=duplicate[0].id
assert.throws(()=>auditMultiGateAdmissionV3(duplicate,'strong_pinch'))
const report={study:'A2_STEP77_GEOMETRIC_MULTI_GATE_ADMISSION_SCREEN',
 technicalGate:'PASS',sportingGate:'NO_GO',screenOnly:true,
 necessaryNotSufficient:true,fullBodyPhysicsNotYetAdapted:true,
 gateShapes:expected,evidence,
 negativeControls:{unreachableDeadline:'UNRESOLVED',
  invalidBody:'INVALID_START_BODY',duplicateId:'REJECTED'},
 preservedA76LivePolicy:true,officialWrites:0}
const dir=process.env.V3_A2_STEP77_DIR??'/tmp/a2-step77'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step77-multi-gate-feasibility.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 checks:evidence.length,bookingCounts:evidence.map(e=>e.bookedCount),
 negativeControls:report.negativeControls,sportingGate:'NO_GO',officialWrites:0}))
