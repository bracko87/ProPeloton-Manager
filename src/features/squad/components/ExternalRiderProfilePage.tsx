import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'
import RiderComparePanel from './RiderComparePanel'

import type { RiderDetails } from '../types'

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
} from '../utils/dates'

import {
  formatUnavailableReason,
  formatWeeklySalary,
  getCountryName,
  getFlagImageUrl,
} from '../utils/formatters'

import {
  getDefaultRiderAvailabilityStatus,
  getFatigueUi,
  getMoraleUi,
  getPotentialUi,
  getRiderImageUrl,
  getRiderStatusUi,
} from '../utils/rider-ui'

type ExternalRiderProfileTab = 'overview' | 'contract' | 'compare' | 'history'

type RiderSkillAttributeCode =
  | 'sprint'
  | 'climbing'
  | 'time_trial'
  | 'endurance'
  | 'flat'
  | 'recovery'
  | 'resistance'
  | 'race_iq'
  | 'teamwork'

type RiderSkillDeltaRow = {
  rider_id: string
  attribute_code: RiderSkillAttributeCode
  current_value: number
  old_value: number | null
  new_value: number | null
  delta_value: number | null
  delta_label: string | null
  delta_direction: 'positive' | 'negative' | null
  primary_source: string | null
  week_start_date: string | null
  week_end_date: string | null
  has_visible_delta: boolean
}

type RiderSkillDeltaMap = Partial<Record<RiderSkillAttributeCode, RiderSkillDeltaRow>>

type RiderCareerHistoryRow = {
  season: number | null
  season_label: string
  team_name: string
  points: number
  is_current_season: boolean
}

type RiderSeasonOverview = {
  points: number
  podiums: number
  jerseys: number
}

type RiderSeasonStatsBox = {
  races: number
  wins: number
  podiums: number
  top10: number
  points: number
}

type RiderRecentRaceRow = {
  race_name: string
  race_date: string | null
  finish_position: number | null
}

type ActiveTransferListing = {
  id: string
  rider_id: string
  seller_club_id: string
  asking_price: number
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
}

type ActiveFreeAgentRow = {
  id: string
  rider_id: string
  expires_on_game_date: string | null
  status: string
}

type ExternalRiderMarketMode = 'general' | 'transfer_list' | 'free_agent' | 'scouting'

type ExternalRiderProfilePageProps = {
  riderId?: string
  gameDate?: string | null
  marketMode?: ExternalRiderMarketMode
  onBack?: () => void
  onMakeTransferOffer?: (payload: {
    riderId: string
    riderName: string
    listingId: string
    sellerClubId: string
    askingPrice: number
  }) => void
  onOpenFreeAgentNegotiation?: (payload: {
    riderId: string
    riderName: string
    freeAgentId: string
    expiresOnGameDate: string | null
  }) => void
  onScoutRider?: (payload: {
    riderId: string
    riderName: string
  }) => void
}

const ACTIVE_TRANSFER_LISTING_STATUSES = ['listed', 'active', 'open'] as const
const ACTIVE_FREE_AGENT_STATUSES = ['available', 'open'] as const

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function normalizeGameDateInput(value: unknown): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      normalizeGameDateInput(record.game_date) ??
      normalizeGameDateInput(record.current_game_date) ??
      normalizeGameDateInput(record.date) ??
      null
    )
  }

  return null
}

function formatCompactMoneyValue(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-$' : '$'
  const formatOneDecimal = (amount: number) => amount.toFixed(1).replace(/\.0$/, '')

  if (absoluteValue >= 1_000_000_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000_000_000)}b`
  }

  if (absoluteValue >= 1_000_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000_000)}m`
  }

  if (absoluteValue >= 100_000) {
    return `${prefix}${Math.floor(absoluteValue / 1_000)}k`
  }

  if (absoluteValue >= 1_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000)}k`
  }

  return `${prefix}${Math.round(absoluteValue).toLocaleString('en-US')}`
}

function formatSkillDeltaSource(source?: string | null) {
  switch (source) {
    case 'training_camp':
      return 'Training camp'
    case 'regular_training':
      return 'Regular training'
    case 'age_decline':
      return 'Age decline'
    case 'inactivity_decay':
      return 'Inactivity'
    case 'race_experience':
      return 'Race experience'
    default:
      return null
  }
}

function getSkillAccentStyle(attribute: RiderSkillAttributeCode) {
  switch (attribute) {
    case 'sprint':
      return { soft: 'rgba(245, 158, 11, 0.18)' }
    case 'climbing':
      return { soft: 'rgba(16, 185, 129, 0.18)' }
    case 'time_trial':
      return { soft: 'rgba(59, 130, 246, 0.18)' }
    case 'endurance':
      return { soft: 'rgba(139, 92, 246, 0.18)' }
    case 'flat':
      return { soft: 'rgba(6, 182, 212, 0.18)' }
    case 'recovery':
      return { soft: 'rgba(34, 197, 94, 0.18)' }
    case 'resistance':
      return { soft: 'rgba(239, 68, 68, 0.18)' }
    case 'race_iq':
      return { soft: 'rgba(99, 102, 241, 0.18)' }
    case 'teamwork':
      return { soft: 'rgba(236, 72, 153, 0.18)' }
    default:
      return { soft: 'rgba(148, 163, 184, 0.18)' }
  }
}

function CountryFlag({
  countryCode,
  className = '',
}: {
  countryCode?: string | null
  className?: string
}) {
  const src = getFlagImageUrl(countryCode)
  const countryName = getCountryName(countryCode)
  const [hasError, setHasError] = useState(false)

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

function SectionCard({
  title,
  subtitle,
  children,
  className = '',
  headerAction,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg bg-white p-4 shadow ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {children}
    </div>
  )
}

function DetailRow({
  label,
  value,
  valueClassName = '',
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-right text-sm font-medium text-slate-800 ${valueClassName}`}>
        {value}
      </div>
    </div>
  )
}

