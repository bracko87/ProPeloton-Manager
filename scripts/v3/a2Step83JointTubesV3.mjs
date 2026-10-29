/** Step83: joint 2D reachable-tube warnings, research only.
 * These are bounded current-command projections, never certified
 * whole-field safe paths. A64 physical swept solver is final authority.
 */
const DT=.5,A=.45,B=.85,L=.38,EPS=1e-7;
const finite=Number.isFinite;
const q=x=>Math.round(x*1e6)/1e6;
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
function assertField(states,requests,horizon){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !finite(horizon)||horizon<1||horizon>10||horizon/DT%1!==0)
 throw Error('A83 invalid field/horizon');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||ids.has(s.id)||
    s.id!==r.id||![s.x,s.y,s.v,r.speed,r.targetY].every(finite)||
    s.v<0||s.v>50||r.speed<0||r.speed>50||
    s.y<0||s.y>4.4||r.targetY<0||r.targetY>4.4)
   throw Error('A83 malformed bicycle/command');
  ids.add(s.id);
 }
}
function pose(s,r,t){
 const dv=r.speed-s.v;
 const positive=dv>=0;
 const sign=positive?A:-B;
 const until=Math.min(t,Math.abs(dv/sign));
 const x=s.x+s.v*until+.5*sign*until*until+r.speed*(t-until);
 return {x:q(x),y:q(s.y+clamp(r.targetY-s.y,-L*t,L*t)),
   v:q(s.v+sign*until)};
}
function relativeSweep(a0,a1,b0,b1,longitudinal,lateral){
 // Piecewise-linear envelope between legal command-only endpoints.
 // Search each .5s step for overlapping longitudinal/lateral rectangles.
 // A64's TRUE continuous swept physical check still decides acceptance.
 const r0x=a0.x-b0.x,r1x=a1.x-b1.x;
 const r0y=a0.y-b0.y,r1y=a1.y-b1.y;
 const vx=r1x-r0x,vy=r1y-r0y;
 const samples=[0,1];
 for(const [r,v,limit] of [[r0x,vx,longitudinal],
  [r0y,vy,lateral]])if(Math.abs(v)>EPS){
   for(const boundary of [-limit,limit]){
    const t=(boundary-r)/v;
    if(t>0&&t<1)samples.push(t);
   }
 }
 samples.sort((a,b)=>a-b);
 for(let k=0;k<samples.length-1;k++){
  const u=(samples[k]+samples[k+1])/2;
  if(Math.abs(r0x+vx*u)<longitudinal-EPS&&
   Math.abs(r0y+vy*u)<lateral-EPS)return q(u);
 }
 return null;
}
export function jointReachableTubesV3(states,requests,{
 horizonSeconds=6,bodyLongitudinalM=2.3,bodyLateralM=.8
}={}){
 assertField(states,requests,horizonSeconds);
 if(![bodyLongitudinalM,bodyLateralM].every(finite)||
 bodyLongitudinalM<1.8||bodyLongitudinalM>3||
 bodyLateralM<.6||bodyLateralM>1)throw Error('A83 invalid body geometry');
 const n=horizonSeconds/DT;
 const paths=states.map((s,i)=>Array.from({length:n+1},(_,k)=>
  pose(s,requests[i],k*DT)));
 const warnings=[];
 const parent=states.map((_,i)=>i);
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  if(Math.abs(states[i].x-states[j].x)>35+horizonSeconds*3)continue;
  let first=null;
  for(let k=0;k<n;k++){
   const at=relativeSweep(paths[i][k],paths[i][k+1],
     paths[j][k],paths[j][k+1],bodyLongitudinalM,bodyLateralM);
   if(at===null)continue;
   first=q(k*DT+at*DT);break;
  }
  if(first===null)continue;
  const ahead=states[i].x>states[j].x+EPS?i:
   states[j].x>states[i].x+EPS?j:null;
  const behind=ahead===i?j:ahead===j?i:null;
  warnings.push({i,j,firstRiskSeconds:first,
   ordered:ahead!==null,ahead,behind,
   equalX:ahead===null,
   startGapM:q(Math.abs(states[i].x-states[j].x)),
   lateralStartM:q(Math.abs(states[i].y-states[j].y)),
   _notASweptContact:true});
  const a=root(i),b=root(j);
  if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);
 }
 const groups=new Map();
 for(const w of warnings){for(const i of [w.i,w.j]){
  const r=root(i);if(!groups.has(r))groups.set(r,new Set());groups.get(r).add(i);
 }}
 return {warnings,groups:[...groups.values()].map(g=>[...g].sort((a,b)=>a-b)),
  horizonSeconds,firstRiskSeconds:warnings.length?
   Math.min(...warnings.map(x=>x.firstRiskSeconds)):null,
  modeledPairs:states.length*(states.length-1)/2,
  sufficientForPhysicalPassage:false,unavoidableContactProven:false,
  positionsCommitted:0,officialWrites:0};
}
function variant(states,baseline,diagnosis,mode){
 const requests=baseline.map(r=>({...r}));
 let lateralHeld=0,earlyYielded=0,leadAssisted=0,conflictsEvaluated=0;
 for(const w of diagnosis.warnings){
  if(w.firstRiskSeconds>6)continue;
  conflictsEvaluated++;
  const {i,j}=w;
  const lateral=(k)=>Math.abs(requests[k].targetY-states[k].y)>EPS;
  const hold=mode==='hold_crossing'||mode==='coordinated'||mode==='early_release';
  if(hold&&w.firstRiskSeconds<= (mode==='early_release'?4:2.5)){
   for(const k of [i,j])if(lateral(k)){
    requests[k].targetY=states[k].y;lateralHeld++;
   }
  }
  const yieldSpeed=mode==='yield_corridor'||mode==='coordinated'||mode==='early_release';
  if(yieldSpeed&&w.ordered&&w.firstRiskSeconds<=5){
   const ahead=w.ahead,behind=w.behind,leader=states[ahead],rear=states[behind];
   const closing=Math.max(0,rear.v-leader.v);
   const gap=leader.x-rear.x;
   const reserve=2.4+2.6*closing+closing*closing/(2*B);
   if(gap<reserve+9){
    const desiredRear=Math.max(6.5,Math.min(requests[behind].speed,
      leader.v+clamp((gap-reserve)/3,-.9,.35)));
    if(desiredRear<requests[behind].speed-EPS){
     requests[behind].speed=desiredRear;earlyYielded++;
    }
    const desiredLeader=Math.min(50,Math.max(requests[ahead].speed,
      leader.v+A*DT));
    if(desiredLeader>requests[ahead].speed+EPS){
     requests[ahead].speed=desiredLeader;leadAssisted++;
    }
   }
  }
 }
 return {policy:'joint_tube_'+mode,requests,
  lateralHeld,earlyYielded,leadAssisted,conflictsEvaluated,
  originalPhysicsStillMandatory:true,officialWrites:0};
}
export function step83JointTubeCandidatesV3(states,requests,{
 horizonSeconds=6
}={}){
 const tubes=jointReachableTubesV3(states,requests,{horizonSeconds});
 const candidates=['hold_crossing','yield_corridor','coordinated','early_release']
  .map(mode=>variant(states,requests,tubes,mode));
 return {tubes,candidates,diagnosticOnly:true,
  cannotCertifyUnavoidableCollision:true,officialWrites:0};
}
