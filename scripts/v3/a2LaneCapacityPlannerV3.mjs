/** A70: nonclairvoyant road-capacity planning for offline 2D pelotons.
 * This does not move riders. It recommends present-time lateral intent and
 * bounded upstream speed requests from current positions/velocities plus a
 * fixed, public synthetic road-width profile. No A44 future trajectories,
 * rider-specific IDs, accepted collision repairs, or production actions.
 */
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
const eps=1e-7
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x))
const assert=(test,msg)=>{if(!test)throw Error(msg)}
/** Stable, mirror-invariant corridor planning with a 20s spatial preview.
 * A rider already geometrically able to fit the upcoming narrowed road
 * holds their present lateral lane until that danger has passed. It is NOT
 * immobilized: physical longitudinal movement and bounded steering still
 * occur as normal; it may resume overtakes in open space.
 * The optional speed wave considers only immediate riders AHEAD, with
 * no future trajectory access. It never exceeds the rider's desired pace.
 */
export function capacityPlanV3(states,kind,{lookaheadSeconds=20,
 lanePolicy='hold',groupPace='none'}={}){
 assert(Array.isArray(states)&&states.length>=2&&
  Number.isFinite(lookaheadSeconds)&&lookaheadSeconds>0&&lookaheadSeconds<=40&&
  ['hold'].includes(lanePolicy)&&['none','local_wave'].includes(groupPace),
  'A70 invalid road capacity inputs')
 const items=[]
 const seen=new Set()
 for(const s of states){
  assert(typeof s.id==='string'&&!seen.has(s.id)&&
   [s.x,s.y,s.v,s.desired].every(Number.isFinite)&&s.v>=0&&s.v<=50,
   'A70 invalid rider capacity state')
  seen.add(s.id)
  const envelopes=[0,.25,.5,.75,1].map(t=>
   researchRoadEnvelopeV3(kind,s.x+s.v*lookaheadSeconds*t))
  const minY=Math.max(...envelopes.map(e=>e.minY))
  const maxY=Math.min(...envelopes.map(e=>e.maxY))
  const bottleneck=Math.min(...envelopes.map(e=>e.widthM))<4.4-eps
  items.push({id:s.id,hold:bottleneck&&s.y>=minY-eps&&s.y<=maxY+eps,
   minY,maxY,minimumWidthM:Math.min(...envelopes.map(e=>e.widthM)),
   speedRequest:s.desired,upstreamRiderCount:0,paceLimited:false,
   guardedMerging:bottleneck})
 }
 if(groupPace==='local_wave'){
  const byId=new Map(items.map(x=>[x.id,x]))
  for(const rider of states){
   const d=byId.get(rider.id)
   if(!d.guardedMerging)continue
   // Give a rider advance notice of slower riders in the SAME current
   // corridor over ~40 m, instead of reacting only at <5 m separation.
   // This is present-time traffic information, not a frozen future path.
   const ahead=states.filter(s=>s!==rider&&s.x>rider.x+eps&&
    s.x-rider.x<=40&&Math.abs(s.y-rider.y)<=.8+eps)
   const slowest=Math.min(rider.desired,...ahead.map(s=>
    Math.min(s.desired,s.v+1.1))) // moderate +1.1m/s recovery allowance
   d.upstreamRiderCount=ahead.length
   // Do not force massive speed drops: only announce attainable speed
   // intentions; the real solver retains +/- acceleration limits.
   d.speedRequest=Math.max(0,Math.min(rider.desired,slowest))
   d.paceLimited=d.speedRequest<rider.desired-eps
  }
 }
 return items
}
export function capacityGuidanceV3(plan,id){
 const d=plan.find(x=>x.id===id)
 assert(d,'A70 no capacity decision for rider')
 return d
}

/** Provisional simultaneous lateral slots at a fixed road cross-section.
 * Count uses BOTH left and right bicycle envelope and >0.8m lateral
 * separation, so three nominal tracks are NOT always three safe riders.
 * This is a geometry capacity ceiling, not an acceptance of an entire
 * moving bunch: longitudinal staggers must still be physically solved.
 */
