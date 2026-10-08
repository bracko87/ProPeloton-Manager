// supabase/functions/create-premium-checkout/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import Stripe from "npm:stripe@22"

function requireEnv(name: string): string {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }

  return value
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"))

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

function blocksNewSubscription(status: string | null): boolean {
  return [
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "incomplete",
    "paused",
  ].includes(status ?? "")
}

serve(async req => {
  const origin = req.headers.get("origin")

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders(origin),
      })
    }

    if (req.method !== "POST") {
      return json(
        { error: "Method Not Allowed" },
        405,
        origin,
      )
    }

    const authHeader = req.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        { error: "Missing Authorization Bearer token" },
        401,
        origin,
      )
    }

    const token = authHeader
      .replace("Bearer ", "")
      .trim()

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
    } = await supabaseUser.auth.getUser(token)

    if (userError || !user) {
      console.error(
        "Failed authenticating Premium checkout user:",
        userError,
      )

      return json(
        { error: "Invalid session token" },
        401,
        origin,
      )
    }

    const body = await req
      .json()
      .catch(() => ({}))

    const planCode = String(
      body.plan_code || "premium_monthly",
    ).trim()

    if (!["premium_monthly", "premium_quarterly", "premium_yearly"].includes(planCode)) {
      return json(
        { error: "Unsupported Premium plan" },
        400,
        origin,
      )
    }

    const {
      data: plan,
      error: planError,
    } = await supabaseUser
      .from("premium_plans")
      .select(
        [
          "code",
          "name",
          "price_cents",
          "currency",
          "interval_unit",
          "interval_count",
          "coins_per_paid_invoice",
          "provider_product_id",
          "provider_price_id",
          "active",
        ].join(","),
      )
      .eq("code", planCode)
      .eq("active", true)
      .maybeSingle()

    if (planError) {
      console.error(
        "Failed loading Premium plan:",
        planError,
      )

      return json(
        { error: "Could not load Premium plan" },
        500,
        origin,
      )
    }

    if (!plan) {
      return json(
        { error: "Premium plan is not available" },
        404,
        origin,
      )
    }

    const priceId = String(
      plan.provider_price_id || "",
    ).trim()

    const productId = String(
      plan.provider_product_id || "",
    ).trim()

    if (
      !priceId.startsWith("price_") ||
      priceId.includes("REPLACE_ME") ||
      !productId.startsWith("prod_") ||
      productId.includes("REPLACE_ME")
    ) {
      return json(
        {
          error:
            "Premium checkout is temporarily unavailable because Stripe configuration is incomplete.",
        },
        503,
        origin,
      )
    }

    const stripePrice = await stripe.prices.retrieve(
      priceId,
    )

    const stripeProductId =
      typeof stripePrice.product === "string"
        ? stripePrice.product
        : stripePrice.product.id

    const priceMatchesPlan =
      stripePrice.active &&
      stripePrice.type === "recurring" &&
      stripePrice.unit_amount ===
        Number(plan.price_cents) &&
      stripePrice.currency.toLowerCase() ===
        String(plan.currency).toLowerCase() &&
      stripePrice.recurring?.interval ===
        plan.interval_unit &&
      stripePrice.recurring?.interval_count ===
        Number(plan.interval_count) &&
      stripeProductId === productId

    if (!priceMatchesPlan) {
      console.error(
        "Stripe Premium Price mismatch",
        {
          plan,
          stripePrice: {
            id: stripePrice.id,
            active: stripePrice.active,
            type: stripePrice.type,
            unit_amount: stripePrice.unit_amount,
            currency: stripePrice.currency,
            recurring: stripePrice.recurring,
            product: stripeProductId,
          },
        },
      )

      return json(
        {
          error:
            "Premium checkout is temporarily unavailable because the Stripe Price does not match the configured plan.",
        },
        503,
        origin,
      )
    }

    const {
      data: existingSubscription,
      error: subscriptionError,
    } = await supabaseUser
      .from("user_premium_subscriptions")
      .select(
        [
          "stripe_customer_id",
          "stripe_subscription_id",
          "stripe_status",
          "access_until",
          "cancel_at_period_end",
        ].join(","),
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error(
        "Failed checking existing Premium subscription:",
        subscriptionError,
      )

      return json(
        { error: "Could not verify Premium status" },
        500,
        origin,
      )
    }

    const accessUntilMs =
      existingSubscription?.access_until
        ? Date.parse(
            existingSubscription.access_until,
          )
        : Number.NaN

    const hasPaidAccess =
      Number.isFinite(accessUntilMs) &&
      accessUntilMs > Date.now()

    if (
      hasPaidAccess ||
      blocksNewSubscription(
        existingSubscription?.stripe_status ?? null,
      )
    ) {
      return json(
        {
          error:
            "A Premium subscription already exists for this account.",
          code:
            "PREMIUM_SUBSCRIPTION_ALREADY_EXISTS",
          stripe_status:
            existingSubscription?.stripe_status ??
            null,
          access_until:
            existingSubscription?.access_until ??
            null,
          cancel_at_period_end:
            existingSubscription
              ?.cancel_at_period_end ?? false,
        },
        409,
        origin,
      )
    }

    const metadata: Record<string, string> = {
      purchase_kind:
        "premium_subscription",
      user_id: user.id,
      plan_code: plan.code,
    }

    const params:
      Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",

        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],

        success_url:
          `${SITE_URL}/#/dashboard/pro` +
          "?premium=success" +
          "&session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          `${SITE_URL}/#/dashboard/pro` +
          "?premium=cancel",

        client_reference_id: user.id,

        metadata,

        subscription_data: {
          metadata,
        },

        submit_type: "subscribe",

        billing_address_collection: "auto",
      }

    const existingCustomerId = String(
      existingSubscription
        ?.stripe_customer_id || "",
    ).trim()

    if (
      existingCustomerId.startsWith("cus_")
    ) {
      params.customer =
        existingCustomerId
    } else if (user.email) {
      params.customer_email =
        user.email
    }

    const fiveMinuteBucket =
      Math.floor(
        Date.now() /
          (5 * 60 * 1000),
      )

    const session =
      await stripe.checkout.sessions.create(
        params,
        {
          idempotencyKey:
            `premium_checkout_` +
            `${user.id}_` +
            `${plan.code}_` +
            `${fiveMinuteBucket}`,
        },
      )

    if (!session.url) {
      console.error(
        "Stripe Checkout Session has no URL:",
        {
          sessionId: session.id,
          status: session.status,
        },
      )

      return json(
        {
          error:
            "Stripe did not return a Checkout URL",
        },
        502,
        origin,
      )
    }

    return json(
      {
        url: session.url,
        session_id: session.id,
      },
      200,
      origin,
    )
  } catch (error) {
    console.error(
      "create-premium-checkout error:",
      error,
    )

    const message =
      error instanceof Error
        ? error.message
        : "Unknown server error"

    return json(
      {
        error: "Server error",
        details: message,
      },
      500,
      origin,
    )
  }
})