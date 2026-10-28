/** A67 research-only overtaking observer: measures physically sustained passes.
 * Runs AFTER accepted, continuously swept 2D steps; never changes movement,
 * lane selection, collision acceptance, ranking or energy accounting.
 * A pair counts only if an originally trailing rider crosses the opponent
 * laterally separated, establishes 2.05m forward clearance, then maintains
 * that clearance for three continuous seconds.
 */
const ensure=(v,msg)=>{if(!v)throw Error(msg)}
const r6=n=>Math.round(n*1e6)/1e6
const MIN_FORWARD_M=2.05
const MIN_CROSS_LATERAL_M=.8001
const PERSIST_SECONDS=3
function byIdentity(states){
 ensure(Array.isArray(states)&&states.length>=2&&states.length<=168,'A67 missing field')
 const out=new Map()
 for(const s of states){
  ensure(typeof s?.id==='string'&&s.id.length&&
   Number.isFinite(s.x)&&Number.isFinite(s.y)&&!out.has(s.id),
   'A67 invalid rider positions or duplicate ID')
  out.set(s.id,s)
 }
 return out
}
// The coupled solver uses constant acceleration within each accepted 0.5s
// interval. A measured before/after velocity allows exact relative-x
// interpolation and the true intra-step minimum, rather than trusting only
// endpoint gaps. When synthetic unit inputs omit speed, use linear motion.
function relativeLongitudinalV3(rear0,front0,rear1,front1,dt){
 const d0=rear0.x-front0.x,d1=rear1.x-front1.x
 if(!Number.isFinite(rear0.v)||!Number.isFinite(front0.v))
  return {at:t=>d0+(d1-d0)*t/dt,minimum:Math.min(d0,d1)}
 const dv=rear0.v-front0.v
 // Derive acceleration from x0/x1 and v0, exactly respecting the
 // authoritative accepted endpoint, including six-decimal rounding.
 const da=2*(d1-d0-dv*dt)/(dt*dt)
 const at=t=>d0+dv*t+.5*da*t*t
 const vertex=Math.abs(da)>1e-10?-dv/da:null
 return {at,minimum:Math.min(d0,d1,
  vertex!==null&&vertex>0&&vertex<dt?at(vertex):Infinity)}
}
export function startSustainedOvertakeObserverV3(states){
 byIdentity(states)
 const pairs=[]
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j],delta=a.x-b.x
  if(Math.abs(delta)<MIN_FORWARD_M)continue // same-row grid has no true rear at t=0
  const rear=delta<0?a:b,lead=delta<0?b:a
  pairs.push({rearId:rear.id,leadId:lead.id,phase:'approaching',
   crossSeconds:null,establishedSeconds:null,lateralAtCrossM:null,
   holdSeconds:0,confirmedSeconds:null})
 }
 return {version:1,at:0,pairCount:pairs.length,
  initiallyTiedPairs:states.length*(states.length-1)/2-pairs.length,
  attemptedCrossings:0,rejectedLateralCrossings:0,abandonedPasses:0,
  establishedClearance:0,confirmedCount:0,
  firstConfirmed:[],pairs,officialWrites:0,affectsMotion:false}
}
/** Update observer from TWO already accepted physical states.
 * The caller, not this module, owns collision rejection; all values are
 * observational. The step never reads current desired speed or future paths.
 */