export function physicalLateralCapacityV3(kind,x,{
 bodyHalfWidthM=.3,lateralSeparationM=.8001}={}){
 assert(Number.isFinite(bodyHalfWidthM)&&bodyHalfWidthM>=0&&
  bodyHalfWidthM<=1.1&&Number.isFinite(lateralSeparationM)&&
  lateralSeparationM>.8&&lateralSeparationM<=2,
  'A70 invalid bicycle width or lateral clearance')
 const road=researchRoadEnvelopeV3(kind,x)
 const usableWidthM=road.widthM-2*bodyHalfWidthM
 return {x,kind,nominalWidthM:road.widthM,bodyHalfWidthM,
  usableWidthM,
  simultaneousLateralSlots:usableWidthM<0?0:
   Math.max(1,Math.floor((usableWidthM+1e-9)/lateralSeparationM)+1),
  isCalibrated:false}
}

/** A71 research-only two-slot longitudinal staggering. A 2.2m pinch
 * has 1.6m usable bicycle-center width (half-body .3m), so three
 * starting riders abreast cannot use it simultaneously with >.8m
 * lateral separation. Create a rear offset for the CENTER position
 * while both outside riders approach the narrowing inside their full
 * body envelope. Physical integration still decides the actual move.
 * No rider-ID, future accepted track, teleport or forced instant speed.
 */
export function twoSlotStaggerPlanV3(states,kind,{
 bodyHalfWidthM=.3,lookaheadSeconds=20,
 longitudinalClearanceM=2.35}={}){
 assert(Array.isArray(states)&&states.length>=2&&
  Number.isFinite(bodyHalfWidthM)&&bodyHalfWidthM>=0&&bodyHalfWidthM<=.5&&
  Number.isFinite(lookaheadSeconds)&&lookaheadSeconds>=8&&lookaheadSeconds<=30&&
  Number.isFinite(longitudinalClearanceM)&&
  longitudinalClearanceM>=2.05&&longitudinalClearanceM<=5,
  'A71 invalid two-slot physics inputs')
 const seen=new Set(),out=[]
 for(const s of states){
  assert(typeof s.id==='string'&&!seen.has(s.id)&&
   [s.x,s.y,s.v,s.desired].every(Number.isFinite)&&
   s.v>=0&&s.v<=50,'A71 invalid rider or duplicate identity')
  seen.add(s.id)
  const envelopes=[0,.25,.5,.75,1].map(k=>
   researchRoadEnvelopeV3(kind,s.x+s.v*lookaheadSeconds*k))
  const narrowest=Math.min(...envelopes.map(e=>e.widthM))
  const needStagger=narrowest-2*bodyHalfWidthM<1.62 &&
   Math.abs(s.y-2.2)<.46
  let speedRequest=s.desired,referenceGapM=null,
   flankingRiderCount=0
  if(needStagger){
   const flank=states.filter(t=>t!==s&&
    Math.abs(t.y-s.y)>=.80&&Math.abs(t.y-s.y)<1.7&&
    t.x>=s.x-.50&&t.x<=s.x+12)
   flankingRiderCount=flank.length
   if(flank.length){
    const closest=Math.min(...flank.map(t=>t.x-s.x))
    referenceGapM=closest
    const slowerSide=Math.min(...flank.map(t=>t.v))
    if(closest<longitudinalClearanceM){
     // Early 0.85m/s² bounded slowdown accumulates actual gap over
     // several accepted half-second ticks. The solver clips acceleration.
     speedRequest=Math.min(speedRequest,s.v-2)
    }else{
     // Once staggered, keep separation rather than rapidly re-closing.
     speedRequest=Math.min(speedRequest,
      slowerSide+clamp((closest-longitudinalClearanceM)/2.5,0,1.5))
    }
   }
  }
  out.push({id:s.id,staggerRequested:needStagger&&flankingRiderCount>0,
   narrowestWidthM:narrowest,flankingRiderCount,referenceGapM,
   speedRequest:Math.max(0,speedRequest),
   nominalSlots:narrowest-2*bodyHalfWidthM<1.62?2:null})
 }
 return out
}
