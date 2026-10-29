/** A98 whole-field coupled x/y/v 8-second request-trajectory research.
 * No accepted positions, velocities or energy can be altered by this module.
 * Predicted geometry is a CONFLICT SCREEN, never A64 physical clearance.
 * All pair constraints are considered at common physical times (not ID order).
 */
const DT=.5,ACC=.45,BRAKE=.85,LATERAL=.38,EPS=1e-7,ROAD=4.4;
const q=x=>Math.round(x*1e6)/1e6;
const clip=(v,a,b)=>Math.max(a,Math.min(v,b));
const finite=Number.isFinite;
function check(states,requests,bookings){
 if(!Array.isArray(states)||states.length<2||states.length>168||
  !Array.isArray(requests)||requests.length!==states.length||
  !Array.isArray(bookings))throw Error('A98 invalid whole field');
 const seen=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||s.id!==r.id||
   seen.has(s.id)||![s.x,s.y,s.v,r.speed,r.targetY].every(finite)||
   s.v<0||s.v>50||s.y<0||s.y>4.4||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A98 invalid individual field');
  seen.add(s.id);
 }
 for(const b of bookings)if(!b||!seen.has(b.id)||
  ![b.gateX,b.targetY].every(finite)||b.gateX<0||
  b.targetY<0||b.targetY>ROAD)throw Error('A98 invalid gate intent');
}
function projected(s,des,t){
 const a=clip((des-s.v)/DT,-BRAKE,ACC);
 let until=0;
 if(Math.abs(a)>EPS)until=clip((des-s.v)/a,0,t);
 return {x:s.x+s.v*until+.5*a*until*until+
   Math.max(0,t-until)*Math.max(0,s.v+a*until),
  y:s.y};
}
function booked(states,bookings){
 const map=new Map();
 for(const b of bookings){
  if(!map.has(b.id))map.set(b.id,[]);
  map.get(b.id).push(b);
 }
 return states.map(s=>(map.get(s.id)||[])
  .filter(b=>b.gateX>s.x+EPS).sort((a,b)=>a.gateX-b.gateX)[0]??null);
}
function motion(s,r,t){
 const v=projected(s,r.speed,t);
 const delta=clip(r.targetY-s.y,-LATERAL*t,LATERAL*t);
 return {x:v.x,y:s.y+delta};
}
const unsafe=(a,b)=>Math.abs(a.x-b.x)<2.25&&
 Math.abs(a.y-b.y)<.84;
