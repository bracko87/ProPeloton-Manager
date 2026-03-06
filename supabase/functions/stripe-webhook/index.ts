import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim()
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

    const sig = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature")
    if (!sig) return new Response("Missing stripe-signature", { status: 400 })

    if (!webhookSecret.startsWith("whsec_")) {
      console.error("STRIPE_WEBHOOK_SECRET missing or invalid (does not start with whsec_)")
      return new Response("Webhook secret missing", { status: 500 })
    }

    // ✅ Use raw bytes (most robust)
    const raw = new Uint8Array(await req.arrayBuffer())

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        raw,
        sig,
        webhookSecret,
        undefined,
        cryptoProvider
      )
    } catch (err) {
      // Helpful debug without leaking secrets:
      console.error("Invalid signature. Secret length:", webhookSecret.length, "Sig length:", sig.length)
      console.error("Webhook signature verification failed:", err)
      return new Response("Invalid signature", { status: 400 })
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.metadata?.user_id
      const coins = Number(session.metadata?.coins || 0)
      const packageCode = session.metadata?.package_code || null

      if (!userId || !Number.isFinite(coins) || coins <= 0) {
        console.warn("Missing metadata; skipping coin credit", { userId, coins, packageCode })
        return new Response("ok", { status: 200 })
      }

      const systemKey = `stripe_session_${session.id}`

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
          event_id: event.id,
        },
      })

      if (error) {
        console.error("apply_coin_delta error:", error)
        return new Response("Coin credit failed", { status: 500 })
      }
    }

    return new Response("ok", { status: 200 })
  } catch (e) {
    console.error("Webhook error:", e)
    return new Response("Webhook error", { status: 500 })
  }
})