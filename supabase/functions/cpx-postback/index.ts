// CPX Research App 37018 survey postback.
// Public provider callback (verify_jwt=false): authentication is the
// provider's MD5(trans_id + "-" + CPX_APP_SECURITY_HASH) signature.
// Never expose the app hash in the frontend, GitHub, or postback URL.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = 37018;
const MAX_MICRO_USD = 50_000_000;

function reply(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function equalHash(a: string, b: string): boolean {
  if (a.length !== 32 || b.length !== 32) return false;
  let mismatches = 0;
  for (let i = 0; i < 32; i++) {
    mismatches |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatches === 0;
}

function microUsd(input: string): number | null {
  // Restrict to six fractional decimal places and calculate exactly.
  // Floats must not silently round earned Coins.
  const match = /^(\d{1,5})(?:\.(\d{1,6}))?$/.exec(input);
  if (!match) return null;
  const total =
    Number(match[1]) * 1_000_000 +
    Number((match[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(total) && total <= MAX_MICRO_USD ? total : null;
}

serve(async (req) => {
  if (req.method !== "GET") return reply(405, "method not allowed");
  const secret = Deno.env.get("CPX_APP_SECURITY_HASH");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) {
    console.error("CPX callback unavailable: missing server configuration");
    return reply(503, "temporarily unavailable");
  }

  const query = new URL(req.url).searchParams;
  const transId = query.get("trans_id") ?? "";
  const signature = (query.get("hash") ?? "").toLowerCase();
  const userId = query.get("user_id") ?? "";
  const status = Number(query.get("status"));
  const rewardType = (query.get("type") ?? "").toLowerCase();

  if (!/^[A-Za-z0-9_:.\-]{1,128}$/.test(transId) ||
      !/^[0-9a-f]{32}$/.test(signature) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      ![1, 2].includes(status) ||
      !["complete", "out", "bonus"].includes(rewardType)) {
    return reply(400, "invalid parameters");
  }

  const expected = CryptoJS.MD5(`${transId}-${secret}`).toString(CryptoJS.enc.Hex);
  if (!equalHash(signature, expected)) return reply(403, "invalid signature");

  const value = microUsd(query.get("amount_usd") ?? (status === 2 ? "0" : ""));
  if (value === null) return reply(400, "invalid amount_usd");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc("apply_cpx_reward_postback_v1", {
    p_trans_id: transId,
    p_user_id: userId,
    p_status: status,
    p_reward_type: rewardType,
    p_amount_micro_usd: value,
  });

  if (error) {
    // Do not log callback URLs, which contain per-transaction signatures.
    console.error("CPX postback DB failed", { code: error.code, message: error.message });
    return reply(500, "processing error");
  }
  if (!data?.accepted) return reply(500, "processing error");
  return reply(200, "ok");
});
