/**
 * Fixed, privacy-preserving failure stages for isolated V4 research.
 *
 * This classifier intentionally NEVER inspects or serializes the caught
 * exception; its message/stack may include private input or rider details.
 * No status here implies successful simulation or live production approval.
 */
const statuses=Object.freeze({
 INPUT:'SHADOW_EXECUTION_REJECTED',
 PREPARATION:'SHADOW_AI_PREPARATION_REJECTED',
 PHYSICS:'SHADOW_PHYSICS_EXECUTION_REJECTED',
 REPLAY_GATE:'SHADOW_REPLAY_GATE_REJECTED'
})
export function classifyV4SafeExecutionFailure(phase){
 return Object.hasOwn(statuses,phase)?statuses[phase]:statuses.INPUT
}


/**
 * Diagnoses a physics rejection using ONLY fixed categorical status names.
 * Never serializes an exception message, stack trace, field value, index,
 * rider identity, input, or database row.
 */
const inputDomains=Object.freeze([
 ['engine','ENGINE'],['race','RACE'],['stagePlans','STAGE_PLANS'],
 ['stage','STAGE'],['points','POINTS'],['teams','TEAMS'],
 ['riders','RIDERS'],['preStageLeaders','LEADERS'],
 ['preStageStandings','STANDINGS'],['weather','WEATHER'],
 ['incidentModel','INCIDENT_MODEL']
])
// Exact fixed issue prefixes emitted by buildUniversalReplaySynchronizationSummary.
// These are non-sensitive source-owned constants, not private rider/checkpoint values.
const replayIssuePrefixes=Object.freeze([
 "active_commands_mismatch",
 "base_checkpoint_count_mismatch",
 "base_checkpoint_count_must_equal_five",
 "bridge_attack_invalid",
 "bridge_group_disappears_without_merge",
 "bridge_group_without_peloton",
 "bridge_merge_invalid",
 "bridge_progress_invalid",
 "chase_emergency_rail_prolonged_saturation",
 "checkpoint_commentary_missing",
 "checkpoint_index_mismatch",
 "checkpoint_progress_invalid",
 "checkpoint_rider_identity_mismatch",
 "checkpoint_rider_states_incomplete",
 "commentary_decimal_seconds",
 "commentary_exposes_internal_phase",
 "commentary_reference_invalid",
 "duplicate_checkpoint_id",
 "duplicate_commentary_id",
 "duplicate_group_display_code",
 "duplicate_group_rider_membership",
 "duplicate_physical_group_gap",
 "event_checkpoint_count_mismatch",
 "final_checkpoint_identity_mismatch",
 "final_group_membership_mismatch",
 "final_replay_timestamp_mismatch",
 "final_results_visibility_checkpoint_count_mismatch",
 "final_rider_result_mismatch",
 "final_road_groups_or_gaps_mismatch",
 "finish_commentary_winner_mismatch",
 "finish_replay_timestamp_mismatch",
 "finish_winner_mismatch",
 "front_group_transfer_without_physical_transition",
 "gap_change_not_distance_bounded",
 "group_gap_cardinality_mismatch",
 "group_gap_identity_mismatch",
 "incident_commentary_count_mismatch",
 "incident_id_set_mismatch",
 "incident_reference_invalid",
 "intermediate_results_mismatch",
 "official_result_leak",
 "opening_breakaway_formation_missing_physical_group",
 "opening_breakaway_lineage_changed",
 "opening_breakaway_lineage_changed_without_bridge_merge",
 "opening_breakaway_reappears",
 "playback_recalculates_race",
 "post_catch_breakaway_or_chase_reappears",
 "post_catch_group_transfer_without_physical_transition",
 "pre_finish_status_mismatch",
 "rider_group_gap_mismatch",
 "rider_state_missing_group",
 "same_kilometre_physical_state_mismatch",
 "successful_attack_without_physical_group",
 "team_state_count_mismatch",
 "team_states_incomplete",
 "timeline_inactive",
 "timeline_not_complete_before_playback",
 "unknown_group_rider"
])
export const V4_SAFE_REPLAY_ISSUE_STATUSES=Object.freeze(
 replayIssuePrefixes.map(x=>'SHADOW_PHYSICS_REPLAY_'+x.toUpperCase()+'_REJECTED')
)
const replayIssueCodes=new Set(replayIssuePrefixes)
export function classifyV4ReplaySynchronizationFailure(message){
 if(typeof message!=='string'||
   !message.startsWith('Universal replay synchronization failed: '))
  return 'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED'
 // Keep only the first known exact issue prefix. Never export the suffix,
 // which may contain rider IDs, checkpoint IDs or physical gap values.
 const raw=message.slice('Universal replay synchronization failed: '.length)
 for(const issue of raw.split(', ')){
  const prefix=issue.split(':',1)[0]
  if(replayIssueCodes.has(prefix))
   return 'SHADOW_PHYSICS_REPLAY_'+prefix.toUpperCase()+'_REJECTED'
 }
 return 'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED'
}

