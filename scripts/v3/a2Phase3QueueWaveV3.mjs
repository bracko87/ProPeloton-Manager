/** A77 Phase3 experimental cooperative speed-request wave.
 * Entirely present-time: uses current bicycle x/y/v, steering intentions
 * and current requested pace. Never accepts motion, modifies body geometry,
 * inspects future accepted states or changes authoritative physical limits.
 * Each returned pace is a REQUEST to the original swept solver.
 */
const assert=(v,m)=>{if(!v)throw Error(m)}
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v))
const EPS=1e-7
export function phase3QueueWaveV3(states,requests,originalDesired,{
 mode='anticipatory',rangeM=70,headwayM=3.2
}={}){
 assert(Array.isArray(states)&&states.length>=2&&states.length<=168&&
  Array.isArray(requests)&&requests.length===states.length&&
  originalDesired&&typeof originalDesired==='object'&&
  ['anticipatory','protect_lead'].includes(mode)&&
  Number.isFinite(rangeM)&&rangeM>=20&&rangeM<=120&&
  Number.isFinite(headwayM)&&headwayM>=2.35&&headwayM<=6,
  'A77 P3 invalid queue wave')
 const ids=new Set()
 const plan=new Map()
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i]
  assert(typeof s.id==='string'&&!ids.has(s.id)&&
   r?.id===s.id&&[s.x,s.y,s.v,r.speed,r.targetY,
    originalDesired[s.id]].every(Number.isFinite)&&s.v>=0,
   'A77 P3 invalid rider, duplicate or request')
  ids.add(s.id)
  plan.set(s.id,{...r,speed:Math.max(0,r.speed)})
 }
 const front=[...states].sort((a,b)=>b.x-a.x)
 const pairNear=(lead,rear)=>{
  // Collision risk includes existing longitudinal lanes, plus lanes
  // whose *requested* lateral steering corridors can converge.
  const p=plan.get(lead.id),q=plan.get(rear.id)
  const current=Math.abs(lead.y-rear.y)<.84
  const planned=Math.abs(p.targetY-q.targetY)<.84
  const crossing=(lead.y-rear.y)*(p.targetY-q.targetY)<0
  return current||planned||crossing
 }
 let protectedLeaders=0,earlyBrakeRequests=0,observedPairs=0
 // Front-to-rear: each physical follower sees only actual vehicles ahead.
 // First avoid scheduling a sudden leader slowdown that following riders
 // with limited -0.85m/s² braking could not react to in time.
 for(const lead of front){
  const candidates=front.filter(rear=>rear.x<lead.x-EPS&&
   lead.x-rear.x<=rangeM&&pairNear(lead,rear))
   .sort((a,b)=>b.x-a.x)
  if(!candidates.length)continue
  const rear=candidates[0],gap=lead.x-rear.x
  const closing=Math.max(0,rear.v-lead.v)
  const alertHeadway=headwayM+2.4*closing+
   closing*closing/(2*.85)+5
  if(gap>alertHeadway||rear.v<lead.v-.35)continue
  const current=plan.get(lead.id)
  const newFloor=Math.min(originalDesired[lead.id],
   Math.max(lead.v,rear.v-(gap-headwayM)/4))
  if(newFloor>current.speed+EPS){
   current.speed=newFloor
   protectedLeaders++
  }
 }
 // Propagate the already-protected leading rider's planned deceleration
 // upstream over multiple rows. No acceleration spikes are allowed:
 // requests go through unchanged +0.45/-0.85 physical acceleration.
 for(const rear of front){
  const available=front.filter(lead=>lead.x>rear.x+EPS&&
   lead.x-rear.x<=rangeM&&pairNear(lead,rear))
   .sort((a,b)=>a.x-b.x)
  if(!available.length)continue
  const lead=available[0],gap=lead.x-rear.x
  const closing=Math.max(0,rear.v-lead.v)
  const required=headwayM+2.8*closing+
   closing*closing/(2*.85)
  const f=plan.get(rear.id),a=plan.get(lead.id)
  const targetLead=Math.min(lead.v,a.speed)
  let followingPace=targetLead+clamp((gap-required)/4,-3,.75)
  if(mode==='protect_lead')
   followingPace=targetLead+clamp((gap-required)/3,-3,1)
  observedPairs++
  if(followingPace<f.speed-EPS){
   f.speed=Math.max(0,followingPace)
   earlyBrakeRequests++
  }
 }
 return {requests:requests.map(r=>plan.get(r.id)),
  protectedLeaders,earlyBrakeRequests,observedPairs,
  noMotionAuthority:true,researchOnly:true}
}
