/** A79 distributed overlapping-bicycle viability, offline research only.
 * Joint current-state speed/lateral proposals across ALL local groups.
 * This module never accepts a movement. Every proposed whole-field half
 * second must pass the unchanged swept bicycle/road/energy solver.
 */
const DT=.5,EPS=1e-8,A=.45,B=.85,L=.38;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const good=x=>typeof x==='number'&&Number.isFinite(x);
function check(states,requests,original){
 if(!Array.isArray(states)||states.length<2||states.length>168||
    !Array.isArray(requests)||requests.length!==states.length||
    !original||typeof original!=='object')
  throw Error('A79 invalid field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||ids.has(s.id)||
     s.id!==r.id||![s.x,s.y,s.v,r.speed,r.targetY,original[s.id]]
     .every(good)||s.v<0||s.v>50||s.y<0||s.y>4.4||
     r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A79 malformed physical rider or desired request');
  ids.add(s.id);
 }
}
function approaching(a,b,ra,rb){
 const dx=Math.abs(a.x-b.x);
 if(dx>38)return false;
 const dy=Math.abs(a.y-b.y);
 const planned=Math.abs(ra.targetY-rb.targetY);
 const willCross=(a.y-b.y)*(ra.targetY-rb.targetY)<-EPS;
 return dy<1.15||planned<1.15||willCross;
}
function linkScore(a,b,ra,rb){
 if(!approaching(a,b,ra,rb))return 0;
 const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
 const closure=Math.abs(a.v-b.v);
 const pressure=clamp(12-dx+2*closure,0,12);
 return pressure+(dy<.85?3:0);
}
/** Multiple local neighborhoods simultaneously; overlap is intentional.
 * Union-find labels connected risk components by geometry, NOT rider ID.
 */
