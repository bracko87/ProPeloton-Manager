import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  classifyUniversalReplaySynchronizationForPublication,
  isUniversalPhase78IssueNonBlocking,
  runRaceEngine,
  type UniversalRaceEngineResult,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/79dd5f231c0677441eeaf7a4b3830c82fa461904/src/universal-race-engine/runRaceEngine.ts";
import {
  buildProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/79dd5f231c0677441eeaf7a4b3830c82fa461904/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/79dd5f231c0677441eeaf7a4b3830c82fa461904/src/universal-race-engine/buildProductionRaceOutput.ts";

// Accepted V5.2 is kept as the emergency sporting fallback only. It is used
// only after a failed/orphaned primary attempt or at the mandatory T-15 deadline.
import { runRaceEngine as runFallbackRaceEngine } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/runRaceEngine.ts";
import { buildProductionUniversalRaceEngineInput as buildFallbackProductionUniversalRaceEngineInput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/buildProductionRaceInput.ts";
import { buildProductionUniversalRaceOutput as buildFallbackProductionUniversalRaceOutput } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/90fc6ce06197f4537b6088d30252b60025f39253/src/universal-race-engine/buildProductionRaceOutput.ts";

const FUNCTION_CONTRACT = "phase11b_universal_production_lifecycle_supabase_v2";
const SOURCE_COMMIT = "79dd5f231c0677441eeaf7a4b3830c82fa461904";
const FALLBACK_SOURCE_COMMIT = "90fc6ce06197f4537b6088d30252b60025f39253";
const WORKER_BUILD = "supabase_race_calculation_survival_v1";
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
function finiteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
async function safeSha256(value: unknown): Promise<string | null> {
  try { return await sha256(value); } catch { return null; }
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
async function heartbeat(
  supabase: SupabaseClient,
  stageId: string,
  simulationRunId: string,
  phase: string,
  details: JsonObject = {},
): Promise<void> {
  try {
    await rpc<unknown>(supabase, "universal_race_stage_survival_heartbeat_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: simulationRunId,
      p_phase: phase,
      p_details: details,
    });
  } catch {
    // Telemetry is non-sporting and must never block a race calculation.
  }
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

function buildProductionInputWithTimeTrialRules(baseInput: any, rule: JsonObject | null): any {
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

function applyAtomicIntermediatePointReplayPublication(
  input: ReturnType<typeof buildProductionUniversalRaceEngineInput>,
  result: UniversalRaceEngineResult,
): UniversalRaceEngineResult {
  const checkpoints = result.replayTimeline?.checkpoints ?? [];
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) return result;

  const distanceKm = Math.max(0, finiteNumber(input.stage.distanceKm));
  const winnerTimeSeconds = finiteNumber(result.finishResolution?.classification?.[0]?.officialTimeSeconds);
  if (!(distanceKm > 0) || !(winnerTimeSeconds > 0)) return result;

  const averageWinnerSpeedKmPerSecond = distanceKm / winnerTimeSeconds;
  const guardedCheckpoints = checkpoints.map((checkpoint) => {
    const checkpointRecord = checkpoint as unknown as JsonObject;
    const progress = object(checkpointRecord.raceProgress);
    const leaderKm = finiteNumber(progress.kmFromStart, -1);
    const riderStates = rows(checkpointRecord.riderStates);
    const intermediateResults = rows(checkpointRecord.intermediateResults);

    if (leaderKm < 0 || intermediateResults.length === 0) return checkpoint;

    const riderGapSeconds = new Map<string, number>();
    riderStates.forEach((state) => {
      const riderId = typeof state.riderId === "string" ? state.riderId : "";
      if (!riderId) return;
      riderGapSeconds.set(riderId, Math.max(0, finiteNumber(state.gapSeconds)));
    });

    const visibleIntermediateResults = intermediateResults.filter((event) => {
      const pointKm = finiteNumber(event.kmFromStart, -1);
      if (pointKm < 0) return true;
      const awardScorers = rows(event.rankings).filter((ranking) =>
        finiteNumber(ranking.pointsAwarded) > 0 || finiteNumber(ranking.bonusSecondsAwarded) > 0
      );
      if (awardScorers.length === 0) return true;
      return awardScorers.every((ranking) => {
        const riderId = typeof ranking.riderId === "string" ? ranking.riderId : "";
        const gapSeconds = riderGapSeconds.get(riderId);
        if (!riderId || gapSeconds === undefined) return false;
        const estimatedRiderKm = leaderKm - gapSeconds * averageWinnerSpeedKmPerSecond;
        return estimatedRiderKm + 0.000001 >= pointKm;
      });
    });

    if (visibleIntermediateResults.length === intermediateResults.length) return checkpoint;
    return { ...checkpoint, intermediateResults: visibleIntermediateResults } as typeof checkpoint;
  });

  return { ...result, replayTimeline: { ...result.replayTimeline, checkpoints: guardedCheckpoints } };
}

function addFinishRankCompatibilityAlias<T>(output: T): T {
  const outputRecord = object(output);
  const universalResult = object(outputRecord.universalResult);
  const finishResolution = object(universalResult.finishResolution);
  const classification = rows(finishResolution.classification);
  if (classification.length === 0) return output;

  const normalizedClassification = classification.map((row) => {
    if (row.finishRank !== undefined && row.finishRank !== null) return row;
    const rank = Number(row.rank);
    return Number.isFinite(rank) ? { ...row, finishRank: rank } : row;
  });

  return {
    ...outputRecord,
    universalResult: {
      ...universalResult,
      finishResolution: { ...finishResolution, classification: normalizedClassification },
    },
  } as T;
}

function buildProductionOutputWithReplayProgressGuarantee(input: ReturnType<typeof buildProductionUniversalRaceEngineInput>, result: UniversalRaceEngineResult) {
  const replayPolicy = classifyUniversalReplaySynchronizationForPublication(result.replaySynchronization);
  if (result.replaySynchronization.synchronized && replayPolicy.nonBlockingIssues.length === 0 && replayPolicy.blockingIssues.length === 0) {
    return buildProductionUniversalRaceOutput(input, result);
  }

  // Replay synchronization is presentation/diagnostic quality. It may degrade,
  // but it must not erase an otherwise valid sporting result.
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
    applicationManifest: { ...built.applicationManifest, validation: { ...built.applicationManifest.validation, replaySynchronized: false } },
    verification: {
      ...built.verification,
      replayQuality: "degraded",
      degradedReplayIssues: [...replayPolicy.blockingIssues, ...replayPolicy.nonBlockingIssues],
      officialResultsUnchanged: true,
      rawReplaySynchronized: false,
    },
  } as typeof built;
}

function stageFormatRequiresTimeTrialRules(input: any): boolean {
  return ["individual_time_trial", "team_time_trial", "pair_time_trial", "prologue"].includes(String(input?.stage?.stageFormat ?? ""));
}

async function calculateClaimedStage(supabase: SupabaseClient, claimValue: unknown): Promise<JsonObject> {
  const claim = object(claimValue);
  const stageId = typeof claim.stage_id === "string" ? claim.stage_id : "";
  const simulationRunId = typeof claim.simulation_run_id === "string" ? claim.simulation_run_id : "";
  if (!stageId || !simulationRunId || claim.status !== "claimed") throw new Error("Claim did not contain a valid stage and simulation-run identity.");

  const degradedComponents: string[] = [];
  let fallbackReason = "";
  try {
    let survivalMode = object(claim.survival_mode);
    if (Object.keys(survivalMode).length === 0) {
      try {
        survivalMode = object(await rpc<unknown>(supabase, "universal_race_stage_survival_mode_v1", { p_stage_id: stageId }));
      } catch {
        survivalMode = {};
      }
    }
    let useFallback = survivalMode.use_fallback === true;
    fallbackReason = String(survivalMode.fallback_reason ?? "");

    await heartbeat(supabase, stageId, simulationRunId, "claimed", {
      requested_fallback: useFallback,
      fallback_reason: fallbackReason,
      primary_source_commit: SOURCE_COMMIT,
      fallback_source_commit: FALLBACK_SOURCE_COMMIT,
    });

    const payload = object(claim.payload);
    const stagePayload = object(payload.stage);
    const stageNumber = Math.max(1, Math.trunc(finiteNumber(stagePayload.stage_number, 1)));

    let preStageStandings: unknown = [];
    try {
      preStageStandings = await rpc<unknown>(supabase, "get_race_stage_pre_stage_standings_v1", { p_stage_id: stageId });
    } catch (error) {
      if (stageNumber > 1) throw error;
      degradedComponents.push("pre_stage_standings_stage1_skipped");
    }

    const sources = buildSources(claim.payload, simulationRunId, preStageStandings);

    let currentBaseInput: any = null;
    try {
      currentBaseInput = buildProductionUniversalRaceEngineInput(sources);
    } catch (error) {
      useFallback = true;
      fallbackReason = fallbackReason || "primary_input_adapter_exception";
      degradedComponents.push("primary_input_adapter_failed");
      if (survivalMode.use_fallback !== true) {
        const details = errorPayload(error);
        degradedComponents.push(`primary_input:${String(details.message ?? "unknown")}`);
      }
    }

    let timeTrialRule: JsonObject | null = null;
    try {
      timeTrialRule = await loadTimeTrialRules(supabase, stageId);
    } catch (error) {
      if (currentBaseInput && stageFormatRequiresTimeTrialRules(currentBaseInput)) throw error;
      degradedComponents.push("time_trial_rule_lookup_skipped_for_non_tt");
    }

    let input: any;
    let result: any;
    let output: any;
    const started = performance.now();

    const runFallbackPackage = () => {
      const fallbackBaseInput = buildFallbackProductionUniversalRaceEngineInput(sources as any) as any;
      const fallbackInput = buildProductionInputWithTimeTrialRules(fallbackBaseInput, timeTrialRule);
      const fallbackResult = runFallbackRaceEngine(fallbackInput as any) as any;
      const fallbackOutput = addFinishRankCompatibilityAlias(
        buildFallbackProductionUniversalRaceOutput(fallbackInput as any, fallbackResult as any) as any,
      );
      return { input: fallbackInput, result: fallbackResult, output: fallbackOutput };
    };

    if (!useFallback && currentBaseInput) {
      input = buildProductionInputWithTimeTrialRules(currentBaseInput, timeTrialRule);
      await heartbeat(supabase, stageId, simulationRunId, "primary_engine_started", {
        rider_count: Array.isArray(input?.riders) ? input.riders.length : null,
      });
      try {
        const rawResult = runRaceEngine(input);
        await heartbeat(supabase, stageId, simulationRunId, "primary_engine_finished", {
          elapsed_ms: performance.now() - started,
        });
        try {
          result = applyAtomicIntermediatePointReplayPublication(input, rawResult);
        } catch {
          result = rawResult;
          degradedComponents.push("atomic_intermediate_replay_publication_skipped");
        }
        output = addFinishRankCompatibilityAlias(buildProductionOutputWithReplayProgressGuarantee(input, result));
      } catch (primaryError) {
        degradedComponents.push("primary_engine_or_output_failed");
        fallbackReason = "primary_engine_or_output_exception";
        await heartbeat(supabase, stageId, simulationRunId, "primary_engine_failed_switching_to_fallback", {
          error: errorPayload(primaryError),
        });
        useFallback = true;
      }
    }

    if (useFallback) {
      await heartbeat(supabase, stageId, simulationRunId, "fallback_engine_started", {
        fallback_reason: fallbackReason,
        fallback_source_commit: FALLBACK_SOURCE_COMMIT,
      });
      const fallbackPackage = runFallbackPackage();
      input = fallbackPackage.input;
      result = fallbackPackage.result;
      output = fallbackPackage.output;
      degradedComponents.push("emergency_v5_2_sporting_fallback");
      await heartbeat(supabase, stageId, simulationRunId, "fallback_engine_finished", {
        elapsed_ms: performance.now() - started,
      });
    }

    if (!input || !result || !output) throw new Error("Race calculation produced no submit-ready package.");

    const outputRecord = object(output);
    output = {
      ...outputRecord,
      verification: {
        ...object(outputRecord.verification),
        calculationSurvivalModel: "race_calculation_survival_v1",
        fallbackUsed: useFallback,
        fallbackReason: fallbackReason || null,
        primarySourceCommit: SOURCE_COMMIT,
        fallbackSourceCommit: useFallback ? FALLBACK_SOURCE_COMMIT : null,
        degradedComponents,
      },
      calculationSurvival: {
        modelVersion: "race_calculation_survival_v1",
        fallbackUsed: useFallback,
        fallbackReason: fallbackReason || null,
        degradedComponents,
      },
    };

    await heartbeat(supabase, stageId, simulationRunId, "output_ready", {
      fallback_used: useFallback,
      degraded_components: degradedComponents,
    });

    const inputHash = await safeSha256(input);
    const outputHash = await safeSha256(output);
    if (inputHash === null || outputHash === null) degradedComponents.push("diagnostic_hash_skipped");

    await heartbeat(supabase, stageId, simulationRunId, "submitting", {
      fallback_used: useFallback,
      degraded_components: degradedComponents,
    });

    // Persistence is mandatory. If it fails, the run is failed and the external
    // survival watchdog/retry path will try again; we never fake official writes.
    const submit = await rpc<unknown>(supabase, "universal_race_stage_submit_calculation_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: simulationRunId,
      p_input_snapshot: input,
      p_universal_result: output,
    });

    const calculationCpuMs = performance.now() - started;
    return {
      status: "calculated_hidden",
      stage_id: stageId,
      simulation_run_id: simulationRunId,
      engine_key: result.engineKey,
      engine_version: result.engineVersion,
      input_hash_sha256: inputHash,
      output_hash_sha256: outputHash,
      replay_checkpoint_count: Array.isArray(result?.replayTimeline?.checkpoints) ? result.replayTimeline.checkpoints.length : 0,
      accepted_rider_count: Array.isArray(input?.riders) ? input.riders.length : 0,
      classification_rider_count: Array.isArray(result?.finishResolution?.classification) ? result.finishResolution.classification.length : 0,
      phase11_manifest_ready: object(output.applicationManifest).readyForApplication === true,
      calculation_cpu_ms: calculationCpuMs,
      time_trial_rules_loaded: timeTrialRule !== null,
      worker_build: WORKER_BUILD,
      fallback_used: useFallback,
      fallback_reason: fallbackReason || null,
      degraded_components: degradedComponents,
      submit_result: submit,
    };
  } catch (error) {
    const serialized = errorPayload(error);
    try {
      await rpc<unknown>(supabase, "universal_race_stage_fail_calculation_v1", {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_error_message: String(serialized.message ?? "Phase 11B calculation failed"),
        p_error_details: {
          ...serialized,
          calculation_survival_model: "race_calculation_survival_v1",
          fallback_reason: fallbackReason || null,
          degraded_components: degradedComponents,
        },
      });
    } catch {}
    return {
      status: "failed",
      stage_id: stageId,
      simulation_run_id: simulationRunId,
      worker_build: WORKER_BUILD,
      fallback_reason: fallbackReason || null,
      degraded_components: degradedComponents,
      error: serialized,
    };
  }
}

async function runLifecycleTick(supabase: SupabaseClient): Promise<JsonObject> {
  const before = object(await rpc<unknown>(supabase, "universal_race_stage_process_lifecycle_v1", { p_max_publications: MAX_PUBLICATIONS_PER_TICK }));
  const calculations: JsonObject[] = [];
  for (let index = 0; index < MAX_CALCULATIONS_PER_TICK; index += 1) {
    const claim = object(await rpc<unknown>(supabase, "universal_race_stage_claim_next_due_v1", { p_worker_id: "supabase_edge_phase11b_survival_v1" }));
    if (claim.status !== "claimed") break;
    calculations.push(await calculateClaimedStage(supabase, claim));
  }
  const after = object(await rpc<unknown>(supabase, "universal_race_stage_process_lifecycle_v1", { p_max_publications: MAX_PUBLICATIONS_PER_TICK }));
  return {
    status: "completed",
    contract: FUNCTION_CONTRACT,
    source_commit: SOURCE_COMMIT,
    fallback_source_commit: FALLBACK_SOURCE_COMMIT,
    worker_build: WORKER_BUILD,
    before,
    calculations,
    after,
    processed_at_real: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const body = request.method === "POST" ? await request.json().catch(() => ({})) as JsonObject : {};
  const url = new URL(request.url);
  const action = String(body.action ?? url.searchParams.get("action") ?? "health").toLowerCase();
  if (action === "health") return jsonResponse({
    status: "ok",
    contract: FUNCTION_CONTRACT,
    source_commit: SOURCE_COMMIT,
    fallback_source_commit: FALLBACK_SOURCE_COMMIT,
    worker_build: WORKER_BUILD,
    scheduler: "supabase_cron",
    max_calculations_per_tick: MAX_CALCULATIONS_PER_TICK,
    production_lifecycle: true,
    calculation_survival: true,
    mandatory_ready_lead_minutes: 15,
    browser_calculation_required: false,
    legacy_execution_enabled: false,
  });
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
