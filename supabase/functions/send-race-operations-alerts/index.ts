/**
 * send-race-operations-alerts
 * Sends a single aggregated administrator email for new Race Operations incidents.
 * Invoked by pg_cron through pg_net with a database-vault shared secret.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

type RaceOpsConfig = {
  alert_email: string
  email_enabled: boolean
  email_delay_minutes: number
}

type RaceOpsIncident = {
  id: string
  race_name: string
  stage_number: number
  issue_key: string
  severity: string
  message: string
  stage_start_game_at: string
  detected_game_at: string
  detected_at: string
  email_attempt_count: number
  metadata: Record<string, unknown> | null
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatGameDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const season = Math.max(1, date.getUTCFullYear() - 1999)
  const month = date.toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })

  return `Season ${season} · ${String(date.getUTCDate()).padStart(2, '0')} ${month} · ${String(
    date.getUTCHours(),
  ).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function issueLabel(issueKey: string): string {
  switch (issueKey) {
    case 'engine_failed':
      return 'Race engine failed'
    case 'calculation_overdue':
      return 'Calculation overdue'
    case 'replay_not_ready':
      return 'Replay not ready'
    case 'completion_incomplete':
      return 'Stage finalization incomplete'
    default:
      return issueKey.replaceAll('_', ' ')
  }
}

function buildText(incidents: RaceOpsIncident[]): string {
  const lines = [
    'ProPeloton Manager – Race Operations Alert',
    '',
    `${incidents.length} race-stage problem${incidents.length === 1 ? '' : 's'} require administrator attention.`,
    '',
  ]

  incidents.forEach((incident, index) => {
    lines.push(
      `${index + 1}. ${incident.race_name} – Stage ${incident.stage_number}`,
      `Problem: ${issueLabel(incident.issue_key)}`,
      `Severity: ${incident.severity.toUpperCase()}`,
      `Scheduled start: ${formatGameDate(incident.stage_start_game_at)}`,
      `Details: ${incident.message}`,
      '',
    )
  })

  lines.push(
    'Open ProPeloton Manager → Administration → Race Operations for the current status and technical details.',
  )

  return lines.join('\n')
}

function buildHtml(incidents: RaceOpsIncident[]): string {
  const rows = incidents
    .map(
      incident => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-weight:700;">
            ${escapeHtml(incident.race_name)} – Stage ${incident.stage_number}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;">
            ${escapeHtml(issueLabel(incident.issue_key))}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-transform:uppercase;">
            ${escapeHtml(incident.severity)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;">
            ${escapeHtml(formatGameDate(incident.stage_start_game_at))}
          </td>
        </tr>
        <tr>
          <td colspan="4" style="padding:8px 12px 16px;color:#4b5563;border-bottom:1px solid #d1d5db;">
            ${escapeHtml(incident.message)}
          </td>
        </tr>
      `,
    )
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;">ProPeloton Manager – Race Operations Alert</h2>
      <p>
        <strong>${incidents.length}</strong> race-stage problem${incidents.length === 1 ? '' : 's'}
        require administrator attention.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:10px;">Race / Stage</th>
            <th style="padding:10px;">Problem</th>
            <th style="padding:10px;">Severity</th>
            <th style="padding:10px;">Scheduled start</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p>
        Open <strong>Administration → Race Operations</strong> in ProPeloton Manager
        for the current state, three checkpoints, and technical details.
      </p>
    </div>
  `
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error('Missing required Race Operations alert environment secrets.')
    return json({ ok: false, error: 'Alert service is not configured.' }, 500)
  }

  const suppliedSecret = request.headers.get('x-race-ops-secret') ?? ''
  if (!suppliedSecret) {
    return json({ ok: false, error: 'Unauthorized.' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: secretValid, error: secretError } = await admin.rpc(
    'race_operations_validate_alert_secret_v1',
    {
      p_secret: suppliedSecret,
    },
  )

  if (secretError || secretValid !== true) {
    console.error('Race Operations alert secret validation failed.', secretError)
    return json({ ok: false, error: 'Unauthorized.' }, 401)
  }

  const { data: configData, error: configError } = await admin
    .from('race_operations_config_v1')
    .select('alert_email,email_enabled,email_delay_minutes')
    .eq('id', true)
    .single()

  if (configError || !configData) {
    console.error('Could not load Race Operations email config.', configError)
    return json({ ok: false, error: 'Alert configuration is unavailable.' }, 500)
  }

  const config = configData as RaceOpsConfig

  if (!config.email_enabled) {
    return json({ ok: true, sent: 0, reason: 'email_disabled' })
  }

  const cutoff = new Date(
    Date.now() - Math.max(0, Number(config.email_delay_minutes) || 0) * 60_000,
  ).toISOString()

  const { data: incidentData, error: incidentsError } = await admin
    .from('race_operations_incidents_v1')
    .select(
      'id,race_name,stage_number,issue_key,severity,message,stage_start_game_at,detected_game_at,detected_at,email_attempt_count,metadata',
    )
    .is('resolved_at', null)
    .is('email_sent_at', null)
    .lte('detected_at', cutoff)
    .lt('email_attempt_count', 3)
    .order('detected_at', { ascending: true })
    .limit(20)

  if (incidentsError) {
    console.error('Could not load pending Race Operations incidents.', incidentsError)
    return json({ ok: false, error: 'Could not load alert queue.' }, 500)
  }

  const incidents = (incidentData ?? []) as RaceOpsIncident[]

  if (incidents.length === 0) {
    return json({ ok: true, sent: 0, reason: 'no_pending_incidents' })
  }

  const from =
    Deno.env.get('CONTACT_FROM_EMAIL') ??
    'ProPeloton Manager <no-reply@propelotonmanager.com>'

  const subject = `ProPeloton Manager – Race Operations Alert (${incidents.length})`

  let resendResponse: Response

  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [config.alert_email],
        subject,
        text: buildText(incidents),
        html: buildHtml(incidents),
        tags: [
          { name: 'category', value: 'race-operations' },
        ],
      }),
    })
  } catch (error) {
    const errorText =
      error instanceof Error ? error.message : 'Unknown Resend network error'

    for (const incident of incidents) {
      await admin
        .from('race_operations_incidents_v1')
        .update({
          email_attempt_count: Number(incident.email_attempt_count ?? 0) + 1,
          email_last_error: errorText.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', incident.id)
    }

    console.error('Race Operations alert email request failed.', error)
    return json({ ok: false, error: 'Email request failed.' }, 502)
  }

  const resendData = await resendResponse.json().catch(() => null)

  if (!resendResponse.ok) {
    const errorText = JSON.stringify(
      resendData ?? { status: resendResponse.status },
    ).slice(0, 2000)

    for (const incident of incidents) {
      await admin
        .from('race_operations_incidents_v1')
        .update({
          email_attempt_count: Number(incident.email_attempt_count ?? 0) + 1,
          email_last_error: errorText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', incident.id)
    }

    console.error('Race Operations Resend delivery failed.', resendData)
    return json({ ok: false, error: 'Email delivery failed.' }, 502)
  }

  const sentAt = new Date().toISOString()

  for (const incident of incidents) {
    const { error: updateError } = await admin
      .from('race_operations_incidents_v1')
      .update({
        email_sent_at: sentAt,
        email_attempt_count: Number(incident.email_attempt_count ?? 0) + 1,
        email_last_error: null,
        updated_at: sentAt,
      })
      .eq('id', incident.id)

    if (updateError) {
      console.error('Could not mark Race Operations incident email sent.', {
        incidentId: incident.id,
        updateError,
      })
    }
  }

  return json({
    ok: true,
    sent: incidents.length,
    emailId:
      resendData && typeof resendData === 'object' && 'id' in resendData
        ? resendData.id
        : null,
  })
})
