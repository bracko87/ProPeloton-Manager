/** Step86: physically bounded, *requested* multi-row gap creation.
 *
 * Compute longitudinal clearance before steering from five to two tracks.
 * All inputs are current accepted bicycle states, currently intended
 * commands, immutable route-gate bookings and the present game clock.
 * Crossing order is symmetric about road centre: same geometry => same
 * request irrespective of bicycle ID, input order or mirrored direction.
 *
 * This is an offline request generator; it DOES NOT prove that a joint
 * passage exists. Original A64 synchronized swept collision / road-edge /
 * power-energy solver alone authorizes any achieved physical movement.
 */
const EPS=1e-7,ACCEL=.45,BRAKE=.85,LATERAL=.38;
const finite=Number.isFinite;
const q=x=>Math.round(x*1e6)/1e6;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function validate(states,requests,bookings,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!finite(at)||at<0)
 throw Error('A86 invalid multi-row gap input');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||ids.has(s.id)||
  r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY].every(finite)||
  s.y<0||s.y>4.4||s.v<0||s.v>50||r.speed<0||r.speed>50||
  r.targetY<0||r.targetY>4.4)throw Error('A86 invalid body/request');
  ids.add(s.id);
 }
 for(const b of bookings)if(!b||!ids.has(b.id)||
 ![b.gateX,b.targetY,b.scheduledSeconds].every(finite)||
 b.targetY<0||b.targetY>4.4)
 throw Error('A86 invalid gate booking');
}
function rowInfo(states){
 const rows=new Map();
 states.forEach((s,i)=>{
  const key=s.startX.toFixed(4);
  if(!rows.has(key))rows.set(key,[]);
  rows.get(key).push(i);
 });
 return [...rows.values()].sort((a,b)=>states[b[0]].startX-
  states[a[0]].startX);
}
function nextBooking(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x-4)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
/** Required current longitudinal gap for a safe *request to begin* a
 * projected shared-lane merge. This is a necessary clearance condition,
 * never a sufficient guaranteed 2D accepted collision-free trajectory.
 */
