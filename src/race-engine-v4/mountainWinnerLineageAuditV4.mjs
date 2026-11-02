/**
 * Read-only identity-free forensic on physical C-group gap collisions in a
 * winner-finish replay. Uses rider identities IN MEMORY to trace membership;
 * public output is from a fixed enumeration only, never rider IDs or gaps.
 */
export const COLLISION_KINDS=Object.freeze([
 'B_B','B_C','B_F','B_P','C_C','C_F','C_P','F_F','F_P','P_P','OTHER'
])
export const COLLISION_MEMBERSHIP=Object.freeze([
 'SAME_PREVIOUS_GROUP','DISTINCT_PREVIOUS_GROUPS','MIXED_PREVIOUS_GROUPS',
 'MEMBERSHIP_MISSING','NO_PREVIOUS_CHECKPOINT'
])
export const COLLISION_LINEAGES=Object.freeze([
 'SAME_TAGGED_LINEAGE','DISTINCT_TAGGED_LINEAGES','UNTAGGED_LINEAGE'
])
export const COLLISION_FINAL=Object.freeze([
 'PERSISTENT_SEPARATE_EQUAL_GAP','SEPARATE_DIFFERENT_GAPS',
 'PHYSICALLY_MERGED','FINAL_MEMBERSHIP_CHANGED','NO_FINAL_CHECKPOINT'
])
export const COLLISION_GAP_BAND=Object.freeze([
 'ZERO','POSITIVE_UNDER_ONE_SECOND','ONE_TO_TEN_SECONDS','OVER_TEN_SECONDS'
])
const kind=x=>x==='P'?'P':typeof x==='string'&&x.startsWith('B')?'B':
 typeof x==='string'&&x.startsWith('C')?'C':
 typeof x==='string'&&x.startsWith('F')?'F':'OTHER'
const pairKind=(a,b)=>{
 const k=[kind(a),kind(b)].sort().join('_')
 return COLLISION_KINDS.includes(k)?k:'OTHER'
}
const sameMembers=(a,b)=>{
 if(a.length!==b.length)return false
 const set=new Set(a)
 return b.every(id=>set.has(id))
}
const membership=(a,b,prior)=>{
 if(!prior)return 'NO_PREVIOUS_CHECKPOINT'
 const priorGroupByRider=new Map()
 for(let index=0;index<(prior.groups??[]).length;index++)
  for(const id of prior.groups[index].riderIds??[])priorGroupByRider.set(id,index)
 const ia=new Set((a.riderIds??[]).map(id=>priorGroupByRider.get(id)))
 const ib=new Set((b.riderIds??[]).map(id=>priorGroupByRider.get(id)))
 if(ia.has(undefined)||ib.has(undefined)||!ia.size||!ib.size)return 'MEMBERSHIP_MISSING'
 if(ia.size===1&&ib.size===1)return [...ia][0]===[...ib][0]?
  'SAME_PREVIOUS_GROUP':'DISTINCT_PREVIOUS_GROUPS'
 return 'MIXED_PREVIOUS_GROUPS'
}

export const COLLISION_PRIOR_GROUP_KIND=Object.freeze([
 'B','F','P','C','OTHER','MULTIPLE','NO_MATCH'
])
function priorSharedGroupKind(a,b,prior){
 if(!prior)return 'NO_MATCH'
 const all=[...(a.riderIds??[]),...(b.riderIds??[])]
 const candidates=(prior.groups??[]).filter(g=>all.every(id=>g.riderIds?.includes(id)))
 if(candidates.length===1)return kind(candidates[0].displayCode)
 return candidates.length?'MULTIPLE':'NO_MATCH'
}
const lineage=(a,b)=>a.physicalLineageId&&b.physicalLineageId?
 a.physicalLineageId===b.physicalLineageId?'SAME_TAGGED_LINEAGE':'DISTINCT_TAGGED_LINEAGES':
 'UNTAGGED_LINEAGE'
const finalStatus=(a,b,last)=>{
 if(!last)return 'NO_FINAL_CHECKPOINT'
 const groups=last.groups??[]
 const groupFor=riders=>groups.filter(g=>riders.every(id=>g.riderIds?.includes(id)))
 const [first,second]=[groupFor(a.riderIds??[]),groupFor(b.riderIds??[])]
 if(first.length!==1||second.length!==1)return 'FINAL_MEMBERSHIP_CHANGED'
 if(first[0]===second[0])return 'PHYSICALLY_MERGED'
 const gaps=last.gaps??[]
 const fa=gaps.find(g=>g.displayCode===first[0].displayCode)
 const fb=gaps.find(g=>g.displayCode===second[0].displayCode)
 if(!fa||!fb)return 'FINAL_MEMBERSHIP_CHANGED'
 return Math.round(fa.gapSeconds*1e6)===Math.round(fb.gapSeconds*1e6)?
  'PERSISTENT_SEPARATE_EQUAL_GAP':'SEPARATE_DIFFERENT_GAPS'
}
const gapBand=x=>x===0?'ZERO':x<1?'POSITIVE_UNDER_ONE_SECOND':
 x<=10?'ONE_TO_TEN_SECONDS':'OVER_TEN_SECONDS'
export function auditV4WinnerGapCollisions(checkpoints){
 const cps=Array.isArray(checkpoints)?checkpoints:[]
 const index=cps.findIndex(cp=>cp.checkpointId?.includes('|replay|winner-finish'))
 if(index<0)return []
 const current=cps[index]
 const km=current.raceProgress?.kmFromStart??0
 const prior=cps.slice(0,index).reverse().find(cp=>
  Number.isFinite(cp.raceProgress?.kmFromStart)&&
  cp.raceProgress.kmFromStart<km-0.000001)
 const last=cps.slice(index+1).find(cp=>cp.finalResultsVisible===true)??null
 const groups=current.groups??[],gaps=current.gaps??[]
 const records=[]
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
  const a=groups[i],b=groups[j]
  const ga=gaps.find(g=>g.displayCode===a.displayCode)
  const gb=gaps.find(g=>g.displayCode===b.displayCode)
  if(!Number.isFinite(ga?.gapSeconds)||!Number.isFinite(gb?.gapSeconds))continue
  if(Math.round(ga.gapSeconds*1e6)!==Math.round(gb.gapSeconds*1e6))continue
  if(sameMembers(a.riderIds??[],b.riderIds??[]))continue
  const result={
   kind:pairKind(a.displayCode,b.displayCode),
   previousMembership:membership(a,b,prior),
   previousSharedGroupKind:priorSharedGroupKind(a,b,prior),
   physicalLineage:lineage(a,b),
   finalOutcome:finalStatus(a,b,last),
   gapBand:gapBand(ga.gapSeconds)
  }
  records.push(result)
 }
 return records
}
