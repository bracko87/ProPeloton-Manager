// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
})

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!

// Admin Supabase client (service role) to credit coins
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

    const sig = req.headers.get("stripe-signature")
    if (!sig) return new Response("Missing stripe-signature", { status: 400 })

    // IMPORTANT: Use raw body for signature verification
    const rawBody = await req.text()

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      return new Response("Invalid signature", { status: 400 })
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.metadata?.user_id
      const coins = Number(session.metadata?.coins || 0)
      const packageCode = session.metadata?.package_code || null

      if (!userId || !Number.isFinite(coins) || coins <= 0) {
        console.warn("Missing metadata; skipping coin credit")
        return new Response("ok", { status: 200 })
      }

      const systemKey = `stripe_session_${session.id}`

      // Credit coins (idempotent thanks to system_key unique index)
      const { error } = await supabaseAdmin.rpc("apply_coin_delta", {
        p_user_id: userId,
        p_delta: coins,
        p_reason: "purchase",
        p_payload_json: {
          system_key: systemKey,
          category: "purchase",
          provider: "stripe",
          package_code: packageCode,
          checkout_session_id: session.id,
        },
      })

      if (error) {
        // If duplicate webhook: unique_violation may happen; treat as ok.
        console.error("apply_coin_delta error:", error)
      }
    }

    return new Response("ok", { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response("Webhook error", { status: 400 })
  }
})