/** Step92 — connected multi-row space-time occupancy coordination.
 * Research-only heuristic: bounded future tubes do NOT authorize physical
 * passage. Every actual half-second remains accepted/rejected solely by the
 * unchanged A64 all-pair swept bicycle, road-boundary and W-prime solver.
 *
 * Planning is symmetric: no rider-ID, array-position or road-side priority.
 */
const EPS=1e-7,HALF=.3,STEER=.38,ACCEL=.45,BRAKE=.85;
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
const overlap=(a,b,margin=.06)=>a.lo<b.hi+margin&&b.lo<a.hi+margin;
const box=(y,target)=>({lo:Math.min(y,target)-HALF,hi:Math.max(y,target)+HALF});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function validate(states,requests,bookings,now){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||states.length!==requests.length||
 !Array.isArray(bookings)||!finite(now)||now<0)throw Error('A92 invalid field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||!r||
   r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY]
   .every(finite)||s.y<0||s.y>4.4||s.v<0||s.v>50||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A92 invalid bicycle/request');
  ids.add(s.id);
 }
 const byId=new Map();
 for(const b of bookings){
  if(!b||!ids.has(b.id)||![b.gateX,b.targetY]
   .every(finite)||b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A92 invalid booked corridor');
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 return byId;
}
function priority(a,b){
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 const da=Math.abs(a.y-a.s.y),db=Math.abs(b.y-b.s.y);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 const ac=Math.abs(a.s.y-2.2),bc=Math.abs(b.s.y-2.2);
 if(ac<bc-EPS)return -1;
 if(bc<ac-EPS)return 1;
 return 0;
}
function projectedTube(a,t){
 const delta=clamp(a.y-a.s.y,-STEER*t,STEER*t);
 const y=a.s.y+delta;
 const vy=box(y,y);
 // Use TWO achievable longitudinal bounds: a speed can evolve within
 // +.45/-0.85m/s²; not a fabricated realized future trajectory.
 const minSpeed=Math.max(0,a.s.v-BRAKE*t);
 const lower=a.s.x+Math.max(0,a.s.v*t-BRAKE*t*t/2);
 const upper=a.s.x+a.s.v*t+ACCEL*t*t/2;
 return {loX:lower,hiX:upper,y:vy,minSpeed};
}
export function step92CohortSpaceTimeV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=235,interactionRangeM=32,
 projectionSeconds=5.5,dt=.5,minMovingMps=7.4
}={}){
 const byId=validate(states,requests,bookings,atSeconds);
 if(![lookAheadM,interactionRangeM,projectionSeconds,dt,minMovingMps]
  .every(finite)||lookAheadM<80||lookAheadM>350||
  interactionRangeM<10||interactionRangeM>70||
  projectionSeconds<2||projectionSeconds>12||
  dt<.25||dt>1||minMovingMps<6||minMovingMps>11)
 throw Error('A92 invalid projection parameters');
 const active=states.map((s,i)=>{
  const b=(byId.get(s.id)||[]).filter(x=>x.gateX>s.x+EPS)
   .sort((a,b)=>a.gateX-b.gateX)[0];
  return b&&b.gateX-s.x<=lookAheadM?
   {i,s,y:b.targetY,gateId:b.gateId,gateX:b.gateX,request:requests[i]}:null;
 });
 const n=states.length,links=Array.from({length:n},()=>[]);
 const pairs=[];
 // Connect any pair sharing an OCCUPIED planned envelope, including
 // adjacent start rows; components are closed under all such conflicts.
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const a=active[i],b=active[j];
  if(!a||!b||a.gateId!==b.gateId||
   Math.abs(a.s.x-b.s.x)>interactionRangeM||
   !overlap(box(a.s.y,a.y),box(b.s.y,b.y)))continue;
  links[i].push(j);links[j].push(i);pairs.push([i,j]);
 }
 const seen=new Set(),components=[];
 for(let i=0;i<n;i++){
  if(seen.has(i)||!active[i])continue;
  const component=[],stack=[i];seen.add(i);
  while(stack.length){
   const j=stack.pop();component.push(j);
   for(const k of links[j])if(!seen.has(k)){seen.add(k);stack.push(k)}
  }
  components.push(component);
 }
 const held=Array(n).fill(false);
 const caps=Array(n).fill(Infinity);
 const boosts=Array(n).fill(-Infinity);
 const edges=[],occupancy=[];
 let predictedCrossings=0,ambiguous=0;
 // The same chosen spatial component must resolve all its pairwise
 // constraints SIMULTANEOUSLY; no array-order overwriting or per-side cap.
 for(const component of components){
  for(let ai=0;ai<component.length;ai++)
  for(let bi=ai+1;bi<component.length;bi++){
   const a=active[component[ai]],b=active[component[bi]];
   if(!a||!b||a.gateId!==b.gateId||
    !overlap(box(a.s.y,a.y),box(b.s.y,b.y)))continue;
   const order=priority(a,b);
   if(order===0){
    ambiguous++;
    if(Math.abs(a.request.targetY-a.s.y)>EPS)held[a.i]=true;
    if(Math.abs(b.request.targetY-b.s.y)>EPS)held[b.i]=true;
    continue;
   }
   const lead=order<0?a:b,rear=order<0?b:a;
   const gap=lead.s.x-rear.s.x;
   const close=Math.max(0,rear.s.v-lead.s.v);
   const steerTime=Math.abs(rear.y-rear.s.y)/STEER;
   const needed=3.1+close*Math.min(3.5,Math.max(1.5,steerTime))+
    close*close/(2*BRAKE)+Math.min(1.3,steerTime*.21);
   let forecast=false,firstWindow=null;
   for(let step=1;step<=Math.ceil(projectionSeconds/dt);step++){
    const t=step*dt,leading=projectedTube(lead,t),
     following=projectedTube(rear,t);
    // Inclusive reachable longitudinal envelopes plus true bicycle
    // width: a conservative "could overlap", never a proof of collision.
    if(overlap(leading.y,following.y)&&
      following.hiX+2.7>=leading.loX&&
      leading.hiX+2.7>=following.loX){
      forecast=true;
      if(firstWindow===null)firstWindow=t;
    }
   }
   const crowded=gap<needed+1.2;
   edges.push({ahead:lead.i,behind:rear.i,
    achievedGapM:q(gap),necessaryGapM:q(needed),
    projectedInteraction:forecast,firstWindow});
   if(forecast)predictedCrossings++;
   if(crowded||forecast){
    if(Math.abs(rear.request.targetY-rear.s.y)>EPS)held[rear.i]=true;
    if(rear.s.v>minMovingMps+.1)
      caps[rear.i]=Math.min(caps[rear.i],
       Math.max(minMovingMps,
        Math.min(rear.s.v-.3,lead.s.v+.08)));
    if(lead.s.v<10.2)
      boosts[lead.i]=Math.max(boosts[lead.i],
       Math.min(10.2,lead.s.v+.35));
   }
  }
  occupancy.push({size:component.length,rows:new Set(
   component.map(i=>states[i].startX.toFixed(4))).size,
   conflictedRiders:component.filter(i=>links[i].length).length});
 }
 // A boost cannot be applied into another existing occupied tube,
 // including a third row in the SAME connected spatial component.
 for(let i=0;i<n;i++){
  if(!finite(boosts[i])||!active[i]||held[i]||finite(caps[i])){
   boosts[i]=-Infinity;continue;
  }
  for(let j=0;j<n;j++){
   if(i===j||!active[j]||states[j].x<=states[i].x+EPS||
    states[j].x-states[i].x>13)continue;
   if(overlap(box(active[i].s.y,active[i].y),
      box(active[j].s.y,active[j].y))){
    boosts[i]=-Infinity;break;
   }
  }
 }
 return {held,caps,boosts,components:occupancy,edges,
  connectedCohorts:occupancy.filter(c=>c.size>1).length,
  multiRowCohorts:occupancy.filter(c=>c.rows>1).length,
  predictedCrossings,ambiguous,
  heldRiders:held.filter(Boolean).length,
  guidanceOnly:true,originalA64MustResweep:true,officialWrites:0};
}
export function step92CohortCandidatesV3(states,requests,bookings,opts={}){
 const plan=step92CohortSpaceTimeV3(states,requests,bookings,opts);
 const candidates=['hold','yield','flow'].map(mode=>({
  policy:'cohort_'+mode,officialWrites:0,
  requests:requests.map((r,i)=>{
   const s=states[i],out={...r};
   if(plan.held[i])out.targetY=s.y;
   if(mode!=='hold'&&finite(plan.caps[i]))
    out.speed=q(Math.min(out.speed,plan.caps[i]));
   if(mode==='flow'&&finite(plan.boosts[i]))
    out.speed=q(Math.max(out.speed,plan.boosts[i]));
   return out;
  })
 }));
 return {plan,candidates,originalPhysicsDecides:true,officialWrites:0};
}
