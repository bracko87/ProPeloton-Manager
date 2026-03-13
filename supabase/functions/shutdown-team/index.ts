// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET")

// IMPORTANT for Edge/Deno: WebCrypto is async
const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Admin Supabase client (service role) to credit coins / complete referrals / create notifications
const supabaseAdmin = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
)

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function textResponse(
  body: string,
  status: number,
  origin: string | null,
): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}

async function getNotificationTypeId(code: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("notification_types")
    .select("id")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch notification type:", { code, error })
    return null
  }

  return data?.id ?? null
}

async function createUserNotification(params: {
  userId: string
  typeCode: string
  title: string
  message: string
  actionUrl?: string | null
  payload: Record<string, unknown>
}): Promise<void> {
  const { userId, typeCode, title, message, actionUrl, payload } = params

  const typeId = await getNotificationTypeId(typeCode)
  if (!typeId) {
    console.warn("Notification type not found or inactive; skipping", {
      typeCode,
      userId,
    })
    return
  }

  const systemKey =
    typeof payload.system_key === "string" ? payload.system_key : null

  let notificationId: number | null = null

  // Best-effort dedupe by notification payload system_key
  if (systemKey) {
    const { data: existingNotification, error: existingError } =
      await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("type_id", typeId)
        .contains("payload_json", { system_key: systemKey })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (existingError) {
      console.error("Failed checking existing notification:", {
        typeCode,
        userId,
        systemKey,
        error: existingError,
      })
    } else if (existingNotification?.id) {
      notificationId = existingNotification.id
    }
  }

  if (!notificationId) {
    const { data: insertedNotification, error: insertNotificationError } =
      await supabaseAdmin
        .from("notifications")
        .insert({
          type_id: typeId,
          title,
          message,
          source: "game",
          created_by_user_id: null,
          action_url: actionUrl ?? null,
          payload_json: payload,
          expires_at: null,
        })
        .select("id")
        .single()

    if (insertNotificationError) {
      console.error("Failed creating notification:", {
        typeCode,
        userId,
        error: insertNotificationError,
      })
      return
    }

    notificationId = insertedNotification.id
  }

  const { error: linkError } = await supabaseAdmin
    .from("user_notifications")
    .upsert(
      {
        user_id: userId,
        notification_id: notificationId,
        status: "unread",
        read_at: null,
        deleted_at: null,
      },
      {
        onConflict: "user_id,notification_id",
        ignoreDuplicates: true,
      },
    )

  if (linkError) {
    console.error("Failed linking notification to user:", {
      typeCode,
      userId,
      notificationId,
      error: linkError,
    })
  }
}

async function creditPurchaseAndCompleteReferral(params: {
  session: Stripe.Checkout.Session
  eventId: string
  origin: string | null
}): Promise<Response | null> {
  const { session, eventId, origin } = params

  const userId = session.metadata?.user_id
  const coins = Number(session.metadata?.coins || 0)
  const packageCode = session.metadata?.package_code || null
  const currency = session.currency?.toUpperCase() ?? null
  const amountTotal = session.amount_total ?? null

  if (!userId || !Number.isFinite(coins) || coins <= 0) {
    console.warn("Missing or invalid metadata; skipping coin credit", {
      eventId,
      sessionId: session.id,
      userId,
      coins,
      packageCode,
    })
    return textResponse("ok", 200, origin)
  }

  const systemKey = `stripe_session_${session.id}`

  // 1) Credit purchased coins (must be idempotent on system_key in DB/RPC)
  const { error: creditError } = await supabaseAdmin.rpc("apply_coin_delta", {
    p_user_id: userId,
    p_delta: coins,
    p_reason: "purchase",
    p_payload_json: {
      system_key: systemKey,
      category: "purchase",
      provider: "stripe",
      package_code: packageCode,
      checkout_session_id: session.id,
      event_id: eventId,
      payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      currency,
      amount_total: amountTotal,
    },
  })

  if (creditError) {
    console.error("apply_coin_delta error:", creditError, {
      eventId,
      sessionId: session.id,
      userId,
      coins,
      packageCode,
    })

    // Return 500 so Stripe retries.
    // Safe if apply_coin_delta is idempotent by system_key.
    return textResponse("Coin credit failed", 500, origin)
  }

  // 1b) Create purchase confirmation notification
  await createUserNotification({
    userId,
    typeCode: "COIN_PURCHASE_COMPLETED",
    title: "Coins added to your account",
    message: `Thank you very much for your purchase. ${coins} coins have been added to your balance.`,
    actionUrl: "/dashboard/pro",
    payload: {
      system_key: `coin_purchase_notification_${session.id}_${userId}`,
      category: "coin_purchase_completed",
      provider: "stripe",
      coins,
      package_code: packageCode,
      checkout_session_id: session.id,
      event_id: eventId,
      payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      currency,
      amount_total: amountTotal,
    },
  })

  // 2) Try to complete pending referral after first successful purchase
  const { data: referralCompleted, error: referralError } =
    await supabaseAdmin.rpc("try_complete_referral_after_purchase", {
      p_user_id: userId,
      p_purchase_system_key: systemKey,
    })

  if (referralError) {
    console.error("try_complete_referral_after_purchase error:", referralError, {
      eventId,
      sessionId: session.id,
      userId,
      systemKey,
    })

    // Return 500 so Stripe retries.
    // Safe if both purchase credit + referral reward are idempotent.
    return textResponse("Referral completion failed", 500, origin)
  }

  console.log("Stripe purchase processed", {
    eventId,
    sessionId: session.id,
    userId,
    coins,
    packageCode,
    referralCompleted,
  })

  return null
}

serve(async (req) => {
  const origin = req.headers.get("origin")

  try {
    // CORS preflight (Stripe won’t use this, but safe)
    if (req.method === "OPTIONS") {
      return textResponse("ok", 200, origin)
    }

    if (req.method !== "POST") {
      return textResponse("Method Not Allowed", 405, origin)
    }

    const sig =
      req.headers.get("stripe-signature") ??
      req.headers.get("Stripe-Signature")

    if (!sig) {
      return textResponse("Missing stripe-signature", 400, origin)
    }

    // IMPORTANT: Use raw body as TEXT (Stripe uses exact raw payload)
    const rawBody = await req.text()

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        sig,
        webhookSecret,
        undefined,
        cryptoProvider,
      )
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      return textResponse("Invalid signature", 400, origin)
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session

        // For one-time purchases, only credit immediately if Stripe says it's paid.
        // If payment is delayed, wait for async_payment_succeeded.
        if (session.payment_status !== "paid") {
          console.log("checkout.session.completed but not paid yet; skipping", {
            eventId: event.id,
            sessionId: session.id,
            payment_status: session.payment_status,
          })
          break
        }

        const response = await creditPurchaseAndCompleteReferral({
          session,
          eventId: event.id,
          origin,
        })
        if (response) return response
        break
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session

        const response = await creditPurchaseAndCompleteReferral({
          session,
          eventId: event.id,
          origin,
        })
        if (response) return response
        break
      }

      default: {
        console.log("Unhandled Stripe event type", {
          type: event.type,
          eventId: event.id,
        })
      }
    }

    return textResponse("ok", 200, origin)
  } catch (e) {
    console.error("Webhook error:", e)
    return textResponse("Webhook error", 500, origin)
  }
})
