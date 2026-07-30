import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import RiderProfilePage from '../../features/squad/components/RiderProfilePage'
import DevelopingSquadTab from '../../features/squad/components/DevelopingSquadTab'

import type {
  ClubHealthOverviewRow,
  ClubRosterRow,
  DevelopingTeamStatus,
  RiderAvailabilityStatus,
} from '../../features/squad/types'

import {
  getAgeFromBirthDate,
  normalizeGameDateValue,
} from '../../features/squad/utils/dates'

const DEVELOPING_TEAM_MAX = 8
const FIRST_SQUAD_MAX = 18

type SquadListView = 'general' | 'financial' | 'skills' | 'form'

type DevelopingRosterRow = ClubRosterRow & {
  birth_date?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string
  market_value?: number | null
  salary?: number | null
  contract_expires_at?: string | null
  contract_expires_season?: number | null
  sprint?: number | null
  climbing?: number | null
  time_trial?: number | null
  flat?: number | null
  endurance?: number | null
  recovery?: number | null
  resistance?: number | null
  race_iq?: number | null
  teamwork?: number | null
  morale?: number | null
  potential?: number | null
  fatigue?: number | null
  availability_status?: RiderAvailabilityStatus | null
}

type DevelopingTeamRiderView = {
  rowNo: number
  id: string
  name: string
  countryCode?: string | null
  role?: string | null
  age?: number | null
  overall: number
  fatigue: number
  status: RiderAvailabilityStatus
  marketValue?: number | null
  salary?: number | null
  contractExpiresAt?: string | null
  contractExpiresSeason?: number | null
  sprint?: number | null
  climbing?: number | null
  timeTrial?: number | null
  flat?: number | null
  endurance?: number | null
  recovery?: number | null
  morale?: number | null
  potential?: number | null
}

type DevelopingTeamPageStatus = DevelopingTeamStatus & {
  current_competition_name?: string | null
  current_competition_place?: number | null
  current_competition_total_teams?: number | null
  team_exists?: boolean
}

function hasDevelopingTeamAccess(status: DevelopingTeamPageStatus | null): boolean {
  return status?.is_purchased === true || status?.team_exists === true
}

type DevelopingCompetitionSummary = {
  name: string
  place: number | null
  totalTeams: number | null
}

type DevelopingClubFallbackRow = {
  id: string
  name: string
  parent_club_id: string | null
}

type ClubCurrentRankingPositionRow = {
  competition_label?: string | null
  rank_position?: number | string | null
  total_teams?: number | string | null
}

type DevelopingTeamCompetitionRpcRow = {
  developing_club_id?: string | null
  developing_club_name?: string | null
  competition_name?: string | null
  current_place?: number | string | null
  total_teams?: number | string | null
  season_year?: number | string | null
  international_points?: number | string | null
}

type CompetitionClubRow = {
  id: string
  name: string
  club_tier: string | null
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
}

type CompetitionPointsRow = {
  season_year?: number | string | null
  team_id?: string | null
  international_points?: number | string | null
}

type CompetitionTieBreakerRow = {
  season_year?: number | string | null
  team_id?: string | null
  club_id?: string | null
  completed_race_count?: number | string | null
  race_count?: number | string | null
  races_done_count?: number | string | null
  total_races_done?: number | string | null
  team_race_count?: number | string | null
  race_reputation_value?: number | string | null
  team_race_reputation_value?: number | string | null
  race_reputation?: number | string | null
}

type CompetitionRankedRow = CompetitionClubRow & {
  internationalPoints: number
  completedRaceCount: number
  raceReputationValue: number
}

function normalizeOptionalRankingInteger(
  value?: number | string | null,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }

  return null
}

function normalizeRankingNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalizeCompetitionLabel(value?: string | null): string | null {
  const label = String(value ?? '').trim()

  if (!label) return null

  return label
    .replace(/^Amateur\s+-\s+/i, 'Amateur: ')
    .replace(/Southern Balkan Europe/i, 'Southern & Balkan Europe')
}

function getCompetitionDivisionKey(club: CompetitionClubRow): string | null {
  if (club.club_tier === 'worldteam') return 'WORLD'
  if (club.club_tier === 'proteam') return club.tier2_division
  if (club.club_tier === 'continental') return club.tier3_division
  if (club.club_tier === 'amateur') return club.amateur_division
  return null
}

function formatCompetitionName(
  tier: string | null,
  divisionKey: string | null,
): string | null {
  if (!tier) return null
  if (tier === 'worldteam') return 'WorldTeam'

  const normalizedDivision = String(divisionKey ?? '')
    .replace(/^PRO_/, '')
    .replace(/^CONTINENTAL_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => `${word.charAt(0)}${word.slice(1).toLowerCase()}`)
    .join(' ')
    .replace(/Southern Balkan Europe/i, 'Southern & Balkan Europe')

  if (!normalizedDivision) return null
  if (tier === 'amateur') return `Amateur: ${normalizedDivision}`
  if (tier === 'proteam') return `ProTeam - ${normalizedDivision}`
  if (tier === 'continental') return `Continental - ${normalizedDivision}`

  return normalizedDivision
}

function getTieBreakerCompletedRaceCount(
  row?: CompetitionTieBreakerRow,
): number {
  return normalizeRankingNumber(
    row?.completed_race_count ??
      row?.race_count ??
      row?.races_done_count ??
      row?.total_races_done ??
      row?.team_race_count,
  )
}

