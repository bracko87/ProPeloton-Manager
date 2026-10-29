/** Pre-commit physical proposal comparison for one research tick.
 * Every candidate goes through the unchanged authoritative swept solver.
 * Rejected candidates are NEVER committed or used as accepted path data.
 */
export function chooseProspectivePhysicalTickV3(previous,candidates,step){
 if(!previous||!Array.isArray(previous.states)||
    !Array.isArray(candidates)||candidates.length<1||candidates.length>4||
    typeof step!=='function'||!Number.isFinite(previous.at)||
    !Number.isInteger(previous.acceptedSteps))
  throw Error('A78 invalid pre-commit comparison')
 let best=null,firstRejected=null
 const probes=[]
 for(const candidate of candidates){
  if(!candidate||typeof candidate.policy!=='string'||
     !Array.isArray(candidate.requests)||
     candidate.requests.length!==previous.states.length)
   throw Error('A78 invalid prospective candidate')
  const scratch=structuredClone(previous)
  for(let i=0;i<scratch.states.length;i++){
   const state=scratch.states[i],r=candidate.requests[i]
   if(!r||r.id!==state.id||![r.speed,r.targetY].every(Number.isFinite)||
      r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A78 invalid physical request')
   state.desired=r.speed;state.targetY=r.targetY
  }
  const check=step(scratch)
  const accepted=check?.reason===null&&
   check.acceptedSteps===previous.acceptedSteps+1&&
   Math.abs(check.at-previous.at-.5)<1e-7&&
   check.states?.length===previous.states.length
  const nearStops=accepted?check.nearStops-previous.nearStops:null
  const advancement=accepted?check.cumulativeAdvancement-
   previous.cumulativeAdvancement:null
  if(!accepted&&!firstRejected)firstRejected=check
  probes.push({policy:candidate.policy,accepted,
   rejection:accepted?null:check?.reason??'NO_PHYSICAL_STEP',
   nearStopRiderTicks:nearStops,advancement})
  // Favor physical acceptance, fewer near-stop ticks, and then greater
  // actual advancement. Exact scores preserve defined candidate order.
  if(accepted&&(!best||nearStops<best.nearStops||
     nearStops===best.nearStops&&advancement>best.advancement+1e-8))
   best={policy:candidate.policy,result:check,nearStops,advancement}
 }
 return {status:best?'ACCEPTED':'NO_ACCEPTABLE_PROPOSAL',
  policy:best?.policy??null,physical:best?.result??null,
  firstRejected,probes,
  officialWrites:0,onlineProductionAuthorization:false}
}
