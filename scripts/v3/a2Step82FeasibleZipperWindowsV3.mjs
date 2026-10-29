/** A82: local necessary-condition feasibility and attainable zipper requests.
 *
 * This algorithm certifies only INDIVIDUAL acceleration-bounded arrival
 * intervals and consistency of time-ordered shared corridors. It never
 * certifies sufficient 2D joint feasibility, predicts accepted physical
 * state, overwrites a booking, or commits movement. Original A64 swept
 * all-bicycle/road/energy integrator is always the final authority.
 */
const A=.45,B=.85,L=.38,EPS=1e-7;
const q=x=>Math.round(x*1e6)/1e6;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fin=Number.isFinite;
function reach(s,t,a,terminal){
 const until=Math.min(t,Math.abs(terminal-s.v)/Math.abs(a));
 return s.v*until+.5*a*until*until+terminal*(t-until);
}
function timeFor(s,gateX,a,terminal,maxSeconds){
 if(gateX<=s.x+EPS)return 0;
 const dist=gateX-s.x;
 if(reach(s,maxSeconds,a,terminal)<dist-EPS)return null;
 let lo=0,hi=maxSeconds;
 for(let k=0;k<45;k++){
  const mid=(lo+hi)/2;
  if(reach(s,mid,a,terminal)>=dist)hi=mid;
  else lo=mid;
 }
 return q(hi);
}
/** Individual legal speed envelope; no claims about other bicycles.
 * Above/below these arrival bounds means at least one unachievable
 * kinematic request even before energy/road/neighbor constraints.
 */
export function step82ArrivalIntervalV3(s,gateX,{
 maxSeconds=60,minMovingSpeed=5,maxMovingSpeed=12.5
}={}){
 if(!s||![s.x,s.y,s.v,gateX,maxSeconds,minMovingSpeed,
 maxMovingSpeed].every(fin)||maxSeconds<1||maxSeconds>240||
 minMovingSpeed<1||maxMovingSpeed>50||
 minMovingSpeed>maxMovingSpeed||s.v<0||s.v>50)
 throw Error('A82 invalid acceleration envelope input');
 const earliest=timeFor(s,gateX,A,Math.max(s.v,maxMovingSpeed),maxSeconds);
 const latest=timeFor(s,gateX,-B,Math.min(s.v,minMovingSpeed),maxSeconds);
 return {status:earliest===null?'OUTSIDE_SEARCH_HORIZON':
 'INDIVIDUAL_NECESSARY_INTERVAL',earliest,latest,
  minMovingSpeed,maxMovingSpeed,maxSeconds,
  sufficientForJointPassage:false};
}
function validate(states,requests,bookings,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||states.length!==requests.length||
 !Array.isArray(bookings)||!fin(at)||at<0)throw Error('A82 invalid field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   !r||r.id!==s.id||![s.x,s.y,s.v,r.speed,r.targetY]
   .every(fin)||s.v<0||r.speed<0||r.speed>50||
   r.targetY<0||r.targetY>4.4)throw Error('A82 invalid bicycle');
  ids.add(s.id);
 }
 for(const b of bookings){
  if(!ids.has(b.id)||![b.gateX,b.scheduledSeconds,b.targetY]
   .every(fin))throw Error('A82 invalid bicycle booking');
 }
}
const geomPriority=(a,b)=>{
 // Longitudinal order, then symmetric center proximity;
 // exact physical ties have NO ID-based or arbitrary priority.
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 const da=Math.abs(a.s.y-2.2),db=Math.abs(b.s.y-2.2);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 return 0;
};
/** Local necessary interval consistency; conservative UNSAT means the
 * *requested shared-corridor booking arrangement* is infeasible under
 * these selected bounds, NOT that racing on this route is impossible.
 */
