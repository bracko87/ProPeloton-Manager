/** A78 phase 2. Coupled 3-8-rider prospective spatial negotiation.
 * Current physical state, legal rider requests, and immutable road only.
 * The existing strict swept-body solver alone accepts physical movement.
 * Candidate rejections are diagnostic pre-commit probes, not rollbacks.
 */
const DT=.5,EPS=1e-8;
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite=x=>typeof x==='number'&&Number.isFinite(x);

function input(previous,base,joint,step){
 if(!previous||!Array.isArray(previous.states)||previous.states.length<2||
    previous.states.length>168||!Number.isInteger(previous.acceptedSteps)||
    !finite(previous.at)||!Array.isArray(base)||!Array.isArray(joint)||
    base.length!==previous.states.length||joint.length!==base.length||
    typeof step!=='function')throw Error('A78 local invalid physical field');
 const ids=new Set();
 for(let i=0;i<base.length;i++){
  const s=previous.states[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
     ![s.x,s.y,s.v].every(finite)||s.v<0||s.v>50||
     ![base[i],joint[i]].every(r=>r&&r.id===s.id&&
       [r.speed,r.targetY].every(finite)&&r.speed>=0&&
       r.speed<=50&&r.targetY>=0&&r.targetY<=4.4))
    throw Error('A78 local invalid/duplicate bicycle or command');
  ids.add(s.id);
 }
}
function pairRisk(a,b,ra,rb){
 const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
 if(dx>30)return 0;
 const tdx=Math.abs(ra.targetY-rb.targetY);
 const crossing=(a.y-b.y)*(ra.targetY-rb.targetY)<-EPS;
 const nearLateral=Math.min(dy,tdx)<1.25||crossing;
 if(!nearLateral)return 0;
 const ahead=a.x>b.x+EPS?a:b.x>a.x+EPS?b:null;
 const rear=ahead===a?b:ahead===b?a:null;
 const closing=rear?Math.max(0,rear.v-ahead.v):0;
 // Present x/y/v and requests only; no future accepted bicycle motion.
 const futureGap=dx-closing*4;
 const lanePressure=dy<.85||tdx<.85||crossing?2:1;
 return lanePressure*(clip(9-futureGap,0,20)+
   clip(2.7-dx,0,2.7)*1.5)+closing;
}
export function localRiskNeighborhoodV3(states,requests,{maxRiders=8}={}){
 if(!Array.isArray(states)||!Array.isArray(requests)||
    states.length!==requests.length||![3,4,5,6,7,8].includes(maxRiders))
   throw Error('A78 local invalid neighborhood');
 let best=null;
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const score=pairRisk(states[i],states[j],requests[i],requests[j]);
  if(score>EPS&&(!best||score>best.score+EPS))best={i,j,score};
 }
 if(!best)return {indices:[],pair:[],risk:0,size:0};
 const {i,j,score}=best;
 const distances=states.map((s,k)=>({k,
  d:Math.min(Math.abs(s.x-states[i].x)*.6+
     Math.abs(s.y-states[i].y)*1.1,
    Math.abs(s.x-states[j].x)*.6+Math.abs(s.y-states[j].y)*1.1)}))
  .filter(x=>x.k!==i&&x.k!==j&&x.d<=12)
  .sort((a,b)=>a.d-b.d||a.k-b.k);
 const indices=[i,j,...distances.slice(0,maxRiders-2).map(x=>x.k)];
 return {indices,pair:[i,j],risk:score,size:indices.length};
}
export function localNegotiatedRequestsV3(states,requests,{
 maxRiders=8,mode='hold_lateral',seedPair=null
}={}){
 if(!Array.isArray(states)||!Array.isArray(requests)||
    states.length!==requests.length||
    new Set(states.map(s=>s.id)).size!==states.length||
    states.some((s,i)=>!requests[i]||requests[i].id!==s.id))
  throw Error('A78 local invalid rider and request identity');
 if(!['hold_lateral','assist_and_yield','selective_hold'].includes(mode))
  throw Error('A78 local invalid negotiation policy');
 let neighborhood=localRiskNeighborhoodV3(states,requests,{maxRiders});
 if(seedPair!==null){
  if(!Array.isArray(seedPair)||seedPair.length!==2||
      seedPair.some(x=>typeof x!=='string'))throw Error('A78 bad pair');
  const a=states.findIndex(s=>s.id===seedPair[0]),
   b=states.findIndex(s=>s.id===seedPair[1]);
  if(a>=0&&b>=0&&a!==b){
   // Contact from speculative rejected tick selects only current-state
   // physical neighbors. No accepted coordinates are repaired.
   const candidates=states.map((s,k)=>({k,
    d:Math.min(Math.abs(s.x-states[a].x)*.6+
      Math.abs(s.y-states[a].y),
     Math.abs(s.x-states[b].x)*.6+Math.abs(s.y-states[b].y))}))
    .filter(x=>x.k!==a&&x.k!==b&&x.d<=12)
    .sort((x,y)=>x.d-y.d||x.k-y.k);
   const indices=[a,b,...candidates.slice(0,maxRiders-2).map(x=>x.k)];
   neighborhood={indices,pair:[a,b],risk:1,size:indices.length};
  }
 }
 const result=requests.map(r=>({...r}));
 if(!neighborhood.size)return {requests:result,neighborhood,
   protectedLeads:0,brakedFollowers:0,heldLanes:0,officialWrites:0};
 let protectedLeads=0,brakedFollowers=0,heldLanes=0;
 // All decisions are symmetric in road x/y. No named rider or favored side.
 const sorted=neighborhood.indices.slice().sort((a,b)=>states[b].x-states[a].x);
 for(const idx of sorted){
  const s=states[idx],r=result[idx];
  if(Math.abs(r.targetY-s.y)>EPS){
   const occupied=neighborhood.indices.some(j=>j!==idx&&
     Math.abs(states[j].x-s.x)<5&&
     (Math.abs(states[j].y-r.targetY)<1.1||
      Math.abs(states[j].y-s.y)<.85));
   if((mode==='hold_lateral'||mode==='assist_and_yield')&&occupied||
       mode==='selective_hold'&&occupied&&Math.abs(states[idx].x-
       states[neighborhood.pair[0]].x)<7){
    r.targetY=s.y;heldLanes++;
   }
  }
 }
 for(const idx of sorted){
  const s=states[idx],r=result[idx];
  const ahead=sorted.filter(j=>j!==idx&&states[j].x>s.x+EPS&&
      states[j].x-s.x<22&&
      (Math.abs(states[j].y-s.y)<1.25||
       Math.abs(result[j].targetY-r.targetY)<1.1))
    .sort((a,b)=>states[a].x-states[b].x)[0];
  if(ahead===undefined)continue;
  const lead=states[ahead],leader=result[ahead],gap=lead.x-s.x;
  const closing=Math.max(0,s.v-lead.v);
  const need=2.6+3*closing+closing*closing/(2*.85);
  const targetV=lead.v+clip((gap-need)/2,-3,.8);
  if(targetV<r.speed-EPS){r.speed=Math.max(0,targetV);brakedFollowers++}
  if((mode==='assist_and_yield'||mode==='selective_hold')&&
     gap<need+4){
   const accelerated=clip(Math.max(leader.speed,
       lead.v+(.45*DT)),0,50);
   if(accelerated>leader.speed+EPS){leader.speed=accelerated;protectedLeads++}
  }
 }
 return {requests:result,neighborhood,protectedLeads,
   brakedFollowers,heldLanes,officialWrites:0};
}
function evaluate(previous,candidate,step){
 const proposed=structuredClone(previous);
 for(let i=0;i<proposed.states.length;i++){
  proposed.states[i].desired=candidate.requests[i].speed;
  proposed.states[i].targetY=candidate.requests[i].targetY;
 }
 const actual=step(proposed);
 const accepted=actual?.reason===null&&
   actual.acceptedSteps===previous.acceptedSteps+1&&
   Math.abs(actual.at-previous.at-DT)<1e-7&&
   actual.states?.length===previous.states.length;
 const nearStops=accepted?actual.nearStops-previous.nearStops:null;
 const advancement=accepted?
   actual.cumulativeAdvancement-previous.cumulativeAdvancement:null;
 return {actual,accepted,nearStops,advancement};
}
/** Up to seven complete synchronized proposals are checked pre-commit.
 * Failed candidates never become accepted physical fields.
 */
