import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BookingBody = {
  club_id: string
  camp_id: string
  start_date: string
  days: number
  rider_ids: string[]
  staff_ids?: string[]
  idempotency_key: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = (await req.json()) as BookingBody

    if (!body.club_id || !body.camp_id || !body.start_date || !body.days) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Missing required booking fields.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!Array.isArray(body.rider_ids) || body.rider_ids.length < 5) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Minimum 5 riders are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Edge Function environment is missing Supabase config.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data, error } = await supabase.rpc('finance_book_training_camp_debug_v2', {
      p_club_id: body.club_id,
      p_camp_id: body.camp_id,
      p_start_date: body.start_date,
      p_days: body.days,
      p_rider_ids: body.rider_ids,
      p_staff_ids: body.staff_ids ?? [],
      p_idempotency_key: body.idempotency_key,
    })

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, message: error.message, details: error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = data as { ok?: boolean; message?: string } | null

    if (!result?.ok) {
      return new Response(
        JSON.stringify(result ?? { ok: false, message: 'Training camp booking failed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : 'Unexpected Edge Function error.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})