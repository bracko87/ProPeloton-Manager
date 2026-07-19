'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type TeamLabel = 'First Team' | 'U23'
type RegularTrainingIntensity = 'recovery' | 'light' | 'normal' | 'hard'
type DailyPlanSource =
  | 'head_coach'
  | 'u23_head_coach'
  | 'manual_override'
  | 'system_block'

export type HeadCoachFamilyClub = {
  club_id: string
  club_name: string
  team_label: TeamLabel
}

export type HeadCoachRosterRider = {
  club_id: string
  rider_id: string
  first_name?: string | null
  last_name?: string | null
  display_name: string | null
  assigned_role: string | null
  age_years: number | null
  overall: number | null
  availability_status: 'fit' | 'not_fully_fit' | 'injured' | 'sick'
  fatigue: number | null
  source_club_name?: string
  team_label?: TeamLabel
}

export type HeadCoachEffectivePlan = {
  club_id: string
  rider_id: string
  plan_date: string
  focus_code: string
  intensity: RegularTrainingIntensity
  source_type: 'head_coach' | 'u23_head_coach' | 'manual_override'
  status: 'planned' | 'consumed'
}

export type HeadCoachAutomationSnapshot = {
  enabledByClubId: Record<string, boolean>
  todayPlanByRiderId: Record<string, HeadCoachEffectivePlan>
}

type CoachOption = {
  id: string
  club_id: string
  staff_name: string
  role_type: 'head_coach' | 'u23_head_coach'
  team_scope: 'first_team' | 'u23' | 'all'
  specialization: string | null
  expertise: number
  efficiency: number
  potential: number
  experience: number
  leadership: number
  loyalty: number
  is_active: boolean
}

type DailyPlan = {
  id: string
  plan_date: string
  focus_code: string | null
  intensity: RegularTrainingIntensity | null
  source_type: DailyPlanSource
  status: 'planned' | 'consumed' | 'skipped' | 'superseded'
}

type DashboardRider = {
  rider_id: string
  days: DailyPlan[]
}

type AutomationSetting = {
  club_id: string
  manager_staff_id: string | null
  manager_role: 'head_coach' | 'u23_head_coach'
  is_enabled: boolean
  planning_mode: 'rolling_daily'
  horizon_days: number
  last_generated_game_date: string | null
  last_generated_through: string | null
}

type DashboardManager = {
  id: string
  club_id: string
  staff_name: string
  role_type: string
  team_scope: string
  specialization: string | null
  expertise: number
  efficiency: number
  potential: number
  experience: number
  leadership: number
  loyalty: number
  is_active: boolean
}

type CoachDashboard = {
  version: string
  club_id: string
  current_game_date: string
  through_date: string
  horizon_days: number
  setting: AutomationSetting | null
  manager: DashboardManager | null
  riders: DashboardRider[]
}

type HeadCoachTrainingPanelProps = {
  familyClubs: HeadCoachFamilyClub[]
  roster: HeadCoachRosterRider[]
  currentGameDate: string | null
  onMessage?: (message: string | null) => void
  onError?: (message: string | null) => void
  onAutomationStateChange?: (
    snapshot: HeadCoachAutomationSnapshot
  ) => void
}

function normalizeDashboard(value: unknown): CoachDashboard | null {
  if (!value) return null
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return null
  return row as CoachDashboard
}

