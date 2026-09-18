// supabase/functions/create-premium-portal/index.ts
//
// Creates Stripe Customer Portal sessions for authenticated Premium users.
// Supports both the normal billing portal and a direct subscription-cancel flow.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
})

const SITE_URL = (
  Deno.env.get("SITE_URL") || "http://localhost:5173"
).replace(/\/+$/, "")

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function json(
  body: unknown,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

serve(async req => {
  const origin = req.headers.get("origin")

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(origin) })
    }

    if (req.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405, origin)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        { error: "Missing Authorization Bearer token" },
        401,
        origin,
      )
    }

    const token = authHeader.replace("Bearer ", "").trim()

    const supabaseUser = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return json({ error: "Invalid session token" }, 401, origin)
    }

    let requestedFlow = "manage"

    try {
      const body = await req.json()
      if (body?.flow === "cancel") requestedFlow = "cancel"
    } catch {
      // Empty body is valid for the normal billing portal.
    }

    const {
      data: subscription,
      error: subscriptionError,
    } = await supabaseUser
      .from("user_premium_subscriptions")
      .select(
        "stripe_customer_id, stripe_subscription_id, stripe_status, access_until, cancel_at_period_end",
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error(
        "Failed loading Premium subscription for portal:",
        subscriptionError,
      )
      return json(
        { error: "Could not load Premium subscription" },
        500,
        origin,
      )
    }

    const customerId = String(
      subscription?.stripe_customer_id || "",
    ).trim()

    if (!customerId.startsWith("cus_")) {
      return json(
        {
          error: "No Stripe billing profile exists for this account.",
          code: "PREMIUM_CUSTOMER_NOT_FOUND",
        },
        409,
        origin,
      )
    }

    const returnUrl =
      `${SITE_URL}/#/dashboard/pro?premium=portal_return`

    const portalParams: any = {
      customer: customerId,
      return_url: returnUrl,
    }

    if (requestedFlow === "cancel") {
      const subscriptionId = String(
        subscription?.stripe_subscription_id || "",
      ).trim()

      if (!subscriptionId.startsWith("sub_")) {
        return json(
          {
            error: "No Stripe subscription exists for this account.",
            code: "PREMIUM_SUBSCRIPTION_NOT_FOUND",
          },
          409,
          origin,
        )
      }

      const stripeSubscription =
        await stripe.subscriptions.retrieve(subscriptionId)

      if (
        stripeSubscription.status === "canceled" ||
        stripeSubscription.cancel_at_period_end
      ) {
        return json(
          {
            error:
              stripeSubscription.cancel_at_period_end
                ? "This Premium subscription is already scheduled to cancel."
                : "This Premium subscription is already canceled.",
            code: "PREMIUM_SUBSCRIPTION_ALREADY_CANCELED",
          },
          409,
          origin,
        )
      }

      if (
        !["trialing", "active", "past_due"].includes(
          stripeSubscription.status,
        )
      ) {
        return json(
          {
            error:
              "This Premium subscription cannot be canceled in its current billing state.",
            code: "PREMIUM_SUBSCRIPTION_NOT_CANCELABLE",
          },
          409,
          origin,
        )
      }

      portalParams.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: subscriptionId,
        },
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: returnUrl,
          },
        },
      }
    }

    const portalSession =
      await stripe.billingPortal.sessions.create(portalParams)

    if (!portalSession.url) {
      return json(
        { error: "Stripe did not return a portal URL" },
        502,
        origin,
      )
    }

    return json(
      {
        url: portalSession.url,
        flow: requestedFlow,
      },
      200,
      origin,
    )
  } catch (error) {
    console.error("create-premium-portal error:", error)
    return json({ error: "Server error" }, 500, origin)
  }
})
