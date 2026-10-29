/** Step81 offline 8-second bicycle space-time corridor reservation study.
 * Predictions are heuristics, NEVER accepted bicycle positions or speeds.
 * Authoritative original A64 swept-body, road, power and energy solver
 * MUST independently validate the first actual half-second movement.
 */
const DT=.5,A=.45,B=.85,L=.38,EPS=1e-7;
const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const q=x=>Math.round(x*1e6)/1e6;
const middle=y=>Math.abs(y-2.2);
function validate(states,requests,bookings,horizon){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!finite(horizon)||horizon<2||horizon>12||
 Math.round(horizon/DT)!==horizon/DT)
 throw Error('A81 invalid bicycle field or time horizon');
 const seen=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||seen.has(s.id)||
  r.id!==s.id||![s.x,s.y,s.v,r.speed,r.targetY].every(finite)||
  s.v<0||s.v>50||r.speed<0||r.speed>50||
  r.targetY<0||r.targetY>4.4)throw Error('A81 invalid bicycle');
  seen.add(s.id);
 }
 for(const b of bookings)if(!seen.has(b.id)||
  ![b.gateX,b.scheduledSeconds,b.targetY].every(finite)||
  b.targetY<0||b.targetY>4.4)throw Error('A81 invalid reservation');
}
/** Reach a target speed at maximum physically permitted acceleration,
 * then cruise at the requested speed. This is only a constant-request
 * projection; it is NOT a claim of an achieved future physical path.
 */
export function predictReservationPoseV3(s,r,t){
 if(!s||!r||![s.x,s.y,s.v,r.speed,r.targetY,t].every(finite)||
 t<0||t>12)throw Error('A81 invalid projection');
 const accel=r.speed>=s.v?A:-B;
 const powered=Math.min(t,Math.abs(r.speed-s.v)/Math.abs(accel));
 return {x:q(s.x+s.v*powered+.5*accel*powered**2+
  r.speed*(t-powered)),y:q(s.y+clip(r.targetY-s.y,-L*t,L*t)),
  v:q(s.v+accel*powered)};
}
/** Forecast occupied corridors for each *geometric* bicycle pair at
 * 0.5s increments over multiple seconds. Static bookings only supply
 * intended geographic lane and clock windows, never an achieved path.
 */