function pairThreat(states,req,i,j,steps){
 let minX=Infinity,minY=Infinity,time=null,collisionRisk=false;
 for(let k=1;k<=steps;k++){
  const t=k*DT;
  const a=motion(states[i],req[i],t),b=motion(states[j],req[j],t);
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  if(dx<7&&dy<1.35){minX=Math.min(minX,dx);minY=Math.min(minY,dy);}
  if(unsafe(a,b)){time=t;collisionRisk=true;break;}
 }
 return {collisionRisk,time,minX,minY};
}
function guards(states,requests,bookings,{horizonSeconds=8}={}){
 check(states,requests,bookings);
 if(!finite(horizonSeconds)||horizonSeconds<4||
   horizonSeconds>12||horizonSeconds/DT%1!==0)
  throw Error('A98 invalid search horizon');
 const bk=booked(states,bookings),n=states.length;
 const base=requests.map((r,i)=>{
  const b=bk[i],s=states[i],dist=b?b.gateX-s.x:Infinity;
  // Avoid forcing an outer cyclist into occupied corridor while the
  // physical start rows have not gained longitudinal room.
  return {id:r.id,speed:q(Math.max(6.5,Math.min(10.4,
    dist<45?r.speed:Math.max(r.speed,9.1)))),
    targetY:r.targetY};
 });
 const out=base.map(r=>({...r})),
  holds=Array(n).fill(false),caps=Array(n).fill(Infinity),
  boosts=Array(n).fill(-Infinity);
 const graph=[],baselineConflicts=[];
 const horizonTicks=horizonSeconds/DT;
 // Global pair graph over all rider tracks. Only pairs close enough to
 // interact during bounded 8s motion can create candidate edges.
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const a=states[i],b=states[j];
  if(Math.abs(a.x-b.x)>20+horizonSeconds*4)continue;
  const pred=pairThreat(states,out,i,j,horizonTicks);
  if(!pred.collisionRisk)continue;
  const dx=a.x-b.x,dy=a.y-b.y;
  const equalX=Math.abs(dx)<EPS;
  const crossRow=Math.abs((a.startX??a.x)-(b.startX??b.x))>EPS;
  const row = {i,j,relativeX:q(dx),relativeY:q(dy),
   time:pred.time,crossRow,equalX};
  graph.push(row);
  if(baselineConflicts.length<24)baselineConflicts.push({
   relativeX:row.relativeX,relativeY:row.relativeY,
   time:pred.time,crossRow,equalX});
  // At same x: both riders hold if projected 2D paths overlap; the
  // global graph never assigns one an arbitrary name/order preference.
  if(equalX){
   if(Math.abs(out[i].targetY-a.y)>EPS)holds[i]=true;
   if(Math.abs(out[j].targetY-b.y)>EPS)holds[j]=true;
   continue;
  }
  const f=dx>0?i:j,r=dx>0?j:i;
  if(Math.abs(out[f].targetY-states[f].y)>EPS&&
   Math.abs(states[f].x-states[r].x)<3)holds[f]=true;
  if(Math.abs(out[r].targetY-states[r].y)>EPS)holds[r]=true;
 }
 // Resolve all connected front-rear requests simultaneously. Speed
 // upper bounds are conditional bounded DESIRED commands only.
 // No state "fixes": A64 must independently sweep each accepted tick.
 let maxConstraintIterations=6,iterations=0;
 for(let pass=0;pass<maxConstraintIterations;pass++){
  let changed=false;iterations++;
  for(const edge of graph){
   if(edge.equalX)continue;
   const f=edge.relativeX>0?edge.i:edge.j;
   const r=edge.relativeX>0?edge.j:edge.i;
   const a=states[f],b=states[r],gap=a.x-b.x;
   const beforeLead=boosts[f],beforeRear=caps[r];
   const horizon = Math.min(horizonSeconds,Math.max(2,edge.time+1));
   const safety=2.45;
   // Relative arrival over the same horizon: keep the follower behind
   // at a geometrically verified clearance, not by braking to zero.
   const allowedSpeed=clip(a.v+(gap-safety)/horizon,6.5,10.4);
   caps[r]=Math.min(caps[r],allowedSpeed);
   const leaderGoal=clip(b.v+(safety-gap)/horizon+.9,7.5,10.8);
   boosts[f]=Math.max(boosts[f],leaderGoal);
   if(beforeLead!==boosts[f]||beforeRear!==caps[r])changed=true;
  }
  if(!changed)break;
 }
 for(let i=0;i<n;i++){
  const s=states[i];
  if(holds[i])out[i].targetY=s.y;
  if(Number.isFinite(caps[i]))out[i].speed=q(Math.min(out[i].speed,caps[i]));
  if(Number.isFinite(boosts[i])&&!Number.isFinite(caps[i]))
   out[i].speed=q(Math.max(out[i].speed,boosts[i]));
  // Upstream target does not ask a rider to crawl below 6.5m/s.
  out[i].speed=q(Math.max(6.5,out[i].speed));
 }
 let unresolved=0;
 for(const edge of graph)
  if(pairThreat(states,out,edge.i,edge.j,horizonTicks).collisionRisk)
   unresolved++;
 return {original:base,proposed:out,holds,caps,boosts,
  graph,baselineConflicts,unresolved,
  iterations,conflictingPairs:graph.length,
  connectedRiders:new Set(graph.flatMap(p=>[p.i,p.j])).size,
  crossRowPairs:graph.filter(p=>p.crossRow).length,
  equalXConflicts:graph.filter(p=>p.equalX).length,
  heldSteering:holds.filter(Boolean).length,
  cappedRiders:caps.filter(Number.isFinite).length,
  boostedRiders:boosts.filter(Number.isFinite).length,
  horizonSeconds,allPairsExamined:true,
  originalA64SweptAcceptanceRequired:true,officialWrites:0};
}
export function step98GlobalTrajectoryPlanV3(states,requests,bookings,opts={}){
 return guards(states,requests,bookings,opts);
}
export function step98GlobalTrajectoryCandidatesV3(states,requests,bookings,opts={}){
 const p=guards(states,requests,bookings,opts);
 // Three genuinely distinct whole-field, coherent command sets:
 // 1. global shield holds every steering hazard, speed remains close to
 // current physical pace, 2. collision-graph coupled cap+boost,
 // 3. hold+boost through the global conflict components.
 const shield=requests.map((r,i)=>({
  ...r,targetY:p.holds[i]?states[i].y:r.targetY,
  speed:q(Math.max(6.5,Math.min(9.2,Math.max(states[i].v,r.speed))))
 }));
 const full=p.proposed.map((r,i)=>({...requests[i],...r}));
 const surge=p.proposed.map((r,i)=>{
  const s=states[i];
  const boosted=Number.isFinite(p.boosts[i])&&
   !Number.isFinite(p.caps[i])?
    Math.max(r.speed,p.boosts[i]):r.speed;
  return {...requests[i],targetY:r.targetY,
   speed:q(Math.max(6.5,Math.min(11,boosted)))};
 });
 return {plan:p,candidates:[
  {policy:'global_shield',requests:shield,officialWrites:0},
  {policy:'global_coupled',requests:full,officialWrites:0},
  {policy:'global_surge',requests:surge,officialWrites:0}
 ],projectionOnly:true,officialWrites:0};
}
