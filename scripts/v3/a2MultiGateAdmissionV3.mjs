/** A77 research-only multi-gate necessary arrival-window screen.
 * Not a physical two-dimensional controller; no collision clearance implied.
 * All profiles are synthetic. Neither live racing nor Supabase is accessed.
 */
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
import {physicalArrivalWindowV3} from './a2TwoSlotFeasibilityV3.mjs'
const EPS=1e-7

export function multiGateLateralCapacityV3(width,half=.3,separation=.8001){
 if(![width,half,separation].every(Number.isFinite)||width<=0||
    half<0||half>.5||separation<=.8)throw Error("A77 invalid capacity");
 return width<2*half?0:Math.floor((width-2*half+1e-9)/separation)+1;
}

export function discoverMultiGateGeometryV3(kind,{startX=0,endX=1800,stepM=1,half=.3,separation=.8001}={}){
 if(![startX,endX,stepM].every(Number.isFinite)||startX<0||
    endX<=startX||endX-startX>10000||stepM<=0||stepM>2)
    throw Error("A77 invalid road scan");
 const referenceWidth=researchRoadEnvelopeV3(kind,startX).widthM;
 let active=null;const gates=[];
 for(let i=0,n=Math.ceil((endX-startX)/stepM);i<=n;i++){
  const x=Math.min(endX,startX+i*stepM);
  const box=researchRoadEnvelopeV3(kind,x);
  if(box.widthM<referenceWidth-EPS){
   if(!active)active={entryX:x,exitX:x,gateX:x,widthM:box.widthM};
   active.exitX=x;
   if(box.widthM<active.widthM-EPS){
    active.widthM=box.widthM;active.gateX=x;
   }
  }else if(active){
   const road=researchRoadEnvelopeV3(kind,active.gateX);
   gates.push({...active,id:"gate-"+(gates.length+1),exitX:x,
    minY:road.minY,maxY:road.maxY,
    capacity:multiGateLateralCapacityV3(active.widthM,half,separation)});
   active=null;
  }
 }
 if(active){
  const road=researchRoadEnvelopeV3(kind,active.gateX);
  gates.push({...active,id:"gate-"+(gates.length+1),
   minY:road.minY,maxY:road.maxY,
   capacity:multiGateLateralCapacityV3(active.widthM,half,separation)});
 }
 return {kind,referenceWidth,referenceCapacity:multiGateLateralCapacityV3(
   referenceWidth,half,separation),gates,synthetic:true};
}

