/** Step89: research-only early, geometry-neutral corridor admission.
 * Every actual tick remains subject to unchanged A64 full-body swept physics.
 */
const EPS=1e-7,HALF=.3,STEER=.38,ACC=.45,BRAKE=.85;
const q=x=>Math.round(x*1e6)/1e6;
function compare(a,b){
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 const da=Math.abs(a.targetY-a.s.y),db=Math.abs(b.targetY-b.s.y);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 const ca=Math.abs(a.s.y-2.2),cb=Math.abs(b.s.y-2.2);
 if(ca<cb-EPS)return -1;
 if(cb<ca-EPS)return 1;
 return 0;
}
function intersects(a,b){
 return Math.min(a.s.y,a.targetY)-HALF < Math.max(b.s.y,b.targetY)+HALF+.07 &&
  Math.min(b.s.y,b.targetY)-HALF < Math.max(a.s.y,a.targetY)+HALF+.07;
}
export function step89PremergeReservationV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=250,minMovingMps=7.1,passageGapM=3.1
}={}){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||states.length!==requests.length||
 !Array.isArray(bookings)||![atSeconds,lookAheadM,minMovingMps,passageGapM]
 .every(Number.isFinite)||atSeconds<0||lookAheadM<70||lookAheadM>350||
 minMovingMps<5.5||minMovingMps>10||passageGapM<2.5||passageGapM>5)
 throw Error('A89 invalid reservation field');
 const byId=new Map(),seen=new Set(),entries=[];
 for(const b of bookings){
  if(!b||typeof b.id!=='string'||
  ![b.gateX,b.targetY].every(Number.isFinite)||
  b.targetY<0||b.targetY>4.4)throw Error('A89 invalid booking');
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||seen.has(s.id)||typeof s.id!=='string'||
   r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY]
   .every(Number.isFinite)||s.v<0||s.y<0||s.y>4.4||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A89 invalid rider or request');
  seen.add(s.id);
  const book=(byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
   .sort((a,b)=>a.gateX-b.gateX)[0];
  if(!book||book.gateX-s.x>lookAheadM)continue;
  const distance=book.gateX-s.x,v=Math.max(0,s.v);
  const travel=(-v+Math.sqrt(v*v+2*ACC*distance))/ACC;
  const steer=Math.abs(book.targetY-s.y)/STEER;
  const earliest=atSeconds+Math.max(travel,steer);
  const latest=atSeconds+Math.max(travel,distance/Math.max(5.8,v-4*BRAKE));
  entries.push({i,s,targetY:book.targetY,gateId:book.gateId,
   gateX:book.gateX,earliest,latest,requested:r});
 }
 const reserved=new Array(states.length).fill(null);
 const held=new Array(states.length).fill(false);
 const speedCaps=new Array(states.length).fill(Infinity);
 const offers=new Array(states.length).fill(-Infinity);
 const constraints=[],warnings=[];
 const sorted=entries.slice().sort(compare);
 let ambiguous=0;
 for(const a of sorted){
  let arrival=a.earliest;
  for(const b of sorted){
   if(a===b||a.gateId!==b.gateId||a.gateX!==b.gateX||
      Math.abs(a.targetY-b.targetY)>.8)continue;
   const order=compare(b,a);
   if(order===0){
    ambiguous++;
    if(Math.abs(a.requested.targetY-a.s.y)>EPS)held[a.i]=true;
    continue;
   }
   if(order>0)continue;
   if(reserved[b.i]!==null)
    arrival=Math.max(arrival,reserved[b.i]+passageGapM/
     Math.max(minMovingMps,Math.min(a.s.v,b.s.v)));
   const sameRow=Math.abs(a.s.startX-b.s.startX)<EPS;
   const gap=b.s.x-a.s.x,close=Math.max(0,a.s.v-b.s.v);
   const clearance=passageGapM+close*3+close*close/(2*BRAKE);
   if(gap<clearance+.8){
    constraints.push({lead:b.i,following:a.i,sameRow,
     presentGapM:q(gap),requiredGapM:q(clearance)});
    if(intersects(a,b)&&Math.abs(a.requested.targetY-a.s.y)>EPS)
     held[a.i]=true;
    if(sameRow){
     speedCaps[a.i]=Math.min(speedCaps[a.i],
      Math.max(minMovingMps,a.s.v-.45));
     offers[b.i]=Math.max(offers[b.i],b.s.v+.225);
    }else if(a.s.v>b.s.v+.12){
     speedCaps[a.i]=Math.min(speedCaps[a.i],
      Math.max(minMovingMps,b.s.v+.1));
    }
   }
  }
  reserved[a.i]=q(arrival);
  if(arrival>a.latest+EPS)warnings.push({rider:a.i,
   type:'WINDOW_PRESSURE_NOT_IMPOSSIBILITY_PROOF'});
 }
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];
  if(Math.abs(a.s.x-b.s.x)>EPS||
   a.gateId!==b.gateId||!intersects(a,b)||compare(a,b)!==0)continue;
  if(Math.abs(a.requested.targetY-a.s.y)>EPS)held[a.i]=true;
  if(Math.abs(b.requested.targetY-b.s.y)>EPS)held[b.i]=true;
 }
 return {entries:entries.length,reserved,held,speedCaps,offers,
  constraints,ambiguous,warnings,
  reservationIsNotPhysicalClearance:true,officialWrites:0};
}
export function step89PremergeCandidatesV3(states,requests,bookings,opts={}){
 const plan=step89PremergeReservationV3(states,requests,bookings,opts);
 const candidates=['hold','wave','balanced'].map(mode=>({
  policy:'premerge_'+mode,officialWrites:0,
  requests:requests.map((r,i)=>{
   const s=states[i],next={...r};
   if(plan.held[i])next.targetY=s.y;
   if(mode!=='hold'&&Number.isFinite(plan.speedCaps[i]))
    next.speed=q(Math.min(next.speed,plan.speedCaps[i]));
   if(mode==='balanced'&&Number.isFinite(plan.offers[i])&&
    !Number.isFinite(plan.speedCaps[i]))
    next.speed=q(Math.min(12,Math.max(next.speed,plan.offers[i])));
   return next;
  })
 }));
 return {plan,candidates,a64ResweepRequired:true,officialWrites:0};
}
