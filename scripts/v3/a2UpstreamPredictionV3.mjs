/** A61 offline current-state upstream headway anticipation.
 * Every warning uses only positions, velocities, and commanded motion at the
 * *start* of the current physical step. The extrapolation is an unobserved
 * prediction, never a future A44 outcome. This advisory does not accept paths.
 */
const check=(p,m)=>{if(!p)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const B=.85, A=.45, L=.38, R=1.8
export function upstreamWarningsV3(states, actions, road, dt, {lookaheadSeconds=3}={}) {
 check(Array.isArray(states)&&Array.isArray(actions)&&states.length>=2&&
   actions.length===states.length&&Number.isFinite(dt)&&dt>0&&dt<=5&&
   [3,5].includes(lookaheadSeconds)&&Number.isFinite(road?.lateralCollisionM)&&
   road.lateralCollisionM>0&&Number.isFinite(road?.centerStepM)&&
   Number.isInteger(road?.laneCount)&&road.laneCount>=2,
   'A61 invalid current-state input')
 const initial=JSON.stringify([states,actions])
 const command=new Map(actions.map(a=>[a.id,a]))
 const unique=new Set(states.map(s=>s.id))
 check(unique.size===states.length&&command.size===states.length,'A61 repeated rider identity')
 const maxY=(road.laneCount-1)*road.centerStepM
 for(const s of states){
  const a=command.get(s.id)
  check(a&&typeof s.id==='string'&&Number.isFinite(s.x)&&
   Number.isFinite(s.y)&&s.y>=-1e-6&&s.y<=maxY+1e-6&&
   Number.isFinite(s.v)&&s.v>=0&&Number.isFinite(a.accel)&&
   a.accel>=-B-1e-8&&a.accel<=A+1e-8&&Number.isFinite(a.y1)&&
   a.y1>=-1e-6&&a.y1<=maxY+1e-6&&
   Math.abs(a.y1-s.y)<=L*dt+1e-5,'A61 invalid bounded rider state/intent')
 }
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
 const futureY=(s,a,t)=>clamp(s.y+(a.y1-s.y)*t/dt,0,maxY)
 const times=[0,dt,lookaheadSeconds/2,lookaheadSeconds]
 const ids=new Set(),events=[]
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const p=states[i],q=states[j]
  if(Math.abs(p.x-q.x)<=1e-9)continue // do not choose a rider using ID
  const rear=p.x<q.x?p:q,lead=p.x<q.x?q:p
  const ar=command.get(rear.id),al=command.get(lead.id)
  const currentlyOverlapping=Math.abs(rear.y-lead.y)<=road.lateralCollisionM+1e-7
  const mayShareLane=times.some(t=>Math.abs(futureY(rear,ar,t)-futureY(lead,al,t))<=road.lateralCollisionM+1e-7)
  if(!mayShareLane)continue
  const currentClosing=rear.v-lead.v
  const stepClosing=Math.max(0,rear.v+ar.accel*dt)-Math.max(0,lead.v+al.accel*dt)
  const closing=Math.max(0,currentClosing,stepClosing)
  if(closing<=1e-8)continue
  const separation=lead.x-rear.x
  const limit=R+closing*lookaheadSeconds+closing*closing/(2*B)
  if(separation>limit)continue
  ids.add(rear.id)
  events.push({rear:rear.id,lead:lead.id,
   atCurrentState:true,laneType:currentlyOverlapping?'CURRENT':'FORECAST_LATERAL_CONVERGENCE',
   initialGapM:r6(separation),closingMps:r6(closing),optimisticSafeGapM:r6(limit),
   lookaheadSeconds})
 }
 check(JSON.stringify([states,actions])===initial,'A61 source mutation')
 return {brakeRiders:[...ids].sort(),events,
  lookaheadSeconds,model:'CONSTANT_CURRENT_LATERAL_RATE_PLUS_BOUNDED_SPEED',
  futureAcceptedPathsRead:false,usesFutureSourceCommands:false,
  requiresNonclairvoyantReassessmentEachStep:true,officialWrites:0}
}
/** Inspect the available preceding A44 physical snapshots without using
 * later accepted trajectories. This is diagnostic evidence, not the live
 * warning decision; a given case was originally chosen retrospectively.
 */
export function precedingPhysicalCheckpointsV3(source,warningEnd,dt,{maxSeconds=5}={}){
 check(Array.isArray(source)&&source.length===6&&dt>0&&dt<=5&&
  maxSeconds>0&&maxSeconds<=10,'A61 invalid prior history')
 const frames=source.flatMap(t=>t.previews.map(p=>({
  start:r6(p.tickStartSeconds+(p.substep-1)*dt),
  end:r6(p.tickStartSeconds+p.substep*dt),p
 }))).sort((a,b)=>a.start-b.start)
 const at=frames.findIndex(f=>Math.abs(f.end-warningEnd)<1e-6)
 check(at>=0,'A61 missing original alert checkpoint')
 return frames.slice(0,at).filter(f=>f.start>=frames[at].start-maxSeconds-1e-8)
  .map(f=>({startSeconds:f.start,leadBeforeAlertSeconds:r6(frames[at].start-f.start),
   riderCount:f.p.proposals.length,physicalStateAvailable:true}))
}