export function forecastMultiSecondOccupancyV3(states,requests,bookings,{
 horizonSeconds=8,nowSeconds=0,collisionBodyM=2.55
}={}){
 validate(states,requests,bookings,horizonSeconds);
 if(!finite(nowSeconds)||nowSeconds<0||
 !finite(collisionBodyM)||collisionBodyM<1.8||collisionBodyM>3.5)
 throw Error('A81 invalid parameters');
 const n=Math.round(horizonSeconds/DT),byId=new Map();
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 const traces=states.map((s,i)=>Array.from({length:n+1},(_,k)=>
  predictReservationPoseV3(s,requests[i],k*DT)));
 const edges=[];
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  if(Math.abs(states[i].x-states[j].x)>25+horizonSeconds*3)continue;
  let first=-1,last=-1,minGap=Infinity;
  for(let k=1;k<=n;k++){
   const dx=Math.abs(traces[i][k].x-traces[j][k].x);
   const dy=Math.abs(traces[i][k].y-traces[j][k].y);
   if(dx<collisionBodyM&&dy<.85){
    if(first<0)first=k;
    last=k;minGap=Math.min(dx,minGap);
   }
  }
  if(first>=0)edges.push({i,j,atSeconds:q(first*DT),
   untilSeconds:q(last*DT),closestLongitudinalM:q(minGap)});
 }
 const earliest=Array(states.length).fill(Infinity);
 const parent=states.map((_,i)=>i);
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];
  i=parent[i]}return i};
 for(const e of edges){
  earliest[e.i]=Math.min(earliest[e.i],e.atSeconds);
  earliest[e.j]=Math.min(earliest[e.j],e.atSeconds);
  const a=root(e.i),b=root(e.j);
  if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);
 }
 const groups=new Map();
 for(let i=0;i<states.length;i++){
  const r=root(i);
  if(!groups.has(r))groups.set(r,[]);
  groups.get(r).push(i);
 }
 const corridors=states.map((s,i)=>{
  const booking=(byId.get(s.id)||[]).filter(b=>
   b.gateX>=s.x-15&&b.scheduledSeconds>=nowSeconds-.5)
   .sort((a,b)=>a.gateX-b.gateX)[0];
  return {id:s.id,gateId:booking?.gateId??null,
   reservedSeconds:booking?.scheduledSeconds??null,
   bookedTargetY:booking?.targetY??null,
   firstProvisionalConflictSeconds:
    Number.isFinite(earliest[i])?earliest[i]:null,
   steeringNeedSeconds:booking?
    q(Math.abs(booking.targetY-s.y)/L):0};
 });
 return {edges,corridors,linkedGroups:[...groups.values()]
  .filter(g=>g.length>1),horizonSeconds,
  ridersWithConflict:earliest.filter(Number.isFinite).length,
  earliestConflictSeconds:edges.length?
   Math.min(...edges.map(e=>e.atSeconds)):null,
  provisionalOnly:true,officialWrites:0};
}
function propose(states,baseline,forecast,mode,{paceFloor=6.4}={}){
 const result=baseline.map(r=>({...r}));
 let predictedWarnings=0,heldSteering=0,helpedLeaders=0,
  slowedFollowers=0,rowRequests=0;
 if(mode==='row_stagger'||mode==='combined'){
  const rows=new Map();
  for(let i=0;i<states.length;i++){
   const s=states[i];
   if(!finite(s.startX))continue;
   const k=s.startX.toFixed(4);
   if(!rows.has(k))rows.set(k,[]);
   rows.get(k).push(i);
  }
  for(const row of rows.values())if(row.length===5){
   for(const i of row){
    const s=states[i],r=result[i],depth=middle(s.y);
    // Mirror-invariant inner track advance vs outside/centre yield.
    if(depth>.6&&depth<1.3)r.speed=Math.max(r.speed,s.v+1.3);
    else r.speed=Math.min(r.speed,Math.max(paceFloor,s.v-.35));
    rowRequests++;
   }
  }
 }
 for(const edge of forecast.edges){
  const a=states[edge.i],b=states[edge.j],gap=a.x-b.x;
  const ra=result[edge.i],rb=result[edge.j];
  if((mode==='lane_hold'||mode==='combined')&&
   Math.abs(gap)<4.2&&edge.atSeconds<=5.5&&
   Math.abs(a.y-b.y)<1.7){
   if(Math.abs(ra.targetY-a.y)>EPS){
    ra.targetY=a.y;heldSteering++;
   }
   if(Math.abs(rb.targetY-b.y)>EPS){
    rb.targetY=b.y;heldSteering++;
   }
  }
  if(!['pace_reserve','combined','row_stagger'].includes(mode)||
   edge.atSeconds>6.0)continue;
  let leader=null,follower=null;
  if(Math.abs(gap)>EPS){
   leader=gap>0?edge.i:edge.j;
   follower=gap>0?edge.j:edge.i;
  }else{
   const ca=middle(a.y),cb=middle(b.y);
   if(Math.abs(ca-cb)>.3){
    leader=ca<cb?edge.i:edge.j;
    follower=leader===edge.i?edge.j:edge.i;
   }
  }
  if(leader===null)continue; // absolutely no rider-ID priority
  const lead=states[leader],rear=states[follower],
   lr=result[leader],rr=result[follower];
  const closing=Math.max(0,rear.v-lead.v);
  const need=2.4+2.6*closing+closing**2/(2*B);
  if(Math.max(0,lead.x-rear.x)>need+8)continue;
  predictedWarnings++;
  const protect=lead.v+A*DT;
  if(lr.speed<protect-EPS){lr.speed=protect;helpedLeaders++}
  const cap=Math.max(paceFloor,Math.min(rr.speed,rear.v-.22));
  if(cap<rr.speed-EPS){rr.speed=cap;slowedFollowers++}
 }
 return {policy:'reserved_'+mode,requests:result,
  predictedWarnings,heldSteering,helpedLeaders,
  slowedFollowers,rowRequests,officialWrites:0};
}
export function multiSecondReservationCandidatesV3(states,baseline,bookings,{
 horizonSeconds=8,nowSeconds=0,paceFloor=6.4
}={}){
 const forecast=forecastMultiSecondOccupancyV3(states,baseline,
  bookings,{horizonSeconds,nowSeconds});
 if(!finite(paceFloor)||paceFloor<5||paceFloor>9)
  throw Error('A81 invalid rolling-speed request floor');
 const candidates=['pace_reserve','lane_hold','row_stagger','combined']
  .map(mode=>propose(states,baseline,forecast,mode,{paceFloor}));
 return {forecast,candidates,notAcceptedPhysicalMotion:true,
  sportingApproval:'NOT_APPROVED',officialWrites:0};
}
