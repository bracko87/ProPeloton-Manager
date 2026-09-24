import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_TOKEN_HASHES = new Set([
  "8d7261df7a1a8d3556231e6de7ce652da30d1e8ff9b7e20ef1f9d7960ae81641",
  "500848d07c96bb8677032f5927ec677b7cb7f870f0a28f8b2ff08244c5e3ae6d",
]);

const FROM = "Tennis Legacy <no-reply@propelotonmanager.com>";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return json({ ok: false, error: "Relay email provider is not configured." }, 500);

  const token = req.headers.get("x-tennis-legacy-relay-token") ?? "";
  if (!token || !ALLOWED_TOKEN_HASHES.has(await sha256Hex(token))) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  const to = Array.isArray(body.to)
    ? body.to.filter((v): v is string => typeof v === "string" && v.length > 3)
    : [];
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const html = typeof body.html === "string" ? body.html : undefined;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 256) : undefined;

  if (to.length < 1 || to.length > 5 || !subject || !text) {
    return json({ ok: false, error: "Invalid email payload." }, 400);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: FROM,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        tags: [{ name: "source", value: "tennis-legacy" }],
      }),
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Email network error." },
      502,
    );
  }

  const providerBody = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    return json(
      {
        ok: false,
        error:
          providerBody && typeof providerBody === "object" && "message" in providerBody
            ? String(providerBody.message)
            : `Email provider returned HTTP ${providerResponse.status}`,
      },
      502,
    );
  }

  return json({
    ok: true,
    id:
      providerBody && typeof providerBody === "object" && "id" in providerBody
        ? providerBody.id
        : null,
  });
});