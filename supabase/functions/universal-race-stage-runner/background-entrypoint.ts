/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type CapturedHandler = (request: Request) => Response | Promise<Response>;
type JsonObject = Record<string, unknown>;

const originalServe = Deno.serve;
const nativeServe = originalServe.bind(Deno);
let capturedHandler: CapturedHandler | null = null;

// Load the existing production runner without allowing it to bind its own HTTP
// server. We then expose the exact same handler behind a short-lived dispatcher
// that can move long race calculations into EdgeRuntime.waitUntil().
(Deno as any).serve = (...args: any[]) => {
  const handler = typeof args[0] === "function" ? args[0] : args[1];
  if (typeof handler !== "function") {
    throw new Error("Could not capture universal race runner handler.");
  }
  capturedHandler = handler as CapturedHandler;
  return { finished: Promise.resolve(), shutdown: () => undefined } as any;
};

try {
  await import("./index.ts");
} finally {
  (Deno as any).serve = originalServe;
}

if (!capturedHandler) {
  throw new Error("Universal race runner handler was not registered.");
}

const runnerHandler = capturedHandler;
const BACKGROUND_CONTRACT = "phase11b_universal_background_dispatch_v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}

async function requestAction(request: Request): Promise<string> {
  const url = new URL(request.url);
  const queryAction = url.searchParams.get("action");
  if (request.method !== "POST") {
    return String(queryAction ?? "health").toLowerCase();
  }
  const body = await request.clone().json().catch(() => ({})) as JsonObject;
  return String(body.action ?? queryAction ?? "health").toLowerCase();
}

async function authorizedTick(request: Request): Promise<boolean> {
  const supplied = request.headers.get("x-universal-race-worker-secret")?.trim() ?? "";
  if (!supplied) return false;

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("verify_universal_race_worker_secret_v1", {
    p_secret: supplied,
  });
  return !error && data === true;
}

nativeServe(async (request: Request) => {
  const action = await requestAction(request);

  // Health and invalid-action behavior remain exactly as implemented by the
  // existing runner. Only the scheduled tick is detached from the HTTP request.
  if (action !== "tick") {
    return await runnerHandler(request);
  }

  if (!(await authorizedTick(request))) {
    return jsonResponse({ status: "forbidden", contract: BACKGROUND_CONTRACT }, 403);
  }

  const acceptedAt = new Date().toISOString();
  const workerRequest = request.clone();
  const backgroundTask = Promise.resolve(runnerHandler(workerRequest))
    .then(async (response) => {
      const responseText = await response.clone().text().catch(() => "");
      const event = {
        contract: BACKGROUND_CONTRACT,
        event: "background_tick_completed",
        accepted_at_real: acceptedAt,
        completed_at_real: new Date().toISOString(),
        response_status: response.status,
        response_ok: response.ok,
        response_body: responseText.slice(0, 8000),
      };
      if (response.ok) console.log(JSON.stringify(event));
      else console.error(JSON.stringify(event));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        contract: BACKGROUND_CONTRACT,
        event: "background_tick_failed",
        accepted_at_real: acceptedAt,
        failed_at_real: new Date().toISOString(),
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack ?? null }
          : { name: "UnknownError", message: String(error) },
      }));
    });

  EdgeRuntime.waitUntil(backgroundTask);

  return jsonResponse({
    status: "accepted",
    contract: BACKGROUND_CONTRACT,
    action: "tick",
    background_execution: true,
    accepted_at_real: acceptedAt,
  }, 202);
});
