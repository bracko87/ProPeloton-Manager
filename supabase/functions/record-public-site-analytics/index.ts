import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

function cors(origin: string | null): Record<string, string> {
  const allowed =
    origin === "https://propelotonmanager.com" ||
    origin === "https://www.propelotonmanager.com"

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://propelotonmanager.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

serve(async request => {
  const origin = request.headers.get("origin")

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) })
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: cors(origin),
    })
  }

  try {
    const body = await request.json()

    const { data, error } = await supabase.rpc(
      "record_site_analytics_event_v1",
      {
        p_visitor_id: body?.visitor_id ?? null,
        p_session_id: body?.session_id ?? null,
        p_path: body?.path ?? "/",
        p_country_code: body?.country_code ?? "XX",
        p_device_type: body?.device_type ?? "desktop",
        p_referrer_host: body?.referrer_host ?? null,
        p_hostname: body?.hostname ?? null,
      },
    )

    if (error) {
      console.warn("Static analytics RPC failed:", error.message)
      return new Response(JSON.stringify({ recorded: false }), {
        status: 200,
        headers: {
          ...cors(origin),
          "content-type": "application/json; charset=utf-8",
        },
      })
    }

    return new Response(JSON.stringify({ recorded: data === true }), {
      status: 200,
      headers: {
        ...cors(origin),
        "content-type": "application/json; charset=utf-8",
      },
    })
  } catch (error) {
    console.warn("Static analytics request failed:", error)

    return new Response(JSON.stringify({ recorded: false }), {
      status: 200,
      headers: {
        ...cors(origin),
        "content-type": "application/json; charset=utf-8",
      },
    })
  }
})