function getTieBreakerRaceReputation(
  row?: CompetitionTieBreakerRow,
): number {
  return normalizeRankingNumber(
    row?.race_reputation_value ??
      row?.team_race_reputation_value ??
      row?.race_reputation,
  )
}

function compareCompetitionRows(
  left: CompetitionRankedRow,
  right: CompetitionRankedRow,
): number {
  if (right.internationalPoints !== left.internationalPoints) {
    return right.internationalPoints - left.internationalPoints
  }

  if (right.completedRaceCount !== left.completedRaceCount) {
    return right.completedRaceCount - left.completedRaceCount
  }

  if (right.raceReputationValue !== left.raceReputationValue) {
    return right.raceReputationValue - left.raceReputationValue
  }

  const byName = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
    numeric: true,
  })

  if (byName !== 0) return byName
  return left.id.localeCompare(right.id)
}

async function fetchCompetitionSummaryFromRankingTables(
  clubId: string,
): Promise<DevelopingCompetitionSummary | null> {
  const { data: targetData, error: targetError } = await supabase
    .from('clubs')
    .select('id, name, club_tier, tier2_division, tier3_division, amateur_division')
    .eq('id', clubId)
    .is('deleted_at', null)
    .maybeSingle()

  if (targetError) {
    console.warn('Could not load Developing Team competition assignment:', targetError)
    return null
  }

  const target = (targetData ?? null) as CompetitionClubRow | null
  const divisionKey = target ? getCompetitionDivisionKey(target) : null

  if (!target?.club_tier || !divisionKey) return null

  let clubsQuery = supabase
    .from('clubs')
    .select('id, name, club_tier, tier2_division, tier3_division, amateur_division')
    .eq('club_tier', target.club_tier)
    .is('deleted_at', null)

  if (target.club_tier === 'proteam') {
    clubsQuery = clubsQuery.eq('tier2_division', divisionKey)
  } else if (target.club_tier === 'continental') {
    clubsQuery = clubsQuery.eq('tier3_division', divisionKey)
  } else if (target.club_tier === 'amateur') {
    clubsQuery = clubsQuery.eq('amateur_division', divisionKey)
  }

  const [clubsResult, seasonResult] = await Promise.all([
    clubsQuery,
    supabase.rpc('team_ranking_get_current_season_year_v1'),
  ])

  if (clubsResult.error) {
    console.warn('Could not load Developing Team competition clubs:', clubsResult.error)
    return null
  }

  const seasonYear = normalizeOptionalRankingInteger(seasonResult.data)
  const competitionClubs = (clubsResult.data ?? []) as CompetitionClubRow[]

  if (competitionClubs.length === 0) return null

  let pointsQuery = supabase
    .from('team_international_points_by_season_v1')
    .select('season_year, team_id, international_points')

  let tieBreakersQuery = supabase
    .from('team_ranking_tiebreakers_by_season_v1')
    .select(
      'season_year, team_id, club_id, completed_race_count, race_count, races_done_count, total_races_done, team_race_count, race_reputation_value, team_race_reputation_value, race_reputation',
    )

  if (seasonYear) {
    pointsQuery = pointsQuery.eq('season_year', seasonYear)
    tieBreakersQuery = tieBreakersQuery.eq('season_year', seasonYear)
  }

  const [pointsResult, tieBreakersResult] = await Promise.all([
    pointsQuery,
    tieBreakersQuery,
  ])

  if (pointsResult.error) {
    console.warn('Could not load Developing Team ranking points:', pointsResult.error)
  }

  if (tieBreakersResult.error) {
    console.warn('Could not load Developing Team ranking tie-breakers:', tieBreakersResult.error)
  }

  const pointsByTeamId = new Map<string, number>()
  for (const row of (pointsResult.data ?? []) as CompetitionPointsRow[]) {
    const teamId = String(row.team_id ?? '').trim()
    if (!teamId) continue
    pointsByTeamId.set(teamId, normalizeRankingNumber(row.international_points))
  }

  const tieBreakersByTeamId = new Map<string, CompetitionTieBreakerRow>()
  for (const row of (tieBreakersResult.data ?? []) as CompetitionTieBreakerRow[]) {
    const teamId = String(row.team_id ?? row.club_id ?? '').trim()
    if (!teamId) continue
    tieBreakersByTeamId.set(teamId, row)
  }

  const rankedRows = competitionClubs
    .map<CompetitionRankedRow>((club) => {
      const tieBreaker = tieBreakersByTeamId.get(club.id)

      return {
        ...club,
        internationalPoints: pointsByTeamId.get(club.id) ?? 0,
        completedRaceCount: getTieBreakerCompletedRaceCount(tieBreaker),
        raceReputationValue: getTieBreakerRaceReputation(tieBreaker),
      }
    })
    .sort(compareCompetitionRows)

  const positionIndex = rankedRows.findIndex((club) => club.id === clubId)
  if (positionIndex < 0) return null

  return {
    name:
      formatCompetitionName(target.club_tier, divisionKey) ??
      'Competition unavailable',
    place: positionIndex + 1,
    totalTeams: rankedRows.length,
  }
}

const COMPETITION_REQUEST_TIMEOUT_MS = 4000

