/**
 * Read-only V3 replay group lineage. A group is born, moves and may merge or
 * dissolve; it is never re-created solely because it changed ranking in a frame.
 * No production worker, mutable database operation or race selection imports.
 */
import {derivePhysicalGroupsV3, type PhysicalGroupSampleV3, type PhysicalGroupV3} from './physicalGroupsV3.ts'

export interface TrackedPhysicalGroupV3 extends PhysicalGroupV3 {
  /** Stable within a race, never recycled after the group dissolves. */
  readonly id: string
  readonly relationToPeloton: 'ahead' | 'peloton' | 'behind'
  readonly positiveGapSeconds: number
  readonly positiveGapMeters: number
}
export interface PhysicalGroupEventV3 {
  readonly kind: 'group_formed' | 'breakaway_caught' | 'group_merged' | 'group_dissolved' | 'group_repositioned' | 'group_finished'
  readonly elapsedSeconds: number
  readonly groupId: string
  readonly riderIds: readonly string[]
  readonly intoGroupId?: string
}
export interface TrackedPhysicalGroupFrameV3 {
  readonly elapsedSeconds: number
  readonly groups: readonly TrackedPhysicalGroupV3[]
  readonly events: readonly PhysicalGroupEventV3[]
  readonly assignments: readonly {readonly riderId:string;readonly groupId:string}[]
  readonly finishedRiderIds: readonly string[]
}
export interface PhysicalGroupTimelineStateV3 {
  readonly courseMeters:number
  readonly maxSpeedMps:number
  nextBreakawayId:number
  nextChaseId:number
  previousSample:PhysicalGroupSampleV3|null
  previousGroups:TrackedPhysicalGroupV3[]
  readonly history:TrackedPhysicalGroupFrameV3[]
}
export function initializePhysicalGroupTimelineV3(courseMeters:number,maxSpeedMps=33):PhysicalGroupTimelineStateV3{
  if(!Number.isFinite(courseMeters)||courseMeters<=0||!Number.isFinite(maxSpeedMps)||maxSpeedMps<1||maxSpeedMps>70)throw Error('Invalid physical group timeline constraints')
  return {courseMeters,maxSpeedMps,nextBreakawayId:1,nextChaseId:1,previousSample:null,previousGroups:[],history:[]}
}
const countOverlap=(a:readonly string[],b:readonly string[])=>{
  const set=new Set(a);return b.reduce((count,id)=>count+(set.has(id)?1:0),0)
}
function groupIdForSide(state:PhysicalGroupTimelineStateV3,side:'ahead'|'behind'):string{
  return side==='ahead'?'B'+(state.nextBreakawayId++):'G'+(state.nextChaseId++)
}
export function advancePhysicalGroupTimelineV3(state:PhysicalGroupTimelineStateV3,frame:PhysicalGroupSampleV3):TrackedPhysicalGroupFrameV3{
  const previous=state.previousSample
  const before=state.previousGroups
  if(previous){
    const seconds=frame.elapsedSeconds-previous.elapsedSeconds
    if(seconds<=0)throw Error('Group samples must advance in time')
    const prior=new Map(previous.riders.map(r=>[r.riderId,r.meters]))
    for(const rider of frame.riders){
      const old=prior.get(rider.riderId)
      if(old!==undefined&&rider.meters<old-0.000001)throw Error('Rider teleported backwards between physical frames')
      if(old===undefined)throw Error('Rider added to in-progress physical timeline')
      if((rider.meters-old)/seconds>state.maxSpeedMps+0.000001)throw Error('Impossible rider teleportation between physical frames')
    }
  }
  const activeRiders=frame.riders.filter(r=>r.meters<state.courseMeters-0.000001)
  const finishedRiderIds=frame.riders.filter(r=>r.meters>=state.courseMeters-0.000001).map(r=>r.riderId)
  // Finished riders stop being peloton members even if all are clamped to
  // the same finish-line coordinate at DIFFERENT times. Otherwise replay
  // would manufacture a catch the moment the final rider finishes.
  const stillActiveIds=new Set(activeRiders.map(r=>r.riderId))
  const previousActive=previous?{elapsedSeconds:previous.elapsedSeconds,riders:previous.riders.filter(r=>stillActiveIds.has(r.riderId))}:null
  const physical=activeRiders.length?derivePhysicalGroupsV3({elapsedSeconds:frame.elapsedSeconds,riders:activeRiders},previousActive,state.courseMeters):null
  const now=physical?.groups??[]
  // The peloton is a persistent physical lineage, not blindly the largest
  // group at each frame. Select the group with the largest previous P overlap.
  const oldPeloton=before.find(g=>g.id==='P')
  let pelotonIndex=now.findIndex(g=>g.code==='P')
  if(oldPeloton){
    const scores=now.map(g=>countOverlap(g.riderIds,oldPeloton.riderIds))
    const best=Math.max(...scores)
    if(best>0)pelotonIndex=scores.indexOf(best)
  }
  const idByIndex=new Map<number,string>([[pelotonIndex,'P']])
  const usedPrevious=new Set<string>(['P'])
  const events:PhysicalGroupEventV3[]=[]
  // Match all surviving non-peloton groups to the strongest intersection
  // of their physical rider memberships. One old ID can go to only one group.
  const candidates:{idx:number;id:string;count:number;ratio:number}[]=[]
  for(let idx=0;idx<now.length;idx++){
    if(idx===pelotonIndex)continue
    for(const old of before){
      if(old.id==='P')continue
      const count=countOverlap(now[idx].riderIds,old.riderIds)
      const ratio=count/Math.min(now[idx].riderIds.length,old.riderIds.length)
      if(count>0&&ratio>=.5)candidates.push({idx,id:old.id,count,ratio})
    }
  }
  candidates.sort((a,b)=>b.count-a.count||b.ratio-a.ratio||a.idx-b.idx||a.id.localeCompare(b.id))
  for(const candidate of candidates){
    if(idByIndex.has(candidate.idx)||usedPrevious.has(candidate.id))continue
    const side=candidate.idx<pelotonIndex?'ahead':'behind'
    const oldSide=candidate.id.startsWith('B')?'ahead':'behind'
    // Overtaken groups are physically legitimate but must be explicitly
    // relabelled. Retired IDs cannot silently reappear as a new breakaway.
    if(oldSide!==side){
      const id=groupIdForSide(state,side)
      idByIndex.set(candidate.idx,id);usedPrevious.add(candidate.id)
      events.push({kind:'group_repositioned',elapsedSeconds:frame.elapsedSeconds,groupId:candidate.id,intoGroupId:id,riderIds:now[candidate.idx].riderIds})
    }else{
      idByIndex.set(candidate.idx,candidate.id);usedPrevious.add(candidate.id)
    }
  }
  for(let idx=0;idx<now.length;idx++){
    if(idByIndex.has(idx))continue
    const id=groupIdForSide(state,idx<pelotonIndex?'ahead':'behind')
    idByIndex.set(idx,id)
    events.push({kind:'group_formed',elapsedSeconds:frame.elapsedSeconds,groupId:id,riderIds:now[idx].riderIds})
  }
  // Every retired group is accounted for. Catch/merge is announced only when
  // every rider in the former group is actually in the current P, not merely
  // when its label has disappeared.
  const pelotonIds=new Set(now[pelotonIndex]?.riderIds??[])
  for(const old of before){
    if(old.id==='P'||usedPrevious.has(old.id))continue
    const caught=old.riderIds.every(id=>pelotonIds.has(id))
    const finished=old.riderIds.every(id=>finishedRiderIds.includes(id))
    events.push({kind:caught?(old.id.startsWith('B')?'breakaway_caught':'group_merged'):finished?'group_finished':'group_dissolved',elapsedSeconds:frame.elapsedSeconds,groupId:old.id,riderIds:old.riderIds,...(caught?{intoGroupId:'P'}:{})})
  }
  const projected:TrackedPhysicalGroupV3[]=now.map((group,idx)=>{
    const relationToPeloton=idx<pelotonIndex?'ahead':idx===pelotonIndex?'peloton':'behind'
    const peloton=now[pelotonIndex]
    const deltaMeters=group.frontMeters-peloton.frontMeters
    // Observed peloton displacement is the clock for converting physical
    // separation to time. The UI always presents non-negative magnitude,
    // while relationToPeloton conveys ahead vs behind (no signed-gap ambiguity).
    const estimatedPelotonSpeed=Math.max(1,peloton.estimatedSpeedMps)
    const id=idByIndex.get(idx)!
    return {...group,id,code:id,relationToPeloton,positiveGapMeters:Math.abs(deltaMeters),positiveGapSeconds:Math.abs(deltaMeters)/estimatedPelotonSpeed}
  })
  const assignments=[...projected.flatMap(g=>g.riderIds.map(riderId=>({riderId,groupId:g.id}))),...finishedRiderIds.map(riderId=>({riderId,groupId:'FINISHED'}))]
  if(assignments.length!==frame.riders.length||new Set(assignments.map(x=>x.riderId)).size!==frame.riders.length)throw Error('Duplicated or unassigned physical rider')
  const output={elapsedSeconds:frame.elapsedSeconds,groups:projected,events,assignments,finishedRiderIds}
  state.previousSample=frame
  state.previousGroups=projected
  state.history.push(output)
  return output
}
export function derivePhysicalGroupTimelineV3(frames:readonly PhysicalGroupSampleV3[],courseMeters:number,maxSpeedMps?:number):readonly TrackedPhysicalGroupFrameV3[]{
  const state=initializePhysicalGroupTimelineV3(courseMeters,maxSpeedMps)
  for(const frame of frames)advancePhysicalGroupTimelineV3(state,frame)
  return state.history
}
