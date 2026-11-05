/**
 * V4 offline execution entrypoint. Built by scripts/v4/runIsolatedShadowV4.mjs
 * with an isolated, calibrated physical solver. Never imported by live workers.
 *
 * Input is a locally supplied, complete, locked race envelope on stdin.
 * Output is categorical only. No DB clients, network calls, production
 * publication, official results, rider data, stage IDs or full issues.
 */
import {readFileSync} from 'node:fs'
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
  try{
    const raw=readFileSync(0)
    if(raw.byteLength<10||raw.byteLength>16*1024*1024)
      throw Error('PRIVATE_ENVELOPE_REJECTED')
    const envelope=JSON.parse(raw.toString('utf8')) as {
      input:LocalEnvelope[0],options:LocalEnvelope[1]
    }
    if(!envelope||typeof envelope!=='object'||!envelope.input||
       !envelope.options)throw Error('PRIVATE_ENVELOPE_REJECTED')
    const plan=prepareV4ShadowRace(envelope.input,envelope.options)
    if(plan.status==='ai_prepared'){
      const result=runRaceEngine(plan.combinedInput)
      const strict=classifyUniversalReplaySynchronizationForPublication(
        result.replaySynchronization
      )
      report=classifyV4IsolatedShadow({plan,result,gate:strict})
    }else{
      report=classifyV4IsolatedShadow({plan})
    }
  }catch{
    // Never leak input, rider or stage data, exception texts or stack traces.
    report=failure('SHADOW_EXECUTION_REJECTED')
  }
  process.stdout.write('V4_ISOLATED_SHADOW_REPORT '+JSON.stringify(report)+'\n')
  if(report.status!=='SHADOW_STRICT_REPLAY_PASS')process.exitCode=1
}
execute()
