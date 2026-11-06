/** Offline V4 historical outcome comparison worker.
 * The caller injects the same calibrated physical transform used by
 * runIsolatedShadowV4. All raw rider data stays inside this child process.
 */
import {readFileSync} from 'node:fs'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {runRaceEngine,classifyUniversalReplaySynchronizationForPublication}
 from '../universal-race-engine/runRaceEngine.ts'
import {classifyV4IsolatedShadow} from '../../scripts/v4/isolatedShadowGateV4.mjs'
import {comparePrivateV4WithOfficial}
 from '../../scripts/v4/privateRealVsOfficialCompareV4.mjs'

function main(){
 try{
  const bytes=readFileSync(0)
  if(bytes.length<30||bytes.length>18*1024*1024)throw Error('BAD_SIZE')
  const envelope=JSON.parse(bytes.toString('utf8'))
  if(!envelope?.input?.stage?.stageId||!envelope?.options?.lock||
     !Array.isArray(envelope.options?.teamControl)||
     !envelope.reference||envelope.reference.stageId!==envelope.input.stage.stageId)
   throw Error('BAD_ENVELOPE')
  const planned=prepareV4ShadowRace(envelope.input,envelope.options)
  if(planned.status!=='ai_prepared'||planned.aiTeams!==18||
     planned.humanTeams!==0||planned.combinedInput.riders.length!==108)
   throw Error('BAD_PLAN')
  const result=runRaceEngine(planned.combinedInput)
  const gate=classifyUniversalReplaySynchronizationForPublication(
   result.replaySynchronization)
  const shadow=classifyV4IsolatedShadow({plan:planned,result,gate})
  if(shadow.status!=='SHADOW_STRICT_REPLAY_PASS'||shadow.replayQuality!=='full')
   throw Error('STRICT_REPLAY_FAILED')
  const compared=comparePrivateV4WithOfficial(envelope.reference,result)
  process.stdout.write('V4_COMPARISON_REPORT '+JSON.stringify(compared)+'\n')
 }catch{
  // No raw exception, credentials, names, IDs, gaps or input are emitted.
  process.stdout.write('V4_COMPARISON_REJECTED\n')
  process.exitCode=1
 }
}
main()
