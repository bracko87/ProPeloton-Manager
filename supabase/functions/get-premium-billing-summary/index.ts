// supabase/functions/get-premium-billing-summary/index.ts
//
// Returns Stripe-authoritative Premium subscription state and invoice history
// for the authenticated user. The local Premium tables remain responsible for
// gameplay entitlement and coin grants; Stripe remains authoritative for
// recurring billing state, cancellation and invoice/refund history.
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

function objectId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (
    typeof value === "object" &&
    "id" in (value as Record<string, unknown>)
  ) {
    const id = (value as Record<string, unknown>).id
    return typeof id === "string" ? id : null
  }
  return null
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return new Date(value * 1000).toISOString()
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = (subscription as any)?.items?.data?.[0] ?? null
  const start =
    item?.current_period_start ??
    (subscription as any)?.current_period_start ??
    null
  const end =
    item?.current_period_end ??
    (subscription as any)?.current_period_end ??
    null

  return {
    current_period_start: unixToIso(start),
    current_period_end: unixToIso(end),
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const anyInvoice = invoice as any

  if (
    anyInvoice?.parent?.type === "subscription_details"
  ) {
    const id = objectId(
      anyInvoice.parent.subscription_details?.subscription,
    )
    if (id) return id
  }

  const legacyId = objectId(anyInvoice?.subscription)
  if (legacyId) return legacyId

  for (const line of invoice.lines.data ?? []) {
    const anyLine = line as any

    const parentId = objectId(
      anyLine?.parent?.subscription_item_details?.subscription ??
        anyLine?.parent?.invoice_item_details?.subscription,
    )
    if (parentId) return parentId

    const lineId = objectId(anyLine?.subscription)
    if (lineId) return lineId
  }

  return null
}

function invoiceServicePeriod(invoice: Stripe.Invoice) {
  const line = invoice.lines.data?.[0]
  const start =
    line?.period?.start ??
    (invoice as any)?.period_start ??
    invoice.created
  const end =
    line?.period?.end ??
    (invoice as any)?.period_end ??
    invoice.created

  return {
    period_start: unixToIso(start),
    period_end: unixToIso(end),
  }
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

    let includeInvoices = false
    try {
      const body = await req.json()
      includeInvoices = body?.include_invoices === true
    } catch {
      // Empty body is valid.
    }

    const {
      data: localSubscription,
      error: localSubscriptionError,
    } = await supabaseUser
      .from("user_premium_subscriptions")
      .select(
        "stripe_customer_id, stripe_subscription_id, metadata",
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (localSubscriptionError) {
      console.error(
        "Failed loading local Premium billing identifiers:",
        localSubscriptionError,
      )
      return json(
        { error: "Could not load Premium billing profile" },
        500,
        origin,
      )
    }

    const customerId = String(
      localSubscription?.stripe_customer_id || "",
    ).trim()

    const subscriptionId = String(
      localSubscription?.stripe_subscription_id || "",
    ).trim()

    let subscription: Record<string, unknown> | null = null

    if (subscriptionId.startsWith("sub_")) {
      try {
        const stripeSubscription =
          await stripe.subscriptions.retrieve(subscriptionId)

        const period = subscriptionPeriod(stripeSubscription)

        subscription = {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          cancel_at_period_end:
            stripeSubscription.cancel_at_period_end,
          cancel_at: unixToIso(stripeSubscription.cancel_at),
          canceled_at: unixToIso(stripeSubscription.canceled_at),
          ended_at: unixToIso(stripeSubscription.ended_at),
          current_period_start: period.current_period_start,
          current_period_end: period.current_period_end,
        }
      } catch (error: any) {
        if (error?.code !== "resource_missing") throw error
      }
    }

    const invoices: Array<Record<string, unknown>> = []

    if (includeInvoices && customerId.startsWith("cus_")) {
      const localHistoryResult = await supabaseUser.rpc(
        "get_my_premium_invoice_history",
      )

      if (localHistoryResult.error) {
        console.warn(
          "Could not load local Premium invoice history:",
          localHistoryResult.error,
        )
      }

      const localByInvoiceId = new Map<string, any>()

      for (const row of localHistoryResult.data ?? []) {
        const id = String(row?.stripe_invoice_id || "").trim()
        if (id) localByInvoiceId.set(id, row)
      }

      const stripeInvoices = await stripe.invoices.list({
        customer: customerId,
        limit: 50,
      })

      for (const invoice of stripeInvoices.data) {
        const invoiceSubId = invoiceSubscriptionId(invoice)

        if (
          subscriptionId.startsWith("sub_") &&
          invoiceSubId &&
          invoiceSubId !== subscriptionId
        ) {
          continue
        }

        const localRow = localByInvoiceId.get(invoice.id)
        const servicePeriod = invoiceServicePeriod(invoice)
        const amountPaid = Number(invoice.amount_paid ?? 0)
        const credited =
          Number((invoice as any).pre_payment_credit_notes_amount ?? 0) +
          Number((invoice as any).post_payment_credit_notes_amount ?? 0)
        const paidAt =
          (invoice as any)?.status_transitions?.paid_at ??
          invoice.created

        invoices.push({
          stripe_invoice_id: invoice.id,
          plan_code: localRow?.plan_code ?? "premium_monthly",
          billing_reason: invoice.billing_reason ?? null,
          amount_paid_cents: amountPaid,
          currency: invoice.currency?.toUpperCase() ?? null,
          coins_granted: Number(localRow?.coins_granted ?? 0),
          period_start: servicePeriod.period_start,
          period_end: servicePeriod.period_end,
          processed_at: unixToIso(paidAt),
          status: invoice.status ?? null,
          credited_cents: credited,
          refunded:
            amountPaid > 0 &&
            credited >= amountPaid,
          hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        })
      }
    }

    const rawManualAccess =
      localSubscription?.metadata?.manual_test_access

    const manualAccess =
      rawManualAccess === true ||
      String(rawManualAccess ?? "").toLowerCase() === "true"

    return json(
      {
        subscription,
        invoices,
        has_billing_profile: customerId.startsWith("cus_"),
        manual_access: manualAccess,
      },
      200,
      origin,
    )
  } catch (error) {
    console.error("get-premium-billing-summary error:", error)
    return json({ error: "Server error" }, 500, origin)
  }
})
