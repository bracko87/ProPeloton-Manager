/// <reference lib="deno.ns" />
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildScenarioProductionUniversalRaceEngineInput,
  getRoadScenarioAuditV1,
} from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/651310fb364897b8cb70d1c8be8d5cde7fbfb043/src/universal-race-engine/buildProductionRaceInputScenarioV1.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type JsonObject = Record<string, unknown>;
const SOURCE_COMMIT = "651310fb364897b8cb70d1c8be8d5cde7fbfb043";
const CONTRACT = "universal_race_pass1_resume_v14";

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

function buildSources(payloadValue: unknown, runId: string, preStageStandings: unknown, scenarioHistory: JsonObject[]): any {
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
    scenarioHistory,
    deterministicSeed: `universal-production:${raceId}:${stageId}:${runId}`,
  };
}
function sourceRaceId(payload: JsonObject): string {
  return text(object(payload.race).id);
}
function sourceGameDate(payload: JsonObject): string {
  const stage = object(payload.stage);
  const race = object(payload.race);
  return text(stage.stage_date ?? race.start_date).slice(0, 10);
}
async function loadScenarioHistory(supabase: SupabaseClient, payload: JsonObject): Promise<JsonObject[]> {
  const raceId = sourceRaceId(payload);
  const gameDate = sourceGameDate(payload);
  if (!raceId || !gameDate) return [];
  return rows(await rpc(supabase, "universal_race_stage_scenario_history_v1", {
    p_race_id: raceId,
    p_game_date: gameDate,
  }));
}

async function executePass1(supabase: SupabaseClient, claim: JsonObject): Promise<JsonObject> {
  const stageId = text(claim.stage_id);
  const runId = text(claim.simulation_run_id);
  if (!stageId || !runId) throw new Error("Pass 1 claim is missing stage/run identity.");

  await heartbeat(supabase, stageId, runId, "pass1_payload_loading", { source_commit: SOURCE_COMMIT });
  const payload = object(await rpc(supabase, "universal_race_stage_get_calculation_payload_v2", {
    p_stage_id: stageId,
  }));
  const stageNumber = Math.max(1, Math.trunc(finite(object(payload.stage).stage_number, 1)));

  let standings: unknown = [];
  try {
    standings = await rpc(supabase, "get_race_stage_pre_stage_standings_v1", { p_stage_id: stageId });
  } catch (error) {
    if (stageNumber > 1) throw error;
  }

  let history = await loadScenarioHistory(supabase, payload);
  await heartbeat(supabase, stageId, runId, "pass1_started", {
    source_commit: SOURCE_COMMIT,
    rider_count: rows(payload.rider_inputs).length,
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sources = buildSources(payload, runId, standings, history);
    const input = buildScenarioProductionUniversalRaceEngineInput(sources as any) as any;
    const audit = getRoadScenarioAuditV1(input) as any;

    if (!audit) {
      await heartbeat(supabase, stageId, runId, "pass1_ready_no_scenario", {
        source_commit: SOURCE_COMMIT,
        stage_format: input?.stage?.stageFormat ?? null,
      });
      return {
        status: "pass1_ready_no_scenario",
        stage_id: stageId,
        simulation_run_id: runId,
      };
    }

    const reservation = object(await rpc(supabase, "universal_race_stage_reserve_scenario_v1", {
      p_stage_id: stageId,
      p_simulation_run_id: runId,
      p_audit: audit,
    }));
    const reservationStatus = text(reservation.status);
    const selectedTemplateId = text(audit.templateId);
    const reservedTemplateId = text(reservation.template_id);

    if ((reservationStatus === "reserved" || reservationStatus === "existing") &&
        (!reservedTemplateId || reservedTemplateId === selectedTemplateId)) {
      await heartbeat(supabase, stageId, runId, "scenario_reserved", {
        source_commit: SOURCE_COMMIT,
        scenario_type: audit.scenarioType ?? null,
        template_id: audit.templateId ?? null,
        template_family: audit.templateFamily ?? null,
        compatibility_score: audit.compatibilityScore ?? null,
      });
      return {
        status: "scenario_reserved",
        stage_id: stageId,
        simulation_run_id: runId,
        template_id: audit.templateId ?? null,
        compatibility_score: audit.compatibilityScore ?? null,
      };
    }

    if (reservationStatus === "collision" || reservationStatus === "existing") {
      history = await loadScenarioHistory(supabase, payload);
      continue;
    }
    throw new Error(`Scenario reservation failed with status ${reservationStatus || "unknown"}.`);
  }

  throw new Error("Scenario reservation did not converge after history refreshes.");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (!(await authorized(supabase, request))) return jsonResponse({ status: "forbidden", contract: CONTRACT }, 403);

  const claim = object(await rpc(supabase, "universal_race_stage_claim_pass1_resume_v1"));
  if (claim.status !== "claimed") return jsonResponse({ status: "idle", contract: CONTRACT });

  const stageId = text(claim.stage_id);
  const runId = text(claim.simulation_run_id);
  const task = executePass1(supabase, claim)
    .then((result) => console.log(JSON.stringify({ ...result, contract: CONTRACT })))
    .catch(async (error) => {
      const serialized = errorPayload(error);
      await heartbeat(supabase, stageId, runId, "pass1_resume_failed", {
        error: serialized,
        source_commit: SOURCE_COMMIT,
      });
      try {
        await rpc(supabase, "universal_race_stage_fail_calculation_v1", {
          p_stage_id: stageId,
          p_simulation_run_id: runId,
          p_error_message: text(serialized.message) || "Pass 1 calculation failed.",
          p_error_details: {
            reason: "pass1_engine_exception",
            source_commit: SOURCE_COMMIT,
            error: serialized,
            immediate_failure_release: true,
          },
        });
      } catch (failureError) {
        console.error(JSON.stringify({
          status: "failure_release_failed",
          contract: CONTRACT,
          stage_id: stageId,
          simulation_run_id: runId,
          error: errorPayload(failureError),
        }));
      }
      console.error(JSON.stringify({ status: "failed", contract: CONTRACT, stage_id: stageId, simulation_run_id: runId, error: serialized }));
    });
  EdgeRuntime.waitUntil(task);
  return jsonResponse({
    status: "accepted",
    contract: CONTRACT,
    background_execution: true,
    stage_id: stageId,
    simulation_run_id: runId,
  }, 202);
});
