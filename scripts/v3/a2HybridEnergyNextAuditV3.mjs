/** A54 isolated, research-only hybrid energy/next-contact shadow transition.
 * Never used by live game/races, never mutates a source checkpoint.
 * A53 only certifies a single swept path. Energy/velocity/next motion are
 * independently recomputed here using existing A34 physical bookkeeping.
 */
import {auditPreacceptanceDependencyV3} from './a2PreacceptanceDependencyV3.mjs'
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {evaluateObservedPiecewisePairV3} from './a2NonlinearSweepAuditV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {boundRequestedSpeedByEnergyV3,commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const ensure=(v,m)=>{if(!v)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const finite=x=>Number.isFinite(x)
const angleStep=(x,y)=>Math.abs(x-y)>1e-7
const max=(...v)=>Math.max(0,...v)
const config=(g,road)=>({gradePercent:road.gradePercent})
const roadPower=(v,road,turning,watts)=>roadWattsRequiredV3(v,83,.36,config(null,road))+
 (turning?watts:0)
const toPaths=(p)=>p.map(x=>({riderId:x.riderId,x0:x.x0,y0:x.y0,
 x1:r6(x.x0+x.proposedMeters),y1:x.proposedY}))
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
function acceptedReference(preview){
 const old=new Map(preview.proposals.map(p=>[p.riderId,p]))
 return preview.achieved.map(a=>{
  const p=old.get(a.riderId)
  ensure(p,'A54 malformed reference accepted rider')
  return {riderId:a.riderId,x0:p.x0,y0:p.y0,x1:a.x1,y1:a.y1}
 })
}
function safe(paths,g){
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  if(continuousBicycleCollisionV3(paths[i],paths[j],
   {longitudinal:1.8,lateral:g.lateralCollisionM}))return false
 return true
}
function computeSubstep(from,ended,scale,dt,road){
 ensure(from&&ended&&from.riderId===ended.riderId&&
  from.energyBefore&&finite(from.oldSpeedMps)&&
  finite(from.terminalSpeedMps)&&finite(from.steeringWatts)&&
  ended.x0===from.x0&&ended.y0===from.y0,
 'A54 missing frozen physical energy/speed source')
 const speed=(ended.x1-from.x0)/dt
 ensure(speed>=-1e-7&&speed<=20+1e-7,'A54 impossible achieved speed')
 const turning=angleStep(ended.y1,from.y0)
 const power=v=>roadPower(v,road,turning,from.steeringWatts)
 const energy=commitAchievedSpeedEnergyV3(from.energyBefore,dt,Math.max(0,speed),power)
 const terminal=scale>=1-1e-10?from.terminalSpeedMps:speed
 return {riderId:from.riderId,meters:ended.x1,y:ended.y1,
  speedMps:r6(terminal),energy,
  startSpeedMps:from.oldSpeedMps,
  achievedAverageSpeedMps:r6(speed),
  displacementM:r6(ended.x1-from.x0),
  powerWatts:r6(power(Math.max(0,speed))),
  terminalSpeedDeltaMps:r6(terminal-from.oldSpeedMps),
  violatesProvisionalAcceleration:terminal>from.oldSpeedMps+.45*dt+1e-6 ||
   terminal<from.oldSpeedMps-.85*dt-1e-6}
}
function nextStep(states,preview,g,road,dt){
 const start=new Map(states.map(x=>[x.riderId,x]))
 const maxY=(g.laneCount-1)*g.centerStepM
 const proposals=preview.proposals.map(p=>{
  const r=start.get(p.riderId)
  ensure(r,'A54 missing first state for next physical step')
  const desire=Math.min(r.speedMps+.45*dt,
   Math.max(r.speedMps-.85*dt,p.requestedSpeedMps))
  const change=Math.max(-.38*dt,Math.min(.38*dt,p.requestedY-r.y))
  const y=r6(Math.max(0,Math.min(maxY,r.y+change)))
  const turning=angleStep(y,r.y)
  const power=v=>roadPower(v,road,turning,p.steeringWatts)
  const permitted=boundRequestedSpeedByEnergyV3(r.energy,dt,desire,power)
  const speed=Math.max(0,Math.floor(Math.max(0,permitted-1e-7)*1e6)/1e6)
  return {riderId:r.riderId,forward:r6((r.speedMps+speed)/2*dt),y,
   terminalSpeedMps:speed,original:{
    riderId:r.riderId,meters:r.meters,y:r.y,speedMps:r.speedMps,energy:r.energy},
   command:{steeringWatts:p.steeringWatts,targetSpeedMps:p.requestedSpeedMps,
    targetY:p.requestedY}}
 })
 const policy=resolveContactPriorityV3(proposals,g,{policy:'rear_priority'})
 const paths=new Map(policy.paths.map(x=>[x.riderId,x]))
 const nextStates=proposals.map(p=>{
  const x=paths.get(p.riderId)
  return computeSubstep({
   riderId:p.riderId,x0:p.original.meters,y0:p.original.y,
   energyBefore:p.original.energy,oldSpeedMps:p.original.speedMps,
   terminalSpeedMps:p.terminalSpeedMps,steeringWatts:p.command.steeringWatts
  },x,policy.scales.get(p.riderId),dt,road)
 })
 return {proposals,paths:policy.paths,states:nextStates,
  fullFallbacks:policy.hardFallbacks}
}
function checkEnergy(before,after,dt){
 ensure(after.energy.seconds>=before.energyBefore.seconds+dt-1e-7 &&
  after.energy.seconds<=before.energyBefore.seconds+dt+1e-7,
  'A54 substep energy-clock mismatch')
 ensure(after.energy.remainingWPrimeJoules>=0&&
  after.energy.remainingWPrimeJoules<=after.energy.wPrimeJoules &&
  after.energy.cumulativeMechanicalJoules>=before.energyBefore.cumulativeMechanicalJoules,
  'A54 invalid physical energy checkpoint')
}
/** energy state for the first hybrid step plus one actual same-command
 * future step; next reference preview allows exact baseline consistency.
 */
