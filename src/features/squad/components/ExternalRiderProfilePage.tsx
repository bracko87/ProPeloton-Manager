import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'

import type { RiderDetails } from '../types'

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
} from '../utils/dates'

import { getCountryName, getFlagImageUrl } from '../utils/formatters'

import {
  getDefaultRiderAvailabilityStatus,
  getPotentialUi,
  getRiderImageUrl,
} from '../utils/rider-ui'

type ExternalRiderProfileTab = 'overview' | 'history'

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
  isScouted?: boolean
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

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value
  }
  return undefined
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

function getAttributeRangeLabel(value: unknown): string {
  const numericValue = normalizeNullableNumber(value)
  if (numericValue === null) return '—'

  const clamped = Math.max(0, Math.min(100, numericValue))
  const start = Math.min(80, Math.floor(clamped / 20) * 20)
  const end = Math.min(100, start + 20)

  return `${start}-${end}`
}

function getVisibleAttributeValue(value: unknown, isScouted: boolean): string {
  if (!isScouted) return getAttributeRangeLabel(value)

  const numericValue = normalizeNullableNumber(value)
  return numericValue === null ? '—' : String(numericValue)
}

function getVisibleOverallValue(value: unknown, isScouted: boolean): string {
  if (!isScouted) return getAttributeRangeLabel(value)

  const numericValue = normalizeNullableNumber(value)
  return numericValue === null ? '—' : `${numericValue}%`
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

async function fetchRiderDetailsById(riderId: string): Promise<RiderDetails> {
  const lookupId = normalizeString(riderId)

  if (!lookupId) {
    throw new Error(`Rider not found for id: ${riderId}`)
  }

  const riderSelection = `
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

  const relationLookupTables = [
    'club_riders',
    'rider_transfer_listings',
    'rider_free_agents',
    'rider_transfer_offers',
    'rider_transfer_negotiations',
    'rider_free_agent_negotiations',
  ] as const

  const loadRiderRow = async (id: string) =>
    supabase.from('riders').select(riderSelection).eq('id', id).maybeSingle()

  const loadStatsRow = async (id: string) =>
    supabase.from('rider_statistics_view').select('*').eq('rider_id', id).maybeSingle()

  const buildFromRiderRow = (row: Record<string, any>, fallbackId: string): RiderDetails =>
    ({
      id: normalizeString(row.id) ?? fallbackId,
      country_code: normalizeString(row.country_code) ?? null,
      first_name: normalizeString(row.first_name) ?? null,
      last_name: normalizeString(row.last_name) ?? null,
      display_name: normalizeString(row.display_name) ?? null,
      role: normalizeString(row.role) ?? '',
      sprint: normalizeNumber(row.sprint, 0),
      climbing: normalizeNumber(row.climbing, 0),
      time_trial: normalizeNumber(row.time_trial, 0),
      endurance: normalizeNumber(row.endurance, 0),
      flat: normalizeNumber(row.flat, 0),
      recovery: normalizeNumber(row.recovery, 0),
      resistance: normalizeNumber(row.resistance, 0),
      race_iq: normalizeNumber(row.race_iq, 0),
      teamwork: normalizeNumber(row.teamwork, 0),
      morale: normalizeNumber(row.morale, 0),
      potential: normalizeNumber(row.potential, 0),
      fatigue: normalizeNumber(row.fatigue, 0),
      overall: normalizeNumber(row.overall, 0),
      birth_date: normalizeString(row.birth_date) ?? null,
      image_url: normalizeString(row.image_url) ?? null,
      salary: normalizeNumber(row.salary, 0),
      contract_expires_at: normalizeString(row.contract_expires_at) ?? null,
      contract_expires_season: row.contract_expires_season ?? null,
      market_value: normalizeNumber(row.market_value, 0),
      asking_price: normalizeNumber(row.asking_price, 0),
      asking_price_manual: row.asking_price_manual ?? null,
      availability_status:
        normalizeString(row.availability_status) ?? getDefaultRiderAvailabilityStatus(),
      unavailable_until: normalizeString(row.unavailable_until) ?? null,
      unavailable_reason: normalizeString(row.unavailable_reason) ?? null,
    }) as RiderDetails

  const buildFromStatsRow = (
    statsRow: Record<string, any>,
    riderRow?: Record<string, any> | null
  ): RiderDetails =>
    ({
      id: normalizeString(riderRow?.id) ?? normalizeString(statsRow.rider_id) ?? lookupId,

      country_code:
        normalizeString(firstDefined(riderRow?.country_code, statsRow.country_code)) ?? null,
      first_name:
        normalizeString(firstDefined(riderRow?.first_name, statsRow.first_name)) ?? null,
      last_name: normalizeString(firstDefined(riderRow?.last_name, statsRow.last_name)) ?? null,
      display_name:
        normalizeString(firstDefined(riderRow?.display_name, statsRow.display_name)) ?? null,
      role: normalizeString(firstDefined(riderRow?.role, statsRow.role, '')) ?? '',

      sprint: normalizeNumber(firstDefined(riderRow?.sprint, statsRow.sprint), 0),
      climbing: normalizeNumber(firstDefined(riderRow?.climbing, statsRow.climbing), 0),
      time_trial: normalizeNumber(firstDefined(riderRow?.time_trial, statsRow.time_trial), 0),
      endurance: normalizeNumber(firstDefined(riderRow?.endurance, statsRow.endurance), 0),
      flat: normalizeNumber(firstDefined(riderRow?.flat, statsRow.flat), 0),
      recovery: normalizeNumber(firstDefined(riderRow?.recovery, statsRow.recovery), 0),
      resistance: normalizeNumber(firstDefined(riderRow?.resistance, statsRow.resistance), 0),
      race_iq: normalizeNumber(firstDefined(riderRow?.race_iq, statsRow.race_iq), 0),
      teamwork: normalizeNumber(firstDefined(riderRow?.teamwork, statsRow.teamwork), 0),
      morale: normalizeNumber(firstDefined(riderRow?.morale, statsRow.morale), 0),
      potential: normalizeNumber(firstDefined(riderRow?.potential, statsRow.potential), 0),
      fatigue: normalizeNumber(firstDefined(riderRow?.fatigue, statsRow.fatigue), 0),
      overall: normalizeNumber(firstDefined(riderRow?.overall, statsRow.overall), 0),

      birth_date:
        normalizeString(firstDefined(riderRow?.birth_date, statsRow.birth_date)) ?? null,
      image_url: normalizeString(firstDefined(riderRow?.image_url, statsRow.image_url)) ?? null,
      salary: normalizeNumber(firstDefined(riderRow?.salary, statsRow.salary), 0),
      contract_expires_at:
        normalizeString(
          firstDefined(riderRow?.contract_expires_at, statsRow.contract_expires_at)
        ) ?? null,
      contract_expires_season:
        firstDefined(riderRow?.contract_expires_season, statsRow.contract_expires_season) ?? null,
      market_value: normalizeNumber(firstDefined(riderRow?.market_value, statsRow.market_value), 0),
      asking_price: normalizeNumber(firstDefined(riderRow?.asking_price, statsRow.asking_price), 0),
      asking_price_manual:
        firstDefined(riderRow?.asking_price_manual, statsRow.asking_price_manual) ?? null,
      availability_status:
        normalizeString(
          firstDefined(riderRow?.availability_status, statsRow.availability_status)
        ) ?? getDefaultRiderAvailabilityStatus(),
      unavailable_until:
        normalizeString(firstDefined(riderRow?.unavailable_until, statsRow.unavailable_until)) ??
        null,
      unavailable_reason:
        normalizeString(firstDefined(riderRow?.unavailable_reason, statsRow.unavailable_reason)) ??
        null,
      age_years: normalizeNullableNumber(statsRow.age_years),
    }) as RiderDetails

  async function resolveCanonicalRiderId(value: string): Promise<string | null> {
    const { data: riderRow, error: riderError } = await loadRiderRow(value)
    if (!riderError && riderRow?.id) {
      return String(riderRow.id).trim()
    }

    const { data: statsRow, error: statsError } = await loadStatsRow(value)
    if (!statsError && statsRow) {
      const resolvedStatsId = normalizeString((statsRow as Record<string, any>).rider_id)
      if (resolvedStatsId) return resolvedStatsId
    }

    const { data: freeAgentViewRow, error: freeAgentViewError } = await supabase
      .from('free_agent_market_view')
      .select('rider_id')
      .eq('free_agent_id', value)
      .maybeSingle()

    if (!freeAgentViewError && freeAgentViewRow?.rider_id) {
      const resolvedId = String(freeAgentViewRow.rider_id).trim()
      if (resolvedId) return resolvedId
    }

    for (const tableName of relationLookupTables) {
      const { data: relationRow, error: relationError } = await supabase
        .from(tableName)
        .select('rider_id')
        .eq('id', value)
        .maybeSingle()

      if (relationError) continue

      const resolvedId =
        relationRow && typeof relationRow.rider_id === 'string' ? relationRow.rider_id.trim() : ''

      if (resolvedId) return resolvedId
    }

    return null
  }

  const canonicalRiderId = await resolveCanonicalRiderId(lookupId)

  if (!canonicalRiderId) {
    throw new Error(`Rider not found for id: ${riderId}`)
  }

  const [riderResult, statsResult] = await Promise.all([
    loadRiderRow(canonicalRiderId),
    loadStatsRow(canonicalRiderId),
  ])

  if (riderResult.error) throw riderResult.error
  if (statsResult.error) throw statsResult.error

  if (statsResult.data) {
    return buildFromStatsRow(
      statsResult.data as Record<string, any>,
      (riderResult.data ?? null) as Record<string, any> | null
    )
  }

  if (riderResult.data) {
    return buildFromRiderRow(riderResult.data as Record<string, any>, canonicalRiderId)
  }

  throw new Error(`Rider not found for id: ${riderId}`)
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
  isScouted = false,
  onBack,
  onMakeTransferOffer,
  onOpenFreeAgentNegotiation,
  onScoutRider,
}: ExternalRiderProfilePageProps) {
  const navigate = useNavigate()
  const params = useParams<{ riderId: string }>()

  const resolvedRiderId = riderIdProp ?? params.riderId ?? ''
  const effectiveOnBack = onBack ?? (() => navigate(-1))
  const defaultTab: ExternalRiderProfileTab = 'overview'

  const [resolvedGameDate, setResolvedGameDate] = useState<string | null>(
    normalizeGameDateInput(gameDateProp)
  )
  const [gameDateLoading, setGameDateLoading] = useState<boolean>(gameDateProp === undefined)

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
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
  const [marketActionLoading, setMarketActionLoading] = useState(false)
  const [marketActionMessage, setMarketActionMessage] = useState<string | null>(null)
  const [myPrimaryClubId, setMyPrimaryClubId] = useState<string | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([])
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(null)

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
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
      setRecentRaces([])
      setActiveTransferListing(null)
      setActiveFreeAgent(null)
      setMarketError(null)
      setMarketActionMessage(null)
      setHistoryRows([])
      setHistoryError(null)
      setActiveTab(defaultTab)

      if (!resolvedRiderId) {
        setProfileError('Missing rider id.')
        setProfileLoading(false)
        return
      }

      try {
        const nextRider = await fetchRiderDetailsById(resolvedRiderId)

        const [deltaResult, gameDatePartsResult] = await Promise.all([
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
            .eq('rider_id', nextRider.id),
          supabase.rpc('get_current_game_date_parts'),
        ])

        if (!mounted) return

        setSelectedRider(nextRider)

        if (deltaResult.error) {
          console.error(
            'Failed to load rider skill deltas for external rider profile:',
            deltaResult.error
          )
        }

        if (gameDatePartsResult.error) throw gameDatePartsResult.error

        const gameDateParts = Array.isArray(gameDatePartsResult.data)
          ? gameDatePartsResult.data[0]
          : gameDatePartsResult.data

        setCurrentSeasonNumber(
          typeof gameDateParts?.season_number === 'number' ? gameDateParts.season_number : null
        )
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
  }, [resolvedRiderId])

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

    async function loadMyPrimaryClubId() {
      try {
        const { data, error } = await supabase.rpc('get_my_primary_club_id')
        if (error) throw error
        if (!mounted) return
        setMyPrimaryClubId(data ? String(data) : null)
      } catch {
        if (!mounted) return
        setMyPrimaryClubId(null)
      }
    }

    void loadMyPrimaryClubId()

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

  const statsAge =
    typeof (selectedRider as { age_years?: unknown } | null)?.age_years === 'number'
      ? ((selectedRider as { age_years?: number }).age_years ?? null)
      : null
  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, resolvedGameDate) ?? statsAge
  const potentialUi = getPotentialUi(selectedRider?.potential)

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    resolvedGameDate,
    selectedRider?.contract_expires_season
  )

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
    [normalizeString(selectedRider?.first_name), normalizeString(selectedRider?.last_name)]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    normalizeString(selectedRider?.display_name) ||
    'Rider'

  const visibleOverallValue = getVisibleOverallValue(selectedRider?.overall, isScouted)

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

  const marketActionButtonLabel = activeFreeAgent
    ? 'Negotiate with Free Agent'
    : activeTransferListing
      ? onMakeTransferOffer
        ? 'Make Transfer Offer'
        : 'Submit Transfer Offer'
      : onScoutRider
        ? 'Add to Scout List'
        : marketMode === 'scouting'
          ? 'Scout Rider'
          : null

  const skillRows = [
    { label: 'Sprint', value: selectedRider?.sprint },
    { label: 'Climbing', value: selectedRider?.climbing },
    { label: 'Time Trial', value: selectedRider?.time_trial },
    { label: 'Endurance', value: selectedRider?.endurance },
    { label: 'Flat', value: selectedRider?.flat },
    { label: 'Recovery', value: selectedRider?.recovery },
    { label: 'Resistance', value: selectedRider?.resistance },
    { label: 'Race IQ', value: selectedRider?.race_iq },
    { label: 'Teamwork', value: selectedRider?.teamwork },
    { label: 'Morale', value: selectedRider?.morale },
  ]

  const skillColumns = useMemo(() => {
    const midpoint = Math.ceil(skillRows.length / 2)
    return [skillRows.slice(0, midpoint), skillRows.slice(midpoint)]
  }, [selectedRider])

  async function handleMarketAction() {
    if (!selectedRider || marketActionLoading) return

    try {
      setMarketActionLoading(true)
      setMarketActionMessage(null)

      if (activeFreeAgent) {
        if (onOpenFreeAgentNegotiation) {
          onOpenFreeAgentNegotiation({
            riderId: selectedRider.id,
            riderName,
            freeAgentId: activeFreeAgent.id,
            expiresOnGameDate: activeFreeAgent.expires_on_game_date,
          })
          return
        }

        setMarketActionMessage('Open this rider from Transfers to start free-agent negotiation.')
        return
      }

      if (activeTransferListing) {
        if (onMakeTransferOffer) {
          onMakeTransferOffer({
            riderId: selectedRider.id,
            riderName,
            listingId: activeTransferListing.id,
            sellerClubId: activeTransferListing.seller_club_id,
            askingPrice: activeTransferListing.asking_price,
          })
          return
        }

        if (!myPrimaryClubId) throw new Error('Your primary club is not available.')

        const { error } = await supabase.rpc('submit_rider_transfer_offer', {
          p_listing_id: activeTransferListing.id,
          p_buyer_club_id: myPrimaryClubId,
          p_offered_price: activeTransferListing.asking_price,
        })

        if (error) throw error

        setMarketActionMessage('Transfer offer submitted.')
        return
      }

      if (onScoutRider) {
        onScoutRider({ riderId: selectedRider.id, riderName })
        return
      }

      setMarketActionMessage('This rider is currently not listed.')
    } catch (error: any) {
      setMarketActionMessage(error?.message ?? 'Market action failed.')
    } finally {
      setMarketActionLoading(false)
    }
  }

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
                  OVR {visibleOverallValue}
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

                <SectionCard title="Market">
                  {marketLoading ? (
                    <div className="text-sm text-slate-600">Loading market data…</div>
                  ) : marketError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {marketError}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="divide-y divide-slate-100">
                        <DetailRow label="Status" value={marketStatusLabel} />
                        {activeTransferListing ? (
                          <DetailRow label="Transfer Window" value={transferTimeLabel} />
                        ) : null}
                        {activeFreeAgent ? (
                          <DetailRow label="Free Agent Window" value={freeAgentTimeLabel} />
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {activeFreeAgent
                          ? 'This rider is unattached and can be approached through the free-agent flow.'
                          : activeTransferListing
                            ? 'This rider is publicly listed on the transfer market.'
                            : marketMode === 'scouting'
                              ? 'This rider is being viewed as a scouting target.'
                              : 'This rider is not currently listed on the market.'}
                      </div>

                      {marketActionButtonLabel ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleMarketAction()
                          }}
                          disabled={marketActionLoading}
                          className="w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marketActionLoading ? 'Working…' : marketActionButtonLabel}
                        </button>
                      ) : null}

                      {marketActionMessage ? (
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          {marketActionMessage}
                        </div>
                      ) : null}
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
                      <DetailRow label="Overall" value={visibleOverallValue} />
                      {isScouted ? <DetailRow label="Potential" value={potentialUi.label} /> : null}
                      <DetailRow
                        label="Contract End"
                        value={contractExpiryUi.label}
                        valueClassName={contractExpiryUi.valueClassName}
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Skill Attributes"
                  subtitle={
                    isScouted
                      ? 'Exact rider attributes'
                      : 'Public scouting ranges are shown until the rider is scouted'
                  }
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {skillColumns.map((column, columnIndex) => (
                      <div key={columnIndex} className="divide-y divide-slate-100">
                        {column.map(item => (
                          <DetailRow
                            key={item.label}
                            label={item.label}
                            value={getVisibleAttributeValue(item.value, isScouted)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {isScouted ? (
                  <SectionCard title="Availability & Medical">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Availability"
                        value={selectedRider.availability_status || '—'}
                      />
                      <DetailRow
                        label="Unavailable Until"
                        value={
                          selectedRider.unavailable_until
                            ? formatShortGameDate(selectedRider.unavailable_until)
                            : '—'
                        }
                      />
                      <DetailRow
                        label="Medical / Reason"
                        value={selectedRider.unavailable_reason || '—'}
                      />
                      <DetailRow label="Fatigue" value={selectedRider.fatigue ?? '—'} />
                    </div>
                  </SectionCard>
                ) : null}

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