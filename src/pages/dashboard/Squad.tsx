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
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'

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
import RiderProfileModal from '../../features/squad/components/RiderProfileModal'

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
}

function buildRiderFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim()
  return fullName || fallback || 'Unknown Rider'
}

export default function SquadPage() {
  const location = useLocation()

  const [rows, setRows] = useState<SquadRosterRow[]>([])
  const [healthOverviewRows, setHealthOverviewRows] = useState<ClubHealthOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)
  const [listView, setListView] = useState<SquadListView>('general')

  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)

  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [developingTeamStatusError, setDevelopingTeamStatusError] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)

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
        full_name: riderNameById.get(row.rider_id) ?? row.display_name,
      })),
    [healthOverviewRows, riderNameById]
  )

  const squadDisplayData = useMemo(() => {
    const sorted = [...riders].sort((a, b) => b.overall - a.overall)
    const avgOverall = sorted.length
      ? Math.round(sorted.reduce((sum, rider) => sum + rider.overall, 0) / sorted.length)
      : 60

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
        8,
        Math.round((avgOverall - 48) * 0.95 + 8 + (index % 2 === 0 ? 0 : 2))
      ),
    }))

    const podiumChart = [
      { label: 'Wins', value: Math.max(1, Math.round((avgOverall - 52) / 4) + 1) },
      { label: '2nd', value: 2 },
      { label: '3rd', value: 3 },
      { label: 'Top10', value: 9 },
      { label: 'Top20', value: 20 },
    ]

    return {
      seasonTrend,
      podiumChart,
      summary: {
        wins: podiumChart[0].value,
        podiums: podiumChart[0].value + podiumChart[1].value + podiumChart[2].value,
        top10s: podiumChart[3].value,
        bestGC: Math.max(2, 12 - podiumChart[0].value),
      },
    }
  }, [riders])

  const loadSquadPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDevelopingTeamStatusError(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
        'get_current_game_date'
      )

      if (gameDateErr) throw gameDateErr

      const normalizedGameDate = normalizeGameDateValue(currentGameDate)
      setGameDate(normalizedGameDate)

      const { data: devStatusData, error: devStatusErr } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (devStatusErr) {
        console.error('get_developing_team_status failed:', devStatusErr)
        setDevelopingTeamStatus(null)
        setDevelopingTeamStatusError(
          devStatusErr.message ?? 'Could not load Developing Team status.'
        )
      } else {
        const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
        setDevelopingTeamStatus((normalizedDevStatus ?? null) as DevelopingTeamStatus | null)
      }

      const { data: club, error: clubErr } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_user_id', userId)
        .eq('club_type', 'main')
        .single()

      if (clubErr) throw clubErr
      if (!club?.id) throw new Error('No club found for this user.')

      const { data: healthData, error: healthErr } = await supabase.rpc('get_club_health_overview', {
        p_club_id: club.id,
      })

      if (healthErr) throw healthErr

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
              morale: number | null
              potential: number | null
              fatigue: number | null
              availability_status: RiderAvailabilityStatus | null
            }>
          ).map((row) => [row.id, row])
        )
      }

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
          fatigue: row.fatigue ?? riderMeta?.fatigue ?? null,
          availability_status:
            row.availability_status ?? riderMeta?.availability_status ?? null,
        }
      })

      setRows(mergedRows)
      setHealthOverviewRows((healthData ?? []) as ClubHealthOverviewRow[])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load squad.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSquadPageData()
  }, [loadSquadPageData])

  function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
    setProfileOpen(true)
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

  function closeProfile() {
    setProfileOpen(false)
    setSelectedRiderId(null)
  }

  function isActive(path: string) {
    const current = location.pathname
    return current === path
  }

  const hasDevelopingTeam = developingTeamStatus?.is_purchased ?? false
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

      <RiderProfileModal
        open={profileOpen}
        onClose={closeProfile}
        riderId={selectedRiderId}
        gameDate={gameDate}
        currentTeamType="first"
      />
    </div>
  )
}
