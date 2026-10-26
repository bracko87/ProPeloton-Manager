/** Batch 29 OFFLINE multi-grid A/B: bounded early lane preparation vs unchanged coupled V3. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {advanceEarlyFormationResearchV3} from './earlyFormationResearchV3.mjs'
import {compareGridExperimentsV3,checkNeutralGridV3} from './gridRobustnessV3.mjs'
import {compareFinishOrderV3,measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH29_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH29_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
assert(['energy','combined'].includes(mode))
const dest=process.env.V3_BATCH29_OUT_DIR??'/tmp/v3-batch29';mkdirSync(dest,{recursive:true})
const round6=x=>Math.round(x*1e6)/1e6
const fixtureData=batch26Input(fixture),flag=mode==='combined'?{experimentalPowerDurationEnergy:true,experimentalAnticipatoryLaneMoves:true,experimentalPathDraftWork:true,experimentalBottleneckTelemetry:true}:{experimentalPowerDurationEnergy:true}
const seeds=[fixtureData.seed,'batch28-research-grid-A','batch28-research-grid-B',fixtureData.seed]
const labels=['original_grid','reshuffle_A','reshuffle_B','middle_row_swap']
const totalKm=fixtureData.route.reduce((n,r)=>n+r.lengthKm,0)
function swapMiddleRow(state){
 const s=[...state.riders].sort((a,b)=>a.meters-b.meters||a.lane-b.lane)
 const meters=s[Math.floor(s.length/2)].meters
 const row=s.filter(x=>Math.abs(x.meters-meters)<1e-8).sort((a,b)=>a.lane-b.lane)
 assert(row.length>=2&&row[0].lane!==row[1].lane,'Unswappable research grid')
 const x=row[0],y=row[1],lane=x.lane
 x.lane=y.lane;y.lane=lane
 assert(!state.riders.some((a,i)=>state.riders.slice(i+1).some(b=>a.lane===b.lane&&Math.abs(a.meters-b.meters)<1.8-1e-5)),'Overlapping initial grid')
}
function inputFor(seed,wind){return {...fixtureData,...flag,seed,route:wind?fixtureData.route.map(r=>({...r,headwindMps:3,crosswindMps:2})):fixtureData.route}}
function run(input,kind,swap){
 const state=initializeCoupledV3(input)
 if(swap)swapMiddleRow(state)
 const initial=state.riders.map(x=>({riderId:x.riderId,meters:x.meters,lane:x.lane}))
 const firstFive={applied:0,rejected:0,choices:[]},checkpoints=[]
 let lastShift=-9999,firstSplit=null,cycle=0
 while(!state.complete){
  const before=kind==='candidate'?state.riders.filter(r=>r.finishSeconds===null).map(r=>{
   const cmd=(input.orders??[]).filter(o=>o.riderId===r.riderId&&r.meters/1000>=o.startKm&&r.meters/1000<o.endKm).at(-1)?.tactic??'follow'
   return {riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,wheelLimitedTicks:r.wheelLimitedTicks,tactic:cmd}
  }):null
  advanceCoupledV3(input,state,1)
  if(kind==='candidate'){
   const decision=advanceEarlyFormationResearchV3(input,state,before,{lastShiftTick:lastShift,cooldownTicks:4,formationMaxKm:5})
   if(decision.rejected)firstFive.rejected++
   if(decision.applied){lastShift=state.tick;firstFive.applied++;firstFive.choices.push({tick:state.tick,km:round6(decision.choice.meters/1000),riderId:decision.choice.riderId,fromLane:decision.choice.fromLane,toLane:decision.choice.toLane})}
  }
  if(state.tick%12===0){
   const group=measurePelotonSeparationsV3(state)
   const active=state.riders.filter(r=>r.finishSeconds===null)
   const leader=active.length?Math.max(...active.map(r=>r.meters))/1000:totalKm
   if(firstSplit===null&&leader>=2&&leader<totalKm*.95&&group.gapsAboveThreshold>0&&active.length>=fixtureData.riders.length*.8)firstSplit={second:state.elapsedSeconds,leaderKm:round6(leader),groupCount:group.separateGroups}
   if(checkpoints.length<7&&leader>=(checkpoints.length+1)*2)checkpoints.push({leaderKm:round6(leader),second:state.elapsedSeconds,groups:group.separateGroups,frontToBackMeters:group.frontToBackMeters})
  }
  if(state.tick%53===0){const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(saved,state,'Invalid serialized checkpoint');Object.assign(state,saved)}
  assert(++cycle<6000,'Unbounded Batch 29 full race')
 }
 const result=finalizeCoupledV3(input,state)
 assert.equal(result.mode,'OFFLINE_RESEARCH_ONLY');assert.equal(result.sportingApproval,'NOT_APPROVED');assert.equal(result.officialWrites,0)
 assert.equal(result.finish.length,fixtureData.riders.length)
 assert(state.riders.every(r=>r.powerDurationEnergy&&r.powerDurationEnergy.remainingWPrimeJoules>=0&&r.powerDurationEnergy.remainingWPrimeJoules<=r.powerDurationEnergy.wPrimeJoules))
 return {initial,result,firstFive,firstSplit,checkpoints,ticks:cycle}
}
function scenario(seed,label,swap=false,wind=false,reference=false){
 const input=inputFor(seed,wind),untreated=run(input,'baseline',swap),treated=run(input,'candidate',swap)
 if(reference&&!swap)assert.deepEqual(untreated.result,runCoupledV3(input),'Default engine drift from original frozen fixture')
 const initialCheck=checkNeutralGridV3([untreated.initial,treated.initial])
 assert.equal(initialCheck.uniqueLayouts,1,'Treated and untreated must share exact start')
 const paired=compareFinishOrderV3(untreated.result.finish,treated.result.finish)
 return {label,seed,wind,swap,untreated,treated,paired}
}
const calm=seeds.map((seed,i)=>scenario(seed,labels[i],i===3,false,i===0))
const wind=[scenario(seeds[0],'wind_original',false,true),scenario(seeds[1],'wind_seed_A',false,true)]
const reports=[{condition:'calm',cases:calm},{condition:'artificial_wind_3mps_head_2mps_cross',cases:wind}].map(({condition,cases})=>{
 const base=compareGridExperimentsV3(cases[0].untreated.result,cases.slice(1).map(c=>c.untreated.result))
 const treatment=compareGridExperimentsV3(cases[0].treated.result,cases.slice(1).map(c=>c.treated.result))
 assert(checkNeutralGridV3(cases.map(c=>c.untreated.initial)).uniqueLayouts===cases.length,'Expected distinct neutral-grid permutations')
 const pairs=cases.map(c=>({label:c.label,seed:c.seed,baselineWinner:c.untreated.result.finish[0].riderId,candidateWinner:c.treated.result.finish[0].riderId,baselineTailGapSeconds:c.untreated.result.finish.at(-1).gapSeconds,candidateTailGapSeconds:c.treated.result.finish.at(-1).gapSeconds,deltaBlockedTicks:c.treated.result.movement.wheelLimitedTicks-c.untreated.result.movement.wheelLimitedTicks,firstSplitBefore:c.untreated.firstSplit,firstSplitAfter:c.treated.firstSplit,formation:c.treated.firstFive,change:c.paired}))
 return {condition,gridBaseline:{distinctWinners:base.distinctWinners,top10AlwaysCount:base.top10AlwaysCount,medianRankRange:base.medianRankRange,maxRankRange:base.maxRankRange,transitions:base.transitions},gridTreatment:{distinctWinners:treatment.distinctWinners,top10AlwaysCount:treatment.top10AlwaysCount,medianRankRange:treatment.medianRankRange,maxRankRange:treatment.maxRankRange,transitions:treatment.transitions},pairs}
})
const output={kind:'BATCH29_OFFLINE_EARLY_FORMATION',fixture,mode,sourceQuality:'synthetic_research',officialWrites:0,sportingApproval:'NOT_APPROVED',roster:fixtureData.riders.length,formationWindowKm:5,cooldownTicks:4,scenarios:reports,limitations:['No physiological or longitudinal compensation; a single discrete lateral shift uses existing swept corridor','Synthetic grid and weather, not actual neutral rollout','Guangxi route incomplete by reported 718m ascent','Dordrecht eight sprint points mapped to tempo','One intervention heuristic and four grids cannot determine sporting realism']}
const path=dest+'/'+fixture+'-'+mode+'-early-formation.json';writeFileSync(path,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,roster:output.roster,calm:{gridBaseline:reports[0].gridBaseline,gridTreatment:reports[0].gridTreatment,pairs:reports[0].pairs.map(c=>({label:c.label,moves:c.formation.applied,rejected:c.formation.rejected,discordantShare:c.change.discordantShare,rankChanged:c.change.changedRankCount,deltaBlocking:c.deltaBlockedTicks,firstSplitBefore:c.firstSplitBefore,firstSplitAfter:c.firstSplitAfter,headToTailDifference:c.candidateTailGapSeconds-c.baselineTailGapSeconds}))},wind:{baseline:reports[1].gridBaseline.transitions.at(-1),treatment:reports[1].gridTreatment.transitions.at(-1),moves:reports[1].pairs.map(x=>x.formation.applied)},officialWrites:0,sportingApproval:'NOT_APPROVED',path}))
