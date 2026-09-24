import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ ok: false, error: "System Health email service is not configured." }, 500);
  }

  const secret = req.headers.get("x-system-health-secret") ?? "";
  if (!secret) return json({ ok: false, error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: valid, error: authError } = await admin.rpc(
    "system_health_validate_alert_secret_v1",
    { p_secret: secret },
  );
  if (authError || valid !== true) return json({ ok: false, error: "Unauthorized" }, 401);

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_system_alert_email_outbox_v1",
    { p_limit: 20 },
  );
  if (claimError) return json({ ok: false, error: claimError.message }, 500);

  const jobs = Array.isArray(claimed) ? claimed : [];
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const from =
        Deno.env.get("CONTACT_FROM_EMAIL") ??
        "ProPeloton Manager <no-reply@propelotonmanager.com>";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `system-health-${job.id}`,
        },
        body: JSON.stringify({
          from,
          to: [job.recipient_email],
          subject: job.subject,
          text: job.text_body,
          html: job.html_body,
          tags: [{ name: "category", value: "system-health" }],
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : `Resend returned HTTP ${response.status}`,
        );
      }

      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("system_alert_email_outbox")
        .update({
          status: "sent",
          sent_at: now,
          provider_message_id: body?.id ?? null,
          last_error: null,
          updated_at: now,
        })
        .eq("id", job.id);

      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      failed += 1;
      const attempts = Number(job.attempts ?? 1);
      const delayMinutes = Math.min(Math.max(attempts, 1) * 10, 120);
      await admin
        .from("system_alert_email_outbox")
        .update({
          status: "failed",
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }

  return json({ ok: true, claimed: jobs.length, sent, failed });
});