function SimpleInfoRow({
  label,
  value,
  note,
}: {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-right text-sm font-medium text-slate-900">{value}</div>
      </div>
      {note ? <div className="mt-1 text-sm text-slate-600">{note}</div> : null}
    </div>
  )
}

function SimpleAttributeRow({
  label,
  attributeCode,
  value,
  deltaLabel,
  deltaDirection,
  sourceLabel,
}: {
  label: string
  attributeCode: RiderSkillAttributeCode
  value: number
  deltaLabel?: string | null
  deltaDirection?: 'positive' | 'negative' | null
  sourceLabel?: string | null
}) {
  const safeValue = Math.max(0, Math.min(100, value))
  const accent = getSkillAccentStyle(attributeCode)

  const deltaClasses =
    deltaDirection === 'positive'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : deltaDirection === 'negative'
        ? 'border-rose-300 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-500'

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(12, safeValue)}%`,
          background: `linear-gradient(90deg, ${accent.soft} 0%, ${accent.soft} 88%, rgba(255,255,255,0) 100%)`,
        }}
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="text-sm font-medium text-slate-700">{label}</div>
          {deltaLabel ? (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${deltaClasses}`}
              title={sourceLabel ?? undefined}
            >
              {deltaLabel}
            </span>
          ) : null}
        </div>

        <div className="w-10 shrink-0 text-right text-base font-semibold text-slate-900">
          {safeValue}
        </div>
      </div>
    </div>
  )
}

async function fetchRiderDetailsById(riderId: string): Promise<RiderDetails> {
  const { data, error } = await supabase
    .from('riders')
    .select(
      `
      id,
      country_code,
      first_name,
      last_name,
      display_name,
      role,
      sprint,
      climbing,
      time_trial,
      endurance,
      flat,
      recovery,
      resistance,
      race_iq,
      teamwork,
      morale,
      potential,
      fatigue,
      overall,
      birth_date,
      image_url,
      salary,
      contract_expires_at,
      contract_expires_season,
      market_value,
      asking_price,
      asking_price_manual,
      availability_status,
      unavailable_until,
      unavailable_reason
    `
    )
    .eq('id', riderId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error(`Rider not found for id: ${riderId}`)
  }

  const rider = data as RiderDetails

  return {
    ...rider,
    availability_status: rider.availability_status ?? getDefaultRiderAvailabilityStatus(),
  }
}

