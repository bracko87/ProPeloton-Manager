/** Compare a private replay failure with independently sampled physical movement.
 * Returns only a classification; no identifiers or coordinates are exported.
 */
export function matchPhysicalFailureCheckpointV4({riderId,checkpointKm,previousKm,observations}){
 if(typeof riderId!=='string'||!riderId||
    !Number.isFinite(checkpointKm)||!Number.isFinite(previousKm)||
    previousKm>checkpointKm||!Array.isArray(observations))
  return 'UNMATCHABLE';
 const movement=observations.filter(o=>Array.isArray(o.riderIds)&&o.riderIds.includes(riderId)&&
   Array.isArray(o.observedBetweenKm)&&o.observedBetweenKm.length===2&&
   o.observedBetweenKm.every(Number.isFinite));
 if(!movement.length)return 'NO_RIDER_MOVEMENT';
 if(movement.some(o=>o.observedBetweenKm[0]<=checkpointKm+1e-6&&
   o.observedBetweenKm[1]>=previousKm-1e-6))
   return 'CHECKPOINT_INTERVAL_OVERLAP';
 return 'MOVEMENT_OUTSIDE_CHECKPOINT';
}
