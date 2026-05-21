// supabase/functions/start-infrastructure-job/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  club_id?: string
  item_type?: 'facility' | 'asset'
  target_key?: string
  quantity?: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Missing Supabase environment variables' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''

    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const body = (await req.json()) as Body

    if (!body.club_id) {
      return jsonResponse({ error: 'club_id is required' }, 400)
    }

    if (body.item_type !== 'facility' && body.item_type !== 'asset') {
      return jsonResponse({ error: 'item_type must be facility or asset' }, 400)
    }

    if (!body.target_key) {
      return jsonResponse({ error: 'target_key is required' }, 400)
    }

    if (body.item_type === 'facility') {
      const { data, error } = await supabase.rpc('start_club_facility_upgrade', {
        p_club_id: body.club_id,
        p_facility: body.target_key,
      })

      if (error) {
        return jsonResponse({ error: error.message, details: error }, 400)
      }

      return jsonResponse({ ok: true, job: data }, 200)
    }

    const quantity =
      Number.isFinite(body.quantity) && Number(body.quantity) > 0
        ? Math.floor(Number(body.quantity))
        : 1

    const { data, error } = await supabase.rpc('start_club_asset_delivery', {
      p_club_id: body.club_id,
      p_asset: body.target_key,
      p_quantity: quantity,
    })

    if (error) {
      return jsonResponse({ error: error.message, details: error }, 400)
    }

    return jsonResponse({ ok: true, job: data }, 200)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected infrastructure action error'

    return jsonResponse({ error: message }, 500)
  }
})