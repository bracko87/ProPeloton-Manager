/**
 * Determine whether Phase 10's detachment from the pre-incident physical
 * group is justified by incident DNF or an autonomous chase episode.
 * Research-only: returns a fixed category and no rider identities.
 */
const groupFor=(groups,riderId)=>{
 if(!Array.isArray(groups))return null;
 const matched=groups.filter(g=>Array.isArray(g?.riderIds)&&g.riderIds.includes(riderId));
 if(matched.length!==1)return null;
 const ids=matched[0].riderIds;
 if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)return null;
 return new Set(ids);
};
export function classifyPhase10DetachmentEvidenceV4({
 riderId,physicalMembers,initialGroups,detachedGroups,
 autonomousRiderIds,dnfRiderIds
}={}){
 if(typeof riderId!=='string'||!riderId||!Array.isArray(physicalMembers)||
    !physicalMembers.includes(riderId)||new Set(physicalMembers).size!==physicalMembers.length||
    physicalMembers.some(x=>typeof x!=='string'||!x)||
    !Array.isArray(autonomousRiderIds)||!Array.isArray(dnfRiderIds)||
    [...autonomousRiderIds,...dnfRiderIds].some(x=>typeof x!=='string'||!x)||
    new Set(autonomousRiderIds).size!==autonomousRiderIds.length||
    new Set(dnfRiderIds).size!==dnfRiderIds.length)return 'UNAVAILABLE';
 const initial=groupFor(initialGroups,riderId),after=groupFor(detachedGroups,riderId);
 if(!initial||!after)return 'RIDER_GROUP_UNAVAILABLE';
 const expected=new Set(physicalMembers);
 if(initial.size!==expected.size||[...expected].some(id=>!initial.has(id)))
   return 'INITIAL_MEMBERSHIP_MISMATCH';
 const missing=[...initial].filter(id=>!after.has(id));
 const extra=[...after].filter(id=>!initial.has(id));
 if(extra.length)return 'GROUP_EXCHANGE_AFTER_DETACHMENT';
 if(missing.length===0)return 'NO_MEMBERS_REMOVED';
 const autonomous=new Set(autonomousRiderIds),dnf=new Set(dnfRiderIds);
 if(missing.some(id=>!autonomous.has(id)&&!dnf.has(id)))
   return 'UNEXPLAINED_REMOVAL';
 const hasAutonomous=missing.some(id=>autonomous.has(id));
 const hasDnf=missing.some(id=>dnf.has(id));
 if(hasAutonomous&&hasDnf)return 'MIXED_LEGITIMATE_DETACHMENT';
 if(hasAutonomous)return 'AUTONOMOUS_CHASE_DETACHMENT';
 return 'DNF_DETACHMENT';
}
