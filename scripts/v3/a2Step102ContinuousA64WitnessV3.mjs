/** Step102: Original A64-swept continuous x/y/v joint movement witnesses.
 * Separate from the official/persisted engine: group observations never
 * change the physical motion; optimistic Step100 appointments never grant
 * permission to cross a bicycle or the road edge.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {createHash} from 'node:crypto';
const finite=Number.isFinite, EPS=1e-7;
const clip=(x,a,b)=>Math.min(b,Math.max(a,x));
const q=x=>Math.round(x*1e6)/1e6;
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
function validate(initial,bookings,appointments){
 if(!initial||initial.dt!==.5||!finite(initial.at)||
  !Array.isArray(initial.states)||initial.states.length<2||
  initial.states.length>168||initial.reason!==null||
  !Array.isArray(bookings)||!Array.isArray(appointments))
  throw Error('A102 invalid original A64 physical start or itinerary');
 const ids=new Set(initial.states.map(s=>s.id));
 if(ids.size!==initial.states.length||bookings.length!==ids.size*2||
  appointments.length!==ids.size*2)
  throw Error('A102 missing joint two-gate rider demand');
 const keys=new Set();
 for(const b of bookings){
  if(!b||!ids.has(b.id)||typeof b.gateId!=='string'||
     ![b.gateX,b.targetY].every(finite))
    throw Error('A102 invalid original gate booking');
  const k=b.id+'|'+b.gateId;
  if(keys.has(k))throw Error('A102 duplicated physical booking');
  keys.add(k);
 }
 const planned=new Set();
 for(const a of appointments){
  if(!a||!ids.has(a.id)||typeof a.gateId!=='string'||
     !finite(a.atSeconds)||a.atSeconds<0||
     !keys.has(a.id+'|'+a.gateId))
    throw Error('A102 invalid optimistic appointment');
  const k=a.id+'|'+a.gateId;
  if(planned.has(k))throw Error('A102 duplicate optimistic appointment');
  planned.add(k);
 }
}
export function step102JointPhysicalCommandsV3(field,bookings,appointments,{
 mode='row_wave',atSeconds=field.at
}={}){
 if(!['convoy','row_wave','scheduled_merge'].includes(mode)||
  !finite(atSeconds)||atSeconds<0||Math.abs(field.at-atSeconds)>EPS)
  throw Error('A102 invalid simultaneous physical mode/time');
 const bmap=new Map(),amap=new Map();
 for(const b of bookings){
  if(!bmap.has(b.id))bmap.set(b.id,[]);
  bmap.get(b.id).push(b);
 }
 for(const a of appointments)amap.set(a.id+'|'+a.gateId,a);
 const requests=field.states.map(s=>{
  const upcoming=(bmap.get(s.id)||[]).filter(b=>
    b.gateX>s.x-3).sort((a,b)=>a.gateX-b.gateX)[0];
  const d=Math.abs((s.startY??s.y)-2.2);
  // Symmetric roles are properties of actual starting geometry, not IDs.
  const role=d>1.55?'OUTER':d<.43?'CENTER':'INNER';
  const roleSpeed=role==='INNER'?10.45:role==='CENTER'?9.1:8.25;
  const a=upcoming?amap.get(s.id+'|'+upcoming.gateId):null;
  const remain=a?a.atSeconds-atSeconds:0;
  const appointmentSpeed=upcoming&&remain>.5?
    clip((upcoming.gateX-s.x)/remain,7.3,10.65):9;
  const speed=mode==='convoy'?9:
    mode==='row_wave'?roleSpeed:
    clip(.55*roleSpeed+.45*appointmentSpeed,7.3,10.65);
  let targetY=s.y;
  if(mode!=='convoy'&&upcoming&&upcoming.gateX-s.x<210&&
     Math.abs(s.y-upcoming.targetY)>EPS){
    const sign=Math.sign(upcoming.targetY-s.y);
    // The full swept steering corridor must be empty over simultaneous
    // current body locations before proposing lateral motion.
    const crossing=field.states.some(t=>{
      if(t.id===s.id||Math.abs(t.x-s.x)>=3.15)return false;
      return sign*(t.y-s.y)>EPS&&
        sign*(t.y-upcoming.targetY)<.85;
    });
    if(!crossing)targetY=upcoming.targetY;
  }
  return {id:s.id,speed:q(speed),targetY:q(targetY),role,
    bookedGate:upcoming?.gateId??null};
 });
 return {mode,requests,requestedSteering:requests.filter((r,i)=>
   Math.abs(r.targetY-field.states[i].y)>EPS).length,
  officialWrites:0,noPredictionOverridesA64:true};
}
export function step102OriginalA64WitnessV3(initial,bookings,appointments,{
 mode='row_wave',seconds=30,keepFullTrace=false
}={}){
 validate(initial,bookings,appointments);
 if(!finite(seconds)||seconds<.5||seconds>180||
    seconds/.5!==Math.round(seconds/.5)||typeof keepFullTrace!=='boolean')
  throw Error('A102 invalid bounded witness horizon');
 const original=JSON.stringify([initial,bookings,appointments]);
 let field=structuredClone(initial),lastAccepted=field;
 const report=[],rejected=[],policies={};
 let commandedSteering=0,acceptedSteering=0;
 let status='HORIZON_NOT_COMPLETE',reason=null;
 const endAt=field.at+seconds;
 const groupsStart=step101ObserveA64GroupsV3(field);
 let lastGroups=groupsStart;
 for(let k=0;k<seconds*2;k++){
  const plan=step102JointPhysicalCommandsV3(field,bookings,appointments,{
    mode,atSeconds:field.at});
  commandedSteering+=plan.requestedSteering;
  const proposed=structuredClone(field);
  for(let i=0;i<proposed.states.length;i++){
    proposed.states[i].desired=plan.requests[i].speed;
    proposed.states[i].targetY=plan.requests[i].targetY;
  }
  const actual=advanceNormalStartV3(proposed);
  if(actual.reason){
    reason=actual.reason;status='ORIGINAL_A64_PHYSICAL_REJECTION';
    rejected.push({atSeconds:field.at,reason,
      firstCollision:actual.firstCollision??null,
      firstRoadViolation:actual.firstRoadViolation??null});
    break;
  }
  if(actual.acceptedSteps!==field.acceptedSteps+1||
     Math.abs(actual.at-field.at-.5)>EPS)
    throw Error('A102 original A64 accepted tick discontinuity');
  const achieved=step95AchievedMovingGateV3(actual);
  if(!achieved.admitted){
    reason='A102_ACHIEVED_MOVING_FLOOR_VETO';
    status='SPORTING_MOVEMENT_REJECTION';
    rejected.push({atSeconds:field.at,reason,
      upstreamSlow:achieved.upstreamSlow,
      downstreamSlow:achieved.downstreamSlow,nearStop:achieved.nearStop});
    break;
  }
  acceptedSteering+=actual.states.filter((s,i)=>
    Math.abs(s.y-field.states[i].y)>EPS).length;
  const groups=step101ObserveA64GroupsV3(actual,field);
  lastGroups=groups;
  report.push({atSeconds:actual.at,
    rearX:q(Math.min(...actual.states.map(s=>s.x))),
    frontX:q(Math.max(...actual.states.map(s=>s.x))),
    lowestAchievedMps:q(Math.min(...actual.states.map(s=>s.v))),
    eightSecondRaceGroups:groups.groups.length,
    pelotonRiders:groups.groups.find(g=>g.code==='P')?.riderIds.length??0,
    acceptedSteeringRiders:actual.states.filter((s,i)=>
      Math.abs(s.y-field.states[i].y)>EPS).length,
    physicalHash:digest(actual.states.map(s=>[
      s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
  field=actual;lastAccepted=actual;policies[mode]=(policies[mode]??0)+1;
 }
 if(!reason&&Math.abs(field.at-endAt)<EPS)status='FULL_REQUESTED_HORIZON_ACCEPTED';
 if(JSON.stringify([initial,bookings,appointments])!==original)
  throw Error('A102 mutated original physical start or schedule');
 const evidence={mode,requestedSeconds:seconds,
   acceptedSeconds:q(field.at-initial.at),lastAcceptedAt:q(field.at),
   status,reason,physicalSolver:'UNCHANGED_ORIGINAL_A64',
   initialRaceGroups:groupsStart.groups.length,
   finalRaceGroups:lastGroups.groups.length,
   eightSecondGroupRulePreserved:groupsStart.groupingThresholdSeconds===8&&
      lastGroups.groupingThresholdSeconds===8,
   rejected,
   commandedSteering,acceptedSteering,
   minAcceptedSpeedMps:report.length?
     Math.min(...report.map(r=>r.lowestAchievedMps)):null,
   firstGatePassedByEveryRider:field.states.every(s=>s.x>1020),
   secondGatePassedByEveryRider:field.states.every(s=>s.x>1470),
   physicalTraceHash:digest(report),
   acceptedSamples:report.length,
   lastSample:report.at(-1)??null,
   snapshots:keepFullTrace?report:undefined,
   replayCheckpointAvailable:true,
   noGroupSpeedLock:true,originalA64Unmodified:true,
   noLiveIntegration:true,officialWrites:0,
   full180SportingAccepted:!reason&&seconds===180&&
      field.states.every(s=>s.x>1470),
   sportingDecision:'NO_GO_UNTIL_FULL_180'};
 return {evidence,physical:lastAccepted};
}
