/** Batch 33: pure offline paired spatial diagnostic; no mutation of racing state. */
const round=x=>Math.round(x*1e6)/1e6
export function pairedFirstDivergenceV3(preA,postA,preB,postB,dt=10,materialMeters=1){
 if(!Number.isFinite(dt)||dt<=0||dt>20||!Number.isFinite(materialMeters)||materialMeters<=0||materialMeters>30)throw Error('Invalid paired tick bounds')
 if(!Array.isArray(preA)||!Array.isArray(postA)||!Array.isArray(preB)||!Array.isArray(postB))throw Error('Missing paired riders')
 const mk=arr=>{const m=new Map();for(const r of arr){if(!r?.riderId||m.has(r.riderId)||!Number.isFinite(r.meters)||!Number.isInteger(r.lane)||!Number.isInteger(r.wheelLimitedTicks)||r.wheelLimitedTicks<0)throw Error('Invalid paired rider');m.set(r.riderId,r)}return m}
 const a=mk(preA),b=mk(preB),ca=mk(postA),cb=mk(postB)
 if(a.size!==b.size||a.size!==ca.size||a.size!==cb.size||[...a.keys()].some(id=>!b.has(id)||!ca.has(id)||!cb.has(id)))throw Error('Paired rosters differ')
 const leader=(list,r)=>list.filter(x=>x.riderId!==r.riderId&&x.lane===r.lane&&x.meters>=r.meters+1.8-1e-5).sort((x,y)=>x.meters-y.meters||x.riderId.localeCompare(y.riderId))[0]?.riderId??null
 const valuesA=[...a.values()],valuesB=[...b.values()]
 let changeCount=0,movedDifferently=0,blockedDifferently=0,leaderDifferently=0,maxAdvanceDifferenceMeters=0
 const material=[],blockEvents=[]
 for(const [id,oldA] of a){
  const oldB=b.get(id),newA=ca.get(id),newB=cb.get(id)
  const deltaA=newA.meters-oldA.meters,deltaB=newB.meters-oldB.meters
  if(deltaA<-.00001||deltaB<-.00001)throw Error('Backward motion in paired tick')
  const advanceDifference=round(deltaB-deltaA)
  const blockedA=newA.wheelLimitedTicks>oldA.wheelLimitedTicks,blockedB=newB.wheelLimitedTicks>oldB.wheelLimitedTicks
  const leadA=leader(valuesA,oldA),leadB=leader(valuesB,oldB)
  if(Math.abs(advanceDifference)>1e-5)movedDifferently++
  if(blockedA!==blockedB)blockedDifferently++
  if(leadA!==leadB)leaderDifferently++
  if(Math.abs(advanceDifference)>=materialMeters-1e-6)material.push({id,advanceDifferenceMeters:advanceDifference,blockedControl:blockedA,blockedPerturbed:blockedB,leaderControl:leadA,leaderPerturbed:leadB})
  if(blockedA!==blockedB)blockEvents.push({id,advanceDifferenceMeters:advanceDifference,blockedControl:blockedA,blockedPerturbed:blockedB,leaderControl:leadA,leaderPerturbed:leadB})
  if(Math.abs(newA.meters-newB.meters)>.00001||newA.lane!==newB.lane)changeCount++
  maxAdvanceDifferenceMeters=Math.max(maxAdvanceDifferenceMeters,Math.abs(advanceDifference))
 }
 const group=arr=>{
  const sorted=[...arr].sort((x,y)=>y.meters-x.meters||x.riderId.localeCompare(y.riderId))
  let groups=sorted.length?1:0,maxAdjacentGap=0
  for(let i=1;i<sorted.length;i++){const gap=sorted[i-1].meters-sorted[i].meters;maxAdjacentGap=Math.max(maxAdjacentGap,gap);if(gap>=30-1e-6)groups++}
  return {groups,maxAdjacentGapMeters:round(maxAdjacentGap),frontBackMeters:sorted.length?round(sorted[0].meters-sorted.at(-1).meters):0}
 }
 return {riderCount:a.size,positionDifferent:changeCount,motionDifferent:movedDifferently,blockedDifferent:blockedDifferently,leaderDifferent:leaderDifferently,maxAdvanceDifferenceMeters:round(maxAdvanceDifferenceMeters),material:material.sort((x,y)=>Math.abs(y.advanceDifferenceMeters)-Math.abs(x.advanceDifferenceMeters)||x.id.localeCompare(y.id)),blockEvents:blockEvents.sort((x,y)=>x.id.localeCompare(y.id)),control:group([...ca.values()]),perturbed:group([...cb.values()])}
}
export function verifyLaneRowSwapV3(before,after){
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)throw Error('Invalid swapped grid')
 const lookup=new Map(after.map(x=>[x.riderId,x]));let changed=[]
 for(const x of before){const y=lookup.get(x.riderId);if(!y||JSON.stringify({...y,lane:x.lane})!==JSON.stringify(x))throw Error('Row swap must change only lanes');if(x.lane!==y.lane)changed.push({before:x,after:y})}
 if(changed.length!==2||changed[0].before.lane!==changed[1].after.lane||changed[1].before.lane!==changed[0].after.lane||changed[0].before.meters!==changed[1].before.meters)throw Error('Unsafe non-reciprocal lane swap')
 const key=new Set();for(const r of after){const pos=r.lane+':'+r.meters;if(key.has(pos))throw Error('Swapped grid collision');key.add(pos)}
 return {ids:changed.map(x=>x.before.riderId).sort(),meters:changed[0].before.meters}
}
