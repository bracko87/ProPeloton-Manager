/** PRIVATE retrospective replay-gap classification; does not modify physics. */
export const PRIVATE_HISTORICAL_CHASE_GAP_BANDS=Object.freeze(['NEAR','SEPARATED','UNKNOWN'])
/** Replay checkpoint.groups contains membership; numerical gaps live in checkpoint.gaps. */
export function classifyPrivateHistoricalPostCatchGapV4(snapshot,chaseCode,toleranceSeconds){
 if(!snapshot||!Array.isArray(snapshot.gaps)||typeof chaseCode!=='string'||
  !/^C[0-9]+$/.test(chaseCode)||!Number.isFinite(toleranceSeconds)||toleranceSeconds<0)
  return 'UNKNOWN'
 const chase=snapshot.gaps.find(g=>g?.displayCode===chaseCode)
 const peloton=snapshot.gaps.find(g=>g?.displayCode==='P')
 if(!Number.isFinite(chase?.gapSeconds)||!Number.isFinite(peloton?.gapSeconds)||
  chase.gapSeconds<0||peloton.gapSeconds<0)return 'UNKNOWN'
 return Math.abs(chase.gapSeconds-peloton.gapSeconds)<=toleranceSeconds+0.000001
  ?'NEAR':'SEPARATED'
}
