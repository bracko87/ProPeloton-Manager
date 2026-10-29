/** Step108: joint floor-aware lane commands, original A64 sporting authority.
 * Research only: no production activation, historical results or Supabase write.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {step107GlobalSlotCommandsV3} from './a2Step107GlobalLaneReservationsV3.mjs';
import {createHash} from 'node:crypto';
const q=n=>Math.round(n*1e6)/1e6;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const variants={
 base:{base:'slots_balanced',floor:0,assist:0,space:0},
 floor:{base:'slots_balanced',floor:.9,assist:0,space:0},
 wave:{base:'slots_balanced',floor:1.1,assist:.7,space:2.7},
 fast:{base:'slots_throughput',floor:.8,assist:.8,space:2.55},
 compact:{base:'slots_compact',floor:1.0,assist:.8,space:2.4},
 stagger:{base:'slots_staggered',floor:.9,assist:.6,space:2.9}
};
function verify(field,original,bookings){
 if(!field||field.reason!==null||field.dt!==.5||
   !Array.isArray(field.states)||field.states.length<2||
   field.states.length>168||!original?.states||
   field.states.length!==original.states.length||
   !Array.isArray(bookings)||bookings.length!==2*field.states.length)
  throw Error('A108 invalid source physical checkpoint');
}
export function step108JointCommandsV3(field,original,bookings,{
 mode='wave',centerTie='left'
}={}){
 verify(field,original,bookings);
 if(!Object.hasOwn(variants,mode)||!['left','right'].includes(centerTie))
  throw Error('A108 invalid candidate or symmetry branch');
 const spec=variants[mode];
 const base=step107GlobalSlotCommandsV3(field,original,bookings,{
   mode:spec.base,centerTie});
 if(base.allocation.coveredCount!==field.states.length||
   base.allocation.unassignedCenterRiders.length)
  throw Error('A108 incomplete global two-lane rider reservation');
 const requests=new Map(base.requests.map(r=>[r.id,{...r}]));
 const physical=new Map(field.states.map(s=>[s.id,s]));
 let floors=0,assists=0,clearanceCaps=0;
 for(const lane of base.allocation.channels){
  for(let i=0;i<lane.orderedRiderIds.length;i++){
   const id=lane.orderedRiderIds[i],s=physical.get(id),r=requests.get(id);
   const movingFloor=s.x+s.v*.5<680?6.5:4.5;
   // Requesting floor+margin does NOT guarantee A64 achieved speed:
   // core A64 may apply its own braking; Step95 vetoes such moves.
   if(spec.floor&&s.x<850&&r.speed<movingFloor+spec.floor){
    r.speed=q(movingFloor+spec.floor);floors++;
   }
   if(i===0||!spec.space)continue;
   const lead=physical.get(lane.orderedRiderIds[i-1]);
   const leadCmd=requests.get(lead.id);
   const distance=lead.x-s.x;
   const closure=Math.max(0,s.v-lead.v);
   const required=spec.space+closure*1.5+closure*closure/(2*.85);
   const targetCap=lead.v+(distance-required)/2;
   if(r.speed>targetCap+1e-7){
    // The lower limit is a COMMAND safeguard, not a sporting exemption.
    const minimum=movingFloor+spec.floor;
    r.speed=q(Math.min(r.speed,Math.max(targetCap,minimum)));
    clearanceCaps++;
   }
   if(spec.assist&&s.x<840&&distance<required+3){
    const request=Math.min(12.5,lead.v+spec.assist);
    if(leadCmd.speed<request){
      leadCmd.speed=q(request);assists++;
    }
   }
  }
 }
 return {mode,centerTie,requests:field.states.map(s=>requests.get(s.id)),
   floors,assists,clearanceCaps,
   originalA64Mandatory:true,achievedSpeedGateMandatory:true,
   completeRoster:true,noGroupSpeedLock:true,officialWrites:0};
}
function swept(field,requests){
 const input=structuredClone(field);
 if(requests.length!==input.states.length)throw Error('A108 incomplete request');
 for(let i=0;i<input.states.length;i++){
  const r=requests[i],s=input.states[i];
  if(r.id!==s.id||![r.speed,r.targetY].every(Number.isFinite)||
    r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A108 invalid rider command');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const physical=advanceNormalStartV3(input);
 if(physical.reason)return {ok:false,physical,reason:physical.reason};
 const scan=step95AchievedMovingGateV3(physical);
 if(!scan.admitted)return {ok:false,physical,
   reason:'A108_ACHIEVED_SPEED_VETO',scan};
 if(physical.acceptedSteps!==field.acceptedSteps+1||
    Math.abs(physical.at-field.at-.5)>1e-7)
  throw Error('A108 original A64 clock discontinuity');
 return {ok:true,physical,scan};
}
function lookahead(field,initial,bookings,mode,centerTie,depth){
 let current=field,first=null,failure=null,minimum=Infinity;
 for(let n=0;n<depth;n++){
  const p=step108JointCommandsV3(current,initial,bookings,{mode,centerTie});
  const s=swept(current,p.requests);
  if(!s.ok){
    failure={at:current.at,reason:s.reason,
      physicalPair:s.physical?.firstCollision?.pair??null,
      moving:s.scan??null};break;
  }
  if(n===0)first=p.requests;
  minimum=Math.min(minimum,...s.physical.states.map(x=>x.v));
  current=s.physical;
 }
 return {mode,requests:first,acceptedTicks:Math.round((current.at-field.at)*2),
   minimum:minimum===Infinity?null:q(minimum),failure,
   progress:q(current.cumulativeAdvancement-field.cumulativeAdvancement)};
}
/** All imagined future states are discarded. Only a separately repeated
 * A64+Step95-valid FIRST movement is ever accepted.
 */
