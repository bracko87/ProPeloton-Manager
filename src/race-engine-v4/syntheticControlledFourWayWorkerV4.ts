/** Public synthetic 108-rider hilly four-way research comparison.
 * No historical inputs, credentials, production workers or database access.
 * Runs identical synthetic roster/seed under baseline/V4 AI and physics.
 */
import {readFileSync} from 'node:fs'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {
 runRaceEngine as baselineEngine,
 classifyUniversalReplaySynchronizationForPublication
} from '../universal-race-engine/runRaceEngine.ts'
import {runRaceEngine as v4Engine} from 'ppm-v4-calibrated-physical'
import {
 compactRaceDiagnosticsV4,pairedRaceDifferencesV4
} from '../../scripts/v4/privateControlledFourWayDiagnosticsV4.mjs'

function main(){
 const envelope=JSON.parse(readFileSync(0,'utf8'))
 if(envelope?.input?.riders?.length!==108||
    envelope.options?.teamControl?.filter((x:any)=>x.kind==='ai').length!==18)
  throw Error('SYNTHETIC_FIXTURE_UNEXPECTED')
 const base=structuredClone(envelope.input)
 // The public fixture initially comes with a V4 plan. Remove the plan to
 // make a controlled baseline, then impose explicit plausible synthetic roles.
 for(const [t,team] of base.stagePlans.entries()){
  for(const [i,rider] of team.riders.entries()){
   rider.commands={phase1:'follow_team_plan',phase2:'follow_team_plan',
    phase3:'follow_team_plan',phase4:'follow_team_plan'}
   // Four opening attackers; independent chasing teams and sprinters.
   if(t<4&&i===4)rider.commands.phase1='join_breakaway'
   if(t>=4&&t<8&&i===2){
    rider.commands.phase2='chase_breakaway'
    rider.commands.phase3='chase_breakaway'
   }
   if(t>=8&&t<12&&i===1)rider.commands.phase4='final_sprint'
  }
 }
 const plan=prepareV4ShadowRace(base,envelope.options)
 if(plan.status!=='ai_prepared'||plan.aiTeams!==18||
    plan.combinedInput.engine.deterministicSeed!==base.engine.deterministicSeed)
  throw Error('SYNTHETIC_PLAN_REJECTED')
 const scenarios={
  baselineOriginal:[baselineEngine,base],
  baselineV4Tactics:[baselineEngine,plan.combinedInput],
  v4Original:[v4Engine,base],
  v4V4Tactics:[v4Engine,plan.combinedInput]
 }
 const reports={},results={}
 for(const [name,[run,input]] of Object.entries(scenarios)){
  try{
   const result=(run as any)(structuredClone(input))
   const gate=classifyUniversalReplaySynchronizationForPublication(result.replaySynchronization)
   reports[name]={status:result.validationPassed===true&&gate.publishable===true&&
      gate.replayQuality==='full'&&gate.blockingIssues.length===0?
      'STRICT_REPLAY_PASS':'STRICT_REPLAY_BLOCKED',
    ...compactRaceDiagnosticsV4(result)}
   results[name]=result
  }catch{
   reports[name]={status:'PHYSICS_EXECUTION_REJECTED'}
  }
 }
 const effects={}
 const pairs={
  aiTacticsOnBaseline:['baselineOriginal','baselineV4Tactics'],
  v4PhysicsWithOriginalTactics:['baselineOriginal','v4Original'],
  v4PhysicsWithAiTactics:['baselineV4Tactics','v4V4Tactics'],
  aiTacticsOnV4Physics:['v4Original','v4V4Tactics']
 }
 for(const [key,[left,right]] of Object.entries(pairs)){
  effects[key]=results[left]&&results[right]?
   pairedRaceDifferencesV4(results[left],results[right]):
   {status:'UNAVAILABLE'}
 }
 const report={
  contract:'ppm.v4.public-synthetic-factorial.v1',
  status:'SYNTHETIC_FOUR_WAY_RESEARCH_COMPLETED',
  fixture:'public-synthetic-108-hilly-174-km',
  realHistoricalStage:false,productionEnabled:false,officialWrites:0,
  sameSeed:true,sameRiderSet:true,aiTeams:18,
  plannedAIIntents:plan.intents.length,
  cases:reports,isolatedEffects:effects
 }
 process.stdout.write('V4_SYNTHETIC_FOUR_WAY '+JSON.stringify(report)+'\n')
}
try{main()}catch{
 process.stdout.write('V4_SYNTHETIC_FOUR_WAY_REJECTED\n')
 process.exitCode=1
}
