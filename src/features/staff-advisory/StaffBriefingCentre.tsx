import React from 'react'
import {
  ADVISORY_ROLE_LABELS,
  type AdvisoryStaffRole,
} from './advisoryCatalog'
import {
  activateStaffAdvisory,
  createAdvisoryIdempotencyKey,
  generateStaffAdvisoryReport,
  quoteStaffAdvisory,
  setStaffAdvisoryPins,
  type StaffAdvisoryQuote,
} from './staffAdvisoryApi'
import { supabase } from '../../lib/supabase'

type EmploymentStatus = 'hired' | 'vacant'
type BriefingAdvisoryStatus = 'inactive' | 'active' | 'expired' | 'not_applicable'

type BriefingRow = {
  staff_id: string | null
  staff_name: string | null
  role_type: AdvisoryStaffRole
  employment_status: EmploymentStatus
  advisory_status: BriefingAdvisoryStatus
  expires_at: string | null
  is_pinned: boolean
  pin_order: number | null
}

type Props = {
  clubId: string
  inboxUnread: number
  notificationsUnread: number
  coinBalance: number | null
  coinBalanceLoading?: boolean
  refreshing?: boolean
  onChanged?: () => void
}

const ROLE_INITIALS: Record<AdvisoryStaffRole, string> = {
  head_coach: 'HC',
  sport_director: 'SD',
  team_doctor: 'TD',
  mechanic: 'CM',
  scout_analyst: 'SC',
  u23_head_coach: 'U23',
}

const ROLE_DESCRIPTION: Record<AdvisoryStaffRole, string> = {
  head_coach: 'Training, readiness and preparation analysis',
  sport_director: 'Race programme and selection analysis',
  team_doctor: 'Health and recovery analysis',
  mechanic: 'Equipment and maintenance analysis',
  scout_analyst: 'Scouting and market analysis',
  u23_head_coach: 'Developing-team analysis',
}

function formatExpiry(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function AdvisoryStatusBadge({ row }: { row: BriefingRow }) {
  if (row.employment_status === 'vacant') {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
        Position vacant
      </span>
    )
  }

  if (row.advisory_status === 'active') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
        Advisory active
      </span>
    )
  }

  if (row.advisory_status === 'expired') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
        Advisory expired
      </span>
    )
  }

  return (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
      Advisory inactive
    </span>
  )
}

