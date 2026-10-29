/** Step79 whole-peloton synchronous current-tick candidate adjudication.
 * All candidate movements are isolated and subject to original strict
 * swept-body/road-edge/energy acceptance. No rejected tick is committed.
 */
const EPS=1e-8;
// Synthetic A64 field is stored at 1e-6m precision. Quantize all
// symmetry-sensitive risk/tie comparisons to fixed physical precision.
const q=x=>Math.round(x*1e5)/1e5;
function spatialStoppingRisk(states){
 // Current achieved positions/velocities AFTER a *hypothetical* swept
 // accepted tick. This is a causal risk heuristic, not official motion.
 let total=0,critical=0;
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j],dx=q(Math.abs(a.x-b.x));
  if(dx>23)continue;
  const dy=q(Math.abs(a.y-b.y));
  const ta=Number.isFinite(a.targetY)?a.targetY:a.y;
  const tb=Number.isFinite(b.targetY)?b.targetY:b.y;
  const targetDy=q(Math.abs(ta-tb));
  const cross=q(a.y-b.y)*q(ta-tb)<-EPS;
  if(dy>1.12&&targetDy>1.12&&!cross)continue;
  const leader=q(a.x-b.x)>EPS?a:q(b.x-a.x)>EPS?b:null;
  const rear=leader===a?b:leader===b?a:null;
  // At equal x, only a shared intended track is precarious;
  // five-abreast adjacent riders separated by .95m are physically valid.
  if(!leader){
   if(targetDy<.85&&dy>.85)total+=.2;
   continue;
  }
  const closing=q(Math.max(0,rear.v-leader.v));
  const needed=2.35+2.8*closing+closing*closing/(2*.85);
  const overlap=dy<.85?1:targetDy<.85||cross?.5:0;
  if(!overlap)continue;
  const shortage=Math.max(0,needed+4-dx);
  total+=overlap*shortage*shortage;
  if(dx<needed&&dy<.85)critical++;
 }
 return total+critical*25;
}
export function chooseDistributedPhysicalTickV3(snapshot,candidates,step,{
 qualityMode='balanced'
}={}){
 if(!snapshot||!Array.isArray(snapshot.states)||!Number.isInteger(
  snapshot.acceptedSteps)||!Number.isFinite(snapshot.at)||
  !Array.isArray(candidates)||candidates.length<2||candidates.length>8||
  typeof step!=='function'||!['balanced','baseline_first','no_stops','spatial_risk']
   .includes(qualityMode))throw Error('A79 invalid choice inputs');
 let winner=null,firstRejected=null;
 const outcomes=[],seen=new Set();
 for(const proposal of candidates){
  if(!proposal||typeof proposal.policy!=='string'||
   !proposal.policy||seen.has(proposal.policy)||
   !Array.isArray(proposal.requests)||
   proposal.requests.length!==snapshot.states.length)
    throw Error('A79 malformed candidate or duplicate policy');
  seen.add(proposal.policy);
  const field=structuredClone(snapshot);
  for(let i=0;i<field.states.length;i++){
   const s=field.states[i],r=proposal.requests[i];
   if(!r||r.id!==s.id||
    !Number.isFinite(r.speed)||!Number.isFinite(r.targetY)||
    r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A79 invalid bounded candidate');
   s.desired=r.speed;s.targetY=r.targetY;
  }
  const physical=step(field);
  const accepted=physical?.reason===null&&
    physical.acceptedSteps===snapshot.acceptedSteps+1&&
    Math.abs(physical.at-snapshot.at-.5)<1e-7&&
    physical.states?.length===snapshot.states.length;
  const nearStops=accepted?physical.nearStops-snapshot.nearStops:null;
  const advancement=accepted?physical.cumulativeAdvancement-
    snapshot.cumulativeAdvancement:null;
  const risk=accepted?q(spatialStoppingRisk(physical.states)):null;
  if(!accepted&&!firstRejected)firstRejected=physical;
  outcomes.push({policy:proposal.policy,accepted,nearStops,
   advancement,spatialRisk:risk,rejection:accepted?null:
    physical?.reason??'NO_PHYSICAL_MOVEMENT'});
  if(!accepted)continue;
  const thisBest={policy:proposal.policy,physical,nearStops,
   advancement,risk};
  if(!winner){winner=thisBest;continue}
  // NEVER select more near-stops to gain artificial progress.
  if(nearStops<winner.nearStops){winner=thisBest;continue}
  if(nearStops>winner.nearStops)continue;
  if(qualityMode==='spatial_risk'){
   if(risk<winner.risk-1e-4){winner=thisBest;continue}
   if(risk>winner.risk+1e-4)continue
  }
  if(qualityMode==='baseline_first'&&winner.policy==='baseline')continue;
  if(qualityMode==='baseline_first'&&thisBest.policy==='baseline'){
   winner=thisBest;continue;
  }
  // In balanced mode, equal safe near-stop outcomes may choose the
  // greatest actually accepted movement, not a fictitious projection.
  if(q(advancement)>q(winner.advancement)+1e-4)winner=thisBest;
 }
 return {status:winner?'PHYSICALLY_ACCEPTED':'NO_SAFE_PROPOSAL',
  policy:winner?.policy??null,physical:winner?.physical??null,
  firstRejected,outcomes,selectedSpatialRisk:winner?.risk??null,
  rejectedUncommitted:outcomes.filter(p=>!p.accepted).length,
  noMotionRepair:true,noSportingApproval:true,officialWrites:0};
}
