/** A2 offline-only sustained synchronous micro study; never used in live racing. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeSimultaneousMicroV3 as init,advanceSimultaneousMicroV3 as next} from './simultaneousTargetedMicroV3.mjs'
import {continuousBicycleCollisionV3 as collides} from './continuousLateralResearchV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const count=Number(process.env.V3_A2_STRESS_RIDERS??12),dir=process.env.V3_A2_TARGETED_DIR??'/tmp/v3-a2-targeted'
assert([12,24,32].includes(count))
mkdirSync(dir,{recursive:true})
const geometry=BATCH40_GEOMETRIES[1],g=validateRoadScenarioV3(geometry),r6=v=>Math.round(v*1e6)/1e6
const variants=['dense_follow','passing_corridors','merge_pressure','separate_packs']
const number=id=>Number(id.slice(1)),sort=rows=>rows.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
function roster(mode){
 return Array.from({length:count},(_,i)=>{
  const separate=mode==='separate_packs',half=i<count/2
  const row=separate?Math.floor((i%(count/2))/4):Math.floor(i/(mode==='passing_corridors'?2:4))
  return {riderId:'r'+String(i).padStart(3,'0'),meters:r6((separate?(half?10000:500):900)-2.4*row),y:mode==='passing_corridors'?2*(i%2):i%4,speedMps:4,cpWatts:205+(i*17)%90,wPrimeJoules:18000}
 })
}
function intents(state,mode){
 return state.riders.map(r=>{
  const i=number(r.riderId),phase=state.tick%20
  let distance=43+(i*7)%24,y=r.y
  if(mode==='passing_corridors'){
   distance=38+(i*13)%38
   if(i%6===2||i%6===3)y=i%2===0?1:3
  }
  if(mode==='merge_pressure'){
   distance=45+(i*11)%24
   if(i%4===0)y=Math.min(3,Math.max(0,r.y+(phase<10?.4:-.4)))
   if(i%4===2)y=Math.min(3,Math.max(0,r.y+(phase<10?-.4:.4)))
  }
  if(mode==='separate_packs')distance=41+(i*3)%24
  return {riderId:r.riderId,forwardMeters:distance,targetY:r6(y)}
 })
}
function checkPaths(before,after){
 const prior=new Map(before.map(r=>[r.riderId,r]))
 const p=after.map(r=>({riderId:r.riderId,x0:prior.get(r.riderId).meters,x1:r.meters,y0:prior.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)assert(!collides(p[i],p[j],{longitudinal:1.8,lateral:g.lateralCollisionM}),'Swept collision '+p[i].riderId+' '+p[j].riderId)
}
function crossings(before,after){
 const prior=new Map(before.map(r=>[r.riderId,r]));let events=0
 for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
  const a=after[i],b=after[j],old=prior.get(a.riderId).meters-prior.get(b.riderId).meters,now=a.meters-b.meters
  if((old>.05&&now<-.05)||(old<-.05&&now>.05))events++
 }
 return events
}
function independence(){
 const rs=roster('separate_packs')
 let all=init({riders:rs,geometry}),a=init({riders:rs.slice(0,count/2),geometry}),b=init({riders:rs.slice(count/2),geometry})
 for(let t=0;t<12;t++){
  all=next(all,intents(all,'separate_packs'))
  a=next(a,intents(a,'separate_packs'))
  b=next(b,intents(b,'separate_packs'))
  assert.deepEqual(sort(all.riders),sort([...a.riders,...b.riders]),'Distant packs interfere')
 }
 return true
}
const outcomes=[]
for(const mode of variants){
 let state=init({riders:roster(mode),geometry}),checkpoint=null
 let passes=0,lateral=0,halts=0,activeTicks=0,minRatio=1
 for(let i=0;i<90;i++){
  const before=state.riders,requests=intents(state,mode),after=next(state,requests)
  checkPaths(before,after.riders);passes+=crossings(before,after.riders)
  const old=new Map(before.map(r=>[r.riderId,r]))
  for(const r of after.riders){
   const prev=old.get(r.riderId),d=r.meters-prev.meters
   lateral+=Math.abs(r.y-prev.y)
   if(d<.5&&requests.find(x=>x.riderId===r.riderId).forwardMeters>10)halts+=10
   if(d>.5)activeTicks++
  }
  const asked=after.metrics.requestedMeters-state.metrics.requestedMeters,done=after.metrics.achievedMeters-state.metrics.achievedMeters
  if(asked>1e-5)minRatio=Math.min(minRatio,done/asked)
  assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5)
  assert(after.riders.every(r=>Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
  state=after
  if(i===44)checkpoint=JSON.parse(JSON.stringify(state))
 }
 let resumed=checkpoint
 for(let i=45;i<90;i++)resumed=next(resumed,intents(resumed,mode))
 assert.deepEqual(resumed,state,'Serialized 45-tick replay mismatch')
 const original=init({riders:roster(mode),geometry}),reverse=init({riders:roster(mode).reverse(),geometry})
 assert.deepEqual(sort(next(original,intents(original,mode)).riders),sort(next(reverse,intents(reverse,mode)).riders),'Input order changed resolved motion')
 const ratio=state.metrics.achievedMeters/state.metrics.requestedMeters,issues=[]
 if(ratio<.5)issues.push('SEVERE_COLLECTIVE_SLOWING')
 if(mode==='passing_corridors'&&passes===0)issues.push('NO_CONFIRMED_OVERTAKES')
 if(['passing_corridors','merge_pressure'].includes(mode)&&lateral<2)issues.push('SUPPRESSED_LATERAL_MOTION')
 if(halts>count*900*.2)issues.push('EXCESSIVE_HALTED_SECONDS')
 const out={policy:'targeted_single_yield',size:count,scenario:mode,seconds:900,technical:'PASS',sporting:issues.length?'NO_GO':'UNPROVEN',fulfilmentPercent:r6(100*ratio),worstTickFulfilmentPercent:r6(100*minRatio),blockedDecisionSharePercent:r6(100*state.metrics.blockedRiderTicks/(count*90)),haltedRiderSeconds:halts,lateralMeters:r6(lateral),longitudinalPairCrossings:passes,movingRiderTickSharePercent:r6(100*activeTicks/(count*90)),conflictPairs:state.metrics.collisionPairsDetected,conflictIterations:state.metrics.conflictIterations,targetedYieldDecisions:state.metrics.targetedYieldDecisions??0,symmetricFallbackEdges:state.metrics.symmetricFallbackEdges??0,largestFirstConflictComponent:state.metrics.largestFirstConflictComponent??0,mechanicalWorkJ:r6(state.metrics.mechanicalJ),checkpointExact:true,permutationExact:true,issues}
 outcomes.push(out);console.log(JSON.stringify(out))
}
const independent=independence()
const report={study:'A2_TARGETED_YIELD_SUSTAINED_MICRO',size:count,scenarios:outcomes,independentPacks:true,technicalGate:'PASS',sportingApproval:'NOT_APPROVED',officialWrites:0,limitations:['90 scripted synthetic ticks, not full-stage racing','A stable rank may mean suppressed overtaking rather than authentic racing','No verified road widths, elevations, full stage groups or team tactics','No gameplay integration or production race writes']}
writeFileSync(dir+'/sustained-'+count+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({size:count,technicalGate:'PASS',independentPacks:independent,flags:outcomes.map(x=>({scenario:x.scenario,issues:x.issues})),sportingApproval:'NOT_APPROVED',officialWrites:0}))
