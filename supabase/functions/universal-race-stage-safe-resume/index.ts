
/// <reference lib="deno.ns" />
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  PPM_UNIVERSAL_RACE_ENGINE_KEY,
  PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  validateRunInput,
  UniversalRaceEngineValidationError,
  buildUniversalPhase9ModifierSummary,
  applyUniversalPhase9ModifiersToInput,
  classifyStage,
  analyzeTerrain,
  calculateDifficulty,
  calculateAllRiderReadiness,
  calculateStageSkillModel,
  buildTeamTimeTrialSuitabilityRules,
  calculateRiderSuitabilityScores,
  calculateStageTeamStrength,
  buildUniversalFavouritesSummary,
  buildRoadCommandResolution,
  resolveRoadPhase1Opening,
  resolveRoadPhase2Development,
  resolveRoadPhase3Decisive,
  resolveRoadPhase4Finish,
  buildUniversalIntermediatePointPlan,
  buildUniversalIntermediatePointBattles,
  buildUniversalIntermediatePointFinalization,
  buildUniversalPhase5GroupingSummary,
  resolveUniversalFinishResolution,
  buildUniversalReplayTimeline,
  resolveUniversalPhase10Incidents,
  reconcileFinishLineIntermediatePointBattlesV1,
  reconcileReplayTimelineIntermediatePointsV1,
  buildUniversalReplaySynchronizationSummary,
  classifyUniversalReplaySynchronizationForPublication,
  buildUniversalPostStageUpdateSummary,
  buildUniversalPhase9AcceptanceReport,
  buildUniversalPhase78AcceptanceReport,
  isUniversalPhase78IssueNonBlocking,
  buildUniversalRaceCalibrationSummary,
  type UniversalRaceEngineResult,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/38fec7814395d77331ae255d1b9203edba0142c7/src/universal-race-engine/runRaceEngine.ts";
