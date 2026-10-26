/** OFFLINE-only finish/order & peloton split diagnostics. */
export function compareFinishOrderV3(control,candidate){
 if(!Array.isArray(control)||!Array.isArray(candidate)||control.length!==candidate.length||!control.length)throw Error('Invalid paired finish arrays')
 const c=new Map(control.map(r=>[r.riderId,r])),t=new Map(candidate.map(r=>[r.riderId,r]))
 if(c.size!==control.length||t.size!==candidate.length||[...c.keys()].some(k=>!t.has(k)))throw Error('Missing or duplicate finish rider')
 for(const r of [...control,...candidate])if(!Number.isInteger(r.rank)||r.rank<1||!Number.isFinite(r.finishSeconds)||!Number.isFinite(r.gapSeconds))throw Error('Nonfinite finish row')
 const names=[...c.keys()].sort(),n=names.length
 let changedRankCount=0,totalRankShift=0,inversions=0,maxRankChange=0
 const timeDeltas=[],gapDeltas=[]
 for(let i=0;i<n;i++){
  const a=c.get(names[i]),b=t.get(names[i]),delta=b.rank-a.rank
  changedRankCount+=Number(delta!==0);totalRankShift+=Math.abs(delta);maxRankChange=Math.max(maxRankChange,Math.abs(delta))
  timeDeltas.push(b.finishSeconds-a.finishSeconds);gapDeltas.push(b.gapSeconds-a.gapSeconds)
  for(let j=i+1;j<n;j++){
   const aa=c.get(names[j]),bb=t.get(names[j])
   if(Math.sign(a.rank-aa.rank)!==Math.sign(b.rank-bb.rank))inversions++
  }
 }
 const median=arr=>{const x=[...arr].sort((a,b)=>a-b);return(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2}
 const round6=x=>Math.round(x*1e6)/1e6
 const absTimes=timeDeltas.map(Math.abs),absGaps=gapDeltas.map(Math.abs)
 return {roster:n,changedRankCount,meanAbsoluteRankShift:round6(totalRankShift/n),maxRankChange,discordantPairs:inversions,totalPairs:n*(n-1)/2,discordantShare:round6(inversions/(n*(n-1)/2||1)),medianAbsoluteFinishChangeSeconds:round6(median(absTimes)),maxAbsoluteFinishChangeSeconds:round6(Math.max(...absTimes)),medianAbsoluteGapChangeSeconds:round6(median(absGaps)),maxAbsoluteGapChangeSeconds:round6(Math.max(...absGaps)),meanGapDeltaSeconds:round6(gapDeltas.reduce((a,b)=>a+b,0)/n)}
}
export function measurePelotonSeparationsV3(state,gapMeters=30){
 if(!state||!Array.isArray(state.riders)||!Number.isFinite(gapMeters)||gapMeters<1.8)throw Error('Invalid peloton separation snapshot')
 const active=state.riders.filter(r=>r.finishSeconds===null)
 if(active.some(r=>!Number.isFinite(r.meters)))throw Error('Nonfinite peloton position')
 const ordered=active.slice().sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 const distances=[]
 for(let i=1;i<ordered.length;i++){const gap=ordered[i-1].meters-ordered[i].meters;if(gap>=gapMeters)distances.push({leadingRiderId:ordered[i-1].riderId,trailingRiderId:ordered[i].riderId,gapMeters:Math.round(gap*1e6)/1e6})}
 return {activeRiders:ordered.length,separateGroups:ordered.length?distances.length+1:0,gapsAboveThreshold:distances.length,maximumAdjacentGapMeters:Math.round(distances.reduce((m,x)=>Math.max(m,x.gapMeters),0)*1e6)/1e6,frontToBackMeters:ordered.length?Math.round((ordered[0].meters-ordered.at(-1).meters)*1e6)/1e6:0,firstThree:distances.slice(0,3)}
}