export function step86RequiredGapV3(front,rear,{
 minBodyGapM=2.65,responseSeconds=1.8
}={}){
 if(!front||!rear||![front.x,front.v,rear.x,rear.v,
  minBodyGapM,responseSeconds].every(finite)||
  minBodyGapM<2||minBodyGapM>4||
  responseSeconds<.5||responseSeconds>6)
 throw Error('A86 invalid physical headway');
 const closing=Math.max(0,rear.v-front.v);
 return q(minBodyGapM+closing*responseSeconds+
  closing*closing/(2*BRAKE));
}
function sameBookedCorridor(a,b){
 return a&&b&&a.gateId===b.gateId&&
  Math.abs(a.targetY-b.targetY)<.82;
}
export function step86MultiRowGapPlanV3(states,baseline,bookings,{
 atSeconds=0,lookAheadM=55,movingFloorMps=7.5,
 longitudinalMarginM=1.1,urgencySeconds=8
}={}){
 validate(states,baseline,bookings,atSeconds);
 if(![lookAheadM,movingFloorMps,longitudinalMarginM,urgencySeconds]
 .every(finite)||lookAheadM<15||lookAheadM>100||
 movingFloorMps<5||movingFloorMps>12||
 longitudinalMarginM<0||longitudinalMarginM>5||
 urgencySeconds<2||urgencySeconds>20)
 throw Error('A86 invalid gap-planning parameters');
 const rows=rowInfo(states),byId=new Map();
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 const active=states.map(s=>nextBooking(s,byId));
 const holds=Array(states.length).fill(false);
 const leadBoosts=Array(states.length).fill(-Infinity);
 const rearCaps=Array(states.length).fill(Infinity);
 const rowRoles=Array(states.length).fill('UNBOOKED');
 const involved=Array(states.length).fill(false);
 let fiveAbreastRows=0,sharedCorridorWarnings=0,
  unsatisfiedMergeGaps=0,geometryTies=0;
 // Five-wide starts require genuine physical longitudinal opening
 // between center, inner and outer tracks BEFORE lateral convergence.
 for(const row of rows){
  if(row.length!==5||!row.some(i=>active[i]))continue;
  fiveAbreastRows++;
  for(const i of row){
   const s=states[i],b=active[i];
   if(!b)continue;
   const distance=b.gateX-s.x;
   if(distance<-EPS||distance>lookAheadM+
       Math.max(0,s.v*urgencySeconds))continue;
   const d=Math.abs(s.y-2.2);
   const role=d>1.55?'OUTER':d<.43?'CENTER':'INNER';
   rowRoles[i]=role;involved[i]=true;
   // Initial five-abreast physical roles; symmetric about center.
   // OUTER must wait for the nearer INNER track to physically open.
   if(role==='INNER'){
    leadBoosts[i]=Math.max(leadBoosts[i],s.v+.95);
   }else if(role==='OUTER'){
    const inner=row.filter(j=>Math.abs(states[j].y-2.2)<d-.1&&
      Math.sign(states[j].y-2.2)===Math.sign(s.y-2.2))
      .sort((a,c)=>Math.abs(Math.abs(states[c].y-2.2)-1.1)-
       Math.abs(Math.abs(states[a].y-2.2)-1.1))[0];
    if(inner!==undefined){
     const leader=states[inner],gap=leader.x-s.x;
     const needed=step86RequiredGapV3(leader,s)+longitudinalMarginM;
     if(gap<needed){
      holds[i]=true;unsatisfiedMergeGaps++;
      // No standstill workaround: ask outer to coast near current
      // speed while INNER gains real distance at legal acceleration.
      rearCaps[i]=Math.min(rearCaps[i],Math.max(
       movingFloorMps,s.v-.25));
     }
    }
   }else{
    // Center bicycle waits for an actual gap, not a preferential side.
    const inner=row.filter(j=>Math.abs(states[j].y-2.2)>.43&&
      Math.abs(states[j].y-2.2)<1.55);
    if(inner.length===2&&inner.some(j=>{
     const gap=states[j].x-s.x;
     return gap<step86RequiredGapV3(states[j],s)+longitudinalMarginM;
    })){holds[i]=true;unsatisfiedMergeGaps++;}
   }
  }
 }
 // Check *every* nearby pair with a shared booked target corridor and
 // aggregate simultaneous votes before mutating any rider command.
 // This prevents two overlapping local neighborhoods from granting
 // contradictory right of way or multiple braking passes.
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j];
  if(Math.abs(a.x-b.x)>lookAheadM||
   !sameBookedCorridor(active[i],active[j]))continue;
  if(Math.abs(a.x-b.x)<EPS){
   geometryTies++;
   // Equal longitudinal positions: never select winner via ID or
   // geographic side. Both conflicting lateral requests wait.
   if(Math.abs(baseline[i].targetY-a.y)>EPS)holds[i]=true;
   if(Math.abs(baseline[j].targetY-b.y)>EPS)holds[j]=true;
   continue;
  }
  const frontIndex=a.x>b.x?i:j,rearIndex=frontIndex===i?j:i;
  const front=states[frontIndex],rear=states[rearIndex];
  const gap=front.x-rear.x;
  const need=step86RequiredGapV3(front,rear)+longitudinalMarginM;
  if(gap>need+6)continue;
  sharedCorridorWarnings++;
  involved[frontIndex]=true;involved[rearIndex]=true;
  // A merge request is delayed when actual clearance is insufficient.
  if(gap<need&&
   Math.abs(baseline[rearIndex].targetY-rear.y)>EPS){
   holds[rearIndex]=true;unsatisfiedMergeGaps++;
  }
  // Ask front to accelerate, not for a physically impossible x jump.
  // Solver still limits actual +.45 m/s², -0.85 m/s² and W-prime.
  if(front.v>=movingFloorMps-1)
   leadBoosts[frontIndex]=Math.max(leadBoosts[frontIndex],
    front.v+.75);
  // Only a mild yielding request if rear is truly closing.
  if(rear.v>front.v+.12){
   rearCaps[rearIndex]=Math.min(rearCaps[rearIndex],
    Math.max(movingFloorMps,front.v+.2));
  }
 }
 return {holds,leadBoosts,rearCaps,rowRoles,
  activeRiders:involved.filter(Boolean).length,
  fiveAbreastRows,sharedCorridorWarnings,unsatisfiedMergeGaps,
  geometryTies,holdRequests:holds.filter(Boolean).length,
  assistRequests:leadBoosts.filter(finite).length,
  yieldRequests:rearCaps.filter(finite).length,
  futureMotionNotGuaranteed:true,
  requestOnly:true,officialWrites:0};
}
function build(states,requests,plan,variant,{
 movingFloorMps=7.5
}={}){
 const next=requests.map(r=>({...r}));
 let held=0,assisted=0,coasted=0;
 for(let i=0;i<states.length;i++){
  const r=next[i],s=states[i];
  if(plan.holds[i]&&Math.abs(r.targetY-s.y)>EPS){
   r.targetY=s.y;held++;
  }
  if(variant!=='gap_hold'&&finite(plan.leadBoosts[i])){
   const up=Math.min(50,Math.max(r.speed,plan.leadBoosts[i]));
   if(up>r.speed+EPS){r.speed=q(up);assisted++}
  }
  if(variant==='gap_wave'&&finite(plan.rearCaps[i])){
   const down=Math.max(movingFloorMps,plan.rearCaps[i]);
   if(down<r.speed-EPS){r.speed=q(down);coasted++}
  }
  if(variant==='gap_cruise'&&
   plan.rowRoles[i]==='INNER'&&finite(plan.leadBoosts[i])){
   const up=Math.min(50,Math.max(r.speed,s.v+1.1));
   if(up>r.speed+EPS){r.speed=q(up);assisted++}
  }
 }
 return {policy:'multirow_'+variant,requests:next,
  held,assisted,coasted,officialWrites:0};
}
export function step86GapCandidatesV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=55,movingFloorMps=7.5
}={}){
 const plan=step86MultiRowGapPlanV3(states,requests,bookings,{
  atSeconds,lookAheadM,movingFloorMps});
 const candidates=['gap_hold','gap_frontload','gap_wave','gap_cruise']
 .map(variant=>build(states,requests,plan,variant,{
  movingFloorMps}));
 return {plan,candidates,
  physicallyAttainableRequestsNotCertifiedPassage:true,
  authoritativeOriginalPhysicsMandatory:true,
  officialWrites:0};
}
