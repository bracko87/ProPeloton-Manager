/**
 * Research-only physical regrouping assessment. Uses rider positions rather
 * than a field-median proxy. Does not create groups or change any position.
 */
export interface AttackPositionV3 {readonly riderId:string;readonly meters:number}
export interface PelotonProximityV3 {
  readonly classification:'within_peloton'|'behind_peloton'|'clear_ahead'|'no_valid_peloton'
  readonly riderId:string
  readonly packSize:number
  readonly pelotonFrontMeters:number|null
  readonly pelotonRearMeters:number|null
}
const MAX_NEIGHBOUR_GAP_M=24
/** Do not claim a peloton when all riders are solitary. */
export function classifyAttackProximityV3(positions:readonly AttackPositionV3[],riderId:string):PelotonProximityV3 {
 if(!positions.length||!riderId)throw Error('Missing rider positions or identity')
 const ids=new Set<string>()
 for(const p of positions){if(!p.riderId||!Number.isFinite(p.meters)||p.meters<0||ids.has(p.riderId))throw Error('Invalid duplicated or nonphysical position');ids.add(p.riderId)}
 if(!ids.has(riderId))throw Error('Missing target rider')
 const sorted=[...positions].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 const packs:AttackPositionV3[][]=[]
 for(const p of sorted){const pack=packs.at(-1);if(!pack||pack.at(-1)!.meters-p.meters>MAX_NEIGHBOUR_GAP_M)packs.push([p]);else pack.push(p)}
 const peloton=packs.reduce((best,pack)=>pack.length>best.length?pack:best,packs[0])
 const front=peloton[0].meters,rear=peloton.at(-1)!.meters
 const rider=positions.find(p=>p.riderId===riderId)!
 const result=(classification:PelotonProximityV3['classification']):PelotonProximityV3=>({classification,riderId,packSize:peloton.length,pelotonFrontMeters:peloton.length>=3?front:null,pelotonRearMeters:peloton.length>=3?rear:null})
 if(peloton.length<3)return result('no_valid_peloton')
 if(peloton.some(p=>p.riderId===riderId))return result('within_peloton')
 if(rider.meters<rear)return result('behind_peloton')
 if(rider.meters>front)return result('clear_ahead')
 // Between front and rear would necessarily have been in the group, unless
 // the peloton is not contiguous; reject an impossible classification.
 throw Error('Non-contiguous peloton membership')
}