export function chooseLocalNegotiatedPhysicalTickV3(previous,base,joint,step,{
 maxRiders=8,enablePreemptive=false,maxEvaluations=7
}={}){
 input(previous,base,joint,step);
 if(![3,4,5,6,7,8].includes(maxRiders)||
    ![2,3,4,5,6,7].includes(maxEvaluations)||
    typeof enablePreemptive!=='boolean')
   throw Error('A78 invalid local negotiation parameters');
 const proposals=[{policy:'baseline',requests:base},
  {policy:'joint',requests:joint}];
 const checks=[],rejectedPairs=[];
 let best=null,firstRejected=null;
 const check=(p)=>{
  const x=evaluate(previous,p,step);
  if(!x.accepted){
   if(!firstRejected)firstRejected=x.actual;
   const pair=x.actual?.firstCollision?.pair;
   if(Array.isArray(pair)&&pair.length===2)rejectedPairs.push(pair);
  }
  checks.push({policy:p.policy,accepted:x.accepted,
   rejection:x.accepted?null:x.actual?.reason??'NO_PHYSICAL_STEP',
   nearStops:x.nearStops,advancement:x.advancement});
  if(x.accepted&&(!best||x.nearStops<best.nearStops||
     x.nearStops===best.nearStops&&
      x.advancement>best.advancement+1e-8))
   best={...x,policy:p.policy};
 };
 for(const p of proposals)check(p);
 const risk=localRiskNeighborhoodV3(previous.states,base,{maxRiders});
 if(enablePreemptive||!best){
  for(const mode of ['hold_lateral','assist_and_yield','selective_hold']){
   if(checks.length>=maxEvaluations)break;
   const local=localNegotiatedRequestsV3(previous.states,base,
    {maxRiders,mode,seedPair:rejectedPairs[0]??null});
   check({policy:'local_'+mode,requests:local.requests});
  }
  if(!best&&rejectedPairs.length){
   for(const mode of ['assist_and_yield','hold_lateral']){
    if(checks.length>=maxEvaluations)break;
    const local=localNegotiatedRequestsV3(previous.states,joint,
     {maxRiders,mode,seedPair:rejectedPairs[0]});
    check({policy:'joint_'+mode,requests:local.requests});
   }
  }
 }
 return {status:best?'ACCEPTED':'NO_ACCEPTABLE_PROPOSAL',
  policy:best?.policy??null,physical:best?.actual??null,
  firstRejected,probes:checks,neighborhoodSize:risk.size,
  rejectedUncommitted:checks.filter(x=>!x.accepted).length,
  noProductionAuthorization:true,noRollback:true,officialWrites:0};
}