export function step82WindowContractV3(states,requests,bookings,{
 atSeconds=0,searchSeconds=50,minMovingSpeed=5,
 minPassSeparationM=2.55,sharedLaneM=.85
}={}){
 validate(states,requests,bookings,atSeconds);
 if(![searchSeconds,minMovingSpeed,minPassSeparationM,sharedLaneM]
 .every(fin)||searchSeconds<2||searchSeconds>120||
 minPassSeparationM<1.8||minPassSeparationM>4||
 sharedLaneM<.8||sharedLaneM>1.2)throw Error('A82 invalid constraints');
 const byId=new Map(),items=[],contradictions=[];
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 for(let i=0;i<states.length;i++){
  const s=states[i],list=(byId.get(s.id)||[]).filter(b=>
   b.gateX>s.x+EPS&&b.scheduledSeconds>=atSeconds-1);
  const b=list.sort((a,c)=>a.gateX-c.gateX)[0];
  if(!b)continue;
  const interval=step82ArrivalIntervalV3(s,b.gateX,{
   maxSeconds:searchSeconds,minMovingSpeed});
  if(interval.status!=='INDIVIDUAL_NECESSARY_INTERVAL'){
   // Outside analysis horizon is UNKNOWN, not unsatisfiable.
   continue;
  }
  const earliest=atSeconds+interval.earliest,
   latest=interval.latest===null?null:atSeconds+interval.latest;
  items.push({i,s,booking:b,earliest:q(earliest),
   latest:latest===null?null:q(latest),
   assigned:q(Math.max(earliest,b.scheduledSeconds)),
   adjusted:false,blocked:false});
 }
 const lanes=new Map(),sepSeconds=minPassSeparationM/minMovingSpeed;
 for(const row of items){
  const k=String(row.booking.gateId??'g')+'|'+
   (row.booking.targetY<2.2?'L':
    row.booking.targetY>2.2?'R':'C');
  if(!lanes.has(k))lanes.set(k,[]);
  lanes.get(k).push(row);
 }
 let adjusted=0,ambiguous=0;
 for(const [lane,group] of lanes){
  const ordered=group.slice().sort(geomPriority);
  let prev=null;
  for(const current of ordered){
   if(prev){
    const sameTrack=Math.abs(prev.booking.targetY-
     current.booking.targetY)<sharedLaneM;
    if(sameTrack&&geomPriority(prev,current)===0){
     contradictions.push({type:'AMBIGUOUS_SAME_X_SAME_LANE',
      lane,i:prev.i,j:current.i});
     current.blocked=true;prev.blocked=true;ambiguous++;
    }else if(sameTrack){
     const minimum=prev.assigned+sepSeconds;
     if(current.assigned<minimum-EPS){
      current.assigned=q(minimum);current.adjusted=true;adjusted++;
     }
    }
   }
   if(current.latest!==null&&current.assigned>current.latest+EPS){
    contradictions.push({type:'NECESSARY_TIME_WINDOW_CONFLICT',
     lane,i:current.i,earliest:current.earliest,
     latest:current.latest,required:current.assigned});
    current.blocked=true;
   }
   prev=current;
  }
 }
 const byIndex=new Map(items.map(item=>[item.i,item]));
 // Important distinction: these diagnoses are not direct motion authority.
 // A63/A64 must still independently accept any resulting first movement.
 return {status:contradictions.length?
  'REQUEST_CONTRACT_INFEASIBLE':'REQUEST_CONTRACT_NECESSARY_CONSISTENT',
  entries:items.map(({i,booking,earliest,latest,assigned,
    adjusted,blocked})=>({i,id:states[i].id,gateX:booking.gateX,
   bookedY:booking.targetY,earliest,latest,assigned,
   adjusted,blocked})),
  adjusted,ambiguous,contradictions,
  modeledRows:items.length,laneGroups:lanes.size,
  timeSeparationSeconds:q(sepSeconds),
  sufficientForJointPassage:false,
  doesNotAuthorizeCollisionOrEnergy:true,
  atSeconds,
  researchOnly:true,officialWrites:0};
}
function variant(states,baseline,contract,mode,{paceFloor=6.7}={}){
 const requests=baseline.map(r=>({...r}));
 let held=0,slowed=0,assisted=0,windowWarnings=0;
 const byIndex=new Map(contract.entries.map(e=>[e.i,e]));
 for(let i=0;i<states.length;i++){
  const c=byIndex.get(i),s=states[i],r=requests[i];
  if(!c)continue;
  if(c.blocked){
   windowWarnings++;
   // A rejected proposed shared lane must not cause mass standstill.
   if(mode==='hold_unavailable'||mode==='combined'){
    if(Math.abs(s.targetY-s.y)>EPS){r.targetY=s.y;held++}
   }
   continue;
  }
  // Use current request to move toward a feasible necessary time window.
  // The physical solver independently limits actual acceleration and
  // rejects any invalid full 2D swept movement.
  const dx=c.gateX-s.x;
  if(dx<=EPS||c.assigned<=EPS)continue;
  const t=Math.max(.5,c.assigned-contract.atSeconds);
  const target=clamp(dx/t,paceFloor,12.5);
  if((mode==='window_pace'||mode==='combined')&&c.adjusted&&
    target<r.speed-EPS){r.speed=target;slowed++}
  if((mode==='leader_protect'||mode==='combined')&&
    !c.adjusted&&dx<120&&r.speed<s.v+A*.5){
   r.speed=s.v+A*.5;assisted++;
  }
  if(mode==='hold_unavailable'&&c.adjusted&&
    Math.abs(r.targetY-s.y)>EPS&&c.assigned>c.earliest+1.5){
   r.targetY=s.y;held++;
  }
 }
 return {policy:'contract_'+mode,requests,held,slowed,
  assisted,windowWarnings,officialWrites:0};
}
export function step82ContractCandidatesV3(states,baseline,bookings,{
 atSeconds=0,searchSeconds=50,paceFloor=6.7
}={}){
 const contract=step82WindowContractV3(states,baseline,bookings,{
  atSeconds,searchSeconds});
 if(!fin(paceFloor)||paceFloor<5||paceFloor>9)
  throw Error('A82 invalid pace floor');
 return {contract,candidates:[
  'window_pace','hold_unavailable','leader_protect','combined'
 ].map(mode=>variant(states,baseline,contract,mode,{paceFloor})),
  diagnosticOnly:true,noProductionApproval:true,officialWrites:0};
}
