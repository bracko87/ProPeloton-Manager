// AdGem v3 signed POST callback for ProPeloton Manager.
// No application secret is shipped to browsers or GitHub.
// verify_jwt=false ONLY because AdGem calls this with a signed HMAC webhook.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function respond(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function usdMicro(value: unknown): number | null {
  // Accept non-negative provider-reported USD payout to six decimal places.
  // Avoid rounding each credited Coin event.
  if (typeof value !== "number" && typeof value !== "string") return null;
  const str = String(value);
  const m = /^(\d{1,5})(?:\.(\d{1,6}))?$/.exec(str);
  if (!m) return null;
  const n = Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(n) && n >= 0 && n <= 50_000_000 ? n : null;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_:.-]{1,128}$/.test(value);
}

async function verifySignature(secret: string, raw: Uint8Array, hex: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const signature = new Uint8Array(hex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["verify"],
  );
  return await crypto.subtle.verify("HMAC", key, signature, raw);
}

serve(async (req: Request) => {
  if (req.method !== "POST") return respond(405, "POST required");
  const secret = Deno.env.get("ADGEM_POSTBACK_KEY");
  const expectedAppId = Deno.env.get("ADGEM_APP_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !expectedAppId || !supabaseUrl || !serviceRoleKey) {
    console.error("AdGem webhook not configured");
    return respond(503, "temporarily unavailable");
  }

  const size = Number(req.headers.get("content-length") ?? "0");
  if (size > 65536) return respond(413, "body too large");
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    return respond(400, "invalid body");
  }
  if (raw.byteLength > 65536 || raw.byteLength === 0) return respond(400, "invalid body");

  const signature = req.headers.get("signature") ?? "";
  if (!await verifySignature(secret, raw, signature)) {
    return respond(403, "invalid signature");
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return respond(400, "invalid json");
  }
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return respond(400, "missing data");

  const requestId = event.request_id;
  const conversionId = data.conversion_id;
  const playerId = data.player_id;
  const appId = String(data.app_id ?? "");
  const kind = data.conversion_type;
  if (!validId(requestId) || !validId(conversionId) ||
      typeof playerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerId) ||
      appId !== expectedAppId) {
    return respond(400, "invalid event identifiers");
  }

  // Non-paying install tracking never gives Coins.
  if (kind === "install") return respond(200, "ok");
  if (kind !== "reward") return respond(400, "unknown conversion type");

  const payout = usdMicro(data.payout);
  if (payout === null) return respond(400, "invalid payout");
  if (payout === 0) return respond(200, "ok");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: applied, error } = await admin.rpc("apply_adgem_reward_postback_v1", {
    p_conversion_id: conversionId,
    p_request_id: requestId,
    p_user_id: playerId,
    p_app_id: appId,
    p_campaign_id: data.campaign_id == null ? null : String(data.campaign_id),
    p_goal_id: data.goal_id == null ? null : String(data.goal_id),
    p_amount_micro_usd: payout,
  });
  if (error || !applied?.accepted) {
    // Never log raw events, user details, callback headers or the secret.
    console.error("AdGem reward database error", error?.code ?? "not accepted");
    return respond(500, "processing error");
  }
  return respond(200, "ok");
});
