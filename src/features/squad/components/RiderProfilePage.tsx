/**
 * RiderProfilePage.tsx
 *
 * Latest update:
 * - Unified transfer-list active statuses across loaders
 * - Release is blocked while a rider is transfer listed
 * - Transfer-list state is visible in the header area
 * - Added optional roster refresh and compare callbacks
 * - Compare now behaves like an in-page tab instead of navigating away
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import RiderComparePanel from './RiderComparePanel'

import type {
  RenewalNegotiationData,
  RiderCurrentHealthCase,
  RiderDetails,
  TeamType,
} from '../types'

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
  getMovementWindowInfo,
  getRenewalStartLabel,
  isFutureDateTime,
} from '../utils/dates'

import {
  formatBlockFlag,
  formatCaseStageLabel,
  formatHealthCaseCode,
  formatMoney,
  formatSalary,
  formatSeverityLabel,
  formatUnavailableReason,
  formatWeeklySalary,
  getCountryName,
  getFlagImageUrl,
  getSeasonWage,
} from '../utils/formatters'

import {
  getDefaultRiderAvailabilityStatus,
  getFatigueUi,
  getHealthPanelNote,
  getMoraleUi,
  getPotentialUi,
  getRenewalErrorMessage,
  getRiderImageUrl,
  getRiderStatusUi,
} from '../utils/rider-ui'

type RiderProfileTab = 'overview' | 'contract' | 'training' | 'compare' | 'history'
type OfferExtensionValue = '1' | '2'

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

type AvailabilityStatus = 'fit' | 'not_fully_fit' | 'injured' | 'sick'

type FamilyClub = {
  club_id: string
  club_name: string
  team_label: 'First Team' | 'U23'
}

type ClubRegularTrainingDefaultRow = {
  club_id: string
  team_scope: string
  focus_code: string
  intensity: 'light' | 'normal' | 'hard'
  auto_when_free: boolean
  updated_at?: string
  created_at?: string
}

type RiderRegularTrainingPlanRow = {
  rider_id: string
  club_id: string
  focus_code: string
  intensity: 'light' | 'normal' | 'hard'
  is_active: boolean
  auto_when_free: boolean
  preferred_days: number[] | null
  updated_at?: string
  created_at?: string
}

type FocusedTrainingRider = {
  club_id: string
  rider_id: string
  display_name: string
  assigned_role: string | null
  age_years: number | null
  overall: number | null
  country_code: string | null
  availability_status: AvailabilityStatus
  fatigue: number | null
  source_club_name?: string
  team_label?: 'First Team' | 'U23'
}

type RiderTrainingSessionPoint = {
  label: string
  value: number
  focus: string
  intensity: string
  source: string
  date: string | null
  participated: boolean
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

type ReleaseOwnedRiderResult = {
  free_agent_id: string
  rider_id: string
  released_from_club_id: string
  release_cost: number
  remaining_weeks: number
  remaining_salary: number
  expires_on_game_date: string | null
  finance_transaction_id: string | null
}

type RiderReleasePreview = {
  rider_id: string
  main_club_id: string
  weekly_salary: number
  contract_expires_on: string | null
  remaining_days: number
  remaining_weeks: number
  remaining_salary: number
  release_cost: number
  transfer_listed: boolean
  transfer_listing_id: string | null
  blocked_reason: string | null
  season_end_game_date: string | null
  free_agent_expires_on_game_date: string | null
  current_balance: number
  balance_after_release: number
  can_afford: boolean
  can_release: boolean
}

type RiderProfilePageProps = {
  riderId: string
  gameDate?: string | null
  currentTeamType?: TeamType
  trainingPagePath?: string
  onBack: () => void
  onRosterChanged?: () => Promise<void> | void
  onCompareRider?: (payload: {
    riderId: string
    riderName: string
    currentTeamType: TeamType
  }) => void
}

const REGULAR_TRAINING_FOCUS_OPTIONS = [
  'general',
  'recovery',
  'sprint',
  'climbing',
  'flat',
  'time_trial',
  'endurance',
  'resistance',
  'race_iq',
  'teamwork',
] as const

const REGULAR_TRAINING_INTENSITY_OPTIONS: Array<'light' | 'normal' | 'hard'> = [
  'light',
  'normal',
  'hard',
]

const ACTIVE_TRANSFER_LISTING_STATUSES = ['listed', 'active', 'open'] as const

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

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function titleCaseFromSnake(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatTrainingFocusLabel(value: string): string {
  return titleCaseFromSnake(value)
}

function formatTrainingIntensityLabel(value: 'light' | 'normal' | 'hard'): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
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

function formatChartAxisLabel(value: number): string {
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '')
  if (value >= 0.1) return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
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

function RenewalFeedbackBox({
  type,
  message,
}: {
  type: 'success' | 'error' | 'info' | null
  message: string | null
}) {
  if (!message) return null

  const classes =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'

  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{message}</div>
}

function TrainingTrendChart({
  sessions,
}: {
  sessions: RiderTrainingSessionPoint[]
}) {
  const chartWidth = 760
  const chartHeight = 280
  const leftPad = 48
  const rightPad = 18
  const topPad = 18
  const bottomPad = 40

  const safeSessions = sessions.slice(-5)
  const maxValue = Math.max(0.02, ...safeSessions.map((s) => s.value || 0))
  const midValue = maxValue / 2
  const innerWidth = chartWidth - leftPad - rightPad
  const innerHeight = chartHeight - topPad - bottomPad
  const baselineY = chartHeight - bottomPad

  const points = safeSessions.map((session, index) => {
    const x =
      leftPad +
      (safeSessions.length === 1
        ? innerWidth / 2
        : (index / Math.max(1, safeSessions.length - 1)) * innerWidth)

    const y = topPad + innerHeight - ((session.value || 0) / maxValue) * innerHeight
    return { ...session, x, y }
  })

  const linePath = points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : ''

  const guides = [
    { value: maxValue, y: topPad },
    { value: midValue, y: topPad + innerHeight / 2 },
    { value: 0, y: baselineY },
  ]

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[280px] w-full">
      <line
        x1={leftPad}
        y1={topPad}
        x2={leftPad}
        y2={baselineY}
        stroke="rgba(148,163,184,0.35)"
        strokeWidth="1"
      />
      <line
        x1={leftPad}
        y1={baselineY}
        x2={chartWidth - rightPad}
        y2={baselineY}
        stroke="rgba(148,163,184,0.35)"
        strokeWidth="1"
      />

      {guides.map((guide, index) => (
        <g key={index}>
          <line
            x1={leftPad}
            y1={guide.y}
            x2={chartWidth - rightPad}
            y2={guide.y}
            stroke="rgba(148,163,184,0.16)"
            strokeWidth="1"
          />
          <text x={leftPad - 8} y={guide.y + 4} textAnchor="end" fontSize="11" fill="#64748b">
            {formatChartAxisLabel(guide.value)}
          </text>
        </g>
      ))}

      {points.length > 0 ? <path d={areaPath} fill="rgba(234,179,8,0.18)" /> : null}
      {points.length > 0 ? <path d={linePath} fill="none" stroke="#d4a106" strokeWidth="3" /> : null}

      {points.map((p) => (
        <g key={`${p.label}-${p.date ?? ''}`}>
          <circle cx={p.x} cy={p.y} r="4" fill="#d4a106" />
          <text x={p.x} y={chartHeight - 12} textAnchor="middle" fontSize="11" fill="#64748b">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
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
    .single()

  if (error) throw error

  const rider = data as RiderDetails

  return {
    ...rider,
    availability_status: rider.availability_status ?? getDefaultRiderAvailabilityStatus(),
  }
}

async function fetchRiderCurrentHealthCaseById(
  riderId: string
): Promise<RiderCurrentHealthCase | null> {
  const { data, error } = await supabase.rpc('get_rider_current_health_case', {
    p_rider_id: riderId,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return (row ?? null) as RiderCurrentHealthCase | null
}

async function fetchRiderCareerHistoryById(riderId: string): Promise<RiderCareerHistoryRow[]> {
  function normalizeRows(rows: any[]): RiderCareerHistoryRow[] {
    const normalized = rows
      .map((row) => {
        const seasonValueRaw =
          row.season ?? row.season_number ?? row.season_id ?? row.year ?? row.current_season ?? null

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
      .filter((row) => row.team_name || row.season_label)

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

  return {
    points: 0,
    podiums: 0,
    jerseys: 0,
  }
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

  return {
    races: 0,
    wins: 0,
    podiums: 0,
    top10: 0,
    points: 0,
  }
}

async function fetchRiderLastFiveRacesById(riderId: string): Promise<RiderRecentRaceRow[]> {
  const normalizeRows = (rows: any[]): RiderRecentRaceRow[] =>
    rows
      .map((row) => ({
        race_name:
          row.race_name ?? row.event_name ?? row.race_label ?? row.stage_name ?? 'Unknown race',
        race_date: row.race_date ?? row.event_date ?? row.date ?? null,
        finish_position: normalizeNumber(
          row.finish_position ?? row.position ?? row.final_position ?? row.result_position,
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

function TransferListModal({
  open,
  onClose,
  rider,
  onUpdated,
  onTransferListingChanged,
}: {
  open: boolean
  onClose: () => void
  rider: RiderDetails | null
  onUpdated: (updatedRider: RiderDetails) => void
  onTransferListingChanged?: () => Promise<void> | void
}) {
  const [askingPriceInput, setAskingPriceInput] = useState('')
  const [defaultAskingPrice, setDefaultAskingPrice] = useState<number | null>(null)
  const [loadingSuggestedPrice, setLoadingSuggestedPrice] = useState(false)
  const [savingPrice, setSavingPrice] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadSuggestedPrice() {
      if (!rider?.id) return

      setLoadingSuggestedPrice(true)
      setMessage(null)
      setMessageType(null)
      setAskingPriceInput(rider.asking_price != null ? String(rider.asking_price) : '')

      try {
        const { data, error } = await supabase.rpc('calculate_rider_default_asking_price', {
          p_rider_id: rider.id,
        })

        if (error) throw error
        if (!mounted) return
        setDefaultAskingPrice(typeof data === 'number' ? data : null)
      } catch (e: any) {
        if (!mounted) return
        setDefaultAskingPrice(null)
        setMessage(e?.message ?? 'Could not load suggested asking price.')
        setMessageType('error')
      } finally {
        if (!mounted) return
        setLoadingSuggestedPrice(false)
      }
    }

    if (open && rider?.id) {
      void loadSuggestedPrice()
    } else {
      setAskingPriceInput('')
      setDefaultAskingPrice(null)
      setLoadingSuggestedPrice(false)
      setSavingPrice(false)
      setMessage(null)
      setMessageType(null)
    }

    return () => {
      mounted = false
    }
  }, [open, rider?.id, rider?.asking_price])

  async function handlePlaceOnTransferList() {
    if (!rider?.id) return

    const price = Math.round(Number(askingPriceInput))

    if (!Number.isFinite(price) || price < 1000) {
      setMessage('Asking price must be at least $1,000.')
      setMessageType('error')
      return
    }

    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('list_rider_for_transfer', {
        p_rider_id: rider.id,
        p_asking_price: price,
        p_duration_days: 7,
      })

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)

      if (onTransferListingChanged) {
        await onTransferListingChanged()
      }

      setAskingPriceInput(
        refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : ''
      )
      setMessage('Rider placed on transfer list successfully.')
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not place rider on transfer list.')
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  async function handleResetToSuggested() {
    if (!rider?.id) return

    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('clear_rider_asking_price', {
        p_rider_id: rider.id,
      })

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)

      if (onTransferListingChanged) {
        await onTransferListingChanged()
      }

      setAskingPriceInput(
        refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : ''
      )
      setMessage('Asking price reset to suggested value.')
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not reset asking price.')
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  if (!open || !rider) return null

  const riderName = rider.display_name ?? `${rider.first_name} ${rider.last_name}`

  const currentAskingPriceDisplay =
    rider.asking_price == null ? '—' : formatCompactMoneyValue(rider.asking_price)

  const suggestedAskingPriceDisplay =
    loadingSuggestedPrice
      ? 'Loading...'
      : defaultAskingPrice == null
        ? '—'
        : formatCompactMoneyValue(defaultAskingPrice)

  const pricingModeLabel = rider.asking_price_manual ? 'Manual price' : 'Suggested price'

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <div className="text-2xl font-semibold text-gray-900">Transfer List</div>
            <div className="mt-1 text-sm text-gray-500">
              Manage transfer pricing for {riderName}.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            <DetailRow label="Market Value" value={formatCompactMoneyValue(rider.market_value)} />
            <DetailRow label="Current Asking Price" value={currentAskingPriceDisplay} />
            <DetailRow label="Suggested Asking Price" value={suggestedAskingPriceDisplay} />
            <DetailRow label="Pricing Mode" value={pricingModeLabel} />
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Transfer Asking Price
            </label>

            <div className="mb-2 text-sm text-gray-500">
              Set the asking price and place this rider on the transfer list.
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">
                $
              </span>
              <input
                type="number"
                min={1000}
                value={askingPriceInput}
                onChange={(e) => {
                  setAskingPriceInput(e.target.value)
                  if (message) {
                    setMessage(null)
                    setMessageType(null)
                  }
                }}
                disabled={savingPrice}
                className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Enter asking price"
              />
            </div>

            {message ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  messageType === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleResetToSuggested}
            disabled={savingPrice}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? 'Working...' : 'Reset to Suggested'}
          </button>

          <button
            type="button"
            onClick={handlePlaceOnTransferList}
            disabled={savingPrice}
            className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? 'Working...' : 'Place on Transfer List'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReleaseRiderModal({
  open,
  rider,
  preview,
  loading,
  busy,
  onClose,
  onConfirm,
  onCancelTransferListing,
}: {
  open: boolean
  rider: RiderDetails | null
  preview: RiderReleasePreview | null
  loading: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  onCancelTransferListing: () => void
}) {
  if (!open || !rider) return null

  const riderName = rider.display_name ?? `${rider.first_name} ${rider.last_name}`

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="text-2xl font-semibold text-slate-900">Release Rider</div>
          <div className="mt-1 text-sm text-slate-500">
            Review the release cost before moving {riderName} to free agents.
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Loading release details…</div>
          ) : !preview ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Could not load release preview.
            </div>
          ) : (
            <div className="space-y-4">
              {preview.blocked_reason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="font-semibold">Release is currently blocked</div>
                  <div className="mt-1">{preview.blocked_reason}</div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SimpleInfoRow label="Weekly Wage" value={formatWeeklySalary(preview.weekly_salary)} />
                <SimpleInfoRow
                  label="Contract Ends"
                  value={formatShortGameDate(preview.contract_expires_on)}
                />
                <SimpleInfoRow label="Remaining Weeks" value={`${preview.remaining_weeks}`} />
                <SimpleInfoRow
                  label="Remaining Salary"
                  value={formatMoney(preview.remaining_salary)}
                />
                <SimpleInfoRow
                  label="Release Compensation (20%)"
                  value={
                    <span className="font-bold text-rose-700">
                      {formatMoney(preview.release_cost)}
                    </span>
                  }
                />
                <SimpleInfoRow
                  label="Free Agent Until"
                  value={formatShortGameDate(preview.free_agent_expires_on_game_date)}
                />
                <SimpleInfoRow label="Current Balance" value={formatMoney(preview.current_balance)} />
                <SimpleInfoRow
                  label="Balance After Release"
                  value={
                    <span
                      className={
                        preview.balance_after_release < 0 ? 'text-rose-700' : 'text-slate-900'
                      }
                    >
                      {formatMoney(preview.balance_after_release)}
                    </span>
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>

          {preview?.transfer_listed ? (
            <button
              type="button"
              onClick={onCancelTransferListing}
              className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Cancel Transfer Listing First
            </button>
          ) : null}

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || busy || !preview?.can_release}
            className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Releasing...' : 'Confirm Release'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RiderProfilePage({
  riderId,
  gameDate,
  currentTeamType = 'first',
  trainingPagePath: _trainingPagePath = '/training',
  onBack,
  onRosterChanged,
}: RiderProfilePageProps) {
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
  const [currentHealthCase, setCurrentHealthCase] = useState<RiderCurrentHealthCase | null>(null)
  const [skillDeltaMap, setSkillDeltaMap] = useState<RiderSkillDeltaMap>({})
  const [activeTab, setActiveTab] = useState<RiderProfileTab>('overview')
  const [contractActionMessage, setContractActionMessage] = useState<string | null>(null)

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

  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageSaveMessage, setImageSaveMessage] = useState<string | null>(null)

  const [renewalBusy, setRenewalBusy] = useState(false)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalData, setRenewalData] = useState<RenewalNegotiationData | null>(null)
  const [offerSalaryInput, setOfferSalaryInput] = useState('')
  const [offerExtensionInput, setOfferExtensionInput] = useState<OfferExtensionValue>('1')
  const [renewalResultType, setRenewalResultType] = useState<'success' | 'error' | 'info' | null>(
    null
  )
  const [renewalResultMessage, setRenewalResultMessage] = useState<string | null>(null)

  const [transferListOpen, setTransferListOpen] = useState(false)
  const [activeTransferListing, setActiveTransferListing] = useState<ActiveTransferListing | null>(
    null
  )
  const [activeTransferOfferCount, setActiveTransferOfferCount] = useState(0)
  const [transferListingBusy, setTransferListingBusy] = useState(false)
  const [releaseBusy, setReleaseBusy] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releasePreview, setReleasePreview] = useState<RiderReleasePreview | null>(null)
  const [releasePreviewLoading, setReleasePreviewLoading] = useState(false)
  const [pageToast, setPageToast] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([])
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(null)

  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null)
  const [familyClubs, setFamilyClubs] = useState<FamilyClub[]>([])
  const [regularDefaults, setRegularDefaults] = useState<ClubRegularTrainingDefaultRow[]>([])
  const [regularPlans, setRegularPlans] = useState<RiderRegularTrainingPlanRow[]>([])
  const [focusedTrainingRider, setFocusedTrainingRider] = useState<FocusedTrainingRider | null>(null)
  const [regularSavingRiderId, setRegularSavingRiderId] = useState<string | null>(null)
  const [recentTrainingSessions, setRecentTrainingSessions] = useState<RiderTrainingSessionPoint[]>(
    []
  )
  const [trainingSessionsLoading, setTrainingSessionsLoading] = useState(false)
  const [compareClubId, setCompareClubId] = useState<string | null>(null)

  const regularDefaultsByClubId = useMemo(
    () => new Map(regularDefaults.map((row) => [row.club_id, row])),
    [regularDefaults]
  )

  const regularPlansByRiderId = useMemo(
    () => new Map(regularPlans.map((row) => [row.rider_id, row])),
    [regularPlans]
  )

  function upsertRegularPlanLocal(nextRow: RiderRegularTrainingPlanRow): void {
    setRegularPlans((current) => {
      const existingIndex = current.findIndex((row) => row.rider_id === nextRow.rider_id)
      if (existingIndex === -1) return [...current, nextRow]
      const copy = [...current]
      copy[existingIndex] = nextRow
      return copy
    })
  }

  function buildPlanRowForRider(rider: FocusedTrainingRider): RiderRegularTrainingPlanRow {
    const existing = regularPlansByRiderId.get(rider.rider_id)
    if (existing) return existing

    const defaultRow = regularDefaultsByClubId.get(rider.club_id)

    return {
      rider_id: rider.rider_id,
      club_id: rider.club_id,
      focus_code: defaultRow?.focus_code ?? 'general',
      intensity: defaultRow?.intensity ?? 'normal',
      is_active: true,
      auto_when_free: true,
      preferred_days: null,
    }
  }

  function getEffectiveRegularTraining(rider: FocusedTrainingRider): {
    source: 'override' | 'default' | 'none'
    focus_code: string | null
    intensity: 'light' | 'normal' | 'hard' | null
    auto_when_free: boolean
    is_active: boolean
  } {
    const plan = regularPlansByRiderId.get(rider.rider_id)
    if (plan && plan.is_active) {
      return {
        source: 'override',
        focus_code: plan.focus_code,
        intensity: plan.intensity,
        auto_when_free: plan.auto_when_free,
        is_active: plan.is_active,
      }
    }

    const defaultRow = regularDefaultsByClubId.get(rider.club_id)
    if (defaultRow) {
      return {
        source: 'default',
        focus_code: defaultRow.focus_code,
        intensity: defaultRow.intensity,
        auto_when_free: defaultRow.auto_when_free,
        is_active: true,
      }
    }

    return {
      source: 'none',
      focus_code: null,
      intensity: null,
      auto_when_free: false,
      is_active: false,
    }
  }

  function updateRegularPlanDraft(
    rider: FocusedTrainingRider,
    patch: Partial<RiderRegularTrainingPlanRow>
  ): void {
    const base = buildPlanRowForRider(rider)
    upsertRegularPlanLocal({
      ...base,
      ...patch,
      rider_id: rider.rider_id,
      club_id: rider.club_id,
    })
  }

  async function loadRegularTrainingConfig(familyClubIds: string[]): Promise<void> {
    if (familyClubIds.length === 0) {
      setRegularDefaults([])
      setRegularPlans([])
      return
    }

    const [defaultsRes, plansRes] = await Promise.all([
      supabase.from('club_regular_training_defaults').select('*').in('club_id', familyClubIds),
      supabase.from('rider_regular_training_plans').select('*').in('club_id', familyClubIds),
    ])

    if (defaultsRes.error) throw defaultsRes.error
    if (plansRes.error) throw plansRes.error

    setRegularDefaults((defaultsRes.data ?? []) as ClubRegularTrainingDefaultRow[])
    setRegularPlans((plansRes.data ?? []) as RiderRegularTrainingPlanRow[])
  }

  async function saveRegularTrainingPlan(rider: FocusedTrainingRider): Promise<void> {
    const row = buildPlanRowForRider(rider)

    setRegularSavingRiderId(rider.rider_id)
    setTrainingMessage(null)
    setTrainingError(null)

    try {
      const payload = {
        rider_id: row.rider_id,
        club_id: row.club_id,
        focus_code: row.focus_code,
        intensity: row.intensity,
        is_active: row.is_active,
        auto_when_free: row.auto_when_free,
        preferred_days: row.preferred_days,
      }

      const { error } = await supabase
        .from('rider_regular_training_plans')
        .upsert(payload, { onConflict: 'rider_id' })

      if (error) throw error

      await loadRegularTrainingConfig(familyClubs.map((row) => row.club_id))
      setTrainingMessage(`Saved regular training override for ${rider.display_name}.`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save rider regular training override.'
      setTrainingError(message)
    } finally {
      setRegularSavingRiderId(null)
    }
  }

  async function loadActiveTransferListing(riderId: string) {
    const { data: listingRows, error: listingError } = await supabase
      .from('rider_transfer_listings')
      .select(
        'id, rider_id, seller_club_id, asking_price, listed_on_game_date, expires_on_game_date, status'
      )
      .eq('rider_id', riderId)
      .in('status', [...ACTIVE_TRANSFER_LISTING_STATUSES])
      .order('listed_on_game_date', { ascending: false })
      .limit(1)

    if (listingError) throw listingError

    const listing = listingRows?.[0]

    if (!listing) {
      setActiveTransferListing(null)
      setActiveTransferOfferCount(0)
      return
    }

    const { count, error: offersError } = await supabase
      .from('rider_transfer_offers')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .eq('status', 'open')

    if (offersError) throw offersError

    setActiveTransferListing(listing as ActiveTransferListing)
    setActiveTransferOfferCount(count ?? 0)
  }

  async function loadReleasePreview(riderId: string) {
    setReleasePreviewLoading(true)

    try {
      const { data, error } = await supabase.rpc('get_rider_release_preview', {
        p_rider_id: riderId,
      })

      if (error) throw error

      const preview = (Array.isArray(data) ? data[0] : data) as RiderReleasePreview | null
      setReleasePreview(preview)
    } catch (e: any) {
      setReleasePreview(null)
      setContractActionMessage(e?.message ?? 'Could not load release preview.')
    } finally {
      setReleasePreviewLoading(false)
    }
  }

  async function handleOpenReleaseModal() {
    if (!selectedRider?.id) return

    setPageToast(null)
    setReleaseModalOpen(true)
    setReleasePreview(null)
    await loadReleasePreview(selectedRider.id)
  }

  useEffect(() => {
    let mounted = true

    async function loadRider() {
      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setCurrentHealthCase(null)
      setSkillDeltaMap({})
      setContractActionMessage(null)
      setRenewalBusy(false)
      setRenewalModalOpen(false)
      setRenewalData(null)
      setOfferSalaryInput('')
      setOfferExtensionInput('1')
      setRenewalResultType(null)
      setRenewalResultMessage(null)
      setTransferListOpen(false)
      setActiveTransferListing(null)
      setActiveTransferOfferCount(0)
      setTransferListingBusy(false)
      setReleaseBusy(false)
      setReleaseModalOpen(false)
      setReleasePreview(null)
      setReleasePreviewLoading(false)
      setPageToast(null)
      setHistoryLoading(false)
      setHistoryError(null)
      setHistoryRows([])
      setActiveTab('overview')
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
      setRecentRaces([])
      setImageUrlInput('')
      setImageSaveMessage(null)
      setCurrentSeasonNumber(null)
      setRecentTrainingSessions([])
      setTrainingSessionsLoading(false)
      setCompareClubId(null)

      try {
        const [nextRider, nextHealthCase, deltaResult, gameDatePartsResult] = await Promise.all([
          fetchRiderDetailsById(riderId),
          fetchRiderCurrentHealthCaseById(riderId),
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
            .eq('rider_id', riderId),
          supabase.rpc('get_current_game_date_parts'),
        ])

        if (!mounted) return

        setSelectedRider(nextRider)
        setCurrentHealthCase(nextHealthCase)
        setImageUrlInput(nextRider.image_url ?? '')

        await loadActiveTransferListing(riderId)

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

        for (const row of deltaRows) {
          nextDeltaMap[row.attribute_code] = row
        }

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
  }, [riderId])

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

    async function loadTrainingConfig() {
      if (!selectedRider?.id) return

      setTrainingLoading(true)
      setTrainingError(null)
      setTrainingMessage(null)
      setFocusedTrainingRider(null)
      setFamilyClubs([])
      setRegularDefaults([])
      setRegularPlans([])

      try {
        const { data: myClubId, error: clubError } = await supabase.rpc('get_my_primary_club_id')
        if (clubError) throw clubError
        if (!myClubId) throw new Error('No club was found for the logged-in user.')

        if (mounted) {
          setCompareClubId(String(myClubId))
        }

        const familyRes = await supabase.rpc('get_club_family_ids', {
          p_club_id: myClubId,
        })
        if (familyRes.error) throw familyRes.error

        const nextFamilyClubs = (familyRes.data ?? []) as FamilyClub[]
        const familyClubIds = nextFamilyClubs.map((row) => row.club_id)
        const familyClubMap = new Map(
          nextFamilyClubs.map((row) => [
            row.club_id,
            { club_name: row.club_name, team_label: row.team_label },
          ])
        )

        const [rosterRes] = await Promise.all([
          supabase
            .from('club_roster')
            .select(
              'club_id, rider_id, display_name, assigned_role, age_years, overall, country_code, availability_status, fatigue'
            )
            .in('club_id', familyClubIds)
            .eq('rider_id', selectedRider.id)
            .maybeSingle(),
          loadRegularTrainingConfig(familyClubIds),
        ])

        if (rosterRes.error) throw rosterRes.error
        if (!mounted) return

        setFamilyClubs(nextFamilyClubs)

        if (rosterRes.data) {
          const row = rosterRes.data as FocusedTrainingRider
          const source = familyClubMap.get(row.club_id)

          setFocusedTrainingRider({
            ...row,
            source_club_name: source?.club_name ?? 'Unknown Team',
            team_label: (source?.team_label ?? 'First Team') as 'First Team' | 'U23',
          })
        } else {
          setFocusedTrainingRider(null)
        }
      } catch (e: any) {
        if (!mounted) return
        setTrainingError(e?.message ?? 'Failed to load rider training config.')
      } finally {
        if (!mounted) return
        setTrainingLoading(false)
      }
    }

    void loadTrainingConfig()

    return () => {
      mounted = false
    }
  }, [selectedRider?.id])

  useEffect(() => {
    let mounted = true

    async function loadRecentTrainingSessions() {
      if (!focusedTrainingRider?.rider_id) {
        setRecentTrainingSessions([])
        setTrainingSessionsLoading(false)
        return
      }

      setTrainingSessionsLoading(true)

      try {
        const { data, error } = await supabase.rpc('get_rider_recent_training_sessions', {
          p_rider_id: focusedTrainingRider.rider_id,
          p_limit: 5,
        })

        if (error) throw error
        if (!mounted) return

        const rows = Array.isArray(data) ? data : []

        const normalized: RiderTrainingSessionPoint[] = rows
          .map((row: any, index: number) => ({
            label: row.activity_date
              ? new Date(row.activity_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                })
              : `Day ${index + 1}`,
            value: Number(row.chart_value ?? 0),
            focus: String(row.focus_code ?? 'general'),
            intensity: String(row.intensity ?? 'normal'),
            source: String(row.source ?? 'regular_training'),
            date: row.activity_date ?? null,
            participated: Boolean(row.session_participated ?? true),
          }))
          .reverse()

        setRecentTrainingSessions(normalized)
      } catch {
        if (!mounted) return
        setRecentTrainingSessions([])
      } finally {
        if (!mounted) return
        setTrainingSessionsLoading(false)
      }
    }

    void loadRecentTrainingSessions()

    return () => {
      mounted = false
    }
  }, [focusedTrainingRider?.rider_id])

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

  async function applyImageChange() {
    if (!selectedRider) return

    setImageSaving(true)
    setImageSaveMessage(null)

    try {
      const nextImageUrl = getRiderImageUrl(imageUrlInput.trim())

      const { error } = await supabase
        .from('riders')
        .update({ image_url: nextImageUrl })
        .eq('id', selectedRider.id)

      if (error) throw error

      setSelectedRider({
        ...selectedRider,
        image_url: nextImageUrl,
      })
      setImageUrlInput(nextImageUrl)
      setImageSaveMessage('Image updated successfully.')
    } catch (e: any) {
      setImageSaveMessage(e?.message ?? 'Failed to update rider image.')
    } finally {
      setImageSaving(false)
    }
  }

  async function handleNewContract() {
    if (!selectedRider) return

    setRenewalBusy(true)
    setContractActionMessage(null)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const { data: openData, error: openError } = await supabase.rpc(
        'open_contract_renewal_negotiation',
        { p_rider_id: selectedRider.id }
      )

      if (openError) throw openError

      const negotiation = Array.isArray(openData) ? openData[0] : openData
      if (!negotiation) {
        throw new Error('Could not open renewal negotiation.')
      }

      const normalized: RenewalNegotiationData = {
        ...negotiation,
        current_contract_expires_at:
          negotiation.current_contract_expires_at ?? selectedRider.contract_expires_at ?? null,
        attempt_count: negotiation.attempt_count ?? 0,
        max_attempts: negotiation.max_attempts ?? 5,
        cooldown_until: negotiation.cooldown_until ?? null,
      }

      setRenewalData(normalized)
      setOfferSalaryInput(String(normalized.expected_salary_weekly))
      setOfferExtensionInput(normalized.requested_extension_seasons === 2 ? '2' : '1')
      setRenewalModalOpen(true)
    } catch (e: any) {
      const rawMessage = e?.message ?? 'Failed to open renewal negotiation.'
      const friendlyMessage = rawMessage.includes('No main club found for current user')
        ? 'Contract renewal backend could not detect your main club for the current auth session. The SQL function open_contract_renewal_negotiation() depends on get_current_main_club_id().'
        : getRenewalErrorMessage(rawMessage)

      setContractActionMessage(friendlyMessage)
    } finally {
      setRenewalBusy(false)
    }
  }

  async function handleSubmitRenewalOffer() {
    if (!renewalData || !selectedRider) return

    setRenewalBusy(true)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const offerSalary = Math.round(Number(offerSalaryInput))
      const offerExtension: 1 | 2 = offerExtensionInput === '2' ? 2 : 1

      if (!Number.isFinite(offerSalary) || offerSalary <= 0) {
        throw new Error('Please enter a valid weekly salary offer.')
      }

      const { data: submitData, error: submitError } = await supabase.rpc(
        'submit_contract_renewal_offer',
        {
          p_negotiation_id: renewalData.negotiation_id,
          p_offer_salary_weekly: offerSalary,
          p_offer_extension_seasons: offerExtension,
        }
      )

      if (submitError) throw submitError

      const result = Array.isArray(submitData) ? submitData[0] : submitData
      if (!result) {
        throw new Error('No renewal result returned.')
      }

      if (result.accepted) {
        setRenewalResultType('success')
        setRenewalResultMessage(
          result.message ??
            `Contract extended for ${offerExtension} ${
              offerExtension === 1 ? 'season' : 'seasons'
            } starting from ${renewalCurrentStartLabel}.`
        )

        setSelectedRider((prev) =>
          prev
            ? {
                ...prev,
                salary: result.new_salary_weekly,
                contract_expires_season: result.new_contract_end_season,
                contract_expires_at: result.new_contract_expires_at ?? prev.contract_expires_at,
                morale: result.new_morale ?? prev.morale,
              }
            : prev
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                current_contract_expires_at:
                  result.new_contract_expires_at ?? prev.current_contract_expires_at,
                current_contract_end_season:
                  result.new_contract_end_season ?? prev.current_contract_end_season,
              }
            : prev
        )
      } else {
        setRenewalResultType('error')
        setRenewalResultMessage(
          getRenewalErrorMessage(result.message ?? 'The rider rejected the offer.')
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                cooldown_until: result.cooldown_until ?? prev.cooldown_until ?? null,
              }
            : prev
        )

        if (typeof result.new_morale === 'number') {
          setSelectedRider((prev) =>
            prev
              ? {
                  ...prev,
                  morale: result.new_morale,
                }
              : prev
          )
        }
      }
    } catch (e: any) {
      console.error('submit_contract_renewal_offer failed:', e)

      const rawMessage = e?.message ?? 'Failed to submit renewal offer.'
      const rawDetails = [e?.message, e?.details, e?.hint].filter(Boolean).join(' | ')

      setRenewalResultType('error')

      if (e?.code === '23514' || rawDetails.includes('rider_contracts_duration_chk')) {
        setRenewalResultMessage(
          'Renewal failed because the backend contract duration limit is too low for this extension.'
        )
      } else {
        setRenewalResultMessage(rawMessage)
      }
    } finally {
      setRenewalBusy(false)
    }
  }

  async function handleCancelTransferListing() {
    if (!activeTransferListing?.id || !selectedRider?.id) return

    setTransferListingBusy(true)
    setContractActionMessage(null)

    try {
      const { error } = await supabase.rpc('cancel_rider_transfer_listing', {
        p_listing_id: activeTransferListing.id,
      })

      if (error) throw error

      await loadActiveTransferListing(selectedRider.id)

      const refreshedRider = await fetchRiderDetailsById(selectedRider.id)
      setSelectedRider(refreshedRider)

      if (releaseModalOpen) {
        await loadReleasePreview(selectedRider.id)
      }

      setContractActionMessage('Rider removed from transfer list.')
    } catch (e: any) {
      setContractActionMessage(e?.message ?? 'Could not cancel transfer listing.')
    } finally {
      setTransferListingBusy(false)
    }
  }

  async function handleReleaseRider() {
    if (!selectedRider?.id) return

    setReleaseBusy(true)
    setContractActionMessage(null)

    try {
      const { data, error } = await supabase.rpc('release_owned_rider', {
        p_rider_id: selectedRider.id,
      })

      if (error) throw error

      const result = (Array.isArray(data) ? data[0] : data) as ReleaseOwnedRiderResult | null

      if (!result) {
        throw new Error('No release result returned.')
      }

      setPageToast({
        type: 'success',
        message: `${selectedRider.display_name} was released to free agents. ${formatMoney(
          result.release_cost
        )} was deducted from club balance.`,
      })

      setReleaseModalOpen(false)

      await onRosterChanged?.()

      window.setTimeout(() => {
        onBack()
      }, 1200)
    } catch (e: any) {
      const message = e?.message ?? 'Could not release rider.'
      setContractActionMessage(message)
      setPageToast({
        type: 'error',
        message,
      })
    } finally {
      setReleaseBusy(false)
    }
  }

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    gameDate ?? null,
    selectedRider?.contract_expires_season
  )

  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, gameDate ?? null)
  const movementWindowInfo = getMovementWindowInfo(gameDate)

  const isU23Ineligible =
    currentTeamType === 'developing' && profileAge !== null && profileAge >= 24

  const u23WarningMessage = isU23Ineligible
    ? movementWindowInfo.isOpen
      ? 'This rider has turned 24 and is no longer eligible for the Developing Team. He must be moved to the First Squad or released before the current movement window closes.'
      : 'This rider has turned 24 and is no longer eligible for the Developing Team. He may remain there until the next movement window, but before that window closes he must be moved to the First Squad or released.'
    : null

  const renewalCurrentContractExpiresAt =
    renewalData?.current_contract_expires_at ?? selectedRider?.contract_expires_at

  const renewalCurrentContractEndSeason =
    renewalData?.current_contract_end_season ?? selectedRider?.contract_expires_season

  const renewalCurrentStartLabel = getRenewalStartLabel(renewalCurrentContractExpiresAt)
  const renewalDaysRemaining = getDaysRemaining(renewalCurrentContractExpiresAt, gameDate ?? null)

  const renewalLocked =
    !!renewalData &&
    (renewalData.attempt_count >= renewalData.max_attempts ||
      isFutureDateTime(renewalData.cooldown_until))

  const askingPriceDisplay =
    selectedRider?.asking_price === null || selectedRider?.asking_price === undefined
      ? '—'
      : formatCompactMoneyValue(selectedRider.asking_price)

  const potentialUi = getPotentialUi(selectedRider?.potential)
  const moraleUi = getMoraleUi(selectedRider?.morale)
  const fatigueUi = getFatigueUi(selectedRider?.fatigue)
  const healthUi = getRiderStatusUi(selectedRider?.availability_status)

  const healthCaseName = formatHealthCaseCode(currentHealthCase?.case_code)
  const healthSeverityLabel = formatSeverityLabel(currentHealthCase?.severity)
  const healthStageLabel = formatCaseStageLabel(currentHealthCase?.case_status)
  const healthExpectedRecoveryLabel = formatShortGameDate(
    currentHealthCase?.expected_full_recovery_on
  )
  const healthExpectedRecoveryDays = getDaysRemaining(
    currentHealthCase?.expected_full_recovery_on,
    gameDate ?? null
  )

  const transferDaysRemaining = activeTransferListing?.expires_on_game_date
    ? getDaysRemaining(activeTransferListing.expires_on_game_date, gameDate ?? null)
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

  const isTransferListed = !!activeTransferListing

  const tabButtonClass = (tab: RiderProfileTab) =>
    `border-b-2 px-4 py-3 text-sm font-medium transition ${
      activeTab === tab
        ? 'border-yellow-500 text-slate-900'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`

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

  const focusedTrainingDraft = focusedTrainingRider ? buildPlanRowForRider(focusedTrainingRider) : null
  const focusedTrainingEffective = focusedTrainingRider
    ? getEffectiveRegularTraining(focusedTrainingRider)
    : null
  const teamDefaultForFocusedRider =
    focusedTrainingRider ? regularDefaultsByClubId.get(focusedTrainingRider.club_id) ?? null : null
  const focusedHasOverride =
    focusedTrainingRider != null && regularPlansByRiderId.has(focusedTrainingRider.rider_id)

  const displayHistoryRows = useMemo(() => {
    const currentSeasonRow =
      currentSeasonNumber == null
        ? null
        : {
            season: currentSeasonNumber,
            season_label: `Season ${currentSeasonNumber}`,
            team_name:
              focusedTrainingRider?.source_club_name ??
              historyRows.find((row) => row.is_current_season)?.team_name ??
              'Current Team',
            points: seasonOverview.points,
            is_current_season: true,
          }

    const filteredRows = historyRows.filter((row) => {
      if (currentSeasonRow == null) return true
      if (row.is_current_season) return false
      if (row.season != null && row.season === currentSeasonRow.season) {
        return row.team_name !== currentSeasonRow.team_name
      }
      return true
    })

    return currentSeasonRow ? [currentSeasonRow, ...filteredRows] : historyRows
  }, [currentSeasonNumber, focusedTrainingRider, historyRows, seasonOverview.points])

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back
        </button>
      </div>

      {pageToast ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            pageToast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : pageToast.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {pageToast.message}
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-yellow-500 bg-yellow-400 p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-950">
              {selectedRider
                ? `${selectedRider.first_name} ${selectedRider.last_name}`
                : 'Rider Profile'}
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

                {isTransferListed ? (
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

      {isTransferListed ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-semibold">This rider is currently on the transfer list.</div>
          <div className="mt-1">
            Asking price {formatCompactMoneyValue(activeTransferListing?.asking_price)} · {transferTimeLabel}
            {activeTransferOfferCount > 0
              ? ` · ${activeTransferOfferCount} open offer${activeTransferOfferCount === 1 ? '' : 's'}`
              : ''}
          </div>
          <div className="mt-1">Release is blocked until the transfer listing is cancelled.</div>
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
            onClick={() => setActiveTab('training')}
            className={tabButtonClass('training')}
          >
            Training
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

      {profileLoading ? (
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
                      alt={selectedRider.display_name ?? 'Rider'}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Image URL
                    </label>

                    <input
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Paste rider image URL"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-yellow-400 focus:bg-white"
                    />

                    <button
                      type="button"
                      onClick={applyImageChange}
                      disabled={imageSaving}
                      className="mt-3 w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {imageSaving ? 'Saving image...' : 'Save Image URL'}
                    </button>

                    {imageSaveMessage ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {imageSaveMessage}
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                <SectionCard title="Form & Status" subtitle="Quick current condition view">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm text-slate-500">Availability</div>
                      <div className="text-sm font-semibold" style={{ color: healthUi.color }}>
                        {healthUi.label}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm text-slate-500">Fatigue</div>
                      <div className="text-sm font-semibold" style={{ color: fatigueUi.color }}>
                        {fatigueUi.label}
                        {selectedRider.fatigue != null ? ` (${selectedRider.fatigue}/100)` : ''}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm text-slate-500">Potential</div>
                      <div className="text-sm font-semibold" style={{ color: potentialUi.color }}>
                        {potentialUi.label}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm text-slate-500">Morale</div>
                      <div className="text-sm font-semibold" style={{ color: moraleUi.color }}>
                        {moraleUi.label}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {currentHealthCase?.health_case_id
                      ? currentHealthCase.case_status === 'recovering'
                        ? 'Rider has left the unavailable phase and is now recovering toward full fitness.'
                        : currentHealthCase.case_status === 'active'
                          ? 'Rider is in the active medical phase and remains unavailable until the current case clears.'
                          : getHealthPanelNote(selectedRider)
                      : getHealthPanelNote(selectedRider)}
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
                      <DetailRow label="Weekly Wage" value={formatWeeklySalary(selectedRider.salary)} />
                      <DetailRow label="Market Value" value={formatCompactMoneyValue(selectedRider.market_value)} />
                      <DetailRow label="Asking Price" value={askingPriceDisplay} />
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
                    {healthCaseName ? <DetailRow label="Case" value={healthCaseName} /> : null}
                    {healthSeverityLabel ? <DetailRow label="Severity" value={healthSeverityLabel} /> : null}
                    {healthStageLabel ? <DetailRow label="Stage" value={healthStageLabel} /> : null}
                    {selectedRider.unavailable_reason ? (
                      <DetailRow
                        label="Reason"
                        value={formatUnavailableReason(selectedRider.unavailable_reason)}
                      />
                    ) : null}
                    {currentHealthCase?.expected_full_recovery_on ? (
                      <DetailRow
                        label="Expected recovery"
                        value={
                          <>
                            {healthExpectedRecoveryLabel}
                            {healthExpectedRecoveryDays !== null
                              ? ` (${healthExpectedRecoveryDays} day${
                                  healthExpectedRecoveryDays === 1 ? '' : 's'
                                } remaining)`
                              : ''}
                          </>
                        }
                      />
                    ) : null}
                  </div>

                  {currentHealthCase?.health_case_id ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Selection:{' '}
                        <span className="font-semibold">
                          {formatBlockFlag(currentHealthCase.selection_blocked)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Training:{' '}
                        <span className="font-semibold">
                          {formatBlockFlag(currentHealthCase.training_blocked)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Development:{' '}
                        <span className="font-semibold">
                          {formatBlockFlag(currentHealthCase.development_blocked)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </SectionCard>

                <SectionCard title="Skill Attributes">
                  <div className="space-y-3">
                    {skillRows.map((stat) => {
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
                <SectionCard title="Contract Details" subtitle="All current contract and value information">
                  <div className="divide-y divide-slate-100">
                    <DetailRow label="Weekly Wage" value={formatWeeklySalary(selectedRider.salary)} />
                    <DetailRow label="Season Wage" value={formatMoney(getSeasonWage(selectedRider.salary))} />
                    <DetailRow
                      label="Contract End"
                      value={contractExpiryUi.label}
                      valueClassName={contractExpiryUi.valueClassName}
                    />
                    {contractExpiryUi.sublabel ? (
                      <DetailRow label="Contract Note" value={contractExpiryUi.sublabel} />
                    ) : null}
                    <DetailRow label="Market Value" value={formatCompactMoneyValue(selectedRider.market_value)} />
                    <DetailRow label="Asking Price" value={askingPriceDisplay} />
                    <DetailRow
                      label="Pricing Mode"
                      value={selectedRider.asking_price_manual ? 'Manual' : 'Suggested'}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    <SimpleInfoRow
                      label="Transfer Market"
                      value={
                        activeTransferListing ? (
                          <span className="font-semibold text-amber-700">Listed</span>
                        ) : (
                          'Not listed'
                        )
                      }
                      note={
                        activeTransferListing
                          ? `${formatCompactMoneyValue(activeTransferListing.asking_price)} · ${transferTimeLabel}`
                          : 'No active transfer listing'
                      }
                    />

                    {activeTransferListing ? (
                      <SimpleInfoRow
                        label="Open Offers"
                        value={`${activeTransferOfferCount}`}
                        note={
                          activeTransferOfferCount === 1
                            ? '1 open offer on this listing'
                            : `${activeTransferOfferCount} open offers on this listing`
                        }
                      />
                    ) : null}
                  </div>

                  {activeTransferListing ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="font-semibold">Rider is currently on the transfer list</div>
                      <div className="mt-1">
                        Asking price {formatCompactMoneyValue(activeTransferListing.asking_price)} ·{' '}
                        {transferTimeLabel} · {activeTransferOfferCount} open offer
                        {activeTransferOfferCount === 1 ? '' : 's'}.
                      </div>
                    </div>
                  ) : null}

                  {u23WarningMessage ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="font-semibold">U23 eligibility warning</div>
                      <div className="mt-1">{u23WarningMessage}</div>
                    </div>
                  ) : null}

                  {contractActionMessage ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {contractActionMessage}
                    </div>
                  ) : null}
                </SectionCard>

                <SectionCard title="Contract Actions" subtitle="Extend, list or terminate this rider">
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleNewContract}
                      disabled={renewalBusy}
                      className="w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {renewalBusy ? 'Processing...' : 'Extend Contract'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (activeTransferListing) {
                          void handleCancelTransferListing()
                        } else {
                          setTransferListOpen(true)
                        }
                      }}
                      disabled={transferListingBusy || releaseBusy}
                      className={`w-full rounded-xl border px-4 py-3 text-sm font-medium transition ${
                        activeTransferListing
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {transferListingBusy
                        ? 'Working...'
                        : activeTransferListing
                          ? 'Cancel Transfer Listing'
                          : 'Place on Transfer List'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenReleaseModal()
                      }}
                      disabled={releaseBusy || transferListingBusy}
                      className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isTransferListed
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-rose-700 bg-rose-600 text-white hover:bg-rose-700'
                      }`}
                    >
                      {releaseBusy
                        ? 'Releasing...'
                        : isTransferListed
                          ? 'Cancel Transfer Listing First'
                          : 'Release Rider'}
                    </button>
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === 'training' && (
            <div className="space-y-4">
              <SectionCard
                title="Training"
                subtitle="Rider-specific regular training controls using the same backend as the main training page"
              >
                {trainingLoading ? (
                  <div className="text-sm text-slate-600">Loading training config…</div>
                ) : trainingError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {trainingError}
                  </div>
                ) : !focusedTrainingRider || !focusedTrainingDraft || !focusedTrainingEffective ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    This rider is not available inside your club training scope.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trainingMessage ? (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        {trainingMessage}
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-900">
                          {selectedRider
                            ? `${selectedRider.first_name} ${selectedRider.last_name}`
                            : focusedTrainingRider.display_name}
                        </div>

                        {focusedTrainingRider.team_label === 'U23' ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            U23
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                            First Team
                          </span>
                        )}

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          OVR {focusedTrainingRider.overall ?? '-'}
                        </span>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          Fatigue {focusedTrainingRider.fatigue ?? 0}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-slate-700">
                        Effective today:{' '}
                        <span className="font-semibold">
                          {focusedTrainingEffective.focus_code
                            ? `${formatTrainingFocusLabel(focusedTrainingEffective.focus_code)} · ${
                                focusedTrainingEffective.intensity
                                  ? formatTrainingIntensityLabel(focusedTrainingEffective.intensity)
                                  : '-'
                              }`
                            : 'No plan'}
                        </span>
                        {' · '}
                        {focusedTrainingEffective.auto_when_free ? 'Auto when free' : 'Manual only'}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Source: {focusedTrainingEffective.source}
                      </div>

                      {teamDefaultForFocusedRider ? (
                        <div className="mt-3 text-sm text-slate-600">
                          Team default:{' '}
                          <span className="font-medium text-slate-800">
                            {formatTrainingFocusLabel(teamDefaultForFocusedRider.focus_code)}
                          </span>
                          {' · '}
                          <span className="font-medium text-slate-800">
                            {formatTrainingIntensityLabel(teamDefaultForFocusedRider.intensity)}
                          </span>
                          {' · '}
                          {teamDefaultForFocusedRider.auto_when_free ? 'Auto when free' : 'Manual only'}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">
                            Focus
                          </span>
                          <select
                            value={focusedTrainingDraft.focus_code}
                            onChange={(event) =>
                              updateRegularPlanDraft(focusedTrainingRider, {
                                focus_code: event.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                          >
                            {REGULAR_TRAINING_FOCUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {formatTrainingFocusLabel(option)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">
                            Intensity
                          </span>
                          <select
                            value={focusedTrainingDraft.intensity}
                            onChange={(event) =>
                              updateRegularPlanDraft(focusedTrainingRider, {
                                intensity: event.target.value as 'light' | 'normal' | 'hard',
                              })
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                          >
                            {REGULAR_TRAINING_INTENSITY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {formatTrainingIntensityLabel(option)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={focusedTrainingDraft.is_active}
                            onChange={(event) =>
                              updateRegularPlanDraft(focusedTrainingRider, {
                                is_active: event.target.checked,
                              })
                            }
                          />
                          Override active
                        </label>

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={focusedTrainingDraft.auto_when_free}
                            onChange={(event) =>
                              updateRegularPlanDraft(focusedTrainingRider, {
                                auto_when_free: event.target.checked,
                              })
                            }
                          />
                          Auto when free
                        </label>

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => void saveRegularTrainingPlan(focusedTrainingRider)}
                            disabled={regularSavingRiderId === focusedTrainingRider.rider_id}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                          >
                            {regularSavingRiderId === focusedTrainingRider.rider_id
                              ? 'Saving…'
                              : focusedHasOverride
                                ? 'Save Override'
                                : 'Create Override'}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-5 shadow">
                        <div className="text-lg font-semibold text-slate-900">
                          Training process in last 5 training days
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          Real rider activity from backend
                        </div>

                        {trainingSessionsLoading ? (
                          <div className="mt-6 text-sm text-slate-500">Loading training sessions…</div>
                        ) : recentTrainingSessions.length === 0 ? (
                          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            No recorded training sessions yet.
                          </div>
                        ) : (
                          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <TrainingTrendChart sessions={recentTrainingSessions} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">How training sync works</div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-600">
                        This panel saves the rider override into the same database tables used by
                        your main Training page. Changes made here will appear there too.
                      </div>

                      <div className="mt-4 text-sm leading-relaxed text-slate-600">
                        The chart reads the last 5 backend training entries returned by
                        <code className="mx-1 rounded bg-slate-200 px-1 py-0.5 text-xs">
                          get_rider_recent_training_sessions
                        </code>
                        . Left-side axis labels show the backend training value scale. Focus labels
                        above each point were removed to keep the chart cleaner.
                      </div>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="space-y-4">
              {!compareClubId ? (
                <SectionCard
                  title="Compare"
                  subtitle="Compare this rider without leaving the rider profile page"
                >
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Loading compare panel…
                  </div>
                </SectionCard>
              ) : (
                <RiderComparePanel leftRiderId={riderId} clubId={compareClubId} />
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <SectionCard title="History" subtitle="Current season plus previous teams and points per season">
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
                          <td className="py-3 text-right font-semibold text-slate-900">{row.points}</td>
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

      {transferListOpen && selectedRider && (
        <TransferListModal
          open={transferListOpen}
          onClose={() => setTransferListOpen(false)}
          rider={selectedRider}
          onUpdated={(updatedRider) => {
            setSelectedRider(updatedRider)
          }}
          onTransferListingChanged={async () => {
            if (selectedRider?.id) {
              await loadActiveTransferListing(selectedRider.id)
            }
          }}
        />
      )}

      <ReleaseRiderModal
        open={releaseModalOpen}
        rider={selectedRider}
        preview={releasePreview}
        loading={releasePreviewLoading}
        busy={releaseBusy}
        onClose={() => setReleaseModalOpen(false)}
        onConfirm={() => {
          void handleReleaseRider()
        }}
        onCancelTransferListing={() => {
          void handleCancelTransferListing()
        }}
      />

      {renewalModalOpen && renewalData && selectedRider && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRenewalModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <div className="text-2xl font-semibold text-gray-900">Contract Renewal</div>
                <div className="mt-1 text-sm text-gray-500">
                  Review and submit a renewal offer for {selectedRider.display_name}.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                <DetailRow label="Current Salary" value={formatSalary(renewalData.current_salary_weekly)} />
                <DetailRow label="Expected Salary" value={formatSalary(renewalData.expected_salary_weekly)} />
                <DetailRow label="Likely Minimum" value={formatSalary(renewalData.min_acceptable_salary_weekly)} />
                <DetailRow
                  label="Current Contract Ends"
                  value={`Season ${renewalCurrentContractEndSeason ?? '—'} - ${formatShortGameDate(
                    renewalCurrentContractExpiresAt
                  )}`}
                  valueClassName={
                    renewalDaysRemaining !== null && renewalDaysRemaining < 90
                      ? 'text-red-600'
                      : ''
                  }
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Your Weekly Salary Offer
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={offerSalaryInput}
                      onChange={(e) => setOfferSalaryInput(e.target.value)}
                      disabled={renewalBusy || renewalLocked}
                      className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Enter weekly salary offer"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-nowrap items-center gap-2">
                    <label className="text-sm font-semibold text-gray-800">
                      Extension Length
                    </label>

                    <span className="whitespace-nowrap text-xs text-gray-500 sm:text-sm">
                      Starts from {renewalCurrentStartLabel}.
                    </span>
                  </div>

                  <select
                    value={offerExtensionInput}
                    onChange={(e) => setOfferExtensionInput(e.target.value === '2' ? '2' : '1')}
                    disabled={renewalBusy || renewalLocked}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="1">1 season</option>
                    <option value="2">2 seasons</option>
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <RenewalFeedbackBox type={renewalResultType} message={renewalResultMessage} />
              </div>

              {renewalData.cooldown_until && isFutureDateTime(renewalData.cooldown_until) && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Negotiations are blocked until{' '}
                  {new Date(renewalData.cooldown_until).toLocaleString()}.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitRenewalOffer}
                disabled={renewalBusy || renewalLocked}
                className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renewalBusy ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}