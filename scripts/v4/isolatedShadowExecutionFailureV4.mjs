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
