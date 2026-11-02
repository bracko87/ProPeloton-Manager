/**
 * PRIVATE research-only chase subgroup split reconstruction.
 * Uses actual groupsAtKm snapshots and original physical gap tolerance.
 * No changes to physics, source race, validator, or production run.
 */
const changeOne=(source,from,to,label)=>{
 if(source.split(from).length!==2)throw Error('PRIVATE_CHASE_SPLIT_SOURCE_DRIFT_'+label)
 return source.replace(from,to)
}
export function patchPrivateChaseGroupSplitCandidateV4(source){
 if(typeof source!=='string')throw Error('PRIVATE_CHASE_SPLIT_SOURCE_REQUIRED')
 let result=source.replace(/\r\n?/g,'\n')
 result=changeOne(result,
  "  const physicalDropProbeKms = Array.from(new Set([\n    phase1.phaseBoundary.startKm,",
  "  const physicalDropProbeKms = Array.from(new Set([\n    phase1.phaseBoundary.startKm,\n    ...baseDefinitions.map(d=>d.kmFromStart),",
  'PHASE_BOUNDARIES')
 result=changeOne(result,
  "  const preFinishPublishedDefinition = [...baseDefinitions, ...eventDefinitions]",
  `  // PRIVATE V4 candidate: a C→C change is a physical split only if the
  // rider's new subgroup is a strict subset of the earlier chasing group,
  // with the missing riders still in another group farther than merge tolerance.
  // Pure C-number renumbering and lateral redistribution are NOT transitions.
  const alreadyPublishedChaseSplit = (members: readonly string[], km: number): boolean =>
    eventDefinitions.some(d =>
      d.checkpointIdSuffix.startsWith('physical-chase-subgroup-split-') &&
      Math.abs(d.kmFromStart-km)<=0.0001 &&
      sameStringArray([...d.riderIds].sort(),[...members].sort()))
  eligibleStarterIds.forEach(riderId=>{
    for(let i=1;i<physicalDropProbeKms.length;i++){
      const fromKm=physicalDropProbeKms[i-1]
      const toKm=physicalDropProbeKms[i]
      const from=groupsAtKm(fromKm).find(g=>g.riderIds.includes(riderId))
      const to=groupsAtKm(toKm).find(g=>g.riderIds.includes(riderId))
      if(!from?.displayCode.startsWith('C')||!to?.displayCode.startsWith('C')||
         to.riderIds.length>=from.riderIds.length||
         !to.riderIds.every(id=>from.riderIds.includes(id)))continue
      const isSubsetAt=(km: number): boolean=>{
        const current=groupsAtKm(km).find(g=>g.riderIds.includes(riderId))
        return current?.displayCode.startsWith('C')===true &&
          current.riderIds.length<from.riderIds.length &&
          current.riderIds.every(id=>from.riderIds.includes(id))
      }
      let low=fromKm,high=toKm
      for(let pass=0;pass<28;pass++){
        const middle=(low+high)/2
        if(isSubsetAt(middle))high=middle
        else low=middle
      }
      const crossing=deterministicRound(Math.min(stageDistanceKm-0.00002,high+0.00002),6)
      const newGroups=groupsAtKm(crossing)
      const after=newGroups.find(g=>g.riderIds.includes(riderId))
      if(!after?.displayCode.startsWith('C')||
        after.riderIds.length>=from.riderIds.length||
        !after.riderIds.every(id=>from.riderIds.includes(id))||
        alreadyAnnouncedAt(riderId,crossing)||
        alreadyPublishedChaseSplit(after.riderIds,crossing))continue
      const separatedRemainder=newGroups.some(g=>
        g.displayCode!==after.displayCode &&
        g.riderIds.some(id=>from.riderIds.includes(id)&&!after.riderIds.includes(id)) &&
        Number.isFinite(g.gapSeconds) && Number.isFinite(after.gapSeconds) &&
        Math.abs(g.gapSeconds-after.gapSeconds)>
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS+0.000001)
      if(!separatedRemainder)continue
      const members=[...after.riderIds].sort()
      eventDefinitions.push({
        checkpointIdSuffix: \`physical-chase-subgroup-split-\${riderId}\`,
        checkpointKind: 'event',
        phase: phaseForKm(crossing),
        kmFromStart: crossing,
        sortOrder: 676,
        groups: newGroups,
        energyByRiderId: energyAtKm(phaseForKm(crossing),crossing),
        eventType: 'group_split',
        title: 'Chasing group splits',
        description: \`\${replayRiderSubject(members)} lose contact with another chasing group.\`,
        riderIds: members,
        teamIds: Array.from(new Set(members.map(id=>riderById.get(id)?.teamId)
          .filter((id):id is string=>Boolean(id)))).sort(),
      })
      break
    }
  })

  const preFinishPublishedDefinition = [...baseDefinitions, ...eventDefinitions]`,
  'SPLIT_EVENT')
 return result
}
