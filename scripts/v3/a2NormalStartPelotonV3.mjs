/** A64: Offline normal-start, nonclairvoyant sustained peloton research.
 * Not a production race scheduler. No A44 histories or future paths are read.
 * All riders update on the same fixed physical clock and are rejected on
 * the first swept overlap; no teleport, rollback, speed repair or priority IDs.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {upstreamWarningsV3} from './a2UpstreamPredictionV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {initializeEnergyBalanceResearchV3,commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const assert=(x,m)=>{if(!x)throw Error(m)}
const round=x=>Math.round(x*1e6)/1e6
const DT=.5,B=.85,A=.45,L=.38,LEAD=1.8
const road={id:'A64_PROVISIONAL_5_LANE',laneCount:5,centerStepM:1.1,lateralCollisionM:.8}
const height=(road.laneCount-1)*road.centerStepM
const clip=(x,a,b)=>Math.min(b,Math.max(a,x))
const watts=(v,steering=false)=>roadWattsRequiredV3(v,83,.36,{gradePercent:0})+(steering?35:0)
const energetic=()=>initializeEnergyBalanceResearchV3({criticalWatts:305,wPrimeJoules:23000})
/** A reproducible ordinary grid, rather than an alert-time state.
 * Tempered and mixed starts share exactly the same geometric initial grid.
 */
export function createNormalStartV3(n,{mode='tempered',mirror=false,renamed=false,
 controllerPolicy='legacy',headwayStandOffM=4.5}={}){
 assert([8,32,106,168].includes(n)&&['tempered','mixed','pressure','corridor'].includes(mode)&&
 ['legacy','coordinated_headway','coordinated_demand','coordinated_either'].includes(controllerPolicy)&&
 [3.2,3.8,4.5].includes(headwayStandOffM),'A65 unknown normal-start scenario or policy')
 const starts=[]
 for(let i=0;i<n;i++){
  const activeLanes=mode==='corridor'?3:5
  const row=Math.floor(i/activeLanes),lane=mode==='corridor'?1+i%3:i%5
  const id='r'+String(i).padStart(3,'0')
  const gridX=600-row*5.2
  const v=mode==='tempered'?9.0+(i%3)*.02:
   ['mixed','corridor'].includes(mode)?8.45+((i*7)%9)*.14:8.2+((i*11)%13)*.20
  const desired=mode==='tempered'?9.05:
    ['mixed','corridor'].includes(mode)?8.6+((i*7)%9)*.14:8.3+((i*11)%13)*.20
  starts.push({id:renamed?'z'+String(n-i).padStart(4,'0'):id,
   x:round(gridX),y:round(lane*road.centerStepM),
   v:round(v),desired:round(desired),targetY:round(lane*road.centerStepM),
   energy:energetic(),startOrder:i,startX:gridX})
 }
 if(mirror)for(const s of starts){s.y=round(height-s.y);s.targetY=s.y}
 return {version:1,road:{...road},dt:DT,at:0,states:starts,
  controllerPolicy,headwayStandOffM,
  acceptedSteps:0,pairChecks:0,brakeEvents:0,steerEvents:0,
  initiatedLaneChanges:0,completedLaneChanges:0,
  nearStops:0,lowestSpeed:Infinity,maxSpeed:0,
  negotiatedHeadwayPairTicks:0,headwayLimitedRiderTicks:0,
  cumulativeAdvancement:0,firstCollision:null,reason:null,
  source:'PHYSICAL_NORMAL_GRID_NO_RETROSPECTIVE_WARNING'}
}
function checkSnapshot(p){
 assert(p?.dt===DT&&p?.road?.id===road.id&&Number.isInteger(p.acceptedSteps)&&
  p.states?.length>=2&&p.states?.length<=168,'A64 invalid checkpoint')
 assert(Math.abs(p.at-p.acceptedSteps*DT)<1e-6,'A64 time discontinuity')
 assert(['legacy','coordinated_headway','coordinated_demand','coordinated_either'].includes(p.controllerPolicy??'legacy')&&
  [3.2,3.8,4.5].includes(p.headwayStandOffM??4.5),
  'A65 invalid controller policy')
 const ids=new Set()
 for(const s of p.states){
  assert(!ids.has(s.id),'A64 duplicate rider')
  ids.add(s.id)
  assert(s.v>=0&&s.v<=50&&s.y>=-1e-6&&s.y<=height+1e-6&&
   s.energy.remainingWPrimeJoules>=0,'A64 invalid physical rider')
 }
}
/** Purely current-state neighbor corridor check before beginning a pass.
 * Does not guess future accepted positions or use rider order/identity.
 */
