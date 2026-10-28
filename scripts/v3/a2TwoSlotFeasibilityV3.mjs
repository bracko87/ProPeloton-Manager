/** A73 research-only NECESSARY reachable space-time windows, not a
 * sufficient no-collision certificate. All widths/velocities synthetic.
 * No future accepted rider trajectories, clock mutation or state repairs.
 */
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
const check=(x,m)=>{if(!x)throw Error(m)}
const A=.45,B=.85,L=.38,EPS=1e-8
export function physicalArrivalWindowV3(x,v,gateX,{
 minSpeedMps=5,maxSpeedMps=50,deadlineSeconds=120
}={}){
 check([x,v,gateX,minSpeedMps,maxSpeedMps,deadlineSeconds]
  .every(Number.isFinite)&&x>=-10000&&gateX>=0&&
  v>=minSpeedMps&&v<=maxSpeedMps&&minSpeedMps>=1&&
  minSpeedMps<=10&&deadlineSeconds>0&&deadlineSeconds<=3600,
  'A73 invalid kinematic arrival input')
 if(x>gateX+EPS)return {status:'ALREADY_PASSED',
  earliestSeconds:null,latestSeconds:null}
 const d=Math.max(0,gateX-x)
 if(d===0)return {status:'AT_GATE',earliestSeconds:0,latestSeconds:0}
 const tA=(maxSpeedMps-v)/A
 const accelDist=v*tA+.5*A*tA*tA
 const earliest=d<=accelDist?(-v+Math.sqrt(v*v+2*A*d))/A:
  tA+(d-accelDist)/maxSpeedMps
 const tB=(v-minSpeedMps)/B
 const decelDist=v*tB-.5*B*tB*tB
 const latest=d<=decelDist?
  (v-Math.sqrt(Math.max(0,v*v-2*B*d)))/B:
  tB+(d-decelDist)/minSpeedMps
 return {status:earliest>deadlineSeconds+EPS?
  'UNREACHABLE_BEFORE_DEADLINE':'REACHABLE_WINDOW',
  earliestSeconds:earliest,latestSeconds:Math.min(latest,deadlineSeconds),
  unconstrainedLatestSeconds:latest,distanceM:d}
}
/** Symmetric two-flank-then-centre sequential crossing at the x=780
 * narrow section, with at least 2.35m lead clearance at nominal
 * crossing speed. It is a schedule feasibility NECESSARY condition only:
 * curved paths, actual acceleration/steering, pair sweeps, rider power
 * and upstream traffic still require the authoritative coupled solver.
 */
