/** Step96 — connected local 3–5 rider achieved-gap actuator.
 * Unlike Step94/95 it ACTUALLY GENERATES speed differentials and delayed
 * lateral commands for small physical neighborhoods. Original A64 alone
 * accepts/rejects every whole-field swept body + energy + road tick.
 */
const EPS=1e-7,DT=.5,ACC=.45,BRAKE=.85,STEER=.38,CENTER=2.2;
const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const q=x=>Math.round(x*1e6)/1e6;
function validate(states,requests,bookings,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!finite(at)||at<0)
 throw Error('A96 invalid synthetic field');
 const ids=new Set(),byId=new Map();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   !r||r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY]
   .every(finite)||s.v<0||s.v>50||s.y<0||s.y>4.4||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A96 invalid rider/request');
  ids.add(s.id);
 }
 for(const b of bookings){
  if(!b||!ids.has(b.id)||![b.gateX,b.targetY].every(finite)||
   b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A96 invalid booking');
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 return byId;
}
const span=(a,b)=>({lo:Math.min(a,b)-.3,hi:Math.max(a,b)+.3});
const conflict=(a,b)=>a.lo<b.hi+.05&&b.lo<a.hi+.05;
const acceleration=(s,request)=>clamp((request-s.v)/DT,-BRAKE,ACC);
const reachable=(s,request,t)=>{
 const a=acceleration(s,request);
 const first=Math.abs(a)<EPS?0:Math.min(t,Math.max(0,(request-s.v)/a));
 return s.x+s.v*first+.5*a*first*first+
  Math.max(0,t-first)*Math.max(0,s.v+a*first);
};
function active(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
function priority(a,b){
 if(a.x>b.x+EPS)return -1;
 if(b.x>a.x+EPS)return 1;
 const da=Math.abs(a.y-CENTER),db=Math.abs(b.y-CENTER);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 return 0;
}
function buildGroups(states){
 const map=new Map();
 for(let i=0;i<states.length;i++){
  const key=String(Math.round(states[i].startX*10000));
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(i);
 }
 const groups=[...map.values()];
 for(const g of groups)g.sort((i,j)=>
  Math.abs(states[i].y-CENTER)-Math.abs(states[j].y-CENTER)||
  states[j].x-states[i].x);
 groups.sort((a,b)=>states[b[0]].startX-states[a[0]].startX);
 return groups;
}
export function step96LocalGapPlanV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=420,activationM=205,
 minRollingMps=7,neededGapM=2.85,predictSeconds=2.5
}={}){
 const all=validate(states,requests,bookings,atSeconds);
 if(![lookAheadM,activationM,minRollingMps,neededGapM,predictSeconds]
  .every(finite)||lookAheadM<250||lookAheadM>480||
  activationM<120||activationM>260||minRollingMps<6.5||
  minRollingMps>9||neededGapM<2.4||neededGapM>5||
  predictSeconds<1||predictSeconds>4.5)
 throw Error('A96 invalid physical gap planning bounds');
 const n=states.length,bks=states.map(s=>active(s,all));
 const groups=buildGroups(states);
 const limitedGroups=groups.filter(g=>g.length>=3&&g.length<=5);
 const hold=Array(n).fill(false),intent=Array(n).fill(null),
  caps=Array(n).fill(Infinity),assist=Array(n).fill(-Infinity);
 let started=0,delayed=0,relativeEdges=0,boosted=0,clamped=0,
  unresolved=0,crossRowEdges=0;
 const pairEvidence=[];
 // Each starting row is an original 3–5-body actual local neighborhood:
 // inner/center lines first create longitudinal space for outer lines.
 // No ID, left-v-right preference, teleport or fake future coordinate.
 for(const group of limitedGroups){
  const near=group.some(i=>bks[i]&&
   bks[i].gateX-states[i].x<lookAheadM);
  if(!near)continue;
  started++;
  const frontRow=Math.max(...group.map(i=>states[i].x));
  for(const i of group){
   const s=states[i],r=requests[i],booking=bks[i];
   if(!booking)continue;
   const dist=booking.gateX-s.x;
   if(dist>lookAheadM)continue;
   const rank=Math.abs(s.y-CENTER);
   // All speed differences are desired commands: actual acceleration
   // remains A64-capped at +0.45/-0.85, and all movement is swept.
   intent[i]=rank<.55?10.25:rank<1.45?9.45:7.8;
   intent[i]=Math.max(minRollingMps,intent[i]);
   // Keep current lane until another achieved bicycle in the same
   // original row has physically cleared the longitudinal merger.
   if(dist>activationM){
    if(Math.abs(r.targetY-s.y)>EPS){hold[i]=true;delayed++;}
    continue;
   }
   for(const j of group){
    if(i===j)continue;
    const other=states[j];
    if(Math.abs(s.y-other.y)>.99)continue;
    if(!conflict(span(s.y,booking.targetY),
     span(other.y,bks[j]?.targetY??other.y)))continue;
    if(Math.abs(s.x-other.x)<neededGapM){
     if(Math.abs(r.targetY-s.y)>EPS){hold[i]=true;delayed++;}
    }
   }
  }
 }
 // Coupled inter-row relative-rate constraints. Apply the maximum safe
 // following-speed cap AND forward assist simultaneously across the
 // graph. This guards Step93's faster rear center catching an inner
 // preceding rider, including after new intended speeds diverge.
 const ordered=[...Array(n).keys()].sort((i,j)=>
  states[j].x-states[i].x||
  Math.abs(states[i].y-CENTER)-Math.abs(states[j].y-CENTER));
 const requestsFor=i=>intent[i]===null?requests[i].speed:
  Math.max(intent[i],minRollingMps);
 for(let pass=0;pass<4;pass++){
  let changed=false;
  for(let ii=0;ii<ordered.length;ii++){
   const i=ordered[ii],a=states[i],ba=bks[i];
   if(!ba||ba.gateX-a.x>lookAheadM)continue;
   for(let jj=ii+1;jj<ordered.length;jj++){
    const j=ordered[jj],b=states[j],bb=bks[j];
    if(a.x-b.x>17)break;
    if(!bb||ba.gateId!==bb.gateId)continue;
    const aa=priority(a,b);
    if(aa===0){
     if(conflict(span(a.y,ba.targetY),span(b.y,bb.targetY))){
      if(Math.abs(requests[i].targetY-a.y)>EPS)hold[i]=true;
      if(Math.abs(requests[j].targetY-b.y)>EPS)hold[j]=true;
     }
     continue;
    }
    const f=aa<0?i:j,rear=aa<0?j:i;
    const lead=states[f],tail=states[rear],
     bf=bks[f],br=bks[rear];
    if(!conflict(span(lead.y,bf.targetY),span(tail.y,br.targetY)))
     continue;
    const gap=lead.x-tail.x;
    const frontWant=Math.max(
     intent[f]??requests[f].speed,assist[f],minRollingMps);
    const rearWant=Math.min(
     intent[rear]??requests[rear].speed,caps[rear]);
    const endGap=reachable(lead,frontWant,predictSeconds)-
     reachable(tail,rearWant,predictSeconds);
    if(gap>=neededGapM&&endGap>=neededGapM+.3)continue;
    relativeEdges++;
    if(Math.abs(lead.startX-tail.startX)>EPS)crossRowEdges++;
    if(Math.abs(requests[rear].targetY-tail.y)>EPS)hold[rear]=true;
    if(gap<neededGapM&&
       Math.abs(requests[f].targetY-lead.y)>EPS)
     hold[f]=true;
    // A local group creates space by speeding its unobstructed front
    // cyclist and slowing the follower while KEEPING it moving.
    const alreadyLimited=Number.isFinite(caps[rear]);
    const newCap=Math.max(minRollingMps,Math.min(
     rearWant,lead.v+(gap-neededGapM-.2)/predictSeconds));
    if(!alreadyLimited||newCap<caps[rear]-EPS){
     caps[rear]=newCap;clamped++;changed=true;
    }
    const newFront=Math.max(lead.v+.5,frontWant);
    if(newFront>assist[f]+EPS&&newFront<=11){
     assist[f]=newFront;boosted++;changed=true;
    }
    const finalFront=Math.max(frontWant,newFront),
     finalRear=Math.min(rearWant,newCap);
    const projected=reachable(lead,finalFront,predictSeconds)-
     reachable(tail,finalRear,predictSeconds);
    if(pass===3&&projected<neededGapM)unresolved++;
    if(pass===0&&pairEvidence.length<24)
     pairEvidence.push({ahead:f,behind:rear,
      currentGap:q(gap),initialProjectedGap:q(endGap),
      requestedProjectedGap:q(projected),
      sameStartRow:Math.abs(lead.startX-tail.startX)<EPS});
   }
  }
  if(!changed)break;
 }
 // Do not assist a rider into occupied longitudinal track immediately
 // ahead, even if the 2.5s pair forecast wants it accelerated.
 for(let i=0;i<n;i++){
  if(!Number.isFinite(assist[i]))continue;
  const s=states[i],bk=bks[i];
  if(!bk||states.some((other,j)=>j!==i&&
    other.x>s.x+EPS&&other.x-s.x<10&&
    conflict(span(s.y,bk.targetY),
     span(other.y,bks[j]?.targetY??other.y))))
   assist[i]=-Infinity;
 }
 return {hold,intent,caps,assist,
  activeGroups:limitedGroups.length,started,delayed,
  relativeEdges,crossRowEdges,boosted,clamped,unresolved,
  pairEvidence,originalA64Required:true,
  projectedIsNotClearance:true,officialWrites:0};
}
export function step96LocalGapCandidatesV3(states,requests,bookings,opts={}){
 const plan=step96LocalGapPlanV3(states,requests,bookings,opts);
 return {plan,candidates:['lane_shield','group_pulse','gap_wave'].map(mode=>({
  policy:'local_'+mode,officialWrites:0,
  requests:requests.map((r,i)=>{
   const s=states[i],out={...r};
   if(plan.hold[i])out.targetY=s.y;
   if(plan.intent[i]!==null)
    out.speed=q(Math.max(plan.intent[i],mode==='lane_shield'?9:r.speed));
   if(mode!=='lane_shield'&&Number.isFinite(plan.caps[i]))
    out.speed=q(Math.min(out.speed,plan.caps[i]));
   if(mode==='gap_wave'&&Number.isFinite(plan.assist[i])&&
     !Number.isFinite(plan.caps[i]))
    out.speed=q(Math.max(out.speed,plan.assist[i]));
   return out;
  })
 }))};
}