function chooseLane(s,states,{intentMode='actual'}={}){
 // A66 candidate: continue to seek passing corridors after physically
 // bounded following has already reduced the rider's current velocity.
 // Speed desire is present-time rider intent, not a future accepted path.
 assert(['actual','demand','either'].includes(intentMode),'A66 invalid lane intent')
 if(Math.abs(s.targetY-s.y)>1e-5)return s.targetY
 const sameLane=states.filter(t=>t!==s&&t.x>s.x&&
  Math.abs(t.y-s.y)<road.lateralCollisionM)
 const ahead=sameLane.sort((a,b)=>a.x-b.x)[0]
 const currentDemand=s.v>ahead?.v+.20
 const sustainedDemand=s.desired>ahead?.desired+.20
 const wishesPass=intentMode==='actual'?currentDemand:
  intentMode==='demand'?sustainedDemand:
  (currentDemand||sustainedDemand)
 if(!ahead||ahead.x-s.x>26||!wishesPass)return s.targetY
 const candidates=[s.y-road.centerStepM,s.y+road.centerStepM]
 .filter(y=>y>=-1e-6&&y<=height+1e-6)
 .map(y=>({y,margin:Math.min(...states.filter(t=>t!==s&&
   Math.abs(t.y-y)<road.lateralCollisionM+1e-7)
   .map(t=>Math.abs(t.x-s.x)),Infinity)}))
 .filter(x=>x.margin>=9)
 .sort((a,b)=>b.margin-a.margin)
 // Equal openings must not prefer a hard-coded physical side. A mirror-
 // invariant controller stays in lane until one corridor has an advantage.
 if(candidates.length>1&&(candidates[0].margin===candidates[1].margin||
  Math.abs(candidates[0].margin-candidates[1].margin)<1e-7))
  return s.targetY
 return candidates[0]?.y??s.targetY
}
/** One synchronized 0.5-second move. The full proposed field is swept
 * before any rider is committed. On contact, return a fail-closed record.
 */