async function fetchRiderCareerHistoryById(riderId: string): Promise<RiderCareerHistoryRow[]> {
  function normalizeRows(rows: any[]): RiderCareerHistoryRow[] {
    const normalized = rows
      .map(row => {
        const seasonValueRaw =
          row.season ??
          row.season_number ??
          row.season_id ??
          row.year ??
          row.current_season ??
          null

        const seasonValue =
          typeof seasonValueRaw === 'number'
            ? seasonValueRaw
            : typeof seasonValueRaw === 'string' && seasonValueRaw.trim() !== ''
              ? Number(seasonValueRaw)
              : null

        const seasonLabel =
          row.season_label ??
          row.season_name ??
          (seasonValue !== null && Number.isFinite(seasonValue)
            ? `Season ${seasonValue}`
            : 'Unknown season')

        const pointsRaw =
          row.points ??
          row.season_points ??
          row.total_points ??
          row.rider_points ??
          row.points_total ??
          row.current_points ??
          0

        const points =
          typeof pointsRaw === 'number'
            ? pointsRaw
            : typeof pointsRaw === 'string' && pointsRaw.trim() !== ''
              ? Number(pointsRaw)
              : 0

        const isCurrentSeason = Boolean(
          row.is_current_season ??
            row.is_current ??
            row.current_season_flag ??
            row.is_current_team ??
            false
        )

        return {
          season: seasonValue !== null && Number.isFinite(seasonValue) ? seasonValue : null,
          season_label: seasonLabel,
          team_name:
            row.team_name ??
            row.club_name ??
            row.team_label ??
            row.club_label ??
            row.squad_name ??
            row.club_display_name ??
            row.team ??
            'Unknown team',
          points: Number.isFinite(points) ? points : 0,
          is_current_season: isCurrentSeason,
        } as RiderCareerHistoryRow
      })
      .filter(row => row.team_name || row.season_label)

    return normalized.sort((a, b) => {
      if (a.is_current_season !== b.is_current_season) {
        return a.is_current_season ? -1 : 1
      }

      const aSeason = a.season ?? -1
      const bSeason = b.season ?? -1
      if (aSeason !== bSeason) return bSeason - aSeason
      return a.team_name.localeCompare(b.team_name)
    })
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_career_history', {
      p_rider_id: riderId,
    })

    if (!error && Array.isArray(data) && data.length > 0) {
      return normalizeRows(data)
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    'v_rider_career_history',
    'rider_career_history',
    'v_rider_season_history',
    'rider_season_history',
    'v_rider_history',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .order('season', { ascending: false })

      if (!error && Array.isArray(data) && data.length > 0) {
        return normalizeRows(data)
      }
    } catch {
      // try next source
    }
  }

  return []
}

async function fetchRiderSeasonOverviewById(riderId: string): Promise<RiderSeasonOverview> {
  const normalizeRow = (row: any): RiderSeasonOverview => ({
    points: normalizeNumber(row.points ?? row.season_points ?? row.total_points, 0),
    podiums: normalizeNumber(row.podiums ?? row.podium_count ?? row.podium_finishes, 0),
    jerseys: normalizeNumber(row.jerseys ?? row.jersey_count ?? row.special_jerseys, 0),
  })

  try {
    const { data, error } = await supabase.rpc('get_rider_season_overview', {
      p_rider_id: riderId,
    })

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    'v_rider_season_overview',
    'rider_season_stats',
    'v_rider_stats_current_season',
    'rider_season_summary',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .limit(1)
        .maybeSingle()

      if (!error && data) return normalizeRow(data)
    } catch {
      // try next source
    }
  }

  return { points: 0, podiums: 0, jerseys: 0 }
}

async function fetchRiderSeasonStatsById(riderId: string): Promise<RiderSeasonStatsBox> {
  const normalizeRow = (row: any): RiderSeasonStatsBox => ({
    races: normalizeNumber(row.races ?? row.races_count ?? row.total_races, 0),
    wins: normalizeNumber(row.wins ?? row.win_count ?? row.victories, 0),
    podiums: normalizeNumber(row.podiums ?? row.podium_count ?? row.podium_finishes, 0),
    top10: normalizeNumber(row.top10 ?? row.top_10 ?? row.top_ten_count, 0),
    points: normalizeNumber(row.points ?? row.season_points ?? row.total_points, 0),
  })

  try {
    const { data, error } = await supabase.rpc('get_rider_season_stats_box', {
      p_rider_id: riderId,
    })

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    'v_rider_season_stats_box',
    'rider_season_stats',
    'v_rider_stats_current_season',
    'rider_season_summary',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .limit(1)
        .maybeSingle()

      if (!error && data) return normalizeRow(data)
    } catch {
      // try next source
    }
  }

  return { races: 0, wins: 0, podiums: 0, top10: 0, points: 0 }
}

async function fetchRiderLastFiveRacesById(riderId: string): Promise<RiderRecentRaceRow[]> {
  const normalizeRows = (rows: any[]): RiderRecentRaceRow[] =>
    rows
      .map(row => ({
        race_name:
          row.race_name ?? row.event_name ?? row.race_label ?? row.stage_name ?? 'Unknown race',
        race_date: row.race_date ?? row.event_date ?? row.date ?? null,
        finish_position:
          normalizeNumber(
            row.finish_position ??
              row.position ??
              row.final_position ??
              row.result_position,
            0
          ) || null,
      }))
      .slice(0, 5)

  try {
    const { data, error } = await supabase.rpc('get_rider_last_five_races', {
      p_rider_id: riderId,
      p_limit: 5,
    })

    if (!error && Array.isArray(data) && data.length > 0) {
      return normalizeRows(data)
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    'v_rider_recent_results',
    'rider_race_results',
    'race_results',
    'v_rider_results',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .order('race_date', { ascending: false })
        .limit(5)

      if (!error && Array.isArray(data) && data.length > 0) {
        return normalizeRows(data)
      }
    } catch {
      // try next source
    }
  }

  return []
}

