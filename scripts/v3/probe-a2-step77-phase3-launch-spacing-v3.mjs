/** A77 phase 3: true five-abreast launch headway experiment.
 * All grid positions are declared before the first physics tick;
 * changes NEVER edit an already accepted state or widen the road.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,multiGatePhysicalMetricsV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const outcomes=[]
for(const spacing of [5.2,6.5,8,10]){
 for(const n of [106,168]){
  for(const geometry of ['double_pinch','staged_pinch']){
   for(const speed of [null,9]){
    const base={mode:'five_dense',headwayStandOffM:4.5,
     controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only',
     pacePolicy:'timed_safe_corridor',roadGeometry:geometry,
     startRowSpacingM:spacing,rollingStartSpeedMps:speed}
    const start=createMultiGatePhysicalCandidateV3(n,base)
    assert.equal(start.admission.status,'NECESSARY_WINDOWS_EXIST')
    assert.equal(start.admission.bookedCount,n*2)
    const columns=start.physical.states.slice(0,5)
    assert.deepEqual(columns.map(s=>s.y),[.3,1.25,2.2,3.15,4.1])
    assert(columns.every(s=>s.x===600))
    const frontRider=start.physical.states[5]
    assert(Math.abs(frontRider.x-(600-spacing))<1e-6)
    const end=runMultiGatePhysicalCandidateV3(start,{seconds:180})
    const m=multiGatePhysicalMetricsV3(start,end)
    assert.equal(end.officialWrites,0)
    assert(end.physical.at<=180)
    assert(end.physical.states.every(s=>s.v>=0&&
     s.energy.remainingWPrimeJoules>=0&&
     Math.abs(s.energy.seconds-end.physical.at)<1e-6))
    assert(m.status==='FULL_HORIZON_CLEAR'||end.reason)
    outcomes.push({n,geometry,startRowSpacingM:spacing,
     neutralStartMps:speed,seconds:m.acceptedSeconds,
     status:m.status,roadExit:m.firstRoadViolation?.riderId??null,
     contact:m.firstCollision?.pair??null,nearStopTicks:m.nearStops,
     completedLaneChanges:m.laneChanges,rearX:m.rearX,
     allPastSecondReopening:m.allPastSecondReopening})
   }
  }
 }
}
const report={study:'A77_PHASE3_FIVE_ABREAST_LAUNCH_SPACING',
 sportingApproval:'NOT_APPROVED',physicsBypassed:false,
 noContactRepair:true,officialWrites:0,outcomes}
const dir=process.env.V3_A2_STEP77_PHASE3_DIR??'/tmp/a77-phase3'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase3-launch-spacing.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
