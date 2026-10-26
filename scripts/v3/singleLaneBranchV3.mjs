/** Offline-only single-lane checkpoint intervention; no physical solver changes. */
export function chooseSingleLaneV3(before,moves,plan,spacing=1.8){
 if(before.length!==moves.length||plan.riders.length!==moves.length||spacing<1.5||spacing>5)throw Error('Invalid lane branch inputs')
 const b=new Map(before.map(x=>[x.riderId,x])),m=new Map(moves.map(x=>[x.riderId,x]))
 if(b.size!==before.length||m.size!==moves.length||plan.riders.some(x=>!b.has(x.riderId)||!m.has(x.riderId)))throw Error('Duplicate or missing wheel')
 const offered=plan.riders.filter(x=>x.promoted&&x.lane!==x.fromLane).sort((a,b)=>a.riderId.localeCompare(b.riderId))
 for(const p of offered){
  const old=b.get(p.riderId),end=m.get(p.riderId)
  if(!end.wheelLimited||end.lane!==p.fromLane||Math.abs(end.meters-p.meters)>1e-5||!old)throw Error('Stale planned lane')
  if(moves.some(x=>x.riderId!==p.riderId&&x.lane===p.lane&&Math.abs(x.meters-p.meters)<spacing-1e-5))continue
  return {riderId:p.riderId,fromLane:p.fromLane,toLane:p.lane,meters:p.meters}
 }
 return null
}
export function forkSingleLaneV3(state,choice,spacing=1.8){
 if(!state?.riders||!choice||!Number.isFinite(spacing)||spacing<1.5||spacing>5)throw Error('Invalid intervention')
 const source=state.riders.find(x=>x.riderId===choice.riderId)
 if(!source||source.lane!==choice.fromLane||Math.abs(source.meters-choice.meters)>1e-5||!Number.isInteger(choice.toLane)||choice.toLane===source.lane||choice.toLane<0||choice.toLane>5)throw Error('Stale checkpoint choice')
 const copy=structuredClone(state),target=copy.riders.find(x=>x.riderId===choice.riderId)
 target.lane=choice.toLane
 if(copy.riders.some(x=>x.riderId!==target.riderId&&x.lane===target.lane&&Math.abs(x.meters-target.meters)<spacing-1e-5))throw Error('Overlapping shifted wheels')
 const undone=structuredClone(copy);undone.riders.find(x=>x.riderId===target.riderId).lane=choice.fromLane
 if(JSON.stringify(undone)!==JSON.stringify(state))throw Error('Unexpected non-lateral state change')
 return copy
}
