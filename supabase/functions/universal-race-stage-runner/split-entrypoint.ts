/// <reference lib="deno.ns" />
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

type JsonObject = Record<string, unknown>;
const CONTRACT = "universal_race_split_dispatch_v1";
const MAX_PUBLICATIONS_PER_TICK = 4;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  } catch {
    // Telemetry must never block the lifecycle.
  }
}

async function dispatchOne(supabase: SupabaseClient): Promise<JsonObject> {
  const claim = object(await rpc(supabase, "universal_race_stage_claim_next_due_v2", {
    p_worker_id: "supabase_edge_split_dispatch_v1",
  }));
  if (claim.status !== "claimed") return { status: text(claim.status) || "idle" };

  const stageId = text(claim.stage_id);
  const runId = text(claim.simulation_run_id);
  if (!stageId || !runId) throw new Error("Claim is missing stage/run identity.");

  try {
    await heartbeat(supabase, stageId, runId, "dispatcher_claimed", { contract: CONTRACT });
    const payload = object(await rpc(supabase, "universal_race_stage_get_calculation_payload_v1", {
      p_stage_id: stageId,
    }));
    if (!text(object(payload.stage).id) || !text(object(payload.race).id)) {
      throw new Error("Calculation payload is missing race/stage identity.");
    }
    await heartbeat(supabase, stageId, runId, "pass1_pending", {
      contract: CONTRACT,
      payload_bytes_estimate: JSON.stringify(payload).length,
    });
    return { status: "pass1_pending", stage_id: stageId, simulation_run_id: runId };
  } catch (error) {
    const serialized = errorPayload(error);
    try {
      await rpc(supabase, "universal_race_stage_fail_calculation_v1", {
        p_stage_id: stageId,
        p_simulation_run_id: runId,
        p_error_message: String(serialized.message ?? "Split dispatcher failed"),
        p_error_details: { ...serialized, split_pipeline_phase: "dispatcher" },
      });
    } catch {}
    return { status: "failed", stage_id: stageId, simulation_run_id: runId, error: serialized };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const body = request.method === "POST" ? await request.json().catch(() => ({})) as JsonObject : {};
  const url = new URL(request.url);
  const action = text(body.action ?? url.searchParams.get("action") ?? "health").toLowerCase();
  if (action === "health") {
    return jsonResponse({ status: "ok", contract: CONTRACT, split_pipeline: true });
  }
  if (action !== "tick") return jsonResponse({ status: "invalid_action", contract: CONTRACT }, 400);

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-PPM-Worker": CONTRACT } },
  });
  if (!(await authorized(supabase, request))) return jsonResponse({ status: "forbidden", contract: CONTRACT }, 403);

  try {
    const before = object(await rpc(supabase, "universal_race_stage_process_lifecycle_v1", {
      p_max_publications: MAX_PUBLICATIONS_PER_TICK,
    }));
    const calculation = await dispatchOne(supabase);
    const after = object(await rpc(supabase, "universal_race_stage_process_lifecycle_v1", {
      p_max_publications: MAX_PUBLICATIONS_PER_TICK,
    }));
    return jsonResponse({ status: "completed", contract: CONTRACT, before, calculation, after });
  } catch (error) {
    const serialized = errorPayload(error);
    console.error(JSON.stringify({ contract: CONTRACT, error: serialized }));
    return jsonResponse({ status: "failed", contract: CONTRACT, error: serialized }, 500);
  }
});
