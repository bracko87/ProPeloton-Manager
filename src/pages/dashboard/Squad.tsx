/**
 * src/pages/dashboard/Squad.tsx
 *
 * First Squad page (dashboard/squad)
 *
 * Purpose:
 * - Render the First Squad roster, widgets and modals.
 * - Keep live roster loading from public.club_roster via the shared Supabase client.
 * - Provide top navigation to switch between squad-related pages (navigates routes).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import {
  squadTutorialSteps,
  squadWelcomeTutorial,
} from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'

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

import { getDefaultRiderAvailabilityStatus } from '../../features/squad/utils/rider-ui'

import FirstSquadTab, {
  type SquadListView,
} from '../../features/squad/components/FirstSquadTab'

type SquadRosterRow = ClubRosterRow & {
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
  morale?: number | null
  potential?: number | null
  international_points?: number | null
}

function buildRiderFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim()
  return fullName || fallback || 'Unknown Rider'
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

export default function SquadPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [rows, setRows] = useState<SquadRosterRow[]>([])
  const [healthOverviewRows, setHealthOverviewRows] = useState<ClubHealthOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)
  const [listView, setListView] = useState<SquadListView>('general')
  const [squadSeasonDashboardData, setSquadSeasonDashboardData] =
    useState<SquadSeasonDashboardData>(() => createEmptySquadSeasonDashboardData())
  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [developingTeamStatusError, setDevelopingTeamStatusError] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)
  const [transferListedRiderIds, setTransferListedRiderIds] = useState<Set<string>>(new Set())

  const SQUAD_MAX = 18

  const riders = useMemo(
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
        internationalPoints: r.international_points ?? 0,
        isTransferListed: transferListedRiderIds.has(r.rider_id),
      })),
    [rows, gameDate, transferListedRiderIds]
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
        full_name: riderNameById.get(row.rider_id) ?? row.display_name,
      })),
    [healthOverviewRows, riderNameById]
  )

  const squadDisplayData = useMemo(() => squadSeasonDashboardData, [squadSeasonDashboardData])

  const loadSquadPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDevelopingTeamStatusError(null)

    try {
      const [{ data: authData, error: authErr }, { data: currentGameDate, error: gameDateErr }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc('get_current_game_date'),
        ])

      if (authErr) throw authErr
      if (gameDateErr) throw gameDateErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const normalizedGameDate = normalizeGameDateValue(currentGameDate)
      const seasonYear = getSeasonYearFromGameDate(normalizedGameDate)

      setGameDate(normalizedGameDate)

      const devStatusPromise = supabase.rpc('get_developing_team_status')
      const clubPromise = supabase
        .from('clubs')
        .select('id')
        .eq('owner_user_id', userId)
        .eq('club_type', 'main')
        .single()

      void devStatusPromise.then(({ data: devStatusData, error: devStatusErr }) => {
        if (devStatusErr) {
          console.error('get_developing_team_status failed:', devStatusErr)
          setDevelopingTeamStatus(null)
          setDevelopingTeamStatusError(
            devStatusErr.message ?? 'Could not load Developing Team status.'
          )
          return
        }

        const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
        setDevelopingTeamStatus((normalizedDevStatus ?? null) as DevelopingTeamStatus | null)
      })

      const { data: club, error: clubErr } = await clubPromise

      if (clubErr) throw clubErr
      if (!club?.id) throw new Error('No club found for this user.')

      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall, availability_status, fatigue'
        )
        .eq('club_id', club.id)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as SquadRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      // First paint: show the roster immediately with the data already available
      // from club_roster. Expensive dashboard/health/meta data hydrates below.
      setRows(rosterRows)
      setLoading(false)

      void fetchSquadSeasonDashboardData(club.id, seasonYear)
        .then((dashboardData) => {
          setSquadSeasonDashboardData(dashboardData)
        })
        .catch((dashboardErr) => {
          console.warn('Failed to load squad season dashboard data:', dashboardErr)
          setSquadSeasonDashboardData(createEmptySquadSeasonDashboardData())
        })

      void supabase
        .rpc('get_club_health_overview', {
          p_club_id: club.id,
        })
        .then(({ data: healthData, error: healthErr }) => {
          if (healthErr) {
            console.warn('Failed to load club health overview:', healthErr)
            return
          }

          setHealthOverviewRows((healthData ?? []) as ClubHealthOverviewRow[])
        })

      if (riderIds.length === 0) {
        setTransferListedRiderIds(new Set())
        return
      }

      const safeEmptyRiderId = '00000000-0000-0000-0000-000000000000'

      const [
        riderInternationalPointResult,
        transferMarketResult,
        riderMetaResult,
      ] = await Promise.all([
        supabase
          .from('rider_international_points_by_season_v1')
          .select('rider_id, season_year, international_points')
          .in('rider_id', riderIds.length > 0 ? riderIds : [safeEmptyRiderId])
          .eq('season_year', seasonYear),
        supabase.rpc('get_transfer_market_listings', {
          p_page: 1,
          p_page_size: 500,
        }),
        supabase
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
            morale,
            potential,
            fatigue,
            availability_status
          `
          )
          .in('id', riderIds),
      ])

      if (riderInternationalPointResult.error) {
        console.warn('Failed to load rider international points:', riderInternationalPointResult.error)
      }

      if (transferMarketResult.error) {
        console.warn('Failed to load transfer market listings:', transferMarketResult.error)
      }

      if (riderMetaResult.error) {
        console.warn('Failed to load rider metadata:', riderMetaResult.error)
      }

      const internationalPointsByRiderId = new Map(
        ((riderInternationalPointResult.data ?? []) as Array<{
          rider_id: string
          international_points: number | string | null
        }>).map((row) => [row.rider_id, normalizePointsValue(row.international_points, 0)])
      )

      const activeListedIds = new Set(
        ((transferMarketResult.data ?? []) as Array<{ rider_id: string }>).map(
          (row) => row.rider_id
        )
      )

      setTransferListedRiderIds(new Set(riderIds.filter((id) => activeListedIds.has(id))))

      const riderMetaMap = new Map(
        (
          (riderMetaResult.data ?? []) as Array<{
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
            morale: number | null
            potential: number | null
            fatigue: number | null
            availability_status: RiderAvailabilityStatus | null
          }>
        ).map((row) => [row.id, row])
      )

      const mergedRows: SquadRosterRow[] = rosterRows.map((row) => {
        const riderMeta = riderMetaMap.get(row.rider_id)
        const fullName = buildRiderFullName(
          riderMeta?.first_name,
          riderMeta?.last_name,
          riderMeta?.display_name ?? row.display_name
        )

        return {
          ...row,
          display_name: fullName,
          full_name: fullName,
          first_name: riderMeta?.first_name ?? null,
          last_name: riderMeta?.last_name ?? null,
          birth_date: riderMeta?.birth_date ?? null,
          market_value: riderMeta?.market_value ?? null,
          salary: riderMeta?.salary ?? null,
          contract_expires_at: riderMeta?.contract_expires_at ?? null,
          contract_expires_season: riderMeta?.contract_expires_season ?? null,
          sprint: riderMeta?.sprint ?? null,
          climbing: riderMeta?.climbing ?? null,
          time_trial: riderMeta?.time_trial ?? null,
          flat: riderMeta?.flat ?? null,
          endurance: riderMeta?.endurance ?? null,
          recovery: riderMeta?.recovery ?? null,
          morale: riderMeta?.morale ?? null,
          potential: riderMeta?.potential ?? null,
          international_points: internationalPointsByRiderId.get(row.rider_id) ?? 0,
          fatigue: row.fatigue ?? riderMeta?.fatigue ?? null,
          availability_status:
            row.availability_status ?? riderMeta?.availability_status ?? null,
        }
      })

      setRows(mergedRows)
    } catch (e: any) {
      setSquadSeasonDashboardData(createEmptySquadSeasonDashboardData())
      setError(e?.message ?? 'Failed to load squad.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSquadPageData()
  }, [loadSquadPageData])

  useEffect(() => {
    let alive = true

    async function loadSquadTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'squad'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = squadTutorialSteps[0]

        await saveTutorialProgress('squad', 'started', firstStep?.key ?? null)

        if (!alive) return

        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('squad')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = squadTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        setTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadSquadTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  async function handleStartSquadTutorial() {
    const firstStep = squadTutorialSteps[0]

    await saveTutorialProgress('squad', 'started', firstStep?.key ?? null)

    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipSquadTutorial() {
    await saveTutorialProgress('squad', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextSquadTutorialStep() {
    const currentStep = squadTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= squadTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = squadTutorialSteps[nextIndex]

      await saveTutorialProgress('squad', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('squad', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'training')
    navigate('/dashboard/training')
  }

  async function handleFinishSquadTutorialForNow() {
    const currentStep = squadTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('squad', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseSquadTutorial() {
    const currentStep = squadTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('squad', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'squad',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  function openRiderProfile(riderId: string) {
    navigate(`/dashboard/my-riders/${riderId}`)
  }

  async function handleMoveToDevelopingTeam(riderId: string) {
    if (movingRiderId) return

    if (!developingTeamStatus?.is_purchased || !developingTeamStatus.developing_club_id) {
      setMoveActionMessage('Unlock Developing Team in Preferences first.')
      return
    }

    if (!developingTeamStatus.movement_window_open) {
      setMoveActionMessage(
        `Movement window is closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}.`
      )
      return
    }

    setMovingRiderId(riderId)
    setMoveActionMessage(null)

    try {
      const { error: moveError } = await supabase.rpc('move_rider_between_main_and_developing', {
        p_rider_id: riderId,
        p_target_club_id: developingTeamStatus.developing_club_id,
      })

      if (moveError) throw moveError

      setMoveActionMessage('Rider moved to the Developing Team.')
      await loadSquadPageData()
    } catch (e: any) {
      console.error('move_rider_between_main_and_developing failed:', e)
      setMoveActionMessage(e?.message ?? 'Could not move rider to the Developing Team.')
    } finally {
      setMovingRiderId(null)
    }
  }

  function isActive(path: string) {
    const current = location.pathname
    return current === path
  }

  const developingTeamStatusResolved =
    developingTeamStatus !== null || developingTeamStatusError !== null

  const hasDevelopingTeam = developingTeamStatus?.is_purchased === true
  const showDevelopingTeamLockedState =
    developingTeamStatusResolved && !hasDevelopingTeam
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window information unavailable.'

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Squad</h2>
          <div className="text-sm text-gray-500">
            Manage your first-team squad and view season insights.
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

          {hasDevelopingTeam ? (
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
          ) : showDevelopingTeamLockedState ? (
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

      <FirstSquadTab
        loading={loading}
        error={error}
        riders={riders}
        gameDate={gameDate}
        listView={listView}
        onListViewChange={setListView}
        squadMax={SQUAD_MAX}
        hasDevelopingTeam={hasDevelopingTeam}
        movementWindowOpen={movementWindowOpen}
        movementWindowSummary={movementWindowSummary}
        developingTeamStatusError={developingTeamStatusError}
        moveActionMessage={moveActionMessage}
        movingRiderId={movingRiderId}
        onMoveToDevelopingTeam={handleMoveToDevelopingTeam}
        onOpenRiderProfile={openRiderProfile}
        healthOverviewDisplayRows={healthOverviewDisplayRows}
        squadDisplayData={squadDisplayData}
      />

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={squadWelcomeTutorial.title}
          body={squadWelcomeTutorial.body}
          primaryAction={squadWelcomeTutorial.primaryAction}
          secondaryAction={squadWelcomeTutorial.secondaryAction}
          onPrimary={handleStartSquadTutorial}
          onSecondary={handleSkipSquadTutorial}
          onClose={handleCloseSquadTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={squadTutorialSteps[tutorialStepIndex].title}
          body={squadTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${squadTutorialSteps.length}`}
          primaryAction={
            squadTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
          }
          secondaryAction={
            tutorialStepIndex === squadTutorialSteps.length - 1
              ? squadTutorialSteps[tutorialStepIndex].secondaryAction
              : 'Skip tutorial'
          }
          onPrimary={handleNextSquadTutorialStep}
          onSecondary={
            tutorialStepIndex === squadTutorialSteps.length - 1
              ? handleFinishSquadTutorialForNow
              : handleSkipSquadTutorial
          }
          onClose={handleCloseSquadTutorial}
        />
      ) : null}
    </div>
  )
}