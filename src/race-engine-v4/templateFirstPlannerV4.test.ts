import assert from 'node:assert/strict'
import {prepareV4ShadowRace,V4_CATALOGS,V4_VERSION} from './templateFirstPlannerV4.ts'

for(const terrain of ['flat','hilly','mountain','cobbled']){
 const catalog=V4_CATALOGS[terrain]
 assert.equal(catalog.length,20)
 assert.equal(new Set(catalog.map(t=>t.id)).size,20)
}
const make=(terrain='flat',kinds=Array.from({length:16},(_,i)=>i<8?'human':'ai'))=>{
 const stagePlans=kinds.map((_,i)=>({
  teamId:'team-'+i,teamTactic:'balanced',locked:true,defaulted:false,
  riders:Array.from({length:6},(_,j)=>({
   riderId:'r-'+i+'-'+j,stageRole:'free_role',
   commands:{
    phase1:i===0&&j===0?'join_breakaway':'follow_team_plan',
    phase2:i===1&&j===1?'chase_breakaway':'follow_team_plan',
    phase3:'follow_team_plan',phase4:'follow_team_plan'}
  }))
 }))
 return {input:{
  race:{raceId:'race-a',raceType:'stage_race',stageCount:6},
  stage:{stageId:'stage-a',stageFormat:'road_race',terrainType:terrain,
    distanceKm:160,elevationGainM:terrain==='mountain'?3200:250,
    summitFinish:terrain==='mountain'},
  teams:kinds.map((_,i)=>({teamId:'team-'+i,snapshot:{metadata:{}}})),
  stagePlans,riders:stagePlans.flatMap(p=>p.riders.map(r=>({riderId:r.riderId}))),
 },options:{
  lock:{stageId:'stage-a',snapshotId:'locked-snapshot-001',
   snapshotStatus:'locked',stageStartGameTs:'2000-06-01T09:00:00.000Z',
   lockCutoffGameTs:'2000-06-01T06:00:00.000Z',
   snapshotGameTs:'2000-06-01T06:00:00.000Z'},
  teamControl:kinds.map((kind,i)=>({teamId:'team-'+i,kind})),
  gameDate:'2000-06-01',crosswindRisk:.25,descentRisk:.25,rainRisk:.10
 }}
}
const results=[]
for(const terrain of ['flat','hilly','mountain','cobbled']){
 const fixture=make(terrain),initial=JSON.stringify(fixture)
 const plan=prepareV4ShadowRace(fixture.input,fixture.options)
 assert.equal(plan.version,V4_VERSION)
 assert.equal(plan.status,'ai_prepared')
 assert(plan.selectedTemplate)
 assert.equal(plan.selectedTemplate.catalogSize,20)
 assert(plan.selectedTemplate.id.startsWith(terrain+'_'))
 assert.equal(plan.selectedTemplate.targetsAreNotGuaranteed,true)
 assert.equal(plan.calculationCount,0)
 assert.equal(plan.productionWrites,0)
 assert.equal(plan.v2EngineInvoked,false)
 assert.equal(plan.aiTeams,8)
 assert.equal(plan.humanTeams,8)
 assert(plan.intents.length>0)
 assert(plan.intents.every(x=>Number(x.teamId.split('-')[1])>=8))
 assert.equal(JSON.stringify(fixture),initial,'immutable source input')
 for(let i=0;i<8;i++){
  assert.strictEqual(plan.combinedInput.stagePlans[i],fixture.input.stagePlans[i])
  assert.deepEqual(plan.combinedInput.stagePlans[i].riders,fixture.input.stagePlans[i].riders)
 }
 const human=plan.combinedInput.stagePlans[0].riders[0].commands.phase1
 const aiAttack=plan.intents.find(x=>x.command==='join_breakaway'&&x.phase===1)
 assert.equal(human,'join_breakaway')
 assert(aiAttack,'AI and human must be able to attack during same phase')
 assert.deepEqual(prepareV4ShadowRace(fixture.input,fixture.options),plan)
 const history=[{raceId:'race-a',gameDate:'2000-06-01',
  templateId:plan.selectedTemplate.id,family:plan.selectedTemplate.family}]
 const changed=prepareV4ShadowRace(fixture.input,{...fixture.options,history})
 assert.notEqual(changed.selectedTemplate?.id,plan.selectedTemplate.id,
  'avoid repeating template in same multi-stage race')
 const result={terrain,selected:plan.selectedTemplate.id,
  aiIntents:plan.intents.length,aiTeams:plan.aiTeams,humanTeams:plan.humanTeams}
 console.log('V4_TERRAIN_FIRST '+JSON.stringify(result))
 results.push(result)
}
const humanOnly=make('flat',Array(16).fill('human'))
for(const p of humanOnly.input.stagePlans)
 for(const r of p.riders)
  r.commands={phase1:'follow_team_plan',phase2:'follow_team_plan',
   phase3:'follow_team_plan',phase4:'follow_team_plan'}
const neutral=prepareV4ShadowRace(humanOnly.input,humanOnly.options)
assert.equal(neutral.status,'neutral_all_human')
assert.equal(neutral.selectedTemplate,null)
assert.deepEqual(neutral.intents,[])
assert.strictEqual(neutral.combinedInput,humanOnly.input)
const aiOnly=make('flat',Array(16).fill('ai'))
assert.equal(prepareV4ShadowRace(aiOnly.input,aiOnly.options).aiTeams,16)
const early=make()
early.options.lock.snapshotGameTs='2000-06-01T05:59:59Z'
assert.throws(()=>prepareV4ShadowRace(early.input,early.options),/locked stage/)
const duplicate=make()
duplicate.options.teamControl.pop()
assert.throws(()=>prepareV4ShadowRace(duplicate.input,duplicate.options),/ownership/)
const noSnapshot=make()
noSnapshot.options.lock.snapshotId=''
assert.throws(()=>prepareV4ShadowRace(noSnapshot.input,noSnapshot.options),/locked stage/)
const timeTrial=make('flat',Array(16).fill('ai'))
timeTrial.input.stage.stageFormat='team_time_trial'
const unsupported=prepareV4ShadowRace(timeTrial.input,timeTrial.options)
assert.equal(unsupported.status,'unsupported_stage')
assert.strictEqual(unsupported.combinedInput,timeTrial.input)
console.log('V4_TEMPLATE_FIRST_REPORT '+JSON.stringify({
 passed:true,templateCount:Object.values(V4_CATALOGS).reduce((s,x)=>s+x.length,0),
 terrainTests:results.length,allHumanNeutral:true,allAiSupported:true,
 humanAndAiParallelInstructions:true,originalCommandsUnchanged:true,
 validThreeHourLockRequired:true,deterministic:true,
 avoidsReusingTemplate:true,solverNotInvoked:true,resultsNotPublished:true,
 physicalGroupMergeNotYetTested:true,results
}))
