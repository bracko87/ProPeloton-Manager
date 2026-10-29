/** Step79 whole-peloton synchronous current-tick candidate adjudication.
 * All candidate movements are isolated and subject to original strict
 * swept-body/road-edge/energy acceptance. No rejected tick is committed.
 */
const EPS=1e-8;
export function chooseDistributedPhysicalTickV3(snapshot,candidates,step,{
 qualityMode='balanced'
}={}){
 if(!snapshot||!Array.isArray(snapshot.states)||!Number.isInteger(
  snapshot.acceptedSteps)||!Number.isFinite(snapshot.at)||
  !Array.isArray(candidates)||candidates.length<2||candidates.length>8||
  typeof step!=='function'||!['balanced','baseline_first','no_stops']
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
  if(!accepted&&!firstRejected)firstRejected=physical;
  outcomes.push({policy:proposal.policy,accepted,nearStops,
   advancement,rejection:accepted?null:
    physical?.reason??'NO_PHYSICAL_MOVEMENT'});
  if(!accepted)continue;
  const thisBest={policy:proposal.policy,physical,nearStops,advancement};
  if(!winner){winner=thisBest;continue}
  // NEVER select more near-stops to gain artificial progress.
  if(nearStops<winner.nearStops){winner=thisBest;continue}
  if(nearStops>winner.nearStops)continue;
  if(qualityMode==='baseline_first'&&winner.policy==='baseline')continue;
  if(qualityMode==='baseline_first'&&thisBest.policy==='baseline'){
   winner=thisBest;continue;
  }
  // In balanced mode, equal safe near-stop outcomes may choose the
  // greatest actually accepted movement, not a fictitious projection.
  if(advancement>winner.advancement+EPS)winner=thisBest;
 }
 return {status:winner?'PHYSICALLY_ACCEPTED':'NO_SAFE_PROPOSAL',
  policy:winner?.policy??null,physical:winner?.physical??null,
  firstRejected,outcomes,
  rejectedUncommitted:outcomes.filter(p=>!p.accepted).length,
  noMotionRepair:true,noSportingApproval:true,officialWrites:0};
}
