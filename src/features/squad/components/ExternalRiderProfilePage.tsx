import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
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

type ExternalProfileGameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type AvailableScoutStaffRow = {
  scout_staff_id: string
  scout_name: string
  role_type: string
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  scouting_level: number
  precision_score: number | string
  speed_score: number | string
  precision_tier: 'basic' | 'solid' | 'strong' | 'elite' | string
  estimated_duration_hours: number
  free_reports_per_day: number
  free_reports_used_today: number
  free_reports_left_today: number
  next_report_coin_cost: number
  wallet_balance: number
  on_active_course: boolean
  can_scout: boolean
  blocking_reason: string | null
  has_active_scouting_task?: boolean
  active_scouting_task_label?: string | null
}

type ActiveScoutTaskRow = {
  id: string
  club_id: string
  rider_id: string
  scout_staff_id: string
  status: string
  precision_score: number | string | null
  precision_tier: string | null
  duration_hours: number | null
  is_paid: boolean | null
  coin_cost: number | null
  free_reports_used_before: number | null
  started_at_game_ts: string | null
  completes_at_game_ts: string | null
  created_at: string | null
  updated_at: string | null
  scout_staff_name?: string | null
  scout_name?: string | null
}

type SecureMetricValue = {
  label?: string | null
  exact?: number | string | null
}

type SecureAvailabilityValue = {
  status?: string | null
  unavailable_until?: string | null
  reason?: string | null
}

type SecureScoutReportData = {
  precisionScore?: number
  precisionTier?: 'basic' | 'solid' | 'strong' | 'elite'
  overall?: SecureMetricValue
  potential?: SecureMetricValue
  fatigue?: SecureMetricValue
  availability?: SecureAvailabilityValue
  attributes?: Record<string, SecureMetricValue>
}

type ExternalRiderSecureProfilePayload = {
  riderId: string
  clubId: string
  gameDate: string
  isOwnRider: boolean
  hasScout: boolean
  canScout: boolean
  usedToday: number
  dailyLimit: number
  remainingToday: number
  statusMessage: string
  profile: {
    id: string
    firstName: string | null
    lastName: string | null
    displayName: string | null
    countryCode: string | null
    role: string | null
    birthDate: string | null
    imageUrl: string | null
    contractExpiresAt: string | null
    contractExpiresSeason: number | string | null
    marketValue: number | null
    salary: number | null
  }
  publicView: {
    overall?: SecureMetricValue
    potential?: SecureMetricValue
    fatigue?: SecureMetricValue
    availability?: SecureAvailabilityValue
    attributes?: Record<string, SecureMetricValue>
  }
  scoutReport: null | {
    reportId: string
    precisionScore?: number
    precisionTier?: 'basic' | 'solid' | 'strong' | 'elite'
    scoutedOnGameDate?: string | null
    createdAt?: string | null
    report?: SecureScoutReportData | null
  }
}

type ExternalRiderMarketMode = 'general' | 'transfer_list' | 'free_agent' | 'scouting'

type ExternalRiderProfilePageProps = {
  riderId?: string
  gameDate?: string | null
  marketMode?: ExternalRiderMarketMode
  onBack?: () => void
  onOpenFreeAgentNegotiation?: (payload: {
    riderId: string
    riderName: string
    freeAgentId: string
    expiresOnGameDate: string | null
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

function parseGameTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null

  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const utcDate = new Date(`${normalized}Z`)

  if (!Number.isNaN(utcDate.getTime())) return utcDate

  const localDate = new Date(normalized)
  return Number.isNaN(localDate.getTime()) ? null : localDate
}

function formatGameTimestampAsSeasonLabel(value?: string | null): string {
  if (!value) return '—'

  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(`${normalized}Z`)

  if (Number.isNaN(parsed.getTime())) return value

  const seasonNumber = parsed.getUTCFullYear() - 1999
  const month = parsed.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  })
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  const hour = String(parsed.getUTCHours()).padStart(2, '0')
  const minute = String(parsed.getUTCMinutes()).padStart(2, '0')

  return `Season ${seasonNumber} - ${month} ${day} ${hour}:${minute}`
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

async function fetchScoutStaffNameById(staffId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('club_staff')
      .select('staff_name')
      .eq('id', staffId)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return normalizeString(data?.staff_name) ?? null
  } catch {
    return null
  }
}