export function step108SelectPhysicalTickV3(field,initial,bookings,{
 centerTie='left',modes=['base','floor','wave','fast','compact','stagger'],
 depth=3}={}){
 verify(field,initial,bookings);
 if(!['left','right'].includes(centerTie)||!Number.isInteger(depth)||
   depth<1||depth>6||!Array.isArray(modes)||!modes.length||
   modes.length>6||modes.some(m=>!Object.hasOwn(variants,m)))
   throw Error('A108 invalid selector');
 const previews=modes.map(mode=>lookahead(
    field,initial,bookings,mode,centerTie,depth));
 previews.sort((a,b)=>b.acceptedTicks-a.acceptedTicks||
   (b.minimum??-Infinity)-(a.minimum??-Infinity)||
   b.progress-a.progress||modes.indexOf(a.mode)-modes.indexOf(b.mode));
 const best=previews.find(x=>x.requests);
 if(!best)return {physical:null,previews,status:'NO_SAFE_FIRST_TICK'};
 const rechecked=swept(field,best.requests);
 if(!rechecked.ok)throw Error('A108 independent authoritative resweep failed');
 return {physical:rechecked.physical,previews,
   selectedMode:best.mode,status:'A64_AND_STEP95_RECHECKED',
   previewsDiscarded:true,officialWrites:0};
}
export function step108RunOriginalA64V3(initial,bookings,{
 seconds=180,centerTie='left',depth=3,
 modes=['base','floor','wave','fast','compact','stagger'],
 checkpoint=null,trace=false
}={}){
 verify(initial,initial,bookings);
 if(!Number.isFinite(seconds)||seconds<.5||seconds>180||
   Math.round(seconds*2)!==seconds*2)
  throw Error('A108 invalid duration');
 let now=structuredClone(checkpoint??initial);
 verify(now,initial,bookings);
 const before=JSON.stringify([initial,bookings]),start=now.at;
 const records=[],selections={};
 let rejected=null,previews=0,group=step101ObserveA64GroupsV3(now);
 for(let tick=0;tick<seconds*2;tick++){
  const result=step108SelectPhysicalTickV3(now,initial,bookings,{
   centerTie,modes,depth});
  previews+=result.previews.length;
  if(!result.physical){
   rejected={at:now.at,status:result.status,
     candidates:result.previews.map(p=>({mode:p.mode,
       acceptedTicks:p.acceptedTicks,reason:p.failure?.reason,
       contact:p.failure?.physicalPair,
       moving:p.failure?.moving}))};break;
  }
  now=result.physical;
  selections[result.selectedMode]=(selections[result.selectedMode]??0)+1;
  group=step101ObserveA64GroupsV3(now);
  records.push({at:now.at,
    minSpeed:q(Math.min(...now.states.map(s=>s.v))),
    count:group.groups.length,
    hash:hash(now.states.map(s=>[s.id,s.x,s.y,s.v,
      s.energy?.remainingWPrimeJoules]))});
 }
 if(JSON.stringify([initial,bookings])!==before)
  throw Error('A108 mutated source physics or bookings');
 return {physical:now,evidence:{
   n:now.states.length,centerTie,requestedSeconds:seconds,
   acceptedSeconds:q(now.at-start),acceptedTicks:records.length,
   rejection:rejected,previewsConsidered:previews,
   modesChosen:selections,
   firstGatePassed:now.states.every(s=>s.x>1020),
   secondGatePassed:now.states.every(s=>s.x>1470),
   achievedMin:records.length?
      Math.min(...records.map(x=>x.minSpeed)):null,
   groupCount:group.groups.length,
   pelotonCount:group.groups.find(g=>g.code==='P')?.riderIds.length??0,
   exactEightSecondRule:group.groupingThresholdSeconds===8,
   full180Accepted:seconds===180&&records.length===360,
   originalA64Unmodified:true,step95NeverBypassed:true,
   eachTickIndependentlyReswept:true,officialWrites:0,
   sportingGO:false,traceHash:hash(records),
   trace:trace?records:undefined}};
}