async function fetchActiveTransferListing(riderId: string): Promise<ActiveTransferListing | null> {
  const { data, error } = await supabase
    .from('rider_transfer_listings')
    .select(
      'id, rider_id, seller_club_id, asking_price, listed_on_game_date, expires_on_game_date, status'
    )
    .eq('rider_id', riderId)
    .in('status', [...ACTIVE_TRANSFER_LISTING_STATUSES])
    .order('listed_on_game_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ActiveTransferListing | null
}

async function fetchActiveFreeAgent(riderId: string): Promise<ActiveFreeAgentRow | null> {
  const { data, error } = await supabase
    .from('rider_free_agents')
    .select('id, rider_id, expires_on_game_date, status')
    .eq('rider_id', riderId)
    .in('status', [...ACTIVE_FREE_AGENT_STATUSES])
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ActiveFreeAgentRow | null
}

export default function ExternalRiderProfilePage({
  riderId: riderIdProp,
  gameDate: gameDateProp,
  marketMode = 'general',
  onBack,
  onMakeTransferOffer,
  onOpenFreeAgentNegotiation,
  onScoutRider,
}: ExternalRiderProfilePageProps) {
  const navigate = useNavigate()
  const params = useParams<{ riderId: string }>()

  const resolvedRiderId = riderIdProp ?? params.riderId ?? ''
  const effectiveOnBack = onBack ?? (() => navigate(-1))
  const defaultTab: ExternalRiderProfileTab = marketMode === 'general' ? 'overview' : 'contract'

  const [resolvedGameDate, setResolvedGameDate] = useState<string | null>(
    normalizeGameDateInput(gameDateProp)
  )
  const [gameDateLoading, setGameDateLoading] = useState<boolean>(gameDateProp === undefined)

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
  const [skillDeltaMap, setSkillDeltaMap] = useState<RiderSkillDeltaMap>({})
  const [activeTab, setActiveTab] = useState<ExternalRiderProfileTab>(defaultTab)

  const [seasonOverview, setSeasonOverview] = useState<RiderSeasonOverview>({
    points: 0,
    podiums: 0,
    jerseys: 0,
  })
  const [seasonStats, setSeasonStats] = useState<RiderSeasonStatsBox>({
    races: 0,
    wins: 0,
    podiums: 0,
    top10: 0,
    points: 0,
  })
  const [recentRaces, setRecentRaces] = useState<RiderRecentRaceRow[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [marketLoading, setMarketLoading] = useState(false)
  const [activeTransferListing, setActiveTransferListing] = useState<ActiveTransferListing | null>(
    null
  )
  const [activeFreeAgent, setActiveFreeAgent] = useState<ActiveFreeAgentRow | null>(null)
  const [marketError, setMarketError] = useState<string | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([])
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(null)

  const [compareClubId, setCompareClubId] = useState<string | null>(null)

  useEffect(() => {
    if (gameDateProp !== undefined) {
      setResolvedGameDate(normalizeGameDateInput(gameDateProp))
      setGameDateLoading(false)
      return
    }

    let mounted = true

    async function loadGameDate() {
      setGameDateLoading(true)

      try {
        const { data, error } = await supabase.rpc('get_current_game_date')
        if (error) throw error
        if (!mounted) return
        setResolvedGameDate(normalizeGameDateInput(data))
      } catch (error) {
        console.error('Failed to load current game date for external rider profile:', error)
        if (!mounted) return
        setResolvedGameDate(null)
      } finally {
        if (!mounted) return
        setGameDateLoading(false)
      }
    }

    void loadGameDate()

    return () => {
      mounted = false
    }
  }, [gameDateProp])

  useEffect(() => {
    let mounted = true

    async function loadRider() {
      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setSkillDeltaMap({})
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
      setRecentRaces([])
      setActiveTransferListing(null)
      setActiveFreeAgent(null)
      setMarketError(null)
      setHistoryRows([])
      setHistoryError(null)
      setActiveTab(defaultTab)

      if (!resolvedRiderId) {
        setProfileError('Missing rider id.')
        setProfileLoading(false)
        return
      }

      try {
        const [nextRider, deltaResult, gameDatePartsResult] = await Promise.all([
          fetchRiderDetailsById(resolvedRiderId),
          supabase
            .from('v_rider_skill_card_deltas')
            .select(
              `
              rider_id,
              attribute_code,
              current_value,
              old_value,
              new_value,
              delta_value,
              delta_label,
              delta_direction,
              primary_source,
              week_start_date,
              week_end_date,
              has_visible_delta
            `
            )
            .eq('rider_id', resolvedRiderId),
          supabase.rpc('get_current_game_date_parts'),
        ])

        if (!mounted) return

        setSelectedRider(nextRider)

        if (deltaResult.error) throw deltaResult.error
        if (gameDatePartsResult.error) throw gameDatePartsResult.error

        const gameDateParts = Array.isArray(gameDatePartsResult.data)
          ? gameDatePartsResult.data[0]
          : gameDatePartsResult.data

        setCurrentSeasonNumber(
          typeof gameDateParts?.season_number === 'number' ? gameDateParts.season_number : null
        )

        const deltaRows = (deltaResult.data ?? []) as RiderSkillDeltaRow[]
        const nextDeltaMap: RiderSkillDeltaMap = {}
        for (const row of deltaRows) nextDeltaMap[row.attribute_code] = row
        setSkillDeltaMap(nextDeltaMap)
      } catch (e: any) {
        if (!mounted) return
        setProfileError(e?.message ?? 'Failed to load rider profile.')
      } finally {
        if (!mounted) return
        setProfileLoading(false)
      }
    }

    void loadRider()

    return () => {
      mounted = false
    }
  }, [resolvedRiderId, defaultTab])

  useEffect(() => {
    let mounted = true

    async function loadOverviewExtras() {
      if (!selectedRider?.id) return
      setOverviewLoading(true)

      try {
        const [overviewData, statsData, racesData] = await Promise.all([
          fetchRiderSeasonOverviewById(selectedRider.id),
          fetchRiderSeasonStatsById(selectedRider.id),
          fetchRiderLastFiveRacesById(selectedRider.id),
        ])

        if (!mounted) return
        setSeasonOverview(overviewData)
        setSeasonStats(statsData)
        setRecentRaces(racesData)
      } catch {
        if (!mounted) return
        setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
        setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
        setRecentRaces([])
      } finally {
        if (!mounted) return
        setOverviewLoading(false)
      }
    }

    void loadOverviewExtras()

    return () => {
      mounted = false
    }
  }, [selectedRider?.id])

  useEffect(() => {
    let mounted = true

    async function loadMarketData() {
      if (!selectedRider?.id) return
      setMarketLoading(true)
      setMarketError(null)

      try {
        const [listing, freeAgent] = await Promise.all([
          fetchActiveTransferListing(selectedRider.id),
          fetchActiveFreeAgent(selectedRider.id),
        ])

        if (!mounted) return
        setActiveTransferListing(listing)
        setActiveFreeAgent(freeAgent)
      } catch (e: any) {
        if (!mounted) return
        setMarketError(e?.message ?? 'Could not load rider market data.')
        setActiveTransferListing(null)
        setActiveFreeAgent(null)
      } finally {
        if (!mounted) return
        setMarketLoading(false)
      }
    }

    void loadMarketData()

    return () => {
      mounted = false
    }
  }, [selectedRider?.id])

  useEffect(() => {
    let mounted = true

    async function loadCompareClubId() {
      try {
        const { data, error } = await supabase.rpc('get_my_primary_club_id')
        if (error) throw error
        if (!mounted) return
        setCompareClubId(data ? String(data) : null)
      } catch {
        if (!mounted) return
        setCompareClubId(null)
      }
    }

    void loadCompareClubId()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadHistory() {
      if (activeTab !== 'history' || !selectedRider?.id) return

      setHistoryLoading(true)
      setHistoryError(null)

      try {
        const rows = await fetchRiderCareerHistoryById(selectedRider.id)
        if (!mounted) return
        setHistoryRows(rows)
      } catch (e: any) {
        if (!mounted) return
        setHistoryError(e?.message ?? 'Could not load rider history.')
        setHistoryRows([])
      } finally {
        if (!mounted) return
        setHistoryLoading(false)
      }
    }

    void loadHistory()

    return () => {
      mounted = false
    }
  }, [activeTab, selectedRider?.id])

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    resolvedGameDate,
    selectedRider?.contract_expires_season
  )

  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, resolvedGameDate)
  const potentialUi = getPotentialUi(selectedRider?.potential)
  const moraleUi = getMoraleUi(selectedRider?.morale)
  const fatigueUi = getFatigueUi(selectedRider?.fatigue)
  const healthUi = getRiderStatusUi(selectedRider?.availability_status)

  const transferDaysRemaining = activeTransferListing?.expires_on_game_date
    ? getDaysRemaining(activeTransferListing.expires_on_game_date, resolvedGameDate)
    : null

  const transferTimeLabel =
    !activeTransferListing
      ? 'Not listed'
      : activeTransferListing.expires_on_game_date
        ? transferDaysRemaining === null
          ? `Listed until ${formatShortGameDate(activeTransferListing.expires_on_game_date)}`
          : transferDaysRemaining <= 0
            ? `Ends today (${formatShortGameDate(activeTransferListing.expires_on_game_date)})`
            : `${transferDaysRemaining} day${transferDaysRemaining === 1 ? '' : 's'} left`
        : 'Listed with no expiry'

  const freeAgentDaysRemaining = activeFreeAgent?.expires_on_game_date
    ? getDaysRemaining(activeFreeAgent.expires_on_game_date, resolvedGameDate)
    : null

  const freeAgentTimeLabel =
    !activeFreeAgent
      ? 'Not a free agent'
      : activeFreeAgent.expires_on_game_date
        ? freeAgentDaysRemaining === null
          ? `Available until ${formatShortGameDate(activeFreeAgent.expires_on_game_date)}`
          : freeAgentDaysRemaining <= 0
            ? `Ends today (${formatShortGameDate(activeFreeAgent.expires_on_game_date)})`
            : `${freeAgentDaysRemaining} day${freeAgentDaysRemaining === 1 ? '' : 's'} left`
        : 'Available with no expiry'

  const marketStatusLabel = activeFreeAgent
    ? 'Free Agent'
    : activeTransferListing
      ? 'Transfer Listed'
      : marketMode === 'scouting'
        ? 'Scouting Target'
        : 'Not Listed'

  const riderName =
    selectedRider?.display_name?.trim() ||
    [selectedRider?.first_name, selectedRider?.last_name].filter(Boolean).join(' ').trim() ||
    'Rider'

  const skillRows = [
    { label: 'Sprint', key: 'sprint' as const, value: selectedRider?.sprint },
    { label: 'Climbing', key: 'climbing' as const, value: selectedRider?.climbing },
    { label: 'Time Trial', key: 'time_trial' as const, value: selectedRider?.time_trial },
    { label: 'Endurance', key: 'endurance' as const, value: selectedRider?.endurance },
    { label: 'Flat', key: 'flat' as const, value: selectedRider?.flat },
    { label: 'Recovery', key: 'recovery' as const, value: selectedRider?.recovery },
    { label: 'Resistance', key: 'resistance' as const, value: selectedRider?.resistance },
    { label: 'Race IQ', key: 'race_iq' as const, value: selectedRider?.race_iq },
    { label: 'Teamwork', key: 'teamwork' as const, value: selectedRider?.teamwork },
  ]

  const tabButtonClass = (tab: ExternalRiderProfileTab) =>
    `border-b-2 px-4 py-3 text-sm font-medium transition ${
      activeTab === tab
        ? 'border-yellow-500 text-slate-900'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`

  const displayHistoryRows = useMemo(() => {
    const currentSeasonRow =
      currentSeasonNumber == null
        ? null
        : {
            season: currentSeasonNumber,
            season_label: `Season ${currentSeasonNumber}`,
            team_name:
              historyRows.find(row => row.is_current_season)?.team_name ?? 'Current Team',
            points: seasonOverview.points,
            is_current_season: true,
          }

    const filteredRows = historyRows.filter(row => {
      if (currentSeasonRow == null) return true
      if (row.is_current_season) return false
      if (row.season != null && row.season === currentSeasonRow.season) {
        return row.team_name !== currentSeasonRow.team_name
      }
      return true
    })

    return currentSeasonRow ? [currentSeasonRow, ...filteredRows] : historyRows
  }, [currentSeasonNumber, historyRows, seasonOverview.points])

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={effectiveOnBack}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-500 bg-yellow-400 p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-950">
              {selectedRider ? riderName : 'Rider Profile'}
            </h2>

            {selectedRider ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  <CountryFlag countryCode={selectedRider.country_code} />
                  <span>{getCountryName(selectedRider.country_code)}</span>
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {selectedRider.role || '—'}
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  Age {profileAge ?? '—'}
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  OVR {selectedRider.overall ?? '—'}%
                </span>

                {activeFreeAgent ? (
                  <span className="rounded-full border border-blue-700/20 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800">
                    Free Agent
                  </span>
                ) : activeTransferListing ? (
                  <span className="rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    Transfer Listed
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:max-w-xl">
            <div className="flex items-center justify-end rounded-2xl px-2">
              {[
                { label: 'Points', value: seasonOverview.points },
                { label: 'Podiums', value: seasonOverview.podiums },
                { label: 'Jerseys', value: seasonOverview.jerseys },
              ].map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? <div className="mx-6 h-12 w-px bg-black/25" /> : null}

                  <div className="min-w-[120px] text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/80">
                      {item.label}
                    </div>
                    <div className="mt-2 text-4xl font-semibold leading-none text-slate-950">
                      {item.value}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {activeFreeAgent ? (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="font-semibold">This rider is currently available as a free agent.</div>
          <div className="mt-1">{freeAgentTimeLabel}</div>
        </div>
      ) : activeTransferListing ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-semibold">This rider is currently on the transfer list.</div>
          <div className="mt-1">
            Asking price {formatCompactMoneyValue(activeTransferListing.asking_price)} ·{' '}
            {transferTimeLabel}
          </div>
        </div>
      ) : null}

      <div className="mb-6 border-b border-slate-200">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={tabButtonClass('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contract')}
            className={tabButtonClass('contract')}
          >
            Contract
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={tabButtonClass('compare')}
          >
            Compare
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={tabButtonClass('history')}
          >
            History
          </button>
        </div>
      </div>

      {profileLoading || gameDateLoading ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">Loading rider profile…</div>
        </div>
      ) : profileError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">Could not load rider profile</div>
          <div className="mt-1 text-sm text-rose-600">{profileError}</div>
        </div>
      ) : !selectedRider ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">Rider not found.</div>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SectionCard title="Rider Image">
                  <div className="flex h-[340px] items-center justify-center rounded-lg bg-slate-100 p-4">
                    <img
                      src={getRiderImageUrl(selectedRider.image_url)}
                      alt={selectedRider.display_name ?? riderName}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Season Stats" subtitle="Main season numbers">
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">Loading season stats…</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="Races" value={seasonStats.races} />
                      <DetailRow label="Wins" value={seasonStats.wins} />
                      <DetailRow label="Podiums" value={seasonStats.podiums} />
                      <DetailRow label="Top 10" value={seasonStats.top10} />
                      <DetailRow label="Points" value={seasonStats.points} />
                      <DetailRow label="Jerseys" value={seasonOverview.jerseys} />
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-4">
                <SectionCard title="Basic Information">
                  <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Country"
                        value={
                          <span className="inline-flex items-center gap-2">
                            <CountryFlag countryCode={selectedRider.country_code} />
                            <span>{getCountryName(selectedRider.country_code)}</span>
                          </span>
                        }
                      />
                      <DetailRow label="Role" value={selectedRider.role || '—'} />
                      <DetailRow label="Age" value={profileAge ?? '—'} />
                      <DetailRow label="Overall" value={`${selectedRider.overall ?? '—'}%`} />
                      <DetailRow label="Potential" value={potentialUi.label} />
                    </div>

                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Weekly Wage"
                        value={formatWeeklySalary(selectedRider.salary)}
                      />
                      <DetailRow
                        label="Market Value"
                        value={formatCompactMoneyValue(selectedRider.market_value)}
                      />
                      <DetailRow
                        label="Asking Price"
                        value={formatCompactMoneyValue(selectedRider.asking_price)}
                      />
                      <DetailRow
                        label="Contract End"
                        value={contractExpiryUi.label}
                        valueClassName={contractExpiryUi.valueClassName}
                      />
                      <DetailRow label="Availability" value={healthUi.label} />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Availability & Medical">
                  <div className="divide-y divide-slate-100">
                    <DetailRow label="Status" value={healthUi.label} />
                    <DetailRow label="Fatigue score" value={`${selectedRider.fatigue ?? 0}/100`} />
                    <DetailRow label="Potential" value={potentialUi.label} />
                    <DetailRow label="Morale" value={moraleUi.label} />
                    {selectedRider.unavailable_reason ? (
                      <DetailRow
                        label="Reason"
                        value={formatUnavailableReason(selectedRider.unavailable_reason)}
                      />
                    ) : null}
                    {selectedRider.unavailable_until ? (
                      <DetailRow
                        label="Unavailable until"
                        value={formatShortGameDate(selectedRider.unavailable_until)}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {selectedRider.unavailable_until
                      ? `Unavailable until ${formatShortGameDate(selectedRider.unavailable_until)}${
                          selectedRider.unavailable_reason
                            ? ` because of ${formatUnavailableReason(selectedRider.unavailable_reason).toLowerCase()}`
                            : ''
                        }.`
                      : 'No active public availability restriction is visible for this rider.'}
                  </div>
                </SectionCard>

                <SectionCard title="Skill Attributes">
                  <div className="space-y-3">
                    {skillRows.map(stat => {
                      const delta = skillDeltaMap[stat.key]

                      return (
                        <SimpleAttributeRow
                          key={stat.key}
                          attributeCode={stat.key}
                          label={stat.label}
                          value={stat.value ?? 0}
                          deltaLabel={delta?.has_visible_delta ? delta.delta_label : null}
                          deltaDirection={delta?.has_visible_delta ? delta.delta_direction : null}
                          sourceLabel={
                            delta?.has_visible_delta
                              ? formatSkillDeltaSource(delta.primary_source)
                              : null
                          }
                        />
                      )
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="Last 5 Races" subtitle="Only finish position is shown">
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">Loading recent races…</div>
                  ) : recentRaces.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      No recent race results found for this rider.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentRaces.map((race, index) => (
                        <div
                          key={`${race.race_name}-${race.race_date ?? index}`}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {race.race_name}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {race.race_date ? formatShortGameDate(race.race_date) : 'Date unknown'}
                            </div>
                          </div>

                          <div className="text-sm font-bold text-slate-900">
                            {race.finish_position == null ? '—' : `P${race.finish_position}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === 'contract' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <SectionCard
                  title="Contract Details"
                  subtitle="Public contract and market information for this rider"
                >
                  {marketLoading ? (
                    <div className="text-sm text-slate-600">Loading contract data…</div>
                  ) : marketError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {marketError}
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100">
                        <DetailRow label="Market Status" value={marketStatusLabel} />
                        <DetailRow
                          label="Weekly Wage"
                          value={formatWeeklySalary(selectedRider.salary)}
                        />
                        <DetailRow
                          label="Market Value"
                          value={formatCompactMoneyValue(selectedRider.market_value)}
                        />
                        <DetailRow
                          label="Asking Price"
                          value={formatCompactMoneyValue(selectedRider.asking_price)}
                        />
                        <DetailRow
                          label="Contract End"
                          value={contractExpiryUi.label}
                          valueClassName={contractExpiryUi.valueClassName}
                        />
                        <DetailRow label="Transfer Listing" value={transferTimeLabel} />
                        <DetailRow label="Free Agent Window" value={freeAgentTimeLabel} />
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <SimpleInfoRow
                          label="Availability"
                          value={healthUi.label}
                          note={
                            selectedRider.unavailable_until
                              ? `Until ${formatShortGameDate(selectedRider.unavailable_until)}`
                              : undefined
                          }
                        />
                        <SimpleInfoRow
                          label="Morale"
                          value={moraleUi.label}
                          note="Visible morale class from rider profile"
                        />
                        <SimpleInfoRow
                          label="Potential"
                          value={potentialUi.label}
                          note="Useful for long-term value and development"
                        />
                        <SimpleInfoRow
                          label="Fatigue"
                          value={fatigueUi.label}
                          note={selectedRider.fatigue != null ? `${selectedRider.fatigue}/100` : undefined}
                        />
                      </div>
                    </>
                  )}
                </SectionCard>

                <SectionCard
                  title="Market Actions"
                  subtitle="Actions available when viewing non-owned riders"
                >
                  <div className="space-y-3">
                    {activeFreeAgent && onOpenFreeAgentNegotiation ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenFreeAgentNegotiation({
                            riderId: selectedRider.id,
                            riderName,
                            freeAgentId: activeFreeAgent.id,
                            expiresOnGameDate: activeFreeAgent.expires_on_game_date,
                          })
                        }
                        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Negotiate with Free Agent
                      </button>
                    ) : null}

                    {activeTransferListing && onMakeTransferOffer ? (
                      <button
                        type="button"
                        onClick={() =>
                          onMakeTransferOffer({
                            riderId: selectedRider.id,
                            riderName,
                            listingId: activeTransferListing.id,
                            sellerClubId: activeTransferListing.seller_club_id,
                            askingPrice: activeTransferListing.asking_price,
                          })
                        }
                        className="w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500"
                      >
                        Make Transfer Offer
                      </button>
                    ) : null}

                    {!activeTransferListing && !activeFreeAgent && onScoutRider ? (
                      <button
                        type="button"
                        onClick={() =>
                          onScoutRider({
                            riderId: selectedRider.id,
                            riderName,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                      >
                        Add to Scout List
                      </button>
                    ) : null}

                    {!onMakeTransferOffer &&
                    !onOpenFreeAgentNegotiation &&
                    !onScoutRider ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        This page is ready for public rider actions, but no offer or scouting
                        callbacks were passed yet.
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {activeFreeAgent
                        ? 'This rider is currently unattached. Use the free-agent flow if you want to approach him.'
                        : activeTransferListing
                          ? 'This rider is listed on the market. Offer flow should use the listing id and asking price shown here.'
                          : 'This rider is not currently listed. Scouting or watchlist actions are the safest default here.'}
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="space-y-4">
              {!compareClubId ? (
                <SectionCard
                  title="Compare"
                  subtitle="Compare this external rider against riders from your squad"
                >
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Loading compare panel…
                  </div>
                </SectionCard>
              ) : (
                <RiderComparePanel leftRiderId={resolvedRiderId} clubId={compareClubId} />
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <SectionCard
              title="History"
              subtitle="Current season plus previous teams and points per season"
            >
              {historyLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Loading career history…
                </div>
              ) : historyError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {historyError}
                </div>
              ) : displayHistoryRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No career history data found for this rider yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-3 pr-4">Season</th>
                        <th className="py-3 pr-4">Team</th>
                        <th className="py-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayHistoryRows.map((row, index) => (
                        <tr
                          key={`${row.season_label}-${row.team_name}-${index}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{row.season_label}</span>
                              {row.is_current_season ? (
                                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
                                  Current
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-slate-700">{row.team_name}</td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}