/**
 * Diagnostic only: an exact-event Phase10 checkpoint inherits previous
 * replay groups. Determine if physical groups at that precise kilometre
 * differ from the inherited partition. No private IDs/km leave the worker.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),groupsOut=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||g.riderIds.length===0||
   g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  groupsOut.push([...g.riderIds].sort().join('\u0000'));
 }
 return {groups:groupsOut.sort(),ids:[...seen].sort()};
};
const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const matched=(a,b)=>!!a&&!!b&&equal(a.groups,b.groups)&&equal(a.ids,b.ids);
export function classifyPrivateExactEventSourceV4({
 timeline,checkpointId,physicalGroupsAtKm,baseTimeline
}={}){
 if(!Array.isArray(timeline?.checkpoints)||typeof checkpointId!=='string'||
 typeof physicalGroupsAtKm!=='function')return {status:'UNAVAILABLE'};
 const i=timeline.checkpoints.findIndex(c=>c.checkpointId===checkpointId);
 if(i<0)return {status:'UNAVAILABLE'};
 const cp=timeline.checkpoints[i];
 const isExact=cp.checkpointId.includes(':phase10-exact:');
 if(!isExact)return {status:'NOT_EXACT_EVENT',inheritance:'NOT_APPLICABLE',baseParity:'NOT_APPLICABLE'};
 if(!Array.isArray(baseTimeline?.checkpoints))return {status:'UNAVAILABLE'};
 const km=cp.raceProgress?.kmFromStart;
 if(!Number.isFinite(km))return {status:'UNAVAILABLE'};
 const ordered=[...baseTimeline.checkpoints]
  .filter(c=>Number.isFinite(c.raceProgress?.kmFromStart))
  .sort((a,b)=>a.raceProgress.kmFromStart-b.raceProgress.kmFromStart||
    a.checkpointIndex-b.checkpointIndex);
 const previous=[...ordered].reverse().find(c=>c.raceProgress.kmFromStart<km-0.000001);
 const next=ordered.find(c=>c.raceProgress.kmFromStart>km+0.000001);
 if(!previous||!next)return {status:'UNAVAILABLE'};
 let before,at,after;
 try{
  before=partition(physicalGroupsAtKm(previous.raceProgress.kmFromStart));
  at=partition(physicalGroupsAtKm(km));
  after=partition(physicalGroupsAtKm(next.raceProgress.kmFromStart));
 }catch{return {status:'UNAVAILABLE'};}
 const inherited=partition(previous.groups),source=partition(cp.groups);
 if(!before||!at||!after||!inherited||!source)return {status:'UNAVAILABLE'};
 const inheritance=matched(inherited,source)?'COPIED_PREVIOUS':
  'SOURCE_CHANGED_AFTER_COPY';
 const baseParity=matched(inherited,before)?'BASE_PHYSICAL':'BASE_ALREADY_DIFFERS';
 const exactParity=matched(source,at)?'EXACT_PHYSICAL':'EXACT_DIFFERS';
 const interval=matched(before,at)&&matched(at,after)?'STABLE':
  matched(before,at)?'CHANGE_AFTER_EXACT':
  matched(at,after)?'CHANGE_BEFORE_EXACT':'MULTIPLE_OR_AMBIGUOUS';
 return {status:'CLASSIFIED',inheritance,baseParity,exactParity,interval};
}
