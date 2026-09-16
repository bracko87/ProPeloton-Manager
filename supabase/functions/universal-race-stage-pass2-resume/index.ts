/// <reference lib="deno.ns" />
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { runRaceEngine } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/dae877bebc866a4cbd431e8ebce173885913f219/src/universal-race-engine/runRaceEngine.ts";
import { buildProductionUniversalRaceEngineInput as buildBaseInput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/dae877bebc866a4cbd431e8ebce173885913f219/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/dae877bebc866a4cbd431e8ebce173885913f219/src/universal-race-engine/buildProductionRaceOutput.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type JsonObject = Record<string, unknown>;
const SOURCE_COMMIT = "dae877bebc866a4cbd431e8ebce173885913f219";
const CONTRACT = "universal_race_pass2_resume_v2";
const encoder = new TextEncoder();

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
  if (typeof value === "string") return ["true", "t", "1", "yes", "y"].includes(value.trim().toLowerCase());
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
      p_details: details,
    });
  } catch {
    // Telemetry must never block sporting calculation/recovery.
  }
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
    profile: rows(payload.profile)[0] ?? {},
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
        classification: classification.map((row) =>
          row.finishRank !== undefined ? row : ({ ...row, finishRank: finite(row.rank) })
        ),
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
    replay_checkpoint_count: Array.isArray(result?.replayTimeline?.checkpoints)
      ? result.replayTimeline.checkpoints.length
      : 0,
  };
}
function approximateJsonBytes(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return -1;
  }
}

async function runPass2Resume(supabase: SupabaseClient): Promise<void> {
  const claim = object(await rpc(supabase, "universal_race_stage_claim_pass2_resume_v1"));
  if (claim.status !== "claimed") {
    console.log(JSON.stringify({ contract: CONTRACT, status: "idle" }));
    return;
  }

  const stageId = text(claim.stage_id);
  const runId = text(claim.simulation_run_id);
  try {
    await heartbeat(supabase, stageId, runId, "pass2_payload_loading", { source_commit: SOURCE_COMMIT });
    const payloadStarted = performance.now();
    const payload = object(await rpc(supabase, "universal_race_stage_get_calculation_payload_v1", {
      p_stage_id: stageId,
    }));
    await heartbeat(supabase, stageId, runId, "pass2_input_building", {
      source_commit: SOURCE_COMMIT,
      payload_elapsed_ms: performance.now() - payloadStarted,
      payload_bytes: approximateJsonBytes(payload),
    });

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
    if (!scenarioData) throw new Error("Reserved scenario disappeared before Pass 2 resume.");

    const sources = buildSources(payload, runId, standings);
    let input = buildBaseInput(sources as any) as any;
    input = withScenarioAiMetadata(input, sources.participantTeams);
    input = attachStoredScenario(input, object(scenarioData));

    await heartbeat(supabase, stageId, runId, "primary_engine_started", {
      resumed_pass2: true,
      rider_count: Array.isArray(input.riders) ? input.riders.length : null,
      template_id: scenarioData.template_id,
    });

    const engineStarted = performance.now();
    const result = runRaceEngine(input as any) as any;
    const engineElapsedMs = performance.now() - engineStarted;
    await heartbeat(supabase, stageId, runId, "primary_engine_finished", {
      resumed_pass2: true,
      elapsed_ms: engineElapsedMs,
      replay_checkpoint_count: Array.isArray(result?.replayTimeline?.checkpoints)
        ? result.replayTimeline.checkpoints.length
        : 0,
    });

    let output = buildProductionUniversalRaceOutput(input as any, result as any) as any;
    output = addFinishRankAlias(output);
    output = {
      ...output,
      verification: {
        ...object(output.verification),
        resumedPass2: true,
        primarySourceCommit: SOURCE_COMMIT,
        calculationSurvivalModel: "split_pass_v2",
      },
      calculationSurvival: {
        modelVersion: "split_pass_v2",
        resumedPass2: true,
        sourceCommit: SOURCE_COMMIT,
      },
    };

    const inputBytes = approximateJsonBytes(input);
    const outputBytes = approximateJsonBytes(output);
    await heartbeat(supabase, stageId, runId, "output_ready", {
      resumed_pass2: true,
      engine_elapsed_ms: engineElapsedMs,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
      replay_checkpoint_count: Array.isArray(result?.replayTimeline?.checkpoints)
        ? result.replayTimeline.checkpoints.length
        : 0,
      report_event_count: Array.isArray(output?.publication?.reportEvents)
        ? output.publication.reportEvents.length
        : 0,
    });

    await heartbeat(supabase, stageId, runId, "submitting", {
      resumed_pass2: true,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
    });
    const submitStarted = performance.now();
    const submit = await rpc(supabase, "universal_race_stage_submit_calculation_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: runId,
      p_input_snapshot: input,
      p_universal_result: output,
    });
    const submitElapsedMs = performance.now() - submitStarted;

    await heartbeat(supabase, stageId, runId, "pass2_submit_completed", {
      resumed_pass2: true,
      submit_elapsed_ms: submitElapsedMs,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
    });

    try {
      await rpc(supabase, "universal_race_stage_finalize_scenario_v1", {
        p_stage_id: stageId,
        p_simulation_run_id: runId,
        p_actual_outcome: outcomeSummary(result),
        p_deviations: [],
      });
    } catch (scenarioError) {
      console.error(JSON.stringify({
        contract: CONTRACT,
        event: "scenario_finalize_failed",
        stage_id: stageId,
        simulation_run_id: runId,
        error: scenarioError instanceof Error ? scenarioError.message : String(scenarioError),
      }));
    }

    console.log(JSON.stringify({
      contract: CONTRACT,
      status: "completed",
      stage_id: stageId,
      simulation_run_id: runId,
      engine_elapsed_ms: engineElapsedMs,
      submit_elapsed_ms: submitElapsedMs,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
      submit,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await heartbeat(supabase, stageId, runId, "pass2_resume_failed", { error: message });
    console.error(JSON.stringify({
      contract: CONTRACT,
      status: "failed",
      stage_id: stageId,
      simulation_run_id: runId,
      error: message,
    }));
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (!(await authorized(supabase, request))) {
    return jsonResponse({ status: "forbidden", contract: CONTRACT }, 403);
  }

  const acceptedAt = new Date().toISOString();
  const backgroundTask = runPass2Resume(supabase).catch((error) => {
    console.error(JSON.stringify({
      contract: CONTRACT,
      event: "background_worker_failed",
      accepted_at_real: acceptedAt,
      failed_at_real: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }));
  });
  EdgeRuntime.waitUntil(backgroundTask);

  return jsonResponse({
    status: "accepted",
    contract: CONTRACT,
    background_execution: true,
    accepted_at_real: acceptedAt,
  }, 202);
});