import { buildProductionUniversalRaceEngineInput as buildBaseInput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/38fec7814395d77331ae255d1b9203edba0142c7/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/38fec7814395d77331ae255d1b9203edba0142c7/src/universal-race-engine/buildProductionRaceOutput.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type JsonObject = Record<string, unknown>;
const CONTRACT = "universal_race_checkpointed_safe_mode_v2";
const SOURCE_COMMIT = "38fec7814395d77331ae255d1b9203edba0142c7";

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true","t","1","yes","y"].includes(value.trim().toLowerCase());
  return false;
}
function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function errorPayload(error: unknown): JsonObject {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : { name: "UnknownError", message: String(error) };
}
async function rpc<T>(supabase: SupabaseClient, name: string, args: JsonObject = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}
async function authorized(supabase: SupabaseClient, request: Request): Promise<boolean> {
  const supplied = request.headers.get("x-universal-race-worker-secret")?.trim() ?? "";
  if (!supplied) return false;
  const { data, error } = await supabase.rpc("verify_universal_race_worker_secret_v1", { p_secret: supplied });
  return !error && data === true;
}
async function heartbeat(
  supabase: SupabaseClient,
  stageId: string,
  runId: string,
  phase: string,
  details: JsonObject = {},
): Promise<void> {
  try {
    await rpc(supabase, "universal_race_stage_survival_heartbeat_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: runId,
      p_phase: phase,
      p_details: { ...details, safe_mode: true, contract: CONTRACT, source_commit: SOURCE_COMMIT },
    });
  } catch {}
}
function participantTeamId(row: JsonObject): string {
  return text(row.participating_club_id ?? row.club_id ?? row.team_id);
}
function withScenarioAiMetadata(input: any, participantTeams: JsonObject[]): any {
  const aiIds = new Set<string>();
  participantTeams.forEach((row) => {
    const teamId = participantTeamId(row);
    const source = text(row.entry_source).toLowerCase();
    if (teamId && (booleanValue(row.scenario_ai_controlled) || booleanValue(row.is_ai_filler) || source === "ai_fill")) {
      aiIds.add(teamId);
    }
  });
  return {
    ...input,
    teams: Array.isArray(input.teams) ? input.teams.map((team: any) => ({
      ...team,
      snapshot: {
        ...team.snapshot,
        metadata: {
          ...team.snapshot?.metadata,
          scenarioAiControlled: aiIds.has(String(team.teamId ?? "")),
        },
      },
    })) : input.teams,
  };
}
function buildSources(payloadValue: unknown, runId: string, preStageStandings: unknown): any {
  const payload = object(payloadValue);
  const race = object(payload.race);
  const stage = object(payload.stage);
  const stageId = text(stage.id);
  const raceId = text(race.id);
  if (!stageId || !raceId) throw new Error("Payload is missing race/stage identity.");
  return {
    race,
    stage,
    profile: object(payload.profile),
    stagePoints: rows(payload.stage_points),
    participantTeams: rows(payload.participant_teams),
    participantRiders: rows(payload.participant_riders),
    riderInputRows: rows(payload.rider_inputs),
    phaseCommandRows: rows(payload.phase_commands),
    lockedPlanRows: rows(payload.locked_plans ?? payload.stage_plans),
    preStageLeaders: payload.pre_stage_leaders,
    preStageStandings,
    phase9Payload: rows(payload.phase9_inputs)[0] ?? object(payload.phase9_inputs),
    deterministicSeed: `universal-production:${raceId}:${stageId}:${runId}`,
  };
}
function metadataKey(terrain: string): string {
  if (terrain === "flat") return "flatScenarioV1";
  if (terrain === "hilly") return "hillyScenarioV1";
  if (terrain === "mountain") return "mountainScenarioV1";
  if (terrain === "cobbled") return "cobbledScenarioV1";
  throw new Error(`Unsupported scenario terrain ${terrain}.`);
}
function attachStoredScenario(input: any, scenario: JsonObject): any {
  const scenarioType = text(scenario.scenario_type);
  const audit: JsonObject = {
    contract: "road_scenario_template_match_v2",
    directorVersion: "road_race_director_v2",
    scenarioType,
    catalogVersion: scenario.catalog_version ?? null,
    templateId: scenario.template_id,
    templateVersion: scenario.template_version,
    templateFamily: scenario.template_family,
    similarityGroup: scenario.similarity_group,
    selectionSeed: scenario.selection_seed,
    compatibilityScore: finite(scenario.compatibility_score),
    gameDate: scenario.game_date,
    selectionModel: "road_race_director_v2",
    preCalculationSummary: object(scenario.context_snapshot_json).preCalculationSummary ?? null,
    contextSnapshot: object(scenario.context_snapshot_json),
    candidateScores: Array.isArray(scenario.candidate_scores_json) ? scenario.candidate_scores_json : [],
    generatedParameters: object(scenario.generated_parameters_json),
    appliedDirectives: object(scenario.applied_directives_json),
    runtimeApplicationProof: {
      contract: "road_race_director_v2_1_runtime",
      selectedFromPrecalculation: true,
      commandsPreserved: true,
      finalEngineSawTemplate: false,
      gapGuidanceCalls: 0,
      gapAdjustments: 0,
      fragmentationCalls: 0,
      fragmentationAdjustments: 0,
      lastGuidedKm: null,
    },
  };
  const key = metadataKey(scenarioType);
  return {
    ...input,
    stagePlans: input.stagePlans.map((plan: any, index: number) => index === 0 ? {
      ...plan,
      metadata: { ...plan.metadata, [key]: audit },
    } : plan),
  };
}
async function loadTimeTrialRules(supabase: SupabaseClient, stageId: string): Promise<JsonObject | null> {
  const { data, error } = await supabase
    .from("race_stage_time_trial_rules")
    .select("start_order_mode,start_interval_seconds,counting_rider_number,equipment_required,replay_duration_seconds,dropped_rider_time_mode,rules_json")
    .eq("stage_id", stageId)
    .maybeSingle();
  if (error) throw new Error(`race_stage_time_trial_rules: ${error.message}`);
  return data ? object(data) : null;
}
function buildInputWithTimeTrialRules(baseInput: any, rule: JsonObject | null): any {
  const stageFormat = baseInput.stage.stageFormat;
  const requiresRules = ["individual_time_trial","team_time_trial","pair_time_trial","prologue"].includes(stageFormat);
  if (!requiresRules) return baseInput;
  if (!rule) throw new Error(`Stage ${baseInput.stage.stageId} (${stageFormat}) is missing race_stage_time_trial_rules.`);
  const countingRaw = rule.counting_rider_number;
  const countingRiderNumber = countingRaw === null || countingRaw === undefined || countingRaw === ""
    ? null : Math.trunc(Number(countingRaw));
  return {
    ...baseInput,
    stage: {
      ...baseInput.stage,
      timeTrialRules: {
        startOrderMode: String(rule.start_order_mode ?? "automatic"),
        startIntervalSeconds: Math.max(1, Math.trunc(Number(rule.start_interval_seconds ?? 60))),
        countingRiderNumber: Number.isFinite(countingRiderNumber as number) ? countingRiderNumber : null,
        equipmentRequired: rule.equipment_required === true,
        replayDurationSeconds: Math.max(1, Math.trunc(Number(rule.replay_duration_seconds ?? 900))),
        droppedRiderTimeMode: String(rule.dropped_rider_time_mode ?? "personal_time"),
        metadata: object(rule.rules_json),
      },
    },
  };
}
async function buildInput(supabase: SupabaseClient, stageId: string, runId: string): Promise<{input:any, scenario:JsonObject|null}> {
  const payload = object(await rpc(supabase, "universal_race_stage_get_calculation_payload_v1", { p_stage_id: stageId }));
  const stageNumber = Math.max(1, Math.trunc(finite(object(payload.stage).stage_number, 1)));
  let standings: unknown = [];
  try {
    standings = await rpc(supabase, "get_race_stage_pre_stage_standings_v1", { p_stage_id: stageId });
  } catch (error) {
    if (stageNumber > 1) throw error;
  }
  const { data: scenarioData, error: scenarioError } = await supabase
    .from("race_engine_scenario_runs")
    .select("*")
    .eq("simulation_run_id", runId)
    .eq("selection_status", "reserved")
    .maybeSingle();
  if (scenarioError) throw new Error(`scenario lookup: ${scenarioError.message}`);
  const sources = buildSources(payload, runId, standings);
  const timeTrialRules = await loadTimeTrialRules(supabase, stageId);
  let input = buildBaseInput(sources as any) as any;
  input = withScenarioAiMetadata(input, sources.participantTeams);
  if (scenarioData) input = attachStoredScenario(input, object(scenarioData));
  input = buildInputWithTimeTrialRules(input, timeTrialRules);
  return { input, scenario: scenarioData ? object(scenarioData) : null };
}
function applyAtomicIntermediatePointReplayPublication(input: any, result: UniversalRaceEngineResult): UniversalRaceEngineResult {
  const checkpoints = result.replayTimeline?.checkpoints ?? [];
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) return result;
  const distanceKm = Math.max(0, finite(input.stage.distanceKm));
  const winnerTimeSeconds = finite(result.finishResolution?.classification?.[0]?.officialTimeSeconds);
  if (!(distanceKm > 0) || !(winnerTimeSeconds > 0)) return result;
  const averageWinnerSpeedKmPerSecond = distanceKm / winnerTimeSeconds;
  const guardedCheckpoints = checkpoints.map((checkpoint: any) => {
    const checkpointRecord = object(checkpoint);
    const progress = object(checkpointRecord.raceProgress);
    const leaderKm = finite(progress.kmFromStart, -1);
    const riderStates = rows(checkpointRecord.riderStates);
    const intermediateResults = rows(checkpointRecord.intermediateResults);
    if (leaderKm < 0 || intermediateResults.length === 0) return checkpoint;
    const riderGapSeconds = new Map<string, number>();
    riderStates.forEach((state) => {
      const riderId = text(state.riderId);
      if (riderId) riderGapSeconds.set(riderId, Math.max(0, finite(state.gapSeconds)));
    });
    const visible = intermediateResults.filter((event) => {
      const pointKm = finite(event.kmFromStart, -1);
      if (pointKm < 0) return true;
      const scorers = rows(event.rankings).filter((ranking) => finite(ranking.pointsAwarded) > 0 || finite(ranking.bonusSecondsAwarded) > 0);
      if (!scorers.length) return true;
      return scorers.every((ranking) => {
        const riderId = text(ranking.riderId);
        const gapSeconds = riderGapSeconds.get(riderId);
        if (!riderId || gapSeconds === undefined) return false;
        const estimatedRiderKm = leaderKm - gapSeconds * averageWinnerSpeedKmPerSecond;
        return estimatedRiderKm + 0.000001 >= pointKm;
      });
    });
    return visible.length === intermediateResults.length ? checkpoint : { ...checkpoint, intermediateResults: visible };
  });
  return { ...result, replayTimeline: { ...result.replayTimeline, checkpoints: guardedCheckpoints } };
}
function buildOutputWithReplayProgressGuarantee(input: any, result: UniversalRaceEngineResult): any {
  const replayPolicy = classifyUniversalReplaySynchronizationForPublication(result.replaySynchronization);
  if (replayPolicy.blockingIssues.length > 0) {
    throw new Error(`Blocking replay synchronization issues: ${replayPolicy.blockingIssues.slice(0, 12).join(" | ")}`);
  }
  if (result.replaySynchronization.synchronized && !replayPolicy.nonBlockingIssues.length) {
    return buildProductionUniversalRaceOutput(input, result);
  }
  const builderResult: UniversalRaceEngineResult = {
    ...result,
    replaySynchronization: { ...result.replaySynchronization, synchronized: true },
    postStageUpdate: {
      ...result.postStageUpdate,
      persistenceContract: { ...result.postStageUpdate.persistenceContract, sourceReplaySynchronized: true },
    },
    phase78Acceptance: {
      ...result.phase78Acceptance,
      passed: true,
      issues: result.phase78Acceptance.issues.filter((issue) => !isUniversalPhase78IssueNonBlocking(issue)),
      invariants: result.phase78Acceptance.invariants.map((invariant) =>
        isUniversalPhase78IssueNonBlocking(invariant.key) ? { ...invariant, passed: true } : invariant
      ),
      phase7: { ...result.phase78Acceptance.phase7, replaySynchronized: true },
    },
  };
  const built = buildProductionUniversalRaceOutput(input, builderResult);
  return {
    ...built,
    universalResult: result,
    applicationManifest: {
      ...built.applicationManifest,
      validation: { ...built.applicationManifest.validation, replaySynchronized: false },
    },
    verification: {
      ...built.verification,
      replayQuality: "degraded",
      degradedReplayIssues: [...replayPolicy.blockingIssues, ...replayPolicy.nonBlockingIssues],
      officialResultsUnchanged: true,
      rawReplaySynchronized: false,
    },
  };
}
function addFinishRankAlias(output: any): any {
  const universalResult = object(output?.universalResult);
  const finishResolution = object(universalResult.finishResolution);
  const classification = rows(finishResolution.classification);
  if (!classification.length) return output;
  return {
    ...output,
    universalResult: {
      ...universalResult,
      finishResolution: {
        ...finishResolution,
        classification: classification.map((row) => row.finishRank !== undefined ? row : ({ ...row, finishRank: finite(row.rank) })),
      },
    },
  };
}
function outcomeSummary(result: any): JsonObject {
  const classification = rows(result?.finishResolution?.classification);
  const gaps = classification.map((row) => Math.max(0, finite(row.gapSeconds ?? row.officialGapSeconds, 0)));
  return {
    winner_rider_id: classification[0]?.riderId ?? null,
    classification_rider_count: classification.length,
    same_time_rider_count: gaps.filter((gap) => gap <= 0.5).length,
    max_gap_seconds: gaps.length ? Math.max(...gaps) : 0,
    replay_checkpoint_count: Array.isArray(result?.replayTimeline?.checkpoints) ? result.replayTimeline.checkpoints.length : 0,
  };
}
function isTransientSubmitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(500|502|503|504|520|522|524)\b|failed to fetch|connection|timeout|temporar/i.test(message);
}
async function submitWithRetry<T>(supabase: SupabaseClient, args: JsonObject): Promise<T> {
  let lastError: unknown = null;
  for (let attempt=1; attempt<=3; attempt+=1) {
    try { return await rpc<T>(supabase, "universal_race_stage_submit_calculation_v1", args); }
    catch (error) {
      lastError = error;
      if (!isTransientSubmitError(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function triggerNext(request: Request): Promise<void> {
  const secret = request.headers.get("x-universal-race-worker-secret")?.trim() ?? "";
  if (!secret) return;
  try {
    await fetch(new URL(request.url).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-universal-race-worker-secret": secret,
      },
      body: JSON.stringify({ action: "tick", chained: true }),
    });
  } catch {}
}

async function executeStep(supabase: SupabaseClient, claim: JsonObject): Promise<JsonObject> {
  const stageId=text(claim.stage_id);
  const runId=text(claim.simulation_run_id);
  const leaseToken=text(claim.lease_token);
  const step=Math.max(0,Math.trunc(finite(claim.step,0)));
  const checkpointText=text(claim.checkpoint_text) || "{}";
  let checkpoint: JsonObject;
  try { checkpoint=object(JSON.parse(checkpointText)); }
  catch { throw new Error("Safe-mode checkpoint text is invalid JSON."); }
  if(!stageId || !runId || !leaseToken) throw new Error("Safe-mode claim missing identity or lease.");

  const started=performance.now();
  await heartbeat(supabase,stageId,runId,`safe_step_${step}_started`,{step});

  let input: any;
  let phase9Modifiers: any;
  let calculationInput: any;
  let scenarioPreserved = false;

  if(step===0){
    const built=await buildInput(supabase,stageId,runId);
    input=built.input;
    scenarioPreserved=scenarioPreserved;
    phase9Modifiers=buildUniversalPhase9ModifierSummary(input);
    calculationInput=applyUniversalPhase9ModifiersToInput(input,phase9Modifiers);
  } else {
    input=checkpoint.sourceInput as any;
    phase9Modifiers=checkpoint.phase9Modifiers as any;
    calculationInput=checkpoint.calculationInput as any;
    scenarioPreserved=Boolean(checkpoint.scenarioPreserved);
    if(!input || !calculationInput || !phase9Modifiers){
      throw new Error("Checkpoint is missing the preserved engine input.");
    }
  }

  let next: JsonObject={...checkpoint};

  if(step===0){
    const errors=validateRunInput(input);
    if(errors.length>0) throw new UniversalRaceEngineValidationError(errors);
    const stageClassification=classifyStage(calculationInput.stage);
    const terrain=analyzeTerrain(calculationInput.stage);
    const difficulty=calculateDifficulty(calculationInput,terrain);
    const riderReadiness=calculateAllRiderReadiness(calculationInput.riders);
    const stageSkillModel=calculateStageSkillModel(calculationInput.stage);
    const teamTimeTrialSuitabilityRules=buildTeamTimeTrialSuitabilityRules(calculationInput.stage);
    const riderSuitability=calculateRiderSuitabilityScores(calculationInput,riderReadiness,stageSkillModel);
    const teamStrength=calculateStageTeamStrength(calculationInput,riderSuitability,teamTimeTrialSuitabilityRules);
    const favourites=buildUniversalFavouritesSummary(calculationInput,riderSuitability,stageSkillModel);
    const roadCommandResolution=buildRoadCommandResolution(calculationInput,riderReadiness);
    next={
      sourceInput:input,
      calculationInput,
      phase9Modifiers,
      scenarioPreserved,
      stageClassification,
      terrain,
      difficulty,
      riderReadiness,
      stageSkillModel,
      teamTimeTrialSuitabilityRules,
      riderSuitability,
      teamStrength,
      favourites,
      roadCommandResolution,
    };
  } else if(step===1){
    next={...checkpoint,phase1RoadRaceResolution:resolveRoadPhase1Opening(calculationInput,checkpoint.riderReadiness as any,checkpoint.roadCommandResolution as any)};
  } else if(step===2){
    next={...checkpoint,phase2RoadRaceResolution:resolveRoadPhase2Development(calculationInput,checkpoint.riderReadiness as any,checkpoint.riderSuitability as any,checkpoint.roadCommandResolution as any,checkpoint.phase1RoadRaceResolution as any)};
  } else if(step===3){
    next={...checkpoint,phase3RoadRaceResolution:resolveRoadPhase3Decisive(calculationInput,checkpoint.riderReadiness as any,checkpoint.riderSuitability as any,checkpoint.roadCommandResolution as any,checkpoint.phase2RoadRaceResolution as any)};
  } else if(step===4){
    next={...checkpoint,roadRaceResolution:resolveRoadPhase4Finish(calculationInput,checkpoint.riderReadiness as any,checkpoint.riderSuitability as any,checkpoint.roadCommandResolution as any,checkpoint.phase3RoadRaceResolution as any)};
  } else if(step===5){
    const intermediatePointPlan=buildUniversalIntermediatePointPlan(calculationInput,checkpoint.roadCommandResolution as any,checkpoint.roadRaceResolution as any);
    const provisionalIntermediatePointBattles=buildUniversalIntermediatePointBattles(calculationInput,checkpoint.riderReadiness as any,checkpoint.roadRaceResolution as any,intermediatePointPlan);
    const provisionalIntermediatePointFinalization=buildUniversalIntermediatePointFinalization(calculationInput,checkpoint.riderReadiness as any,checkpoint.roadCommandResolution as any,intermediatePointPlan,provisionalIntermediatePointBattles);
    next={...checkpoint,intermediatePointPlan,provisionalIntermediatePointBattles,provisionalIntermediatePointFinalization};
  } else if(step===6){
    const groupAndTimeResolution=buildUniversalPhase5GroupingSummary(calculationInput,checkpoint.difficulty as any,checkpoint.riderReadiness as any,checkpoint.riderSuitability as any,checkpoint.roadRaceResolution as any);
    const baseFinishResolution=resolveUniversalFinishResolution({
      input:calculationInput,
      stageClassification:checkpoint.stageClassification as any,
      riderReadiness:checkpoint.riderReadiness as any,
      riderSuitability:checkpoint.riderSuitability as any,
      roadCommandResolution:checkpoint.roadCommandResolution as any,
      roadRaceResolution:checkpoint.roadRaceResolution as any,
      groupAndTimeResolution,
    });
    next={...checkpoint,groupAndTimeResolution,baseFinishResolution};
  } else if(step===7){
    const baseReplayTimeline=buildUniversalReplayTimeline(
      calculationInput,
      checkpoint.riderReadiness as any,
      checkpoint.roadCommandResolution as any,
      checkpoint.roadRaceResolution as any,
      checkpoint.provisionalIntermediatePointBattles as any,
      checkpoint.provisionalIntermediatePointFinalization as any,
      checkpoint.groupAndTimeResolution as any,
      checkpoint.baseFinishResolution as any,
    );
    next={...checkpoint,baseReplayTimeline};
  } else if(step===8){
    const phase10Resolution=resolveUniversalPhase10Incidents({
      input:calculationInput,
      sourceInput:input,
      phase9:phase9Modifiers,
      riderReadiness:checkpoint.riderReadiness as any,
      roadCommandResolution:checkpoint.roadCommandResolution as any,
      baseFinishResolution:checkpoint.baseFinishResolution as any,
      baseReplayTimeline:checkpoint.baseReplayTimeline as any,
    });
    const phase10Incidents=phase10Resolution.summary;
    const finishResolution=phase10Resolution.finishResolution;
    const intermediatePointBattles=reconcileFinishLineIntermediatePointBattlesV1(
      calculationInput,
      checkpoint.provisionalIntermediatePointBattles as any,
      finishResolution,
    );
    const intermediatePointFinalization=buildUniversalIntermediatePointFinalization(
      calculationInput,
      checkpoint.riderReadiness as any,
      checkpoint.roadCommandResolution as any,
      checkpoint.intermediatePointPlan as any,
      intermediatePointBattles,
    );
    const replayTimeline=reconcileReplayTimelineIntermediatePointsV1(
      phase10Resolution.replayTimeline,
      intermediatePointFinalization,
    );
    next={...checkpoint,phase10Incidents,finishResolution,intermediatePointBattles,intermediatePointFinalization,replayTimeline};
  } else if(step===9){
    const replaySynchronization=buildUniversalReplaySynchronizationSummary(
      calculationInput,
      checkpoint.riderReadiness as any,
      checkpoint.roadCommandResolution as any,
      checkpoint.intermediatePointFinalization as any,
      checkpoint.groupAndTimeResolution as any,
      checkpoint.finishResolution as any,
      checkpoint.phase10Incidents as any,
      checkpoint.replayTimeline as any,
      checkpoint.roadRaceResolution as any,
    );
    const replayPublicationPolicy=classifyUniversalReplaySynchronizationForPublication(replaySynchronization);
    if(!replayPublicationPolicy.publishable){
      throw new Error(`Universal replay synchronization failed: ${replayPublicationPolicy.blockingIssues.join(", ")}`);
    }
    const postStageUpdate=buildUniversalPostStageUpdateSummary(
      calculationInput,
      checkpoint.difficulty as any,
      checkpoint.riderReadiness as any,
      checkpoint.roadCommandResolution as any,
      checkpoint.roadRaceResolution as any,
      checkpoint.intermediatePointFinalization as any,
      checkpoint.finishResolution as any,
      checkpoint.phase10Incidents as any,
      checkpoint.replayTimeline as any,
      replaySynchronization,
    );
    const phase9Acceptance=buildUniversalPhase9AcceptanceReport(input,calculationInput,phase9Modifiers,postStageUpdate);
    if(!phase9Acceptance.passed) throw new Error(`Phase 9 acceptance audit failed: ${phase9Acceptance.warnings.join(", ")}`);
    const phase78Acceptance=buildUniversalPhase78AcceptanceReport(
      calculationInput,
      checkpoint.finishResolution as any,
      checkpoint.replayTimeline as any,
      replaySynchronization,
      postStageUpdate,
    );
    const blockingPhase78Issues=phase78Acceptance.issues.filter((issue)=>!isUniversalPhase78IssueNonBlocking(issue));
    if(blockingPhase78Issues.length>0) throw new Error(`Phase 7 + 8 acceptance audit failed: ${blockingPhase78Issues.join(", ")}`);
    const calibrationSummary=buildUniversalRaceCalibrationSummary(
      calculationInput,
      checkpoint.stageClassification as any,
      checkpoint.roadRaceResolution as any,
      checkpoint.groupAndTimeResolution as any,
      checkpoint.finishResolution as any,
    );
    let result: UniversalRaceEngineResult={
      engineKey:PPM_UNIVERSAL_RACE_ENGINE_KEY,
      engineVersion:PPM_UNIVERSAL_RACE_ENGINE_VERSION,
      raceId:input.race.raceId,
      stageId:input.stage.stageId,
      validationPassed:true,
      stageClassification:checkpoint.stageClassification as any,
      terrain:checkpoint.terrain as any,
      difficulty:checkpoint.difficulty as any,
      riderReadiness:checkpoint.riderReadiness as any,
      stageSkillModel:checkpoint.stageSkillModel as any,
      teamTimeTrialSuitabilityRules:checkpoint.teamTimeTrialSuitabilityRules as any,
      riderSuitability:checkpoint.riderSuitability as any,
      teamStrength:checkpoint.teamStrength as any,
      favourites:checkpoint.favourites as any,
      roadCommandResolution:checkpoint.roadCommandResolution as any,
      roadRaceResolution:checkpoint.roadRaceResolution as any,
      intermediatePointPlan:checkpoint.intermediatePointPlan as any,
      intermediatePointBattles:checkpoint.intermediatePointBattles as any,
      intermediatePointFinalization:checkpoint.intermediatePointFinalization as any,
      groupAndTimeResolution:checkpoint.groupAndTimeResolution as any,
      finishResolution:checkpoint.finishResolution as any,
      replayTimeline:checkpoint.replayTimeline as any,
      replaySynchronization,
      phase9Modifiers,
      phase9Acceptance,
      phase10Incidents:checkpoint.phase10Incidents as any,
      postStageUpdate,
      phase78Acceptance,
      calibrationSummary,
    };
    try { result=applyAtomicIntermediatePointReplayPublication(input,result); } catch {}
    let output=buildOutputWithReplayProgressGuarantee(input,result);
    output=addFinishRankAlias(output);
    output={
      ...output,
      verification:{
        ...object(output.verification),
        safeMode:true,
        safeModeContract:CONTRACT,
        primarySourceCommit:SOURCE_COMMIT,
        recoveryPolicy:"checkpointed_safe_mode_v2",
        scenarioPreserved:scenarioPreserved,
      },
      calculationSurvival:{
        modelVersion:"checkpointed_safe_mode_v2",
        checkpointed:true,
        sourceCommit:SOURCE_COMMIT,
        totalSteps:10,
      },
    };
    await heartbeat(supabase,stageId,runId,"safe_mode_submitting",{step,elapsed_ms:performance.now()-started});
    const submit=await submitWithRetry(supabase,{
      p_stage_id:stageId,
      p_simulation_run_id:runId,
      p_input_snapshot:input,
      p_universal_result:output,
    });
    if(scenarioPreserved){
      try{
        await rpc(supabase,"universal_race_stage_finalize_scenario_v1",{
          p_stage_id:stageId,
          p_simulation_run_id:runId,
          p_actual_outcome:outcomeSummary(result),
          p_deviations:[],
        });
      }catch{}
    }
    await rpc(supabase,"universal_race_stage_complete_safe_mode_v2",{
      p_stage_id:stageId,p_simulation_run_id:runId,p_lease_token:leaseToken,
    });
    await heartbeat(supabase,stageId,runId,"calculated_hidden",{
      safe_mode:true,checkpointed:true,total_steps:10,elapsed_ms:performance.now()-started,
    });
    return {status:"completed",stage_id:stageId,simulation_run_id:runId,step,submit,elapsed_ms:performance.now()-started};
  } else {
    throw new Error(`Unsupported safe-mode step ${step}`);
  }

  const save=await rpc<JsonObject>(supabase,"universal_race_stage_save_safe_step_v2",{
    p_stage_id:stageId,
    p_simulation_run_id:runId,
    p_lease_token:leaseToken,
    p_next_step:step+1,
    p_checkpoint_text:JSON.stringify(next),
    p_phase:`safe_mode_step_${step}_complete`,
  });
  if(save.status!=="saved") throw new Error(`Safe-mode checkpoint save failed: ${JSON.stringify(save)}`);
  return {status:"step_completed",stage_id:stageId,simulation_run_id:runId,step,next_step:step+1,elapsed_ms:performance.now()-started};
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  const supabase=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
    auth:{autoRefreshToken:false,persistSession:false},
  });
  if(!(await authorized(supabase,request))) return jsonResponse({status:"forbidden",contract:CONTRACT},403);

  const task=(async()=>{
    const claim=object(await rpc(supabase,"universal_race_stage_claim_safe_step_v2",{p_worker_id:"supabase_edge_safe_mode_v1"}));
    if(claim.status!=="claimed"){
      console.log(JSON.stringify({status:"idle",contract:CONTRACT}));
      return;
    }
    try{
      const result=await executeStep(supabase,claim);
      console.log(JSON.stringify({...result,contract:CONTRACT}));
      if(result.status==="step_completed") await triggerNext(request);
    }catch(error){
      const serialized=errorPayload(error);
      console.error(JSON.stringify({status:"safe_step_failed",contract:CONTRACT,error:serialized,claim}));
      try{
        await rpc(supabase,"universal_race_stage_fail_safe_step_v1",{
          p_stage_id:text(claim.stage_id),
          p_simulation_run_id:text(claim.simulation_run_id),
          p_lease_token:text(claim.lease_token),
          p_error:text(serialized.message)||"Safe-mode step failed",
        });
      }catch{}
    }
  })();
  EdgeRuntime.waitUntil(task);
  return jsonResponse({status:"accepted",contract:CONTRACT,background_execution:true},202);
});
