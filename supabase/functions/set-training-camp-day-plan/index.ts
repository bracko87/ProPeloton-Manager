import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function normalizeIntensity(value: unknown): string {
  const raw = String(value ?? 'normal').trim().toLowerCase()

  if (raw === 'off' || raw === 'day_off' || raw === 'day-off' || raw === 'rest') return 'day_off'
  if (raw === 'light' || raw === 'light_training') return 'light'
  if (raw === 'hard' || raw === 'hard_intensity') return 'hard'

  return 'normal'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'missing_auth_header' }),
        { status: 200, headers: corsHeaders },
      )
    }

    const body = await req.json().catch(() => null)

    const bookingId = body?.booking_id ?? body?.p_booking_id ?? body?.camp_id ?? null
    const plans = body?.plans ?? body?.p_plans ?? []

    if (!bookingId) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'missing_booking_id' }),
        { status: 200, headers: corsHeaders },
      )
    }

    if (!Array.isArray(plans)) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'plans_must_be_array' }),
        { status: 200, headers: corsHeaders },
      )
    }

    const normalizedPlans = plans.map((plan) => ({
      rider_id: plan.rider_id ?? plan.riderId,
      plan_date: plan.plan_date ?? plan.activity_date ?? plan.game_date ?? plan.date,
      intensity: normalizeIntensity(plan.intensity ?? plan.training_intensity),
    }))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'missing_supabase_environment' }),
        { status: 200, headers: corsHeaders },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data, error } = await supabase.rpc('save_training_camp_day_training_plans', {
      p_booking_id: bookingId,
      p_plans: normalizedPlans,
    })

    if (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    return new Response(
      JSON.stringify(data ?? { ok: true }),
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: error instanceof Error ? error.message : 'unknown_edge_function_error',
      }),
      { status: 200, headers: corsHeaders },
    )
  }
})