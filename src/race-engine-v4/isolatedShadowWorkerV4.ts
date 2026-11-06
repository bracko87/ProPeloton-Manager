/**
 * V4 offline execution entrypoint. Built by scripts/v4/runIsolatedShadowV4.mjs
 * with an isolated, calibrated physical solver. Never imported by live workers.
 *
 * Input is a locally supplied, complete, locked race envelope on stdin.
 * Output is categorical only. No DB clients, network calls, production
 * publication, official results, rider data, stage IDs or full issues.
 */
import {readFileSync} from 'node:fs'
import {classifyV4SafeExecutionFailure,classifyV4PhysicsFailure}
 from '../../scripts/v4/isolatedShadowExecutionFailureV4.mjs'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {
  runRaceEngine,
  classifyUniversalReplaySynchronizationForPublication,
} from '../universal-race-engine/runRaceEngine.ts'
import {classifyV4IsolatedShadow,V4_ISOLATED_SHADOW_CONTRACT}
 from '../../scripts/v4/isolatedShadowGateV4.mjs'

type LocalEnvelope=Parameters<typeof prepareV4ShadowRace>
const failure=(status:string)=>({
  contract:V4_ISOLATED_SHADOW_CONTRACT,
  status,researchOnly:true,officialWrites:0,
  productionEnabled:false,replayQuality:'unavailable',
  phase:'ISOLATED_EXECUTION'
})
function execute():void{
  let report:ReturnType<typeof classifyV4IsolatedShadow>
  // Static phase names only. Never inspect or print the exception itself.
  let phase='INPUT'
  try{
    const raw=readFileSync(0)
    if(raw.byteLength<10||raw.byteLength>16*1024*1024)
      throw Error('PRIVATE_ENVELOPE_REJECTED')
    const envelope=JSON.parse(raw.toString('utf8')) as {
      input:LocalEnvelope[0],options:LocalEnvelope[1]
    }
    if(!envelope||typeof envelope!=='object'||!envelope.input||
       !envelope.input.race||!envelope.input.stage||
       !Array.isArray(envelope.input.teams)||
       !Array.isArray(envelope.input.riders)||
       !Array.isArray(envelope.input.stagePlans)||
       !envelope.options||!envelope.options.lock||
       !Array.isArray(envelope.options.teamControl))
      throw Error('PRIVATE_ENVELOPE_REJECTED')
    phase='PREPARATION'
    const plan=prepareV4ShadowRace(envelope.input,envelope.options)
    if(plan.status==='ai_prepared'){
      phase='PHYSICS'
      const result=runRaceEngine(plan.combinedInput)
      phase='REPLAY_GATE'
      const strict=classifyUniversalReplaySynchronizationForPublication(
        result.replaySynchronization
      )
      report=classifyV4IsolatedShadow({plan,result,gate:strict})
    }else{
      phase='REPLAY_GATE'
      report=classifyV4IsolatedShadow({plan})
    }
  }catch(error){
    // Only fixed categorical codes leave this worker. The caught exception,
    // its raw message, stack, private fields and rider data are never emitted.
    const code=phase==='PHYSICS'?classifyV4PhysicsFailure(error):
      classifyV4SafeExecutionFailure(phase)
    report=failure(code)
  }
  process.stdout.write('V4_ISOLATED_SHADOW_REPORT '+JSON.stringify(report)+'\n')
  if(report.status!=='SHADOW_STRICT_REPLAY_PASS')process.exitCode=1
}
execute()