const physicsCategories=Object.freeze([
 'INPUT_ENGINE','INPUT_RACE','INPUT_STAGE_PLANS','INPUT_STAGE',
 'INPUT_POINTS','INPUT_TEAMS','INPUT_RIDERS','INPUT_LEADERS',
 'INPUT_STANDINGS','INPUT_WEATHER','INPUT_INCIDENT_MODEL',
 'INPUT_MIXED','INPUT_UNKNOWN','PHASE1','PHASE2','PHASE3',
 'PHASE4','PHASE5','PHASE6','PHASE9','PHASE10',
 'REPLAY_SYNC','POST_STAGE','OTHER'
])
export const V4_SAFE_PHYSICS_FAILURE_STATUSES=Object.freeze([
 ...physicsCategories.map(x=>'SHADOW_PHYSICS_'+x+'_REJECTED'),
 ...V4_SAFE_REPLAY_ISSUE_STATUSES
])
const recognized=new Set(V4_SAFE_PHYSICS_FAILURE_STATUSES)
const status=c=>{
 const value='SHADOW_PHYSICS_'+c+'_REJECTED'
 return recognized.has(value)?value:'SHADOW_PHYSICS_OTHER_REJECTED'
}
const domain=field=>{
 if(typeof field!=='string')return null
 for(const [prefix,label] of inputDomains)
  if(field===prefix||field.startsWith(prefix+'.')||field.startsWith(prefix+'['))
   return label
 return null
}
export function classifyV4PhysicsFailure(error){
 // Input validation error.fields often contain private array indices and IDs.
 // Only expose a whitelisted top-level domain, never the field itself.
 if(error?.name==='UniversalRaceEngineValidationError' &&
    Array.isArray(error.errors)){
  const kinds=new Set(error.errors.map(x=>domain(x?.field)).filter(Boolean))
  if(kinds.size===1)return status('INPUT_'+[...kinds][0])
  if(kinds.size>1)return status('INPUT_MIXED')
  return status('INPUT_UNKNOWN')
 }
 // These are fixed source-owned error prefixes, not arbitrary error text.
 const m=typeof error?.message==='string'?error.message:''
 if(m.startsWith('Universal replay synchronization failed:'))
  return classifyV4ReplaySynchronizationFailure(m)
 if(m.startsWith('Phase 9 acceptance audit failed:'))return status('PHASE9')
 if(m.startsWith('Phase 7 + 8 acceptance audit failed:'))
  return status('POST_STAGE')
 if(m.startsWith('Phase 5 ')||m.startsWith('Phase 5'))
  return status('PHASE5')
 if(m.startsWith('Phase 6 ')||m.startsWith('Solo finish resolution'))
  return status('PHASE6')
 if(m.startsWith('Phase 10 '))return status('PHASE10')
 // TypeError and other thrown errors may have non-static private messages.
 // Only inspect the stack for known code-owned function names; never print it.
 const stack=typeof error?.stack==='string'?error.stack:''
 const cases=[
  [/\b(?:resolveUniversalPhase10Incidents|buildUniversalPhase10)\b/,'PHASE10'],
  [/\b(?:buildUniversalPostStageUpdateSummary|buildUniversalPhase78AcceptanceReport)\b/,'POST_STAGE'],
  [/\b(?:buildUniversalReplaySynchronizationSummary|buildUniversalReplayTimeline)\b/,'REPLAY_SYNC'],
  [/\b(?:buildUniversalPhase5GroupingSummary|phase5OfficialTimesConsistent)\b/,'PHASE5'],
  [/\b(?:resolveUniversalFinishResolution|resolveUniversalRoadFinishResolution)\b/,'PHASE6'],
  [/\bresolveRoadPhase4Finish\b/,'PHASE4'],
  [/\bresolveRoadPhase3Decisive\b/,'PHASE3'],
  [/\bresolveRoadPhase2Development\b/,'PHASE2'],
  [/\bresolveRoadPhase1Opening\b/,'PHASE1'],
  [/\b(?:buildUniversalPhase9ModifierSummary|applyUniversalPhase9ModifiersToInput)\b/,'PHASE9']
 ]
 for(const [name,category] of cases)if(name.test(stack))return status(category)
 return status('OTHER')
}
