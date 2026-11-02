/**
 * V4 research-only candidate: groups which detached from the same source
 * group, at the same measured physical gap, need not be shown as artificial
 * separate one-rider chasing lineages. Never merge merely rounded times,
 * never merge distinct physical source groups or tagged physical lineages.
 */
export function coalesceV4CoincidentDetachmentGroups(sourceGroups,selectedGroups){
 if(!Array.isArray(sourceGroups)||!Array.isArray(selectedGroups))throw Error('invalid detached group research input')
 const parentById=new Map()
 for(let i=0;i<sourceGroups.length;i++)
  for(const id of sourceGroups[i].riderIds??[]){
   if(parentById.has(id))throw Error('duplicate source rider in detached group research')
   parentById.set(id,i)
  }
 const parentFor=g=>{
  const ids=g.riderIds??[]
  if(!ids.length)return null
  const parents=new Set(ids.map(id=>parentById.get(id)))
  return parents.has(undefined)||parents.size!==1?null:[...parents][0]
 }
 const result=[]
 for(const row of selectedGroups){
  const currentParent=parentFor(row)
  const candidate=row.displayCode?.startsWith('C')&&
   row.physicalPosition==='behind_peloton'&&
   Number.isFinite(row.gapSeconds)&&
   !row.physicalLineageId&&currentParent!==null
  const existingIndex=candidate?result.findIndex(prior=>
   prior.displayCode?.startsWith('C')&&
   prior.physicalPosition==='behind_peloton'&&
   !prior.physicalLineageId&&
   prior.groupCode===row.groupCode&&
   parentFor(prior)===currentParent&&
   Math.abs(prior.gapSeconds-row.gapSeconds)<=0.000001
  ):-1
  if(existingIndex<0){result.push({...row,riderIds:[...(row.riderIds??[])]});continue}
  const prior=result[existingIndex]
  // Canonical source identity is selected deterministically, without moving
  // any rider or changing measured gap/energy. Keep the first stable code.
  result[existingIndex]={...prior,riderIds:[
   ...new Set([...prior.riderIds,...row.riderIds])
  ].sort()}
 }
 return result
}
