/// <reference lib="deno.ns" />
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  classifyUniversalReplaySynchronizationForPublication,
  isUniversalPhase78IssueNonBlocking,
  runRaceEngine,
  type UniversalRaceEngineResult,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/runRaceEngine.ts";
import { buildProductionUniversalRaceEngineInput as buildBaseInput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/buildProductionRaceOutput.ts";
import { runRaceEngine as runFallbackRaceEngine } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/runRaceEngine.ts";
import { buildProductionUniversalRaceEngineInput as buildFallbackInput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput as buildFallbackOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/4cc8e5c90fa93c3165e80fad5e3f45eaed882037/src/universal-race-engine/buildProductionRaceOutput.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type JsonObject = Record<string, unknown>;
const SOURCE_COMMIT = "4cc8e5c90fa93c3165e80fad5e3f45eaed882037";
const FALLBACK_SOURCE_COMMIT = SOURCE_COMMIT;
const CONTRACT = "universal_race_pass2_resume_v15";

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
function isTransientSubmitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(500|502|503|504|520|522|524)\b|failed to fetch|connection|timeout|temporar/i.test(message);
}
async function submitWithRetry<T>(
  supabase: SupabaseClient,
  args: JsonObject,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await rpc<T>(supabase, "universal_race_stage_submit_calculation_v1", args);
    } catch (error) {
      lastError = error;
      if (!isTransientSubmitError(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
      p_details: details,
    });
  } catch {}
}

function participantTeamId(row: JsonObject): string {
  return text(row.participating_club_id ?? row.club_id ?? row.team_id);
}
function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true", "t", "1", "yes", "y"].includes(value.trim().toLowerCase());
  return false;
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
  const requiresRules = ["individual_time_trial", "team_time_trial", "pair_time_trial", "prologue"].includes(stageFormat);
  if (!requiresRules) return baseInput;
  if (!rule) throw new Error(`Stage ${baseInput.stage.stageId} (${stageFormat}) is missing race_stage_time_trial_rules.`);
  const countingRaw = rule.counting_rider_number;
  const countingRiderNumber = countingRaw === null || countingRaw === undefined || countingRaw === ""
    ? null
    : Math.trunc(Number(countingRaw));
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

