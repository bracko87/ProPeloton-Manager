/**
 * Synthetic neutral rolling-grid geometry for V3 OFFLINE research only.
 * A peloton cannot physically contain 100 bicycles at the same longitudinal
 * coordinate. This module represents an explicitly hypothesized starting
 * formation; it does not set finish times, attack outcomes or racing gaps.
 */
export interface NeutralStartGridV3 {
  readonly mode: 'synthetic_neutral_rolling'
  readonly ridersAcross: number
  readonly rowSpacingMeters: number
}
export interface NeutralStartPositionV3 {
  readonly riderId: string
  /** Meters from stage's reference start line. 0 is the last grid row. */
  readonly meters: number
  readonly gridRow: number
  readonly gridLane: number
}
const hash=(input:string)=>{
  let h=2166136261
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0
}
export function planNeutralStartFormationV3(
  riderIds:readonly string[],
  seed:string,
  options:NeutralStartGridV3,
):readonly NeutralStartPositionV3[]{
  if(options.mode!=='synthetic_neutral_rolling'||
    !Number.isInteger(options.ridersAcross)||options.ridersAcross<1||options.ridersAcross>6||
    !Number.isFinite(options.rowSpacingMeters)||options.rowSpacingMeters<1.5||options.rowSpacingMeters>4)
    throw Error('Invalid research-only neutral start grid')
  if(!seed||!riderIds.length||riderIds.length>260||riderIds.some(id=>!id)||new Set(riderIds).size!==riderIds.length)
    throw Error('Invalid seed or duplicate research riders')
  // The same seed and field always produce the same neutralized formation,
  // regardless of incoming array order. Never rank riders by current skills.
  const sorted=[...riderIds].sort((a,b)=>hash(seed+'|'+a)-hash(seed+'|'+b)||a.localeCompare(b))
  const rowCount=Math.ceil(sorted.length/options.ridersAcross)
  const mapped=sorted.map((riderId,rank)=>{
    const gridRow=Math.floor(rank/options.ridersAcross)
    const gridLane=rank%options.ridersAcross
    return {riderId,meters:Math.round((rowCount-1-gridRow)*options.rowSpacingMeters*1e6)/1e6,gridRow,gridLane}
  })
  return mapped.sort((a,b)=>a.riderId.localeCompare(b.riderId))
}