export default function StaffBriefingCentre({
  clubId,
  inboxUnread,
  notificationsUnread,
  coinBalance,
  coinBalanceLoading = false,
  refreshing = false,
  onChanged,
}: Props) {
  const [rows, setRows] = React.useState<BriefingRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [manageOpen, setManageOpen] = React.useState(false)
  const [selectedPins, setSelectedPins] = React.useState<string[]>([])
  const [savingPins, setSavingPins] = React.useState(false)
  const [quote, setQuote] = React.useState<StaffAdvisoryQuote | null>(null)
  const [quoteStaff, setQuoteStaff] = React.useState<BriefingRow | null>(null)
  const [quoteLoading, setQuoteLoading] = React.useState(false)
  const [activating, setActivating] = React.useState(false)
  const [generatingStaffId, setGeneratingStaffId] = React.useState<string | null>(null)

  const loadRows = React.useCallback(async () => {
    if (!clubId) return

    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc(
      'staff_advisory_get_briefing_v1',
      { p_club_id: clubId },
    )

    if (rpcError) {
      setRows([])
      setError(rpcError.message)
      setLoading(false)
      return
    }

    const nextRows = (data ?? []) as BriefingRow[]
    setRows(nextRows)
    setSelectedPins(
      nextRows
        .filter((row) => row.is_pinned && row.staff_id)
        .sort((a, b) => (a.pin_order ?? 99) - (b.pin_order ?? 99))
        .map((row) => row.staff_id as string)
        .slice(0, 5),
    )
    setLoading(false)
  }, [clubId])

  React.useEffect(() => {
    void loadRows()
  }, [loadRows])

  const pinnedRows = React.useMemo(() => {
    const pinned = rows
      .filter((row) => row.is_pinned && row.staff_id)
      .sort((a, b) => (a.pin_order ?? 99) - (b.pin_order ?? 99))
      .slice(0, 5)

    return pinned
  }, [rows])

  async function openQuote(row: BriefingRow) {
    if (!row.staff_id || row.employment_status !== 'hired') return

    setError(null)
    setQuoteLoading(true)
    setQuoteStaff(row)

    try {
      const nextQuote = await quoteStaffAdvisory(clubId, row.staff_id)
      setQuote(nextQuote)
    } catch (err) {
      setQuoteStaff(null)
      setError(getErrorMessage(err))
    } finally {
      setQuoteLoading(false)
    }
  }

  async function confirmActivation() {
    if (!quoteStaff?.staff_id || !quote) return

    setActivating(true)
    setError(null)

    try {
      await activateStaffAdvisory(
        clubId,
        quoteStaff.staff_id,
        createAdvisoryIdempotencyKey(quoteStaff.staff_id),
      )
      setQuote(null)
      setQuoteStaff(null)
      await loadRows()
      onChanged?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActivating(false)
    }
  }

  async function savePins() {
    if (selectedPins.length > 5) return

    setSavingPins(true)
    setError(null)

    try {
      await setStaffAdvisoryPins(clubId, selectedPins)
      setManageOpen(false)
      await loadRows()
      onChanged?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingPins(false)
    }
  }

  function togglePin(row: BriefingRow) {
    if (!row.staff_id || row.employment_status !== 'hired') return

    setSelectedPins((current) => {
      if (current.includes(row.staff_id as string)) {
        return current.filter((id) => id !== row.staff_id)
      }
      if (current.length >= 5) return current
      return [...current, row.staff_id as string]
    })
  }

  async function generateReport(row: BriefingRow) {
    if (!row.staff_id || row.advisory_status !== 'active') return

    setGeneratingStaffId(row.staff_id)
    setError(null)

    try {
      await generateStaffAdvisoryReport(clubId, row.staff_id)
      window.location.hash = '#/dashboard/inbox'
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setGeneratingStaffId(null)
    }
  }

  function renderCard(row: BriefingRow) {
    const hired = row.employment_status === 'hired' && Boolean(row.staff_id)
    const active = row.advisory_status === 'active'
    const expired = row.advisory_status === 'expired'

    return (
      <div
        key={row.staff_id ?? `vacant:${row.role_type}`}
        className="flex min-h-[152px] flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white px-1 text-[10px] font-black text-slate-800 ring-1 ring-slate-200">
            {ROLE_INITIALS[row.role_type]}
          </span>
          <AdvisoryStatusBadge row={row} />
        </div>

        <div className="mt-2 truncate text-xs font-black text-slate-950">
          {hired ? row.staff_name : ADVISORY_ROLE_LABELS[row.role_type]}
        </div>
        <div className="truncate text-[10px] font-semibold text-slate-500">
          {ADVISORY_ROLE_LABELS[row.role_type]}
        </div>
        <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
          {hired
            ? ROLE_DESCRIPTION[row.role_type]
            : 'Hire a staff member to use normal staff functions and optional advisory analysis.'}
        </div>

        <div className="mt-auto pt-2">
          {!hired ? (
            <a
              href="#/dashboard/staff"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"
            >
              Hire staff
            </a>
          ) : active ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[9px] font-semibold text-emerald-700">
                Until {formatExpiry(row.expires_at)}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void generateReport(row)}
                  disabled={generatingStaffId === row.staff_id}
                  className="rounded-lg bg-slate-950 px-2 py-1.5 text-[9px] font-black text-white disabled:opacity-50"
                >
                  {generatingStaffId === row.staff_id ? 'Working…' : 'Report'}
                </button>
                <button
                  type="button"
                  onClick={() => void openQuote(row)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[9px] font-black text-slate-700"
                >
                  Renew
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold text-slate-500">
                {expired ? `Expired ${formatExpiry(row.expires_at)}` : 'Normal staff work remains active'}
              </div>
              <button
                type="button"
                onClick={() => void openQuote(row)}
                className="shrink-0 rounded-lg bg-slate-950 px-2.5 py-1.5 text-[9px] font-black text-white"
              >
                {expired ? 'Renew' : 'Enable advisory'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black tracking-tight text-slate-950">
              Staff Briefing Centre
            </h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
              Live
            </span>
            {refreshing || loading ? (
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" title="Refreshing" />
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Staff jobs remain free. Coins unlock optional analysis and management reports only.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-black text-amber-800">
            {coinBalanceLoading ? 'Coins …' : `${coinBalance ?? 0} coins`}
          </span>
          <a href="#/dashboard/inbox" className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700">
            Inbox <span>{inboxUnread}</span>
          </a>
          <a href="#/dashboard/notifications" className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700">
            Notifications <span>{notificationsUnread}</span>
          </a>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex h-8 items-center rounded-full bg-slate-950 px-3 text-[11px] font-black text-white"
          >
            Manage cards
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-[152px] animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : pinnedRows.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {pinnedRows.map(renderCard)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
            <div className="text-sm font-black text-slate-800">No staff cards pinned</div>
            <div className="mt-1 text-xs text-slate-500">
              Choose up to five hired staff members for your Overview briefing.
            </div>
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"
            >
              Select staff cards
            </button>
          </div>
        )}
      </div>

      {manageOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">Choose briefing cards</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pin a maximum of five hired staff members. Vacant roles stay visible here but cannot be pinned.
                </p>
              </div>
              <button type="button" onClick={() => setManageOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600">Close</button>
            </div>

            <div className="mt-4 space-y-2">
              {rows.map((row) => {
                const selected = Boolean(row.staff_id && selectedPins.includes(row.staff_id))
                const disabled = row.employment_status === 'vacant' || (!selected && selectedPins.length >= 5)

                return (
                  <button
                    key={row.staff_id ?? `vacant:${row.role_type}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePin(row)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'} disabled:opacity-50`}
                  >
                    <div>
                      <div className="text-sm font-black text-slate-900">
                        {row.staff_name ?? ADVISORY_ROLE_LABELS[row.role_type]}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ADVISORY_ROLE_LABELS[row.role_type]} · {row.employment_status === 'vacant' ? 'Position vacant' : 'Staff hired'}
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-600">
                      {selected ? 'Pinned' : row.employment_status === 'vacant' ? 'Vacant' : 'Pin'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <span className="text-xs font-bold text-slate-500">{selectedPins.length} / 5 selected</span>
              <button
                type="button"
                disabled={savingPins}
                onClick={() => void savePins()}
                className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                {savingPins ? 'Saving…' : 'Save cards'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quoteStaff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-950">
              {quote?.purchase_kind === 'renewal' ? 'Renew advisory access' : 'Activate advisory access'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {quoteStaff.staff_name} · {ADVISORY_ROLE_LABELS[quoteStaff.role_type]}
            </p>

            {quoteLoading || !quote ? (
              <div className="mt-5 h-28 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <div className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Price</span><strong>{quote.coin_price} coins</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Duration</span><strong>{quote.duration_days} real days</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">New expiry</span><strong>{formatExpiry(quote.new_expires_at)}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Your balance</span><strong>{quote.wallet_balance} coins</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Automatic renewal</span><strong>No</strong></div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
              This purchase unlocks analysis only. The staff member continues normal work whether advisory access is active or not.
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={activating}
                onClick={() => { setQuote(null); setQuoteStaff(null) }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quote || !quote.can_afford || activating}
                onClick={() => void confirmActivation()}
                className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                {activating ? 'Processing…' : quote?.can_afford ? `Confirm ${quote.coin_price} coins` : 'Not enough coins'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
