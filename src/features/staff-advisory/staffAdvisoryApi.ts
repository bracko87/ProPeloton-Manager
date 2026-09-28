import { supabase } from '../../lib/supabase'
import type { AdvisoryStaffRole } from './advisoryCatalog'

export type AdvisoryStatus = 'inactive' | 'active' | 'expired'

export type StaffAdvisoryStateRow = {
  staff_id: string
  role_type: AdvisoryStaffRole
  advisory_status: AdvisoryStatus
  expires_at: string | null
  is_pinned: boolean
  pin_order: number | null
}

export type StaffAdvisoryQuote = {
  staff_id: string
  role_type: AdvisoryStaffRole
  purchase_kind: 'activation' | 'renewal'
  coin_price: number
  duration_days: number
  current_expires_at: string | null
  new_expires_at: string
  wallet_balance: number
  can_afford: boolean
  automatic_renewal: false
}

export type StaffAdvisoryReportRow = {
  report_id: string
  staff_id: string
  role_type: AdvisoryStaffRole
  report_code: string
  title: string
  summary: string
  report_json: Record<string, unknown>
  reporting_period_start: string
  reporting_period_end: string
  created_at: string
  inbox_conversation_id: string | null
  inbox_message_id: string | null
}

type EdgeResponse<T> = {
  ok: boolean
  message?: string
} & T

async function invokeStaffAdvisory<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('staff-advisory', {
    body,
  })

  if (error) {
    throw new Error(error.message || 'Staff Advisory request failed.')
  }

  const result = data as EdgeResponse<T> | null
  if (!result?.ok) {
    throw new Error(result?.message || 'Staff Advisory request failed.')
  }

  return result as T
}

export async function loadStaffAdvisoryState(
  clubId: string,
): Promise<StaffAdvisoryStateRow[]> {
  const { data, error } = await supabase.rpc('staff_advisory_get_state_v1', {
    p_club_id: clubId,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as StaffAdvisoryStateRow[]
}

export async function quoteStaffAdvisory(
  clubId: string,
  staffId: string,
): Promise<StaffAdvisoryQuote> {
  const result = await invokeStaffAdvisory<{ quote: StaffAdvisoryQuote }>({
    action: 'quote',
    club_id: clubId,
    staff_id: staffId,
  })

  return result.quote
}

export async function activateStaffAdvisory(
  clubId: string,
  staffId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const result = await invokeStaffAdvisory<{
    activation: Record<string, unknown>
  }>({
    action: 'activate',
    club_id: clubId,
    staff_id: staffId,
    idempotency_key: idempotencyKey,
  })

  return result.activation
}

export async function setStaffAdvisoryPins(
  clubId: string,
  staffIds: string[],
): Promise<void> {
  await invokeStaffAdvisory<{ staff_ids: string[] }>({
    action: 'set_pins',
    club_id: clubId,
    staff_ids: staffIds,
  })
}

export async function generateStaffAdvisoryReport(
  clubId: string,
  staffId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke(
    'generate-staff-advisory-report',
    {
      body: {
        club_id: clubId,
        staff_id: staffId,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Could not generate Staff Advisory report.')
  }

  const result = data as EdgeResponse<{
    report: Record<string, unknown>
  }> | null

  if (!result?.ok) {
    throw new Error(result?.message || 'Could not generate Staff Advisory report.')
  }

  return result.report
}

export async function loadStaffAdvisoryReports(
  clubId: string,
  staffId?: string,
  limit = 30,
): Promise<StaffAdvisoryReportRow[]> {
  const { data, error } = await supabase.rpc('staff_advisory_get_reports_v1', {
    p_club_id: clubId,
    p_staff_id: staffId ?? null,
    p_limit: limit,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as StaffAdvisoryReportRow[]
}

export function createAdvisoryIdempotencyKey(staffId: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `staff-advisory:${staffId}:${randomPart}`
}