function applyAtomicIntermediatePointReplayPublication(input: any, result: UniversalRaceEngineResult): UniversalRaceEngineResult {
  const checkpoints = result.replayTimeline?.checkpoints ?? [];
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) return result;
  const distanceKm = Math.max(0, finite(input.stage.distanceKm));
  const winnerTimeSeconds = finite(result.finishResolution?.classification?.[0]?.officialTimeSeconds);
  if (!(distanceKm > 0) || !(winnerTimeSeconds > 0)) return result;
  const averageWinnerSpeedKmPerSecond = distanceKm / winnerTimeSeconds;
  const guardedCheckpoints = checkpoints.map((checkpoint) => {
    const checkpointRecord = checkpoint as unknown as JsonObject;
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
    return visible.length === intermediateResults.length ? checkpoint : { ...checkpoint, intermediateResults: visible } as typeof checkpoint;
  });
  return { ...result, replayTimeline: { ...result.replayTimeline, checkpoints: guardedCheckpoints } };
}
function buildOutputWithReplayProgressGuarantee(input: any, result: UniversalRaceEngineResult): any {
  const replayPolicy = classifyUniversalReplaySynchronizationForPublication(result.replaySynchronization);
  if (replayPolicy.blockingIssues.length > 0) {
    throw new Error(
      `Blocking replay synchronization issues: ${replayPolicy.blockingIssues.slice(0, 12).join(" | ")}`
    );
  }
  if (result.replaySynchronization.synchronized && !replayPolicy.nonBlockingIssues.length) {
    return buildProductionUniversalRaceOutput(input, result);
  }
  // Only explicitly non-blocking replay presentation issues may use the
  // degraded publication path. Physical-state contradictions are rejected.
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
        classification: classification.map((row) => row.finishRank !== undefined
          ? row
          : ({ ...row, finishRank: finite(row.rank) })),
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

async function executeOne(supabase: SupabaseClient): Promise<JsonObject> {
  const claim = object(await rpc(supabase, "universal_race_stage_claim_pass2_resume_v1"));
  if (claim.status !== "claimed") return { status: "idle", contract: CONTRACT };
  const stageId = text(claim.stage_id);
  const runId = text(claim.simulation_run_id);
  if (!stageId || !runId) throw new Error("Pass 2 claim is missing stage/run identity.");
  const scenarioMode = text(claim.scenario_mode) || "none";
  const useFallback = scenarioMode === "emergency_fallback";
  const fallbackReason = useFallback ? "same_engine_recovery" : null;

  try {
    await heartbeat(supabase, stageId, runId, "pass2_payload_loading", { source_commit: SOURCE_COMMIT });
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

    let input: any;
    let result: UniversalRaceEngineResult;
    let output: any;
    const started = performance.now();

    if (useFallback) {
      input = buildInputWithTimeTrialRules(
        buildFallbackInput(sources as any) as any,
        timeTrialRules,
      );
      await heartbeat(supabase, stageId, runId, "fallback_engine_started", {
        resumed_pass2: true,
        rider_count: Array.isArray(input.riders) ? input.riders.length : null,
        fallback_reason: fallbackReason,
        fallback_source_commit: FALLBACK_SOURCE_COMMIT,
      });

      const fallbackResult = runFallbackRaceEngine(input as any) as any;
      result = fallbackResult as UniversalRaceEngineResult;
      output = addFinishRankAlias(
        buildFallbackOutput(input as any, fallbackResult as any) as any
      );

      await heartbeat(supabase, stageId, runId, "fallback_engine_finished", {
        resumed_pass2: true,
        elapsed_ms: performance.now() - started,
        fallback_reason: fallbackReason,
        fallback_source_commit: FALLBACK_SOURCE_COMMIT,
      });
    } else {
      input = buildBaseInput(sources as any) as any;
      input = withScenarioAiMetadata(input, sources.participantTeams);
      if (scenarioData) input = attachStoredScenario(input, object(scenarioData));
      input = buildInputWithTimeTrialRules(input, timeTrialRules);

      await heartbeat(supabase, stageId, runId, "primary_engine_started", {
        resumed_pass2: true,
        rider_count: Array.isArray(input.riders) ? input.riders.length : null,
        template_id: scenarioData?.template_id ?? null,
        source_commit: SOURCE_COMMIT,
      });

      const rawResult = runRaceEngine(input as any) as UniversalRaceEngineResult;
      await heartbeat(supabase, stageId, runId, "primary_engine_finished", {
        resumed_pass2: true,
        elapsed_ms: performance.now() - started,
      });

      result = rawResult;
      try { result = applyAtomicIntermediatePointReplayPublication(input, rawResult); } catch {}
      output = buildOutputWithReplayProgressGuarantee(input, result);
      output = addFinishRankAlias(output);
    }
    output = {
      ...output,
      verification: {
        ...object(output.verification),
        resumedPass2: true,
        primarySourceCommit: SOURCE_COMMIT,
        fallbackUsed: useFallback,
        fallbackReason,
        fallbackSourceCommit: useFallback ? FALLBACK_SOURCE_COMMIT : null,
        calculationSurvivalModel: "split_pass_v3",
      },
      calculationSurvival: {
        modelVersion: "split_pass_v3",
        resumedPass2: true,
        sourceCommit: useFallback ? FALLBACK_SOURCE_COMMIT : SOURCE_COMMIT,
        primarySourceCommit: SOURCE_COMMIT,
        fallbackUsed: useFallback,
        fallbackReason,
        fallbackSourceCommit: useFallback ? FALLBACK_SOURCE_COMMIT : null,
      },
    };

    await heartbeat(supabase, stageId, runId, "submitting", {
      resumed_pass2: true,
      fallback_used: useFallback,
      fallback_reason: fallbackReason,
      output_size_estimate_skipped: true,
    });
    const submit = await submitWithRetry(supabase, {
      p_stage_id: stageId,
      p_simulation_run_id: runId,
      p_input_snapshot: input,
      p_universal_result: output,
    });

    if (scenarioData && !useFallback) {
      try {
        await rpc(supabase, "universal_race_stage_finalize_scenario_v1", {
          p_stage_id: stageId,
          p_simulation_run_id: runId,
          p_actual_outcome: outcomeSummary(result),
          p_deviations: [],
        });
      } catch {}
    }
    await heartbeat(supabase, stageId, runId, "calculated_hidden", {
      resumed_pass2: true,
      fallback_used: useFallback,
      fallback_reason: fallbackReason,
    });
    return { status: "completed", contract: CONTRACT, stage_id: stageId, simulation_run_id: runId, submit };
  } catch (error) {
    const serialized = errorPayload(error);
    await heartbeat(supabase, stageId, runId, "pass2_resume_failed", { error: serialized, source_commit: SOURCE_COMMIT });
    try {
      await rpc(supabase, "universal_race_stage_fail_calculation_v1", {
        p_stage_id: stageId,
        p_simulation_run_id: runId,
        p_error_message: text(serialized.message) || "Pass 2 calculation failed.",
        p_error_details: {
          reason: "pass2_engine_or_submit_exception",
          source_commit: SOURCE_COMMIT,
          error: serialized,
          immediate_failure_release: true,
        },
      });
    } catch (failureError) {
      console.error(JSON.stringify({
        status: "pass2_failure_release_failed",
        contract: CONTRACT,
        stage_id: stageId,
        simulation_run_id: runId,
        error: errorPayload(failureError),
      }));
    }
    return { status: "failed", contract: CONTRACT, stage_id: stageId, simulation_run_id: runId, error: serialized };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (!(await authorized(supabase, request))) return jsonResponse({ status: "forbidden", contract: CONTRACT }, 403);

  const task = executeOne(supabase)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => console.error(JSON.stringify({ contract: CONTRACT, error: errorPayload(error) })));
  EdgeRuntime.waitUntil(task);
  return jsonResponse({ status: "accepted", contract: CONTRACT, background_execution: true }, 202);
});