export function advanceSustainedOvertakeObserverV3(observer,before,after,dt){
 ensure(observer?.version===1&&observer.officialWrites===0&&
  observer.affectsMotion===false&&Number.isFinite(observer.at)&&
  Number.isFinite(dt)&&dt>0&&dt<=.5,
  'A67 invalid observer checkpoint or dt')
 const previous=byIdentity(before),next=byIdentity(after)
 ensure(previous.size===next.size&&observer.pairCount===observer.pairs.length,
  'A67 inconsistent field cardinality')
 const out=structuredClone(observer)
 for(const pair of out.pairs){
  const back0=previous.get(pair.rearId),front0=previous.get(pair.leadId)
  const back1=next.get(pair.rearId),front1=next.get(pair.leadId)
  ensure(back0&&front0&&back1&&front1,'A67 missing rider in accepted step')
  const dx0=back0.x-front0.x,dx1=back1.x-front1.x
  const relative=relativeLongitudinalV3(back0,front0,back1,front1,dt)
  if(pair.phase==='confirmed'||pair.phase==='invalid')continue
  if(pair.phase==='approaching'){
   if(dx0<=0&&dx1>0){
    let lo=0,hi=dt
    for(let j=0;j<44;j++){
     const mid=(lo+hi)/2
     if(relative.at(mid)>0)hi=mid;else lo=mid
    }
    const alpha=Math.max(0,Math.min(1,((lo+hi)/2)/dt))
    const yRear=back0.y+(back1.y-back0.y)*alpha
    const yLead=front0.y+(front1.y-front0.y)*alpha
    const lateral=Math.abs(yRear-yLead)
    out.attemptedCrossings++
    if(lateral<MIN_CROSS_LATERAL_M){
     out.rejectedLateralCrossings++
     pair.phase='invalid'
     continue
    }
    pair.phase='crossed';pair.crossSeconds=r6(out.at+alpha*dt)
    pair.lateralAtCrossM=r6(lateral)
   }
  }
  if(pair.phase==='crossed'||pair.phase==='established'){
   if(dx1<=0){
    out.abandonedPasses++
    pair.phase='approaching';pair.crossSeconds=null
    pair.establishedSeconds=null;pair.lateralAtCrossM=null
    pair.holdSeconds=0
    continue
   }
   if(dx1>=MIN_FORWARD_M){
    if(pair.phase==='crossed'){
     pair.phase='established'
     pair.establishedSeconds=r6(out.at+dt)
     pair.holdSeconds=0
     out.establishedClearance++
    }else{
     // Three seconds means continuous physical clearance, not merely
     // three seconds of above-threshold sampled checkpoints.
     if(relative.minimum<MIN_FORWARD_M-1e-7){
      pair.holdSeconds=0
      pair.establishedSeconds=r6(out.at+dt)
     }else{
      pair.holdSeconds=r6(pair.holdSeconds+dt)
     }
    }
    if(pair.holdSeconds>=PERSIST_SECONDS-1e-9){
     pair.phase='confirmed'
     pair.confirmedSeconds=r6(out.at+dt)
     out.confirmedCount++
     if(out.firstConfirmed.length<20)out.firstConfirmed.push({
      rearId:pair.rearId,leadId:pair.leadId,
      crossingSeconds:pair.crossSeconds,
      establishedSeconds:pair.establishedSeconds,
      confirmedSeconds:pair.confirmedSeconds,
      crossingLateralM:pair.lateralAtCrossM})
    }
   }else if(pair.phase==='established'){
    pair.phase='crossed';pair.establishedSeconds=null
    pair.holdSeconds=0
   }
  }
 }
 out.at=r6(out.at+dt)
 return out
}
export function overtakeObserverSummaryV3(observer){
 ensure(observer?.version===1&&observer.pairCount===observer.pairs.length,
  'A67 invalid summary checkpoint')
 return {pairCount:observer.pairCount,
  initiallyTiedPairs:observer.initiallyTiedPairs,
  attemptedCrossings:observer.attemptedCrossings,
  rejectedLateralCrossings:observer.rejectedLateralCrossings,
  establishedClearance:observer.establishedClearance,
  abandonedPasses:observer.abandonedPasses,
  confirmedSustainedPasses:observer.confirmedCount,
  pendingOrAbandonedPasses:observer.pairs.filter(p=>
   p.phase==='crossed'||p.phase==='established').length,
  durationSeconds:observer.at,
  verifiedCrossingSamples:observer.firstConfirmed,
  requiresContinuousAcceptedMotion:true,
  minClearanceM:MIN_FORWARD_M,lateralAtCrossMinM:MIN_CROSS_LATERAL_M,
  holdDurationSeconds:PERSIST_SECONDS,
  provisionalGeometry:true,officialWrites:0}
}