export function advanceNormalStartV3(snapshot){
 const p=structuredClone(snapshot);checkSnapshot(p)
 assert(p.reason===null,'A64 cannot restart rejected field')
 const byId=new Map(p.states.map(s=>[s.id,s]))
 const plans=p.states.map(s=>{
  const intentMode=p.controllerPolicy==='coordinated_demand'?'demand':
   p.controllerPolicy==='coordinated_either'?'either':'actual'
  const target=chooseLane(s,p.states,{intentMode})
  const y1=round(s.y+clip(target-s.y,-L*DT,L*DT))
  const accel=clip((s.desired-s.v)/DT,-B,A)
  return {id:s.id,accel,y1,target,oldTarget:s.targetY}
 })
 // A65 experimental dense-field following: compute a simultaneous plan
 // using only the CURRENT state and this step's lateral intentions. Process
 // from ahead to rear, so a follower knows the leader's already-limited
 // acceleration. No hard-coded rider IDs, future accepted paths or repair.
 const coordinated=['coordinated_headway','coordinated_demand','coordinated_either'].includes(p.controllerPolicy)
 const commanded=new Map(plans.map(a=>[a.id,a.accel]))
 let negotiatedHeadway=0,headwayLimited=0
 if(coordinated){
  const intents=new Map(plans.map(a=>[a.id,a]))
  const frontFirst=[...p.states].sort((a,b)=>b.x-a.x)
  for(const s of frontFirst){
   const a=intents.get(s.id)
   const ahead=frontFirst.filter(t=>{
    if(t.x<=s.x+1e-9)return false // no ID-based priority on same row
    const b=intents.get(t.id)
    const lateral0=s.y-t.y,lateral1=a.y1-b.y1
    return Math.abs(lateral0)<=p.road.lateralCollisionM+1e-7||
     Math.abs(lateral1)<=p.road.lateralCollisionM+1e-7||
     lateral0*lateral1<0 // projected lateral crossing
   }).sort((a,b)=>a.x-b.x)[0]
   if(!ahead)continue
   const gap=ahead.x-s.x
   const leaderAccel=commanded.get(ahead.id)
   const targetV=ahead.v+clip((gap-(p.headwayStandOffM??4.5))/1.5,-2,2)
   const requested=clip((targetV-s.v)/DT,-B,A)
   // 2.05 m conservative end-of-step clearance; +.25m beyond bike length.
   // The formula includes actual bounded lead acceleration, unlike the
   // fixed-leader A61 rear-only alarm. It cannot override brake limits.
   const maxSafe=leaderAccel+2*(gap-2.05+(ahead.v-s.v)*DT)/(DT*DT)
   const limited=Math.max(-B,Math.min(a.accel,requested,maxSafe))
   if(limited<a.accel-1e-9){commanded.set(s.id,limited);headwayLimited++}
   negotiatedHeadway++
  }
 }
 const warnings=coordinated?null:
  upstreamWarningsV3(p.states,plans,p.road,DT,{lookaheadSeconds:3})
 const brakes=new Set(warnings?.brakeRiders??[])
 const paths=plans.map(a=>{
  const s=byId.get(a.id)
  const accel=coordinated?commanded.get(a.id):
   brakes.has(a.id)?-B:a.accel
  const nextV=Math.max(0,s.v+accel*DT)
  const travel=Math.max(0,s.v*DT+.5*accel*DT*DT)
  return {s,a,accel,x1:s.x+travel,y1:a.y1,v1:nextV,
   xAt:t=>s.x+s.v*t+.5*accel*t*t,
   yAt:t=>s.y+(a.y1-s.y)*t/DT}
 })
 const pieces=16,h=DT/pieces
 let checked=0,first=null
 // Chronological all-pair conservative sweep, not lexical priority.
 for(let k=0;k<pieces&&!first;k++){
  const t0=k*h,t1=(k+1)*h
  for(let i=0;i<paths.length&&!first;i++)for(let j=i+1;j<paths.length;j++){
   const a=paths[i],b=paths[j]
   const xEarly=Math.abs(a.xAt(t0)-b.xAt(t0))
   if(xEarly>LEAD+Math.max(a.s.v,b.s.v)*h+1)continue
   const yEarly=Math.abs(a.yAt(t0)-b.yAt(t0))
   if(yEarly>road.lateralCollisionM+2*L*h+.01)continue
   checked++
   if(continuousBicycleCollisionV3(
    {x0:a.xAt(t0),x1:a.xAt(t1),y0:a.yAt(t0),y1:a.yAt(t1)},
    {x0:b.xAt(t0),x1:b.xAt(t1),y0:b.yAt(t0),y1:b.yAt(t1)},
    {longitudinal:LEAD+(Math.abs(a.accel)+Math.abs(b.accel))*h*h/8+1e-5,
     lateral:road.lateralCollisionM+1e-5}))
     first={pair:[a.s.id,b.s.id].sort(),time:round(p.at+t0),
      step:p.acceptedSteps,withinStep:k}
  }
 }
 if(first){p.firstCollision=first;p.reason='SWEPT_CONTACT';return p}
 // Reject without committing anything if physically required watts exceed
 // W-prime. Future stages must also model critical-power-limited acceleration.
 const updates=[]
 for(const a of paths){
  let energy
  try{
   energy=commitAchievedSpeedEnergyV3(a.s.energy,DT,
    (a.x1-a.s.x)/DT,v=>watts(v,Math.abs(a.y1-a.s.y)>1e-7))
  }catch(error){
   p.reason='ENERGY_FAILED';p.energyFailure=String(error.message)
   return p
  }
  updates.push({...a.s,x:round(a.x1),y:round(a.y1),v:round(a.v1),
   targetY:round(a.a.target),energy})
 }
 p.states=updates;p.at=round(p.at+DT);p.acceptedSteps++
 p.pairChecks+=checked
 p.brakeEvents+=coordinated?paths.filter(a=>a.accel<-.05).length:brakes.size
 p.headwayLimitedRiderTicks=(p.headwayLimitedRiderTicks??0)+headwayLimited
 p.negotiatedHeadwayPairTicks=(p.negotiatedHeadwayPairTicks??0)+negotiatedHeadway
 p.steerEvents+=paths.filter(a=>Math.abs(a.y1-a.s.y)>1e-7).length
 p.initiatedLaneChanges+=plans.filter(a=>Math.abs(a.target-a.oldTarget)>1e-7).length
 p.completedLaneChanges+=paths.filter(a=>Math.abs(a.s.targetY-a.s.y)>1e-5&&
  Math.abs(a.a.target-a.y1)<1e-6).length
 p.nearStops+=updates.filter(s=>s.v<1.0).length
 p.lowestSpeed=Math.min(p.lowestSpeed,...updates.map(s=>s.v))
 p.maxSpeed=Math.max(p.maxSpeed,...updates.map(s=>s.v))
 p.cumulativeAdvancement=round(p.cumulativeAdvancement+
  paths.reduce((sum,a)=>sum+a.x1-a.s.x,0))
 return p
}
export function runNormalStartV3(initial,{seconds=60}={}){
 assert(Number.isInteger(seconds*2)&&seconds>0&&seconds<=240,'A64 invalid research horizon')
 let s=structuredClone(initial);checkSnapshot(s)
 const end=s.at+seconds
 while(s.at<end-1e-7&&!s.reason)s=advanceNormalStartV3(s)
 return s
}
export function finishNormalStartMetricsV3(original,final){
 assert(original.states.length===final.states.length,'A64 mismatched field')
 const lookup=new Map(final.states.map(s=>[s.id,s]))
 const start=original.states
 let overtakes=0,sortInversions=0
 for(let i=0;i<start.length;i++)for(let j=i+1;j<start.length;j++){
  const a=start[i],b=start[j],aa=lookup.get(a.id),bb=lookup.get(b.id)
  const initial=a.x-b.x,ending=aa.x-bb.x
  if(Math.abs(initial)<1e-5||Math.abs(ending)<1e-5)continue
  if(initial*ending<0){overtakes++;sortInversions++}
 }
 const xs=final.states.map(s=>s.x)
 const ws=final.states.map(s=>s.energy.remainingWPrimeJoules)
 return {status:final.reason??'FULL_HORIZON_CLEAR',fieldSize:final.states.length,
  seconds:final.at-original.at,acceptedSteps:final.acceptedSteps-original.acceptedSteps,
  firstCollision:final.firstCollision??null,pairChecks:final.pairChecks,
  uniquePairOrderReversals:overtakes,
  frontToLastGapM:round(Math.max(...xs)-Math.min(...xs)),
  minimumSpeedMps:final.lowestSpeed,maximumSpeedMps:final.maxSpeed,
  nearStopRiderTicks:final.nearStops,brakeRiderTicks:final.brakeEvents,
  headwayPairDecisionTicks:final.negotiatedHeadwayPairTicks??0,
  headwayLimitedRiderTicks:final.headwayLimitedRiderTicks??0,
  laneSteeringRiderTicks:final.steerEvents,
  initiatedLaneChanges:final.initiatedLaneChanges,
  completedLaneChanges:final.completedLaneChanges,
  meanRemainingWPrimeJoules:round(ws.reduce((a,b)=>a+b,0)/ws.length),
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
