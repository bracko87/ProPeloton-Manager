/** V3 Step80. Opt-in, bounded receding-horizon full-field physical planning.
 *
 * Hypothetical future states come ONLY from the original synchronized swept
 * bicycle/road/energy solver. Future states inform a first-tick *request*
 * choice; they are never committed, published or retroactively repaired.
 * An authoritative caller MUST re-sweep the selected first action.
 */
const DT=.5,EPS=1e-7,round=x=>Math.round(x*1e5)/1e5;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function validateField(s){
 if(!s||!Array.isArray(s.states)||s.states.length<2||
  s.states.length>168||!finite(s.at)||
  !Number.isInteger(s.acceptedSteps)||!finite(s.nearStops)||
  !finite(s.cumulativeAdvancement))throw Error('A80 bad physical field');
}
function safeStep(previous,plan,step){
 if(!plan||typeof plan.policy!=='string'||!plan.policy||
  !Array.isArray(plan.requests)||
  plan.requests.length!==previous.states.length)
  throw Error('A80 malformed prospective requests');
 const field=structuredClone(previous);
 for(let i=0;i<field.states.length;i++){
  const s=field.states[i],r=plan.requests[i];
  if(!r||r.id!==s.id||![r.speed,r.targetY].every(finite)||
    r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A80 malformed rider request');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const result=step(field);
 const accepted=result?.reason===null&&
  result.acceptedSteps===previous.acceptedSteps+1&&
  Math.abs(result.at-previous.at-DT)<EPS&&
  result.states?.length===previous.states.length;
 return {accepted,physical:accepted?result:null,
  rejected:accepted?null:result,
  addedNearStops:accepted?result.nearStops-previous.nearStops:null,
  advance:accepted?result.cumulativeAdvancement-
   previous.cumulativeAdvancement:null};
}
/** Current-state, mirror-neutral future clearance score. A predictor is
 * never a replacement for accepted geometry: these are *only* selection
 * preferences over physically swept candidate states.
 */
export function step80ClearanceRiskV3(states){
 if(!Array.isArray(states)||states.length<2||
  states.length>168)throw Error('A80 malformed risk states');
 let risk=0;
 for(let i=0;i<states.length;i++){
  const a=states[i];
  for(let j=i+1;j<states.length;j++){
   const b=states[j],dx=round(Math.abs(a.x-b.x));
   if(dx>25)continue;
   const dy=round(Math.abs(a.y-b.y));
   const ty=round(Math.abs((a.targetY??a.y)-(b.targetY??b.y)));
   const cross=round(a.y-b.y)*round(
    (a.targetY??a.y)-(b.targetY??b.y))<-EPS;
   if(dy>1.12&&ty>1.12&&!cross)continue;
   if(dx<1e-6)continue; // equal-x bikes in distinct valid tracks
   const leader=a.x>b.x?a:b,back=leader===a?b:a;
   const closing=Math.max(0,back.v-leader.v);
   const reserve=2.35+2.6*closing+closing*closing/1.7;
   const overlap=dy<.85?1:ty<.85||cross?.5:0;
   if(overlap>0)risk+=overlap*Math.pow(Math.max(0,reserve+3-dx),2);
  }
 }
 return round(risk);
}
/** Compare first-tick candidates with multiple *future accepted* solver
 * steps, generated afresh from the resulting current physical state.
 *
 * A80 Phase 1 bounds: depth=2 or 3 half-second ticks; max 5 first
 * candidates, <=3 future actions, one best path per first candidate.
 * Conservative clear/no-near-stop depth dominates distance advancement.
 */
export function chooseRecedingHorizonTickV3(previous,first,makeFuture,step,{
 depth=2,maxFirst=5,maxFuture=3
}={}){
 validateField(previous);
 if(!Array.isArray(first)||first.length<1||first.length>8||
   typeof makeFuture!=='function'||typeof step!=='function'||
   ![2,3].includes(depth)||!Number.isInteger(maxFirst)||
   maxFirst<1||maxFirst>6||!Number.isInteger(maxFuture)||
   maxFuture<1||maxFuture>3)
  throw Error('A80 invalid depth or search budget');
 const proposals=first.slice(0,maxFirst);
 let best=null,firstRejected=null;
 const evidence=[];
 const evaluated=proposals.map(p=>{
  const outcome=safeStep(previous,p,step);
  if(!outcome.accepted&&!firstRejected)
   firstRejected=outcome.rejected;
  return {policy:p.policy,...outcome};
 });
 for(const root of evaluated){
  if(!root.accepted){
   evidence.push({policy:root.policy,accepted:false,
    physicallyClearTicks:0,futureComplete:false,
    rejectedReason:root.rejected?.reason??'NO_PHYSICAL_STEP'});
   continue;
  }
  let branches=[{physical:root.physical,
   nearStopDelta:root.addedNearStops,
   gainedDistance:root.advance,labels:[]}];
  let depthReached=1,rejectedFuture=0,branchEvaluations=0;
  for(let level=1;level<depth;level++){
   const next=[];
   for(const branch of branches){
    const choices=makeFuture(branch.physical);
    if(!Array.isArray(choices)||!choices.length)
     throw Error('A80 no current-state future actions');
    for(const action of choices.slice(0,maxFuture)){
     const res=safeStep(branch.physical,action,step);
     branchEvaluations++;
     if(!res.accepted){rejectedFuture++;continue}
     next.push({physical:res.physical,
      nearStopDelta:branch.nearStopDelta+res.addedNearStops,
      gainedDistance:branch.gainedDistance+res.advance,
      labels:[...branch.labels,action.policy]});
    }
   }
   if(!next.length)break;
   // Limit search across hypotheses; compare physical risk in the
   // actually swept provisional state, never look up rider names.
   next.sort((a,b)=>a.nearStopDelta-b.nearStopDelta||
    step80ClearanceRiskV3(a.physical.states)-
     step80ClearanceRiskV3(b.physical.states)||
    b.gainedDistance-a.gainedDistance);
   branches=next.slice(0,2);
   depthReached=level+1;
  }
  const finish=branches[0];
  const rec={policy:root.policy,accepted:true,
   physicallyClearTicks:depthReached,
   futureComplete:depthReached===depth,
   horizonNearStopTicks:finish.nearStopDelta,
   horizonClearanceRisk:step80ClearanceRiskV3(finish.physical.states),
   horizonDistanceAdvance:round(finish.gainedDistance),
   rejectedFuture,branchEvaluations,
   firstNearStopTicks:root.addedNearStops,
   firstDistanceAdvance:round(root.advance)};
  evidence.push(rec);
  // No near-stop preference and more true physical clearance dominate
  // incremental progress. Choose earliest listed plan on exact tie.
  const comparison=x=>[
   x.horizonNearStopTicks===0?1:0,
   x.physicallyClearTicks,
   -x.horizonNearStopTicks,
   -x.horizonClearanceRisk,
   x.horizonDistanceAdvance
  ];
  const a=comparison(rec),b=best?comparison(best.record):null;
  let better=!best;
  if(b)for(let i=0;i<a.length;i++){
   const delta=round(a[i])-round(b[i]);
   if(Math.abs(delta)<1e-4)continue;
   better=delta>0;break;
  }
  if(better)best={record:rec,firstPhysical:root.physical};
 }
 return {status:best?'PHYSICAL_FIRST_TICK_SELECTED':'NO_SAFE_FIRST_TICK',
  selectedPolicy:best?.record.policy??null,
  firstPhysicalPreview:best?.firstPhysical??null,
  firstRejected,evidence,
  physicallySafeLookaheadTicks:best?.record.physicallyClearTicks??0,
  noFutureStateCommitted:true,noPhysicalAuthority:true,
  officialWrites:0,sportingApproval:'NO_GO'};
}
