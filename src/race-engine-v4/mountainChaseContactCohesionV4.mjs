/**
 * Isolated V4 research only. Keep a previously published physical chasing
 * group in contact at winner-finish when it has only been fragmented into
 * nearby chase labels and the authoritative finish confirms same membership.
 * Never changes finish results, V2, default V4, or strict validator rules.
 */
export function reconcileV4WinnerChaseContact(previousGroups,winnerGroups,finalGroups,toleranceSeconds){
 if(!Array.isArray(previousGroups)||!Array.isArray(winnerGroups)||
    !Array.isArray(finalGroups)||!Number.isFinite(toleranceSeconds)||
    toleranceSeconds<0)throw Error('invalid V4 contact candidate input')
 let result=winnerGroups.map(g=>({...g,riderIds:[...(g.riderIds??[])]}))
 for(const parent of previousGroups){
  const ids=[...(parent.riderIds??[])].sort()
  if(!parent.displayCode?.startsWith('C')||ids.length<2||
     parent.physicalLineageId)continue
  const parentIds=new Set(ids)
  const finalGroup=finalGroups.find(g=>g.riderIds?.includes(ids[0]))
  if(!finalGroup?.displayCode?.startsWith('C')||
     !ids.every(id=>finalGroup.riderIds.includes(id)))continue
  const parts=result.filter(g=>g.riderIds.some(id=>parentIds.has(id)))
  if(parts.length<2||parts.some(g=>
     !g.displayCode?.startsWith('C')||g.physicalLineageId||
     g.physicalPosition!==parent.physicalPosition||
     g.groupCode!==parent.groupCode||
     !Number.isFinite(g.gapSeconds)||
     g.riderIds.some(id=>!parentIds.has(id))))continue
  const union=parts.flatMap(g=>g.riderIds)
  if(union.length!==ids.length||new Set(union).size!==ids.length||
     !ids.every(id=>union.includes(id)))continue
  const gaps=parts.map(g=>g.gapSeconds)
  if(Math.max(...gaps)-Math.min(...gaps)>toleranceSeconds+0.000001||
     gaps.some(g=>Math.abs(g-parent.gapSeconds)>toleranceSeconds+0.000001))continue
  const keeper=parts.find(g=>g.displayCode===parent.displayCode) ??
    parts.slice().sort((a,b)=>a.gapSeconds-b.gapSeconds||
      a.displayCode.localeCompare(b.displayCode))[0]
  result=result.filter(g=>!parts.includes(g))
  result.push({...keeper,riderIds:ids})
 }
 return result.sort((a,b)=>a.gapSeconds-b.gapSeconds||
   a.groupOrder-b.groupOrder||a.displayCode.localeCompare(b.displayCode))
   .map((g,i)=>({...g,groupOrder:i+1}))
}
