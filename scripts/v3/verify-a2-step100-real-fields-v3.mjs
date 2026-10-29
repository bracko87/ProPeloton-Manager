/** Step100 original A64 INITIAL geometry; necessary occupancy lattice only.
 * This must never be interpreted as a 180s full physical completion.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {step100TimeExpandedOccupancyV3} from './a2Step100TimeExpandedOccupancyV3.mjs';
const rows=[];
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
  const initial=step97BuildGlobalTimetableProbeV3(n,{
    roadGeometry,pacePolicy:'persistent_global_strict_v1',
    rollingStartSpeedMps:9,spacingSeconds:.35}).initial;
  const original=JSON.stringify(initial);
  const result=step100TimeExpandedOccupancyV3(
    initial.physical.states,initial.admission.gates,
    initial.admission.bookings);
  assert.equal(JSON.stringify(initial),original);
  assert.equal(result.officialWrites,0);
  assert.equal(result.noA64PhysicalWitness,true);
  assert.equal(result.doesNotProveContinuousOccupancy,true);
  assert(result.appointmentCount<=2*n);
  assert.equal(result.gateSummary.length,2);
  assert.equal(result.appointments.length,result.appointmentCount);
  rows.push({n,roadGeometry,status:result.status,
    assigned:result.appointmentCount,required:2*n,
    unresolved:result.unresolved.length,
    firstFailure:result.unresolved[0]??null,
    pairTimeConstraintWarnings:result.metrics.potentialSweptPairTimeConstraints,
    globallyInteractingPairs:result.metrics.potentiallyInteractingPairs,
    mirrorNeutralDualLaneReservations:result.metrics.symmetricUnresolvedGateChoices,
    timeExpandedRiderCells:result.metrics.timeExpandedRiderCells,
    gates:result.gateSummary,
    a64VerifiedAcceptedSeconds:null,
    full180SportingCompleted:false});
}
const report={study:'A100_ORIGINAL_A64_INITIAL_106_168_TWO_GATE_LATTICE',
resultMeaning:'necessary discrete scheduling screen, not physical trajectories',
actualOriginalA64NewControllerTests:0,
previousStep99LargeSportingCompletions:0,
originalPhysicalSolverUnmodified:true,officialWrites:0,rows};
const dir=process.env.V3_A2_STEP100_DIR??'/tmp/a100';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step100-time-expanded-screen.json',
  JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
