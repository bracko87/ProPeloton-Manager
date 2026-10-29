/**
 * Local-only, read-only projection of the exact alternate discrete V3 engine.
 * No Supabase, no network clients, no official race operations, no persistence.
 * This module imports the verified Node research code (no duplicated solver).
 */
import {createDiscretePelotonV3,advanceDiscretePelotonV3}
  from './a3DiscreteCapacityPelotonV3.mjs';
import {a3GradientV3,a3AttackStateV3}
  from './a3RiderPerformanceV3.mjs';
import {createHash} from 'node:crypto';

export const SANDBOX_LIMITS=Object.freeze({
  fields:[32,106,168],layouts:['staged','double'],
  scenarios:['standard','attack'],seconds:180,framesPerSecond:1
});
const checksum=value=>createHash('sha256').update(JSON.stringify(value))
  .digest('hex');
const round=n=>Math.round(n*1000)/1000;
function groupOf(riders){
 const sorted=[...riders].sort((a,b)=>b.x-a.x||a.ordinal-b.ordinal);
 const groups=[], ids={};
 for(const r of sorted){
  const previous=groups.at(-1);
  const lead=previous?.at(-1);
  const gapSeconds=lead?(lead.x-r.x)/Math.max(1,r.v):0;
  if(!previous||gapSeconds>8+1e-7)groups.push([r]);
  else previous.push(r);
  ids[r.id]=groups.length;
 }
 return {groups,ids,leader:sorted[0],sorted};
}
function capture(state){
 const observed=groupOf(state.racers);
 const record=state.records.at(-1)??null;
 return {
  second:round(state.time),
  groups:observed.groups.map((g,i)=>({
    id:i+1,size:g.length,leadId:g[0].id,
    leadX:round(g[0].x)})),
  leaderId:observed.leader.id,leaderX:round(observed.leader.x),
  minSpeed:record?.minSpeed??9,
  minLaneGap:record?.minLaneGap??null,
  activeAttacks:record?.activeAttackers??0,
  draftingRiders:record?.draftingRiders??0,
  climbingRiders:record?.climbingRiders??0,
  middleLaneRiders:record?.midWidthRiders??0,
  secondMergeCount:record?.secondMergeRiders??0,
  riders:state.racers.map(r=>({
   id:r.id,ordinal:r.ordinal,
   x:round(r.x),lane:r.lane,channel:r.channel,
   speed:round(r.v),energy:round(r.energyJ),
   type:r.performance?.type??'unrated',
   group:observed.ids[r.id],
   attack:a3AttackStateV3(state,r),
   phase:r.phase,
   firstGate:r.passedFirst,secondGate:r.passedSecond
  }))
 };
}
export function validateSandboxSelection(options={}){
 const n=Number(options.riders??32);
 const layout=options.layout??'staged',
   scenario=options.scenario??'standard';
 if(!SANDBOX_LIMITS.fields.includes(n)||
   !SANDBOX_LIMITS.layouts.includes(layout)||
   !SANDBOX_LIMITS.scenarios.includes(scenario))
  throw new RangeError('Only approved synthetic sandbox scenarios are allowed');
 return {riders:n,layout,scenario};
}
function elevationProfile(layout){
 let y=0;
 const rows=[{x:500,elevation:0,grade:0}];
 for(let x=505;x<=2600;x+=5){
  const g=a3GradientV3(layout,x-2.5);
  y+=5*g;
  rows.push({x,elevation:round(y),grade:g});
 }
 return rows;
}
export function createViewerReplayV3(options={}){
 const selected=validateSandboxSelection(options);
 const initial=createDiscretePelotonV3(selected.riders,{
  layout:selected.layout,scenario:'standard',
  roadWidthMode:'two_distinct_gates',performanceMode:'profiles_v1',
  attackScenario:selected.scenario==='attack'?'leader_surge':'none'
 });
 let current=initial;
 const frames=[capture(current)];
 for(let i=1;i<=1800;i++){
  current=advanceDiscretePelotonV3(current);
  if(current.reason)throw Error('Viewer research run rejected at '+
    current.time+': '+current.reason+
    ' '+JSON.stringify(current.rejection??null));
  if(i%10===0)frames.push(capture(current));
 }
 if(frames.length!==181||current.time!==180||
    current.racers.length!==selected.riders||
    !current.racers.every(r=>r.passedFirst&&r.passedSecond))
  throw Error('Viewer scenario failed full two-gate replay acceptance');
 const final=current.records.at(-1);
 const first=frames[0],last=frames.at(-1);
 const digest=checksum(frames.map(f=>[
   f.second,f.riders.map(r=>[r.id,r.x,r.lane,r.speed,r.energy,r.group])]));
 return {
  model:'SYNTHETIC_ALTERNATE_V3_LANES_NOT_A64',
  durationSeconds:180,snapshotIntervalSeconds:1,
  selection:selected,road:{firstMergeX:680,firstExitX:1020,
    secondMergeX:1130,secondExitX:1470,
    maximumVisibleX:2600,profile:elevationProfile(selected.layout)},
  frames,final:{
    time:current.time,totalRiders:current.racers.length,
    groups:last.groups.length,
    passedBoth:current.racers.filter(r=>
       r.passedFirst&&r.passedSecond).length,
    firstRider:first.leaderId,lastLeader:last.leaderId,
    minimumRecordedSpeed:Math.min(...current.records.map(r=>r.minSpeed)),
    minimumRecordedLaneGap:Math.min(...current.records.map(r=>
      r.minLaneGap??Infinity)),energyAverage:round(
      current.racers.reduce((s,r)=>s+r.energyJ,0)/current.racers.length),
    finalAttackers:final?.activeAttackers??0
  },
  replayHash:digest,syntheticOnly:true,
  atomicLogicalLaneHandoffs:true,
  callsSupabase:false,publishesRaceResults:false,
  officialWrites:0
 };
}
