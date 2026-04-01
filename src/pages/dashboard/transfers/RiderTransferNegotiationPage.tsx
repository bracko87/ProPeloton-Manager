/**
 * RiderTransferNegotiationPage.tsx
 *
 * Dashboard page for handling a single rider transfer negotiation.
 *
 * Responsibilities:
 * - Load a negotiation by id from the URL.
 * - Show rider info, seller club, current status and expiry.
 * - Allow the user to adjust salary offer and contract length.
 * - Submit updated terms through submit_rider_transfer_contract_offer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'
import { formatShortGameDate, getDaysRemaining } from '../../../features/squad/utils/dates'
import { getRiderImageUrl } from '../../../features/squad/utils/rider-ui'
import { formatWeeklySalary, getCountryName, getFlagImageUrl } from '../../../features/squad/utils/formatters'

type NegotiationStatus =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'declined'
  | 'completed'
  | 'club_accepted'
  | 'countered'
  | string

type RiderTransferNegotiation = {
  id: string
  offer_id: string | null
  rider_id: string | null
  buyer_club_id: string | null
  seller_club_id: string | null
  rider_name: string | null
  seller_club_name: string | null
  status: NegotiationStatus
  asking_price: number | null
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  min_acceptable_salary_weekly: number | null
  preferred_duration_seasons: number | null
  rider_message: string | null
  closed_reason: string | null
  expires_on_game_date: string | null
  locked_until: string | null
  attempt_count: number | null
  max_attempts: number | null
  created_at: string | null
  updated_at: string | null
}

type RiderBasicInfo = {
  id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  country_code: string | null
  image_url: string | null
  overall: number | null
  role: string | null
}

type StatusBadgeDescriptor = {
  label: string
  className: string
}

type SubmitFeedback = {
  kind: 'success' | 'warning' | 'error'
  message: string
}

type RpcResultRow = Record<string, unknown>

function CountryFlag({
  countryCode,
  className = '',
}: {
  countryCode?: string | null
  className?: string
}): JSX.Element {
  const [hasError, setHasError] = useState(false)
  const src = getFlagImageUrl(countryCode)
  const countryName = getCountryName(countryCode)

  const wrapperClassName = [
    'inline-flex h-[16px] w-[24px] shrink-0 overflow-hidden rounded-[4px] border border-gray-200 bg-white',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!src || hasError) {
    return <span className={`${wrapperClassName} bg-gray-200`} title={countryName} />
  }

  return (
    <span className={wrapperClassName} title={countryName}>
      <img
        src={src}
        alt={`${countryName} flag`}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </span>
  )
}

function getStatusBadgeProps(status: NegotiationStatus): StatusBadgeDescriptor {
  const value = String(status || '').toLowerCase()

  if (value === 'open') {
    return {
      label: 'Open',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    }
  }

  if (value === 'pending') {
    return {
      label: 'Pending',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    }
  }

  if (value === 'countered') {
    return {
      label: 'Countered',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    }
  }

  if (value === 'club_accepted') {
    return {
      label: 'Club Accepted',
      className: 'bg-blue-50 text-blue-800 border-blue-200',
    }
  }

  if (value === 'accepted') {
    return {
      label: 'Accepted',
      className: 'bg-blue-50 text-blue-800 border-blue-200',
    }
  }

  if (value === 'completed') {
    return {
      label: 'Completed',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    }
  }

  if (value === 'rejected' || value === 'declined') {
    return {
      label: 'Declined',
      className: 'bg-rose-50 text-rose-800 border-rose-200',
    }
  }

  if (value === 'expired') {
    return {
      label: 'Expired',
      className: 'bg-slate-100 text-slate-700 border-slate-300',
    }
  }

  return {
    label: 'Unknown',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  }
}

function formatCompactMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const prefix = value < 0 ? '-$' : '$'

  if (abs >= 1_000_000_000) {
    return `${prefix}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}b`
  }

  if (abs >= 1_000_000) {
    return `${prefix}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  }

  if (abs >= 100_000) {
    return `${prefix}${Math.floor(abs / 1_000)}k`
  }

  if (abs >= 1_000) {
    return `${prefix}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }

  return `${prefix}${Math.round(abs).toLocaleString('en-US')}`
}

function getNegotiationExpiryLabel(
  expiresOnGameDate: string | null,
  currentGameDate: string | null
): string {
  if (!expiresOnGameDate) return 'No explicit expiry'

  const daysRemaining = getDaysRemaining(expiresOnGameDate, currentGameDate)

  if (daysRemaining == null) {
    return `Expires on ${formatShortGameDate(expiresOnGameDate)}`
  }

  if (daysRemaining <= 0) {
    return `Expired (${formatShortGameDate(expiresOnGameDate)})`
  }

  return `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${formatShortGameDate(
    expiresOnGameDate
  )})`
}

function normalizeSalaryInput(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function formatNegotiationReason(reason?: string | null): string {
  const value = String(reason || '').toLowerCase()

  switch (value) {
    case 'salary_or_duration_not_competitive':
      return 'Salary or contract duration not competitive enough.'
    case 'negotiation_expired':
      return 'Negotiation expired before agreement was reached.'
    case 'salary_too_low':
      return 'Salary too low.'
    case 'contract_too_short':
      return 'Contract too short.'
    case 'contract_too_long':
      return 'Contract too long.'
    case 'club_tier_too_low':
      return 'Club tier too low.'
    case 'not_interested':
      return 'Rider not interested.'
    case 'competitive_level_mismatch':
      return 'Competitive level mismatch.'
    default:
      return reason || 'No visible rejection reason at this time.'
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function getFirstRpcRow(data: unknown): RpcResultRow | null {
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? (first as RpcResultRow) : null
  }

  if (data && typeof data === 'object') {
    return data as RpcResultRow
  }

  return null
}

function getRpcString(row: RpcResultRow | null, keys: string[]): string | null {
  if (!row) return null

  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return value
    }
  }

  return null
}

export default function RiderTransferNegotiationPage(): JSX.Element {
  const navigate = useNavigate()
  const { negotiationId } = useParams<{ negotiationId: string }>()

  const [negotiation, setNegotiation] = useState<RiderTransferNegotiation | null>(null)
  const [riderInfo, setRiderInfo] = useState<RiderBasicInfo | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)

  const [salaryOffer, setSalaryOffer] = useState<string>('')
  const [contractYears, setContractYears] = useState<number | ''>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback | null>(null)

  const loadNegotiation = useCallback(async () => {
    if (!negotiationId) {
      setError('Missing negotiation id.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [{ data: negotiationRow, error: negotiationError }, { data: gameDateData, error: gameDateError }] =
        await Promise.all([
          supabase
            .from('rider_transfer_negotiations')
            .select('*')
            .eq('id', negotiationId)
            .maybeSingle(),
          supabase.rpc('get_current_game_date'),
        ])

      if (negotiationError) {
        throw negotiationError
      }

      if (!negotiationRow) {
        setNegotiation(null)
        setError('Negotiation not found.')
        setLoading(false)
        return
      }

      const parsedNegotiation = negotiationRow as unknown as RiderTransferNegotiation
      setNegotiation(parsedNegotiation)

      const initialSalary =
        parsedNegotiation.offer_salary_weekly ?? parsedNegotiation.min_acceptable_salary_weekly ?? null
      setSalaryOffer(initialSalary != null ? String(Math.round(initialSalary)) : '')

      const initialYears =
        parsedNegotiation.offer_duration_seasons ??
        parsedNegotiation.preferred_duration_seasons ??
        3
      setContractYears(initialYears)

      if (gameDateError) {
        // eslint-disable-next-line no-console
        console.error('Failed to load current game date for negotiation page:', gameDateError)
      }

      if (typeof gameDateData === 'string') {
        setGameDate(gameDateData)
      } else if (gameDateData && typeof gameDateData === 'object') {
        const record = gameDateData as Record<string, unknown>
        const candidate =
          typeof record.game_date === 'string'
            ? record.game_date
            : typeof record.current_game_date === 'string'
              ? record.current_game_date
              : null
        setGameDate(candidate)
      } else {
        setGameDate(null)
      }

      setRiderInfo(null)

      if (parsedNegotiation.rider_id) {
        const { data: riderRow, error: riderError } = await supabase
          .from('riders')
          .select(
            `
              id,
              display_name,
              first_name,
              last_name,
              country_code,
              image_url,
              overall,
              role
            `
          )
          .eq('id', parsedNegotiation.rider_id)
          .maybeSingle()

        if (riderError) {
          // eslint-disable-next-line no-console
          console.error('Failed to load rider info for negotiation page:', riderError)
        } else if (riderRow) {
          setRiderInfo(riderRow as RiderBasicInfo)
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load transfer negotiation.')
      setNegotiation(null)
    } finally {
      setLoading(false)
    }
  }, [negotiationId])

  useEffect(() => {
    void loadNegotiation()
  }, [loadNegotiation])

  const statusBadge = useMemo(
    () => getStatusBadgeProps(negotiation?.status ?? 'open'),
    [negotiation?.status]
  )

  const expiryLabel = useMemo(
    () => getNegotiationExpiryLabel(negotiation?.expires_on_game_date ?? null, gameDate),
    [negotiation?.expires_on_game_date, gameDate]
  )

  const riderDisplayName = useMemo(() => {
    if (negotiation?.rider_name && negotiation.rider_name.trim() !== '') {
      return negotiation.rider_name
    }
    if (!riderInfo) return 'Rider'
    if (riderInfo.display_name && riderInfo.display_name.trim() !== '') {
      return riderInfo.display_name
    }
    const combined = `${riderInfo.first_name ?? ''} ${riderInfo.last_name ?? ''}`.trim()
    return combined || 'Rider'
  }, [negotiation?.rider_name, riderInfo])

  const isTerminal = useMemo(() => {
    const value = String(negotiation?.status || '').toLowerCase()
    return ['accepted', 'declined', 'rejected', 'expired', 'completed'].includes(value)
  }, [negotiation?.status])

  const isLocked = useMemo(() => {
    if (!negotiation?.locked_until) return false
    const ts = new Date(negotiation.locked_until).getTime()
    if (Number.isNaN(ts)) return false
    return ts > Date.now()
  }, [negotiation?.locked_until])

  const canSubmit = !submitting && !isTerminal && !isLocked

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!negotiation) return

    const numericSalary = normalizeSalaryInput(salaryOffer)
    const numericYears =
      typeof contractYears === 'number' ? contractYears : Number(contractYears || 0)

    if (!numericSalary || !Number.isFinite(numericYears) || numericYears <= 0) {
      setError('Please provide a valid weekly salary and contract length.')
      return
    }

    if (isTerminal) {
      setError('This negotiation is already closed.')
      return
    }

    setSubmitting(true)
    setError(null)
    setSubmitFeedback(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('submit_rider_transfer_contract_offer', {
        p_negotiation_id: negotiation.id,
        p_offer_salary_weekly: numericSalary,
        p_offer_duration_seasons: numericYears,
      })

      if (rpcError) {
        console.error('submit_rider_transfer_contract_offer rpc error:', {
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code,
        })
        throw rpcError
      }

      const row = getFirstRpcRow(data)
      const rpcStatus = getRpcString(row, ['status', 'result_status', 'outcome_status'])
      const rpcMessage =
        getRpcString(row, ['message', 'result_message', 'outcome_message']) ??
        'Terms submitted successfully.'

      let feedback: SubmitFeedback = {
        kind: 'warning',
        message: rpcMessage,
      }

      if (rpcStatus === 'completed' || rpcStatus === 'accepted') {
        feedback = {
          kind: 'success',
          message: rpcMessage,
        }
      } else if (rpcStatus === 'declined' || rpcStatus === 'rejected' || rpcStatus === 'expired') {
        feedback = {
          kind: 'error',
          message: rpcMessage,
        }
      }

      setSubmitFeedback(feedback)

      await loadNegotiation()
    } catch (e: any) {
      console.error('submit_rider_transfer_contract_offer failed:', e)

      const message =
        e?.message ||
        e?.details ||
        e?.hint ||
        'Failed to submit rider contract offer.'

      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="text-sm text-slate-600">Loading transfer negotiation…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">Could not load negotiation</div>
          <div className="mt-1 text-sm text-rose-600">{error}</div>
        </div>
      </div>
    )
  }

  if (!negotiation) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">Negotiation not found.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Status
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>
      </div>

      {submitFeedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            submitFeedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : submitFeedback.kind === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {submitFeedback.message}
        </div>
      )}

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Negotiation is temporarily locked until{' '}
          <span className="font-semibold">{formatDateTime(negotiation.locked_until)}</span>.
        </div>
      )}

      {isTerminal && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {String(negotiation.status).toLowerCase() === 'completed' ||
          String(negotiation.status).toLowerCase() === 'accepted'
            ? 'This transfer has been completed.'
            : String(negotiation.status).toLowerCase() === 'expired'
              ? 'This negotiation expired before agreement was reached.'
              : 'This negotiation is closed and can no longer be updated.'}
        </div>
      )}

      <div className="rounded-xl border border-yellow-500 bg-yellow-400/95 p-5 shadow">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-950/75">
              Transfer Negotiation
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
              {riderDisplayName}
            </h1>
            <div className="mt-2 text-sm text-slate-900/80">
              Between your club and{' '}
              <span className="font-semibold">
                {negotiation.seller_club_name || 'Unknown club'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4">
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900/80">
                Asking Price
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-950">
                {formatCompactMoney(negotiation.asking_price)}
              </div>
            </div>

            <div className="h-10 w-px bg-slate-900/25" />

            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900/80">
                Expires
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950">{expiryLabel}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Rider</h2>

            <div className="mt-3 flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {riderInfo ? (
                  <img
                    src={getRiderImageUrl(riderInfo.image_url)}
                    alt={riderDisplayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    —
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {riderDisplayName}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5">
                    <CountryFlag countryCode={riderInfo?.country_code} />
                    <span>{getCountryName(riderInfo?.country_code)}</span>
                  </span>

                  <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                    {riderInfo?.role || '—'}
                  </span>

                  <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                    OVR {riderInfo?.overall ?? '—'}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Seller Club</h2>

            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Club</span>
                <span className="font-medium">
                  {negotiation.seller_club_name || 'Unknown club'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Asking Price</span>
                <span className="font-semibold">
                  {formatCompactMoney(negotiation.asking_price)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Minimum Salary</span>
                <span className="font-medium">
                  {formatWeeklySalary(negotiation.min_acceptable_salary_weekly)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Preferred Contract</span>
                <span className="font-medium">
                  {negotiation.preferred_duration_seasons
                    ? `${negotiation.preferred_duration_seasons} season${
                        negotiation.preferred_duration_seasons === 1 ? '' : 's'
                      }`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Attempts</span>
                <span className="font-medium">
                  {negotiation.attempt_count ?? 0}
                  {negotiation.max_attempts ? ` / ${negotiation.max_attempts}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Offer Terms</h2>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Weekly Salary Offer
                </label>
                <input
                  type="text"
                  value={salaryOffer}
                  onChange={(event) => setSalaryOffer(event.target.value)}
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="e.g. 75000"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Current:{' '}
                  <span className="font-medium">
                    {formatWeeklySalary(negotiation.offer_salary_weekly)}
                  </span>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Contract Length (seasons)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={contractYears}
                  onChange={(event) =>
                    setContractYears(event.target.value ? Number(event.target.value) : '')
                  }
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Current:{' '}
                  <span className="font-medium">
                    {negotiation.offer_duration_seasons
                      ? `${negotiation.offer_duration_seasons} season${
                          negotiation.offer_duration_seasons === 1 ? '' : 's'
                        }`
                      : '—'}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                You can update terms while the negotiation is open and unlocked.
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit Terms'}
              </button>
            </div>
          </form>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Rider Response</h2>

            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Counter Message
                </div>
                <div className="mt-1">
                  {negotiation.rider_message
                    ? negotiation.rider_message
                    : 'No specific counter message from the rider yet.'}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Latest Visible Reason
                </div>
                <div className="mt-1">
                  {formatNegotiationReason(negotiation.closed_reason)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Created</div>
                  <div className="mt-0.5">{formatDateTime(negotiation.created_at)}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Last Updated</div>
                  <div className="mt-0.5">{formatDateTime(negotiation.updated_at)}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              This negotiation page is designed as the target for transfer-related notifications,
              using the route{' '}
              <span className="font-mono text-slate-800">
                /dashboard/transfers/negotiations/:negotiationId
              </span>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}