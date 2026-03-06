// supabase/functions/create-coin-checkout/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
})

const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173"

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders() })
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() })
    }

    // Supabase injects the user's JWT into Authorization header automatically
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Missing Authorization" }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!

    // Use the caller JWT to identify the user (safe)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !userRes?.user) return json({ error: "Invalid session" }, 401)
    const userId = userRes.user.id

    const body = await req.json().catch(() => ({}))
    const packageCode = String(body.package_code || "")
    if (!packageCode) return json({ error: "package_code is required" }, 400)

    // Look up package from DB (source of truth)
    const { data: pkg, error: pkgErr } = await supabaseUser
      .from("coin_packages")
      .select("code, coins, price_cents, currency, provider_price_id, active")
      .eq("code", packageCode)
      .eq("active", true)
      .single()

    if (pkgErr || !pkg) return json({ error: "Package not found" }, 404)

    const lineItem = pkg.provider_price_id
      ? { price: pkg.provider_price_id, quantity: 1 }
      : {
          price_data: {
            currency: String(pkg.currency || "EUR").toLowerCase(),
            unit_amount: Number(pkg.price_cents),
            product_data: {
              name: `◎ ${pkg.coins} Coins`,
              metadata: {
                package_code: pkg.code,
                coins: String(pkg.coins),
              },
            },
          },
          quantity: 1,
        }

    // HashRouter success/cancel routes
    const successUrl = `${SITE_URL}/#/dashboard/overview?purchase=success`
    const cancelUrl = `${SITE_URL}/#/dashboard/pro?purchase=cancel`

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        package_code: pkg.code,
        coins: String(pkg.coins),
      },
    })

    return json({ url: session.url }, 200)
  } catch (e) {
    console.error(e)
    return json({ error: "Server error" }, 500)
  }
})

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  })
}