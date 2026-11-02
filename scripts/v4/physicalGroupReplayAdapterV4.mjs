/**
 * Research-only bridge between physical V4 group snapshots and the independent
 * replay builder. The snapshots must come from the physical groupsAtKm model,
 * never from replayTimeline or display codes. This bridge does not itself
 * establish that the underlying physical groups are correct.
 */
import {buildPhysicalReplayV4} from './physicalReplayBuilderV4.mjs';

export function buildReplayFromPhysicalGroupsV4(samples,options={}) {
  if(!Array.isArray(samples)||samples.length<2)throw Error('INVALID_PHYSICAL_SAMPLES');
  const frames=samples.map(sample=>{
    if(!sample||typeof sample.km!=='number'||!Array.isArray(sample.groups))
      throw Error('INVALID_PHYSICAL_SAMPLE');
    const riders=[];
    const seen=new Set();
    for(const group of sample.groups){
      if(!group||!Array.isArray(group.riderIds)||!group.riderIds.length||
         typeof group.gapSeconds!=='number'||!Number.isFinite(group.gapSeconds)||
         group.gapSeconds<0)throw Error('INVALID_PHYSICAL_GROUP');
      for(const id of group.riderIds){
        if(typeof id!=='string'||!id||seen.has(id))
          throw Error('DUPLICATE_OR_INVALID_PHYSICAL_RIDER');
        seen.add(id);
        riders.push({id,gapSeconds:group.gapSeconds});
      }
    }
    return {km:sample.km,riders};
  });
  return {...buildPhysicalReplayV4(frames,options),
    source:'physical_groups_at_km',sourceReplayTimeline:false,
    limitation:'Group gap is group-level, not measured per-rider position'};
}
