/** Step98: 6-second whole-field ORIGINAL A64 receding search.
 * Every complete candidate physical state is swept by the original solver,
 * then individually checked against Step95's achieved speed thresholds.
 * The projected conflict graph cannot grant physical clearance.
 * Only the chosen FIRST current-state command is returned to re-sweep.
 */
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
const EPS=1e-7,q=x=>Math.round(x*1e6)/1e6;
const finite=Number.isFinite;
function scan(prev,plan,solve){
 if(!plan||!Array.isArray(plan.requests)||
  plan.requests.length!==prev.states.length)
  throw Error('A98 invalid whole-field physical proposal');
 const copy=structuredClone(prev);
 for(let i=0;i<copy.states.length;i++){
  const s=copy.states[i],r=plan.requests[i];
  if(!r||s.id!==r.id||![r.speed,r.targetY].every(finite)||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A98 invalid physical commands');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const actual=solve(copy);
 if(actual?.reason)return {accepted:false,reason:actual.reason,actual,kind:'A64'};
 if(actual?.acceptedSteps!==prev.acceptedSteps+1||
  Math.abs(actual.at-prev.at-.5)>EPS)
  throw Error('A98 forged physical acceptance');
 const check=step95AchievedMovingGateV3(actual);
 if(!check.admitted)return {
  accepted:false,reason:'A98_ACHIEVED_MOVING_FLOOR_VETO',
  actual:null,kind:'SPORTING',check};
 return {accepted:true,actual,kind:'A64_VERIFIED'};
}
function quality(previous,field){
 let minimum=Infinity,braking=0,close=0;
 for(let i=0;i<field.states.length;i++){
  const a=field.states[i],b=previous.states[i];
  minimum=Math.min(minimum,a.v);
  braking+=Math.max(0,b.v-a.v);
 }
 for(let i=0;i<field.states.length;i++)for(let j=i+1;j<field.states.length;j++){
  const a=field.states[i],b=field.states[j];
  if(Math.abs(a.x-b.x)<3.5&&Math.abs(a.y-b.y)<1.1)
   close++;
 }
 return {minimum:q(minimum),braking:q(braking),close,
  advance:q(field.cumulativeAdvancement-previous.cumulativeAdvancement)};
}
function cmp(a,b,clearanceFirst){
 const aa=clearanceFirst?
  [a.ticks,-a.close,-a.braking,a.minSpeed,a.advance]:
  [a.ticks,a.minSpeed,-a.close,-a.braking,a.advance];
 const bb=clearanceFirst?
  [b.ticks,-b.close,-b.braking,b.minSpeed,b.advance]:
  [b.ticks,b.minSpeed,-b.close,-b.braking,b.advance];
 for(let k=0;k<aa.length;k++)
  if(Math.abs(aa[k]-bb[k])>EPS)return bb[k]-aa[k];
 return 0;
}
export function chooseStep98LongHorizonPhysicalTickV3(
 previous,firstPlans,makeFuture,originalA64,{
 horizonSeconds=6,maxFirst=5,beamWidth=2,
 maxFuture=2,clearanceFirst=true
 }={}){
 if(!previous||!Array.isArray(previous.states)||
  previous.states.length<2||previous.states.length>168||
  !Array.isArray(firstPlans)||firstPlans.length<1||
  firstPlans.length>8||typeof makeFuture!=='function'||
  typeof originalA64!=='function'||
  ![4,6,8].includes(horizonSeconds)||
  !Number.isInteger(maxFirst)||maxFirst<1||maxFirst>8||
  !Number.isInteger(beamWidth)||beamWidth<1||beamWidth>3||
  !Number.isInteger(maxFuture)||maxFuture<1||maxFuture>3||
  typeof clearanceFirst!=='boolean')
  throw Error('A98 invalid global physical search');
 const ticks=horizonSeconds*2;
 let firstRejected=null,firstSporting=null,selected=null;
 const ledger={originalSolverCalls:0,physicalRejections:0,
  movingRejections:0,upstreamRejections:0,
  downstreamRejections:0,firstPhysicallyAccepted:0,
  fullHorizonValidCandidates:0};
 const step=(prev,req)=>{
  const p=scan(prev,req,originalA64);
  ledger.originalSolverCalls++;
  if(p.kind==='A64'&&!p.accepted)ledger.physicalRejections++;
  if(p.kind==='SPORTING'){
   ledger.movingRejections++;
   if(p.check.upstreamSlow)ledger.upstreamRejections++;
   if(p.check.downstreamSlow)ledger.downstreamRejections++;
  }
  return p;
 };
 const evidence=[];
 for(const p of firstPlans.slice(0,maxFirst)){
  const first=step(previous,p);
  if(!first.accepted){
   if(first.kind==='A64'&&!firstRejected)firstRejected=first.actual;
   if(first.kind==='SPORTING'&&!firstSporting)firstSporting=first.check;
   evidence.push({policy:p.policy,acceptedFirst:false,
    reason:first.reason,actualHorizonSteps:0});
   continue;
  }
  ledger.firstPhysicallyAccepted++;
  const initialQuality=quality(previous,first.actual);
  let beams=[{field:first.actual,ticks:1,close:initialQuality.close,
    braking:initialQuality.braking,
    minSpeed:initialQuality.minimum,advance:initialQuality.advance}];
  let best=beams[0],numExpanded=0;
  for(let k=1;k<ticks;k++){
   const next=[];
   for(const b of beams){
    const options=makeFuture(b.field);
    if(!Array.isArray(options)||!options.length)
     throw Error('A98 empty future physical proposals');
    for(const future of options.slice(0,maxFuture)){
     const checked=step(b.field,future);
     numExpanded++;
     if(!checked.accepted)continue;
     const m=quality(b.field,checked.actual);
     next.push({
      field:checked.actual,ticks:b.ticks+1,
      close:b.close+m.close,braking:q(b.braking+m.braking),
      minSpeed:Math.min(b.minSpeed,m.minimum),
      advance:q(b.advance+m.advance)
     });
    }
   }
   if(!next.length)break;
   next.sort((a,b)=>cmp(a,b,clearanceFirst));
   beams=next.slice(0,beamWidth);
   best=beams[0];
  }
  if(best.ticks===ticks)ledger.fullHorizonValidCandidates++;
  const record={policy:p.policy,acceptedFirst:true,
   actualHorizonSteps:best.ticks,fullSixSecondPreview:best.ticks===ticks,
   observedMinSpeedMps:best.minSpeed,
   pairProximityTicks:best.close,
   achievedBrakingMps:best.braking,
   achievedProgressM:best.advance,
   futureProposalsSwept:numExpanded};
  evidence.push(record);
  if(!selected||cmp(best,selected.score,clearanceFirst)<0)
   selected={policy:p.policy,score:best};
 }
 const status=selected?'A98_VERIFIED_MOVING_FIRST_TICK':
  ledger.movingRejections>0?'A98_NO_MOVING_PHYSICAL_REQUEST':
  'NO_SAFE_PHYSICAL_REQUEST';
 return {status,selectedPolicy:selected?.policy??null,
  physicallySafeLookaheadTicks:selected?.score.ticks??0,
  horizonSeconds,previewLedger:ledger,
  firstRejected,firstSportingViolation:firstSporting,
  evidence,mustResweepSelectedFirstTickWithOriginalA64:true,
  noPredictedStateCommitted:true,originalA64Unmodified:true,
  forecastIsNot180SecondClearance:true,officialWrites:0,
  sportingApproval:'NO_GO'};
}
