/**
 * V4 research-only check: only a bridge rider physically published in P
 * at the authoritative catch kilometre can be recorded in the catch event.
 * Low-reserve C detachments never become peloton riders by replay bookkeeping.
 */
export interface V4CatchGroup {
 readonly displayCode:string
 readonly riderIds:readonly string[]
}
export function physicallyCaughtBridgeRiderIds(
 candidateRiderIds:readonly string[], physicalGroups:readonly V4CatchGroup[]
):readonly string[] {
 const codes=new Map<string,string>()
 for(const group of physicalGroups){
  for(const rider of group.riderIds){
   if(codes.has(rider))throw Error('V4 catch cannot resolve duplicate physical group membership')
   codes.set(rider,group.displayCode)
  }
 }
 return [...new Set(candidateRiderIds)].filter(id=>codes.get(id)==='P').sort()
}
