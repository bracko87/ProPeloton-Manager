import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

type SupportedRole =
  | 'head_coach'
  | 'sport_director'
  | 'team_doctor'
  | 'mechanic'
  | 'scout_analyst'
  | 'u23_head_coach'

type AdvisoryStateRow = {
  staff_id: string
  role_type: SupportedRole
  advisory_status: 'inactive' | 'active' | 'expired'
  expires_at: string | null
}

type RequestBody = {
  club_id: string
  staff_id: string
}

type ReportPayload = {
  reportCode: string
  title: string
  summary: string
  details: Record<string, unknown>
  periodStart: string
  periodEnd: string
}

const ROLE_META: Record<SupportedRole, { code: string; title: string }> = {
  head_coach: {
    code: 'HEAD_COACH_TRAINING_REVIEW',
    title: 'Training & Readiness Review',
  },
  sport_director: {
    code: 'SPORT_DIRECTOR_RACE_REVIEW',
    title: 'Race Programme Review',
  },
  team_doctor: {
    code: 'TEAM_DOCTOR_HEALTH_REVIEW',
    title: 'Team Health Review',
  },
  mechanic: {
    code: 'CHIEF_MECHANIC_EQUIPMENT_REVIEW',
    title: 'Equipment & Maintenance Review',
  },
  scout_analyst: {
    code: 'SCOUT_MARKET_REVIEW',
    title: 'Scouting & Market Review',
  },
  u23_head_coach: {
    code: 'U23_COACH_DEVELOPMENT_REVIEW',
    title: 'U23 Development Review',
  },
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[]
    : []
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function selectTextRows(
  rows: Record<string, unknown>[],
  keywords: string[],
  max = 5,
): string[] {
  return rows
    .filter((row) => {
      const text = `${asString(row.title)} ${asString(row.label)} ${asString(row.subtitle)} ${asString(row.summary)}`.toLowerCase()
      return keywords.some((keyword) => text.includes(keyword))
    })
    .map((row) =>
      asString(row.title) || asString(row.label) || asString(row.subtitle) || 'Relevant item'
    )
    .filter(Boolean)
    .slice(0, max)
}

function startOfUtcWeek(now = new Date()): Date {
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = result.getUTCDay()
  const distanceFromMonday = day === 0 ? 6 : day - 1
  result.setUTCDate(result.getUTCDate() - distanceFromMonday)
  return result
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function buildReport(role: SupportedRole, overviewRaw: unknown): ReportPayload {
  const overview = asObject(overviewRaw)
  const squadPulse = asObject(overview.squadPulse ?? overview.squad_pulse)
  const schedule = asArray(overview.schedule)
  const alerts = asArray(overview.alerts)
  const feed = asArray(overview.feed)
  const operations = asArray(overview.operations)
  const news = asArray(overview.news)

  const meta = ROLE_META[role]
  const now = new Date()
  const periodStart = role === 'team_doctor' ? startOfUtcDay(now) : startOfUtcWeek(now)
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCDate(periodEnd.getUTCDate() + (role === 'team_doctor' ? 1 : 7))

  const fitness = asNumber(squadPulse.fitness)
  const morale = asNumber(squadPulse.morale)
  const readiness = asNumber(squadPulse.readiness)
  const injured = asNumber(squadPulse.injured)
  const sick = asNumber(squadPulse.sick)
  const notFullyFit = asNumber(squadPulse.notFullyFit ?? squadPulse.not_fully_fit)
  const expiringContracts = asNumber(
    squadPulse.expiringContracts ?? squadPulse.expiring_contracts,
  )

  if (role === 'head_coach') {
    const prepItems = selectTextRows([...alerts, ...feed], [
      'preparation', 'race plan', 'stage plan', 'training', 'readiness', 'fatigue',
    ])

    const recommendation = readiness < 60 || notFullyFit > 0
      ? 'Review workload and recovery before the next demanding race block.'
      : 'Current visible readiness is stable; keep monitoring workload around upcoming races.'

    return {
      reportCode: meta.code,
      title: meta.title,
      summary: `Visible squad readiness is ${readiness}/100 with fitness ${fitness}/100. ${notFullyFit} rider(s) are not fully fit. ${recommendation}`,
      details: {
        visible_metrics: { fitness, morale, readiness, not_fully_fit: notFullyFit },
        review_items: prepItems,
        upcoming_schedule_count: schedule.length,
        recommendation,
        data_policy: 'Visible manager data only; no hidden coefficients or outcome prediction.',
      },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  if (role === 'sport_director') {
    const raceItems = selectTextRows([...alerts, ...feed, ...news], [
      'race', 'stage', 'application', 'selection', 'result',
    ])
    const recommendation = schedule.length >= 5
      ? 'The visible programme is busy; review rider rotation and recovery spacing.'
      : 'The visible programme is manageable; review whether key riders have appropriate race opportunities.'

    return {
      reportCode: meta.code,
      title: meta.title,
      summary: `${schedule.length} upcoming schedule item(s) are visible. ${raceItems.length} recent race-related item(s) were identified for review. ${recommendation}`,
      details: {
        upcoming_schedule_count: schedule.length,
        race_review_items: raceItems,
        recommendation,
        data_policy: 'No tactical modifiers, hidden opponent data or exact result forecasts.',
      },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  if (role === 'team_doctor') {
    const healthItems = selectTextRows([...alerts, ...feed], [
      'injur', 'sick', 'health', 'medical', 'recovery', 'fit',
    ])
    const affected = injured + sick + notFullyFit
    const recommendation = affected > 0
      ? 'Review the listed cases and current recovery workload before finalising selections.'
      : 'No visible squad-health pressure is present in this snapshot; continue routine monitoring.'

    return {
      reportCode: meta.code,
      title: meta.title,
      summary: `${injured} injured, ${sick} sick and ${notFullyFit} not fully fit rider(s) are visible. ${recommendation}`,
      details: {
        visible_health: { injured, sick, not_fully_fit: notFullyFit },
        health_review_items: healthItems,
        recommendation,
        data_policy: 'Context only; free injury/sickness alerts remain independent and unchanged.',
      },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  if (role === 'mechanic') {
    const equipmentItems = selectTextRows([...alerts, ...feed, ...operations], [
      'equipment', 'repair', 'mechanic', 'maintenance', 'condition', 'supplies', 'bike',
    ])
    const recommendation = equipmentItems.length > 0
      ? 'Review the visible equipment and maintenance items before the next race commitment.'
      : 'No equipment-related pressure is visible in this snapshot; continue normal maintenance checks.'

    return {
      reportCode: meta.code,
      title: meta.title,
      summary: `${equipmentItems.length} equipment or maintenance item(s) are visible for review. ${recommendation}`,
      details: {
        equipment_review_items: equipmentItems,
        recommendation,
        data_policy: 'No equipment condition or performance is changed by this report.',
      },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  if (role === 'scout_analyst') {
    const scoutItems = selectTextRows([...alerts, ...feed, ...news], [
      'scout', 'transfer', 'prospect', 'market', 'contract', 'negotiation', 'offer',
    ])
    const recommendation = scoutItems.length > 0
      ? 'Review the visible scouting and market items, prioritising time-sensitive opportunities separately from this advisory digest.'
      : 'No significant scouting or market trend is visible in this overview snapshot.'

    return {
      reportCode: meta.code,
      title: meta.title,
      summary: `${scoutItems.length} scouting, contract or market item(s) are visible for review. ${recommendation}`,
      details: {
        visible_market_items: scoutItems,
        expiring_contracts: expiringContracts,
        recommendation,
        data_policy: 'Uses already-visible information only and never reveals hidden attributes or potential.',
      },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  const u23Items = selectTextRows([...alerts, ...feed, ...operations, ...news], [
    'u23', 'developing', 'youth', 'development', 'academy',
  ])
  const recommendation = u23Items.length > 0
    ? 'Review the visible developing-team items and balance development workload with race participation.'
    : 'No specific developing-team pressure is visible in this overview snapshot.'

  return {
    reportCode: meta.code,
    title: meta.title,
    summary: `${u23Items.length} developing-team or youth-development item(s) are visible for review. ${recommendation}`,
    details: {
      u23_review_items: u23Items,
      recommendation,
      data_policy: 'No hidden potential, growth coefficient or future development prediction is exposed.',
    },
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  }
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return response(500, { ok: false, message: 'Missing Supabase Edge Function configuration.' })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return response(401, { ok: false, message: 'Invalid authenticated session.' })
    }

    const body = (await req.json()) as RequestBody
    if (!body?.club_id || !body.staff_id) {
      return response(400, { ok: false, message: 'club_id and staff_id are required.' })
    }

    const [stateResult, overviewResult] = await Promise.all([
      userClient.rpc('staff_advisory_get_state_v1', { p_club_id: body.club_id }),
      userClient.rpc('get_dashboard_overview'),
    ])

    if (stateResult.error) {
      return response(400, { ok: false, message: stateResult.error.message })
    }
    if (overviewResult.error) {
      return response(400, { ok: false, message: overviewResult.error.message })
    }

    const stateRows = (stateResult.data ?? []) as AdvisoryStateRow[]
    const state = stateRows.find((row) => row.staff_id === body.staff_id)

    if (!state) {
      return response(404, { ok: false, message: 'Staff member is not an active supported employee.' })
    }
    if (state.advisory_status !== 'active') {
      return response(403, { ok: false, message: 'Advisory access is not active for this employee.' })
    }

    const report = buildReport(state.role_type, overviewResult.data)
    const sourceFingerprint = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify({
        role: state.role_type,
        period: report.periodStart,
        overview: overviewResult.data,
      })),
    )
    const fingerprint = Array.from(new Uint8Array(sourceFingerprint))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    const { data: stored, error: storeError } = await adminClient.rpc(
      'staff_advisory_store_report_v1',
      {
        p_user_id: user.id,
        p_club_id: body.club_id,
        p_staff_id: body.staff_id,
        p_report_code: report.reportCode,
        p_period_start: report.periodStart,
        p_period_end: report.periodEnd,
        p_title: report.title,
        p_summary: report.summary,
        p_report_json: report.details,
        p_source_fingerprint: fingerprint,
      },
    )

    if (storeError) {
      return response(400, { ok: false, message: storeError.message })
    }

    return response(200, {
      ok: true,
      report: {
        ...stored,
        report_code: report.reportCode,
        title: report.title,
        summary: report.summary,
        reporting_period_start: report.periodStart,
        reporting_period_end: report.periodEnd,
      },
    })
  } catch (error) {
    return response(500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Unexpected report generation error.',
    })
  }
})
