/** A52: observational-only connected-component interventions on frozen 2D cyclist proposals.
 * NEVER used to resolve live races. Unrelated riders keep their exact A44
 * accepted trajectory, not their unsafe original proposed trajectory.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {classifyContactTimeRightOfWayV3,resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
const insist=(ok,msg)=>{if(!ok)throw Error(msg)}
const r6=x=>Math.round(x*1e6)/1e6
const motion=(p,s=1)=>({riderId:p.riderId,x0:p.original.meters,y0:p.original.y,
 x1:r6(p.original.meters+p.forward*s),y1:r6(p.original.y+(p.y-p.original.y)*s)})
const differ=(a,b)=>Math.abs(a.x1-b.x1)>1e-6||Math.abs(a.y1-b.y1)>1e-6
const collision=(a,b,g)=>continuousBicycleCollisionV3(a,b,
 {longitudinal:1.8,lateral:g.lateralCollisionM})
function conflictPairs(paths,g){
 const pairs=[]
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  if(collision(paths[i],paths[j],g))pairs.push([paths[i].riderId,paths[j].riderId].sort())
 return pairs
}
function components(ids,pairs){
 const adj=new Map(ids.map(id=>[id,new Set()]))
 for(const [a,b] of pairs){
  insist(adj.has(a)&&adj.has(b),'A52 invalid contact-pair member')
  adj.get(a).add(b);adj.get(b).add(a)
 }
 const groups=[],seen=new Set()
 for(const [id,neighbors] of adj){
  if(!neighbors.size||seen.has(id))continue
  const queue=[id],group=[]
  seen.add(id)
  while(queue.length){
   const current=queue.shift();group.push(current)
   for(const next of adj.get(current))if(!seen.has(next)){
    seen.add(next);queue.push(next)
   }
  }
  groups.push(group.sort())
 }
 return groups.sort((a,b)=>a[0].localeCompare(b[0]))
}
const byId=paths=>new Map(paths.map(x=>[x.riderId,x]))
export function inspectFrozenComponentInterventionsV3(preview,g){
 insist(preview&&Array.isArray(preview.proposals)&&Array.isArray(preview.previewConflictPairs)&&
  Number.isFinite(g?.lateralCollisionM),'A52 invalid frozen observed substep')
 const raw=preview.proposals.map(p=>({riderId:p.riderId,forward:p.proposedMeters,y:p.proposedY,
  original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps}}))
 const ids=raw.map(x=>x.riderId)
 insist(ids.length>=2&&ids.length<=32&&new Set(ids).size===ids.length,'A52 roster/identity invalid')
 const original=JSON.stringify(raw)
 const full=raw.map(p=>motion(p))
 const edges=conflictPairs(full,g)
 insist(JSON.stringify(edges.map(x=>x.join('|')).sort())===
  JSON.stringify(preview.previewConflictPairs.map(x=>[...x].sort().join('|')).sort()),
  'A52 independently reconstructed source contact graph does not match trace')
 const contactGroups=components(ids,edges)
 const rear=resolveContactPriorityV3(raw,g,{policy:'rear_priority'})
 const candidate=resolveContactPriorityV3(raw,g,{policy:'contact_time_lane_occupancy',diagnostics:true})
 insist(JSON.stringify(raw)===original,'A52 mutated frozen proposals')
 insist(!conflictPairs(rear.paths,g).length&&!conflictPairs(candidate.paths,g).length,
  'A52 source solver returned unsafe physical motion')
 const baselineMap=byId(rear.paths),candidateMap=byId(candidate.paths)
 const changed=ids.filter(id=>differ(baselineMap.get(id),candidateMap.get(id))).sort()
 const selected=contactGroups.filter(group=>group.some(id=>changed.includes(id)))
 const selectedIds=[...new Set(selected.flat())].sort()
 const outsideChanged=changed.filter(id=>!selectedIds.includes(id))
 // At the initial physical substep, the first-time decision is assessed
 // separately from repeated downstream collision resolution.
 const pById=new Map(raw.map(p=>[p.riderId,p]))
 const decisions=edges.map(([a,b])=>
  classifyContactTimeRightOfWayV3(pById.get(a),pById.get(b),g))
 insist(decisions.every(x=>x&&x.firstFraction>=0&&x.firstFraction<=1),
  'A52 source contact-time decision missing/invalid')
 const earliest=decisions.length?Math.min(...decisions.map(x=>x.firstFraction)):null
 const firstTies=decisions.filter(x=>Math.abs(x.firstFraction-earliest)<=1e-7)
 const selectedRound=new Set(firstTies.flatMap(x=>x.yielding))
 const rearRound=new Set()
 for(const [idA,idB] of edges){
  const a=pById.get(idA),b=pById.get(idB)
  if(Math.abs(a.original.meters-b.original.meters)>1e-7)
   rearRound.add(a.original.meters<b.original.meters?idA:idB)
  else{rearRound.add(idA);rearRound.add(idB)}
 }
 const tieOnly=raw.map(p=>motion(p,selectedRound.has(p.riderId)?.5:1))
 const rearOnly=raw.map(p=>motion(p,rearRound.has(p.riderId)?.5:1))
 const tieRemaining=conflictPairs(tieOnly,g)
 const rearRemaining=conflictPairs(rearOnly,g)
 const sourceEdges=new Set(edges.map(e=>e.join('|')))
 const novelTie=tieRemaining.filter(x=>!sourceEdges.has(x.join('|')))
 const novelRear=rearRemaining.filter(x=>!sourceEdges.has(x.join('|')))
 function intervene(group){
  const member=new Set(group)
  const hybrid=ids.map(id=>member.has(id)?candidateMap.get(id):baselineMap.get(id))
  const overlaps=conflictPairs(hybrid,g)
  const changedInGroup=group.filter(id=>changed.includes(id))
  const mismatchFromFullCandidate=ids.filter(id=>differ(byId(hybrid).get(id),candidateMap.get(id)))
  // Only classify a hybrid as safe if *every* independent pair clears.
  // Do not extrapolate a safe one-tick hybrid into a valid 60-second race.
  return {members:[...group],changedInGroup,unrelatedFrozenExactly:ids.filter(id=>!member.has(id))
   .every(id=>JSON.stringify(byId(hybrid).get(id))===JSON.stringify(baselineMap.get(id))),
   collisionFree:overlaps.length===0,
   blockedPairs:overlaps.slice(0,14),
   blockedPairCount:overlaps.length,
   remainingDifferentFromFullCandidate:mismatchFromFullCandidate.length,
   unchangedOtherCount:ids.length-group.length,
   candidateMotionDifferencesKept:changedInGroup.length}
 }
 const individual=selected.map(intervene)
 const union=intervene(selectedIds)
 insist(individual.every(x=>x.unrelatedFrozenExactly)&&union.unrelatedFrozenExactly,
  'A52 changed unrelated accepted paths during isolation')
 return {n:raw.length,sourcePairs:edges.length,sourceGroups:contactGroups,
  affectedGroups:selected,affectedGroupCount:selected.length,
  changedByFullCounterfactual:changed,changedOutsideInitialGroups:outsideChanged,
  immediateCounterfactual:{rearFallbacks:rear.hardFallbacks,contactFallbacks:candidate.hardFallbacks,
   positionDifferenceMaxM:r6(Math.max(0,...ids.map(id=>Math.abs(
    baselineMap.get(id).x1-candidateMap.get(id).x1))))},
  firstRound:{earliestFraction:earliest===null?null:r6(earliest),tiedContactPairs:firstTies.map(x=>({
    pair:x.pair,reason:x.reason,yielding:x.yielding})),
   simultaneousTies:firstTies.length,
   initiallyConflictingPairs:edges.length,
   initialContactGroups:contactGroups.length,
   earliestYielders:[...selectedRound].sort(),allRearYielders:[...rearRound].sort(),
   unresolvedAfterFirstContactOnly:tieRemaining.length,
   unresolvedAfterFirstRearAllPairs:rearRemaining.length,
   newPairsAfterFirstContactOnly:novelTie.length,
   newPairsAfterFirstRearAllPairs:novelRear.length,
   firstContactOnlyNewPairs:novelTie.slice(0,14)},
  isolatedComponents:individual,combinedChangedComponents:union,
  interventionSafety:{
   safeIsolatedComponents:individual.filter(x=>x.collisionFree).length,
   blockedIsolatedComponents:individual.filter(x=>!x.collisionFree).length,
   combinedSafe:union.collisionFree},
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
