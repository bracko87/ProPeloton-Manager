import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import RiderTransferListPage from './transfers/RiderTransferListPage'
import RiderFreeAgentsPage from './transfers/RiderFreeAgentsPage'
import StaffFreeAgentPage from './transfers/StaffFreeAgentPage'

type TransferTab = 'riders' | 'staff'
type RiderMarketSubTab = 'transfer_list' | 'free_agents'
type ActivityFilterMode = 'incoming' | 'outgoing'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type StaffSortField = 'salary' | 'skills' | 'name' | 'country'
type SortDirection = 'asc' | 'desc'

type RiderRoleFilter = 'all' | string
type RiderMarketSort =
  | 'active'
  | 'expires'
  | 'scouted'
  | 'overall_desc'
  | 'overall_asc'
  | 'price_desc'
  | 'price_asc'
  | 'name_asc'
  | 'name_desc'
  | 'age_asc'
  | 'age_desc'

type ToastTone = 'success' | 'error' | 'info'

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type ClubRow = {
  id: string
  name: string | null
  club_type: string | null
  parent_club_id: string | null
  deleted_at: string | null
}

type ClubOwnedRiderRow = {
  rider_id: string
}

type ClubInfrastructureRow = {
  club_id?: string | null
  scouting_level: number | null
}

type StaffCandidateRow = {
  id: string
  role_type: StaffRole
  specialization: string | null
  first_name?: string | null
  last_name?: string | null
  staff_name: string
  country_code: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  is_available: boolean
  listed_at_game_ts?: string | null
  expires_at_game_ts?: string | null
  notes?: Record<string, unknown> | null
  market_region?: string | null
}

type ClubStaffRow = {
  id: string
  role_type: StaffRole
  staff_name: string
  salary_weekly: number
  contract_expires_at: string | null
  is_active: boolean
}

type StaffRoleLimitRow = {
  role_type: StaffRole
  limit_count: number
  active_count: number
  open_slots: number
  can_hire: boolean
}

type MarketListingRow = {
  id?: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  seller_club_name: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name: string
  country_code: string | null
  role: string | null
  age_years: number | null
  overall: number | null
  potential: number | null
  market_value: number | null
  asking_price: number
  salary: number | null
  contract_expires_at: string | null
  availability_status: string | null
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  auto_price_clamped: boolean
  time_left_label?: string | null
  status?: string | null
}

type TransferOfferRow = {
  id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
  seller_club_name?: string | null
  buyer_club_name?: string | null
  offered_price: number
  offered_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
  auto_block_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  status_changed_at_game_ts?: string | null

  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null
}

type TransferNegotiationRow = {
  id: string
  offer_id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
  buyer_club_name?: string | null
  status: string
  current_salary_weekly: number | null
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  preferred_duration_seasons: number
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  attempt_count: number
  max_attempts: number
  locked_until: string | null
  opened_on_game_date: string
  expires_on_game_date: string
  closed_reason: string | null
  notes_json: Record<string, unknown> | null
  created_at: string
  updated_at: string

  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null
}

type TransferHistoryRow = {
  id: string
  direction: 'arrival' | 'departure'
  movement_type: 'transfer' | 'free_agent' | 'release' | string
  rider_id: string | null
  rider_name: string | null
  from_club_id: string | null
  from_club_name: string | null
  to_club_id: string | null
  to_club_name: string | null
  amount: number | null
  game_date: string | null
  completed_at?: string | null
}

type LatestScoutReportRow = {
  rider_id: string
  club_id: string | null
  precision_tier: string | null
  precision_score: number | null
  report_json: Record<string, any> | null
  created_at_game_ts: string | null
  created_at?: string | null
}

type FreeAgentMarketRow = {
  id?: string
  free_agent_id: string
  rider_id: string
  status: string
  expected_salary_weekly: number | null
  expires_on_game_date: string | null
  full_name: string | null
  display_name: string | null
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  age_years: number | null
  latest_scout_report?: LatestScoutReportRow | null
  is_scouted?: boolean
}

type FreeAgentNegotiationRiderInfo = {
  id: string
  first_name?: string | null
  last_name?: string | null
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  birth_date?: string | null
}

type FreeAgentNegotiationRow = {
  id: string
  free_agent_id: string
  rider_id: string
  club_id: string
  status: string
  current_salary_weekly: number | null
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  preferred_duration_seasons: number
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  attempt_count: number
  max_attempts: number
  locked_until: string | null
  opened_on_game_date: string
  expires_on_game_date: string | null
  closed_reason: string | null
  created_at: string
  updated_at: string

  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null

  rider: FreeAgentNegotiationRiderInfo | null
}

type TransferMarketItem = {
  kind: 'transfer'
  key: string
  rider_id: string
  listing_id: string
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  age_years: number | null
  seller_label: string
  amount_value: number | null
  amount_label: string
  expires_on_game_date: string | null
  is_user_active: boolean
  is_own_item: boolean
  overall_label: string | null
  potential_label: string | null
  is_scouted: boolean
  raw: MarketListingRow
}

type FreeAgentMarketItem = {
  kind: 'free_agent'
  key: string
  rider_id: string
  free_agent_id: string
  full_name: string | null
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  age_years: number | null
  seller_label: string
  amount_value: number | null
  amount_label: string
  expires_on_game_date: string | null
  is_user_active: boolean
  is_own_item: boolean
  overall_label: string | null
  potential_label: string | null
  is_scouted: boolean
  raw: FreeAgentMarketRow
}

type UnifiedMarketRow = TransferMarketItem | FreeAgentMarketItem

const CANDIDATES_PER_PAGE = 10
const RIDERS_PER_PAGE = 30
const TRANSFERS_ROUTE = '/dashboard/transfers'
const TRANSFERS_RIDER_SUBTAB_STORAGE_KEY = 'transfers:riderMarketSubTab'
const ACTIVE_OUTGOING_OFFER_STATUSES = new Set(['open', 'club_accepted', 'accepted'])
const TERMINAL_ACTIVITY_STATUSES = new Set([
  'accepted',
  'completed',
  'expired',
  'rejected',
  'declined',
  'cancelled',
  'rider_declined',
  'auto_blocked',
  'withdrawn',
])
const HIDE_TERMINAL_AFTER_GAME_DAYS = 1

function isValidRiderMarketSubTab(value: unknown): value is RiderMarketSubTab {
  return value === 'transfer_list' || value === 'free_agents'
}

function readInitialRiderMarketSubTab(): RiderMarketSubTab {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const queryValue = params.get('riderSubTab')

    if (isValidRiderMarketSubTab(queryValue)) {
      return queryValue
    }

    try {
      const storedValue = window.sessionStorage.getItem(
        TRANSFERS_RIDER_SUBTAB_STORAGE_KEY
      )

      if (isValidRiderMarketSubTab(storedValue)) {
        return storedValue
      }
    } catch {
      // ignore storage read issues
    }
  }

  return 'transfer_list'
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
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

function normalizeOfferStatus(status: unknown) {
  return String(status || '').trim().toLowerCase()
}

function isActiveOutgoingOfferStatus(status: unknown) {
  return ACTIVE_OUTGOING_OFFER_STATUSES.has(normalizeOfferStatus(status))
}

function getErrorMessage(err: any) {
  const candidates = [
    err?.message,
    err?.details,
    err?.hint,
    err?.error_description,
    err?.description,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return 'Unexpected error.'
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return null
  return countryCode.toLowerCase()
}

function getCountryName(countryCode: string | null | undefined) {
  const safeCode = safeCountryCode(countryCode)
  if (!safeCode) return 'Unknown'

  const code = safeCode.toUpperCase()

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    }
  } catch {
    return code
  }

  return code
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {}
}

function parseGameDate(value?: string | null): number | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function isWithinLastGameDay(
  lastGameDate: string | null | undefined,
  currentGameDate: string | null | undefined
) {
  const lastTs = parseGameDate(lastGameDate)
  const currentTs = parseGameDate(currentGameDate)

  if (lastTs == null || currentTs == null) return true

  return lastTs >= currentTs - 24 * 60 * 60 * 1000
}

function getActivityPayload(item: any): Record<string, any> {
  return readRecord(item?.payload_json ?? item?.payload ?? item?.metadata)
}

function getIncomingClubInfo(item: any) {
  const payload = getActivityPayload(item)

  const clubId =
    readText(item?.seller_club_id) ??
    readText(item?.sellerClubId) ??
    readText(payload?.seller_club_id) ??
    readText(payload?.sellerClubId) ??
    null

  const clubName =
    readText(item?.seller_club_name) ??
    readText(item?.sellerClubName) ??
    readText(payload?.seller_club_name) ??
    readText(payload?.sellerClubName) ??
    null

  return {
    clubId,
    clubName: clubName ?? 'Unknown club',
  }
}

function getOutgoingClubInfo(item: any) {
  const payload = getActivityPayload(item)

  const clubId =
    readText(item?.buyer_club_id) ??
    readText(item?.buyerClubId) ??
    readText(item?.from_club_id) ??
    readText(payload?.buyer_club_id) ??
    readText(payload?.buyerClubId) ??
    readText(payload?.from_club_id) ??
    null

  const clubName =
    readText(item?.buyer_club_name) ??
    readText(item?.buyerClubName) ??
    readText(item?.from_club_name) ??
    readText(payload?.buyer_club_name) ??
    readText(payload?.buyerClubName) ??
    readText(payload?.from_club_name) ??
    null

  return {
    clubId,
    clubName: clubName ?? 'Unknown club',
  }
}

function getActivityClubInfo(item: any, activityView: 'incoming' | 'outgoing') {
  return activityView === 'incoming'
    ? getIncomingClubInfo(item)
    : getOutgoingClubInfo(item)
}

function getActivityEndGameDate(row: any): string | null {
  const status = String(row?.status || '').toLowerCase()

  return (
    row?.last_event_game_date ||
    row?.completed_on_game_date ||
    row?.closed_on_game_date ||
    row?.status_changed_on_game_date ||
    row?.terminal_on_game_date ||
    (status === 'accepted' || status === 'declined' || status === 'rider_declined'
      ? row?.opened_on_game_date
      : null) ||
    row?.event_game_date ||
    row?.updated_on_game_date ||
    row?.expires_on_game_date ||
    null
  )
}

