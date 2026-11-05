/**
 * Minimal console display of the private historical worker's already-redacted
 * compact summary. No raw rider/checkpoint/group data enters this script.
 * Example: node scripts/v4/privateHistoricalPgV4.mjs | node scripts/v4/privateV4StatusSummary.mjs
 */
import {readFileSync} from 'node:fs'
const marker='V4_PRIVATE_PG_COMPACT_SUMMARY '
const lines=readFileSync(0,'utf8').split(/\\r?\\n/)
const line=lines.findLast(row=>row.startsWith(marker))
if(!line){
 console.error('V4_COMPACT_SUMMARY_MISSING')
 process.exitCode=1
}else{
 try{
  const summary=JSON.parse(line.slice(marker.length))
  const probe=summary.replayRepairCandidate?.physicalProbe??{}
  const obj={
   status:summary.status,
   testsAttempted:summary.replayRepairCandidate?.attempted??null,
   strictReplayValid:summary.replayRepairCandidate?.strictReplayValid??null,
   remainingInvalid:summary.replayRepairCandidate?.remainingInvalid??null,
   remainingUnsupported:summary.replayRepairCandidate?.remainingUnsupported??null,
   newPairStatus:probe.baseSourceResidualDnfPairStatus??null,
   newPairFirst:probe.baseSourceResidualDnfPairFirst??null,
   newPairSecond:probe.baseSourceResidualDnfPairSecond??null,
   newPairStrictIssues:probe.baseSourceResidualDnfPairStrictIssues??null,
   newPairStrictResidual:probe.baseSourceResidualDnfPairStrictResidual??null,
   repairStatus:probe.baseSourceResidualRepair??null,
   officialWrites:summary.officialWrites
  }
  console.log('V4_RESEARCH_SHORT_SUMMARY '+JSON.stringify(obj))
 }catch{
  console.error('V4_COMPACT_SUMMARY_INVALID')
  process.exitCode=1
 }
}
