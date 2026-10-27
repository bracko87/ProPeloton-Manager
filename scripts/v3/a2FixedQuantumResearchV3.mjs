/** A42 offline-only independent physical quantum vs reporting cadence.
 * This is NOT a converged integrator or a change to accepted game races.
 * The accepted swept track retains ALL actual microstep knots.
 * A requested 2/2.5/5-second reporting interval must NEVER replace
 * the physical 0.5s/1s track with unchecked endpoint chords.
 */
import {initializeSubstepPhysicalResearchV3,advanceSubstepPhysicalResearchV3} from './a2SubstepPhysicalResearchV3.mjs'
const check=(v,m)=>{if(!v)throw Error(m)}
export function initializeFixedQuantumResearchV3({riders,geometry,road={gradePercent:0},
 physicalQuantumSeconds=1,reportingIntervalSeconds=2.5}={}){
 check([.5,1].includes(physicalQuantumSeconds),'Invalid A42 fixed physical quantum')
 check([2,2.5,5].includes(reportingIntervalSeconds),'Invalid A42 reporting cadence')
 const physicalSubsteps=10/physicalQuantumSeconds
 const source=initializeSubstepPhysicalResearchV3({
  riders,geometry,road,substeps:physicalSubsteps,tickSeconds:10,
  conflictPolicy:'symmetric_halving'})
 return view(source,{physicalQuantumSeconds,reportingIntervalSeconds})
}
function view(source,configuration){
 check(source.gate==='A34_OFFLINE_SUBSTEP_ONLY'&&source.officialWrites===0&&
  source.sportingApproval==='NOT_APPROVED','A42 unsafe source metadata')
 check(source.substeps===10/configuration.physicalQuantumSeconds,
  'A42 physical time grid drifted from checkpoint')
 return {
  gate:'A42_FIXED_QUANTUM_OFFLINE_ONLY',version:1,
  physicalQuantumSeconds:configuration.physicalQuantumSeconds,
  reportingIntervalSeconds:configuration.reportingIntervalSeconds,
  // Reporting cadence is metadata only. The physical knots are not
  // resampled and the parent solver sees immutable 10-second intents.
  source,
  riders:source.riders,
  tick:source.tick,elapsedSeconds:source.elapsedSeconds,
  metrics:source.metrics,lastTickTracks:source.lastTickTracks,
  officialWrites:0,sportingApproval:'NOT_APPROVED'
 }
}
export function advanceFixedQuantumResearchV3(checkpoint,intents){
 check(checkpoint?.version===1&&checkpoint.gate==='A42_FIXED_QUANTUM_OFFLINE_ONLY'&&
  checkpoint.source?.gate==='A34_OFFLINE_SUBSTEP_ONLY'&&
  checkpoint.officialWrites===0&&checkpoint.sportingApproval==='NOT_APPROVED',
  'Invalid A42 fixed physical quantum checkpoint')
 const physicalQuantumSeconds=checkpoint.physicalQuantumSeconds
 const reportingIntervalSeconds=checkpoint.reportingIntervalSeconds
 check([.5,1].includes(physicalQuantumSeconds)&&[2,2.5,5].includes(reportingIntervalSeconds),
  'A42 checkpoint physical or report grid missing')
 const accepted=advanceSubstepPhysicalResearchV3(checkpoint.source,intents)
 return view(accepted,{physicalQuantumSeconds,reportingIntervalSeconds})
}
