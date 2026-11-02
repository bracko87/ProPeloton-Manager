/** Isolated historical forensic: adds fixed enums to rejected replay issues only. */
const anchor="`post_catch_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}`"
const replacement="`post_catch_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}:v4_private_phase=${previousCheckpoint.phase===checkpoint.phase?'SAME_PHASE':'CROSS_PHASE'}:v4_private_gap=${(()=>{const chase=previousDisplayCode.startsWith('C')?previousGroup:currentGroup;const snapshot=previousDisplayCode.startsWith('C')?previousCheckpoint:checkpoint;const p=snapshot.groups.find(g=>g.displayCode==='P');if(!chase||!p||!Number.isFinite(chase.gapSeconds)||!Number.isFinite(p.gapSeconds))return 'UNKNOWN';return Math.abs(chase.gapSeconds-p.gapSeconds)<=PHASE5_GROUP_MERGE_TOLERANCE_SECONDS+0.000001?'NEAR':'SEPARATED'})()}`"
export function patchPrivateHistoricalPostCatchForensicsV4(source){
 if(typeof source!=='string')throw Error('PRIVATE_FORENSIC_SOURCE_REQUIRED')
 const lf=source.replace(/\r\n?/g,'\n')
 if(lf.split(anchor).length!==2)throw Error('PRIVATE_POST_CATCH_FORENSIC_SOURCE_DRIFT')
 return lf.replace(anchor,replacement)
}
