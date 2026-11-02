/** Isolated historical forensic: adds fixed enums to rejected replay issues only. */
const anchor="`post_catch_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}`"
const replacement="`post_catch_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}:v4_private_phase=${previousCheckpoint.phase===checkpoint.phase?'SAME_PHASE':'CROSS_PHASE'}:v4_private_gap=${classifyPrivateHistoricalPostCatchGapV4(previousDisplayCode.startsWith('C')?previousCheckpoint:checkpoint,previousDisplayCode.startsWith('C')?previousDisplayCode:currentDisplayCode,PHASE5_GROUP_MERGE_TOLERANCE_SECONDS)}`"
export function patchPrivateHistoricalPostCatchForensicsV4(source){
 if(typeof source!=='string')throw Error('PRIVATE_FORENSIC_SOURCE_REQUIRED')
 const lf=source.replace(/\r\n?/g,'\n')
 if(lf.split(anchor).length!==2)throw Error('PRIVATE_POST_CATCH_FORENSIC_SOURCE_DRIFT')
 return "import {classifyPrivateHistoricalPostCatchGapV4} from '../race-engine-v4/privateHistoricalPostCatchGapV4.mjs'\n"+lf.replace(anchor,replacement)
}