export function auditMultiGateAdmissionV3(states,kind,{
 half=.3,separation=.8001,minSpeedMps=5,maxSpeedMps=50,
 spacingSeconds=.5,deadlineSeconds=180,scanStartX=0,scanEndX=1800
}={}){
 if(!Array.isArray(states)||states.length<2||states.length>168||
    ![half,separation,minSpeedMps,maxSpeedMps,spacingSeconds,deadlineSeconds]
    .every(Number.isFinite)||half<0||half>.5||separation<=.8||
    spacingSeconds<=0||spacingSeconds>5||minSpeedMps<1||
    minSpeedMps>10||maxSpeedMps<minSpeedMps||maxSpeedMps>50||
    deadlineSeconds<=0||deadlineSeconds>3600)
    throw Error("A77 invalid admission parameters");
 const route=discoverMultiGateGeometryV3(kind,{startX:scanStartX,
  endX:scanEndX,half,separation});
 const seen=new Set(),rowsByX=new Map();
 const centre=2.2;
 for(const s of states){
  if(!s||typeof s.id!=="string"||!s.id||seen.has(s.id)||
     ![s.x,s.y,s.v,s.desired,s.startX].every(Number.isFinite)||
     s.v<minSpeedMps||s.v>maxSpeedMps)
    throw Error("A77 invalid rider or duplicate");
  seen.add(s.id);
  const box=researchRoadEnvelopeV3(kind,s.x);
  if(s.y-half<box.minY-EPS||s.y+half>box.maxY+EPS)
    return {kind,status:"INVALID_START_BODY",gates:route.gates,
     bookings:[],unresolved:[{reason:"BODY_OUTSIDE_START_ROAD"}],
     noCollisionGuarantee:true,officialWrites:0};
  const k=String(Math.round(s.startX*1000));
  if(!rowsByX.has(k))rowsByX.set(k,[]);
  rowsByX.get(k).push(s);
 }
 const rows=[...rowsByX.values()].sort((a,b)=>b[0].startX-a[0].startX);
 for(const row of rows){
  const sorted=[...row].sort((a,b)=>a.y-b.y);
  for(let i=1;i<sorted.length;i++){
   if(Math.abs(sorted[i].x-sorted[i-1].x)<2.05&&
      sorted[i].y-sorted[i-1].y<separation-EPS)
    return {kind,status:"INVALID_START_BODY",gates:route.gates,
     bookings:[],unresolved:[{reason:"START_BODY_OVERLAP"}],
     noCollisionGuarantee:true,officialWrites:0};
  }
 }
 const bookings=[],unresolved=[];
 let prev=new Map();
 for(const gate of route.gates){
  if(gate.capacity<1){unresolved.push({gateId:gate.id,
   reason:"NO_PHYSICAL_LATERAL_CAPACITY"});continue;}
  const slots=gate.capacity,halfSlots=Math.floor(slots/2);
  const leftTarget=gate.minY+half+.05,rightTarget=gate.maxY-half-.05;
  const targets=slots===1?[centre]:Array.from({length:slots},
   (_,i)=>leftTarget+(rightTarget-leftTarget)*i/(slots-1));
  let release=0,blocked=false;
  for(const row of rows){
   if(blocked){unresolved.push({gateId:gate.id,rowStartX:row[0].startX,
    reason:"BLOCKED_BY_EARLIER_ROW"});continue;}
   const left=row.filter(s=>s.y<centre-EPS).sort(
    (a,b)=>Math.abs(a.y-centre)-Math.abs(b.y-centre));
   const right=row.filter(s=>s.y>centre+EPS).sort(
    (a,b)=>Math.abs(a.y-centre)-Math.abs(b.y-centre));
   const mid=row.filter(s=>Math.abs(s.y-centre)<=EPS);
   const waves=[];
   if(slots===1){
    for(const s of [...left,...right,...mid])
     waves.push([{s,targetY:centre,slot:"CENTRE_SINGLE"}]);
   }else{
    for(let offset=0;offset<Math.max(left.length,right.length);
        offset+=halfSlots){
     const wave=[];
     for(let j=0;j<halfSlots;j++){
      if(left[offset+j])wave.push({s:left[offset+j],
       targetY:targets[halfSlots-1-j],slot:"LEFT"});
      if(right[offset+j])wave.push({s:right[offset+j],
       targetY:targets[slots-halfSlots+j],slot:"RIGHT"});
     }
     if(wave.length)waves.push(wave);
    }
    for(const s of mid)waves.push([{s,targetY:centre,slot:"CENTRE_FOLLOW"}]);
   }
   for(const wave of waves){
    const req=wave.map(w=>{
     const s=w.s,p=prev.get(s.id);
     const t=physicalArrivalWindowV3(s.x,s.v,gate.gateX,{
      minSpeedMps,maxSpeedMps,deadlineSeconds});
     const distance=p?gate.gateX-p.gateX:0;
     const lateral=p?Math.abs(w.targetY-p.targetY):
       Math.abs(w.targetY-s.y);
     const low=Math.max(t.earliestSeconds??Infinity,
      p?p.scheduledSeconds+distance/maxSpeedMps:0,
      (p?p.scheduledSeconds:0)+lateral/.38);
     const high=Math.min(t.latestSeconds??-Infinity,
      p?p.scheduledSeconds+distance/minSpeedMps:Infinity);
     return {w,low,high};
    });
    const time=Math.max(release,...req.map(c=>c.low));
    if(!Number.isFinite(time)||time>deadlineSeconds+EPS||
       req.some(c=>time>c.high+EPS)){
     unresolved.push({gateId:gate.id,rowStartX:row[0].startX,
      reason:"NO_REACHABLE_SLOT_WINDOW",proposedSeconds:time,
      lastPermittedSeconds:Math.min(...req.map(c=>c.high))});
     blocked=true;break;
    }
    for(const c of req)bookings.push({
     id:c.w.s.id,gateId:gate.id,gateX:gate.gateX,
     rowStartX:c.w.s.startX,slot:c.w.slot,targetY:c.w.targetY,
     scheduledSeconds:time,earliestSeconds:c.low,latestSeconds:c.high});
    release=time+spacingSeconds;
   }
  }
  prev=new Map(bookings.filter(b=>b.gateId===gate.id).map(b=>[b.id,b]));
 }
 const complete=unresolved.length===0&&route.gates.every(g=>
  bookings.filter(b=>b.gateId===g.id).length===states.length);
 return {kind,status:complete?"NECESSARY_WINDOWS_EXIST":"UNRESOLVED",
  gates:route.gates,referenceCapacity:route.referenceCapacity,
  bookedCount:bookings.length,expectedCount:route.gates.length*states.length,
  bookings,unresolved,noCollisionGuarantee:true,noPhysicalTrajectoryClaim:true,
  researchOnly:true,officialWrites:0,sportingApproval:"NOT_APPROVED"};
}
