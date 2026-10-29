/** Step87: geometry-neutral multi-row corridor partial-order admission.
 *
 * Works only with CURRENT accepted rider states, current requests and
 * pre-existing gate booking intent; re-evaluates order every 0.5s.
 * Enforces necessary arrival/steering windows and directed precedence
 * over neighboring rows and conflicting lateral corridors, not a
 * sufficient 2D proof of a safe merge. A64 swept full-body physics,
 * road boundary and actual W-prime checks always remain authoritative.
 */
import {step82ArrivalIntervalV3} from './a2Step82FeasibleZipperWindowsV3.mjs';
const EPS=1e-7,L=.38,A=.45,B=.85,HALF=.3;
const fin=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function validate(states,requests,bookings,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!fin(at)||at<0)
 throw Error('A87 invalid field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   !r||r.id!==s.id||![s.x,s.y,s.v,r.speed,r.targetY]
   .every(fin)||s.v<0||s.v>50||s.y<0||s.y>4.4||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A87 invalid bicycle/request');
  ids.add(s.id);
 }
 for(const b of bookings)if(!b||!ids.has(b.id)||
  ![b.gateX,b.targetY,b.scheduledSeconds].every(fin)||
  b.targetY<0||b.targetY>4.4||b.gateX<0)
  throw Error('A87 invalid booking');
}
function compare(a,b){
 // Present longitudinal position owns precedence. Exact x ties
 // use *distance to road centre*, not array index or ID.
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 const da=Math.abs(a.s.y-2.2),db=Math.abs(b.s.y-2.2);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 return 0; // true geometry tie: no artificial winner
}
function nextBooking(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
function crossingConflict(a,b){
 if(a.book.gateId!==b.book.gateId)return false;
 const sameLane=Math.abs(a.book.targetY-b.book.targetY)<.81;
 const aLo=Math.min(a.s.y,a.book.targetY)-HALF;
 const aHi=Math.max(a.s.y,a.book.targetY)+HALF;
 const bLo=Math.min(b.s.y,b.book.targetY)-HALF;
 const bHi=Math.max(b.s.y,b.book.targetY)+HALF;
 const sweeping=aHi>=bLo-.2&&bHi>=aLo-.2;
 return sameLane||
  (sweeping&&Math.abs(a.s.x-b.s.x)<11.5);
}
function leadClearance(front,rear,steerSeconds){
 const closing=Math.max(0,rear.v-front.v);
 return 2.65+Math.min(steerSeconds,4)*closing+
  closing*closing/(2*B);
}
/** An order graph is a diagnostic, not collision clearance.
 * Directed edges follow current front-to-back geometrical precedence;
 * ties are marked ambiguous and do not select an ID-based winner.
 * Impossibility diagnoses apply to these REQUESTS and bounds only.
 */
export function step87CorridorOrderV3(states,requests,bookings,{
 atSeconds=0,searchSeconds=90,minMovingSpeedMps=7.3,
 maxMovingSpeedMps=12.5,maxNeighborDistM=32,
 minCorridorSeparationM=2.8
}={}){
 validate(states,requests,bookings,atSeconds);
 if(![searchSeconds,minMovingSpeedMps,maxMovingSpeedMps,
  maxNeighborDistM,minCorridorSeparationM].every(fin)||
  searchSeconds<20||searchSeconds>120||
  minMovingSpeedMps<5||minMovingSpeedMps>10||
  maxMovingSpeedMps<minMovingSpeedMps||maxMovingSpeedMps>20||
  maxNeighborDistM<15||maxNeighborDistM>70||
  minCorridorSeparationM<2||minCorridorSeparationM>4)
  throw Error('A87 invalid order bounds');
 const byId=new Map(),entries=[],warnings=[];
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 for(let i=0;i<states.length;i++){
  const s=states[i],book=nextBooking(s,byId);
  if(!book)continue;
  const window=step82ArrivalIntervalV3(s,book.gateX,{
   maxSeconds:searchSeconds,
   minMovingSpeed:minMovingSpeedMps,
   maxMovingSpeed:maxMovingSpeedMps});
  const steerSeconds=Math.abs(book.targetY-s.y)/L;
  const e=window.earliest===null?null:
   q(atSeconds+Math.max(window.earliest,steerSeconds));
  const latest=window.latest===null?null:
   q(atSeconds+window.latest);
  entries.push({i,s,book,earliest:e,latest,
   assigned:e===null?null:q(Math.max(
    e,Math.min(book.scheduledSeconds,e+1.75))),
   steerSeconds,predecessors:[],blocked:false,
   deferred:false,reachable:e!==null});
 }
 // Sort only by geometry; unresolved ties are explicit and conservative.
 const sorted=entries.slice().sort(compare);
 const edges=[],ambiguous=new Set();
 for(let k=0;k<sorted.length;k++){
  const rear=sorted[k];
  for(let h=0;h<k;h++){
   const front=sorted[h];
   if(front.book.gateId!==rear.book.gateId||
    Math.abs(front.s.x-rear.s.x)>maxNeighborDistM||
    !crossingConflict(front,rear))continue;
   const c=compare(front,rear);
   if(c===0){
    ambiguous.add(front.i);ambiguous.add(rear.i);
    warnings.push({type:'GEOMETRY_TIE_NO_ARBITRARY_PRIORITY',
     a:front.i,b:rear.i});
    continue;
   }
   const ahead=c<0?front:rear,behind=c<0?rear:front;
   const identical=Math.abs(ahead.book.targetY-
    behind.book.targetY)<.81;
   const sep=Math.max(.5,minCorridorSeparationM/
    Math.max(minMovingSpeedMps,
     Math.min(ahead.s.v,behind.s.v)),
    identical?leadClearance(ahead.s,behind.s,
     behind.steerSeconds)/Math.max(minMovingSpeedMps,
      behind.s.v):.65);
   edges.push({ahead:ahead.i,behind:behind.i,
    requiredGapSeconds:q(sep),type:identical?
     'SHARED_NARROW_CORRIDOR':'CROSSING_STEERING_SWEEP'});
   behind.predecessors.push({i:ahead.i,sec:sep});
  }
 }
 const byIndex=new Map(entries.map(e=>[e.i,e]));
 // Current geometry gives a DAG. Propagate actual earlier permissible
 // arrival times along ALL precedences, not merely a paired warning.
 for(const e of sorted){
  if(e.assigned===null)continue;
  for(const p of e.predecessors){
   const front=byIndex.get(p.i);
   if(front?.assigned!==null&&front?.assigned!==undefined)
    e.assigned=q(Math.max(e.assigned,
     front.assigned+p.sec));
  }
  if(e.latest!==null&&e.assigned>e.latest+EPS){
   e.blocked=true;
   warnings.push({type:'REQUESTED_WINDOW_TOO_LATE',
    i:e.i,assigned:e.assigned,latest:e.latest});
  }
  if(e.assigned>e.earliest+1.1)e.deferred=true;
 }
 for(const i of ambiguous){
  const e=byIndex.get(i);
  if(e){e.blocked=true;e.deferred=true}
 }
 return {
  status:warnings.some(w=>w.type==='REQUESTED_WINDOW_TOO_LATE')?
   'NECESSARY_REQUEST_WINDOW_PRESSURE':
   'PROVISIONAL_GEOMETRY_PARTIAL_ORDER',
  entries:entries.map(e=>({
   i:e.i,id:e.s.id,gateId:e.book.gateId,
   gateX:e.book.gateX,targetY:e.book.targetY,
   currentX:e.s.x,earliest:e.earliest,latest:e.latest,
   assigned:e.assigned,steerSeconds:q(e.steerSeconds),
   blocked:e.blocked,deferred:e.deferred,
   preceding:e.predecessors.length,reachable:e.reachable
  })),edges,warnings,
  linkedRiders:entries.filter(e=>e.predecessors.length>0).length,
  geometryTies:ambiguous.size,
  deferredRiders:entries.filter(e=>e.deferred).length,
  pressuredRiders:entries.filter(e=>e.blocked).length,
  noSufficientJointFeasibilityProof:true,
  neverOverridesA64Physics:true,
  researchOnly:true,officialWrites:0
 };
}
export function step87CorridorCandidatesV3(states,requests,bookings,{
 atSeconds=0,minMovingSpeedMps=7.3
}={}){
 const order=step87CorridorOrderV3(states,requests,bookings,{
  atSeconds,minMovingSpeedMps});
 const byIndex=new Map(order.entries.map(e=>[e.i,e]));
 const candidates=['order_hold','order_release','order_pace','order_balanced']
 .map(variant=>{
  const out=requests.map(r=>({...r}));
  let held=0,released=0,paced=0,leadersAssisted=0,
   locallyProtected=0;
  for(let i=0;i<states.length;i++){
   const s=states[i],r=out[i],e=byIndex.get(i);
   if(!e||!e.reachable)continue;
   const predecessors=order.edges.filter(edge=>edge.behind===i);
   let clear=true,frontWithRoom=false,physicalPaceCap=Infinity;
   for(const edge of predecessors){
    const lead=states[edge.ahead],gap=lead.x-s.x;
    const steering=Math.abs(e.targetY-s.y)/L;
    const closing=Math.max(0,s.v-lead.v);
    const need=leadClearance(lead,s,steering)+closing*1.1;
    if(gap<need+1.4){
     clear=false;
     // Protect achieved forward headway without creating a stop wave.
     // A64 still limits the actual braking and swept body motion.
     const margin=clip((gap-need)/3,-.75,.4);
     physicalPaceCap=Math.min(physicalPaceCap,
      Math.max(minMovingSpeedMps,lead.v+margin));
    }
    if(gap<need+9&&lead.v<s.v+.3)frontWithRoom=true;
   }
   const wait=e.blocked||!clear;
   if(wait&&Math.abs(r.targetY-s.y)>EPS){
    r.targetY=s.y;held++;
   }
   if(!wait&&clear&&variant==='order_release'&&
     Math.abs(e.targetY-s.y)>EPS&&
     Math.abs(r.targetY-s.y)<EPS){
    r.targetY=e.targetY;released++;
   }
   if((variant==='order_pace'||variant==='order_balanced')&&
    physicalPaceCap<r.speed-EPS){
    const speed=Math.max(minMovingSpeedMps,physicalPaceCap);
    if(speed<r.speed-EPS){r.speed=q(speed);locallyProtected++}
   }
   if((variant==='order_pace'||variant==='order_balanced')&&
    e.assigned!==null&&e.assigned>e.earliest+.9){
    const remaining=e.assigned-atSeconds,dist=e.gateX-s.x;
    if(remaining>.5&&dist>0){
     const speed=clip(dist/remaining,minMovingSpeedMps,11.7);
     if(speed<r.speed-EPS){
      r.speed=q(Math.max(speed,s.v-.5));paced++;
     }
    }
   }
   // A leader with an occupied lane ahead must not be boosted.
   // Assist a deferred row only when geometric forward clearance exists.
   if(variant==='order_balanced'&&frontWithRoom&&clear&&
    e.preceding===0&&s.v<9.6){
    const speed=Math.min(9.7,s.v+.225);
    if(speed>r.speed+EPS){r.speed=q(speed);leadersAssisted++}
   }
  }
  return {policy:'order_'+variant,requests:out,held,released,
   paced,leadersAssisted,locallyProtected,officialWrites:0};
 });
 return {order,candidates,
  physicalClearanceNotCertified:true,
  acceptsNoMovement:true,
  actualA64SweptValidationRequired:true,
  officialWrites:0};
}
