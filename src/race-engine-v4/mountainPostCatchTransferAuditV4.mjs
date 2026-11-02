/** Diagnostic-only V4 membership tracing. Returns fixed enum values; no rider identities. */
export const TRANSFER_MEMBERSHIPS=Object.freeze(['SAME','JOIN','SPLIT','REARRANGE','UNKNOWN'])
export const GAP_BANDS=Object.freeze(['EQUAL','WITHIN_FIVE_SECONDS','SIX_TO_TEN_SECONDS','SEPARATED','UNKNOWN'])
const gapBand=d=>!Number.isFinite(d)?'UNKNOWN':d<=0.000001?'EQUAL':d<=5?'WITHIN_FIVE_SECONDS':d<=10?'SIX_TO_TEN_SECONDS':'SEPARATED'
const membership=(prev,curr)=>{
 if(!prev?.length||!curr?.length)return 'UNKNOWN'
 if(prev.length===curr.length&&prev.every(x=>curr.includes(x)))return 'SAME'
 if(prev.every(x=>curr.includes(x)))return 'JOIN'
 if(curr.every(x=>prev.includes(x)))return 'SPLIT'
 return 'REARRANGE'
}
export function auditV4PostCatchWinnerTransfer(checkpoints){
 const cps=Array.isArray(checkpoints)?checkpoints:[]
 const index=cps.findIndex(x=>x.checkpointId?.includes('|replay|winner-finish'))
 if(index<1)return []
 const prev=cps[index-1],curr=cps[index]
 const byId=new Map((prev.riderStates??[]).map(x=>[x.riderId,x]))
 const output=[]
 for(const row of curr.riderStates??[]){
  const old=byId.get(row.riderId)
  if(!old?.displayCode?.startsWith('C')||!row.displayCode?.startsWith('C')||
     old.displayCode===row.displayCode)continue
  const a=prev.groups.find(g=>g.riderIds.includes(row.riderId))
  const b=curr.groups.find(g=>g.riderIds.includes(row.riderId))
  if(!a||!b)continue
  const ancestors=prev.groups.filter(g=>b.riderIds.some(id=>g.riderIds.includes(id)))
  const agaps=ancestors.map(g=>prev.gaps.find(v=>v.displayCode===g.displayCode)?.gapSeconds)
  const spread=agaps.every(Number.isFinite)?Math.max(...agaps)-Math.min(...agaps):NaN
  const oldGap=prev.gaps.find(x=>x.displayCode===a.displayCode)?.gapSeconds
  const newGap=curr.gaps.find(x=>x.displayCode===b.displayCode)?.gapSeconds
  const distance=(curr.raceProgress?.kmFromStart??NaN)-(prev.raceProgress?.kmFromStart??NaN)
  output.push({membership:membership(a.riderIds,b.riderIds),
   sourceGroupCount:ancestors.length>1?'MULTIPLE':ancestors.length===1?'ONE':'NONE',
   sourceGapSpread:gapBand(spread),
   gapMovement:gapBand(Math.abs(newGap-oldGap)),
   lastCheckpointDistance:Number.isFinite(distance)?
     distance<=0.000001?'SAME_KM':distance<0.1?'UNDER_100_METERS':
     distance<1?'UNDER_1_KM':'OVER_1_KM':'UNKNOWN'})
 }
 return output
}