async function fetchDevelopingTeamCompetitionSummary(
  clubId: string,
): Promise<DevelopingCompetitionSummary | null> {
  /*
   * Fallback only. The primary competition values now arrive through
   * get_developing_team_status(). This direct-by-club RPC is kept for
   * compatibility, but it may never leave the UI in a loading state.
   */
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Developing Team competition request timed out.'))
      }, COMPETITION_REQUEST_TIMEOUT_MS)
    })

    const requestPromise = supabase.rpc(
      'get_developing_team_competition_by_club_v1',
      {
        p_developing_club_id: clubId,
      },
    )

    const { data, error } = await Promise.race([
      requestPromise,
      timeoutPromise,
    ])

    if (error) {
      console.warn(
        'Developing Team competition fallback failed:',
        error,
      )
      return null
    }

    const normalized = Array.isArray(data) ? data[0] : data
    const row =
      normalized && typeof normalized === 'object'
        ? (normalized as DevelopingTeamCompetitionRpcRow)
        : null

    if (!row) return null

    const name = normalizeCompetitionLabel(row.competition_name)
    const place = normalizeOptionalRankingInteger(row.current_place)
    const totalTeams = normalizeOptionalRankingInteger(row.total_teams)

    if (!name || place === null || totalTeams === null) {
      return null
    }

    return {
      name,
      place,
      totalTeams,
    }
  } catch (error) {
    console.warn(
      'Developing Team competition RPC did not complete:',
      error,
    )
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }

  // Final non-blocking fallback: reproduce the Team Ranking inputs directly.
  return fetchCompetitionSummaryFromRankingTables(clubId)
}


const DEVELOPING_TEAM_COMPETITION_CACHE_PREFIX =
  'ppm:developing-team-competition:v10:'

function readCompetitionSummaryCache(
  clubId: string,
): DevelopingCompetitionSummary | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(
      `${DEVELOPING_TEAM_COMPETITION_CACHE_PREFIX}${clubId}`,
    )

    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<DevelopingCompetitionSummary>
    const name = String(parsed.name ?? '').trim()
    const place = normalizeOptionalRankingInteger(parsed.place ?? null)
    const totalTeams = normalizeOptionalRankingInteger(parsed.totalTeams ?? null)

    if (
      (!name && place === null && totalTeams === null) ||
      name.toLowerCase() === 'competition unavailable'
    ) {
      return null
    }

    return {
      name,
      place,
      totalTeams,
    }
  } catch {
    return null
  }
}

function writeCompetitionSummaryCache(
  clubId: string,
  summary: DevelopingCompetitionSummary,
): void {
  if (typeof window === 'undefined') return

  if (summary.name.toLowerCase() === 'competition unavailable') return

  try {
    window.sessionStorage.setItem(
      `${DEVELOPING_TEAM_COMPETITION_CACHE_PREFIX}${clubId}`,
      JSON.stringify(summary),
    )
  } catch {
    // Ignore storage failures. Live data remains the source of truth.
  }
}

function buildRiderFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim()
  return fullName || fallback || 'Unknown Rider'
}

