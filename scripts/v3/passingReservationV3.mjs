/** Offline Batch 30 finite-duration lateral maneuver. No official race writes.
 * Candidate rider occupies its source lane while a clearance reservation is
 * checked against both the source/destination corridors each tick. Nothing
 * grants forward metres, and aborts are fail closed.
 */
export function firstClipCauseV3(before, moves, seconds, clearance=1.8) {
  if (!Number.isFinite(seconds)||seconds<=0||seconds>20||!Number.isFinite(clearance)||clearance<1.5||clearance>5||before.length!==moves.length)
    throw Error('Invalid clip diagnostics');
  const start = new Map(before.map(x=>[x.riderId,x]));
  const final = new Map(moves.map(x=>[x.riderId,x]));
  if(start.size!==before.length||final.size!==moves.length||[...start.keys()].some(x=>!final.has(x)))throw Error('Missing or duplicate wheel');
  let clipped=0, leaderConstrained=0, blockedWithClearAlternate=0, blockedAdjacent=0;
  const rows=[];
  for (const x of before){
    const y=final.get(x.riderId),want=x.meters+x.desiredMps*seconds, deficit=Math.max(0,want-y.meters);
    if(!Number.isFinite(want)||!Number.isFinite(y.meters)||y.meters<x.meters-1e-5)throw Error('Nonfinite or backward wheel');
    if(deficit<1e-5)continue;
    clipped++;
    const same=moves.filter(z=>z.riderId!==x.riderId&&z.lane===x.lane&&z.oldMeters>=x.meters-1e-6).sort((a,b)=>a.meters-b.meters)[0];
    const leaderLimited=Boolean(same&&same.meters-clearance < want-1e-5);
    leaderConstrained+=Number(leaderLimited);
    const options=[x.lane-1,x.lane+1].filter(l=>l>=0&&l<=5);
    const blocked=options.every(l=>before.some(z=>z.riderId!==x.riderId&&z.lane===l&&z.meters>=x.meters-clearance&&z.meters<=want+clearance));
    blockedAdjacent+=Number(blocked);blockedWithClearAlternate+=Number(!blocked);
    rows.push({riderId:x.riderId,deficitMeters:Math.round(deficit*1e6)/1e6,leaderId:same?.riderId??null,leaderLimited,adjacentOldPositionBlocked:blocked});
  }
  return {clipped,leaderConstrained,blockedAdjacent,blockedWithClearAlternate,rows};
}
export function startReservationV3(choice, current, durationTicks=3) {
  if(!choice||!Number.isInteger(durationTicks)||durationTicks<2||durationTicks>6)throw Error('Invalid passing duration');
  const rider=current.find(x=>x.riderId===choice.riderId);
  if(!rider||rider.lane!==choice.fromLane||Math.abs(rider.meters-choice.meters)>1e-5||Math.abs(choice.toLane-choice.fromLane)!==1)throw Error('Stale passing choice');
  return {riderId:choice.riderId,fromLane:choice.fromLane,toLane:choice.toLane,remainingTicks:durationTicks,requiredTicks:durationTicks,mechanicalJoules:0};
}
/** Before and after arrays describe one independent unchanged-speed spatial tick.
 * No lane is changed until all required protected ticks pass clearance.
 */
export function stepReservationV3(reservation,before,after,seconds,additionalWatts=35,clearance=1.8) {
  if(!reservation||!Number.isFinite(seconds)||seconds<=0||seconds>20||!Number.isFinite(additionalWatts)||additionalWatts<0||additionalWatts>100||!Number.isFinite(clearance)||clearance<1.5||clearance>5)throw Error('Invalid passing step');
  const a=before.find(x=>x.riderId===reservation.riderId),b=after.find(x=>x.riderId===reservation.riderId);
  if(!a||!b||a.lane!==reservation.fromLane||b.lane!==reservation.fromLane||b.meters<a.meters-1e-5)throw Error('Passing source lane left or invalid');
  const cost=reservation.mechanicalJoules+seconds*additionalWatts;
  for(const other of before){
    if(other.riderId===a.riderId)continue;
    const next=after.find(x=>x.riderId===other.riderId);
    if(!next)throw Error('Missing traffic wheel');
    // Safe across both lanes, including source/destination switches.
    if([other.lane,next.lane].some(l=>l===reservation.toLane)){
      const d0=a.meters-other.meters,d1=b.meters-next.meters;
      if(d0*d1<0||Math.min(Math.abs(d0),Math.abs(d1))<clearance-1e-6)
        return {status:'rejected',reservation:null,commitLane:null,mechanicalJoules:cost};
    }
  }
  const left=reservation.remainingTicks-1;
  if(left===0)return {status:'completed',reservation:null,commitLane:reservation.toLane,mechanicalJoules:cost};
  return {status:'pending',reservation:{...reservation,remainingTicks:left,mechanicalJoules:cost},commitLane:null,mechanicalJoules:cost};
}
export function speedBudgetForPassingV3(requested,wattsAt,additionalWatts=35){
  if(!Number.isFinite(requested)||requested<0||requested>30||!Number.isFinite(additionalWatts)||additionalWatts<0||additionalWatts>100)throw Error('Invalid speed request');
  const budget=wattsAt(requested)-additionalWatts;
  if(!Number.isFinite(budget)||budget<0) return 0;
  let lo=0,hi=requested;
  for(let i=0;i<45;i++){const mid=(hi+lo)/2;if(wattsAt(mid)>budget)hi=mid;else lo=mid}
  return Math.min(requested,lo);
}
