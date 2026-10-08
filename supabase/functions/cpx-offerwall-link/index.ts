// Authenticated, user-scoped CPX offerwall link issuer.
// The secret never enters the React bundle. No email/name is sent to CPX.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
function response(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers });
}
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response(200, {});
  if (req.method !== "POST") return response(405, { error: "Method not allowed" });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return response(401, { error: "Sign in required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cpxHash = Deno.env.get("CPX_APP_SECURITY_HASH");
  if (!supabaseUrl || !adminKey || !cpxHash) {
    return response(503, { error: "Surveys temporarily unavailable" });
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) return response(401, { error: "Invalid session" });

  const userId = data.user.id;
  // CPX documented scheme: md5(user-id + "-" + app secure hash).
  // The publisher must have CPX security-check hashing enabled.
  const signature = CryptoJS.MD5(`${userId}-${cpxHash}`).toString(CryptoJS.enc.Hex);
  const url = new URL("https://offers.cpx-research.com/index.php");
  url.searchParams.set("app_id", "37018");
  url.searchParams.set("ext_user_id", userId);
  url.searchParams.set("secure_hash", signature);
  return response(200, { url: url.toString(), rate_coins_per_usd: 15 });
});