/** Step108B: fixed global reservation strategy per full accepted trajectory.
 * Receding-horizon selection above can change lane/spacing objectives every
 * half-second and was empirically unsafe. A locked strategy avoids policy
 * chattering; it is STILL subject to every independent A64/Step95 check.
 * The exact Step107 slots_balanced command is the 'base' control.
 */
export function step108RunLockedOriginalA64V3(initial,bookings,{
 mode='base',centerTie='left',seconds=180,checkpoint=null,trace=false
}={}){
 verify(initial,initial,bookings);
 if(!Object.hasOwn(variants,mode)||!['left','right'].includes(centerTie)||
   !Number.isFinite(seconds)||seconds<.5||seconds>180||
   Math.round(seconds*2)!==seconds*2)
  throw Error('A108 invalid fixed full-field policy');
 let now=structuredClone(checkpoint??initial);
 verify(now,initial,bookings);
 const source=JSON.stringify([initial,bookings]),started=now.at;
 let rejected=null,group=step101ObserveA64GroupsV3(now);
 const steps=[],requests={floors:0,assists:0,clearanceCaps:0};
 for(let i=0;i<seconds*2;i++){
  const choice=step108JointCommandsV3(now,initial,bookings,{mode,centerTie});
  requests.floors+=choice.floors;requests.assists+=choice.assists;
  requests.clearanceCaps+=choice.clearanceCaps;
  const attempt=swept(now,choice.requests);
  if(!attempt.ok){
   rejected={atSeconds:now.at,reason:attempt.reason,
     collisionPair:attempt.physical?.firstCollision?.pair??null,
     collisionContactTime:attempt.physical?.firstCollision?.time??null,
     originalRoadViolation:attempt.physical?.firstRoadViolation??null,
     movingGate:attempt.scan??null};
   break;
  }
  now=attempt.physical;
  group=step101ObserveA64GroupsV3(now);
  steps.push({at:now.at,
    minPhysicalMps:q(Math.min(...now.states.map(s=>s.v))),
    groups:group.groups.length,
    checksum:hash(now.states.map(s=>[s.id,s.x,s.y,s.v,
      s.energy?.remainingWPrimeJoules]))});
 }
 if(JSON.stringify([initial,bookings])!==source)
  throw Error('A108 fixed policy mutated source A64 fixture');
 return {physical:now,evidence:{
   mode,centerTie,n:now.states.length,requestedSeconds:seconds,
   acceptedSeconds:q(now.at-started),physicalSteps:steps.length,
   rejected,requests,
   firstGatePassed:now.states.every(s=>s.x>1020),
   secondGatePassed:now.states.every(s=>s.x>1470),
   minPhysicalSpeed:steps.length?
      Math.min(...steps.map(s=>s.minPhysicalMps)):null,
   groupCount:group.groups.length,
   pelotonCount:group.groups.find(g=>g.code==='P')?.riderIds.length??0,
   exactEightSecondRule:group.groupingThresholdSeconds===8,
   fixedOriginalLaneOrder:true,noMidRacePolicySwitch:true,
   originalA64SweptEveryTick:true,step95CheckedEveryTick:true,
   originalA64Unchanged:true,officialWrites:0,
   completed180:seconds===180&&steps.length===360,
   traceHash:hash(steps),trace:trace?steps:undefined,
   sportingGO:false,noProductionActivation:true}};
}