export function auditHybridEnergyNextV3(preview,nextPreview,g,road,selectedIds,
 {physicalSeconds}={}){
 ensure(preview?.proposals?.length>=2&&Array.isArray(preview.achieved)&&
  finite(physicalSeconds)&&physicalSeconds>0&&physicalSeconds<=5 &&
  finite(road?.gradePercent),'A54 invalid shadow trace')
 const input=JSON.stringify([preview,nextPreview,selectedIds,road])
 const reference=acceptedReference(preview)
 const raw=preview.proposals.map(p=>({riderId:p.riderId,
  forward:p.proposedMeters,y:p.proposedY,
  original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps}}))
 const candidate=resolveContactPriorityV3(raw,g,{policy:'contact_time_lane_occupancy'})
 const pre=auditPreacceptanceDependencyV3(reference,candidate.paths,selectedIds,g,
  {physicalSeconds})
 if(!pre.allow)return {classification:'REJECTED_GEOMETRY',guard:pre,
  energyClockValid:false,energyLedgerVerified:false,nextStepChecked:false,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
 const selected=new Set(selectedIds),byRef=new Map(reference.map(x=>[x.riderId,x]))
 const byCan=new Map(candidate.paths.map(x=>[x.riderId,x]))
 const originalScale=new Map(preview.achieved.map(x=>[x.riderId,x.movementScale]))
 const source=new Map(preview.proposals.map(p=>[p.riderId,p]))
 const first=preview.proposals.map(p=>{
  const chosen=selected.has(p.riderId)
  const path=chosen?byCan.get(p.riderId):byRef.get(p.riderId)
  const scale=chosen?candidate.scales.get(p.riderId):originalScale.get(p.riderId)
  const state=computeSubstep(p,path,scale,physicalSeconds,road)
  checkEnergy(p,state,physicalSeconds)
  return state
 })
 const firstPaths=first.map(x=>{
  const prev=source.get(x.riderId)
  return {riderId:x.riderId,x0:prev.x0,y0:prev.y0,x1:x.meters,y1:x.y}
 })
 ensure(safe(firstPaths,g),'A54 preaccepted hybrid swept overlap')
 // Independently reconstruct A34 energy and velocity for baseline exactness
 // before using this audit as evidence for changed hybrid energy.
 const startEnergyBaseline=preview.proposals.map(p=>{
  const x=byRef.get(p.riderId)
  return computeSubstep(p,x,originalScale.get(p.riderId),physicalSeconds,road)
 })
 const changed=pre.changedRiders,newStateById=new Map(first.map(x=>[x.riderId,x]))
 const baselineById=new Map(startEnergyBaseline.map(x=>[x.riderId,x]))
 const unchangedExact=first.every(x=>selected.has(x.riderId)||
  identical(x,baselineById.get(x.riderId)))
 ensure(unchangedExact,'A54 changed unselected rider energy or speed')
 let maxW=0,maxTerminalDelta=0,largestAverageAcceleration=0
 let newlyViolatingAccel=0
 for(const id of changed){
  const a=newStateById.get(id),b=baselineById.get(id)
  maxW=Math.max(maxW,Math.abs(a.energy.remainingWPrimeJoules-b.energy.remainingWPrimeJoules))
  maxTerminalDelta=Math.max(maxTerminalDelta,Math.abs(a.speedMps-b.speedMps))
  largestAverageAcceleration=Math.max(largestAverageAcceleration,
   Math.abs(a.terminalSpeedDeltaMps)/physicalSeconds)
  if(a.violatesProvisionalAcceleration) newlyViolatingAccel++
 }
 let next=null,replayVerified=false,baselineNextMatches=null,secondSweptSafe=null
 let nextStateChanged=0,maxSecondDelta=0,maxSecondWDelta=0
 let nextFallbacks=0
 if(nextPreview){
  ensure(nextPreview.proposals.length===preview.proposals.length,
   'A54 next tick must share same source roster')
  const hybridNext=nextStep(first,nextPreview,g,road,physicalSeconds)
  const copied=JSON.parse(JSON.stringify(first))
  const roundTrip=nextStep(copied,nextPreview,g,road,physicalSeconds)
  ensure(identical(hybridNext,roundTrip),'A54 hybrid next-step JSON replay mismatch')
  replayVerified=true
  const originalNext=nextStep(startEnergyBaseline,nextPreview,g,road,physicalSeconds)
  const nextExpected=new Map(nextPreview.achieved.map(x=>[x.riderId,x]))
  const actualNextProposal=new Map(nextPreview.proposals.map(x=>[x.riderId,x]))
  baselineNextMatches=originalNext.paths.every(x=>{
   const q=nextExpected.get(x.riderId),p=actualNextProposal.get(x.riderId)
   const initial=baselineById.get(x.riderId)
   return q&&p&&Math.abs(x.x1-q.x1)<=1e-6&&Math.abs(x.y1-q.y1)<=1e-6&&
    Math.abs(initial.meters-p.x0)<=1e-6&&
    Math.abs(initial.y-p.y0)<=1e-6&&
    Math.abs(initial.speedMps-p.oldSpeedMps)<=1e-6&&
    Math.abs(initial.energy.remainingWPrimeJoules-p.energyBefore.remainingWPrimeJoules)<=1e-5
  })
  ensure(baselineNextMatches,'A54 independent A44 next-substep reconstruction failed')
  const nextMap=new Map(originalNext.states.map(x=>[x.riderId,x]))
  secondSweptSafe=safe(hybridNext.paths,g)
  ensure(secondSweptSafe,'A54 hybrid subsequent accepted swept paths collide')
  for(const x of hybridNext.states){
   const b=nextMap.get(x.riderId)
   if(Math.abs(x.meters-b.meters)>1e-6||Math.abs(x.y-b.y)>1e-6)nextStateChanged++
   maxSecondDelta=Math.max(maxSecondDelta,Math.abs(x.meters-b.meters))
   maxSecondWDelta=Math.max(maxSecondWDelta,
    Math.abs(x.energy.remainingWPrimeJoules-b.energy.remainingWPrimeJoules))
  }
  // Independent two-piece swept audit; consecutive segment safety matters
  // even when both endpoints and isolated single steps look safe.
  const bySecond=new Map(hybridNext.paths.map(x=>[x.riderId,x]))
  const knots=firstPaths.map(p=>({riderId:p.riderId,knots:[
   {t:0,x:p.x0,y:p.y0},{t:.5,x:p.x1,y:p.y1},
   {t:1,x:bySecond.get(p.riderId).x1,y:bySecond.get(p.riderId).y1}]}))
  for(let i=0;i<knots.length;i++)for(let j=i+1;j<knots.length;j++)
   ensure(!evaluateObservedPiecewisePairV3(knots[i].knots,knots[j].knots,
    {longitudinal:1.8,lateral:g.lateralCollisionM}).piecewiseObservedCollision,
    'A54 consecutive swept two-substep overlap')
  nextFallbacks=hybridNext.fullFallbacks
  next={states:hybridNext.states,paths:hybridNext.paths}
 }
 ensure(JSON.stringify([preview,nextPreview,selectedIds,road])===input,
  'A54 mutated source diagnostic trace')
 return {classification:'GEOMETRY_PASS_ENERGY_REPLAYED',
  guard:pre,firstStates:first,nextState:next,
  changedRiders:changed,unchangedEnergyExact:unchangedExact,
  energyClockValid:true,energyLedgerVerified:true,
  maxWPrimeDifferenceJ:r6(maxW),
  maxTerminalSpeedDifferenceMps:r6(maxTerminalDelta),
  largestPostSubstepAccelerationMps2:r6(largestAverageAcceleration),
  provisionalAccelViolationCount:newlyViolatingAccel,
  nextStepChecked:next!==null,replayVerified,
  baselineNextMatches,secondSweptSafe,
  changedNextRiders:nextStateChanged,
  maxNextPositionDifferenceM:r6(maxSecondDelta),
  maxNextWPrimeDifferenceJ:r6(maxSecondWDelta),
  nextFullFallbacks:nextFallbacks,
  fullTickCheck:'NOT_EXECUTED',
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