export function auditTwoSlotFeasibilityV3(states,kind,{
 gateX=780,halfBikeM=.3,headwayM=2.35,crossingSpeedMps=8.5,
 slotSpacingSeconds=.5,minSpeedMps=5,deadlineSeconds=120,
 slotSpacingProfile='uniform'
}={}){
 check(Array.isArray(states)&&states.length>0&&states.length<=200&&
  ['constant','mild_pinch','strong_pinch'].includes(kind)&&
  [gateX,halfBikeM,headwayM,crossingSpeedMps,slotSpacingSeconds,
   minSpeedMps,deadlineSeconds].every(Number.isFinite)&&
  gateX>=680&&gateX<=920&&halfBikeM>=0&&halfBikeM<=.5&&
  headwayM>=2.05&&headwayM<=5&&
  crossingSpeedMps>=1&&crossingSpeedMps<=20&&
  slotSpacingSeconds>=headwayM/minSpeedMps&&
  ['uniform','front_loaded','balanced','late_pressure',
   'mid_pressure','late_peak','late_moderate','tail_surge','tail_grad',
   'tail_emphasis','tail_focus','tail_flip'].includes(slotSpacingProfile)&&
  minSpeedMps>=1&&minSpeedMps<=10&&
  deadlineSeconds>0&&deadlineSeconds<=3600,
  'A73 invalid narrow-road entry-window parameters')
 const road=researchRoadEnvelopeV3(kind,gateX)
 const usable=road.widthM-2*halfBikeM
 const slots=usable<0?0:Math.floor((usable+1e-9)/.8001)+1
 if(slots!==2)return {status:'NOT_TWO_SLOT',kind,gateX,slots,
  bookings:[],unresolved:[],sportingApproval:'NOT_APPROVED'}
 const left=road.minY+halfBikeM+.05
 const right=road.maxY-halfBikeM-.05
 check(right-left>.8001,'A73 physically impossible bicycle lateral slots')
 const ids=new Set(),grouped=new Map()
 for(const s of states){
  check(typeof s.id==='string'&&!ids.has(s.id)&&
   [s.x,s.y,s.v,s.startX,s.desired].every(Number.isFinite),
   'A73 invalid or duplicate cyclist')
  ids.add(s.id)
  const key=String(Math.round(s.startX*1000))
  if(!grouped.has(key))grouped.set(key,[])
  grouped.get(key).push(s)
 }
 const rows=[...grouped.values()].sort((a,b)=>b[0].startX-a[0].startX)
 const bookings=[],unresolved=[]
 let release=0,blocked=false
 for(const [rowIndex,row] of rows.entries()){
  // A74 queue-capacity experiment. The first 75% of rows may need a
  // larger physically reachable time slot, while the back retains
  // at least 0.5s full-bike clearance. Physical starting-row order
  // determines allocation, not rider IDs or future accepted paths.
  // A75: redistribute the SAME total time budget from distant front
  // reservations into the threatened middle/late rows, preserving >=.5s.
  // These are positional hypotheses; every final reservation must still
  // be feasible under the exact current rider's acceleration bounds.
  const ratio=rowIndex/rows.length
  const rowGap=slotSpacingProfile==='front_loaded'?
   (rowIndex<Math.ceil(rows.length*.75)?.64:.5):
   slotSpacingProfile==='balanced'?
   (rowIndex<Math.ceil(rows.length*2/3)?.63:.54):
   slotSpacingProfile==='late_pressure'?
   (ratio<.625?.58:ratio<.893?.70:.5):
   slotSpacingProfile==='mid_pressure'?
   (ratio<.50?.57:ratio<.893?.67:.52):
   slotSpacingProfile==='late_peak'?
   (ratio<.571?.57:ratio<.893?.70:.5):
   slotSpacingProfile==='late_moderate'?
   (ratio<.643?.60:ratio<.893?.66:.5):
   slotSpacingProfile==='tail_surge'?
   (ratio<.571?.56:ratio<.893?.69:.60):
   slotSpacingProfile==='tail_grad'?
   (ratio<.625?.57:ratio<.875?.68:.60):
   slotSpacingProfile==='tail_emphasis'?
   (ratio<.50?.56:ratio<.839?.68:.61):
   slotSpacingProfile==='tail_focus'?
   (ratio<.446?.55:ratio<.893?.66:.64):
   slotSpacingProfile==='tail_flip'?
   (ratio<.625?.58:ratio<.857?.67:.61):
   slotSpacingSeconds
  if(blocked){
   unresolved.push({startX:row[0].startX,reason:'BLOCKED_BY_EARLIER_ROW'})
   continue
  }
  const leftSide=row.filter(s=>s.y<1.74)
  const rightSide=row.filter(s=>s.y>2.66)
  const centers=row.filter(s=>s.y>=1.74&&s.y<=2.66)
  if(leftSide.length>1||rightSide.length>1||centers.length>1){
   unresolved.push({startX:row[0].startX,reason:'DUPLICATE_LATERAL_TRACK'})
   blocked=true
   continue
  }
  const flanks=[...leftSide.map(s=>({s,slot:'LEFT',targetY:left})),
   ...rightSide.map(s=>({s,slot:'RIGHT',targetY:right}))]
  const center=centers[0]
  const bounds=new Map(row.map(s=>[s.id,physicalArrivalWindowV3(
   s.x,s.v,gateX,{minSpeedMps,deadlineSeconds,
    maxSpeedMps:Math.max(s.v,s.desired)})]))
  const earliest=s=>{
   const w=bounds.get(s.id)
   return ['ALREADY_PASSED','UNREACHABLE_BEFORE_DEADLINE']
    .includes(w.status)?Infinity:w.earliestSeconds
  }
  // Lateral steering from the REAL starting y is a separate lower bound.
  const flankTime=flanks.length?
   Math.max(release,...flanks.map(({s,targetY})=>Math.max(
    earliest(s),Math.abs(s.y-targetY)/L))):null
  const centerTime=center?Math.max(earliest(center),
   (flankTime??release)+rowGap):null
  const proposed=[...flanks.map(({s,slot,targetY})=>({
   s,slot,targetY,time:flankTime})),...(center?[{
    s:center,slot:'CENTER_AFTER_FLANKS',targetY:2.2,time:centerTime}]:[])]
  const allowed=proposed.length===row.length&&proposed.every(p=>{
   const w=bounds.get(p.s.id)
   return Number.isFinite(p.time)&&p.time<=deadlineSeconds+EPS&&
    p.time<=w.latestSeconds+EPS
  })
  if(!allowed){
   unresolved.push({startX:row[0].startX,reason:'NO_REACHABLE_SLOT_WINDOW',
    proposedFlankSeconds:flankTime,proposedCenterSeconds:centerTime,
    riderWindows:row.map(s=>({id:s.id,...bounds.get(s.id)}))})
   blocked=true
   continue
  }
  for(const p of proposed){
   const w=bounds.get(p.s.id)
   bookings.push({id:p.s.id,rowStartX:p.s.startX,
    slot:p.slot,gateX,targetY:p.targetY,scheduledSeconds:p.time,
    earliestSeconds:w.earliestSeconds,latestSeconds:w.latestSeconds,
    lateralMoveSeconds:Math.abs(p.s.y-p.targetY)/L,
    researchOnly:true,entrySpacingSeconds:rowGap})
  }
  release=(centerTime??flankTime??release)+rowGap
 }
 return {status:unresolved.length?'UNRESOLVED':'NECESSARY_WINDOWS_EXIST',
  kind,gateX,slots,halfBikeM,headwayM,crossingSpeedMps,minSpeedMps,
  slotSpacingSeconds,slotSpacingProfile,deadlineSeconds,
  bookedCount:bookings.length,
  rowCount:rows.length,bookings,unresolved,lastSlotReleaseSeconds:release,
  noTrajectoryGuarantee:true,noCollisionGuarantee:true,
  actualSweptSolverStillRequired:true,
  sportingApproval:'NOT_APPROVED'}
}
