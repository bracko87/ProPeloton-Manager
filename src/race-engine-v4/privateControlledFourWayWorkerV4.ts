/**
 * Single isolated child for the four-factor historical race experiment.
 * Both engine variants share exactly one reconstructed source and seed;
 * only AI commands and V4 physical source transforms differ.
 * The child never exports IDs, raw inputs, stage tactics or replay timelines.
 */
import {readFileSync} from 'node:fs'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {runRaceEngine as runBaseline,
 classifyUniversalReplaySynchronizationForPublication}
 from '../universal-race-engine/runRaceEngine.ts'
// Resolved ONLY by the offline runner's esbuild plugin. Never in production.
import {runRaceEngine as runCalibratedV4}
 from 'ppm-v4-calibrated-physical'
import {classifyV4IsolatedShadow}
 from '../../scripts/v4/isolatedShadowGateV4.mjs'
import {comparePrivateV4WithOfficial}
 from '../../scripts/v4/privateRealVsOfficialCompareV4.mjs'
import {summarizeControlledFourWayV4}
 from '../../scripts/v4/privateControlledFourWayDiagnosticsV4.mjs'

function main(){
 try{
  const bytes=readFileSync(0)
  if(bytes.length<30||bytes.length>18*1024*1024)throw Error('BAD_SIZE')
  const envelope=JSON.parse(bytes.toString('utf8'))
  const {input,options,reference}=envelope
  if(!input?.stage?.stageId||!input?.engine?.deterministicSeed||
     input.stage.stageId!==reference?.stageId||
     input.race?.raceId!==reference?.raceId||
     options?.lock?.stageId!==input.stage.stageId||
     !Array.isArray(options.teamControl)||
     !Array.isArray(reference.officialRows)||reference.officialRows.length!==108)
   throw Error('BAD_ENVELOPE')
  const planned=prepareV4ShadowRace(input,options)
  if(planned.status!=='ai_prepared'||planned.aiTeams!==18||
     planned.humanTeams!==0||planned.combinedInput.riders.length!==108||
     planned.combinedInput.engine?.deterministicSeed!==input.engine.deterministicSeed)
   throw Error('BAD_PLAN')
  const validate=(result,variantInput)=>{
   const gate=classifyUniversalReplaySynchronizationForPublication(
    result.replaySynchronization)
   const shadow=classifyV4IsolatedShadow({
    plan:{...planned,combinedInput:variantInput},result,gate
   })
   if(shadow.status!=='SHADOW_STRICT_REPLAY_PASS'||shadow.replayQuality!=='full')
    throw Error('STRICT_REPLAY_FAILED')
   return result
  }
  const original=input,alternative=planned.combinedInput
  const baselineOriginal=validate(runBaseline(structuredClone(original)),original)
  const baselineV4Tactics=validate(runBaseline(structuredClone(alternative)),alternative)
  const v4Original=validate(runCalibratedV4(structuredClone(original)),original)
  const v4V4Tactics=validate(runCalibratedV4(structuredClone(alternative)),alternative)
  const report=summarizeControlledFourWayV4({
   reference,planned,baselineOriginal,baselineV4Tactics,
   v4Original,v4V4Tactics,compareWithOfficial:comparePrivateV4WithOfficial
  })
  process.stdout.write('V4_FOUR_WAY_REPORT '+JSON.stringify(report)+'\n')
 }catch{
  // No private exception message may reach stdout/stderr.
  process.stdout.write('V4_FOUR_WAY_REJECTED\n')
  process.exitCode=1
 }
}
main()
