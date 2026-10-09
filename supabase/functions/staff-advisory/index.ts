import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

type QuoteBody = {
  action: 'quote'
  club_id: string
  staff_id: string
}

type ActivateBody = {
  action: 'activate'
  club_id: string
  staff_id: string
  idempotency_key: string
}

type SetPinsBody = {
  action: 'set_pins'
  club_id: string
  staff_ids: string[]
}

type RequestBody = QuoteBody | ActivateBody | SetPinsBody

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return response(405, { ok: false, message: 'Method Not Allowed' })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return response(401, { ok: false, message: 'Missing Authorization header.' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return response(500, {
        ok: false,
        message: 'Edge Function environment is missing Supabase config.',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return response(401, { ok: false, message: 'Invalid authenticated session.' })
    }

    const body = (await req.json()) as RequestBody

    if (!body?.action || !body.club_id) {
      return response(400, { ok: false, message: 'Missing action or club_id.' })
    }

    if (body.action === 'quote') {
      if (!body.staff_id) {
        return response(400, { ok: false, message: 'Missing staff_id.' })
      }

      const { data, error } = await supabase.rpc('staff_advisory_quote_secure_v1', {
        p_club_id: body.club_id,
        p_staff_id: body.staff_id,
      })

      if (error) {
        return response(400, { ok: false, message: error.message })
      }

      return response(200, { ok: true, quote: data })
    }

    if (body.action === 'activate') {
      if (!body.staff_id || !body.idempotency_key?.trim()) {
        return response(400, {
          ok: false,
          message: 'staff_id and idempotency_key are required.',
        })
      }

      const { data, error } = await supabase.rpc('staff_advisory_activate_secure_v1', {
        p_club_id: body.club_id,
        p_staff_id: body.staff_id,
        p_idempotency_key: body.idempotency_key.trim(),
      })

      if (error) {
        return response(400, { ok: false, message: error.message })
      }

      return response(200, { ok: true, activation: data })
    }

    if (body.action === 'set_pins') {
      if (!Array.isArray(body.staff_ids)) {
        return response(400, { ok: false, message: 'staff_ids must be an array.' })
      }

      if (body.staff_ids.length > 5) {
        return response(400, {
          ok: false,
          message: 'A maximum of five staff cards can be pinned.',
        })
      }

      const uniqueIds = Array.from(new Set(body.staff_ids))
      if (uniqueIds.length !== body.staff_ids.length) {
        return response(400, {
          ok: false,
          message: 'Duplicate staff IDs are not allowed.',
        })
      }

      const { error } = await supabase.rpc('staff_advisory_set_pins_v1', {
        p_club_id: body.club_id,
        p_staff_ids: uniqueIds,
      })

      if (error) {
        return response(400, { ok: false, message: error.message })
      }

      return response(200, { ok: true, staff_ids: uniqueIds })
    }

    return response(400, { ok: false, message: 'Unsupported Staff Advisory action.' })
  } catch (error) {
    return response(500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Unexpected Edge Function error.',
    })
  }
})
