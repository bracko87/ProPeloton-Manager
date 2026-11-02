/**
 * V4 research-only replay reconstruction from measured rider position snapshots.
 * Does not run race physics, mutate results, or invent an exact event timestamp.
 *
 * Each input snapshot: {km, riders:[{id, gapSeconds}]}.
 * gapSeconds is an authoritative physical time gap behind the race leader,
 * NOT an inferred position based on a replay label.
 */
const finite = n => typeof n === 'number' && Number.isFinite(n);
const sortedIds = ids => [...ids].sort();
const equalIds = (a,b) => a.length===b.length && a.every((v,i)=>v===b[i]);
const sameGroup = (a,b) => equalIds(sortedIds(a),sortedIds(b));

export function buildPhysicalReplayV4(snapshots, {groupToleranceSeconds=1}={}) {
  if (!Array.isArray(snapshots) || snapshots.length<2 ||
      !finite(groupToleranceSeconds) || groupToleranceSeconds<0) {
    throw new Error('INVALID_V4_REPLAY_INPUT');
  }
  const frames=[];
  let expectedIds=null;
  for (const frame of snapshots) {
    if (!frame || !finite(frame.km) || frame.km<0 ||
        !Array.isArray(frame.riders) || frame.riders.length<2 ||
        (frames.length && frame.km<=frames[frames.length-1].km)) {
      throw new Error('INVALID_V4_REPLAY_FRAME');
    }
    const riders=frame.riders.map(r=>({id:r?.id,gapSeconds:r?.gapSeconds}));
    if (riders.some(r=>typeof r.id!=='string'||!r.id||!finite(r.gapSeconds)||r.gapSeconds<0) ||
        new Set(riders.map(r=>r.id)).size!==riders.length) {
      throw new Error('INVALID_V4_REPLAY_RIDER');
    }
    const ids=sortedIds(riders.map(r=>r.id));
    if (expectedIds && !equalIds(ids,expectedIds))
      throw new Error('V4_REPLAY_RIDER_SET_CHANGED');
    expectedIds=ids;
    riders.sort((a,b)=>a.gapSeconds-b.gapSeconds||a.id.localeCompare(b.id));
    const groups=[];
    for (const rider of riders) {
      const last=groups[groups.length-1];
      // Bound total group spread, not merely adjacent gaps (prevents chaining).
      if (!last || rider.gapSeconds-last.firstGap>groupToleranceSeconds) {
        groups.push({firstGap:rider.gapSeconds,riderIds:[rider.id]});
      } else last.riderIds.push(rider.id);
    }
    frames.push({km:frame.km,groups:groups.map(g=>({
      gapSeconds:g.firstGap,riderIds:sortedIds(g.riderIds)
    }))});
  }
  const observations=[];
  for(let i=1;i<frames.length;i++){
    const before=frames[i-1],after=frames[i];
    for(const group of after.groups) {
      const contributing=before.groups.filter(g=>g.riderIds.some(id=>group.riderIds.includes(id)));
      if(contributing.length===1 && sameGroup(contributing[0].riderIds,group.riderIds))
        continue; // Renumbering is not movement.
      const oldMembers=sortedIds(contributing.flatMap(g=>g.riderIds));
      const type=contributing.length>1 ? 'group_merge_or_exchange' :
        group.riderIds.every(id=>oldMembers.includes(id)) &&
        group.riderIds.length<oldMembers.length ? 'group_split_or_transfer' :
        'group_reorganization';
      observations.push({
        type,observedBetweenKm:[before.km,after.km],
        riderIds:group.riderIds,
        previousGroupMembers:contributing.map(g=>g.riderIds),
        gapSecondsAtObservation:group.gapSeconds,
        exactEventKmKnown:false,
      });
    }
  }
  return {researchOnly:true,physicsModified:false,exactEventTimesInferred:false,
    toleranceSeconds:groupToleranceSeconds,frames,observations};
}
