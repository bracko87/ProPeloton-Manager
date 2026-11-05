/**
 * Read-only V4 shadow decision. Keep these outputs aggregate-only: never
 * serialize the complete engine result, replay issue strings, IDs or commands.
 * Full replay synchronization is mandatory; degraded/blocked is NOT a pilot pass.
 */
export const V4_ISOLATED_SHADOW_CONTRACT='v4_isolated_shadow_01';
const allowedPlan=new Set(['ai_prepared','neutral_all_human','unsupported_stage']);
export function classifyV4IsolatedShadow({plan,result,gate}={}){
 const base={contract:V4_ISOLATED_SHADOW_CONTRACT,
  researchOnly:true,officialWrites:0,productionEnabled:false,
  replayQuality:'unavailable',phase:'ISOLATED_EXECUTION'};
 if(!plan||!allowedPlan.has(plan.status)||
    !Number.isSafeInteger(plan.aiTeams)||plan.aiTeams<0||
    !Number.isSafeInteger(plan.humanTeams)||plan.humanTeams<0||
    !Array.isArray(plan.intents)||plan.productionWrites!==0||
    plan.calculationCount!==0)
  return {...base,status:'SHADOW_PLAN_REJECTED'};
 if(plan.status!=='ai_prepared'||plan.aiTeams===0)
  return {...base,status:'SHADOW_STAGE_NOT_ELIGIBLE'};
 const plannedAIIntents=plan.intents.length;
 const prepared={...base,plannedAIIntents,aiTeams:plan.aiTeams,
  humanTeams:plan.humanTeams};
 if(!result||result.validationPassed!==true||
    result.stageId!==plan.combinedInput?.stage?.stageId||
    result.raceId!==plan.combinedInput?.race?.raceId||
    !result.replaySynchronization||
    typeof result.replaySynchronization.synchronized!=='boolean'||
    !gate||typeof gate.publishable!=='boolean'||
    !['full','degraded','blocked'].includes(gate.replayQuality)||
    !Array.isArray(gate.blockingIssues)||
    !Array.isArray(gate.nonBlockingIssues))
  return {...prepared,status:'SHADOW_ENGINE_CONTRACT_REJECTED'};
 if(!gate.publishable||gate.blockingIssues.length>0||
    gate.replayQuality!=='full'||
    !result.replaySynchronization.synchronized)
  return {...prepared,status:'SHADOW_STRICT_REPLAY_BLOCKED',
   replayQuality:gate.replayQuality};
 return {...prepared,status:'SHADOW_STRICT_REPLAY_PASS',
  replayQuality:'full'};
}
