import { createClient } from 'npm:@supabase/supabase-js@2'

function buildCorsHeaders(origin: string | null) {
  const allowOrigin = origin ?? '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID()
  const origin = req.headers.get('Origin')
  const corsHeaders = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'X-Request-Id': requestId,
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        error: 'Method not allowed',
        details: 'Only POST and OPTIONS are supported.',
        requestId,
      },
      405,
      corsHeaders,
      { 'X-Request-Id': requestId }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Missing function env vars',
          details: 'SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are required.',
          requestId,
        },
        500,
        corsHeaders,
        { 'X-Request-Id': requestId }
      )
    }

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim()

    if (!bearerToken) {
      return jsonResponse(
        {
          error: 'Missing bearer token',
          requestId,
        },
        401,
        corsHeaders,
        { 'X-Request-Id': requestId }
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    })

    const { data: userData, error: userErr } = await userClient.auth.getUser()

    if (userErr || !userData?.user) {
      return jsonResponse(
        {
          error: 'Unauthorized',
          details: userErr?.message ?? 'No authenticated user found.',
          requestId,
        },
        401,
        corsHeaders,
        { 'X-Request-Id': requestId }
      )
    }

    const userId = userData.user.id
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: rpcError } = await adminClient.rpc('delete_my_game_data', {
      p_user_id: userId,
    })

    if (rpcError) {
      return jsonResponse(
        {
          error: 'Failed to delete game data',
          details: rpcError.message,
          requestId,
        },
        500,
        corsHeaders,
        { 'X-Request-Id': requestId }
      )
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      return jsonResponse(
        {
          error: 'Failed to delete auth user',
          details: deleteUserError.message,
          requestId,
        },
        500,
        corsHeaders,
        { 'X-Request-Id': requestId }
      )
    }

    return jsonResponse(
      {
        ok: true,
        requestId,
      },
      200,
      corsHeaders,
      { 'X-Request-Id': requestId }
    )
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)

    return jsonResponse(
      {
        error: 'Unexpected server error',
        details: errorMessage,
        requestId,
      },
      500,
      corsHeaders,
      { 'X-Request-Id': requestId }
    )
  }
})