function formatGameDate(dateValue: string | null | undefined): string {
  if (!dateValue) return '—'
  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function getExpectedRole(
  team: HeadCoachFamilyClub
): CoachOption['role_type'] {
  return team.team_label === 'U23'
    ? 'u23_head_coach'
    : 'head_coach'
}

function isCoachEligibleForTeam(
  coach: CoachOption,
  team: HeadCoachFamilyClub
): boolean {
  const expectedRole = getExpectedRole(team)

  if (
    coach.role_type !== expectedRole ||
    !coach.is_active
  ) {
    return false
  }

  if (team.team_label === 'U23') {
    return (
      coach.team_scope === 'u23' ||
      coach.team_scope === 'all'
    )
  }

  return (
    coach.team_scope === 'first_team' ||
    coach.team_scope === 'all'
  )
}

function buildAutomationSnapshot(
  familyClubs: HeadCoachFamilyClub[],
  dashboards: Record<string, CoachDashboard | null>,
  currentGameDate: string | null
): HeadCoachAutomationSnapshot {
  const enabledByClubId: Record<string, boolean> = {}
  const todayPlanByRiderId: Record<
    string,
    HeadCoachEffectivePlan
  > = {}

  familyClubs.forEach(team => {
    const dashboard = dashboards[team.club_id] ?? null
    const enabled = Boolean(dashboard?.setting?.is_enabled)
    enabledByClubId[team.club_id] = enabled

    if (!enabled) return

    const today =
      dashboard?.current_game_date?.slice(0, 10) ||
      currentGameDate?.slice(0, 10) ||
      null

    if (!today) return

    ;(dashboard?.riders ?? []).forEach(rider => {
      const plan = rider.days.find(
        day =>
          day.plan_date.slice(0, 10) === today &&
          (day.status === 'planned' ||
            day.status === 'consumed') &&
          (day.source_type === 'head_coach' ||
            day.source_type === 'u23_head_coach' ||
            day.source_type === 'manual_override') &&
          Boolean(day.focus_code) &&
          Boolean(day.intensity)
      )

      if (!plan?.focus_code || !plan.intensity) return

      todayPlanByRiderId[rider.rider_id] = {
        club_id: team.club_id,
        rider_id: rider.rider_id,
        plan_date: plan.plan_date.slice(0, 10),
        focus_code: plan.focus_code,
        intensity: plan.intensity,
        source_type: plan.source_type as HeadCoachEffectivePlan['source_type'],
        status: plan.status as HeadCoachEffectivePlan['status']
      }
    })
  })

  return {
    enabledByClubId,
    todayPlanByRiderId
  }
}

function InformationModal({
  onClose
}: {
  onClose: () => void
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Head Coach Training Management
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Automatic regular training without an extra planning screen
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50"
            aria-label="Close Head Coach information"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 px-6 py-5 text-sm text-slate-700">
          <section>
            <h4 className="font-semibold text-slate-900">
              What happens when automation is enabled
            </h4>
            <p className="mt-1">
              The Head Coach privately prepares a rolling plan for Today,
              Tomorrow and Day +2. The separate forecast table is intentionally
              not shown to managers. Today&apos;s selected focus and intensity
              appear in the normal Rider Overrides section and in the rider
              profile training area.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">
              Normal manager workflow
            </h4>
            <p className="mt-1">
              Continue using the existing Rider Overrides controls or the rider
              profile. When Head Coach automation is active, saving a rider
              change creates an override for the current game day only. The
              coach automatically resumes control on the next game day.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">
              Rolling recalculation
            </h4>
            <p className="mt-1">
              After every game day, Tomorrow becomes Today and a new Day +2 is
              added. The plan is recalculated after fatigue, health, morale,
              races, training camps and staff availability are updated.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">
              Decision quality
            </h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="font-medium">Training</span> controls focus
                selection and session precision.
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="font-medium">Recovery Planning</span> controls
                fatigue-aware intensity and rest decisions.
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="font-medium">Youth Development</span> improves
                planning for riders aged 23 or younger.
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="font-medium">Experience and Leadership</span>{' '}
                improve role awareness, consistency and calendar planning.
              </div>
            </div>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">
              Priority and safety rules
            </h4>
            <p className="mt-1">
              Races, active camps, existing daily activity, injuries, sickness
              and training-blocking medical cases take priority. A coach on a
              course or another assignment may have reduced or zero
              availability.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">
              When automation is disabled
            </h4>
            <p className="mt-1">
              The existing Team Defaults and persistent Rider Overrides control
              regular training exactly as before.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function HeadCoachTrainingPanel({
  familyClubs,
  roster,
  currentGameDate,
  onMessage,
  onError,
  onAutomationStateChange
}: HeadCoachTrainingPanelProps): JSX.Element {
  const [dashboards, setDashboards] = useState<
    Record<string, CoachDashboard | null>
  >({})
  const [coaches, setCoaches] = useState<CoachOption[]>([])
  const [selectedCoachByClub, setSelectedCoachByClub] =
    useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyClubId, setBusyClubId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showInformation, setShowInformation] = useState(false)

  const familyClubIds = useMemo(
    () => familyClubs.map(team => team.club_id),
    [familyClubs]
  )

  async function loadHeadCoachData(): Promise<void> {
    if (familyClubs.length === 0) {
      setDashboards({})
      setCoaches([])
      onAutomationStateChange?.({
        enabledByClubId: {},
        todayPlanByRiderId: {}
      })
      return
    }

    setLoading(true)

    try {
      const [dashboardResults, staffResult] =
        await Promise.all([
          Promise.all(
            familyClubs.map(async team => {
              const { data, error } = await supabase.rpc(
                'get_regular_training_coach_dashboard_v1',
                {
                  p_club_id: team.club_id
                }
              )

              if (error) throw error

              return {
                clubId: team.club_id,
                dashboard: normalizeDashboard(data)
              }
            })
          ),
          supabase
            .from('club_staff')
            .select(
              `
              id,
              club_id,
              staff_name,
              role_type,
              team_scope,
              specialization,
              expertise,
              efficiency,
              potential,
              experience,
              leadership,
              loyalty,
              is_active
            `
            )
            .in('club_id', familyClubIds)
            .in('role_type', [
              'head_coach',
              'u23_head_coach'
            ])
            .eq('is_active', true)
        ])

      if (staffResult.error) throw staffResult.error

      const nextDashboards = Object.fromEntries(
        dashboardResults.map(result => [
          result.clubId,
          result.dashboard
        ])
      ) as Record<string, CoachDashboard | null>

      const nextCoaches =
        (staffResult.data ?? []) as CoachOption[]

      setDashboards(nextDashboards)
      setCoaches(nextCoaches)

      onAutomationStateChange?.(
        buildAutomationSnapshot(
          familyClubs,
          nextDashboards,
          currentGameDate
        )
      )

      setSelectedCoachByClub(current => {
        const next = { ...current }

        familyClubs.forEach(team => {
          const dashboard = nextDashboards[team.club_id]
          const available = nextCoaches.filter(coach =>
            isCoachEligibleForTeam(coach, team)
          )
          const savedCoachId =
            dashboard?.setting?.manager_staff_id ?? null

          if (
            savedCoachId &&
            available.some(
              coach => coach.id === savedCoachId
            )
          ) {
            next[team.club_id] = savedCoachId
          } else if (
            !next[team.club_id] ||
            !available.some(
              coach =>
                coach.id === next[team.club_id]
            )
          ) {
            next[team.club_id] =
              available[0]?.id ?? ''
          }
        })

        return next
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load Head Coach training management.'
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadHeadCoachData()
    // The joined IDs are the stable load key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyClubIds.join('|'), currentGameDate])

  useEffect(() => {
    function handleRefresh(): void {
      void loadHeadCoachData()
    }

    window.addEventListener(
      'ppm:head-coach-training-refresh',
      handleRefresh
    )

    return () => {
      window.removeEventListener(
        'ppm:head-coach-training-refresh',
        handleRefresh
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyClubIds.join('|'), currentGameDate])

  async function setAutomation(
    team: HeadCoachFamilyClub,
    enabled: boolean
  ): Promise<void> {
    const managerStaffId =
      selectedCoachByClub[team.club_id] || null

    if (enabled && !managerStaffId) {
      onError?.(
        `Hire and select an active ${
          team.team_label === 'U23'
            ? 'U23 Head Coach'
            : 'Head Coach'
        } first.`
      )
      return
    }

    setBusyClubId(team.club_id)
    onError?.(null)
    onMessage?.(null)

    try {
      const { error } = await supabase.rpc(
        'set_regular_training_coach_automation_v1',
        {
          p_club_id: team.club_id,
          p_enabled: enabled,
          p_manager_staff_id: managerStaffId
        }
      )

      if (error) throw error

      await loadHeadCoachData()

      onMessage?.(
        enabled
          ? `${team.team_label} Head Coach management enabled. Today's assignments are now shown in Rider Overrides below.`
          : `${team.team_label} Head Coach management disabled. Team Defaults and persistent Rider Overrides are active again.`
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to change Head Coach automation.'
      onError?.(message)
    } finally {
      setBusyClubId(null)
    }
  }

  if (familyClubs.length === 0) {
    return <></>
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div
          className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${
            isExpanded ? 'mb-5' : ''
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900">
                Head Coach Management
              </h3>

              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800">
                Rolling 3 days
              </span>
            </div>

            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Enable automatic planning. Today&apos;s Head Coach decision is
              shown in Rider Overrides below; the future forecast remains
              internal.
            </p>

            {currentGameDate ? (
              <p className="mt-1 text-xs text-slate-500">
                Current game date:{' '}
                {formatGameDate(currentGameDate)}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setIsExpanded(current => !current)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={isExpanded}
              aria-controls="head-coach-management-content"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>

            <button
              type="button"
              onClick={() => void loadHeadCoachData()}
              disabled={loading || busyClubId != null}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={() => setShowInformation(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              aria-label="Head Coach management information"
              title="How Head Coach management works"
            >
              i
            </button>
          </div>
        </div>

        {isExpanded ? (
          <div
            id="head-coach-management-content"
            className="space-y-4"
          >
            {familyClubs.map(team => {
              const dashboard =
                dashboards[team.club_id] ?? null
              const setting = dashboard?.setting ?? null
              const enabled = Boolean(setting?.is_enabled)
              const eligibleCoaches = coaches.filter(coach =>
                isCoachEligibleForTeam(coach, team)
              )
              const selectedCoachId =
                selectedCoachByClub[team.club_id] ?? ''
              const selectedCoach =
                eligibleCoaches.find(
                  coach => coach.id === selectedCoachId
                ) ??
                dashboard?.manager ??
                null

              const ridersInTeam = roster.filter(
                rider => rider.club_id === team.club_id
              ).length

              return (
                <div
                  key={team.club_id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900">
                          {team.team_label}
                        </h4>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            enabled
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {enabled
                            ? 'Coach active'
                            : 'Manual fallback'}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-600">
                        {team.club_name} · Riders {ridersInTeam}
                      </p>

                      {selectedCoach ? (
                        <div className="mt-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-800">
                            {selectedCoach.staff_name}
                          </span>
                          {selectedCoach.specialization
                            ? ` · ${selectedCoach.specialization}`
                            : ''}
                          {' · '}
                          Training {selectedCoach.expertise} · Recovery{' '}
                          {selectedCoach.efficiency} · Youth{' '}
                          {selectedCoach.potential}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-amber-700">
                          No eligible{' '}
                          {team.team_label === 'U23'
                            ? 'U23 Head Coach'
                            : 'Head Coach'}{' '}
                          is currently available.
                        </div>
                      )}

                      <p className="mt-2 text-xs text-slate-500">
                        {enabled
                          ? 'Head Coach choices are reflected in the standard rider training controls below.'
                          : 'Existing Team Defaults and Rider Overrides control this team.'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="block min-w-[250px]">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                          Manager
                        </span>

                        <select
                          value={selectedCoachId}
                          disabled={
                            enabled ||
                            busyClubId === team.club_id ||
                            eligibleCoaches.length === 0
                          }
                          onChange={event =>
                            setSelectedCoachByClub(current => ({
                              ...current,
                              [team.club_id]:
                                event.target.value
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          {eligibleCoaches.length === 0 ? (
                            <option value="">
                              No eligible coach
                            </option>
                          ) : null}

                          {eligibleCoaches.map(coach => (
                            <option
                              key={coach.id}
                              value={coach.id}
                            >
                              {coach.staff_name}
                              {coach.specialization
                                ? ` · ${coach.specialization}`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          void setAutomation(team, !enabled)
                        }
                        disabled={
                          busyClubId === team.club_id ||
                          (!enabled && !selectedCoachId)
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                          enabled
                            ? 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {busyClubId === team.club_id
                          ? 'Saving…'
                          : enabled
                            ? 'Disable'
                            : 'Enable'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      {showInformation ? (
        <InformationModal
          onClose={() => setShowInformation(false)}
        />
      ) : null}
    </>
  )
}
