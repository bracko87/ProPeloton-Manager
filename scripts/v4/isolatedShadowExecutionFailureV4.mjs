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
const physicsCategories=Object.freeze([
 'INPUT_ENGINE','INPUT_RACE','INPUT_STAGE_PLANS','INPUT_STAGE',
 'INPUT_POINTS','INPUT_TEAMS','INPUT_RIDERS','INPUT_LEADERS',
 'INPUT_STANDINGS','INPUT_WEATHER','INPUT_INCIDENT_MODEL',
 'INPUT_MIXED','INPUT_UNKNOWN','PHASE1','PHASE2','PHASE3',
 'PHASE4','PHASE5','PHASE6','PHASE9','PHASE10',
 'REPLAY_SYNC','POST_STAGE','OTHER'
])
export const V4_SAFE_PHYSICS_FAILURE_STATUSES=Object.freeze(
 physicsCategories.map(x=>'SHADOW_PHYSICS_'+x+'_REJECTED')
)
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
  return status('REPLAY_SYNC')
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
