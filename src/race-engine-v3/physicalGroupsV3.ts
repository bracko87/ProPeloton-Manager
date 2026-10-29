/** Pure grouping of physical rider positions. No database or result side effects. */
export interface PhysicalGroupRiderV3 {readonly riderId:string;readonly meters:number}
export interface PhysicalGroupSampleV3 {readonly elapsedSeconds:number;readonly riders:readonly PhysicalGroupRiderV3[]}
export interface PhysicalGroupV3 {readonly code:string;readonly riderIds:readonly string[];readonly frontMeters:number;readonly rearMeters:number;readonly estimatedSpeedMps:number;readonly gapToPelotonSeconds:number;readonly gapToPelotonMeters:number}
export interface GroupSnapshotV3 {readonly elapsedSeconds:number;readonly pelotonCode:string;readonly groups:readonly PhysicalGroupV3[];readonly assignments:readonly {readonly riderId:string;readonly groupCode:string}[]}
export function derivePhysicalGroupsV3(now:PhysicalGroupSampleV3,previous:PhysicalGroupSampleV3|null,courseMeters:number):GroupSnapshotV3{
 if(!Number.isFinite(courseMeters)||courseMeters<=0||!Number.isFinite(now.elapsedSeconds)||now.elapsedSeconds<0)throw Error('Invalid time or course')
 if(previous&&(!(previous.elapsedSeconds<now.elapsedSeconds)||previous.riders.length!==now.riders.length))throw Error('Invalid earlier physical frame')
 const ids=new Set<string>(),pos=[...now.riders].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 const prior=new Map((previous?.riders??[]).map(r=>[r.riderId,r.meters]))
 const speedOf=(r:PhysicalGroupRiderV3)=>previous?Math.max(0,(r.meters-(prior.get(r.riderId)??NaN))/(now.elapsedSeconds-previous.elapsedSeconds)):11
 for(const r of pos){
  if(!r.riderId||ids.has(r.riderId)||!Number.isFinite(r.meters)||r.meters<0||r.meters>courseMeters+.001||previous&&(!prior.has(r.riderId)||r.meters+.001<prior.get(r.riderId)!))throw Error('Invalid, duplicated, or backward group rider')
  ids.add(r.riderId)
 }
 if(!pos.length)throw Error('Empty group frame')
 const groups:{riders:PhysicalGroupRiderV3[];front:number;rear:number}[]=[]
 for(const r of pos){
  const last=groups.at(-1),followingSpeed=last?Math.max(2,Math.min(25,speedOf(r))):11
  // Eight-second RACE GROUP rule: compare each follower with the rear of
  // the group ahead. Consecutive <=8s links stay in the SAME bunch, even
  // though each rider has distinct physical position/speed/energy.
  // A gap >8s splits; reconnecting at <=8s automatically merges.
  // No 55m cap: at 10m/s an eight-second gap is physically ~80m.
  const gapSeconds=last?(last.rear-r.meters)/followingSpeed:0
  if(!last||gapSeconds>8+1e-8)groups.push({riders:[r],front:r.meters,rear:r.meters})
  else{last.riders.push(r);last.rear=r.meters}
 }
 const peloton=groups.reduce((best,g)=>g.riders.length>best.riders.length?g:best,groups[0])
 const pelotonIdx=groups.indexOf(peloton);let lead=0,trail=0
 const projected=groups.map((g,i)=>{
  const code=i===pelotonIdx?'P':i<pelotonIdx?`B${++lead}`:`G${++trail}`
  const speed=Math.max(1,g.riders.reduce((sum,r)=>sum+speedOf(r),0)/g.riders.length)
  // Gap estimate uses only rider distance and physically observed peloton speed.
  const pelotonSpeed=Math.max(1,peloton.riders.reduce((sum,r)=>sum+speedOf(r),0)/peloton.riders.length)
  const gapMeters=peloton.front-g.front
  return {code,riderIds:g.riders.map(r=>r.riderId),frontMeters:g.front,rearMeters:g.rear,estimatedSpeedMps:speed,gapToPelotonMeters:gapMeters,gapToPelotonSeconds:gapMeters/pelotonSpeed}
 })
 return {elapsedSeconds:now.elapsedSeconds,pelotonCode:'P',groups:projected,assignments:projected.flatMap(g=>g.riderIds.map(riderId=>({riderId,groupCode:g.code})))}
}