function formatOrdinal(value?: number | null) {
  if (value == null) return '—'

  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return `${value}st`
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`

  return `${value}th`
}

function getDefaultRiderAvailabilityStatus(): RiderAvailabilityStatus {
  return 'fit'
}


function getSeasonYearFromGameDate(value: string | null): number {
  if (!value) return 2000
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : 2000
}

function normalizePointsValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function getPremiumAccessFromResult(value: unknown): boolean {
  const normalizedValue = Array.isArray(value) ? value[0] : value

  if (!normalizedValue || typeof normalizedValue !== 'object') return false

  return (normalizedValue as Record<string, unknown>).is_premium === true
}

type SquadSeasonDashboardChartPoint = {
  label: string
  value: number
}

type SquadSeasonDashboardRaceRow = {
  riderId: string
  riderName: string
  role: string | null
  resultLabel: string
  position: number | null
  points: number
}

type SquadSeasonDashboardSelectionRow = {
  riderId: string
  riderName: string
  role: string | null
  raceName: string | null
  stageLabel: string | null
  raceSharpness?: number | null
  raceSharpnessLabel?: string | null
}

type SquadSeasonDashboardRaceTypeRow = {
  label: string
  value: number
}

type SquadSeasonDashboardData = {
  seasonTrend: SquadSeasonDashboardChartPoint[]
  podiumChart: SquadSeasonDashboardChartPoint[]
  summary: {
    wins: number
    podiums: number
    top10s: number
    bestGC: number
  }
  lastTeamRace: {
    raceId?: string | null
    raceName: string | null
    raceCategory?: string | null
    raceCountryCode?: string | null
    stageDate?: string | null
    stageLabel: string | null
    routeLabel?: string | null
    stageCount?: number | null
    rows: SquadSeasonDashboardRaceRow[]
  }
  nextRaceSelection: {
    raceId?: string | null
    raceName: string | null
    raceCategory?: string | null
    raceCountryCode?: string | null
    stageDate?: string | null
    stageLabel: string | null
    routeLabel?: string | null
    stageCount?: number | null
    rows: SquadSeasonDashboardSelectionRow[]
  }
  raceTypeSnapshot: SquadSeasonDashboardRaceTypeRow[]
}

function createEmptySquadSeasonDashboardData(): SquadSeasonDashboardData {
  return {
    seasonTrend: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ].map((label) => ({ label, value: 0 })),
    podiumChart: [
      { label: 'Wins', value: 0 },
      { label: '2nd', value: 0 },
      { label: '3rd', value: 0 },
      { label: 'Top10', value: 0 },
      { label: 'Top20', value: 0 },
    ],
    summary: {
      wins: 0,
      podiums: 0,
      top10s: 0,
      bestGC: 0,
    },
    lastTeamRace: {
      raceId: null,
      raceName: null,
      raceCategory: null,
      raceCountryCode: null,
      stageDate: null,
      stageLabel: null,
      routeLabel: null,
      stageCount: 0,
      rows: [],
    },
    nextRaceSelection: {
      raceId: null,
      raceName: null,
      raceCategory: null,
      raceCountryCode: null,
      stageDate: null,
      stageLabel: null,
      routeLabel: null,
      stageCount: 0,
      rows: [],
    },
    raceTypeSnapshot: [
      { label: 'One-day classics', value: 0 },
      { label: 'Stage finishes', value: 0 },
      { label: 'Mountain days', value: 0 },
      { label: 'Time trials', value: 0 },
    ],
  }
}

function createOperationalSquadSeasonDashboardData(
  dashboardData: SquadSeasonDashboardData,
): SquadSeasonDashboardData {
  const fallback = createEmptySquadSeasonDashboardData()

  return {
    ...fallback,
    lastTeamRace: dashboardData.lastTeamRace,
    nextRaceSelection: dashboardData.nextRaceSelection,
  }
}

function normalizeDashboardChartRows(value: unknown): SquadSeasonDashboardChartPoint[] {
  if (!Array.isArray(value)) return []

  return value.map((row) => {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}

    return {
      label: String(record.label ?? ''),
      value: normalizePointsValue(record.value, 0),
    }
  })
}

function normalizeSquadSeasonDashboardData(value: unknown): SquadSeasonDashboardData {
  const fallback = createEmptySquadSeasonDashboardData()
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const summary =
    record.summary && typeof record.summary === 'object'
      ? (record.summary as Record<string, unknown>)
      : {}
  const lastTeamRace =
    record.lastTeamRace && typeof record.lastTeamRace === 'object'
      ? (record.lastTeamRace as Record<string, unknown>)
      : {}
  const nextRaceSelection =
    record.nextRaceSelection && typeof record.nextRaceSelection === 'object'
      ? (record.nextRaceSelection as Record<string, unknown>)
      : {}

  const seasonTrend = normalizeDashboardChartRows(record.seasonTrend)
  const podiumChart = normalizeDashboardChartRows(record.podiumChart)
  const raceTypeSnapshot = normalizeDashboardChartRows(record.raceTypeSnapshot)

  return {
    seasonTrend: seasonTrend.length > 0 ? seasonTrend : fallback.seasonTrend,
    podiumChart: podiumChart.length > 0 ? podiumChart : fallback.podiumChart,
    summary: {
      wins: normalizePointsValue(summary.wins, 0),
      podiums: normalizePointsValue(summary.podiums, 0),
      top10s: normalizePointsValue(summary.top10s, 0),
      bestGC: normalizePointsValue(summary.bestGC, 0),
    },
    lastTeamRace: {
      raceId:
        typeof lastTeamRace.raceId === 'string' && lastTeamRace.raceId.trim()
          ? lastTeamRace.raceId
          : null,
      raceName:
        typeof lastTeamRace.raceName === 'string' && lastTeamRace.raceName.trim()
          ? lastTeamRace.raceName
          : null,
      raceCategory:
        typeof lastTeamRace.raceCategory === 'string' && lastTeamRace.raceCategory.trim()
          ? lastTeamRace.raceCategory
          : null,
      raceCountryCode:
        typeof lastTeamRace.raceCountryCode === 'string' && lastTeamRace.raceCountryCode.trim()
          ? lastTeamRace.raceCountryCode
          : null,
      stageDate:
        typeof lastTeamRace.stageDate === 'string' && lastTeamRace.stageDate.trim()
          ? lastTeamRace.stageDate
          : null,
      stageLabel:
        typeof lastTeamRace.stageLabel === 'string' && lastTeamRace.stageLabel.trim()
          ? lastTeamRace.stageLabel
          : null,
      routeLabel:
        typeof lastTeamRace.routeLabel === 'string' && lastTeamRace.routeLabel.trim()
          ? lastTeamRace.routeLabel
          : null,
      stageCount: normalizePointsValue(lastTeamRace.stageCount, 0),
      rows: Array.isArray(lastTeamRace.rows)
        ? lastTeamRace.rows.map((row) => {
            const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}

            return {
              riderId: String(item.riderId ?? ''),
              riderName: String(item.riderName ?? 'Unknown rider'),
              role: typeof item.role === 'string' ? item.role : null,
              resultLabel: String(item.resultLabel ?? '—'),
              position:
                typeof item.position === 'number' && Number.isFinite(item.position)
                  ? item.position
                  : null,
              points: normalizePointsValue(item.points, 0),
            }
          })
        : [],
    },
    nextRaceSelection: {
      raceId:
        typeof nextRaceSelection.raceId === 'string' && nextRaceSelection.raceId.trim()
          ? nextRaceSelection.raceId
          : null,
      raceName:
        typeof nextRaceSelection.raceName === 'string' && nextRaceSelection.raceName.trim()
          ? nextRaceSelection.raceName
          : null,
      raceCategory:
        typeof nextRaceSelection.raceCategory === 'string' && nextRaceSelection.raceCategory.trim()
          ? nextRaceSelection.raceCategory
          : null,
      raceCountryCode:
        typeof nextRaceSelection.raceCountryCode === 'string' && nextRaceSelection.raceCountryCode.trim()
          ? nextRaceSelection.raceCountryCode
          : null,
      stageDate:
        typeof nextRaceSelection.stageDate === 'string' && nextRaceSelection.stageDate.trim()
          ? nextRaceSelection.stageDate
          : null,
      stageLabel:
        typeof nextRaceSelection.stageLabel === 'string' && nextRaceSelection.stageLabel.trim()
          ? nextRaceSelection.stageLabel
          : null,
      routeLabel:
        typeof nextRaceSelection.routeLabel === 'string' && nextRaceSelection.routeLabel.trim()
          ? nextRaceSelection.routeLabel
          : null,
      stageCount: normalizePointsValue(nextRaceSelection.stageCount, 0),
      rows: Array.isArray(nextRaceSelection.rows)
        ? nextRaceSelection.rows.map((row) => {
            const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}

            return {
              riderId: String(item.riderId ?? ''),
              riderName: String(item.riderName ?? 'Unknown rider'),
              role: typeof item.role === 'string' ? item.role : null,
              raceName: typeof item.raceName === 'string' ? item.raceName : null,
              stageLabel: typeof item.stageLabel === 'string' ? item.stageLabel : null,
              raceSharpness: normalizePointsValue(item.raceSharpness, 50),
              raceSharpnessLabel:
                typeof item.raceSharpnessLabel === 'string' ? item.raceSharpnessLabel : null,
            }
          })
        : [],
    },
    raceTypeSnapshot:
      raceTypeSnapshot.length > 0 ? raceTypeSnapshot : fallback.raceTypeSnapshot,
  }
}

async function fetchSquadSeasonDashboardData(
  clubId: string,
  seasonYear: number,
): Promise<SquadSeasonDashboardData> {
  const { data, error } = await supabase.rpc('get_club_squad_season_dashboard_v1', {
    p_club_id: clubId,
    p_season_year: seasonYear,
  })

  if (error) {
    console.warn('Failed to load squad season dashboard data:', error)
    return createEmptySquadSeasonDashboardData()
  }

  return normalizeSquadSeasonDashboardData(data)
}

function TopNav({
  isDevelopingTeamUnlocked,
  isDevelopingTeamStatusResolved,
}: {
  isDevelopingTeamUnlocked: boolean
  isDevelopingTeamStatusResolved: boolean
}) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Squad</h2>
        <div className="text-sm text-gray-500">
          Manage your Developing Team roster and movement windows.
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        <a
          href="#/dashboard/squad"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/squad')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          First Squad
        </a>

        {isDevelopingTeamUnlocked ? (
          <a
            href="#/dashboard/developing-team"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Developing Team
          </a>
        ) : isDevelopingTeamStatusResolved ? (
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            <span>Developing Team</span>
            <span aria-hidden="true">🔒</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-gray-500">
            Developing Team
          </span>
        )}

        <a
          href="#/dashboard/staff"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/staff')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

export default function DevelopingTeamPage() {
  const [rows, setRows] = useState<DevelopingRosterRow[]>([])
  const [healthOverviewRows, setHealthOverviewRows] = useState<ClubHealthOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)
  const [developingTeamStatus, setDevelopingTeamStatus] =
    useState<DevelopingTeamPageStatus | null>(null)
  const [competitionSummary, setCompetitionSummary] =
    useState<DevelopingCompetitionSummary | null>(null)
  const [competitionLoading, setCompetitionLoading] = useState(true)
  const [firstSquadRiderCount, setFirstSquadRiderCount] = useState(0)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)
  const [listView, setListView] = useState<SquadListView>('general')
  const [isPremium, setIsPremium] = useState(false)
  const [isPremiumLoading, setIsPremiumLoading] = useState(true)
  const [developingTeamSeasonDashboardData, setDevelopingTeamSeasonDashboardData] =
    useState<SquadSeasonDashboardData>(() => createEmptySquadSeasonDashboardData())

  const navigate = useNavigate()

  const riders = useMemo<DevelopingTeamRiderView[]>(
    () =>
      rows.map((r, idx) => ({
        rowNo: idx + 1,
        id: r.rider_id,
        name: buildRiderFullName(r.first_name, r.last_name, r.full_name ?? r.display_name),
        countryCode: r.country_code,
        role: r.assigned_role,
        age: getAgeFromBirthDate(r.birth_date ?? null, gameDate ?? null) ?? r.age_years,
        overall: r.overall,
        fatigue: r.fatigue ?? 0,
        status:
          (r.availability_status ?? getDefaultRiderAvailabilityStatus()) as RiderAvailabilityStatus,
        marketValue: r.market_value ?? null,
        salary: r.salary ?? null,
        contractExpiresAt: r.contract_expires_at ?? null,
        contractExpiresSeason: r.contract_expires_season ?? null,
        sprint: r.sprint ?? null,
        climbing: r.climbing ?? null,
        timeTrial: r.time_trial ?? null,
        flat: r.flat ?? null,
        endurance: r.endurance ?? null,
        recovery: r.recovery ?? null,
        morale: r.morale ?? null,
        potential: r.potential ?? null,
      })),
    [rows, gameDate]
  )

  const riderNameById = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.rider_id,
          buildRiderFullName(row.first_name, row.last_name, row.full_name ?? row.display_name),
        ])
      ),
    [rows]
  )

  const healthOverviewDisplayRows = useMemo(
    () =>
      healthOverviewRows.map((row) => ({
        ...row,
        full_name: riderNameById.get(row.rider_id) ?? row.display_name ?? 'Unknown Rider',
      })),
    [healthOverviewRows, riderNameById]
  )

  const developingTeamDisplayData = useMemo(
    () => developingTeamSeasonDashboardData,
    [developingTeamSeasonDashboardData]
  )

  const loadDevelopingTeamPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatusError(null)
    setIsPremiumLoading(true)
    setCompetitionLoading(true)

    try {
      const [
        { data: authData, error: authErr },
        { data: currentGameDate, error: gameDateErr },
        { data: premiumStatusData, error: premiumStatusErr },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('get_current_game_date'),
        supabase.rpc('get_my_premium_status'),
      ])

      if (authErr) throw authErr
      if (gameDateErr) throw gameDateErr

      if (premiumStatusErr) {
        console.warn('Failed to load Premium status:', premiumStatusErr)
      }

      const hasPremiumAccess =
        !premiumStatusErr && getPremiumAccessFromResult(premiumStatusData)

      setIsPremium(hasPremiumAccess)
      setIsPremiumLoading(false)

      if (!hasPremiumAccess) {
        setHealthOverviewRows([])
        setDevelopingTeamSeasonDashboardData((currentData) =>
          createOperationalSquadSeasonDashboardData(currentData)
        )
      }

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const normalizedGameDate = normalizeGameDateValue(currentGameDate)
      const seasonYear = getSeasonYearFromGameDate(normalizedGameDate)
      setGameDate(normalizedGameDate)

      /*
       * Access and first paint use the real Developing Team club row directly.
       * Reporting RPCs are optional background hydration and can never block
       * access to an existing paid team.
       */
      const { data: developingClubData, error: developingClubError } =
        await supabase
          .from('clubs')
          .select('id, name, parent_club_id')
          .eq('owner_user_id', userId)
          .eq('club_type', 'developing')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

      if (developingClubError) throw developingClubError

      const developingClub =
        (developingClubData ?? null) as DevelopingClubFallbackRow | null

      if (!developingClub?.id) {
        setDevelopingTeamStatus({
          team_exists: false,
          is_purchased: false,
        } as unknown as DevelopingTeamPageStatus)
        setRows([])
        setHealthOverviewRows([])
        setCompetitionSummary(null)
        setCompetitionLoading(false)
        setDevelopingTeamSeasonDashboardData(
          createEmptySquadSeasonDashboardData()
        )
        return
      }

      const fallbackStatus = {
        main_club_id: developingClub.parent_club_id,
        main_club_name: null,
        developing_club_id: developingClub.id,
        developing_club_name: developingClub.name,
        team_exists: true,
        is_purchased: true,
        is_active: true,
        is_read_only: false,
        movement_window_open: false,
        current_window_label: null,
        next_window_label: null,
      } as unknown as DevelopingTeamPageStatus

      setDevelopingTeamStatus(fallbackStatus)

      const developingClubId = developingClub.id
      const cachedCompetitionSummary =
        readCompetitionSummaryCache(developingClubId)

      if (cachedCompetitionSummary) {
        setCompetitionSummary(cachedCompetitionSummary)
        setCompetitionLoading(false)
      } else {
        setCompetitionSummary(null)
      }

      // Only the roster query blocks first paint.
      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall, availability_status, fatigue'
        )
        .eq('club_id', developingClubId)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as DevelopingRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      setRows(rosterRows)
      setLoading(false)

      /*
       * Hydrate seasonal access and movement-window data in the background.
       * A timeout or reporting failure does not remove access and is not shown
       * as a destructive page error.
       */
      void (async () => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('Developing Team status request timed out.'))
            }, 2500)
          })

          const { data: statusData, error: statusRpcError } =
            await Promise.race([
              supabase.rpc('get_developing_team_status'),
              timeoutPromise,
            ])

          if (statusRpcError) {
            console.warn(
              'Could not hydrate Developing Team status:',
              statusRpcError
            )
            return
          }

          const normalizedStatus = Array.isArray(statusData)
            ? statusData[0]
            : statusData

          if (!normalizedStatus || typeof normalizedStatus !== 'object') {
            return
          }

          const liveStatus =
            normalizedStatus as DevelopingTeamPageStatus

          if (
            liveStatus.developing_club_id &&
            liveStatus.developing_club_id !== developingClubId
          ) {
            return
          }

          setDevelopingTeamStatus((currentStatus) => ({
            ...currentStatus,
            ...liveStatus,
            developing_club_id: developingClubId,
            developing_club_name:
              liveStatus.developing_club_name ??
              developingClub.name,
            main_club_id:
              liveStatus.main_club_id ??
              developingClub.parent_club_id,
            team_exists: true,
            is_purchased: true,
          }))

          const hasStatusCompetition =
            Boolean(liveStatus.current_competition_name?.trim()) &&
            liveStatus.current_competition_place != null &&
            liveStatus.current_competition_total_teams != null

          if (hasStatusCompetition) {
            const statusCompetitionSummary = {
              name: liveStatus.current_competition_name!.trim(),
              place: liveStatus.current_competition_place!,
              totalTeams:
                liveStatus.current_competition_total_teams!,
            }

            setCompetitionSummary(statusCompetitionSummary)
            writeCompetitionSummaryCache(
              developingClubId,
              statusCompetitionSummary
            )
            setCompetitionLoading(false)
          }
        } catch (statusHydrationError) {
          console.warn(
            'Developing Team status hydration was skipped:',
            statusHydrationError
          )
        } finally {
          if (timeoutId) clearTimeout(timeoutId)
        }
      })()

      // Competition is fully separate from access and never blocks the roster.
      if (!cachedCompetitionSummary) {
        void fetchDevelopingTeamCompetitionSummary(developingClubId)
          .then((summary) => {
            if (!summary) return

            setCompetitionSummary(summary)
            writeCompetitionSummaryCache(developingClubId, summary)
          })
          .catch((competitionError) => {
            console.warn(
              'Could not load Developing Team competition:',
              competitionError
            )
          })
          .finally(() => {
            setCompetitionLoading(false)
          })
      }

      // Last/Next Team Race remain Free. Premium analytics are sanitized for Free users.
      void fetchSquadSeasonDashboardData(developingClubId, seasonYear)
        .then((dashboardData) => {
          setDevelopingTeamSeasonDashboardData(
            hasPremiumAccess
              ? dashboardData
              : createOperationalSquadSeasonDashboardData(dashboardData)
          )
        })
        .catch((dashboardError) => {
          console.warn(
            'Failed to load Developing Team dashboard data:',
            dashboardError
          )
          setDevelopingTeamSeasonDashboardData(
            createEmptySquadSeasonDashboardData()
          )
        })

      if (hasPremiumAccess) {
        void supabase
          .rpc('get_club_health_overview', {
            p_club_id: developingClubId,
          })
          .then(({ data: healthData, error: healthErr }) => {
            if (healthErr) {
              console.warn(
                'Failed to load Developing Team health overview:',
                healthErr
              )
              return
            }

            setHealthOverviewRows(
              (healthData ?? []) as ClubHealthOverviewRow[]
            )
          })
      } else {
        setHealthOverviewRows([])
      }

      // Still load the First Squad count for movement capacity, but do not show
      // a separate First Squad summary line in the page header.
      if (developingClub.parent_club_id) {
        void supabase
          .from('club_roster')
          .select('rider_id')
          .eq('club_id', developingClub.parent_club_id)
          .then(({ data: mainRoster, error: mainRosterErr }) => {
            if (mainRosterErr) {
              console.warn(
                'Failed to load First Squad rider count:',
                mainRosterErr
              )
              return
            }

            setFirstSquadRiderCount((mainRoster ?? []).length)
          })
      } else {
        setFirstSquadRiderCount(0)
      }

      // Hydrate advanced rider fields after the table is already visible.
      if (riderIds.length > 0) {
        void supabase
          .from('riders')
          .select(
            `
            id,
            first_name,
            last_name,
            display_name,
            birth_date,
            salary,
            contract_expires_at,
            contract_expires_season,
            market_value,
            sprint,
            climbing,
            time_trial,
            flat,
            endurance,
            recovery,
            resistance,
            race_iq,
            teamwork,
            morale,
            potential,
            fatigue,
            availability_status
          `
          )
          .in('id', riderIds)
          .then(({ data: riderMetaRows, error: riderMetaErr }) => {
            if (riderMetaErr) {
              console.warn(
                'Failed to load Developing Team rider metadata:',
                riderMetaErr
              )
              return
            }

            const riderMetaMap = new Map(
              (
                (riderMetaRows ?? []) as Array<{
                  id: string
                  first_name: string | null
                  last_name: string | null
                  display_name: string | null
                  birth_date: string | null
                  salary: number | null
                  contract_expires_at: string | null
                  contract_expires_season: number | null
                  market_value: number | null
                  sprint: number | null
                  climbing: number | null
                  time_trial: number | null
                  flat: number | null
                  endurance: number | null
                  recovery: number | null
                  resistance: number | null
                  race_iq: number | null
                  teamwork: number | null
                  morale: number | null
                  potential: number | null
                  fatigue: number | null
                  availability_status:
                    RiderAvailabilityStatus | null
                }>
              ).map((row) => [row.id, row])
            )

            const mergedRows: DevelopingRosterRow[] =
              rosterRows.map((row) => {
                const riderMeta = riderMetaMap.get(row.rider_id)
                const fullName = buildRiderFullName(
                  riderMeta?.first_name,
                  riderMeta?.last_name,
                  riderMeta?.display_name ??
                    row.display_name
                )

                return {
                  ...row,
                  display_name: fullName,
                  full_name: fullName,
                  first_name:
                    riderMeta?.first_name ?? null,
                  last_name:
                    riderMeta?.last_name ?? null,
                  birth_date:
                    riderMeta?.birth_date ?? null,
                  market_value:
                    riderMeta?.market_value ?? null,
                  salary: riderMeta?.salary ?? null,
                  contract_expires_at:
                    riderMeta?.contract_expires_at ?? null,
                  contract_expires_season:
                    riderMeta?.contract_expires_season ??
                    null,
                  sprint: riderMeta?.sprint ?? null,
                  climbing: riderMeta?.climbing ?? null,
                  time_trial:
                    riderMeta?.time_trial ?? null,
                  flat: riderMeta?.flat ?? null,
                  endurance:
                    riderMeta?.endurance ?? null,
                  recovery:
                    riderMeta?.recovery ?? null,
                  resistance:
                    riderMeta?.resistance ?? null,
                  race_iq:
                    riderMeta?.race_iq ?? null,
                  teamwork:
                    riderMeta?.teamwork ?? null,
                  morale: riderMeta?.morale ?? null,
                  potential:
                    riderMeta?.potential ?? null,
                  fatigue:
                    row.fatigue ??
                    riderMeta?.fatigue ??
                    null,
                  availability_status:
                    row.availability_status ??
                    riderMeta?.availability_status ??
                    null,
                }
              })

            setRows(mergedRows)
          })
      }
    } catch (e: any) {
      setIsPremium(false)
      setIsPremiumLoading(false)
      setRows([])
      setHealthOverviewRows([])
      setCompetitionSummary(null)
      setCompetitionLoading(false)
      setDevelopingTeamSeasonDashboardData(
        createEmptySquadSeasonDashboardData()
      )
      setError(e?.message ?? 'Failed to load Developing Team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevelopingTeamPageData()
  }, [loadDevelopingTeamPageData])

  useEffect(() => {
    if (!isPremium && listView !== 'general') {
      setListView('general')
    }
  }, [isPremium, listView])

  useEffect(() => {
    if (!loading && !error && developingTeamStatus && !hasDevelopingTeamAccess(developingTeamStatus)) {
      navigate('/dashboard/squad', { replace: true })
    }
  }, [loading, error, developingTeamStatus, navigate])

  function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
  }

  async function handleMoveToFirstSquad(riderId: string) {
    if (movingRiderId) return

    if (!developingTeamStatus?.main_club_id) {
      setMoveActionMessage('First Squad is unavailable.')
      return
    }

    if (!developingTeamStatus.movement_window_open) {
      setMoveActionMessage(
        `Movement window is closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}.`
      )
      return
    }

    if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
      setMoveActionMessage(`First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`)
      return
    }

    setMovingRiderId(riderId)
    setMoveActionMessage(null)

    try {
      const { error: moveError } = await supabase.rpc('move_rider_between_main_and_developing', {
        p_rider_id: riderId,
        p_target_club_id: developingTeamStatus.main_club_id,
      })

      if (moveError) throw moveError

      setMoveActionMessage('Rider moved to the First Squad.')
      await loadDevelopingTeamPageData()
    } catch (e: any) {
      console.error('move_rider_between_main_and_developing failed:', e)
      setMoveActionMessage(e?.message ?? 'Could not move rider to the First Squad.')
    } finally {
      setMovingRiderId(null)
    }
  }

  function closeProfile() {
    setSelectedRiderId(null)
  }

  const developingTeamStatusResolved =
    developingTeamStatus !== null || statusError !== null || (!loading && !error)

  const hasDevelopingTeam = hasDevelopingTeamAccess(developingTeamStatus)
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : developingTeamStatus.next_window_label
        ? `Movement window closed. Next window: ${developingTeamStatus.next_window_label}`
        : null
    : null

  const currentCompetitionName =
    competitionSummary?.name ??
    developingTeamStatus?.current_competition_name ??
    (competitionLoading ? 'Loading competition…' : 'Competition unavailable')

  if (!loading && !error && developingTeamStatus && !hasDevelopingTeam) {
    return null
  }

  if (selectedRiderId) {
    return (
      <div className="w-full">
        <TopNav
          isDevelopingTeamUnlocked={hasDevelopingTeam}
          isDevelopingTeamStatusResolved={developingTeamStatusResolved}
        />

        <RiderProfilePage
          riderId={selectedRiderId}
          gameDate={gameDate}
          currentTeamType="developing"
          onBack={closeProfile}
          onRosterChanged={loadDevelopingTeamPageData}
          onCompareRider={({ riderId }) => {
            navigate(`/dashboard/compare-riders?left=${riderId}`)
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-full">
      <TopNav
          isDevelopingTeamUnlocked={hasDevelopingTeam}
          isDevelopingTeamStatusResolved={developingTeamStatusResolved}
        />

      {loading && (
        <div className="rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading Developing Team…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load Developing Team</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && hasDevelopingTeam && (
        <>
          {movementWindowSummary ? (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {movementWindowSummary}
            </div>
          ) : null}

          {statusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusError}
            </div>
          )}

          {moveActionMessage && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {moveActionMessage}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="text-base font-semibold text-gray-800">
              {developingTeamStatus?.developing_club_name ?? 'Developing Team'}
            </div>
            <div className="text-sm text-gray-500">
              Riders:{' '}
              <span className="font-medium text-gray-700">
                {riders.length}/{DEVELOPING_TEAM_MAX}
              </span>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Current Competition
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {currentCompetitionName}
              </div>
            </div>
          </div>

          <DevelopingSquadTab
            loading={loading}
            error={error}
            riders={riders}
            gameDate={gameDate}
            listView={listView}
            onListViewChange={setListView}
            isPremium={isPremium}
            isPremiumLoading={isPremiumLoading}
            squadMax={DEVELOPING_TEAM_MAX}
            firstSquadRiderCount={firstSquadRiderCount}
            movementWindowOpen={movementWindowOpen}
            movementWindowSummary={movementWindowSummary}
            statusError={statusError}
            moveActionMessage={moveActionMessage}
            movingRiderId={movingRiderId}
            onMoveToFirstSquad={handleMoveToFirstSquad}
            onOpenRiderProfile={openRiderProfile}
            healthOverviewDisplayRows={healthOverviewDisplayRows}
            squadDisplayData={developingTeamDisplayData}
          />
        </>
      )}
    </div>
  )
}