function shouldKeepTransferActivityRow(row: any, currentGameDate: Date | null) {
  if (!currentGameDate) return true

  const status = String(row?.status || '').toLowerCase()

  if (!TERMINAL_ACTIVITY_STATUSES.has(status)) {
    return true
  }

  const currentGameDateString = currentGameDate.toISOString().slice(0, 10)
  const endGameDate = getActivityEndGameDate(row)

  return isWithinLastGameDay(endGameDate, currentGameDateString)
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

async function fetchRiderRowsByIds(riderIds: string[]) {
  const uniqueIds = Array.from(
    new Set(
      riderIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    )
  )

  if (!uniqueIds.length) return []

  const chunkSize = 150
  const batches = chunkArray(uniqueIds, chunkSize)
  const allRows: any[] = []

  for (const chunk of batches) {
    const { data, error } = await supabase
      .from('riders')
      .select(`
        id,
        first_name,
        last_name,
        display_name,
        country_code,
        role,
        overall,
        potential,
        birth_date
      `)
      .in('id', chunk)

    if (error) throw error
    allRows.push(...(data || []))
  }

  return allRows
}

async function fetchLatestScoutReportsForClub(
  clubId: string,
  riderIds: string[]
): Promise<Record<string, LatestScoutReportRow>> {
  const uniqueIds = Array.from(
    new Set(
      riderIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    )
  )

  if (!clubId || !uniqueIds.length) return {}

  const chunkSize = 150
  const batches = chunkArray(uniqueIds, chunkSize)
  const latestByRiderId: Record<string, LatestScoutReportRow> = {}

  for (const chunk of batches) {
    const { data, error } = await supabase
      .from('rider_scout_reports')
      .select(`
        rider_id,
        club_id,
        precision_tier,
        precision_score,
        report_json,
        created_at_game_ts,
        created_at
      `)
      .eq('club_id', clubId)
      .in('rider_id', chunk)
      .order('created_at_game_ts', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    for (const row of data || []) {
      const riderId = readText(row.rider_id)
      if (!riderId) continue

      if (!latestByRiderId[riderId]) {
        latestByRiderId[riderId] = {
          rider_id: riderId,
          club_id: readText(row.club_id),
          precision_tier: readText(row.precision_tier),
          precision_score:
            typeof row.precision_score === 'number' ? row.precision_score : null,
          report_json: row.report_json ? readRecord(row.report_json) : null,
          created_at_game_ts: readText(row.created_at_game_ts),
          created_at: row.created_at ?? null,
        }
      }
    }
  }

  return latestByRiderId
}

async function loadStaffMarketCandidates(clubId: string): Promise<StaffCandidateRow[]> {
  const { data, error } = await supabase.rpc('get_staff_market_candidates_for_club', {
    p_club_id: clubId,
    p_page: 1,
    p_page_size: 500,
  })

  if (error) {
    throw error
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    role_type: row.role_type,
    specialization: row.specialization,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    staff_name: row.staff_name,
    country_code: row.country_code,
    expertise: row.expertise,
    experience: row.experience,
    potential: row.potential,
    leadership: row.leadership,
    efficiency: row.efficiency,
    loyalty: row.loyalty,
    salary_weekly: row.salary_weekly,
    is_available: row.is_available,
    listed_at_game_ts: row.listed_at_game_ts ?? null,
    expires_at_game_ts: row.expires_at_game_ts ?? null,
    notes: row.notes ? readRecord(row.notes) : null,
    market_region: row.market_region ?? null,
  }))
}

async function loadStaffRoleLimits(clubId: string): Promise<StaffRoleLimitRow[]> {
  const { data, error } = await supabase.rpc('get_club_staff_role_limits', {
    p_club_id: clubId,
  })

  if (error) {
    throw error
  }

  const rows = (data ?? []).map((row: any) => {
    const roleType = String(row.role_type ?? '') as StaffRole
    const limitCount = Number(row.limit_count ?? 0)
    const activeCount = Number(row.active_count ?? 0)
    const openSlots = Number(row.open_slots ?? Math.max(0, limitCount - activeCount))
    const canHire =
      typeof row.can_hire === 'boolean' ? row.can_hire : openSlots > 0

    return {
      role_type: roleType,
      limit_count: limitCount,
      active_count: activeCount,
      open_slots: openSlots,
      can_hire: canHire,
    }
  })

  const allRoles: StaffRole[] = [
    'head_coach',
    'team_doctor',
    'mechanic',
    'sport_director',
    'scout_analyst',
  ]

  return allRoles.map((role) => {
    const existing = rows.find((row) => row.role_type === role)

    return (
      existing ?? {
        role_type: role,
        limit_count: 0,
        active_count: 0,
        open_slots: 0,
        can_hire: false,
      }
    )
  })
}

async function loadClubInfrastructure(
  clubId: string
): Promise<ClubInfrastructureRow | null> {
  const { data, error } = await supabase
    .from('club_infrastructure')
    .select('club_id, scouting_level')
    .eq('club_id', clubId)
    .maybeSingle()

  if (error) {
    console.warn('Could not load club infrastructure. Defaulting scouting level to 0.', error)
    return null
  }

  if (!data) return null

  return {
    club_id: data.club_id ?? clubId,
    scouting_level:
      typeof data.scouting_level === 'number'
        ? data.scouting_level
        : Number(data.scouting_level ?? 0),
  }
}

function getPublicOverallBucket(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const clamped = Math.max(0, Math.min(100, value))
  const start = Math.min(80, Math.floor(clamped / 20) * 20)
  const end = Math.min(100, start + 20)
  return `${start}-${end}`
}

function getScoutAttributeLabel(
  reportJson: Record<string, any> | null | undefined,
  key: 'overall' | 'potential'
): string | null {
  return readText(reportJson?.[key]?.label)
}

function getMarketScoutMeta(params: {
  riderId: string
  overall: number | null | undefined
  scoutReportMap: Record<string, LatestScoutReportRow>
}) {
  const scoutRow = params.scoutReportMap[params.riderId]

  if (scoutRow?.report_json) {
    return {
      overall_label:
        getScoutAttributeLabel(scoutRow.report_json, 'overall') ??
        getPublicOverallBucket(params.overall),
      potential_label: getScoutAttributeLabel(scoutRow.report_json, 'potential'),
      is_scouted: true,
    }
  }

  return {
    overall_label: getPublicOverallBucket(params.overall),
    potential_label: null,
    is_scouted: false,
  }
}

function roleLabel(role: StaffRole) {
  switch (role) {
    case 'head_coach':
      return 'Head Coach'
    case 'team_doctor':
      return 'Team Doctor'
    case 'mechanic':
      return 'Mechanic'
    case 'sport_director':
      return 'Sport Director'
    case 'scout_analyst':
      return 'Scout / Analyst'
    default:
      return role
  }
}

function resolveMainClub(rows: ClubRow[]) {
  if (!rows.length) return null

  const exactMain = rows.find(
    (club) =>
      club.deleted_at == null &&
      club.parent_club_id == null &&
      club.club_type !== 'developing'
  )

  if (exactMain) return exactMain

  const fallbackNonDeveloping = rows.find(
    (club) => club.deleted_at == null && club.club_type !== 'developing'
  )

  if (fallbackNonDeveloping) return fallbackNonDeveloping

  return rows.find((club) => club.deleted_at == null) || null
}