export function distributedNeighborhoodsV3(states,requests,{
 maxLocalRiders=8,rangeM=25,threshold=0.6
}={}){
 if(!Array.isArray(states)||!Array.isArray(requests)||
    states.length!==requests.length||states.length<2||
    states.length>168||![3,4,5,6,7,8].includes(maxLocalRiders)||
    !good(rangeM)||rangeM<5||rangeM>50||!good(threshold)||
    threshold<0||threshold>10)
  throw Error('A79 invalid distributed neighborhood');
 const edges=[];
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  if(Math.abs(states[i].x-states[j].x)>rangeM)continue;
  const risk=linkScore(states[i],states[j],requests[i],requests[j]);
  if(risk>threshold)edges.push({i,j,risk});
 }
 // Consider all nonzero-risk edges, not just the single worst pair.
 const groups=[],byIndex=Array.from({length:states.length},()=>[]);
 const sorted=[...edges].sort((a,b)=>b.risk-a.risk||
  Math.min(states[b.i].x,states[b.j].x)-
   Math.min(states[a.i].x,states[a.j].x));
 for(const edge of sorted){
  const {i,j}=edge;
  const ranked=states.map((s,k)=>({
    k,metric:Math.min(Math.abs(s.x-states[i].x)+
     Math.abs(s.y-states[i].y)*3,
     Math.abs(s.x-states[j].x)+Math.abs(s.y-states[j].y)*3)
   })).filter(t=>t.k!==i&&t.k!==j&&t.metric<=12)
    .sort((a,b)=>a.metric-b.metric||
     states[b.k].x-states[a.k].x||
     states[a.k].y-states[b.k].y);
  const indices=[i,j,...ranked.slice(0,maxLocalRiders-2).map(z=>z.k)];
  // Keep distinct overlapping regions but do not duplicate the same
  // set of physical riders for multiple links.
  const geometricKey=[...indices].sort((a,b)=>a-b).join(',');
  if(groups.some(g=>g.key===geometricKey))continue;
  const group={indices,score:edge.risk,key:geometricKey};
  groups.push(group);
  for(const k of indices)byIndex[k].push(groups.length-1);
  if(groups.length>=states.length*3)break;
 }
 return {groups,edgeCount:edges.length,
  coveredRiders:byIndex.filter(x=>x.length).length,
  overlappingRiders:byIndex.filter(x=>x.length>1).length,
  maxNeighborhood:groups.reduce((m,g)=>Math.max(m,g.indices.length),0),
  researchOnly:true};
}
function rowRank(states){
 const rows=new Map();
 for(let i=0;i<states.length;i++){
  const s=states[i];
  // startX is initialized physically before t=0, never read from ID.
  const key=good(s.startX)?s.startX.toFixed(4):s.x.toFixed(2);
  if(!rows.has(key))rows.set(key,[]);
  rows.get(key).push(i);
 }
 const rank=new Map();
 for(const indices of rows.values()){
  const ordered=indices.slice().sort((a,b)=>states[a].y-states[b].y);
  for(let k=0;k<ordered.length;k++)
   rank.set(ordered[k],{rank:k,count:ordered.length});
 }
 return rank;
}
function distributedVariant(states,baseline,original,graph,variant,road){
 const result=baseline.map(r=>({...r}));
 const ranks=rowRank(states),desired=original;
 let warningEdges=0,protectedLeader=0,brakeRequests=0,
  heldLateral=0,zipperRequests=0;
 // A79 distributed lane-role proposal: any physical five-abreast row
 // has two inner launch corridors, mirrored symmetrically. It asks the
 // inner tracks to gain an early bounded longitudinal gap. Nobody gets
 // an instant position or velocity adjustment.
 if(variant==='zipper'||variant==='spatial_zipper'){
  for(let i=0;i<states.length;i++){
   const info=ranks.get(i),s=states[i],r=result[i];
   if(info?.count!==5||s.x>road.firstExitX)continue;
   const inside=info.rank===1||info.rank===3;
   const target=inside?Math.max(r.speed,desired[s.id],s.v+.6):
    Math.min(r.speed,desired[s.id],s.v-.55);
   r.speed=clamp(target,0,50);
   zipperRequests++;
  }
 }
 if(variant==='cruise'||variant==='spatial_zipper'){
  for(let i=0;i<states.length;i++){
   const s=states[i],r=result[i],info=ranks.get(i);
   if(s.x>road.firstExitX)continue;
   // Remove unsafe schedule-induced abrupt shock in each local bunch.
   // The exact motion remains bounded by the original core integrator.
   const near9=8.9+clamp((desired[s.id]-9)*.25,-.2,.2);
   if(variant==='cruise')r.speed=Math.max(r.speed,near9);
   else if(info?.rank===1||info?.rank===3)
    r.speed=Math.max(r.speed,near9);
  }
 }
 // Every geometrically overlapping 3-8-rider region participates.
 // A single field request is the consensus of ALL affected regions;
 // front-to-rear ordering prevents rear acceleration requests from
 // overriding the leading bicycle's bounded physical opportunities.
 const front=[...states.keys()].sort((a,b)=>states[b].x-states[a].x||
  states[a].y-states[b].y);
 const active=new Set(graph.groups.flatMap(g=>g.indices));
 for(const i of front){
  if(!active.has(i))continue;
  const s=states[i],r=result[i];
  const leads=front.filter(j=>j!==i&&states[j].x>s.x+EPS&&
   states[j].x-s.x<35&&approaching(s,states[j],r,result[j]))
   .sort((a,b)=>states[a].x-states[b].x);
  if(!leads.length)continue;
  const j=leads[0],lead=states[j],lr=result[j],gap=lead.x-s.x;
  const closing=Math.max(0,s.v-lead.v);
  const followingReserve=2.35+2.7*closing+closing*closing/(2*B);
  if(gap>followingReserve+8)continue;
  warningEdges++;
  // Assist the leader within +.45m/s2 rather than forcing the rear
  // rider to stand still as a substitute for spatial admission.
  const leaderFloor=clamp(Math.max(lr.speed,lead.v+
   Math.min(A*DT,Math.max(0,(followingReserve-gap)/10))),
   0,50);
  if(leaderFloor>lr.speed+EPS){lr.speed=leaderFloor;protectedLeader++}
  // Warn only when the present longitudinal closure consumes real gap.
  // The unchanged original physics solver still limits acceleration.
  if(closing>0.08||gap<2.6){
   const cap=lead.v+clamp((gap-followingReserve)/3,-2.3,.8);
   if(cap<r.speed-EPS){
    r.speed=Math.max(0,cap);brakeRequests++;
   }
  }
 }
 // Block geometrically competing lane transitions across ALL groups,
 // not just the most severe first-contact pair. The road solver may
 // impose further mandatory inward steering; this is only an intent.
 if(variant==='distributed_hold'||variant==='spatial_zipper'){
  for(const i of active){
   const s=states[i],r=result[i];
   if(Math.abs(r.targetY-s.y)<=EPS)continue;
   const blocked=front.some(j=>j!==i&&
     Math.abs(states[j].x-s.x)<2.65&&
     Math.abs(states[j].y-r.targetY)<.85);
   if(blocked){r.targetY=s.y;heldLateral++}
  }
 }
 return {requests:result,variant,warningEdges,protectedLeader,
  brakeRequests,heldLateral,zipperRequests,officialWrites:0};
}
/** Four distinct whole-field requests, candidate selection MUST remain
 * inside the unchanged strict authoritative physical integrator.
 */
export function distributedAdmissionCandidatesV3(states,baseline,original,{
 firstExitX=1020,maxLocalRiders=8,rangeM=25
}={}){
 check(states,baseline,original);
 if(!good(firstExitX)||firstExitX<0||firstExitX>5000)
  throw Error('A79 invalid route gate');
 const graph=distributedNeighborhoodsV3(states,baseline,{
  maxLocalRiders,rangeM});
 const road={firstExitX};
 const variants=['cruise','distributed_hold','zipper','spatial_zipper'];
 const candidates=variants.map(v=>
  distributedVariant(states,baseline,original,graph,v,road));
 return {candidates,graph,
  samePhysicalClock:true,noCollisionOrMotionAuthority:true,
  rollbackRepair:false,officialWrites:0};
}