async function fetchActiveScoutTaskForRider(
  riderId: string,
  clubId?: string | null
): Promise<ActiveScoutTaskRow | null> {
  let query = supabase
    .from('rider_scout_tasks')
    .select(
      'id, club_id, rider_id, scout_staff_id, status, precision_score, precision_tier, duration_hours, is_paid, coin_cost, free_reports_used_before, started_at_game_ts, completes_at_game_ts, created_at, updated_at'
    )
    .eq('rider_id', riderId)
    .in('status', ['queued', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (clubId) {
    query = query.eq('club_id', clubId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  if (!data) return null

  const scoutStaffName = await fetchScoutStaffNameById(data.scout_staff_id)

  return {
    ...(data as ActiveScoutTaskRow),
    scout_staff_name: scoutStaffName,
    scout_name: scoutStaffName,
  }
}

function buildRiderDetailsFromSecureProfile(
  payload: ExternalRiderSecureProfilePayload
): RiderDetails {
  const profile = payload.profile as Record<string, unknown>

  return {
    id: normalizeString(profile.id) ?? '',

    country_code:
      normalizeString(profile.countryCode) ??
      normalizeString(profile.country_code) ??
      null,

    first_name:
      normalizeString(profile.firstName) ??
      normalizeString(profile.first_name) ??
      null,

    last_name:
      normalizeString(profile.lastName) ??
      normalizeString(profile.last_name) ??
      null,

    display_name:
      normalizeString(profile.displayName) ??
      normalizeString(profile.display_name) ??
      null,

    role: normalizeString(profile.role) ?? '',

    sprint: 0,
    climbing: 0,
    time_trial: 0,
    endurance: 0,
    flat: 0,
    recovery: 0,
    resistance: 0,
    race_iq: 0,
    teamwork: 0,
    morale: 0,
    potential: 0,
    fatigue: 0,
    overall: 0,

    birth_date:
      normalizeString(profile.birthDate) ??
      normalizeString(profile.birth_date) ??
      null,

    image_url:
      normalizeString(profile.imageUrl) ??
      normalizeString(profile.image_url) ??
      null,

    salary: normalizeNumber(profile.salary, 0),

    contract_expires_at:
      normalizeString(profile.contractExpiresAt) ??
      normalizeString(profile.contract_expires_at) ??
      null,

    contract_expires_season:
      profile.contractExpiresSeason ??
      profile.contract_expires_season ??
      null,

    market_value: normalizeNumber(profile.marketValue ?? profile.market_value, 0),

    asking_price: 0,
    asking_price_manual: null,
    availability_status: getDefaultRiderAvailabilityStatus(),
    unavailable_until: null,
    unavailable_reason: null,

    age_years:
      normalizeNullableNumber(profile.ageYears) ??
      normalizeNullableNumber(profile.age_years),
  } as RiderDetails
}

function getSecureMetricLabel(value?: SecureMetricValue | null): string {
  const label = normalizeString(value?.label)
  if (label) return label

  if (value?.exact !== null && value?.exact !== undefined) {
    return String(value.exact)
  }

  return '—'
}

function getAttributeRangeLabel(value: unknown): string {
  const numericValue = normalizeNullableNumber(value)
  if (numericValue === null) return '—'

  const clamped = Math.max(0, Math.min(100, numericValue))
  const start = Math.min(80, Math.floor(clamped / 20) * 20)
  const end = Math.min(100, start + 20)

  return `${start}-${end}`
}

function getPublicRangeLabel(value?: SecureMetricValue | null): string {
  const label = normalizeString(value?.label)
  if (label && label.includes('-')) return label

  const numeric =
    normalizeNullableNumber(value?.exact) ??
    normalizeNullableNumber(label)

  return numeric === null ? '—' : getAttributeRangeLabel(numeric)
}

function getSecureOverallLabel(payload: ExternalRiderSecureProfilePayload | null): string {
  const scoutedValue = payload?.scoutReport?.report?.overall ?? null
  const publicValue = payload?.publicView?.overall ?? null

  if (payload?.scoutReport) {
    return getSecureMetricLabel(scoutedValue)
  }

  return getPublicRangeLabel(publicValue)
}

function getPotentialTierName(value: unknown): string {
  const numeric = normalizeNullableNumber(value)
  if (numeric == null) return '—'

  if (numeric < 20) return 'Very Low'
  if (numeric < 40) return 'Low'
  if (numeric < 60) return 'Medium'
  if (numeric < 80) return 'High'
  return 'Elite'
}

function getSecurePotentialText(payload: ExternalRiderSecureProfilePayload | null): string {
  const scoutedPotential = payload?.scoutReport?.report?.potential ?? null

  if (!payload?.scoutReport) {
    return 'Hidden until scouted'
  }

  const exactValue = normalizeNullableNumber(scoutedPotential?.exact)
  if (exactValue !== null) {
    return getPotentialTierName(exactValue)
  }

  return 'Scouted'
}

function getSecureFatigueLabel(payload: ExternalRiderSecureProfilePayload | null): string {
  return getSecureMetricLabel(
    payload?.scoutReport?.report?.fatigue ?? payload?.publicView?.fatigue ?? null
  )
}

function getSecureAttributeLabel(
  payload: ExternalRiderSecureProfilePayload | null,
  attributeKey: string
): string {
  if (!payload?.scoutReport) {
    return '-'
  }

  const scoutedValue = payload?.scoutReport?.report?.attributes?.[attributeKey] ?? null
  return getSecureMetricLabel(scoutedValue) === '—' ? '-' : getSecureMetricLabel(scoutedValue)
}

function getSecureAvailabilityValue(
  payload: ExternalRiderSecureProfilePayload | null,
  field: keyof SecureAvailabilityValue
): string | null {
  const scopedValue =
    payload?.scoutReport?.report?.availability?.[field] ??
    payload?.publicView?.availability?.[field] ??
    null

  return normalizeString(scopedValue)
}

function formatScoutPrecisionTier(value?: string | null): string {
  const normalized = normalizeString(value)
  if (!normalized) return 'Unknown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function isOfficeLevelScoutBlock(blockingReason?: string | null): boolean {
  const normalized = normalizeString(blockingReason)?.toLowerCase() ?? ''
  return normalized.includes('office') && normalized.includes('level')
}

function getEffectiveScoutCanStart(scout?: AvailableScoutStaffRow | null): boolean {
  if (!scout) return false
  if (scout.on_active_course) return false
  if (scout.can_scout) return true
  if (isOfficeLevelScoutBlock(scout.blocking_reason)) return true
  return false
}

function getEffectiveScoutBlockingReason(scout?: AvailableScoutStaffRow | null): string | null {
  if (!scout) return null

  if (scout.on_active_course) {
    return normalizeString(scout.blocking_reason) ?? 'This scout is already on an active course.'
  }

  if (scout.can_scout) return null
  if (isOfficeLevelScoutBlock(scout.blocking_reason)) return null

  return normalizeString(scout.blocking_reason) ?? 'This scout cannot start a report right now.'
}

export default function ExternalRiderProfilePage({
  riderId: riderIdProp,
  gameDate: gameDateProp,
  marketMode = 'general',
  onBack,
  onOpenFreeAgentNegotiation,
}: ExternalRiderProfilePageProps) {
  const navigate = useNavigate()
  const location = useLocation()
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
  const [secureProfile, setSecureProfile] = useState<ExternalRiderSecureProfilePayload | null>(null)
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
  const [marketActionMessage, setMarketActionMessage] = useState<string | null>(null)

  const [scoutActionMessage, setScoutActionMessage] = useState<string | null>(null)
  const [scoutTaskLoading, setScoutTaskLoading] = useState(false)
  const [scoutTaskError, setScoutTaskError] = useState<string | null>(null)
  const [activeScoutTask, setActiveScoutTask] = useState<ActiveScoutTaskRow | null>(null)

  const [scoutPickerOpen, setScoutPickerOpen] = useState(false)
  const [availableScouts, setAvailableScouts] = useState<AvailableScoutStaffRow[]>([])
  const [availableScoutsLoading, setAvailableScoutsLoading] = useState(false)
  const [availableScoutsError, setAvailableScoutsError] = useState<string | null>(null)
  const [selectedScoutStaffId, setSelectedScoutStaffId] = useState<string>('')
  const [scoutSubmitLoading, setScoutSubmitLoading] = useState(false)

  const [freeAgentActionLoading, setFreeAgentActionLoading] = useState(false)
  const [freeAgentActionError, setFreeAgentActionError] = useState<string | null>(null)

  const [offerModal, setOfferModal] = useState<{
    listingId: string
    sellerClubId: string
    sellerClubName: string | null
    riderId: string
    riderName: string
    askingPrice: number
  } | null>(null)
  const [offerDraftPrice, setOfferDraftPrice] = useState('')
  const [offerModalMessage, setOfferModalMessage] = useState<string | null>(null)
  const [offerSubmitting, setOfferSubmitting] = useState(false)

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
      setSecureProfile(null)
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
      setRecentRaces([])
      setActiveTransferListing(null)
      setActiveFreeAgent(null)
      setMarketError(null)
      setMarketActionMessage(null)
      setScoutActionMessage(null)
      setScoutTaskLoading(false)
      setScoutTaskError(null)
      setActiveScoutTask(null)
      setScoutPickerOpen(false)
      setAvailableScouts([])
      setAvailableScoutsLoading(false)
      setAvailableScoutsError(null)
      setSelectedScoutStaffId('')
      setScoutSubmitLoading(false)
      setFreeAgentActionLoading(false)
      setFreeAgentActionError(null)
      setOfferModal(null)
      setOfferDraftPrice('')
      setOfferModalMessage(null)
      setOfferSubmitting(false)
      setHistoryRows([])
      setHistoryError(null)
      setActiveTab(defaultTab)

      if (!resolvedRiderId) {
        setProfileError('Missing rider id.')
        setProfileLoading(false)
        return
      }

      try {
        const [secureProfileResult, gameDatePartsResult] = await Promise.all([
          supabase.rpc('get_external_rider_profile', {
            p_rider_id: resolvedRiderId,
          }),
          supabase.rpc('get_current_game_date_parts'),
        ])

        if (secureProfileResult.error) throw secureProfileResult.error

        const nextSecureProfile =
          secureProfileResult.data as ExternalRiderSecureProfilePayload | null

        if (!nextSecureProfile) {
          throw new Error('Secure rider profile could not be loaded.')
        }

        if (!nextSecureProfile?.profile) {
          throw new Error('Secure rider profile payload is missing profile data.')
        }

        if (!mounted) return

        setSecureProfile(nextSecureProfile)
        setSelectedRider(buildRiderDetailsFromSecureProfile(nextSecureProfile))

        if (gameDatePartsResult.error) throw gameDatePartsResult.error

        const gameDateParts = Array.isArray(gameDatePartsResult.data)
          ? gameDatePartsResult.data[0]
          : gameDatePartsResult.data

        const typedGameState =
          gameDateParts &&
          typeof gameDateParts.season_number === 'number' &&
          typeof gameDateParts.month_number === 'number' &&
          typeof gameDateParts.day_number === 'number' &&
          typeof gameDateParts.hour_number === 'number' &&
          typeof gameDateParts.minute_number === 'number'
            ? (gameDateParts as ExternalProfileGameStateRow)
            : null

        setCurrentSeasonNumber(
          typeof typedGameState?.season_number === 'number' ? typedGameState.season_number : null
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

    async function loadScoutTask() {
      if (!selectedRider?.id) return

      await supabase.rpc('complete_due_rider_scout_tasks')

      try {
        setScoutTaskLoading(true)
        setScoutTaskError(null)

        const nextTask = await fetchActiveScoutTaskForRider(
          selectedRider.id,
          normalizeString(secureProfile?.clubId)
        )

        if (!mounted) return
        setActiveScoutTask(nextTask)
      } catch (error: any) {
        if (!mounted) return
        setActiveScoutTask(null)
        setScoutTaskError(error?.message ?? 'Could not load scout task.')
      } finally {
        if (!mounted) return
        setScoutTaskLoading(false)
      }
    }

    void loadScoutTask()

    return () => {
      mounted = false
    }
  }, [selectedRider?.id, secureProfile?.clubId])

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

  const effectiveIsScouted = Boolean(secureProfile?.scoutReport)
  const visibleOverallValue = getSecureOverallLabel(secureProfile)

  const selectedScoutOption = useMemo(
    () =>
      availableScouts.find(row => row.scout_staff_id === selectedScoutStaffId) ?? null,
    [availableScouts, selectedScoutStaffId]
  )

  const selectedScoutEffectiveBlockingReason = useMemo(
    () => getEffectiveScoutBlockingReason(selectedScoutOption),
    [selectedScoutOption]
  )

  const shouldShowScoutButton = !secureProfile?.isOwnRider && !activeScoutTask
  const scoutButtonLabel = secureProfile?.scoutReport ? 'Scout Rider Again' : 'Scout Rider'

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

  const skillRows = [
    { label: 'Sprint', key: 'sprint' },
    { label: 'Climbing', key: 'climbing' },
    { label: 'Time Trial', key: 'time_trial' },
    { label: 'Endurance', key: 'endurance' },
    { label: 'Flat', key: 'flat' },
    { label: 'Recovery', key: 'recovery' },
    { label: 'Resistance', key: 'resistance' },
    { label: 'Race IQ', key: 'race_iq' },
    { label: 'Teamwork', key: 'teamwork' },
    { label: 'Morale', key: 'morale' },
  ]

  const skillColumns = useMemo(() => {
    const midpoint = Math.ceil(skillRows.length / 2)
    return [skillRows.slice(0, midpoint), skillRows.slice(midpoint)]
  }, [])

  async function refreshSecureProfile(targetRiderId: string) {
    const { data, error } = await supabase.rpc('get_external_rider_profile', {
      p_rider_id: targetRiderId,
    })

    if (error) throw error

    const nextSecureProfile = data as ExternalRiderSecureProfilePayload | null

    if (!nextSecureProfile || !nextSecureProfile.profile) {
      throw new Error('Secure rider profile could not be loaded.')
    }

    setSecureProfile(nextSecureProfile)
    setSelectedRider(buildRiderDetailsFromSecureProfile(nextSecureProfile))
  }

  async function refreshActiveScoutTask(targetRiderId: string, targetClubId?: string | null) {
    const nextTask = await fetchActiveScoutTaskForRider(targetRiderId, targetClubId)
    setActiveScoutTask(nextTask)
  }

  function formatTransferAmount(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return '—'
    const roundedToThousand = Math.round(Number(value) / 1000) * 1000
    return `$${roundedToThousand.toLocaleString('en-US')}`
  }

  function formatCurrencyInput(value: string) {
    const digits = value.replace(/[^\d]/g, '')
    if (!digits) return ''
    return `$${Number(digits).toLocaleString('en-US')}`
  }

  function parseCurrencyInput(value: string) {
    const digits = value.replace(/[^\d]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : null
  }

  async function fetchClubNameById(clubId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return normalizeString(data?.name) ?? null
    } catch {
      return null
    }
  }

  async function openTransferOfferModal(listing: ActiveTransferListing) {
    const sellerClubName = await fetchClubNameById(listing.seller_club_id)

    setOfferModal({
      listingId: listing.id,
      sellerClubId: listing.seller_club_id,
      sellerClubName,
      riderId: selectedRider?.id ?? '',
      riderName,
      askingPrice: listing.asking_price,
    })

    setOfferDraftPrice(formatTransferAmount(listing.asking_price))
    setOfferModalMessage(null)
    setOfferSubmitting(false)
  }

  async function handleOpenScoutPicker() {
    if (!selectedRider?.id || availableScoutsLoading) return

    try {
      setAvailableScoutsLoading(true)
      setAvailableScoutsError(null)
      setScoutActionMessage(null)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user?.id) throw new Error('You must be signed in to start scouting.')

      const { data, error } = await supabase.rpc('get_available_scout_staff_for_rider', {
        p_rider_id: selectedRider.id,
        p_requesting_user_id: user.id,
      })

      if (error) throw error

      const rows = (Array.isArray(data) ? data : []) as AvailableScoutStaffRow[]

      setAvailableScouts(rows)
      setSelectedScoutStaffId(
        rows.find(row => getEffectiveScoutCanStart(row))?.scout_staff_id ??
          rows[0]?.scout_staff_id ??
          ''
      )
      setScoutPickerOpen(true)
    } catch (error: any) {
      setAvailableScouts([])
      setSelectedScoutStaffId('')
      setAvailableScoutsError(error?.message ?? 'Could not load available scouts.')
      setScoutPickerOpen(true)
    } finally {
      setAvailableScoutsLoading(false)
    }
  }

  async function handleSubmitScoutTask() {
    if (!selectedRider?.id) return

    if (!selectedScoutOption) {
      setAvailableScoutsError('Please choose a scout.')
      return
    }

    const effectiveBlockingReason = getEffectiveScoutBlockingReason(selectedScoutOption)
    if (effectiveBlockingReason) {
      setAvailableScoutsError(effectiveBlockingReason)
      return
    }

    try {
      setScoutSubmitLoading(true)
      setAvailableScoutsError(null)
      setScoutActionMessage(null)
      setScoutTaskError(null)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user?.id) throw new Error('You must be signed in to start scouting.')

      const { data, error } = await supabase.rpc('start_rider_scout_task_v1', {
        p_rider_id: selectedRider.id,
        p_scout_staff_id: selectedScoutOption.scout_staff_id,
        p_requesting_user_id: user.id,
      })

      if (error) throw error

      const result = Array.isArray(data) ? data[0] : data

      const durationHours = normalizeNumber(
        result?.duration_hours ?? selectedScoutOption.estimated_duration_hours,
        selectedScoutOption.estimated_duration_hours
      )

      const isPaid = Boolean(
        result?.is_paid ?? (selectedScoutOption.next_report_coin_cost ?? 0) > 0
      )

      const coinCost = normalizeNumber(
        result?.coin_cost ?? selectedScoutOption.next_report_coin_cost,
        0
      )

      setScoutPickerOpen(false)

      setScoutActionMessage(
        isPaid
          ? `Scout task started with ${selectedScoutOption.scout_name}. Estimated duration: ${durationHours} in-game hour${
              durationHours === 1 ? '' : 's'
            }. This report uses ${coinCost} coin${coinCost === 1 ? '' : 's'}.`
          : `Scout task started with ${selectedScoutOption.scout_name}. Estimated duration: ${durationHours} in-game hour${
              durationHours === 1 ? '' : 's'
            }.`
      )

      await refreshActiveScoutTask(
        selectedRider.id,
        normalizeString(secureProfile?.clubId)
      )
      await refreshSecureProfile(selectedRider.id)
    } catch (error: any) {
      setAvailableScoutsError(error?.message ?? 'Failed to start scouting task.')
    } finally {
      setScoutSubmitLoading(false)
    }
  }

  async function handleSubmitTransferOfferFromProfile() {
    if (!offerModal) return

    const offeredPrice = parseCurrencyInput(offerDraftPrice)

    if (!offeredPrice || offeredPrice <= 0) {
      setOfferModalMessage('Please enter a valid offer amount.')
      return
    }

    const myPrimaryClubId = normalizeString(secureProfile?.clubId)
    if (!myPrimaryClubId) {
      setOfferModalMessage('Your primary club is not available.')
      return
    }

    try {
      setOfferSubmitting(true)
      setOfferModalMessage(null)

      const { data: existingOffer, error: existingOfferError } = await supabase
        .from('rider_transfer_offers')
        .select('id, status')
        .eq('listing_id', offerModal.listingId)
        .eq('buyer_club_id', myPrimaryClubId)
        .in('status', ['open', 'club_accepted', 'accepted'])
        .limit(1)
        .maybeSingle()

      if (existingOfferError) throw existingOfferError

      if (existingOffer) {
        throw new Error(`You already have an active offer for ${offerModal.riderName}.`)
      }

      const { data, error } = await supabase.rpc('submit_rider_transfer_offer', {
        p_listing_id: offerModal.listingId,
        p_buyer_club_id: myPrimaryClubId,
        p_offered_price: offeredPrice,
      })

      if (error) throw error

      const result = Array.isArray(data) ? data[0] : data

      setOfferModal(null)
      setOfferDraftPrice('')
      setOfferModalMessage(null)

      if (result?.status === 'club_accepted' || result?.status === 'accepted') {
        setMarketActionMessage(
          `Your offer of ${formatTransferAmount(
            offeredPrice
          )} was accepted. Check Transfers to continue rider negotiation.`
        )
      } else {
        setMarketActionMessage(
          `Your offer of ${formatTransferAmount(offeredPrice)} was sent successfully.`
        )
      }

      await refreshSecureProfile(offerModal.riderId)
    } catch (error: any) {
      setOfferModalMessage(error?.message ?? 'Failed to submit transfer offer.')
    } finally {
      setOfferSubmitting(false)
    }
  }

  function handleNegotiateWithFreeAgent() {
    try {
      setFreeAgentActionLoading(true)
      setFreeAgentActionError(null)

      const freeAgentId = activeFreeAgent?.id
      const riderId = selectedRider?.id

      if (!freeAgentId) {
        throw new Error('Free agent id is missing.')
      }

      if (!riderId) {
        throw new Error('Rider id is missing.')
      }

      if (onOpenFreeAgentNegotiation) {
        onOpenFreeAgentNegotiation({
          riderId,
          riderName,
          freeAgentId,
          expiresOnGameDate: activeFreeAgent?.expires_on_game_date ?? null,
        })
        setFreeAgentActionLoading(false)
        return
      }

      const returnTo = `${location.pathname}${location.search || ''}`

      navigate(
        `/dashboard/transfers/free-agent-negotiations/new?freeAgentId=${encodeURIComponent(
          freeAgentId
        )}&riderId=${encodeURIComponent(riderId)}&returnTo=${encodeURIComponent(returnTo)}`
      )
    } catch (err: any) {
      setFreeAgentActionError(err?.message || 'Failed to open free-agent draft.')
      setFreeAgentActionLoading(false)
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

                {effectiveIsScouted ? (
                  <span className="rounded-full border border-violet-700/20 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-800">
                    Scouted
                  </span>
                ) : null}

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

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Scouting
                        </div>

                        {activeScoutTask ? (
                          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            <div className="font-medium text-blue-900">
                              {(activeScoutTask.scout_name ??
                                activeScoutTask.scout_staff_name ??
                                'Assigned scout')}{' '}
                              is currently scouting this rider.
                            </div>

                            <div className="mt-1">
                              Completes:{' '}
                              {formatGameTimestampAsSeasonLabel(
                                activeScoutTask.completes_at_game_ts
                              )}
                            </div>
                          </div>
                        ) : secureProfile?.scoutReport ? (
                          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                            Scouting report available for this rider.
                          </div>
                        ) : secureProfile?.isOwnRider ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            Scouting is only available for external riders.
                          </div>
                        ) : null}

                        {shouldShowScoutButton ? (
                          <button
                            type="button"
                            onClick={() => {
                              void handleOpenScoutPicker()
                            }}
                            disabled={availableScoutsLoading || scoutTaskLoading}
                            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {availableScoutsLoading
                              ? 'Loading scouts…'
                              : scoutTaskLoading
                                ? 'Checking scout tasks…'
                                : scoutButtonLabel}
                          </button>
                        ) : null}

                        {scoutTaskError ? (
                          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {scoutTaskError}
                          </div>
                        ) : null}

                        {scoutActionMessage ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            {scoutActionMessage}
                          </div>
                        ) : null}
                      </div>

                      {activeTransferListing ? (
                        <button
                          type="button"
                          onClick={() => {
                            void openTransferOfferModal(activeTransferListing)
                          }}
                          className="w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500"
                        >
                          Make Transfer Offer
                        </button>
                      ) : null}

                      {activeFreeAgent ? (
                        <div className="mt-4 space-y-3">
                          <button
                            type="button"
                            onClick={() => {
                              handleNegotiateWithFreeAgent()
                            }}
                            disabled={freeAgentActionLoading}
                            className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition ${
                              freeAgentActionLoading
                                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                                : 'bg-yellow-400 text-black hover:bg-yellow-300'
                            }`}
                          >
                            {freeAgentActionLoading
                              ? 'Opening negotiation...'
                              : 'Negotiate with Free Agent'}
                          </button>

                          {freeAgentActionError ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {freeAgentActionError}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {marketActionMessage ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
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
                      {effectiveIsScouted ? (
                        <DetailRow label="Potential" value={getSecurePotentialText(secureProfile)} />
                      ) : null}
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
                    effectiveIsScouted
                      ? 'Scouted report ranges are shown below. Better scouts provide narrower and more reliable ranges.'
                      : 'Skill attributes are hidden until the rider is scouted.'
                  }
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {skillColumns.map((column, columnIndex) => (
                      <div key={columnIndex} className="divide-y divide-slate-100">
                        {column.map(item => (
                          <DetailRow
                            key={item.label}
                            label={item.label}
                            value={getSecureAttributeLabel(secureProfile, item.key)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {effectiveIsScouted ? (
                  <SectionCard title="Availability & Medical">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Availability"
                        value={getSecureAvailabilityValue(secureProfile, 'status') ?? '—'}
                      />
                      <DetailRow
                        label="Unavailable Until"
                        value={
                          getSecureAvailabilityValue(secureProfile, 'unavailable_until')
                            ? formatShortGameDate(
                                getSecureAvailabilityValue(
                                  secureProfile,
                                  'unavailable_until'
                                ) as string
                              )
                            : '—'
                        }
                      />
                      <DetailRow
                        label="Medical / Reason"
                        value={getSecureAvailabilityValue(secureProfile, 'reason') ?? '—'}
                      />
                      <DetailRow label="Fatigue" value={getSecureFatigueLabel(secureProfile)} />
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

      {scoutPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Choose Scout</h3>
                <div className="mt-1 text-sm text-gray-600">
                  Select which scout will handle this report for {riderName}.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setScoutPickerOpen(false)
                  setAvailableScoutsError(null)
                  setScoutSubmitLoading(false)
                }}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            {availableScoutsError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {availableScoutsError}
              </div>
            ) : null}

            {availableScoutsLoading ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                Loading available scouts…
              </div>
            ) : availableScouts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No available scouts found for this rider.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select scout
                  </label>

                  <select
                    value={selectedScoutStaffId}
                    onChange={e => {
                      setSelectedScoutStaffId(e.target.value)
                      setAvailableScoutsError(null)
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Choose a scout...</option>
                    {availableScouts.map(scout => {
                      const busy = Boolean(scout.has_active_scouting_task)

                      return (
                        <option
                          key={scout.scout_staff_id}
                          value={scout.scout_staff_id}
                          disabled={busy}
                        >
                          {scout.scout_name}
                          {busy ? ' — busy' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {selectedScoutOption ? (
                  <div
                    className={`rounded-xl border bg-white p-4 ${
                      getEffectiveScoutCanStart(selectedScoutOption)
                        ? 'border-blue-400'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">
                            {selectedScoutOption.scout_name}
                          </div>

                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Report quality: {formatScoutPrecisionTier(selectedScoutOption.precision_tier)}
                          </span>

                          {!getEffectiveScoutCanStart(selectedScoutOption) ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                              Unavailable
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-3">
                          <div>
                            <span className="font-semibold">Expertise:</span>{' '}
                            {selectedScoutOption.expertise}
                          </div>
                          <div>
                            <span className="font-semibold">Experience:</span>{' '}
                            {selectedScoutOption.experience}
                          </div>
                          <div>
                            <span className="font-semibold">Potential:</span>{' '}
                            {selectedScoutOption.potential}
                          </div>
                          <div>
                            <span className="font-semibold">Leadership:</span>{' '}
                            {selectedScoutOption.leadership}
                          </div>
                          <div>
                            <span className="font-semibold">Efficiency:</span>{' '}
                            {selectedScoutOption.efficiency}
                          </div>
                          <div>
                            <span className="font-semibold">Loyalty:</span>{' '}
                            {selectedScoutOption.loyalty}
                          </div>
                        </div>
                      </div>

                      <div className="w-full shrink-0 space-y-2 lg:w-[290px]">
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">Estimated duration:</span>{' '}
                          {selectedScoutOption.estimated_duration_hours} in-game hour
                          {selectedScoutOption.estimated_duration_hours === 1 ? '' : 's'}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">Free reports left today:</span>{' '}
                          {normalizeNumber(selectedScoutOption.free_reports_left_today, 0)} /{' '}
                          {normalizeNumber(selectedScoutOption.free_reports_per_day, 1)}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">Wallet balance:</span>{' '}
                          {normalizeNumber(selectedScoutOption.wallet_balance, 0)} coin
                          {normalizeNumber(selectedScoutOption.wallet_balance, 0) === 1 ? '' : 's'}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">Next report coin cost:</span>{' '}
                          {normalizeNumber(selectedScoutOption.next_report_coin_cost, 0)}
                        </div>

                        {selectedScoutEffectiveBlockingReason ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {selectedScoutEffectiveBlockingReason}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {selectedScoutOption && normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This scout has no free reports left today. Starting this scouting task will cost{' '}
                <span className="font-semibold">
                  {normalizeNumber(selectedScoutOption.next_report_coin_cost, 0)} coin
                </span>
                . You currently have{' '}
                <span className="font-semibold">
                  {normalizeNumber(selectedScoutOption.wallet_balance, 0)} coin
                </span>
                .
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Each scout includes 1 free report per in-game day. Additional reports cost 1 coin.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setScoutPickerOpen(false)
                  setAvailableScoutsError(null)
                  setScoutSubmitLoading(false)
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!selectedScoutOption || Boolean(selectedScoutEffectiveBlockingReason) || scoutSubmitLoading}
                onClick={() => {
                  void handleSubmitScoutTask()
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  !selectedScoutOption || Boolean(selectedScoutEffectiveBlockingReason) || scoutSubmitLoading
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-yellow-400 text-black hover:bg-yellow-300'
                }`}
              >
                {scoutSubmitLoading ? 'Starting...' : 'Start Scouting'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Make Transfer Offer</h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span> {offerModal.riderName}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Seller:</span>{' '}
                {offerModal.sellerClubName ?? 'Unknown club'}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Asking price:</span>{' '}
                {formatTransferAmount(offerModal.askingPrice)}
              </div>
            </div>

            {offerModalMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {offerModalMessage}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Your Offer
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={offerDraftPrice}
                onChange={e => setOfferDraftPrice(formatCurrencyInput(e.target.value))}
                placeholder="$128,000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfferModal(null)
                  setOfferDraftPrice('')
                  setOfferModalMessage(null)
                  setOfferSubmitting(false)
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={offerSubmitting}
                onClick={() => {
                  void handleSubmitTransferOfferFromProfile()
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  offerSubmitting
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-yellow-400 text-black hover:bg-yellow-300'
                }`}
              >
                {offerSubmitting ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}