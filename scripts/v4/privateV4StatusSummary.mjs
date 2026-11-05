/**
 * Minimal console display of the private historical worker's already-redacted
 * compact summary. No raw rider/checkpoint/group data enters this script.
 * Example: node scripts/v4/privateHistoricalPgV4.mjs | node scripts/v4/privateV4StatusSummary.mjs
 */
import {readFileSync} from 'node:fs'
const marker='V4_PRIVATE_PG_COMPACT_SUMMARY '
const lines=readFileSync(0,'utf8').split(/\r?\n/)
const line=lines.findLast(row=>row.startsWith(marker))
if(!line){
 // A failed physics worker has no compact summary. Surface the launcher
 // error's already-allowlisted fields, never raw stderr or archived inputs.
 const errorMarker='V4_PRIVATE_PG_HISTORICAL_PILOT_REJECTED '
 const failure=lines.findLast(row=>row.startsWith(errorMarker))
 if(failure){
  try{
   const parsed=JSON.parse(failure.slice(errorMarker.length))
   const enums={
    phase:['CONFIGURATION','CONNECT','VERIFY_LOGIN_IDENTITY',
     'ACTIVATE_RESTRICTED_ROLE','VERIFY_RESEARCH_ROLE','READ_METADATA',
     'READ_AND_VALIDATE_EXPORTS','METADATA_READY','EXPORTS_READY','PHYSICS_START'],
    physicsStep:['BUNDLE','WORKER'],
    physicsVariant:['preserved_v2','combined','combined_energy',
     'combined_energy_priority','private_replay_candidate'],
    childFailure:['TIMEOUT','SPAWN_ERROR','WORKER_INPUT_REJECTED',
     'WORKER_NONZERO_EXIT','WORKER_SUMMARY_MISSING'],
    buildFailureClass:['MODULE_RESOLUTION','SOURCE_SYNTAX',
     'IMPORT_EXPORT_MISMATCH','OTHER_BUILD_FAILURE']
   }
   const clean={}
   for(const [key,values] of Object.entries(enums))
    clean[key]=values.includes(parsed[key])?parsed[key]:null
   clean.reason=typeof parsed.reason==='string'&&
    /^[A-Z_]+$/.test(parsed.reason)?parsed.reason:null
   console.log('V4_RESEARCH_FAILURE '+JSON.stringify(clean))
  }catch{
   console.error('V4_RESEARCH_FAILURE_UNREADABLE')
  }
 }else{
  const lastProgress=lines.filter(row=>row.startsWith('V4_PRIVATE_PG_PROGRESS ')).at(-1)
  let phase='UNKNOWN'
  try{phase=JSON.parse(lastProgress?.slice('V4_PRIVATE_PG_PROGRESS '.length)??'{}').phase??'UNKNOWN'}
  catch{}
  console.error('V4_RESEARCH_NO_COMPLETE_SUMMARY '+JSON.stringify({
   lastPhase:['PHYSICS_START','EXPORTS_READY','METADATA_READY'].includes(phase)?
    phase:'UNKNOWN'
  }))
 }
 process.exitCode=1
}else{
 try{
  const summary=JSON.parse(line.slice(marker.length))
  const probe=summary.replayRepairCandidate?.physicalProbe??{}
  // Histogram keys are already fixed privacy-safe categories; hide the
  // zero-value keys so the operator sees only outcomes that occurred.
  const positive=counts=>Object.fromEntries(Object.entries(counts??{})
   .filter(([,count])=>Number.isSafeInteger(count)&&count>0))
  const obj={
   status:summary.status,
   testsAttempted:summary.replayRepairCandidate?.attempted??null,
   strictReplayValid:summary.replayRepairCandidate?.strictReplayValid??null,
   remainingInvalid:summary.replayRepairCandidate?.remainingInvalid??null,
   remainingUnsupported:summary.replayRepairCandidate?.remainingUnsupported??null,
   newPairStatus:positive(probe.baseSourceResidualDnfPairStatus),
   newPairFirst:positive(probe.baseSourceResidualDnfPairFirst),
   newPairSecond:positive(probe.baseSourceResidualDnfPairSecond),
   newPairStrictIssues:positive(probe.baseSourceResidualDnfPairStrictIssues),
   newPairStrictResidual:Object.fromEntries(Object.entries(
     probe.baseSourceResidualDnfPairStrictResidual??{}
   ).map(([category,counts])=>[category,positive(counts)])),
   precedingExactPrevious:positive(probe.baseSourceResidualPrePairExactPrevious),
   precedingExactCurrent:positive(probe.baseSourceResidualPrePairExactCurrent),
   precedingExactCombined:positive(probe.baseSourceResidualPrePairExactCombined),
   repairStatus:positive(probe.baseSourceResidualRepair),
   officialWrites:summary.officialWrites
  }
  console.log('V4_RESEARCH_SHORT_SUMMARY '+JSON.stringify(obj))
 }catch{
  console.error('V4_COMPACT_SUMMARY_INVALID')
  process.exitCode=1
 }
}
