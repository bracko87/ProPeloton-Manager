/** Pure offline research statistics; never selects the official race engine. */
import {compareFinishOrderV3} from './finishOrderSensitivityV3.mjs'
const round6=x=>Math.round(x*1e6)/1e6
const sortedMedian=a=>{if(!a.length)throw Error('Empty median');const s=[...a].sort((x,y)=>x-y);return(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2}
export function compareGridExperimentsV3(reference,alternatives){
 if(!Array.isArray(alternatives)||alternatives.length<1)throw Error('Missing grid variants')
 const ids=reference.finish.map(x=>x.riderId),n=ids.length
 if(!n||new Set(ids).size!==n)throw Error('Invalid reference roster')
 const all=[reference,...alternatives],ranks=new Map(ids.map(id=>[id,[]])),top10=new Map(ids.map(id=>[id,0])),wins=new Map(ids.map(id=>[id,0]))
 const transitions=[]
 for(let k=0;k<all.length;k++){
  const outcome=all[k];const c=compareFinishOrderV3(reference.finish,outcome.finish)
  if(outcome.officialWrites!==0||outcome.sportingApproval!=='NOT_APPROVED')throw Error('Research approval gate changed')
  const rankSeen=new Set()
  for(const x of outcome.finish){
   if(!ranks.has(x.riderId)||rankSeen.has(x.rank)||x.rank>n)throw Error('Unmatched or duplicated grid rank')
   rankSeen.add(x.rank);ranks.get(x.riderId).push(x.rank);if(x.rank<=10)top10.set(x.riderId,top10.get(x.riderId)+1);if(x.rank===1)wins.set(x.riderId,wins.get(x.riderId)+1)
  }
  transitions.push({scenario:k,discordantPairs:c.discordantPairs,discordantShare:c.discordantShare,changedRankCount:c.changedRankCount,meanAbsoluteRankShift:c.meanAbsoluteRankShift,medianAbsoluteFinishChangeSeconds:c.medianAbsoluteFinishChangeSeconds,maxAbsoluteFinishChangeSeconds:c.maxAbsoluteFinishChangeSeconds,tailGapSeconds:outcome.finish.at(-1).gapSeconds,headTimeSeconds:outcome.finish[0].finishSeconds})
 }
 const riderVariability=[...ranks].map(([riderId,rs])=>({riderId,minRank:Math.min(...rs),maxRank:Math.max(...rs),rankRange:Math.max(...rs)-Math.min(...rs),meanRank:round6(rs.reduce((a,b)=>a+b,0)/rs.length),top10Selections:top10.get(riderId),wins:wins.get(riderId)})).sort((a,b)=>b.rankRange-a.rankRange||a.riderId.localeCompare(b.riderId))
 return {races:all.length,roster:n,winners:[...wins].filter(x=>x[1]).sort((a,b)=>b[1]-a[1]).map(([riderId,wins])=>({riderId,wins})),distinctWinners:[...wins.values()].filter(x=>x>0).length,top10AlwaysCount:riderVariability.filter(x=>x.top10Selections===all.length).length,medianRankRange:round6(sortedMedian(riderVariability.map(x=>x.rankRange))),maxRankRange:Math.max(...riderVariability.map(x=>x.rankRange)),transitions,riderVariability}
}
/** Neutral start formation must be pure and each shuffled seed must cover all riders. */
export function checkNeutralGridV3(layouts){
 if(!Array.isArray(layouts)||!layouts.length)throw Error('No initial grids')
 const reference=layouts[0],ids=new Set(reference.map(x=>x.riderId))
 if(ids.size!==reference.length)throw Error('Duplicate rider in neutral grid')
 const signature=layout=>layout.map(r=>r.riderId+':'+r.lane+':'+r.meters).sort().join('|')
 for(const grid of layouts){
  if(grid.length!==reference.length||new Set(grid.map(r=>r.riderId)).size!==ids.size||grid.some(r=>!ids.has(r.riderId)))throw Error('Grid rider set changed')
  const positions=new Set()
  for(const r of grid){if(!Number.isInteger(r.lane)||r.lane<0||r.lane>=6||!Number.isFinite(r.meters))throw Error('Invalid neutral grid geometry');const pos=r.lane+':'+r.meters;if(positions.has(pos))throw Error('Overlapping neutral grid wheels');positions.add(pos)}
 }
 return {fields:layouts.length,roster:ids.size,uniqueLayouts:new Set(layouts.map(signature)).size}
}
