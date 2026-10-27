/** Offline A2 longitudinal passing observer, intentionally independent of physics.
 * All passages are strict, tick-end longitudinal order reversals among rider
 * centers that previously had a strict order. Near ties are never counted.
 * Duration means the order stayed reversed for that long, NOT a tactical win.
 */
const must=(cond,msg)=>{if(!cond)throw Error(msg)}
const closeSign=(gap,epsilon)=>gap>epsilon?1:gap< -epsilon?-1:0
const key=(a,b)=>JSON.stringify([a,b])
const pairIndex=(ids)=>{const pairs=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]]);return pairs}
export function initializePersistentPassTrackerV3(riders,{epsilon=.05}={}){
 must(Array.isArray(riders)&&riders.length>=2&&riders.length<=200&&Number.isFinite(epsilon)&&epsilon>0&&epsilon<=.5,'Invalid persistent pass tracker initialization')
 const ids=riders.map(r=>r?.riderId).sort(),unique=new Set(ids)
 must(ids.every(x=>typeof x==='string'&&x.length>0)&&unique.size===ids.length&&riders.every(r=>Number.isFinite(r.meters)),'Invalid pass-tracking riders')
 const byId=new Map(riders.map(r=>[r.riderId,r.meters]))
 return {version:1,epsilon,elapsedSeconds:0,ids,pairs:pairIndex(ids).map(([a,b])=>({a,b,sign:closeSign(byId.get(a)-byId.get(b),epsilon),lastEventIndex:null})),events:[]}
}
export function advancePersistentPassTrackerV3(prior,riders,elapsedSeconds){
 must(prior?.version===1&&Array.isArray(prior.ids)&&Array.isArray(prior.pairs)&&Array.isArray(prior.events)&&Number.isFinite(elapsedSeconds)&&elapsedSeconds>prior.elapsedSeconds,'Invalid pass-tracking checkpoint')
 const map=new Map(riders.map(r=>[r?.riderId,r?.meters]))
 must(map.size===prior.ids.length&&prior.ids.every(id=>Number.isFinite(map.get(id))),'Missing pass-tracking rider')
 const next=structuredClone(prior)
 for(const p of next.pairs){
  const sign=closeSign(map.get(p.a)-map.get(p.b),next.epsilon)
  if(sign===0)continue // Do not guess order while centers are nearly tied
  if(p.sign===0){p.sign=sign;continue} // First resolved order, not a pass
  if(p.sign===sign)continue
  if(p.lastEventIndex!==null)next.events[p.lastEventIndex].reversedAtSeconds=elapsedSeconds
  const passer=sign>0?p.a:p.b
  const passed=sign>0?p.b:p.a
  next.events.push({a:p.a,b:p.b,passer,passed,atSeconds:elapsedSeconds,reversedAtSeconds:null})
  p.sign=sign;p.lastEventIndex=next.events.length-1
 }
 next.elapsedSeconds=elapsedSeconds
 return next
}
export function summarizePersistentPassTrackerV3(state,{windowsSeconds=[30,60]}={}){
 must(state?.version===1&&Array.isArray(state.events)&&Number.isFinite(state.elapsedSeconds)&&Array.isArray(windowsSeconds)&&windowsSeconds.every(v=>Number.isFinite(v)&&v>0),'Invalid pass summary')
 const events=state.events,allPairs=new Set(events.map(e=>key(e.a,e.b)))
 const directions=new Set(events.map(e=>key(e.passer,e.passed)))
 const passingRiders=new Set(events.map(e=>e.passer))
 const durations={}
 for(const window of windowsSeconds){
  let sustained=0,reversedEarly=0,lateCensored=0
  const persistentPairs=new Set(),persistentDirections=new Set()
  for(const e of events){
   const age=e.reversedAtSeconds===null?state.elapsedSeconds-e.atSeconds:e.reversedAtSeconds-e.atSeconds
   if(age>=window){
    sustained++
    persistentPairs.add(key(e.a,e.b))
    persistentDirections.add(key(e.passer,e.passed))
   }else if(e.reversedAtSeconds!==null)reversedEarly++
   else lateCensored++
  }
  must(sustained+reversedEarly+lateCensored===events.length,'Persistent-pass duration accounting mismatch')
  durations[String(window)+'s']={sustainedEvents:sustained,uniquePairsWithSustainedPass:[...persistentPairs].length,uniqueDirectionalSustainedPasses:[...persistentDirections].length,reversedWithinWindow:reversedEarly,rightCensoredRecentEvents:lateCensored}
 }
 return {crossingEvents:events.length,uniqueUnorderedCrossingPairs:allPairs.size,uniqueDirectionalCrossingPairs:directions.size,uniquePassingRiders:passingRiders.size,repeatedCrossingsAfterFirstPerPair:events.length-allPairs.size,
  durationWindows:durations}
}
