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

function TopNav({
  isDevelopingTeamUnlocked,
}: {
  isDevelopingTeamUnlocked: boolean
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
        ) : (
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            <span>Developing Team</span>
            <span aria-hidden="true">🔒</span>
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
  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [firstSquadRiderCount, setFirstSquadRiderCount] = useState(0)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)
  const [listView, setListView] = useState<SquadListView>('general')

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

  const developingTeamDisplayData = useMemo(() => {
    const sorted = [...riders].sort((a, b) => b.overall - a.overall)

    const avgOverall = sorted.length
      ? Math.round(sorted.reduce((sum, rider) => sum + rider.overall, 0) / sorted.length)
      : 50

    const seasonTrend = [
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
    ].map((label, index) => ({
      label,
      value: Math.max(
        6,
        Math.round((avgOverall - 44) * 0.9 + 6 + (index % 2 === 0 ? 0 : 1))
      ),
    }))

    const podiumChart = [
      { label: 'Wins', value: Math.max(0, Math.round((avgOverall - 54) / 6)) },
      { label: '2nd', value: Math.max(1, Math.round((avgOverall - 50) / 8) + 1) },
      { label: '3rd', value: 2 },
      { label: 'Top10', value: Math.max(4, Math.round(avgOverall / 6)) },
      { label: 'Top20', value: Math.max(8, Math.round(avgOverall / 3)) },
    ]

    return {
      seasonTrend,
      podiumChart,
      summary: {
        wins: podiumChart[0].value,
        podiums: podiumChart[0].value + podiumChart[1].value + podiumChart[2].value,
        top10s: podiumChart[3].value,
        bestGC: Math.max(5, 18 - podiumChart[0].value),
      },
    }
  }, [riders])

  const loadDevelopingTeamPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatusError(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
        'get_current_game_date'
      )
      if (gameDateErr) throw gameDateErr
      setGameDate(normalizeGameDateValue(currentGameDate))

      const { data: devStatusData, error: devStatusErr } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (devStatusErr) {
        console.error('get_developing_team_status failed:', devStatusErr)
        setDevelopingTeamStatus(null)
        setStatusError(devStatusErr.message ?? 'Could not load Developing Team status.')
        setRows([])
        setHealthOverviewRows([])
        setFirstSquadRiderCount(0)
        return
      }

      const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
      const status = (normalizedDevStatus ?? null) as DevelopingTeamStatus | null
      setDevelopingTeamStatus(status)

      if (status?.developing_club_id) {
        const { data: healthData, error: healthErr } = await supabase.rpc(
          'get_club_health_overview',
          {
            p_club_id: status.developing_club_id,
          }
        )

        if (healthErr) throw healthErr
        setHealthOverviewRows((healthData ?? []) as ClubHealthOverviewRow[])
      } else {
        setHealthOverviewRows([])
      }

      const mainClubId = status?.main_club_id
      if (mainClubId) {
        const { data: mainRoster, error: mainRosterErr } = await supabase
          .from('club_roster')
          .select('rider_id')
          .eq('club_id', mainClubId)

        if (mainRosterErr) throw mainRosterErr
        setFirstSquadRiderCount((mainRoster ?? []).length)
      } else {
        setFirstSquadRiderCount(0)
      }

      if (!status?.is_purchased || !status.developing_club_id) {
        setRows([])
        setHealthOverviewRows([])
        return
      }

      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall, availability_status, fatigue'
        )
        .eq('club_id', status.developing_club_id)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as DevelopingRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      let riderMetaMap = new Map<
        string,
        {
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
          availability_status: RiderAvailabilityStatus | null
        }
      >()

      if (riderIds.length > 0) {
        const { data: riderMetaRows, error: riderMetaErr } = await supabase
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

        if (riderMetaErr) throw riderMetaErr

        riderMetaMap = new Map(
          (
            riderMetaRows as Array<{
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
              availability_status: RiderAvailabilityStatus | null
            }>
          ).map((row) => [row.id, row])
        )
      }

      const mergedRows: DevelopingRosterRow[] = rosterRows.map((row) => {
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
          resistance: riderMeta?.resistance ?? null,
          race_iq: riderMeta?.race_iq ?? null,
          teamwork: riderMeta?.teamwork ?? null,
          morale: riderMeta?.morale ?? null,
          potential: riderMeta?.potential ?? null,
          fatigue: row.fatigue ?? riderMeta?.fatigue ?? null,
          availability_status:
            row.availability_status ?? riderMeta?.availability_status ?? null,
        }
      })

      setRows(mergedRows)
    } catch (e: any) {
      setRows([])
      setHealthOverviewRows([])
      setError(e?.message ?? 'Failed to load Developing Team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevelopingTeamPageData()
  }, [loadDevelopingTeamPageData])

  useEffect(() => {
    if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
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

  const hasDevelopingTeam = developingTeamStatus?.is_purchased ?? false
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window information unavailable.'

  if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
    return null
  }

  if (selectedRiderId) {
    return (
      <div className="w-full">
        <TopNav isDevelopingTeamUnlocked={hasDevelopingTeam} />

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
      <TopNav isDevelopingTeamUnlocked={hasDevelopingTeam} />

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
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {movementWindowSummary}
          </div>

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
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Competition
                </div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {developingTeamStatus?.current_competition_name ?? 'Competition unavailable'}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Place
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {formatOrdinal(developingTeamStatus?.current_competition_place)}
                </div>
                {developingTeamStatus?.current_competition_total_teams ? (
                  <div className="text-xs text-slate-500">
                    of {developingTeamStatus.current_competition_total_teams} teams
                  </div>
                ) : null}
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