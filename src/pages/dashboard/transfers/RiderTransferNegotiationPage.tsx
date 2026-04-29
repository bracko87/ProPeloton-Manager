/**
 * RiderTransferNegotiationPage.tsx
 *
 * Dashboard page for handling a single rider transfer negotiation.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'
import {
  formatWeeklySalary,
  getCountryName,
  getFlagImageUrl,
} from '../../../features/squad/utils/formatters'

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

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type NegotiationPageContextRow = {
  negotiation_id: string
  offer_id: string | null
  listing_id: string | null
  rider_id: string | null
  buyer_club_id: string | null
  seller_club_id: string | null
  status: NegotiationStatus
  current_salary_weekly: number | null
  expected_salary_weekly: number | null
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  min_acceptable_salary_weekly: number | null
  preferred_duration_seasons: number | null
  closed_reason: string | null
  opened_on_game_date: string | null
  expires_on_game_date: string | null
  locked_until: string | null
  attempt_count: number | null
  max_attempts: number | null
  created_at: string | null
  updated_at: string | null

  rider_first_name: string | null
  rider_last_name: string | null
  rider_display_name: string | null
  rider_country_code: string | null
  rider_role: string | null
  rider_birth_date: string | null
  rider_image_url: string | null
  rider_market_value?: number | null

  buyer_club_name: string | null
  seller_club_name: string | null

  offered_price: number | null
  offer_signing_bonus?: number | null
  offer_agent_fee?: number | null
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

type TransferOfferPreviewRpcRow = {
  acceptance_percent?: number | string | null
  acceptance_band?: string | null
  predicted_outcome?: string | null
  summary_text?: string | null
  primary_reason?: string | null
  hard_block?: boolean | string | number | null
  salary_score?: number | string | null
  duration_score?: number | string | null
  bonus_score?: number | string | null
  fee_score?: number | string | null
  tier_score?: number | string | null
  total_score?: number | string | null
  message?: string | null
  status?: string | null
}

type TransferOfferPreviewState = {
  acceptancePercent: number | null
  acceptanceBand: string | null
  predictedOutcome: string | null
  summaryText: string | null
  primaryReason: string | null
  hardBlock: boolean
  salaryScore: number | null
  durationScore: number | null
  bonusScore: number | null
  feeScore: number | null
  tierScore: number | null
  totalScore: number | null
}

type OfferOutlookTone = {
  badgeClassName: string
  panelClassName: string
  barClassName: string
}

const MIN_CONTRACT_YEARS = 1
const MAX_CONTRACT_YEARS = 5

function looksLikeUuid(value?: string | null): boolean {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function buildPreferredRiderName(params: {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  fallbackId?: string | null
}) {
  const combined = [params.firstName?.trim(), params.lastName?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim()

  if (combined) return combined
  if (params.displayName?.trim() && !looksLikeUuid(params.displayName)) {
    return params.displayName.trim()
  }
  if (params.fallbackId && !looksLikeUuid(params.fallbackId)) {
    return params.fallbackId
  }
  return 'Unknown rider'
}

function getCurrentGameDateFromState(gameState: GameStateRow | null | undefined) {
  if (!gameState) return null

  const gameYear = 1999 + Math.max(1, gameState.season_number || 1)

  const gameDate = new Date(
    Date.UTC(
      gameYear,
      Math.max(0, (gameState.month_number || 1) - 1),
      Math.max(1, gameState.day_number || 1),
      Math.max(0, gameState.hour_number || 0),
      Math.max(0, gameState.minute_number || 0)
    )
  )

  return Number.isNaN(gameDate.getTime()) ? null : gameDate
}

function calculateAgeYearsFromGameDate(
  birthDate: string | null | undefined,
  currentGameDate: Date | null
) {
  if (!birthDate || !currentGameDate) return null

  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  let age = currentGameDate.getUTCFullYear() - birth.getUTCFullYear()

  const hasHadBirthdayThisYear =
    currentGameDate.getUTCMonth() > birth.getUTCMonth() ||
    (currentGameDate.getUTCMonth() === birth.getUTCMonth() &&
      currentGameDate.getUTCDate() >= birth.getUTCDate())

  if (!hasHadBirthdayThisYear) {
    age -= 1
  }

  return age
}

function getInitials(name: string): string {
  const clean = name.trim()
  if (!clean || looksLikeUuid(clean)) return 'R'

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function formatTransferAmount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  const roundedToThousand = Math.round(Number(value) / 1000) * 1000
  return `$${roundedToThousand.toLocaleString('en-US')}`
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function normalizeSalaryInput(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}

function normalizeMoneyInput(raw: string): number | null {
  const cleaned = String(raw || '').replace(/[^\d]/g, '')
  if (!cleaned) return 0
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function formatMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '$0'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function getStatusBadgeProps(status: NegotiationStatus): StatusBadgeDescriptor {
  const value = String(status || '').toLowerCase()

  if (value === 'open') {
    return { label: 'Open', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  }
  if (value === 'pending' || value === 'countered') {
    return { label: 'Pending', className: 'bg-amber-50 text-amber-800 border-amber-200' }
  }
  if (value === 'accepted' || value === 'completed' || value === 'club_accepted') {
    return { label: 'Accepted', className: 'bg-blue-50 text-blue-800 border-blue-200' }
  }
  if (value === 'declined' || value === 'rejected') {
    return { label: 'Declined', className: 'bg-rose-50 text-rose-800 border-rose-200' }
  }
  if (value === 'expired') {
    return { label: 'Expired', className: 'bg-slate-100 text-slate-700 border-slate-300' }
  }

  return { label: 'Unknown', className: 'bg-slate-100 text-slate-700 border-slate-300' }
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

function getNegotiationCountdownLabel(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null
): string {
  if (!expiresOnGameDate) return 'No expiry'

  if (!gameState) {
    return expiresOnGameDate
  }

  const currentGameDate = new Date(
    Date.UTC(
      2000,
      Math.max(0, gameState.month_number - 1),
      gameState.day_number,
      gameState.hour_number,
      gameState.minute_number,
      0
    )
  )

  const expiryDate = new Date(`${expiresOnGameDate}T23:59:59Z`)
  const diffMs = expiryDate.getTime() - currentGameDate.getTime()

  if (diffMs <= 0) return 'Expired'

  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

function normalizeOfferPreview(data: unknown): TransferOfferPreviewState | null {
  const row = getFirstRpcRow(data) as TransferOfferPreviewRpcRow | null
  if (!row) return null

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const toString = (value: unknown): string | null => {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  }

  const toBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      return ['true', 't', '1', 'yes', 'y'].includes(normalized)
    }
    return false
  }

  const acceptancePercent = toNumber(row.acceptance_percent)
  return {
    acceptancePercent:
      acceptancePercent == null
        ? null
        : Math.max(0, Math.min(100, Math.round(acceptancePercent))),
    acceptanceBand: toString(row.acceptance_band),
    predictedOutcome: toString(row.predicted_outcome),
    summaryText: toString(row.summary_text) ?? toString(row.message),
    primaryReason: toString(row.primary_reason),
    hardBlock: toBoolean(row.hard_block),
    salaryScore: toNumber(row.salary_score),
    durationScore: toNumber(row.duration_score),
    bonusScore: toNumber(row.bonus_score),
    feeScore: toNumber(row.fee_score),
    tierScore: toNumber(row.tier_score),
    totalScore: toNumber(row.total_score),
  }
}

function getOfferOutlookLabel(preview: TransferOfferPreviewState | null): string {
  if (!preview) return 'No preview'

  if (preview.hardBlock) return 'Extremely difficult'

  switch (preview.acceptanceBand) {
    case 'very_high':
      return 'Very high chance'
    case 'high':
      return 'High chance'
    case 'moderate':
    case 'medium':
      return 'Moderate chance'
    case 'low':
      return 'Low chance'
    case 'very_low':
      return 'Very low chance'
    default:
      return 'Unclear'
  }
}

function getOfferOutlookTone(preview: TransferOfferPreviewState | null): OfferOutlookTone {
  if (!preview) {
    return {
      badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
      panelClassName: 'border-slate-200 bg-slate-50',
      barClassName: 'bg-slate-400',
    }
  }

  if (preview.hardBlock) {
    return {
      badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
      panelClassName: 'border-rose-200 bg-rose-50/70',
      barClassName: 'bg-rose-500',
    }
  }

  const outcome = String(preview.predictedOutcome || '').toLowerCase()
  const band = String(preview.acceptanceBand || '').toLowerCase()

  if (
    ['accept', 'accepted', 'sign', 'sign_now'].includes(outcome) ||
    ['very_high', 'high'].includes(band)
  ) {
    return {
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      panelClassName: 'border-emerald-200 bg-emerald-50/70',
      barClassName: 'bg-emerald-500',
    }
  }

  if (['medium', 'moderate'].includes(band)) {
    return {
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      panelClassName: 'border-amber-200 bg-amber-50/70',
      barClassName: 'bg-amber-500',
    }
  }

  return {
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    panelClassName: 'border-rose-200 bg-rose-50/70',
    barClassName: 'bg-rose-500',
  }
}

function CountryFlag({
  countryCode,
  className = '',
}: {
  countryCode?: string | null
  className?: string
}) {
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

function RiderPortrait({
  riderName,
  imageUrl,
}: {
  riderName: string
  imageUrl?: string | null
}) {
  const [hasError, setHasError] = useState(false)

  if (imageUrl && !hasError) {
    return (
      <img
        src={imageUrl}
        alt={riderName}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-lg font-semibold text-slate-500">
      {getInitials(riderName)}
    </div>
  )
}

export default function RiderTransferNegotiationPage(): JSX.Element {
  const navigate = useNavigate()
  const { negotiationId } = useParams<{ negotiationId: string }>()

  const [contextRow, setContextRow] = useState<NegotiationPageContextRow | null>(null)
  const [gameState, setGameState] = useState<GameStateRow | null>(null)

  const [salaryOffer, setSalaryOffer] = useState('')
  const [contractYears, setContractYears] = useState<number | ''>('')
  const [signingBonusInput, setSigningBonusInput] = useState('0')
  const [agentFeeInput, setAgentFeeInput] = useState('0')
  const [offerPreview, setOfferPreview] = useState<TransferOfferPreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback | null>(null)

  const loadNegotiation = useCallback(async () => {
    if (!negotiationId) {
      setLoadError('Missing negotiation id.')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)

    try {
      const [
        { data: contextData, error: contextError },
        { data: gameStateRow, error: gameStateError },
      ] = await Promise.all([
        supabase.rpc('get_rider_transfer_negotiation_page_context', {
          p_negotiation_id: negotiationId,
        }),
        supabase
          .from('game_state')
          .select('season_number, month_number, day_number, hour_number, minute_number')
          .eq('id', true)
          .maybeSingle(),
      ])

      if (contextError) throw contextError
      if (gameStateError) {
        console.error('Failed to load game state:', gameStateError)
      }

      const row = Array.isArray(contextData) ? contextData[0] : contextData

      if (!row) {
        setContextRow(null)
        setGameState(null)
        setLoadError('Negotiation not found.')
        setLoading(false)
        return
      }

      const typedContext = row as NegotiationPageContextRow
      setContextRow(typedContext)
      setGameState((gameStateRow as GameStateRow | null) ?? null)

      const initialSalary =
        typedContext.offer_salary_weekly ??
        typedContext.min_acceptable_salary_weekly ??
        typedContext.expected_salary_weekly ??
        typedContext.current_salary_weekly ??
        null

      setSalaryOffer(initialSalary != null ? String(Math.round(initialSalary)) : '')

      const initialYears =
        typedContext.offer_duration_seasons ?? typedContext.preferred_duration_seasons ?? 1
      setContractYears(initialYears)

      setSigningBonusInput(String(Number(typedContext.offer_signing_bonus ?? 0)))
      setAgentFeeInput(String(Number(typedContext.offer_agent_fee ?? 0)))
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load transfer negotiation.')
      setContextRow(null)
      setGameState(null)
    } finally {
      setLoading(false)
    }
  }, [negotiationId])

  useEffect(() => {
    void loadNegotiation()
  }, [loadNegotiation])

  const statusBadge = useMemo(
    () => getStatusBadgeProps(contextRow?.status ?? 'open'),
    [contextRow?.status]
  )

  const riderDisplayName = useMemo(
    () =>
      buildPreferredRiderName({
        firstName: contextRow?.rider_first_name,
        lastName: contextRow?.rider_last_name,
        displayName: contextRow?.rider_display_name,
        fallbackId: contextRow?.rider_id,
      }),
    [
      contextRow?.rider_first_name,
      contextRow?.rider_last_name,
      contextRow?.rider_display_name,
      contextRow?.rider_id,
    ]
  )

  const sellerClubName = contextRow?.seller_club_name?.trim() || 'Unknown club'
  const buyerClubName = contextRow?.buyer_club_name?.trim() || 'Unknown club'

  const offerValueLabel = useMemo(
    () => formatTransferAmount(contextRow?.offered_price ?? null),
    [contextRow?.offered_price]
  )

  const expiryLabel = useMemo(
    () => getNegotiationCountdownLabel(contextRow?.expires_on_game_date ?? null, gameState),
    [contextRow?.expires_on_game_date, gameState]
  )

  const currentGameDate = useMemo(() => getCurrentGameDateFromState(gameState), [gameState])

  const riderAge = useMemo(
    () => calculateAgeYearsFromGameDate(contextRow?.rider_birth_date, currentGameDate),
    [contextRow?.rider_birth_date, currentGameDate]
  )

  const countryName = useMemo(
    () => getCountryName(contextRow?.rider_country_code),
    [contextRow?.rider_country_code]
  )

  const isTerminal = useMemo(() => {
    const value = String(contextRow?.status || '').toLowerCase()
    return ['accepted', 'declined', 'rejected', 'expired', 'completed'].includes(value)
  }, [contextRow?.status])

  const isLocked = useMemo(() => {
    if (!contextRow?.locked_until) return false
    const ts = new Date(contextRow.locked_until).getTime()
    if (Number.isNaN(ts)) return false
    return ts > Date.now()
  }, [contextRow?.locked_until])

  const canSubmit = !submitting && !isTerminal && !isLocked
  const workingNegotiationId = contextRow?.negotiation_id ?? negotiationId ?? null

  const parsedSalary = useMemo(() => normalizeSalaryInput(salaryOffer), [salaryOffer])
  const parsedDuration = useMemo(
    () => (typeof contractYears === 'number' ? contractYears : Number(contractYears || 0)),
    [contractYears]
  )
  const parsedSigningBonus = useMemo(
    () => normalizeMoneyInput(signingBonusInput),
    [signingBonusInput]
  )
  const parsedAgentFee = useMemo(() => normalizeMoneyInput(agentFeeInput), [agentFeeInput])

  const parsedSigningBonusPreview = parsedSigningBonus ?? 0
  const parsedAgentFeePreview = parsedAgentFee ?? 0
  const estimatedUpfrontCost = parsedSigningBonusPreview + parsedAgentFeePreview
  const transferOfferValue = contextRow?.offered_price ?? null

  useEffect(() => {
    let isCancelled = false

    if (!workingNegotiationId || isTerminal) {
      setOfferPreview(null)
      setPreviewLoading(false)
      return
    }

    if (
      !parsedSalary ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration < MIN_CONTRACT_YEARS ||
      parsedDuration > MAX_CONTRACT_YEARS ||
      parsedSigningBonus == null ||
      parsedSigningBonus < 0 ||
      parsedAgentFee == null ||
      parsedAgentFee < 0
    ) {
      setOfferPreview(null)
      setPreviewLoading(false)
      return
    }

    setPreviewLoading(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('preview_rider_transfer_contract_offer', {
          p_negotiation_id: workingNegotiationId,
          p_offer_salary_weekly: parsedSalary,
          p_offer_duration_seasons: parsedDuration,
          p_offer_signing_bonus: parsedSigningBonus,
          p_offer_agent_fee: parsedAgentFee,
        })

        if (error) throw error
        if (isCancelled) return

        setOfferPreview(normalizeOfferPreview(data))
      } catch (error) {
        if (isCancelled) return
        console.error('preview_rider_transfer_contract_offer failed:', error)
        setOfferPreview(null)
      } finally {
        if (!isCancelled) {
          setPreviewLoading(false)
        }
      }
    }, 250)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    workingNegotiationId,
    isTerminal,
    parsedSalary,
    parsedDuration,
    parsedSigningBonus,
    parsedAgentFee,
  ])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!contextRow || !workingNegotiationId) return

    if (!parsedSalary) {
      setSubmitError('Please provide a valid weekly salary.')
      return
    }

    if (
      !Number.isFinite(parsedDuration) ||
      parsedDuration < MIN_CONTRACT_YEARS ||
      parsedDuration > MAX_CONTRACT_YEARS
    ) {
      setSubmitError(
        `Contract length must be between ${MIN_CONTRACT_YEARS} and ${MAX_CONTRACT_YEARS} seasons.`
      )
      return
    }

    if (parsedSigningBonus == null || parsedSigningBonus < 0) {
      setSubmitError('Signing bonus must be 0 or greater.')
      return
    }

    if (parsedAgentFee == null || parsedAgentFee < 0) {
      setSubmitError('Agent fee must be 0 or greater.')
      return
    }

    if (isTerminal) {
      setSubmitError('This negotiation is already closed.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setSubmitFeedback(null)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'submit_rider_transfer_contract_offer',
        {
          p_negotiation_id: workingNegotiationId,
          p_offer_salary_weekly: parsedSalary,
          p_offer_duration_seasons: parsedDuration,
          p_offer_signing_bonus: parsedSigningBonus,
          p_offer_agent_fee: parsedAgentFee,
        }
      )

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
        feedback = { kind: 'success', message: rpcMessage }
      } else if (
        rpcStatus === 'declined' ||
        rpcStatus === 'rejected' ||
        rpcStatus === 'expired'
      ) {
        feedback = { kind: 'error', message: rpcMessage }
      }

      setSubmitFeedback(feedback)
      await loadNegotiation()
    } catch (e: any) {
      console.error('submit_rider_transfer_contract_offer failed:', e)
      setSubmitError(
        e?.message || e?.details || e?.hint || 'Failed to submit rider contract offer.'
      )
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

  if (loadError) {
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
          <div className="mt-1 text-sm text-rose-600">{loadError}</div>
        </div>
      </div>
    )
  }

  if (!contextRow) {
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

      {submitFeedback ? (
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
      ) : null}

      {submitError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}

      {isLocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Negotiation is temporarily locked until{' '}
          <span className="font-semibold">{formatDateTime(contextRow.locked_until)}</span>.
        </div>
      ) : null}

      {isTerminal ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {String(contextRow.status).toLowerCase() === 'completed' ||
          String(contextRow.status).toLowerCase() === 'accepted'
            ? 'This transfer has been completed.'
            : String(contextRow.status).toLowerCase() === 'expired'
              ? 'This negotiation expired before agreement was reached.'
              : 'This negotiation is closed and can no longer be updated.'}
        </div>
      ) : null}

      <div className="rounded-xl border border-yellow-500 bg-yellow-400/95 p-5 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-950/75">
              Transfer Negotiation
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
              {riderDisplayName}
            </h1>
            <div className="mt-2 text-sm text-slate-900/80">
              Between <span className="font-semibold">{buyerClubName}</span> and{' '}
              <span className="font-semibold">{sellerClubName}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/60 px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900/70">
                Offer Value
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{offerValueLabel}</div>
            </div>

            <div className="rounded-lg bg-white/60 px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900/70">
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
                <RiderPortrait riderName={riderDisplayName} imageUrl={contextRow.rider_image_url} />
              </div>

              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {riderDisplayName}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {contextRow.rider_country_code ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5">
                      <CountryFlag countryCode={contextRow.rider_country_code} />
                      <span>{countryName}</span>
                    </span>
                  ) : null}

                  {riderAge != null ? (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                      Age {riderAge}
                    </span>
                  ) : null}

                  {contextRow.rider_role ? (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                      {contextRow.rider_role}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Transfer Context</h2>

            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Buyer Club</span>
                <span className="font-medium">{buyerClubName}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Seller Club</span>
                <span className="font-medium">{sellerClubName}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Offer Value</span>
                <span className="font-semibold">{offerValueLabel}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Market Value</span>
                <span className="font-medium">
                  {formatTransferAmount(contextRow.rider_market_value)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Preferred minimum salary</span>
                <span className="font-medium">
                  {formatWeeklySalary(contextRow.min_acceptable_salary_weekly)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Preferred contract</span>
                <span className="font-medium">
                  {contextRow.preferred_duration_seasons
                    ? `${contextRow.preferred_duration_seasons} season${
                        contextRow.preferred_duration_seasons === 1 ? '' : 's'
                      }`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Attempts</span>
                <span className="font-medium">
                  {contextRow.attempt_count ?? 0}
                  {contextRow.max_attempts ? ` / ${contextRow.max_attempts}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Offer Terms</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    {formatWeeklySalary(contextRow.offer_salary_weekly)}
                  </span>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Contract Length (seasons)
                </label>
                <input
                  type="number"
                  min={MIN_CONTRACT_YEARS}
                  max={MAX_CONTRACT_YEARS}
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
                    {contextRow.offer_duration_seasons
                      ? `${contextRow.offer_duration_seasons} season${
                          contextRow.offer_duration_seasons === 1 ? '' : 's'
                        }`
                      : '—'}
                  </span>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Signing Bonus
                </label>
                <input
                  type="text"
                  value={signingBonusInput}
                  onChange={(event) => setSigningBonusInput(event.target.value)}
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Optional. Extra incentive for the rider. Current:{' '}
                  <span className="font-medium">
                    {formatMoney(contextRow.offer_signing_bonus ?? 0)}
                  </span>
                  . No minimum.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Agent Fee
                </label>
                <input
                  type="text"
                  value={agentFeeInput}
                  onChange={(event) => setAgentFeeInput(event.target.value)}
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Optional. Extra incentive for the rider. Current:{' '}
                  <span className="font-medium">{formatMoney(contextRow.offer_agent_fee ?? 0)}</span>
                  . No minimum.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">Financial Summary</div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Signing bonus</span>
                <span className="font-medium">{formatMoney(parsedSigningBonusPreview)}</span>
              </div>

              <div className="mt-1 flex items-center justify-between gap-3">
                <span>Agent fee</span>
                <span className="font-medium">{formatMoney(parsedAgentFeePreview)}</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">Total up-front cost</span>
                <span className="font-semibold text-slate-900">
                  {formatMoney(estimatedUpfrontCost)}
                </span>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                Transfer fee remains separate from these extras. Current transfer offer value:{' '}
                <span className="font-medium text-slate-700">
                  {formatMoney(transferOfferValue)}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">Offer Outlook</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {previewLoading
                      ? 'Calculating live rider reaction...'
                      : offerPreview?.summaryText ||
                        'Adjust the package to preview the rider response.'}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {previewLoading && !offerPreview
                      ? 'Loading...'
                      : getOfferOutlookLabel(offerPreview)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {offerPreview?.acceptancePercent != null
                      ? `${offerPreview.acceptancePercent}% preview`
                      : previewLoading
                        ? 'Loading...'
                        : 'No preview'}
                  </div>
                </div>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${getOfferOutlookTone(
                    offerPreview
                  ).barClassName}`}
                  style={{
                    width: `${Math.max(4, offerPreview?.acceptancePercent ?? 0)}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Terms'}
              </button>
            </div>
          </form>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Rider Response</h2>

            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Latest Visible Reason
                </div>
                <div className="mt-1">{formatNegotiationReason(contextRow.closed_reason)}</div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Created</div>
                  <div className="mt-0.5">{formatDateTime(contextRow.created_at)}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Last Updated</div>
                  <div className="mt-0.5">{formatDateTime(contextRow.updated_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}