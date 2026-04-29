/**
 * RiderFreeAgentNegotiationPage.tsx
 *
 * Dashboard page for handling a single rider free-agent contract negotiation.
 *
 * Purpose:
 * - Load an existing free-agent negotiation by ID.
 * - Or load a draft negotiation when route param is "new" or absent.
 * - Display rider info, club context, current status and expiry.
 * - Allow editing weekly salary and contract duration, then submit via RPC.
 * - In draft mode, create the negotiation only when the first offer is submitted.
 * - Surface the rider's visible rejection / counter reason to the user.
 */

import React, {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'
import {
  formatWeeklySalary,
  getCountryName,
  getFlagImageUrl,
} from '../../../features/squad/utils/formatters'

/**
 * NegotiationStatus
 * Enum-like union for negotiation lifecycle states.
 */
type NegotiationStatus =
  | 'draft'
  | 'open'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'declined'
  | 'completed'
  | 'countered'
  | string

/**
 * GameStateRow
 * Minimal game_state snapshot for computing game date / expiry.
 */
type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

/**
 * FreeAgentNegotiationPageContextRow
 * Expected shape of the free-agent negotiation context RPC result.
 */
type FreeAgentNegotiationPageContextRow = {
  negotiation_id: string
  rider_id: string | null
  club_id: string | null
  club_name: string | null

  status: NegotiationStatus
  current_salary_weekly: number | null
  expected_salary_weekly: number | null
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  min_acceptable_salary_weekly: number | null
  preferred_duration_seasons: number | null

  rider_market_value?: number | null
  offer_signing_bonus?: number | null
  offer_agent_fee?: number | null

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
}

/**
 * DraftFreeAgentRow
 * Draft-mode free-agent row loaded directly from rider_free_agents.
 */
type DraftFreeAgentRow = {
  id: string
  rider_id: string
  status: string | null
  expected_salary_weekly: number | null
  min_acceptable_salary_weekly: number | null
  preferred_duration_seasons: number | null
  expires_on_game_date: string | null
}

/**
 * DraftRiderProfilePayload
 * Draft-mode rider profile payload loaded from get_external_rider_profile.
 */
type DraftRiderProfilePayload = {
  profile?: {
    id: string
    firstName?: string | null
    lastName?: string | null
    displayName?: string | null
    countryCode?: string | null
    role?: string | null
    birthDate?: string | null
    imageUrl?: string | null
    marketValue?: number | null
    salary?: number | null
  } | null
}

/**
 * StatusBadgeDescriptor
 * Small visual config for status badge.
 */
type StatusBadgeDescriptor = {
  label: string
  className: string
}

/**
 * SubmitFeedback
 * Feedback state after submitting an offer.
 */
type SubmitFeedback = {
  kind: 'success' | 'warning' | 'error'
  message: string
}

/**
 * RpcResultRow
 * Generic RPC result row for interpreting submit RPC outcomes.
 */
type RpcResultRow = Record<string, unknown>

/**
 * EffectiveRiderProfile
 * Normalized rider profile used by the UI in both draft and live modes.
 */
type EffectiveRiderProfile = {
  id: string
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  countryCode?: string | null
  role?: string | null
  birthDate?: string | null
  imageUrl?: string | null
  marketValue?: number | null
  salary?: number | null
}

type OfferPreviewRpcRow = {
  acceptance_percent?: number | null
  acceptance_band?: string | null
  predicted_outcome?: string | null
  summary_text?: string | null
  primary_reason?: string | null
  salary_score?: number | null
  duration_score?: number | null
  bonus_score?: number | null
  fee_score?: number | null
  tier_score?: number | null
  tier_gap?: number | null
  desired_tier?: string | null
  club_tier?: string | null
  hard_block?: boolean | null
  reasons?: unknown
}

type OfferPreviewState = {
  acceptancePercent: number
  acceptanceBand: string
  predictedOutcome: string
  summaryText: string
  primaryReason: string
  salaryScore: number
  durationScore: number
  bonusScore: number
  feeScore: number
  tierScore: number
  tierGap: number
  desiredTier: string | null
  clubTier: string | null
  hardBlock: boolean
  reasons: string[]
}

/**
 * looksLikeUuid
 * Heuristic check if a string resembles a UUID.
 */
function looksLikeUuid(value?: string | null): boolean {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

/**
 * buildPreferredRiderName
 * Builds a best-effort rider display name from name fields / fallback id.
 */
function buildPreferredRiderName(params: {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  fallbackId?: string | null
}): string {
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

/**
 * getCurrentGameDateFromState
 * Derives a Date from the game_state row (season/month/day/hour/minute).
 */
function getCurrentGameDateFromState(
  gameState: GameStateRow | null | undefined
): Date | null {
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

/**
 * calculateAgeYearsFromGameDate
 * Returns rider age in years relative to current game date.
 */
function calculateAgeYearsFromGameDate(
  birthDate: string | null | undefined,
  currentGameDate: Date | null
): number | null {
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

/**
 * getInitials
 * Generates initials for avatar placeholders.
 */
function getInitials(name: string): string {
  const clean = name.trim()
  if (!clean || looksLikeUuid(clean)) return 'R'

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

/**
 * formatDateTime
 * Formats a date/time string in a user-friendly way.
 */
function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

/**
 * normalizeSalaryInput
 * Converts a raw salary string into a numeric salary or null.
 */
function normalizeSalaryInput(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}

function normalizeMoneyInput(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function formatMoney(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${Math.round(value).toLocaleString()}`
}

function calculateMinimumSigningBonus(marketValue?: number | null): number {
  const safeValue = Math.max(0, Number(marketValue ?? 0))
  return Math.floor(safeValue * 0.1)
}

function calculateMinimumAgentFee(marketValue?: number | null): number {
  const safeValue = Math.max(0, Number(marketValue ?? 0))
  return Math.floor(safeValue * 0.15)
}

function normalizeOfferPreview(data: unknown): OfferPreviewState | null {
  const raw = Array.isArray(data) ? data[0] : data

  if (!raw || typeof raw !== 'object') return null

  const row = raw as OfferPreviewRpcRow

  return {
    acceptancePercent: Math.max(
      0,
      Math.min(100, Number(row.acceptance_percent ?? 0))
    ),
    acceptanceBand: String(row.acceptance_band ?? ''),
    predictedOutcome: String(row.predicted_outcome ?? ''),
    summaryText: String(row.summary_text ?? ''),
    primaryReason: String(row.primary_reason ?? ''),
    salaryScore: Number(row.salary_score ?? 0),
    durationScore: Number(row.duration_score ?? 0),
    bonusScore: Number(row.bonus_score ?? 0),
    feeScore: Number(row.fee_score ?? 0),
    tierScore: Number(row.tier_score ?? 0),
    tierGap: Number(row.tier_gap ?? 0),
    desiredTier: row.desired_tier ?? null,
    clubTier: row.club_tier ?? null,
    hardBlock: Boolean(row.hard_block),
    reasons: Array.isArray(row.reasons)
      ? row.reasons.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function getOfferOutlookLabel(preview: OfferPreviewState | null): string {
  if (!preview) return 'No preview'

  if (preview.hardBlock) return 'Extremely difficult'

  switch (preview.acceptanceBand) {
    case 'very_high':
      return 'Very high chance'
    case 'high':
      return 'High chance'
    case 'moderate':
      return 'Moderate chance'
    case 'low':
      return 'Low chance'
    case 'very_low':
      return 'Very low chance'
    default:
      return 'Unclear'
  }
}

function getOfferOutlookTone(preview: OfferPreviewState | null): string {
  if (!preview) return 'bg-slate-300'

  if (preview.acceptancePercent >= 80) return 'bg-emerald-500'
  if (preview.acceptancePercent >= 60) return 'bg-lime-500'
  if (preview.acceptancePercent >= 40) return 'bg-amber-400'
  if (preview.acceptancePercent >= 20) return 'bg-orange-400'
  return 'bg-rose-500'
}

/**
 * getStatusBadgeProps
 * Maps negotiation status to display label and colors.
 */
function getStatusBadgeProps(status: NegotiationStatus): StatusBadgeDescriptor {
  const value = String(status || '').toLowerCase()

  if (value === 'draft') {
    return {
      label: 'Draft',
      className: 'bg-violet-50 text-violet-800 border-violet-200',
    }
  }

  if (value === 'open') {
    return {
      label: 'Open',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    }
  }

  if (value === 'pending' || value === 'countered') {
    return {
      label: 'Pending',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    }
  }

  if (value === 'accepted' || value === 'completed') {
    return {
      label: 'Accepted',
      className: 'bg-blue-50 text-blue-800 border-blue-200',
    }
  }

  if (value === 'declined' || value === 'rejected') {
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

/**
 * formatNegotiationReason
 * Human-readable mapping for backend rejection/counter reasons.
 */
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

/**
 * getFirstRpcRow
 * Normalizes RPC response to the first result row.
 */
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

/**
 * getRpcString
 * Reads the first non-empty string among candidate keys from an RPC row.
 */
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

/**
 * getRpcStringFromData
 * Reads a string value from scalar / array / object RPC responses.
 */
function getRpcStringFromData(data: unknown, keys: string[]): string | null {
  if (typeof data === 'string' && data.trim() !== '') {
    return data.trim()
  }

  if (Array.isArray(data)) {
    const first = data[0]

    if (typeof first === 'string' && first.trim() !== '') {
      return first.trim()
    }

    if (first && typeof first === 'object') {
      return getRpcString(first as RpcResultRow, keys)
    }

    return null
  }

  if (data && typeof data === 'object') {
    return getRpcString(data as RpcResultRow, keys)
  }

  return null
}

/**
 * getNegotiationCountdownLabel
 * Builds a human-readable countdown label for negotiation expiry.
 */
function getNegotiationCountdownLabel(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null
): string {
  if (!expiresOnGameDate) return 'No expiry'

  const currentGameDate = getCurrentGameDateFromState(gameState)
  if (!currentGameDate) {
    return expiresOnGameDate
  }

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

/**
 * CountryFlag
 * Small country flag renderer with graceful fallback.
 */
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

/**
 * RiderPortrait
 * Rider portrait with fallback to initials-based avatar.
 */
function RiderPortrait({
  riderName,
  imageUrl,
}: {
  riderName: string
  imageUrl?: string | null
}): JSX.Element {
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

/**
 * RiderFreeAgentNegotiationPage
 * Page component for a single free-agent contract negotiation or draft.
 */
export default function RiderFreeAgentNegotiationPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ negotiationId?: string }>()

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  )

  const negotiationIdParam = params.negotiationId ?? null
  const freeAgentIdFromQuery = searchParams.get('freeAgentId')
  const riderIdFromQuery = searchParams.get('riderId')
  const returnTo = searchParams.get('returnTo') || '/dashboard/transfers'

  const isDraftMode = !negotiationIdParam || negotiationIdParam === 'new'
  const negotiationId = isDraftMode ? null : negotiationIdParam

  const [contextRow, setContextRow] =
    useState<FreeAgentNegotiationPageContextRow | null>(null)
  const [draftFreeAgent, setDraftFreeAgent] = useState<DraftFreeAgentRow | null>(null)
  const [draftRiderProfile, setDraftRiderProfile] =
    useState<DraftRiderProfilePayload | null>(null)
  const [gameState, setGameState] = useState<GameStateRow | null>(null)

  const [salaryInput, setSalaryInput] = useState('')
  const [durationInput, setDurationInput] = useState('1')
  const [signingBonusInput, setSigningBonusInput] = useState('')
  const [agentFeeInput, setAgentFeeInput] = useState('')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback | null>(null)
  const [offerPreview, setOfferPreview] = useState<OfferPreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  /**
   * refreshExistingNegotiation
   * Reloads the game state and real negotiation context.
   */
  async function refreshExistingNegotiation(
    workingNegotiationId?: string | null
  ): Promise<void> {
    const targetNegotiationId = workingNegotiationId ?? negotiationId

    if (!targetNegotiationId) {
      throw new Error('Missing negotiation id.')
    }

    const [
      { data: gameStateRow, error: gameStateError },
      { data: contextData, error: contextError },
    ] = await Promise.all([
      supabase
        .from('game_state')
        .select(
          'season_number, month_number, day_number, hour_number, minute_number'
        )
        .eq('id', true)
        .maybeSingle(),
      supabase.rpc('get_rider_free_agent_negotiation_page_context', {
        p_negotiation_id: targetNegotiationId,
      }),
    ])

    if (gameStateError) throw gameStateError
    if (contextError) throw contextError

    const nextContext = Array.isArray(contextData) ? contextData[0] : contextData

    if (!nextContext) {
      throw new Error('Negotiation not found.')
    }

    const typedContext = nextContext as FreeAgentNegotiationPageContextRow
    const typedGameState = (gameStateRow as GameStateRow | null) ?? null

    setContextRow(typedContext)
    setGameState(typedGameState)

    const defaultSalary = Math.round(
      Number(
        typedContext.offer_salary_weekly ??
          typedContext.min_acceptable_salary_weekly ??
          typedContext.expected_salary_weekly ??
          typedContext.current_salary_weekly ??
          0
      )
    )

    const defaultDuration = Number(
      typedContext.offer_duration_seasons ??
        typedContext.preferred_duration_seasons ??
        1
    )

    const initialSigningBonus = Math.max(
      Number(typedContext.offer_signing_bonus ?? 0),
      calculateMinimumSigningBonus(typedContext.rider_market_value ?? 0)
    )

    const initialAgentFee = Math.max(
      Number(typedContext.offer_agent_fee ?? 0),
      calculateMinimumAgentFee(typedContext.rider_market_value ?? 0)
    )

    setSalaryInput(String(defaultSalary > 0 ? defaultSalary : 0))
    setDurationInput(String(defaultDuration > 0 ? defaultDuration : 1))
    setSigningBonusInput(String(initialSigningBonus))
    setAgentFeeInput(String(initialAgentFee))
  }

  useEffect(() => {
    let mounted = true

    async function loadPage() {
      setLoading(true)
      setLoadError(null)
      setSubmitError(null)
      setSubmitFeedback(null)

      setContextRow(null)
      setDraftFreeAgent(null)
      setDraftRiderProfile(null)
      setOfferPreview(null)

      try {
        const { data: gameStateRow, error: gameStateError } = await supabase
          .from('game_state')
          .select(
            'season_number, month_number, day_number, hour_number, minute_number'
          )
          .eq('id', true)
          .maybeSingle()

        if (gameStateError) throw gameStateError
        if (!mounted) return

        setGameState((gameStateRow as GameStateRow | null) ?? null)

        if (isDraftMode) {
          if (!freeAgentIdFromQuery) {
            throw new Error('Missing freeAgentId in URL.')
          }

          if (!riderIdFromQuery) {
            throw new Error('Missing riderId in URL.')
          }

          const [
            { data: freeAgentRow, error: freeAgentError },
            { data: riderProfileData, error: riderProfileError },
          ] = await Promise.all([
            supabase
              .from('rider_free_agents')
              .select(
                'id, rider_id, status, expected_salary_weekly, min_acceptable_salary_weekly, preferred_duration_seasons, expires_on_game_date'
              )
              .eq('id', freeAgentIdFromQuery)
              .eq('rider_id', riderIdFromQuery)
              .maybeSingle(),
            supabase.rpc('get_external_rider_profile', {
              p_rider_id: riderIdFromQuery,
            }),
          ])

          if (freeAgentError) throw freeAgentError
          if (!freeAgentRow) throw new Error('Free-agent row not found.')

          const normalizedRiderProfileData = Array.isArray(riderProfileData)
            ? riderProfileData[0]
            : riderProfileData

          if (riderProfileError) throw riderProfileError
          if (!normalizedRiderProfileData?.profile) {
            throw new Error('Rider profile not found.')
          }

          if (!mounted) return

          const typedFreeAgentRow = freeAgentRow as DraftFreeAgentRow
          const typedRiderProfile =
            normalizedRiderProfileData as DraftRiderProfilePayload

          setDraftFreeAgent(typedFreeAgentRow)
          setDraftRiderProfile(typedRiderProfile)

          const defaultSalary = Math.round(
            Number(
              typedFreeAgentRow.expected_salary_weekly ??
                typedFreeAgentRow.min_acceptable_salary_weekly ??
                typedRiderProfile.profile?.salary ??
                0
            )
          )

          const defaultDuration = Number(
            typedFreeAgentRow.preferred_duration_seasons ?? 1
          )

          setSalaryInput(String(defaultSalary > 0 ? defaultSalary : 0))
          setDurationInput(String(defaultDuration > 0 ? defaultDuration : 1))

          const initialSigningBonus = calculateMinimumSigningBonus(
            typedRiderProfile.profile?.marketValue ?? 0
          )
          const initialAgentFee = calculateMinimumAgentFee(
            typedRiderProfile.profile?.marketValue ?? 0
          )

          setSigningBonusInput(String(initialSigningBonus))
          setAgentFeeInput(String(initialAgentFee))

          return
        }

        if (!negotiationId) {
          throw new Error('Missing negotiation id.')
        }

        const { data: contextData, error: contextError } = await supabase.rpc(
          'get_rider_free_agent_negotiation_page_context',
          { p_negotiation_id: negotiationId }
        )

        if (contextError) throw contextError

        const nextContext = Array.isArray(contextData) ? contextData[0] : contextData

        if (!nextContext) {
          throw new Error('Negotiation not found.')
        }

        if (!mounted) return

        const typedContext = nextContext as FreeAgentNegotiationPageContextRow

        setContextRow(typedContext)

        const defaultSalary = Math.round(
          Number(
            typedContext.offer_salary_weekly ??
              typedContext.min_acceptable_salary_weekly ??
              typedContext.expected_salary_weekly ??
              typedContext.current_salary_weekly ??
              0
          )
        )

        const defaultDuration = Number(
          typedContext.offer_duration_seasons ??
            typedContext.preferred_duration_seasons ??
            1
        )

        const initialSigningBonus = Math.max(
          Number(typedContext.offer_signing_bonus ?? 0),
          calculateMinimumSigningBonus(typedContext.rider_market_value ?? 0)
        )

        const initialAgentFee = Math.max(
          Number(typedContext.offer_agent_fee ?? 0),
          calculateMinimumAgentFee(typedContext.rider_market_value ?? 0)
        )

        setSalaryInput(String(defaultSalary > 0 ? defaultSalary : 0))
        setDurationInput(String(defaultDuration > 0 ? defaultDuration : 1))
        setSigningBonusInput(String(initialSigningBonus))
        setAgentFeeInput(String(initialAgentFee))
      } catch (e: any) {
        if (!mounted) return
        setLoadError(e?.message ?? 'Failed to load free-agent negotiation page.')
        setContextRow(null)
        setDraftFreeAgent(null)
        setDraftRiderProfile(null)
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }

    void loadPage()

    return () => {
      mounted = false
    }
  }, [isDraftMode, negotiationId, freeAgentIdFromQuery, riderIdFromQuery])

  const effectiveRiderProfile = useMemo<EffectiveRiderProfile | null>(() => {
    if (isDraftMode) {
      const profile = draftRiderProfile?.profile ?? null
      if (!profile) return null

      return {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        countryCode: profile.countryCode,
        role: profile.role,
        birthDate: profile.birthDate,
        imageUrl: profile.imageUrl,
        marketValue: profile.marketValue,
        salary: profile.salary,
      }
    }

    if (!contextRow) return null

    return {
      id: contextRow.rider_id ?? contextRow.negotiation_id,
      firstName: contextRow.rider_first_name,
      lastName: contextRow.rider_last_name,
      displayName: contextRow.rider_display_name,
      countryCode: contextRow.rider_country_code,
      role: contextRow.rider_role,
      birthDate: contextRow.rider_birth_date,
      imageUrl: contextRow.rider_image_url,
      marketValue: contextRow.rider_market_value ?? null,
      salary: contextRow.current_salary_weekly,
    }
  }, [isDraftMode, draftRiderProfile, contextRow])

  const effectiveStatus = isDraftMode ? 'draft' : contextRow?.status ?? 'open'

  const effectiveExpiresOnGameDate = isDraftMode
    ? draftFreeAgent?.expires_on_game_date ?? null
    : contextRow?.expires_on_game_date ?? null

  const effectiveExpectedSalaryWeekly = isDraftMode
    ? draftFreeAgent?.expected_salary_weekly ?? null
    : contextRow?.expected_salary_weekly ?? null

  const effectiveMinAcceptableSalaryWeekly = isDraftMode
    ? draftFreeAgent?.min_acceptable_salary_weekly ?? null
    : contextRow?.min_acceptable_salary_weekly ?? null

  const effectivePreferredDurationSeasons = isDraftMode
    ? draftFreeAgent?.preferred_duration_seasons ?? 1
    : contextRow?.preferred_duration_seasons ?? 1

  const effectiveRiderName = useMemo(
    () =>
      buildPreferredRiderName({
        firstName: effectiveRiderProfile?.firstName,
        lastName: effectiveRiderProfile?.lastName,
        displayName: effectiveRiderProfile?.displayName,
        fallbackId: effectiveRiderProfile?.id ?? null,
      }),
    [
      effectiveRiderProfile?.firstName,
      effectiveRiderProfile?.lastName,
      effectiveRiderProfile?.displayName,
      effectiveRiderProfile?.id,
    ]
  )

  const riderMarketValue = effectiveRiderProfile?.marketValue ?? null

  const minimumSigningBonus = useMemo(
    () => calculateMinimumSigningBonus(riderMarketValue),
    [riderMarketValue]
  )

  const minimumAgentFee = useMemo(
    () => calculateMinimumAgentFee(riderMarketValue),
    [riderMarketValue]
  )

  const parsedSigningBonusPreview =
    normalizeMoneyInput(signingBonusInput) ?? minimumSigningBonus

  const parsedAgentFeePreview =
    normalizeMoneyInput(agentFeeInput) ?? minimumAgentFee

  const estimatedUpfrontCost =
    parsedSigningBonusPreview + parsedAgentFeePreview

  const statusBadge = useMemo(
    () => getStatusBadgeProps(effectiveStatus),
    [effectiveStatus]
  )

  const clubName = !isDraftMode
    ? contextRow?.club_name?.trim() || 'Your club'
    : 'Your club'

  const expiryLabel = useMemo(
    () => getNegotiationCountdownLabel(effectiveExpiresOnGameDate, gameState),
    [effectiveExpiresOnGameDate, gameState]
  )

  const currentGameDate = useMemo(
    () => getCurrentGameDateFromState(gameState),
    [gameState]
  )

  const riderAge = useMemo(
    () => calculateAgeYearsFromGameDate(effectiveRiderProfile?.birthDate, currentGameDate),
    [effectiveRiderProfile?.birthDate, currentGameDate]
  )

  const countryName = useMemo(
    () => getCountryName(effectiveRiderProfile?.countryCode),
    [effectiveRiderProfile?.countryCode]
  )

  const isTerminal = useMemo(() => {
    const value = String(effectiveStatus || '').toLowerCase()
    return ['accepted', 'declined', 'rejected', 'expired', 'completed'].includes(
      value
    )
  }, [effectiveStatus])

  const isLocked = useMemo(() => {
    if (isDraftMode || !contextRow?.locked_until) return false
    const ts = new Date(contextRow.locked_until).getTime()
    if (Number.isNaN(ts)) return false
    return ts > Date.now()
  }, [isDraftMode, contextRow?.locked_until])

  const isDraftExpired = isDraftMode && expiryLabel === 'Expired'

  const canSubmit = !submitting && !isTerminal && !isLocked && !isDraftExpired

  const currentShownSalary = isDraftMode
    ? effectiveExpectedSalaryWeekly ??
      effectiveMinAcceptableSalaryWeekly ??
      effectiveRiderProfile?.salary ??
      null
    : contextRow?.offer_salary_weekly ??
      effectiveExpectedSalaryWeekly ??
      effectiveMinAcceptableSalaryWeekly ??
      effectiveRiderProfile?.salary ??
      null

  const currentShownDuration = isDraftMode
    ? effectivePreferredDurationSeasons ?? 1
    : contextRow?.offer_duration_seasons ?? effectivePreferredDurationSeasons ?? 1

  useEffect(() => {
    let active = true

    async function loadOfferPreview() {
      const parsedSalary = normalizeSalaryInput(salaryInput)
      const parsedDuration = Number(durationInput)
      const parsedSigningBonus = normalizeMoneyInput(signingBonusInput)
      const parsedAgentFee = normalizeMoneyInput(agentFeeInput)

      const targetFreeAgentId = isDraftMode ? draftFreeAgent?.id ?? null : null
      const targetNegotiationId = !isDraftMode ? negotiationId ?? null : null

      if (
        !parsedSalary ||
        !Number.isFinite(parsedDuration) ||
        parsedDuration <= 0 ||
        parsedSigningBonus == null ||
        parsedAgentFee == null ||
        (!targetFreeAgentId && !targetNegotiationId)
      ) {
        if (active) {
          setOfferPreview(null)
          setPreviewLoading(false)
        }
        return
      }

      try {
        if (active) setPreviewLoading(true)

        const { data, error } = await supabase.rpc(
          'preview_rider_free_agent_offer',
          {
            p_offer_salary_weekly: parsedSalary,
            p_offer_duration_seasons: parsedDuration,
            p_offer_signing_bonus: parsedSigningBonus,
            p_offer_agent_fee: parsedAgentFee,
            p_free_agent_id: targetFreeAgentId,
            p_negotiation_id: targetNegotiationId,
          }
        )

        if (error) throw error

        if (!active) return

        setOfferPreview(normalizeOfferPreview(data))
      } catch {
        if (!active) return
        setOfferPreview(null)
      } finally {
        if (active) {
          setPreviewLoading(false)
        }
      }
    }

    void loadOfferPreview()

    return () => {
      active = false
    }
  }, [
    isDraftMode,
    draftFreeAgent?.id,
    negotiationId,
    salaryInput,
    durationInput,
    signingBonusInput,
    agentFeeInput,
  ])

  async function handleSubmitOffer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const parsedSalary = normalizeSalaryInput(salaryInput)
    const parsedDuration = Number(durationInput)
    const parsedSigningBonus = normalizeMoneyInput(signingBonusInput)
    const parsedAgentFee = normalizeMoneyInput(agentFeeInput)

    if (!parsedSalary || parsedSalary <= 0) {
      setSubmitError('Please enter a valid weekly salary.')
      return
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setSubmitError('Please enter a valid contract duration.')
      return
    }

    if (parsedSigningBonus == null || parsedSigningBonus < minimumSigningBonus) {
      setSubmitError(
        `Signing bonus cannot be below the minimum of ${formatMoney(minimumSigningBonus)}.`
      )
      return
    }

    if (parsedAgentFee == null || parsedAgentFee < minimumAgentFee) {
      setSubmitError(
        `Agent fee cannot be below the minimum of ${formatMoney(minimumAgentFee)}.`
      )
      return
    }

    if (isTerminal) {
      setSubmitError('This negotiation is already closed.')
      return
    }

    if (isLocked) {
      setSubmitError('This negotiation is temporarily locked.')
      return
    }

    if (isDraftExpired) {
      setSubmitError(
        'This free-agent opportunity has already expired and can no longer be started.'
      )
      return
    }

    try {
      setSubmitting(true)
      setSubmitError(null)
      setSubmitFeedback(null)

      let workingNegotiationId = negotiationId

      if (isDraftMode) {
        if (!draftFreeAgent?.id) {
          throw new Error('Free agent id is missing.')
        }

        console.log('Opening free-agent negotiation...', {
          freeAgentId: draftFreeAgent.id,
          riderId: draftFreeAgent.rider_id,
        })

        const { data: createData, error: createError } = await supabase.rpc(
          'open_free_agent_negotiation',
          {
            p_free_agent_id: draftFreeAgent.id,
          }
        )

        console.log('open_free_agent_negotiation response:', {
          createData,
          createError,
        })

        if (createError) {
          throw new Error(
            createError.message || 'Failed to open free-agent negotiation.'
          )
        }

        workingNegotiationId = getRpcStringFromData(createData, [
          'negotiation_id',
          'id',
        ])

        if (!workingNegotiationId) {
          throw new Error(
            `Negotiation could not be created. RPC returned: ${JSON.stringify(createData)}`
          )
        }
      }

      if (!workingNegotiationId) {
        throw new Error('Negotiation id is missing.')
      }

      const { data: submitData, error: submitRpcError } = await supabase.rpc(
        'submit_rider_free_agent_contract_offer',
        {
          p_negotiation_id: workingNegotiationId,
          p_offer_salary_weekly: parsedSalary,
          p_offer_duration_seasons: parsedDuration,
          p_offer_signing_bonus: parsedSigningBonus,
          p_offer_agent_fee: parsedAgentFee,
        }
      )

      if (submitRpcError) throw submitRpcError

      const row = getFirstRpcRow(submitData)
      const rpcStatus = getRpcString(row, [
        'status',
        'result_status',
        'outcome_status',
      ])
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

      if (rpcStatus === 'completed') {
        navigate(returnTo, { replace: true })
        return
      }

      if (isDraftMode && workingNegotiationId) {
        navigate(
          `/dashboard/transfers/free-agent-negotiations/${workingNegotiationId}?returnTo=${encodeURIComponent(
            returnTo
          )}`,
          { replace: true }
        )
        return
      }

      await refreshExistingNegotiation(workingNegotiationId)
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Failed to submit offer.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasPageData = isDraftMode
    ? Boolean(draftFreeAgent && effectiveRiderProfile)
    : Boolean(contextRow)

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="text-sm text-slate-600">
          {isDraftMode ? 'Loading draft negotiation...' : 'Loading free-agent negotiation...'}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back
        </button>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">
            Could not load negotiation
          </div>
          <div className="mt-1 text-sm text-rose-600">{loadError}</div>
        </div>
      </div>
    )
  }

  if (!hasPageData) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back
        </button>

        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">
            {isDraftMode ? 'Draft negotiation not found.' : 'Negotiation not found.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <div className="font-semibold">Negotiation is temporarily locked.</div>

          <div className="mt-1">
            The rider was not satisfied with your latest offer and has paused the
            negotiation until{' '}
            <span className="font-semibold">
              {formatDateTime(contextRow?.locked_until)}
            </span>.
          </div>

          <div className="mt-2 text-xs text-amber-800">
            Improve the weekly salary, contract length, signing bonus and/or agent fee
            before trying again.
          </div>
        </div>
      ) : null}

      {isDraftExpired ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          This free-agent opportunity has already expired and can no longer be started.
        </div>
      ) : null}

      {isTerminal ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {String(effectiveStatus).toLowerCase() === 'completed' ||
          String(effectiveStatus).toLowerCase() === 'accepted'
            ? 'This contract has been completed.'
            : String(effectiveStatus).toLowerCase() === 'expired'
            ? 'This negotiation expired before agreement was reached.'
            : 'This negotiation is closed and can no longer be updated.'}
        </div>
      ) : null}

      <div className="rounded-xl border border-yellow-500 bg-yellow-400/95 p-5 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-950/75">
              {isDraftMode ? 'Free Agent Negotiation Draft' : 'Free Agent Negotiation'}
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
              {effectiveRiderName}
            </h1>
            <div className="mt-2 text-sm text-slate-900/80">
              Contract discussion between <span className="font-semibold">{clubName}</span> and
              free agent <span className="font-semibold">{effectiveRiderName}</span>.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/60 px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900/70">
                Preferred Weekly Salary
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {formatWeeklySalary(
                  effectiveMinAcceptableSalaryWeekly ??
                    effectiveExpectedSalaryWeekly ??
                    effectiveRiderProfile?.salary ??
                    null
                )}
              </div>
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
                <RiderPortrait
                  riderName={effectiveRiderName}
                  imageUrl={effectiveRiderProfile?.imageUrl}
                />
              </div>

              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {effectiveRiderName}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {effectiveRiderProfile?.countryCode ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5">
                      <CountryFlag countryCode={effectiveRiderProfile.countryCode} />
                      <span>{countryName}</span>
                    </span>
                  ) : null}

                  {riderAge != null ? (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                      Age {riderAge}
                    </span>
                  ) : null}

                  {effectiveRiderProfile?.role ? (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                      {effectiveRiderProfile.role}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Negotiation Context</h2>

            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Club</span>
                <span className="font-medium">{clubName}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Preferred minimum salary</span>
                <span className="font-medium">
                  {formatWeeklySalary(effectiveMinAcceptableSalaryWeekly)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Average transfer value</span>
                <span className="font-medium">{formatMoney(riderMarketValue)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Preferred contract</span>
                <span className="font-medium">
                  {effectivePreferredDurationSeasons
                    ? `${effectivePreferredDurationSeasons} season${
                        effectivePreferredDurationSeasons === 1 ? '' : 's'
                      }`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Attempts</span>
                <span className="font-medium">
                  {isDraftMode ? 0 : contextRow?.attempt_count ?? 0}
                  {!isDraftMode && contextRow?.max_attempts
                    ? ` / ${contextRow.max_attempts}`
                    : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleSubmitOffer} className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-slate-900">Offer Terms</h2>

            {isDraftMode ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Negotiation will begin only after you submit this offer.
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Weekly Salary Offer
                </label>
                <input
                  type="text"
                  value={salaryInput}
                  onChange={(event) => setSalaryInput(event.target.value)}
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="e.g. 75000"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Current:{' '}
                  <span className="font-medium">
                    {formatWeeklySalary(currentShownSalary)}
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
                  value={durationInput}
                  onChange={(event) => setDurationInput(event.target.value)}
                  disabled={!canSubmit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Current:{' '}
                  <span className="font-medium">
                    {currentShownDuration
                      ? `${currentShownDuration} season${
                          currentShownDuration === 1 ? '' : 's'
                        }`
                      : '—'}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  placeholder="e.g. 20000"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Minimum:{' '}
                  <span className="font-medium">{formatMoney(minimumSigningBonus)}</span>
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
                  placeholder="e.g. 30000"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Minimum:{' '}
                  <span className="font-medium">{formatMoney(minimumAgentFee)}</span>
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
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">Offer Outlook</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {offerPreview?.summaryText ||
                      'Adjust the package to preview the rider response.'}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {getOfferOutlookLabel(offerPreview)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {offerPreview
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
                  )}`}
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
                {submitting ? 'Submitting...' : 'Submit Offer'}
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
                <div className="mt-1">
                  {isDraftMode
                    ? 'No rider response yet. The negotiation becomes real only after you submit the first offer.'
                    : formatNegotiationReason(contextRow?.closed_reason)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Created</div>
                  <div className="mt-0.5">
                    {isDraftMode ? 'Not created yet' : formatDateTime(contextRow?.created_at)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Last Updated</div>
                  <div className="mt-0.5">
                    {isDraftMode ? 'No updates yet' : formatDateTime(contextRow?.updated_at)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}