function getCandidateStats(candidate: StaffCandidateRow) {
  if (candidate.role_type === 'head_coach') {
    return [
      { label: 'Training', value: candidate.expertise },
      { label: 'Recovery Plan', value: candidate.efficiency },
      { label: 'Youth Dev', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'team_doctor') {
    return [
      { label: 'Recovery', value: candidate.expertise },
      { label: 'Prevention', value: candidate.efficiency },
      { label: 'Diagnosis', value: candidate.experience },
    ]
  }

  if (candidate.role_type === 'mechanic') {
    return [
      { label: 'Setup', value: candidate.expertise },
      { label: 'Reliability', value: candidate.efficiency },
      { label: 'Innovation', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'sport_director') {
    return [
      { label: 'Tactics', value: candidate.expertise },
      { label: 'Motivation', value: candidate.leadership },
      { label: 'Organization', value: candidate.efficiency },
    ]
  }

  return [
    { label: 'Evaluation', value: candidate.expertise },
    { label: 'Network', value: candidate.experience },
    { label: 'Accuracy', value: candidate.efficiency },
  ]
}

function getCandidateSkillScore(candidate: StaffCandidateRow) {
  const stats = getCandidateStats(candidate)
  if (!stats.length) return 0
  return stats.reduce((sum, stat) => sum + stat.value, 0) / stats.length
}

function tryParseDate(value: string | null | undefined) {
  if (!value) return null
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct

  const asMidnight = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(asMidnight.getTime())) return asMidnight

  return null
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

  if (Number.isNaN(gameDate.getTime())) return null
  return gameDate
}

function getGameDateExpiryTimestamp(expiresOnGameDate: string | null | undefined) {
  if (!expiresOnGameDate) return null

  const expiryDate = new Date(`${expiresOnGameDate}T23:59:59Z`)
  if (Number.isNaN(expiryDate.getTime())) return null

  return expiryDate.getTime()
}

function isActiveTransferOfferStatus(status: unknown) {
  const normalized = normalizeOfferStatus(status)
  return normalized === 'open' || normalized === 'club_accepted'
}

function isActiveTransferNegotiationStatus(status: unknown) {
  return normalizeOfferStatus(status) === 'open'
}

function isFreeAgentNegotiationEffectivelyExpired(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null | undefined
) {
  const currentGameDate = getCurrentGameDateFromState(gameState)
  const expiryTimestamp = getGameDateExpiryTimestamp(expiresOnGameDate)

  if (!currentGameDate || expiryTimestamp == null) return false

  return currentGameDate.getTime() > expiryTimestamp
}

function isExpiredOlderThan24GameHours(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null | undefined
) {
  const currentGameDate = getCurrentGameDateFromState(gameState)
  const expiryTimestamp = getGameDateExpiryTimestamp(expiresOnGameDate)

  if (!currentGameDate || expiryTimestamp == null) return false

  return currentGameDate.getTime() - expiryTimestamp >= 24 * 60 * 60 * 1000
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

function looksLikeUuid(value: string | null | undefined) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function buildPreferredRiderName(params: {
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  displayName?: string | null
  fallbackId?: string | null
}) {
  const combined = [params.firstName?.trim(), params.lastName?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim()

  if (combined) return combined
  if (params.fullName?.trim()) return params.fullName.trim()
  if (params.displayName?.trim() && !looksLikeUuid(params.displayName)) {
    return params.displayName.trim()
  }
  if (params.fallbackId && !looksLikeUuid(params.fallbackId)) {
    return params.fallbackId
  }
  return 'Unknown rider'
}

function normalizeFreeAgentNegotiationRow(
  row: any,
  currentGameDate: Date | null
): FreeAgentNegotiationRow {
  const riderSource = Array.isArray(row?.rider) ? row.rider[0] : row?.rider || null

  return {
    id: row.id,
    free_agent_id: row.free_agent_id,
    rider_id: row.rider_id,
    club_id: row.club_id,
    status: row.status,
    current_salary_weekly: row.current_salary_weekly ?? null,
    expected_salary_weekly: row.expected_salary_weekly,
    min_acceptable_salary_weekly: row.min_acceptable_salary_weekly,
    preferred_duration_seasons: row.preferred_duration_seasons,
    offer_salary_weekly: row.offer_salary_weekly ?? null,
    offer_duration_seasons: row.offer_duration_seasons ?? null,
    attempt_count: row.attempt_count,
    max_attempts: row.max_attempts,
    locked_until: row.locked_until || null,
    opened_on_game_date: row.opened_on_game_date,
    expires_on_game_date: row.expires_on_game_date ?? null,
    closed_reason: row.closed_reason || null,
    created_at: row.created_at,
    updated_at: row.updated_at,

    full_name: null,
    display_name: row.display_name || riderSource?.display_name || null,
    country_code: row.country_code || riderSource?.country_code || null,
    role: row.role || riderSource?.role || null,
    overall: row.overall ?? riderSource?.overall ?? null,
    potential: row.potential ?? riderSource?.potential ?? null,
    age_years:
      row.age_years ?? calculateAgeYearsFromGameDate(riderSource?.birth_date, currentGameDate),

    rider:
      riderSource ||
      (row.display_name ||
      row.country_code ||
      row.role ||
      row.overall != null ||
      row.potential != null
        ? {
            id: row.rider_id,
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            display_name: row.display_name || 'Unknown rider',
            country_code: row.country_code || null,
            role: row.role || null,
            overall: row.overall ?? null,
            potential: row.potential ?? null,
            birth_date: row.birth_date ?? null,
          }
        : null),
  }
}

function SegmentedTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        active ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}

function UnderlineSubTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-0 pb-3 text-sm font-medium transition ${
        active
          ? 'border-yellow-400 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

export default function TransfersPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState<TransferTab>('riders')
  const [riderMarketSubTab, setRiderMarketSubTab] =
    useState<RiderMarketSubTab>(readInitialRiderMarketSubTab)
  const [transferActivityMode, setTransferActivityMode] =
    useState<ActivityFilterMode>('incoming')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)
  const [clubNameMap, setClubNameMap] = useState<Record<string, string>>({})
  const [clubInfrastructure, setClubInfrastructure] =
    useState<ClubInfrastructureRow | null>(null)
  const [latestScoutReportMap, setLatestScoutReportMap] = useState<
    Record<string, LatestScoutReportRow>
  >({})

  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all')
  const [sortField, setSortField] = useState<StaffSortField>('salary')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [staffCandidates, setStaffCandidates] = useState<StaffCandidateRow[]>([])
  const [clubStaffRows, setClubStaffRows] = useState<ClubStaffRow[]>([])
  const [roleLimits, setRoleLimits] = useState<StaffRoleLimitRow[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [hireLoading, setHireLoading] = useState(false)
  const [hireContractTerm, setHireContractTerm] = useState<0 | 1>(0)
  const [toast, setToast] = useState<{
    message: string
    tone: ToastTone
  } | null>(null)

  const [riderLoading, setRiderLoading] = useState(false)
  const [clubOwnedRiders, setClubOwnedRiders] = useState<ClubOwnedRiderRow[]>([])
  const [marketListings, setMarketListings] = useState<MarketListingRow[]>([])
  const [transferOffers, setTransferOffers] = useState<TransferOfferRow[]>([])
  const [mySentOffersDashboard, setMySentOffersDashboard] = useState<TransferOfferRow[]>([])
  const [myOutgoingOffers, setMyOutgoingOffers] = useState<TransferOfferRow[]>([])
  const [transferNegotiations, setTransferNegotiations] = useState<TransferNegotiationRow[]>([])
  const [myBuyerNegotiations, setMyBuyerNegotiations] = useState<TransferNegotiationRow[]>([])
  const [transferHistory, setTransferHistory] = useState<TransferHistoryRow[]>([])
  const [freeAgents, setFreeAgents] = useState<FreeAgentMarketRow[]>([])
  const [freeAgentNegotiations, setFreeAgentNegotiations] = useState<
    FreeAgentNegotiationRow[]
  >([])
  const [gameState, setGameState] = useState<GameStateRow | null>(null)

  const [selectedMarketListingId, setSelectedMarketListingId] = useState<string | null>(null)
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<string | null>(null)

  const [offerModalListing, setOfferModalListing] = useState<MarketListingRow | null>(null)
  const [offerDraftPrice, setOfferDraftPrice] = useState('')
  const [offerModalMessage, setOfferModalMessage] = useState<string | null>(null)

  const [sellerReviewOfferId, setSellerReviewOfferId] = useState<string | null>(null)

  const [riderActionLoading, setRiderActionLoading] = useState(false)

  const [marketSearch, setMarketSearch] = useState('')
  const [marketRoleFilter, setMarketRoleFilter] = useState<RiderRoleFilter>('all')
  const [marketOnlyActive, setMarketOnlyActive] = useState(false)
  const [marketHideOwn, setMarketHideOwn] = useState(false)
  const [marketSort, setMarketSort] = useState<RiderMarketSort>('active')
  const [marketPage, setMarketPage] = useState(1)

  function showToast(message: string, tone: ToastTone = 'info') {
    setToast({ message, tone })
  }

  function openClubProfile(item: any, activityView: 'incoming' | 'outgoing') {
    const clubInfo = getActivityClubInfo(item, activityView)
    if (!clubInfo.clubId) return
    navigate(`/dashboard/clubs/${clubInfo.clubId}`)
  }

  useEffect(() => {
    if (!toast) return

    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        TRANSFERS_RIDER_SUBTAB_STORAGE_KEY,
        riderMarketSubTab
      )
    } catch {
      // ignore storage write issues
    }
  }, [riderMarketSubTab])

  function updateTransfersQuery(paramsToSet: {
    activity?: ActivityFilterMode | null
    offerId?: string | null
    makeOfferListingId?: string | null
    riderSubTab?: RiderMarketSubTab | null
  }) {
    const params = new URLSearchParams(location.search)

    if (paramsToSet.activity) {
      params.set('activity', paramsToSet.activity)
    } else if (paramsToSet.activity === null) {
      params.delete('activity')
    }

    if (paramsToSet.offerId) {
      params.set('offerId', paramsToSet.offerId)
    } else if (paramsToSet.offerId === null) {
      params.delete('offerId')
    }

    if (paramsToSet.makeOfferListingId) {
      params.set('makeOfferListingId', paramsToSet.makeOfferListingId)
    } else if (paramsToSet.makeOfferListingId === null) {
      params.delete('makeOfferListingId')
    }

    if (paramsToSet.riderSubTab) {
      params.set('riderSubTab', paramsToSet.riderSubTab)
    } else if (paramsToSet.riderSubTab === null) {
      params.delete('riderSubTab')
    }

    const search = params.toString()

    navigate(
      {
        pathname: TRANSFERS_ROUTE,
        search: search ? `?${search}` : '',
      },
      { replace: true }
    )
  }

  function openSellerOfferReview(offerId: string) {
    setActiveTab('riders')
    setRiderMarketSubTab('transfer_list')
    setTransferActivityMode('outgoing')
    setSellerReviewOfferId(offerId)
    setToast(null)
    updateTransfersQuery({
      activity: 'outgoing',
      offerId,
    })
  }

  function closeSellerOfferReview() {
    setSellerReviewOfferId(null)
    updateTransfersQuery({
      activity: 'outgoing',
      offerId: null,
    })
  }

  useEffect(() => {
    let mounted = true

    async function loadTransfersPage() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('User not found.')

        const { data: clubsData, error: clubsError } = await supabase
          .from('clubs')
          .select('id, name, club_type, parent_club_id, deleted_at')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)

        if (clubsError) throw clubsError

        const resolvedClub = resolveMainClub((clubsData || []) as ClubRow[])
        if (!resolvedClub) throw new Error('Main club not found.')

        const infrastructureRow = await loadClubInfrastructure(resolvedClub.id)

        if (!mounted) return

        setClubId(resolvedClub.id)
        setClubName(resolvedClub.name || null)
        setClubInfrastructure(infrastructureRow)

        await loadStaffData(resolvedClub.id, mounted)

        if (!mounted) return
        await loadRiderData(resolvedClub.id, mounted)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load transfers page.'
        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadTransfersPage()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const activity = params.get('activity')
    const offerId = params.get('offerId')
    const makeOfferListingId = params.get('makeOfferListingId')
    const riderSubTabParam = params.get('riderSubTab')

    if (isValidRiderMarketSubTab(riderSubTabParam)) {
      setActiveTab('riders')
      setRiderMarketSubTab(riderSubTabParam)
    }

    if (activity === 'outgoing' || activity === 'incoming') {
      setActiveTab('riders')
      setRiderMarketSubTab((prev) =>
        isValidRiderMarketSubTab(riderSubTabParam) ? riderSubTabParam : prev
      )
      setTransferActivityMode(activity)
    }

    if (offerId) {
      setActiveTab('riders')
      setRiderMarketSubTab('transfer_list')
      setTransferActivityMode('outgoing')
      setSellerReviewOfferId(offerId)
    }

    if (makeOfferListingId) {
      setActiveTab('riders')
      setRiderMarketSubTab('transfer_list')
    }
  }, [location.search])

  async function loadStaffData(clubIdValue: string, mounted = true) {
    const [candidateRows, clubStaffResult, roleLimitRows] = await Promise.all([
      loadStaffMarketCandidates(clubIdValue),
      supabase
        .from('club_staff')
        .select(`
          id,
          role_type,
          staff_name,
          salary_weekly,
          contract_expires_at,
          is_active
        `)
        .eq('club_id', clubIdValue)
        .eq('is_active', true),
      loadStaffRoleLimits(clubIdValue),
    ])

    if (clubStaffResult.error) throw clubStaffResult.error

    if (!mounted) return

    setStaffCandidates(candidateRows)
    setClubStaffRows((clubStaffResult.data || []) as ClubStaffRow[])
    setRoleLimits(roleLimitRows)
  }

  async function fetchClubNameMap(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
    if (!uniqueIds.length) return {}

    const { data, error } = await supabase.from('clubs').select('id, name').in('id', uniqueIds)

    if (error) throw error

    const result: Record<string, string> = {}
    for (const row of data || []) {
      result[row.id] = row.name || row.id
    }
    return result
  }

  function openRiderProfilePage(riderId: string, isOwnedByUser = false) {
    navigate(
      isOwnedByUser ? `/dashboard/my-riders/${riderId}` : `/dashboard/external-riders/${riderId}`
    )
  }

  async function openFreeAgentRiderProfile(item: {
    rider_id: string
    free_agent_id?: string
  }) {
    const rawRiderId = item.rider_id?.trim()
    const freeAgentId = item.free_agent_id?.trim()

    if (rawRiderId) {
      openRiderProfilePage(rawRiderId, false)
      return
    }

    if (freeAgentId) {
      const { data: freeAgentById } = await supabase
        .from('rider_free_agents')
        .select('rider_id')
        .eq('id', freeAgentId)
        .maybeSingle()

      if (freeAgentById?.rider_id) {
        openRiderProfilePage(String(freeAgentById.rider_id), false)
        return
      }
    }

    console.error('Could not open free-agent rider profile: missing ids', item)
    showToast('Could not open rider profile right now. Please refresh and try again.', 'error')
  }

  function openClubProfilePage(targetClubId: string) {
    navigate(`/dashboard/clubs/${targetClubId}`)
  }

  function openOfferModal(listing: MarketListingRow) {
    const resolvedListingId = listing.listing_id || listing.id || ''

    setSelectedMarketListingId(resolvedListingId)
    setOfferDraftPrice(formatTransferAmount(listing.asking_price))
    setOfferModalListing({
      ...listing,
      listing_id: resolvedListingId,
    })
    setOfferModalMessage(null)
    setToast(null)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const makeOfferListingId = params.get('makeOfferListingId')

    if (!makeOfferListingId) return
    if (riderLoading) return
    if (!marketListings.length) return
    if (offerModalListing) return

    const listing =
      marketListings.find(
        (row) => row.listing_id === makeOfferListingId || row.id === makeOfferListingId
      ) ?? null

    if (!listing) return

    openOfferModal(listing)

    const activityParam = params.get('activity')
    const safeActivity =
      activityParam === 'incoming' || activityParam === 'outgoing' ? activityParam : null

    updateTransfersQuery({
      activity: safeActivity,
      offerId: params.get('offerId'),
      makeOfferListingId: null,
    })
  }, [location.search, riderLoading, marketListings, offerModalListing])

  async function loadRiderData(clubIdValue: string, mounted = true) {
    setRiderLoading(true)

    try {
      const [
        marketResult,
        offersResult,
        mySentOffersDashboardResult,
        myOutgoingOffersResult,
        sellerNegotiationsResult,
        buyerNegotiationsResult,
        freeAgentsResult,
        freeAgentNegotiationsResult,
        gameStateResult,
        transferHistoryResult,
        clubOwnedRidersResult,
      ] = await Promise.all([
        supabase.rpc('get_transfer_market_listings', {
          p_page: 1,
          p_page_size: 10000,
        }),
        supabase.rpc('get_my_received_transfer_offers_dashboard'),
        supabase.rpc('get_my_sent_transfer_offers_dashboard', {}),
        supabase
          .from('rider_transfer_offers')
          .select(`
            id,
            listing_id,
            rider_id,
            seller_club_id,
            buyer_club_id,
            offered_price,
            offered_on_game_date,
            expires_on_game_date,
            status,
            auto_block_reason,
            metadata,
            created_at,
            updated_at
          `)
          .eq('buyer_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_seller_transfer_negotiations_dashboard'),
        supabase
          .from('rider_transfer_negotiations')
          .select(`
            id,
            offer_id,
            listing_id,
            rider_id,
            seller_club_id,
            buyer_club_id,
            status,
            current_salary_weekly,
            expected_salary_weekly,
            min_acceptable_salary_weekly,
            preferred_duration_seasons,
            offer_salary_weekly,
            offer_duration_seasons,
            attempt_count,
            max_attempts,
            locked_until,
            opened_on_game_date,
            expires_on_game_date,
            closed_reason,
            notes_json,
            created_at,
            updated_at
          `)
          .eq('buyer_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_free_agent_market_rows', {
          p_page: 1,
          p_page_size: 10000,
        }),
        supabase
          .from('rider_free_agent_negotiations')
          .select(`
            id,
            free_agent_id,
            rider_id,
            club_id,
            status,
            current_salary_weekly,
            expected_salary_weekly,
            min_acceptable_salary_weekly,
            preferred_duration_seasons,
            offer_salary_weekly,
            offer_duration_seasons,
            attempt_count,
            max_attempts,
            locked_until,
            opened_on_game_date,
            expires_on_game_date,
            closed_reason,
            created_at,
            updated_at,
            rider:riders!rider_free_agent_negotiations_rider_id_fkey(
              id,
              first_name,
              last_name,
              display_name,
              country_code,
              role,
              overall,
              potential,
              birth_date
            )
          `)
          .eq('club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase
          .from('game_state')
          .select('season_number, month_number, day_number, hour_number, minute_number')
          .eq('id', true)
          .single(),
        supabase.rpc('get_my_transfer_history_dashboard', {}),
        supabase.from('club_riders').select('rider_id').eq('club_id', clubIdValue),
      ])

      if (marketResult.error) throw marketResult.error
      if (offersResult.error) throw offersResult.error
      if (mySentOffersDashboardResult.error) throw mySentOffersDashboardResult.error
      if (myOutgoingOffersResult.error) throw myOutgoingOffersResult.error
      if (sellerNegotiationsResult.error) throw sellerNegotiationsResult.error
      if (buyerNegotiationsResult.error) throw buyerNegotiationsResult.error
      if (freeAgentsResult.error) throw freeAgentsResult.error
      if (freeAgentNegotiationsResult.error) throw freeAgentNegotiationsResult.error
      if (gameStateResult.error) throw gameStateResult.error
      if (transferHistoryResult.error) throw transferHistoryResult.error
      if (clubOwnedRidersResult.error) throw clubOwnedRidersResult.error

      const marketBase = (marketResult.data || []) as any[]
      const offersBase = (offersResult.data || []) as any[]
      const mySentOffersDashboardBase = (mySentOffersDashboardResult.data || []) as any[]
      const myOutgoingOffersBase = (myOutgoingOffersResult.data || []) as any[]
      const sellerNegotiationsBase = (sellerNegotiationsResult.data || []) as any[]
      const buyerNegotiationsBase = (buyerNegotiationsResult.data || []) as any[]
      const freeAgentBase = (freeAgentsResult.data || []) as any[]
      const historyRows = (transferHistoryResult.data || []) as TransferHistoryRow[]
      const ownedRiderRows = (clubOwnedRidersResult.data || []) as ClubOwnedRiderRow[]
      const gameStateData = gameStateResult.data as GameStateRow
      const currentGameDate = getCurrentGameDateFromState(gameStateData)

      const freeAgentNegotiationRows = ((freeAgentNegotiationsResult.data || []) as any[]).map(
        (row) => normalizeFreeAgentNegotiationRow(row, currentGameDate)
      )

      const riderIds = Array.from(
        new Set(
          [
            ...marketBase.map((row) => row.rider_id),
            ...offersBase.map((row) => row.rider_id),
            ...mySentOffersDashboardBase.map((row) => row.rider_id),
            ...myOutgoingOffersBase.map((row) => row.rider_id),
            ...sellerNegotiationsBase.map((row) => row.rider_id),
            ...buyerNegotiationsBase.map((row) => row.rider_id),
            ...freeAgentBase.map((row) => row.rider_id),
            ...freeAgentNegotiationRows.map((row) => row.rider_id),
            ...historyRows.map((row) => row.rider_id),
            ...ownedRiderRows.map((row) => row.rider_id),
          ].filter(isNonEmptyString)
        )
      )

      const marketScoutRiderIds = Array.from(
        new Set(
          [...marketBase.map((row) => row.rider_id), ...freeAgentBase.map((row) => row.rider_id)].filter(
            isNonEmptyString
          )
        )
      )

      let riderMap: Record<string, any> = {}
      let latestScoutReports: Record<string, LatestScoutReportRow> = {}

      if (riderIds.length > 0 || marketScoutRiderIds.length > 0) {
        const [riderRows, scoutReports] = await Promise.all([
          riderIds.length > 0 ? fetchRiderRowsByIds(riderIds) : Promise.resolve([]),
          marketScoutRiderIds.length > 0
            ? fetchLatestScoutReportsForClub(clubIdValue, marketScoutRiderIds)
            : Promise.resolve({} as Record<string, LatestScoutReportRow>),
        ])

        riderMap = Object.fromEntries((riderRows || []).map((row: any) => [row.id, row]))
        latestScoutReports = scoutReports
      }

      const freeAgentsRows: FreeAgentMarketRow[] = freeAgentBase.map((row) => {
        const latestScoutReport = latestScoutReports[row.rider_id] ?? null

        const fullName = buildPreferredRiderName({
          firstName: row.first_name ?? null,
          lastName: row.last_name ?? null,
          displayName: row.display_name ?? null,
          fallbackId: row.rider_id,
        })

        return {
          id: row.free_agent_id,
          free_agent_id: row.free_agent_id,
          rider_id: row.rider_id,
          status: row.status,
          expected_salary_weekly: row.expected_salary_weekly ?? null,
          expires_on_game_date: row.expires_on_game_date ?? null,
          full_name: fullName,
          display_name: fullName,
          country_code: row.country_code ?? null,
          role: row.role ?? null,
          overall: row.overall ?? null,
          potential: row.potential ?? null,
          age_years: calculateAgeYearsFromGameDate(row.birth_date, currentGameDate),
          latest_scout_report: latestScoutReport,
          is_scouted: Boolean(latestScoutReport),
        }
      })

      const freeAgentSnapshotRiderMap = Object.fromEntries(
        freeAgentBase.map((row) => [
          row.rider_id,
          {
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            display_name: row.display_name ?? null,
            country_code: row.country_code ?? null,
            role: row.role ?? null,
            overall: row.overall ?? null,
            potential: row.potential ?? null,
            birth_date: row.birth_date ?? null,
          },
        ])
      )

      const freeAgentRowByRiderId = new Map(freeAgentsRows.map((row) => [row.rider_id, row]))

      const resolvedFreeAgentNegotiationsRows: FreeAgentNegotiationRow[] =
        freeAgentNegotiationRows.map((row) => {
          const rider =
            riderMap[row.rider_id] ??
            freeAgentSnapshotRiderMap[row.rider_id] ??
            row.rider ??
            null
          const marketFallback = freeAgentRowByRiderId.get(row.rider_id) ?? null

          const fullName = buildPreferredRiderName({
            firstName: rider?.first_name ?? null,
            lastName: rider?.last_name ?? null,
            fullName: marketFallback?.full_name ?? null,
            displayName:
              row.display_name ??
              rider?.display_name ??
              marketFallback?.display_name ??
              null,
            fallbackId: row.rider_id,
          })

          return {
            ...row,
            full_name: fullName,
            display_name: fullName,
            country_code:
              row.country_code ??
              rider?.country_code ??
              marketFallback?.country_code ??
              null,
            role: row.role ?? rider?.role ?? marketFallback?.role ?? null,
            overall: row.overall ?? rider?.overall ?? marketFallback?.overall ?? null,
            potential:
              row.potential ?? rider?.potential ?? marketFallback?.potential ?? null,
            age_years:
              row.age_years ??
              marketFallback?.age_years ??
              calculateAgeYearsFromGameDate(
                rider?.birth_date ?? row.rider?.birth_date,
                currentGameDate
              ),
            rider: {
              id: row.rider_id,
              first_name: rider?.first_name ?? null,
              last_name: rider?.last_name ?? null,
              display_name: fullName,
              country_code:
                row.country_code ??
                rider?.country_code ??
                marketFallback?.country_code ??
                null,
              role: row.role ?? rider?.role ?? marketFallback?.role ?? null,
              overall: row.overall ?? rider?.overall ?? marketFallback?.overall ?? null,
              potential:
                row.potential ?? rider?.potential ?? marketFallback?.potential ?? null,
              birth_date: rider?.birth_date ?? row.rider?.birth_date ?? null,
            },
          }
        })

      const market: MarketListingRow[] = marketBase
        .map((row: any) => {
          const rider = riderMap[row.rider_id]
          const fullName = buildPreferredRiderName({
            firstName: rider?.first_name,
            lastName: rider?.last_name,
            fullName: row.full_name,
            displayName: row.display_name ?? rider?.display_name,
            fallbackId: row.rider_id,
          })

          const resolvedListingId = row.listing_id ?? row.id ?? null
          if (!resolvedListingId) return null

          return {
            ...row,
            id: row.id ?? resolvedListingId,
            listing_id: resolvedListingId,
            first_name: rider?.first_name ?? null,
            last_name: rider?.last_name ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: row.country_code ?? rider?.country_code ?? null,
            role: row.role ?? rider?.role ?? null,
            overall: row.overall ?? rider?.overall ?? null,
            potential: row.potential ?? rider?.potential ?? null,
            age_years:
              row.age_years ?? calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
          } satisfies MarketListingRow
        })
        .filter((row): row is MarketListingRow => Boolean(row))

      const mapOfferRows = (rows: any[]): TransferOfferRow[] =>
        rows.map((row: any) => {
          const rider = riderMap[row.rider_id]
          const payload = getActivityPayload(row)
          const riderLabel =
            readText(row.rider_name) ??
            readText(payload?.rider_name) ??
            null

          const fullName = buildPreferredRiderName({
            firstName: row.rider_first_name ?? row.first_name ?? rider?.first_name ?? null,
            lastName: row.rider_last_name ?? row.last_name ?? rider?.last_name ?? null,
            fullName: riderLabel ?? row.full_name ?? null,
            displayName:
              row.rider_display_name ??
              row.display_name ??
              rider?.display_name ??
              readText(payload?.display_name) ??
              null,
            fallbackId: row.rider_id,
          })

          return {
            ...row,
            buyer_club_name: row.buyer_club?.name ?? row.buyer_club_name ?? null,
            first_name: row.first_name ?? rider?.first_name ?? null,
            last_name: row.last_name ?? rider?.last_name ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: row.country_code ?? rider?.country_code ?? null,
            role: row.role ?? rider?.role ?? null,
            overall: row.overall ?? rider?.overall ?? null,
            potential: row.potential ?? rider?.potential ?? null,
            age_years:
              row.age_years ?? calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
          }
        })

      const mapNegotiationRows = (rows: any[]): TransferNegotiationRow[] =>
        rows.map((row: any) => {
          const rider = riderMap[row.rider_id]
          const payload = getActivityPayload(row)
          const riderLabel =
            readText(row.rider_name) ??
            readText(payload?.rider_name) ??
            null

          const fullName = buildPreferredRiderName({
            firstName: row.rider_first_name ?? row.first_name ?? rider?.first_name ?? null,
            lastName: row.rider_last_name ?? row.last_name ?? rider?.last_name ?? null,
            fullName: riderLabel ?? row.full_name ?? null,
            displayName:
              row.rider_display_name ??
              row.display_name ??
              rider?.display_name ??
              readText(payload?.display_name) ??
              null,
            fallbackId: row.rider_id,
          })

          return {
            ...row,
            buyer_club_name: row.buyer_club?.name ?? row.buyer_club_name ?? null,
            first_name: row.first_name ?? rider?.first_name ?? null,
            last_name: row.last_name ?? rider?.last_name ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: row.country_code ?? rider?.country_code ?? null,
            role: row.role ?? rider?.role ?? null,
            overall: row.overall ?? rider?.overall ?? null,
            potential: row.potential ?? rider?.potential ?? null,
            age_years:
              row.age_years ?? calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
          }
        })

      const offers: TransferOfferRow[] = mapOfferRows(offersBase)
      const mySentOffersDashboardRows: TransferOfferRow[] = mapOfferRows(mySentOffersDashboardBase)
      const myOutgoingOffersRows: TransferOfferRow[] = mapOfferRows(myOutgoingOffersBase)
      const negotiations: TransferNegotiationRow[] = mapNegotiationRows(sellerNegotiationsBase)
      const buyerNegotiations: TransferNegotiationRow[] = mapNegotiationRows(buyerNegotiationsBase)

      const clubIds = [
        clubIdValue,
        ...market.map((row) => row.seller_club_id),
        ...offers.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...mySentOffersDashboardRows.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...myOutgoingOffersRows.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...negotiations.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...buyerNegotiations.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...resolvedFreeAgentNegotiationsRows.map((row) => row.club_id),
        ...historyRows.flatMap((row) => [row.from_club_id, row.to_club_id]),
      ]

      const names = await fetchClubNameMap(clubIds)

      const resolvedMarket = market.map((row) => ({
        ...row,
        seller_club_name: names[row.seller_club_id] ?? row.seller_club_name ?? null,
      }))

      const resolvedOffers = offers.map((row) => ({
        ...row,
        seller_club_name: names[row.seller_club_id] ?? row.seller_club_name ?? null,
        buyer_club_name: names[row.buyer_club_id] ?? row.buyer_club_name ?? null,
      }))

      const resolvedMySentOffersDashboard = mySentOffersDashboardRows.map((row) => ({
        ...row,
        seller_club_name: names[row.seller_club_id] ?? row.seller_club_name ?? null,
        buyer_club_name: names[row.buyer_club_id] ?? row.buyer_club_name ?? null,
      }))

      const resolvedMyOutgoingOffers = myOutgoingOffersRows.map((row) => ({
        ...row,
        seller_club_name: names[row.seller_club_id] ?? row.seller_club_name ?? null,
        buyer_club_name: names[row.buyer_club_id] ?? row.buyer_club_name ?? null,
      }))

      const resolvedNegotiations = negotiations.map((row) => ({
        ...row,
        buyer_club_name: names[row.buyer_club_id] ?? row.buyer_club_name ?? null,
      }))

      const resolvedBuyerNegotiations = buyerNegotiations.map((row) => ({
        ...row,
        buyer_club_name: names[row.buyer_club_id] ?? row.buyer_club_name ?? null,
      }))

      if (!mounted) return

      setClubOwnedRiders(ownedRiderRows)
      setMarketListings(resolvedMarket)
      setTransferOffers(resolvedOffers)
      setMySentOffersDashboard(resolvedMySentOffersDashboard)
      setMyOutgoingOffers(resolvedMyOutgoingOffers)
      setTransferNegotiations(resolvedNegotiations)
      setMyBuyerNegotiations(resolvedBuyerNegotiations)
      setTransferHistory(historyRows)
      setFreeAgents(freeAgentsRows)
      setFreeAgentNegotiations(resolvedFreeAgentNegotiationsRows)
      setClubNameMap(names)
      setLatestScoutReportMap(latestScoutReports)
      setGameState(gameStateData)

      setSelectedMarketListingId((prev) => {
        if (prev && resolvedMarket.some((row) => row.listing_id === prev)) return prev
        return resolvedMarket.length ? resolvedMarket[0].listing_id : null
      })

      setSelectedFreeAgentId((prev) => {
        if (prev && freeAgentsRows.some((row) => row.free_agent_id === prev)) return prev
        return freeAgentsRows.length
          ? resolvedFreeAgentNegotiationsRows[0]?.free_agent_id ?? freeAgentsRows[0].free_agent_id
          : null
      })
    } finally {
      if (mounted) setRiderLoading(false)
    }
  }

  const filteredCandidates = useMemo(() => {
    if (roleFilter === 'all') return staffCandidates
    return staffCandidates.filter((candidate) => candidate.role_type === roleFilter)
  }, [staffCandidates, roleFilter])

  const sortedCandidates = useMemo(() => {
    const candidates = [...filteredCandidates]

    candidates.sort((a, b) => {
      if (sortField === 'salary') {
        return sortDirection === 'asc'
          ? a.salary_weekly - b.salary_weekly
          : b.salary_weekly - a.salary_weekly
      }

      if (sortField === 'skills') {
        const aScore = getCandidateSkillScore(a)
        const bScore = getCandidateSkillScore(b)
        return sortDirection === 'asc' ? aScore - bScore : bScore - aScore
      }

      if (sortField === 'name') {
        const result = a.staff_name.localeCompare(b.staff_name, undefined, {
          sensitivity: 'base',
        })
        return sortDirection === 'asc' ? result : -result
      }

      const aCountry = getCountryName(a.country_code)
      const bCountry = getCountryName(b.country_code)
      const result = aCountry.localeCompare(bCountry, undefined, {
        sensitivity: 'base',
      })

      return sortDirection === 'asc' ? result : -result
    })

    return candidates
  }, [filteredCandidates, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / CANDIDATES_PER_PAGE))

  useEffect(() => {
    setCurrentPage(1)
  }, [roleFilter, sortField, sortDirection])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const paginatedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * CANDIDATES_PER_PAGE
    return sortedCandidates.slice(startIndex, startIndex + CANDIDATES_PER_PAGE)
  }, [sortedCandidates, currentPage])

  useEffect(() => {
    if (!paginatedCandidates.length) {
      setSelectedCandidateId(null)
      return
    }

    const stillExistsOnPage = paginatedCandidates.some(
      (candidate) => candidate.id === selectedCandidateId
    )

    if (!stillExistsOnPage) {
      setSelectedCandidateId(paginatedCandidates[0].id)
    }
  }, [paginatedCandidates, selectedCandidateId])

  const selectedCandidate = useMemo(
    () => paginatedCandidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [paginatedCandidates, selectedCandidateId]
  )

  const activeStaffByRole = useMemo(() => {
    const map = new Map<StaffRole, ClubStaffRow[]>()

    ;(['head_coach', 'team_doctor', 'mechanic', 'sport_director', 'scout_analyst'] as StaffRole[])
      .forEach((role) => map.set(role, []))

    clubStaffRows
      .filter((row) => row.is_active)
      .forEach((row) => {
        const current = map.get(row.role_type) ?? []
        current.push(row)
        map.set(row.role_type, current)
      })

    return map
  }, [clubStaffRows])

  const roleLimitsByRole = useMemo(() => {
    const map = new Map<StaffRole, StaffRoleLimitRow>()
    for (const row of roleLimits) {
      map.set(row.role_type, row)
    }
    return map
  }, [roleLimits])

  const currentClubRiderIds = useMemo(() => {
    return new Set<string>((clubOwnedRiders || []).map((row: any) => row.rider_id))
  }, [clubOwnedRiders])

  const selectedFreeAgent = useMemo(
    () => freeAgents.find((agent) => agent.free_agent_id === selectedFreeAgentId) || null,
    [freeAgents, selectedFreeAgentId]
  )

  const currentGameDate = useMemo(() => getCurrentGameDateFromState(gameState), [gameState])

  const myReceivedOffers = useMemo(() => {
    if (!clubId) return []
    return transferOffers.filter((offer) => offer.seller_club_id === clubId)
  }, [transferOffers, clubId])

  const mySellerNegotiations = useMemo(() => {
    if (!clubId) return []
    return transferNegotiations.filter((negotiation) => negotiation.seller_club_id === clubId)
  }, [transferNegotiations, clubId])

  const myActiveTransferListings = useMemo(() => {
    if (!clubId) return []

    return marketListings.filter((row) => {
      const status = normalizeOfferStatus(row.status ?? 'listed')
      return row.seller_club_id === clubId && status === 'listed'
    })
  }, [marketListings, clubId])

  const visibleMyReceivedOffers = useMemo(() => {
    return myReceivedOffers.filter((offer) =>
      shouldKeepTransferActivityRow(offer, currentGameDate)
    )
  }, [myReceivedOffers, currentGameDate])

  const visibleMySentOffersDashboard = useMemo(() => {
    return mySentOffersDashboard.filter((offer) =>
      shouldKeepTransferActivityRow(offer, currentGameDate)
    )
  }, [mySentOffersDashboard, currentGameDate])

  const visibleMySellerNegotiations = useMemo(() => {
    return mySellerNegotiations.filter((negotiation) =>
      shouldKeepTransferActivityRow(negotiation, currentGameDate)
    )
  }, [mySellerNegotiations, currentGameDate])

  const visibleMyBuyerNegotiations = useMemo(() => {
    return myBuyerNegotiations.filter((negotiation) =>
      shouldKeepTransferActivityRow(negotiation, currentGameDate)
    )
  }, [myBuyerNegotiations, currentGameDate])

  const myFreeAgentNegotiations = useMemo(() => {
    if (!clubId) return []

    return freeAgentNegotiations
      .filter((row) => row.club_id === clubId)
      .filter(
        (row) => !isExpiredOlderThan24GameHours(row.expires_on_game_date, gameState)
      )
  }, [freeAgentNegotiations, clubId, gameState])

  const sellerReviewOffer = useMemo(() => {
    if (!sellerReviewOfferId) return null
    return myReceivedOffers.find((offer) => offer.id === sellerReviewOfferId) || null
  }, [sellerReviewOfferId, myReceivedOffers])

  const sellerReviewOfferStatus = normalizeOfferStatus(sellerReviewOffer?.status)
  const sellerReviewOfferIsOpen = sellerReviewOfferStatus === 'open'

  const sellerReviewClubInfo = useMemo(() => {
    if (!sellerReviewOffer) {
      return { clubId: null, clubName: 'Unknown club' }
    }

    const info = getActivityClubInfo(sellerReviewOffer, 'outgoing')

    if (info.clubName !== 'Unknown club') {
      return info
    }

    const fallbackName =
      clubNameMap[sellerReviewOffer.buyer_club_id] ||
      sellerReviewOffer.buyer_club_name ||
      'Unknown club'

    return {
      clubId: info.clubId ?? sellerReviewOffer.buyer_club_id ?? null,
      clubName: fallbackName,
    }
  }, [sellerReviewOffer, clubNameMap])

  const sellerReviewRiderName = sellerReviewOffer
    ? sellerReviewOffer.full_name || sellerReviewOffer.display_name || 'Unknown rider'
    : 'Unknown rider'

  const activeTransferListingIds = useMemo(() => {
    const ids = new Set<string>()

    for (const offer of myOutgoingOffers) {
      if (isActiveOutgoingOfferStatus(offer.status)) {
        ids.add(offer.listing_id)
      }
    }

    return ids
  }, [myOutgoingOffers])

  const activeFreeAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const negotiation of myFreeAgentNegotiations) {
      if (negotiation.status === 'open') {
        ids.add(negotiation.free_agent_id)
      }
    }
    return ids
  }, [myFreeAgentNegotiations])

  const riderRoleOptions = useMemo(() => {
    const sourceRoles =
      riderMarketSubTab === 'transfer_list'
        ? marketListings.map((row) => row.role).filter(Boolean)
        : freeAgents.map((row) => row.role).filter(Boolean)

    return Array.from(new Set(sourceRoles as string[])).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [riderMarketSubTab, marketListings, freeAgents])

  const unifiedMarketRows = useMemo(() => {
    if (!clubId) return []

    if (riderMarketSubTab === 'transfer_list') {
      return marketListings.map((listing): TransferMarketItem => {
        const scoutMeta = getMarketScoutMeta({
          riderId: listing.rider_id,
          overall: listing.overall,
          scoutReportMap: latestScoutReportMap,
        })

        return {
          kind: 'transfer',
          key: `transfer-${listing.listing_id}`,
          rider_id: listing.rider_id,
          listing_id: listing.listing_id,
          display_name: listing.full_name || listing.display_name || 'Unknown rider',
          country_code: listing.country_code,
          role: listing.role,
          overall: listing.overall,
          potential: listing.potential,
          age_years: listing.age_years,
          seller_label: `Seller: ${
            listing.seller_club_name || clubNameMap[listing.seller_club_id] || 'Unknown club'
          }`,
          amount_value: listing.asking_price,
          amount_label: `Asking price: ${formatCurrency(listing.asking_price)}`,
          expires_on_game_date: listing.expires_on_game_date,
          is_user_active: activeTransferListingIds.has(listing.listing_id),
          is_own_item: listing.seller_club_id === clubId,
          overall_label: scoutMeta.overall_label,
          potential_label: scoutMeta.potential_label,
          is_scouted: scoutMeta.is_scouted,
          raw: listing,
        }
      })
    }

    return freeAgents.map((agent): FreeAgentMarketItem => {
      const scoutMeta = getMarketScoutMeta({
        riderId: agent.rider_id,
        overall: agent.overall,
        scoutReportMap: latestScoutReportMap,
      })

      return {
        kind: 'free_agent',
        key: `free-agent-${agent.free_agent_id}`,
        rider_id: agent.rider_id,
        free_agent_id: agent.free_agent_id,
        full_name: agent.full_name,
        display_name: agent.full_name || agent.display_name || 'Unknown rider',
        country_code: agent.country_code,
        role: agent.role,
        overall: agent.overall,
        potential: agent.potential,
        age_years: agent.age_years,
        seller_label: 'Type: Free Agent',
        amount_value: agent.expected_salary_weekly,
        amount_label: `Expected salary: ${formatCurrency(agent.expected_salary_weekly)}/week`,
        expires_on_game_date: agent.expires_on_game_date,
        is_user_active: activeFreeAgentIds.has(agent.free_agent_id),
        is_own_item: false,
        overall_label: scoutMeta.overall_label,
        potential_label: scoutMeta.potential_label,
        is_scouted: scoutMeta.is_scouted,
        raw: agent,
      }
    })
  }, [
    riderMarketSubTab,
    marketListings,
    freeAgents,
    clubNameMap,
    activeTransferListingIds,
    activeFreeAgentIds,
    clubId,
    latestScoutReportMap,
  ])

  const filteredUnifiedMarketRows = useMemo(() => {
    const term = marketSearch.trim().toLowerCase()

    return unifiedMarketRows.filter((row) => {
      if (marketRoleFilter !== 'all' && (row.role || '') !== marketRoleFilter) return false
      if (marketOnlyActive && !row.is_user_active) return false
      if (marketHideOwn && row.is_own_item) return false

      if (!term) return true

      const searchable = [
        row.display_name,
        row.role || '',
        row.country_code || '',
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [unifiedMarketRows, marketSearch, marketRoleFilter, marketOnlyActive, marketHideOwn])

  const sortedUnifiedMarketRows = useMemo(() => {
    const rows = [...filteredUnifiedMarketRows]

    rows.sort((a, b) => {
      if (marketSort === 'active') {
        if (a.is_user_active !== b.is_user_active) return a.is_user_active ? -1 : 1
        const aTime = tryParseDate(a.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = tryParseDate(b.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }

      if (marketSort === 'scouted') {
        if (a.is_scouted !== b.is_scouted) return a.is_scouted ? -1 : 1

        if (a.is_user_active !== b.is_user_active) return a.is_user_active ? -1 : 1

        const aTime = tryParseDate(a.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = tryParseDate(b.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER

        if (aTime !== bTime) return aTime - bTime

        return a.display_name.localeCompare(b.display_name, undefined, {
          sensitivity: 'base',
        })
      }

      if (marketSort === 'expires') {
        const aTime = tryParseDate(a.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = tryParseDate(b.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }

      if (marketSort === 'overall_desc') return (b.overall ?? -1) - (a.overall ?? -1)
      if (marketSort === 'overall_asc') return (a.overall ?? 999) - (b.overall ?? 999)
      if (marketSort === 'price_desc') return (b.amount_value ?? -1) - (a.amount_value ?? -1)
      if (marketSort === 'price_asc') {
        return (a.amount_value ?? 999999999) - (b.amount_value ?? 999999999)
      }

      if (marketSort === 'age_desc') return (b.age_years ?? -1) - (a.age_years ?? -1)
      if (marketSort === 'age_asc') return (a.age_years ?? 999) - (b.age_years ?? 999)

      if (marketSort === 'name_desc') {
        return b.display_name.localeCompare(a.display_name, undefined, { sensitivity: 'base' })
      }

      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
    })

    return rows
  }, [filteredUnifiedMarketRows, marketSort])

  const transferMarketRows = useMemo(
    () =>
      sortedUnifiedMarketRows.filter(
        (item): item is TransferMarketItem => item.kind === 'transfer'
      ),
    [sortedUnifiedMarketRows]
  )

  const freeAgentMarketRows = useMemo(
    () =>
      sortedUnifiedMarketRows.filter(
        (item): item is FreeAgentMarketItem => item.kind === 'free_agent'
      ),
    [sortedUnifiedMarketRows]
  )

  const activeMarketRowCount =
    riderMarketSubTab === 'transfer_list'
      ? transferMarketRows.length
      : freeAgentMarketRows.length

  const marketTotalPages = Math.max(1, Math.ceil(activeMarketRowCount / RIDERS_PER_PAGE))

  useEffect(() => {
    setMarketPage(1)
  }, [
    riderMarketSubTab,
    marketSearch,
    marketRoleFilter,
    marketOnlyActive,
    marketHideOwn,
    marketSort,
  ])

  useEffect(() => {
    if (marketPage > marketTotalPages) {
      setMarketPage(marketTotalPages)
    }
  }, [marketPage, marketTotalPages])

  const paginatedTransferMarketRows = useMemo(() => {
    const startIndex = (marketPage - 1) * RIDERS_PER_PAGE
    return transferMarketRows.slice(startIndex, startIndex + RIDERS_PER_PAGE)
  }, [transferMarketRows, marketPage])

  const paginatedFreeAgentMarketRows = useMemo(() => {
    const startIndex = (marketPage - 1) * RIDERS_PER_PAGE
    return freeAgentMarketRows.slice(startIndex, startIndex + RIDERS_PER_PAGE)
  }, [freeAgentMarketRows, marketPage])

  async function reloadStaffMarket(clubIdValue: string) {
    const [infrastructureRow] = await Promise.all([
      loadClubInfrastructure(clubIdValue),
      loadStaffData(clubIdValue, true),
    ])

    setClubInfrastructure(infrastructureRow)
  }

  async function reloadRiders(clubIdValue: string) {
    await loadRiderData(clubIdValue, true)
  }

  async function handleHireCandidate() {
    if (!selectedCandidate || !clubId) return

    const limitInfo = roleLimitsByRole.get(selectedCandidate.role_type)

    if (limitInfo && (!limitInfo.can_hire || limitInfo.open_slots <= 0)) {
      showToast(
        `${roleLabel(selectedCandidate.role_type)} is full (${limitInfo.active_count}/${limitInfo.limit_count}). Replace flow should be used later.`,
        'info'
      )
      return
    }

    try {
      setHireLoading(true)
      setToast(null)

      const { error: hireError } = await supabase.rpc('hire_staff_candidate', {
        p_candidate_id: selectedCandidate.id,
        p_contract_days: hireContractTerm,
      })

      if (hireError) throw hireError

      await reloadStaffMarket(clubId)

      const contractText =
        hireContractTerm === 0
          ? 'until the end of the current season'
          : 'until the end of the next season'

      showToast(
        `${selectedCandidate.staff_name} has been hired as ${roleLabel(selectedCandidate.role_type)} ${contractText}.`,
        'success'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to hire staff candidate.'
      showToast(message, 'error')
    } finally {
      setHireLoading(false)
    }
  }

  async function handleSubmitOffer(
    targetListing: MarketListingRow,
    explicitPrice?: number
  ): Promise<boolean> {
    if (!clubId) return false

    const riderName = targetListing.full_name || targetListing.display_name || 'the rider'
    const sellerName =
      targetListing.seller_club_name ||
      clubNameMap[targetListing.seller_club_id] ||
      'the seller club'

    try {
      setRiderActionLoading(true)
      setToast(null)
      setOfferModalMessage(null)

      const candidateListingId = targetListing.listing_id || targetListing.id || ''
      const offeredPrice = explicitPrice ?? targetListing.asking_price

      let listingId = ''

      if (candidateListingId) {
        const { data: listingById, error: listingByIdError } = await supabase
          .from('rider_transfer_listings')
          .select('id')
          .eq('id', candidateListingId)
          .eq('status', 'listed')
          .limit(1)
          .maybeSingle()

        if (listingByIdError) throw listingByIdError
        if (listingById?.id) {
          listingId = listingById.id
        }
      }

      if (!listingId) {
        const { data: listingByRider, error: listingByRiderError } = await supabase
          .from('rider_transfer_listings')
          .select('id')
          .eq('rider_id', targetListing.rider_id)
          .eq('status', 'listed')
          .order('listed_on_game_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (listingByRiderError) throw listingByRiderError
        if (listingByRider?.id) {
          listingId = listingByRider.id
        }
      }

      if (!listingId) {
        throw new Error('Transfer listing id is missing.')
      }

      if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
        throw new Error('Please enter a valid offer amount.')
      }

      const existingActiveOffer = myOutgoingOffers.find(
        (offer) => offer.listing_id === listingId && isActiveOutgoingOfferStatus(offer.status)
      )

      if (existingActiveOffer) {
        const duplicateMessage = `You already have an active offer for ${riderName}.`
        setOfferModalMessage(duplicateMessage)
        showToast(duplicateMessage, 'error')
        return false
      }

      const { data, error } = await supabase.rpc('submit_rider_transfer_offer', {
        p_listing_id: listingId,
        p_buyer_club_id: clubId,
        p_offered_price: offeredPrice,
      })

      if (error) {
        console.error('submit_rider_transfer_offer rpc error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          listingId,
          buyerClubId: clubId,
          offeredPrice,
          responseData: data,
        })
        throw error
      }

      const result = Array.isArray(data) ? data[0] : data

      await reloadRiders(clubId)

      if (result?.status === 'club_accepted' || result?.status === 'accepted') {
        const successMessage = `Your offer of ${formatTransferAmount(
          offeredPrice
        )} for ${riderName} was accepted by ${sellerName}. Check your notifications to start contract negotiations.`
        showToast(successMessage, 'success')
      } else {
        const successMessage = `Your offer of ${formatTransferAmount(
          offeredPrice
        )} for ${riderName} was sent to ${sellerName}.`
        showToast(successMessage, 'success')
      }

      setOfferModalMessage(null)
      return true
    } catch (err: any) {
      console.error('submit_rider_transfer_offer failed:', err)

      const rawMessage = getErrorMessage(err)
      const normalizedMessage =
        rawMessage.includes('An open offer from this club already exists for this listing')
          ? `You already have an active offer for ${riderName}.`
          : rawMessage || 'Failed to submit transfer offer.'

      setOfferModalMessage(normalizedMessage)
      showToast(normalizedMessage, 'error')
      return false
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleStartFreeAgentNegotiation(agent: FreeAgentMarketRow) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setToast(null)

      const freeAgentId = agent.free_agent_id?.trim()
      if (!freeAgentId) {
        throw new Error('Free agent id is missing.')
      }

      const existingOpen = freeAgentNegotiations.find(
        (row) =>
          row.club_id === clubId &&
          row.free_agent_id === freeAgentId &&
          row.status === 'open'
      )

      const returnTo = `${TRANSFERS_ROUTE}?market=free_agents`

      if (existingOpen?.id) {
        navigate(
          `/dashboard/transfers/free-agent-negotiations/${existingOpen.id}?returnTo=${encodeURIComponent(returnTo)}`
        )
        return
      }

      navigate(
        `/dashboard/transfers/free-agent-negotiations/new?freeAgentId=${encodeURIComponent(freeAgentId)}&riderId=${encodeURIComponent(agent.rider_id)}&returnTo=${encodeURIComponent(returnTo)}`
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to open free-agent negotiation.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleCancelFreeAgentNegotiation(negotiationId: string) {
    if (!clubId) return

    const targetNegotiation = freeAgentNegotiations.find((row) => row.id === negotiationId)

    if (
      targetNegotiation &&
      isFreeAgentNegotiationEffectivelyExpired(targetNegotiation.expires_on_game_date, gameState)
    ) {
      showToast('This free-agent negotiation has already expired.', 'info')
      return
    }

    try {
      setRiderActionLoading(true)
      setToast(null)

      const { error } = await supabase.rpc('withdraw_rider_free_agent_negotiation', {
        p_negotiation_id: negotiationId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      showToast('Free-agent negotiation cancelled.', 'success')
    } catch (err: any) {
      const message = getErrorMessage(err) || 'Failed to cancel free-agent negotiation.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleAcceptOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setToast(null)

      const { data: offerRow, error: offerError } = await supabase
        .from('rider_transfer_offers')
        .select('id, status, listing_id')
        .eq('id', offerId)
        .maybeSingle()

      if (offerError) throw offerError
      if (!offerRow) throw new Error('Offer not found.')

      const currentOfferStatus = normalizeOfferStatus(offerRow.status)
      if (currentOfferStatus !== 'open') {
        await reloadRiders(clubId)
        setSellerReviewOfferId(null)
        updateTransfersQuery({
          activity: 'outgoing',
          offerId: null,
        })
        showToast('This offer is no longer active.', 'info')
        return
      }

      const { data: listingRow, error: listingError } = await supabase
        .from('rider_transfer_listings')
        .select('id, status')
        .eq('id', offerRow.listing_id)
        .maybeSingle()

      if (listingError) throw listingError
      if (!listingRow) throw new Error('Listing not found.')

      const currentListingStatus = normalizeOfferStatus(listingRow.status)
      if (currentListingStatus !== 'listed') {
        await reloadRiders(clubId)
        setSellerReviewOfferId(null)
        updateTransfersQuery({
          activity: 'outgoing',
          offerId: null,
        })
        showToast('This transfer listing is no longer active.', 'info')
        return
      }

      const { data, error } = await supabase.rpc('accept_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)

      if (sellerReviewOfferId === offerId) {
        setSellerReviewOfferId(null)
        updateTransfersQuery({
          activity: 'outgoing',
          offerId: null,
        })
      }

      const result = Array.isArray(data) ? data[0] : data

      if (result?.negotiation_status === 'declined') {
        showToast('Club terms accepted, but the rider rejected the move.', 'info')
        return
      }

      showToast('Club terms accepted. Rider negotiation opened.', 'success')
    } catch (err: any) {
      const message = getErrorMessage(err) || 'Failed to accept offer.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleRejectOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setToast(null)

      const { error } = await supabase.rpc('reject_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)

      if (sellerReviewOfferId === offerId) {
        setSellerReviewOfferId(null)
        updateTransfersQuery({
          activity: 'outgoing',
          offerId: null,
        })
      }

      showToast('Offer rejected.', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject offer.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleWithdrawSentOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setToast(null)

      const { error } = await supabase.rpc('withdraw_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      showToast('Offer cancelled.', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel offer.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleWithdrawTransferNegotiation(negotiationId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setToast(null)

      const { data, error } = await supabase.rpc('withdraw_rider_transfer_negotiation', {
        p_negotiation_id: negotiationId,
      })

      if (error) throw error

      await reloadRiders(clubId)

      const result = Array.isArray(data) ? data[0] : data

      if (result?.listing_status === 'listed') {
        showToast(
          'Transfer negotiation cancelled. The rider returned to the transfer market.',
          'success'
        )
      } else if (result?.listing_status === 'expired') {
        showToast(
          'Transfer negotiation cancelled. The transfer listing has already expired.',
          'success'
        )
      } else {
        showToast('Transfer negotiation cancelled.', 'success')
      }
    } catch (err: any) {
      const message = getErrorMessage(err) || 'Failed to cancel transfer negotiation.'
      showToast(message, 'error')
    } finally {
      setRiderActionLoading(false)
    }
  }

  const pageStart =
    sortedCandidates.length === 0 ? 0 : (currentPage - 1) * CANDIDATES_PER_PAGE + 1
  const pageEnd = Math.min(currentPage * CANDIDATES_PER_PAGE, sortedCandidates.length)

  const marketPageStart =
    activeMarketRowCount === 0 ? 0 : (marketPage - 1) * RIDERS_PER_PAGE + 1
  const marketPageEnd = Math.min(marketPage * RIDERS_PER_PAGE, activeMarketRowCount)

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="mt-1 text-sm text-gray-500">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow">
          Loading transfers...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="mt-1 text-sm text-gray-500">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Riders and staff market, shortlist and negotiations.
          </p>

          {activeTab === 'riders' ? (
            <div
              className="mt-4 border-b border-gray-200"
              aria-label={clubName ? `Rider market tabs for ${clubName}` : 'Rider market tabs'}
            >
              <div className="flex items-center gap-8">
                <UnderlineSubTabButton
                  active={riderMarketSubTab === 'transfer_list'}
                  label="Transfer List"
                  onClick={() => {
                    setRiderMarketSubTab('transfer_list')
                    updateTransfersQuery({
                      riderSubTab: 'transfer_list',
                      activity: transferActivityMode,
                      offerId: sellerReviewOfferId,
                    })
                  }}
                />
                <UnderlineSubTabButton
                  active={riderMarketSubTab === 'free_agents'}
                  label="Free Agents"
                  onClick={() => {
                    setRiderMarketSubTab('free_agents')
                    updateTransfersQuery({
                      riderSubTab: 'free_agents',
                    })
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
          <SegmentedTabButton
            active={activeTab === 'riders'}
            label="Riders"
            onClick={() => setActiveTab('riders')}
          />
          <SegmentedTabButton
            active={activeTab === 'staff'}
            label="Staff"
            onClick={() => setActiveTab('staff')}
          />
        </div>
      </div>

      {activeTab === 'riders' ? (
        riderMarketSubTab === 'transfer_list' ? (
          <RiderTransferListPage
            riderLoading={riderLoading}
            gameState={gameState}
            marketSearch={marketSearch}
            setMarketSearch={setMarketSearch}
            marketRoleFilter={marketRoleFilter}
            setMarketRoleFilter={setMarketRoleFilter}
            riderRoleOptions={riderRoleOptions}
            marketSort={marketSort}
            setMarketSort={setMarketSort}
            marketOnlyActive={marketOnlyActive}
            setMarketOnlyActive={setMarketOnlyActive}
            marketHideOwn={marketHideOwn}
            setMarketHideOwn={setMarketHideOwn}
            paginatedUnifiedMarketRows={paginatedTransferMarketRows}
            selectedMarketListingId={selectedMarketListingId}
            onSelectMarketItem={(item) => {
              setSelectedMarketListingId(item.listing_id)
              openRiderProfilePage(item.rider_id, item.is_own_item)
            }}
            onQuickActionMarketItem={(item) => {
              if (item.is_own_item || item.is_user_active) return
              openOfferModal(item.raw)
            }}
            marketPageStart={marketPageStart}
            marketPageEnd={marketPageEnd}
            totalMarketRows={transferMarketRows.length}
            marketPage={marketPage}
            marketTotalPages={marketTotalPages}
            onPrevMarketPage={() => setMarketPage((prev) => Math.max(1, prev - 1))}
            onNextMarketPage={() => setMarketPage((prev) => Math.min(marketTotalPages, prev + 1))}
            riderActionLoading={riderActionLoading}
            myReceivedOffers={visibleMyReceivedOffers}
            myActiveTransferListings={myActiveTransferListings}
            clubNameMap={clubNameMap}
            onRejectOffer={(offerId) => {
              void handleRejectOffer(offerId)
            }}
            onAcceptOffer={(offerId) => {
              void handleAcceptOffer(offerId)
            }}
            onWithdrawSentOffer={(offerId) => {
              void handleWithdrawSentOffer(offerId)
            }}
            onWithdrawNegotiation={(negotiationId) => {
              void handleWithdrawTransferNegotiation(negotiationId)
            }}
            onOpenTeamPage={(targetClubId) => {
              openClubProfilePage(targetClubId)
            }}
            onOpenRiderProfile={(riderId, isOwnedByUser) => {
              openRiderProfilePage(riderId, isOwnedByUser)
            }}
            mySentOffers={visibleMySentOffersDashboard}
            mySellerNegotiations={visibleMySellerNegotiations}
            myBuyerNegotiations={visibleMyBuyerNegotiations}
            onOpenNegotiation={(negotiationId) => {
              navigate(`/dashboard/transfers/negotiations/${negotiationId}`)
            }}
            transferHistory={transferHistory}
            currentClubRiderIds={currentClubRiderIds}
            onOpenOwnedRiderProfile={(riderId) => openRiderProfilePage(riderId, true)}
            onOpenExternalRiderProfile={(riderId) => openRiderProfilePage(riderId, false)}
            onOpenClubProfile={(targetClubId) => openClubProfilePage(targetClubId)}
            activityMode={transferActivityMode}
            setActivityMode={(value: ActivityFilterMode) => {
              setTransferActivityMode(value)
              updateTransfersQuery({
                activity: value,
                offerId: value === 'outgoing' ? sellerReviewOfferId : null,
              })
              if (value !== 'outgoing') {
                setSellerReviewOfferId(null)
              }
            }}
            onOpenOfferReview={(offerId: string) => {
              openSellerOfferReview(offerId)
            }}
          />
        ) : (
          <RiderFreeAgentsPage
            riderLoading={riderLoading}
            gameState={gameState}
            marketSearch={marketSearch}
            setMarketSearch={setMarketSearch}
            marketRoleFilter={marketRoleFilter}
            setMarketRoleFilter={setMarketRoleFilter}
            riderRoleOptions={riderRoleOptions}
            marketSort={marketSort}
            setMarketSort={setMarketSort}
            marketOnlyActive={marketOnlyActive}
            setMarketOnlyActive={setMarketOnlyActive}
            paginatedUnifiedMarketRows={paginatedFreeAgentMarketRows}
            selectedFreeAgentId={selectedFreeAgentId}
            onSelectMarketItem={(item) => {
              setSelectedFreeAgentId(item.free_agent_id)
            }}
            onQuickActionMarketItem={(item) => {
              setSelectedFreeAgentId(item.free_agent_id)
              void handleStartFreeAgentNegotiation(item.raw)
            }}
            onOpenRiderProfile={(item) => {
              void openFreeAgentRiderProfile(item)
            }}
            onOpenHistoryRiderProfile={(riderId: string) => {
              openRiderProfilePage(riderId, currentClubRiderIds.has(riderId))
            }}
            marketPageStart={marketPageStart}
            marketPageEnd={marketPageEnd}
            totalMarketRows={freeAgentMarketRows.length}
            marketPage={marketPage}
            marketTotalPages={marketTotalPages}
            onFirstMarketPage={() => setMarketPage(1)}
            onPrevMarketPage={() => setMarketPage((prev) => Math.max(1, prev - 1))}
            onNextMarketPage={() => setMarketPage((prev) => Math.min(marketTotalPages, prev + 1))}
            onLastMarketPage={() => setMarketPage(marketTotalPages)}
            selectedFreeAgent={selectedFreeAgent}
            riderActionLoading={riderActionLoading}
            onStartFreeAgentNegotiation={(agent) => {
              void handleStartFreeAgentNegotiation(agent)
            }}
            onCancelNegotiation={(negotiationId) => {
              void handleCancelFreeAgentNegotiation(negotiationId)
            }}
            onOpenNegotiation={(negotiationId) => {
              navigate(`/dashboard/transfers/free-agent-negotiations/${negotiationId}`)
            }}
            myFreeAgentNegotiations={myFreeAgentNegotiations}
            transferHistory={transferHistory}
            currentClubRiderIds={currentClubRiderIds}
            onOpenOwnedRiderProfile={(riderId) => openRiderProfilePage(riderId, true)}
            onOpenExternalRiderProfile={(riderId) => openRiderProfilePage(riderId, false)}
            onOpenClubProfile={(targetClubId) => openClubProfilePage(targetClubId)}
          />
        )
      ) : (
        <StaffFreeAgentPage
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          sortField={sortField}
          setSortField={setSortField}
          sortDirection={sortDirection}
          setSortDirection={setSortDirection}
          paginatedCandidates={paginatedCandidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={setSelectedCandidateId}
          activeStaffByRole={activeStaffByRole}
          roleLimits={roleLimits}
          pageStart={pageStart}
          pageEnd={pageEnd}
          totalCandidates={sortedCandidates.length}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          selectedCandidate={selectedCandidate}
          hireLoading={hireLoading}
          hireContractTerm={hireContractTerm}
          setHireContractTerm={setHireContractTerm}
          scoutingLevel={clubInfrastructure?.scouting_level ?? 0}
          onHireCandidate={() => {
            void handleHireCandidate()
          }}
        />
      )}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[100] w-full max-w-md -translate-x-1/2 px-4">
          <div
            className={`rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm transition ${
              toast.tone === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : toast.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 text-sm font-medium">{toast.message}</div>

              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-xs font-semibold opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerModalListing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Make Transfer Offer</h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span>{' '}
                {offerModalListing.full_name || offerModalListing.display_name || 'Unknown rider'}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Seller:</span>{' '}
                {clubNameMap[offerModalListing.seller_club_id] ||
                  offerModalListing.seller_club_name ||
                  'Unknown club'}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Asking price:</span>{' '}
                {formatTransferAmount(offerModalListing.asking_price)}
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
                onChange={(e) => setOfferDraftPrice(formatCurrencyInput(e.target.value))}
                placeholder="$128,000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfferModalListing(null)
                  setOfferDraftPrice('')
                  setOfferModalMessage(null)
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={riderActionLoading}
                onClick={async () => {
                  if (!offerModalListing) return

                  const parsed = parseCurrencyInput(offerDraftPrice)
                  if (!parsed) {
                    const msg = 'Please enter a valid offer amount.'
                    setOfferModalMessage(msg)
                    showToast(msg, 'error')
                    return
                  }

                  const ok = await handleSubmitOffer(offerModalListing, parsed)

                  if (ok) {
                    setOfferModalListing(null)
                    setOfferDraftPrice('')
                    setOfferModalMessage(null)
                  }
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  riderActionLoading
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-yellow-400 text-black hover:bg-yellow-300'
                }`}
              >
                {riderActionLoading ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sellerReviewOffer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Review Transfer Offer</h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span> {sellerReviewRiderName}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Buyer:</span>{' '}
                {sellerReviewClubInfo.clubName}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Offer value:</span>{' '}
                {formatTransferAmount(sellerReviewOffer.offered_price)}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Status:</span>{' '}
                {sellerReviewOffer.status}
              </div>
            </div>

            {!sellerReviewOfferIsOpen ? (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                This offer is no longer active.
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeSellerOfferReview}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>

              {sellerReviewOfferIsOpen ? (
                <>
                  {sellerReviewClubInfo.clubId ? (
                    <button
                      type="button"
                      onClick={() => openClubProfile(sellerReviewOffer, 'outgoing')}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open club
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={riderActionLoading}
                    onClick={() => {
                      void handleRejectOffer(sellerReviewOffer.id)
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${
                      riderActionLoading
                        ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                        : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    Reject
                  </button>

                  <button
                    type="button"
                    disabled={riderActionLoading}
                    onClick={() => {
                      void handleAcceptOffer(sellerReviewOffer.id)
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${
                      riderActionLoading
                        ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                        : 'bg-yellow-400 text-black hover:bg-yellow-300'
                    }`}
                  >
                    Accept
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
