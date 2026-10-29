/** ProPeloton V3 alternative: research-only deterministic lane-slot prototype.
 * This is NOT A64. Lateral handoff is abstract/atomic at x=680, not a
 * swept side-to-side bicycle path. No database or production integration.
 */
import {createHash} from 'node:crypto';
const DT=.1,GATE=680,GAP=1.85,FLOOR=6.5,A=.45,B=.85;
const q=x=>Math.round(x*1e6)/1e6;
const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const channel=(lane,row)=>lane<2?0:lane>2?1:row%2;
const steer=c=>c?3:1;
const ramp=(v,target)=>q(v+clip(target-v,-B*DT,A*DT));
function travel(v,target,n){
 let d=0;
 for(let k=0;k<n;k++){v=ramp(v,target);d+=v*DT;}
 return d;
}
function approachSpeed(d,n){
 if(d<travel(9,FLOOR,n)-1e-4||d>travel(9,14,n)+1e-4)return null;
 let lo=FLOOR,hi=14;
 for(let k=0;k<44;k++){
  let mid=(lo+hi)/2;
  if(travel(9,mid,n)>d)hi=mid;else lo=mid;
 }
 return (lo+hi)/2;
}
function order(a,b){return b.x-a.x||a.ordinal-b.ordinal;}
function grouping(racers){
 const sorted=[...racers].sort(order),groups=[];
 for(const r of sorted){
  const last=groups.at(-1),ahead=last?.at(-1);
  const seconds=ahead?(ahead.x-r.x)/Math.max(r.v,1):0;
  if(!last||seconds>8+1e-7)groups.push([r]);
  else last.push(r);
 }
 return groups;
}
function occupancy(riders){
 const by=new Map();let min=Infinity;
 for(const r of riders){
  const key=r.phase==='wide'?'W'+r.lane:'N'+r.channel;
  if(!by.has(key))by.set(key,[]);
  by.get(key).push(r);
 }
 for(const [key,arr] of by){
  arr.sort(order);
  for(let i=1;i<arr.length;i++){
   const dx=arr[i-1].x-arr[i].x;min=Math.min(dx,min);
   if(dx<GAP-1e-5)return {ok:false,key,
    pair:[arr[i-1].id,arr[i].id],distance:q(dx)};
  }
 }
 return {ok:true,minGap:min===Infinity?null:q(min)};
}
export function createDiscretePelotonV3(n,{layout='staged',scenario='standard'}={}){
 if(![24,32,106,168].includes(n)||
   !['staged','double'].includes(layout)||
   !['standard','breakaway'].includes(scenario)||
   (scenario==='breakaway'&&n!==24))
  throw Error('unsupported research fixture');
 const racers=[];
 for(let i=0;i<n;i++){
  const row=Math.floor(i/(scenario==='breakaway'?2:5));
  const lane=scenario==='breakaway'?(i%2?3:1):i%5;
  const c=scenario==='breakaway'?(i%2):channel(lane,row);
  const two=scenario==='breakaway';
  racers.push({id:'r'+String(i).padStart(3,'0'),ordinal:i,
   x:q(two?1040-row*4.5:600-row*5.2),
   lane,initialLane:lane,channel:c,phase:two?'two_lane':'wide',
   v:9,preGateCruise:9,entryTick:two?0:null,
   energyJ:23000,passedFirst:two,passedSecond:false});
 }
 if(scenario==='standard')for(const c of [0,1]){
  const list=racers.filter(r=>r.channel===c).sort((a,b)=>
    b.x-a.x||
    [1,3,2,0,4].indexOf(a.initialLane)-
      [1,3,2,0,4].indexOf(b.initialLane));
  let previous=-1000;
  for(const r of list){
   const distance=GATE-r.x;
   let tick=Math.max(previous+3,Math.ceil(distance/(9*DT))+1);
   let cruise=approachSpeed(distance,tick);
   while(cruise===null&&tick<previous+15){
    tick++;cruise=approachSpeed(distance,tick);
   }
   if(cruise===null)throw Error('UNREACHABLE_NONSTOP_GATE_SLOT');
   r.entryTick=tick;r.preGateCruise=cruise;previous=tick;
  }
 }
 return {model:'DISCRETE_RESEARCH_NO_A64',dt:DT,layout,scenario,
  tick:0,time:0,racers,reason:null,records:[],officialWrites:0};
}
function desired(s,r){
 if(r.phase==='wide')return r.preGateCruise;
 if(s.scenario==='breakaway'){
  const lead=r.ordinal<4;
  if(s.time>=20&&s.time<55)return lead?13.8:9.1;
  if(s.time>=55&&s.time<122)return lead?7.2:11.5;
  return lead?9.4:9.2;
 }
 return (r.channel===0?10.35:8.95)+((r.ordinal%7)-3)*.025;
}
export function advanceDiscretePelotonV3(state){
 if(!state||state.reason||state.dt!==DT)throw Error('invalid POC checkpoint');
 const next=structuredClone(state);
 const old=occupancy(next.racers);
 if(!old.ok)throw Error('invalid starting lane occupancy');
 const laneMap=new Map(),ticks=next.tick+1;
 for(const r of next.racers){
  const key=r.phase==='wide'?'W'+r.lane:'N'+r.channel;
  if(!laneMap.has(key))laneMap.set(key,[]);
  laneMap.get(key).push(r);
 }
 const speeds=new Map();
 for(const arr of laneMap.values()){
  arr.sort(order);let lead=null;
  for(const r of arr){
   let want=desired(next,r);
   if(lead){
    const gap=lead.x-r.x,closing=Math.max(0,r.v-lead.v);
    const safe=GAP+1.2*closing+closing*closing/(2*B);
    if(gap<safe+1)want=Math.min(want,lead.v+(gap-safe)/1.4);
   }
   speeds.set(r.id,ramp(r.v,clip(want,FLOOR,14)));
   lead=r;
  }
 }
 for(const r of next.racers){
  r.v=speeds.get(r.id);r.x=q(r.x+r.v*DT);
  r.energyJ=q(clip(r.energyJ-Math.max(0,r.v-10)*30*DT+
     Math.max(0,9-r.v)*8*DT,0,23000));
  if(r.phase==='wide'){
   if(ticks>=r.entryTick){
    if(Math.abs(r.x-GATE)>3e-4){
     next.reason='GATE_SCHEDULE_NOT_REACHED';
     next.rejection={id:r.id,actualX:r.x,entryTick:r.entryTick};break;
    }
    r.phase='two_lane';r.lane=steer(r.channel);
   }else if(r.x>=GATE-1e-5){
    next.reason='EARLY_GATE_ENTRY';
    next.rejection={id:r.id,actualX:r.x};break;
   }
  }
  if(r.phase==='two_lane'&&r.x>1020)r.passedFirst=true;
  if(r.phase==='two_lane'&&r.x>1470)r.passedSecond=true;
 }
 if(next.reason)return next;
 const check=occupancy(next.racers);
 if(!check.ok){next.reason='LANE_SLOT_CONFLICT';next.rejection=check;return next;}
 if(next.racers.some(r=>r.v<FLOOR-1e-6)){
  next.reason='ACHIEVED_MOVING_FLOOR';return next;
 }
 next.tick=ticks;next.time=q(ticks*DT);
 const groups=grouping(next.racers);
 next.records.push({time:next.time,groups:groups.length,
  gateEntries:next.racers.filter(r=>r.phase==='two_lane').length,
  minSpeed:q(Math.min(...next.racers.map(r=>r.v))),
  minLaneGap:check.minGap,
  stateHash:hash(next.racers.map(r=>[r.id,r.x,r.lane,r.v,r.energyJ]))});
 return next;
}
export function runDiscretePelotonV3(initial,{seconds=180,checkpoint=null}={}){
 if(!Number.isInteger(seconds*10)||seconds<=0||seconds>180)
  throw Error('invalid POC horizon');
 const frozen=JSON.stringify(initial);
 let now=structuredClone(checkpoint??initial);
 const start=now.tick,splits=[];let split=false,rejoin=false;
 for(let i=0;i<seconds*10;i++){
  now=advanceDiscretePelotonV3(now);
  if(now.reason)break;
  if(now.scenario==='breakaway'){
   const count=now.records.at(-1).groups;
   if(count>1&&!split){split=true;splits.push({event:'split',at:now.time});}
   if(count===1&&split&&!rejoin){
    rejoin=true;splits.push({event:'rejoin',at:now.time});
   }
  }
 }
 if(JSON.stringify(initial)!==frozen)throw Error('fixture modified');
 let overtakes=0;
 for(let i=0;i<now.racers.length;i++)for(let j=i+1;j<now.racers.length;j++){
  const a=now.racers[i],b=now.racers[j];
  const aa=initial.racers.find(r=>r.id===a.id),
    bb=initial.racers.find(r=>r.id===b.id);
  if(aa.x+1<bb.x&&a.x>b.x+1&&a.channel!==b.channel)overtakes++;
  if(bb.x+1<aa.x&&b.x>a.x+1&&a.channel!==b.channel)overtakes++;
 }
 const g=grouping(now.racers);
 return {physical:now,evidence:{
  riders:now.racers.length,layout:now.layout,scenario:now.scenario,
  acceptedSeconds:q((now.tick-start)*DT),rejection:now.reason,
  rejectionDetail:now.rejection??null,
  all180Accepted:seconds===180&&now.tick-start===1800&&!now.reason,
  firstGateAll:now.racers.every(r=>r.passedFirst),
  secondGateAll:now.racers.every(r=>r.passedSecond),
  crossLaneOvertakes:overtakes,
  pelotonGroupCount:g.length,groupSizes:g.map(x=>x.length),
  splitSeen:split,rejoinSeen:rejoin,splitEvents:splits,
  minObservedLaneGap:Math.min(...now.records.map(r=>r.minLaneGap??Infinity)),
  minObservedSpeed:Math.min(...now.records.map(r=>r.minSpeed??Infinity)),
  traceHash:hash(now.records),noProductionWrites:true,
  notA64Physics:true,atomicLateralHandoff:true,officialWrites:0}};
}
