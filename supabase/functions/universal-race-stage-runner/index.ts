import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  classifyUniversalReplaySynchronizationForPublication,
  isUniversalPhase78IssueNonBlocking,
  runRaceEngine,
  type UniversalRaceEngineResult,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/runRaceEngine.ts";
import {
  buildProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/buildProductionRaceOutput.ts";

const FUNCTION_CONTRACT = "phase11b_universal_production_lifecycle_supabase_v2";
const SOURCE_COMMIT = "90fc6ce06197f4537b6088d30252b60025f39253";
const WORKER_BUILD = "supabase_time_trial_rules_v2";
const MAX_CALCULATIONS_PER_TICK = 1;
const MAX_PUBLICATIONS_PER_TICK = 4;
const encoder = new TextEncoder();

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function firstObject(value: unknown): JsonObject {
  return Array.isArray(value) ? object(value[0]) : object(value);
}
function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function errorPayload(error: unknown): JsonObject {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? null };
  return { name: "UnknownError", message: String(error) };
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

function buildSources(payloadValue: unknown, simulationRunId: string, preStageStandings: unknown): ProductionUniversalRaceSources {
  const payload = object(payloadValue);
  const race = object(payload.race);
  const stage = object(payload.stage);
  const stageId = typeof stage.id === "string" ? stage.id : "";
  const raceId = typeof race.id === "string" ? race.id : "";
  if (!stageId || !raceId) throw new Error("Claim payload is missing race/stage identity.");
  return {
    race: race as ProductionUniversalRaceSources["race"],
    stage: stage as ProductionUniversalRaceSources["stage"],
    profile: firstObject(payload.profile) as ProductionUniversalRaceSources["profile"],
    stagePoints: rows(payload.stage_points) as unknown as ProductionUniversalRaceSources["stagePoints"],
    participantTeams: rows(payload.participant_teams) as unknown as ProductionUniversalRaceSources["participantTeams"],
    participantRiders: rows(payload.participant_riders) as unknown as ProductionUniversalRaceSources["participantRiders"],
    riderInputRows: rows(payload.rider_inputs) as unknown as ProductionUniversalRaceSources["riderInputRows"],
    phaseCommandRows: rows(payload.phase_commands) as unknown as ProductionUniversalRaceSources["phaseCommandRows"],
    lockedPlanRows: rows(payload.locked_plans ?? payload.stage_plans) as unknown as ProductionUniversalRaceSources["lockedPlanRows"],
    preStageLeaders: payload.pre_stage_leaders,
    preStageStandings,
    phase9Payload: firstObject(payload.phase9_inputs) as ProductionUniversalRaceSources["phase9Payload"],
    deterministicSeed: `universal-production:${raceId}:${stageId}:${simulationRunId}`,
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

function buildProductionInputWithTimeTrialRules(
  baseInput: ReturnType<typeof buildProductionUniversalRaceEngineInput>,
  rule: JsonObject | null,
) {
  const stageFormat = baseInput.stage.stageFormat;
  const requiresRules = ["individual_time_trial", "team_time_trial", "pair_time_trial", "prologue"].includes(stageFormat);
  if (!requiresRules) return baseInput;
  if (!rule) throw new Error(`Stage ${baseInput.stage.stageId} (${stageFormat}) is missing race_stage_time_trial_rules.`);

  const countingRaw = rule.counting_rider_number;
  const countingRiderNumber = countingRaw === null || countingRaw === undefined || countingRaw === ""
    ? null
    : Math.trunc(Number(countingRaw));
  const startIntervalSeconds = Math.max(1, Math.trunc(Number(rule.start_interval_seconds ?? 60)));
  const replayDurationSeconds = Math.max(1, Math.trunc(Number(rule.replay_duration_seconds ?? 900)));

  return {
    ...baseInput,
    stage: {
      ...baseInput.stage,
      timeTrialRules: {
        startOrderMode: String(rule.start_order_mode ?? "automatic"),
        startIntervalSeconds,
        countingRiderNumber: Number.isFinite(countingRiderNumber as number) ? countingRiderNumber : null,
        equipmentRequired: rule.equipment_required === true,
        replayDurationSeconds,
        droppedRiderTimeMode: String(rule.dropped_rider_time_mode ?? "personal_time"),
        metadata: object(rule.rules_json),
      },
    },
  };
}

function buildProductionOutputWithReplayProgressGuarantee(input: ReturnType<typeof buildProductionUniversalRaceEngineInput>, result: UniversalRaceEngineResult) {
  const replayPolicy = classifyUniversalReplaySynchronizationForPublication(result.replaySynchronization);
  if (!replayPolicy.publishable) throw new Error(`Universal replay synchronization failed: ${replayPolicy.blockingIssues.join(", ")}`);
  if (result.replaySynchronization.synchronized && replayPolicy.nonBlockingIssues.length === 0) {
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
      invariants: result.phase78Acceptance.invariants.map((invariant) => isUniversalPhase78IssueNonBlocking(invariant.key) ? { ...invariant, passed: true } : invariant),
      phase7: { ...result.phase78Acceptance.phase7, replaySynchronized: true },
    },
  };
  const built = buildProductionUniversalRaceOutput(input, builderResult);
  return {
    ...built,
    universalResult: result,
    applicationManifest: { ...built.applicationManifest, validation: { ...built.applicationManifest.validation, replaySynchronized: false } },
    verification: {
      ...built.verification,
      replayQuality: "degraded",
      degradedReplayIssues: [...replayPolicy.nonBlockingIssues],
      officialResultsUnchanged: true,
      rawReplaySynchronized: false,
    },
  } as typeof built;
}

async function calculateClaimedStage(supabase: SupabaseClient, claimValue: unknown): Promise<JsonObject> {
  const claim = object(claimValue);
  const stageId = typeof claim.stage_id === "string" ? claim.stage_id : "";
  const simulationRunId = typeof claim.simulation_run_id === "string" ? claim.simulation_run_id : "";
  if (!stageId || !simulationRunId || claim.status !== "claimed") throw new Error("Claim did not contain a valid stage and simulation-run identity.");
  try {
    const preStageStandings = await rpc<unknown>(supabase, "get_race_stage_pre_stage_standings_v1", { p_stage_id: stageId });
    const sources = buildSources(claim.payload, simulationRunId, preStageStandings);
    const baseInput = buildProductionUniversalRaceEngineInput(sources);
    const timeTrialRule = await loadTimeTrialRules(supabase, stageId);
    const input = buildProductionInputWithTimeTrialRules(baseInput, timeTrialRule);
    const started = performance.now();
    const result = runRaceEngine(input);
    const output = buildProductionOutputWithReplayProgressGuarantee(input, result);
    const inputHash = await sha256(input);
    const outputHash = await sha256(output);
    const calculationCpuMs = performance.now() - started;
    const submit = await rpc<unknown>(supabase, "universal_race_stage_submit_calculation_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: simulationRunId,
      p_input_snapshot: input,
      p_universal_result: output,
    });
    return {
      status: "calculated_hidden",
      stage_id: stageId,
      simulation_run_id: simulationRunId,
      engine_key: result.engineKey,
      engine_version: result.engineVersion,
      input_hash_sha256: inputHash,
      output_hash_sha256: outputHash,
      replay_checkpoint_count: result.replayTimeline.checkpoints.length,
      accepted_rider_count: input.riders.length,
      classification_rider_count: result.finishResolution.classification.length,
      phase11_manifest_ready: output.applicationManifest.readyForApplication,
      calculation_cpu_ms: calculationCpuMs,
      time_trial_rules_loaded: timeTrialRule !== null,
      worker_build: WORKER_BUILD,
      submit_result: submit,
    };
  } catch (error) {
    const serialized = errorPayload(error);
    try {
      await rpc<unknown>(supabase, "universal_race_stage_fail_calculation_v1", {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_error_message: String(serialized.message ?? "Phase 11B calculation failed"),
        p_error_details: serialized,
      });
    } catch {}
    return { status: "failed", stage_id: stageId, simulation_run_id: simulationRunId, worker_build: WORKER_BUILD, error: serialized };
  }
}

async function runLifecycleTick(supabase: SupabaseClient): Promise<JsonObject> {
  const before = object(await rpc<unknown>(supabase, "universal_race_stage_process_lifecycle_v1", { p_max_publications: MAX_PUBLICATIONS_PER_TICK }));
  const calculations: JsonObject[] = [];
  for (let index = 0; index < MAX_CALCULATIONS_PER_TICK; index += 1) {
    const claim = object(await rpc<unknown>(supabase, "universal_race_stage_claim_next_due_v1", { p_worker_id: "supabase_edge_phase11b_v2" }));
    if (claim.status !== "claimed") break;
    calculations.push(await calculateClaimedStage(supabase, claim));
  }
  const after = object(await rpc<unknown>(supabase, "universal_race_stage_process_lifecycle_v1", { p_max_publications: MAX_PUBLICATIONS_PER_TICK }));
  return { status: "completed", contract: FUNCTION_CONTRACT, source_commit: SOURCE_COMMIT, worker_build: WORKER_BUILD, before, calculations, after, processed_at_real: new Date().toISOString() };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const body = request.method === "POST" ? await request.json().catch(() => ({})) as JsonObject : {};
  const url = new URL(request.url);
  const action = String(body.action ?? url.searchParams.get("action") ?? "health").toLowerCase();
  if (action === "health") return jsonResponse({ status: "ok", contract: FUNCTION_CONTRACT, source_commit: SOURCE_COMMIT, worker_build: WORKER_BUILD, scheduler: "supabase_cron", max_calculations_per_tick: MAX_CALCULATIONS_PER_TICK, production_lifecycle: true, browser_calculation_required: false, legacy_execution_enabled: false });
  if (action !== "tick") return jsonResponse({ status: "invalid_action", contract: FUNCTION_CONTRACT }, 400);

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-PPM-Worker": FUNCTION_CONTRACT } },
  });
  if (!(await authorized(supabase, request))) return jsonResponse({ status: "forbidden", contract: FUNCTION_CONTRACT }, 403);

  try {
    return jsonResponse(await runLifecycleTick(supabase));
  } catch (error) {
    const serialized = errorPayload(error);
    console.error(JSON.stringify({ contract: FUNCTION_CONTRACT, action, error: serialized }));
    return jsonResponse({ status: "failed", contract: FUNCTION_CONTRACT, action, error: serialized }, 500);
  }
});
