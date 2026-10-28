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
