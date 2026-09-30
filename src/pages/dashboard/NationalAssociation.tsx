import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type AssociationData = {
  eligible: boolean
  reason?: string
  country_code?: string
  club_id?: string
  club_name?: string
  association_exists?: boolean
  association_id?: string
  association_name?: string
  association_status?: string
  is_member?: boolean
  membership_id?: string | null
  member_count?: number
  minimum_members?: number
  activation_coin_target?: number
  activation_coin_contributed?: number
  activation_coin_remaining?: number
  my_activation_coin_contribution?: number
  coin_balance?: number
  activation_ready?: boolean
  coach?: {
    term_id: string
    user_id: string
    club_id?: string | null
    club_name?: string | null
    season_number: number
    term_kind: string
    starts_on?: string | null
    ends_on?: string | null
  } | null
}

type OverallRange = {
  min: number
  max: number
}

type CoachRider = {
  rider_id: string
  rider_name: string
  country_code: string
  role?: string | null
  age_years?: number | null
  club_id?: string | null
  club_name?: string | null
  availability_status?: string | null
  fatigue?: number | null
  national_rank?: number | null
  overall_range?: OverallRange | null
  national_championship?: {
    is_current_champion?: boolean
    final_rank?: number | null
  } | null
}

type CoachDashboard = {
  allowed: boolean
  season_number: number
  current_game_date: string
  riders?: CoachRider[]
}

type Callup = {
  callup_id: string
  rider_id: string
  rider_name: string
  club_id?: string | null
  club_name?: string | null
  status: string
  sent_on?: string | null
  response_deadline?: string | null
  responded_on?: string | null
  can_respond?: boolean
}

type CoachCallupData = {
  allowed: boolean
  association_id?: string
  season_number?: number
  cycle_key?: string
  callups?: Callup[]
  squad?: {
    squad_id: string
    status: string
    squad_size: number
    confirmed_on?: string | null
    duty_start_date?: string | null
    duty_end_date?: string | null
    members?: Array<{
      rider_id: string
      rider_name: string
      club_id?: string | null
      club_name?: string | null
      squad_role?: string | null
    }>
  } | null
}

type Lineup = {
  lineup_id: string
  race_day: number
  race_type: string
  status: string
  submitted_on?: string | null
  riders: Array<{
    rider_id: string
    rider_name: string
    club_name?: string | null
  }>
}

type LineupData = {
  allowed: boolean
  squad_id?: string
  lineups?: Lineup[]
}

type NationsCycle = {
  state: string
  cycle_key?: string | null
  round_label?: string | null
  group_label?: string | null
  day1_date?: string | null
  day2_date?: string | null
  day3_date?: string | null
}

type OverviewEvent = {
  event_type: string
  event_date: string
  label: string
  status?: string | null
}

type OverviewData = {
  available: boolean
  association_exists?: boolean
  season_number?: number
  current_game_date?: string
  stats?: {
    member_count?: number
    active_callups?: number
    selected_riders?: number
    national_champion?: string | null
    last_world_nations_rank?: number | null
    last_world_nations_points?: number | null
  }
  upcoming_events?: OverviewEvent[]
  current_squad?: {
    squad_id: string
    cycle_key: string
    status: string
    squad_size: number
    confirmed_on?: string | null
    duty_start_date?: string | null
    duty_end_date?: string | null
    members?: Array<{
      rider_id: string
      rider_name: string
      club_id?: string | null
      club_name?: string | null
      squad_role?: string | null
    }>
  } | null
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatGameDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function statusClasses(status?: string | null): string {
  if (status === 'active' || status === 'completed' || status === 'accepted' || status === 'auto_accepted') {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (status === 'forming' || status === 'pending' || status === 'confirmed' || status === 'on_duty') {
    return 'bg-amber-100 text-amber-800'
  }
  if (status === 'inactive' || status === 'declined' || status === 'expired') {
    return 'bg-rose-100 text-rose-700'
  }
  return 'bg-slate-100 text-slate-700'
}

export default function NationalAssociationPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const location = useLocation()
  const requestedCycleKey = useMemo(() => {
    const requested = new URLSearchParams(location.search).get('cycle')?.trim()
    return requested || null
  }, [location.search])

  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null)
  const [nationsCycle, setNationsCycle] = useState<NationsCycle | null>(null)
  const [coachCallups, setCoachCallups] = useState<CoachCallupData | null>(null)
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [lineupData, setLineupData] = useState<LineupData | null>(null)
  const [lineupDrafts, setLineupDrafts] = useState<Record<number, string[]>>({})
  const [selectedSquad, setSelectedSquad] = useState<string[]>([])
  const [riderSearch, setRiderSearch] = useState('')
  const [coinContributionInput, setCoinContributionInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const detectedCycleKey =
    nationsCycle?.state === 'active_cycle' ? nationsCycle.cycle_key ?? null : null
  const cycleKey = requestedCycleKey || detectedCycleKey || 'season_main'
  const isNationsCycle = cycleKey.startsWith('nations:')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, overviewResponse, dashboardResponse, myCallupsResponse, cycleResponse] =
        await Promise.all([
          supabase.rpc('get_my_national_association_v1'),
          supabase.rpc('get_my_national_association_overview_v1'),
          supabase.rpc('get_national_coach_dashboard_v1'),
          supabase.rpc('get_my_national_team_callups_v1'),
          supabase.rpc('get_my_current_nations_cycle_v1'),
        ])

      if (associationResponse.error) throw associationResponse.error
      if (overviewResponse.error) throw overviewResponse.error
      if (dashboardResponse.error) throw dashboardResponse.error
      if (myCallupsResponse.error) throw myCallupsResponse.error
      if (cycleResponse.error) throw cycleResponse.error

      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      const nextOverview = (overviewResponse.data ?? null) as OverviewData | null
      const nextDashboard = (dashboardResponse.data ?? null) as CoachDashboard | null
      const nextMyCallups = (myCallupsResponse.data ?? []) as Callup[]
      const nextCycle = (cycleResponse.data ?? null) as NationsCycle | null
      const resolvedCycleKey =
        requestedCycleKey ||
        (nextCycle?.state === 'active_cycle' ? nextCycle.cycle_key ?? null : null) ||
        'season_main'

      setAssociation(nextAssociation)
      setOverview(nextOverview)
      setDashboard(nextDashboard)
      setMyCallups(nextMyCallups)
      setNationsCycle(nextCycle)

      const coachCallupsResponse = await supabase.rpc('get_my_national_coach_callups_v1', {
        p_cycle_key: resolvedCycleKey,
      })
      if (coachCallupsResponse.error) throw coachCallupsResponse.error

      const nextCoachCallups = (coachCallupsResponse.data ?? null) as CoachCallupData | null
      setCoachCallups(nextCoachCallups)

      if (nextCoachCallups?.squad?.members?.length) {
        setSelectedSquad(nextCoachCallups.squad.members.map(member => member.rider_id))
      } else {
        setSelectedSquad([])
      }

      if (nextCoachCallups?.squad?.squad_id) {
        const lineupResponse = await supabase.rpc('get_my_national_team_lineups_v1', {
          p_squad_id: nextCoachCallups.squad.squad_id,
        })
        if (lineupResponse.error) throw lineupResponse.error
        const nextLineups = (lineupResponse.data ?? null) as LineupData | null
        setLineupData(nextLineups)

        const drafts: Record<number, string[]> = {}
        for (const lineup of nextLineups?.lineups ?? []) {
          drafts[lineup.race_day] = lineup.riders.map(rider => rider.rider_id)
        }
        setLineupDrafts(drafts)
      } else {
        setLineupData(null)
        setLineupDrafts({})
      }
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCycleKey])

  const perform = async (key: string, action: () => Promise<void>): Promise<void> => {
    try {
      setBusyKey(key)
      setMessage(null)
      setError(null)
      await action()
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusyKey(null)
    }
  }

  const joinAssociation = async (): Promise<void> => {
    await perform('join', async () => {
      const { error: rpcError } = await supabase.rpc('join_my_national_association_v1')
      if (rpcError) throw rpcError
      setMessage(t('association.messages.joined'))
    })
  }

  const leaveAssociation = async (): Promise<void> => {
    await perform('leave', async () => {
      const { error: rpcError } = await supabase.rpc('leave_my_national_association_v1')
      if (rpcError) throw rpcError
      setMessage(t('association.messages.left'))
    })
  }

  const contributeActivationCoins = async (amount: number): Promise<void> => {
    const requested = Math.floor(Number(amount))
    if (!Number.isFinite(requested) || requested <= 0) return

    await perform('contribute-coins', async () => {
      const { data, error: rpcError } = await supabase.rpc(
        'contribute_national_association_activation_coins_v1',
        { p_amount: requested },
      )
      if (rpcError) throw rpcError

      const appliedAmount = Number((data as any)?.applied_amount ?? 0)
      setCoinContributionInput('')
      window.dispatchEvent(new Event('coin-balance-changed'))
      setMessage(
        appliedAmount > 0
          ? t('association.activation.message', { amount: appliedAmount })
          : t('association.activation.alreadyFunded'),
      )
    })
  }

  const respondCallup = async (callup: Callup, accept: boolean): Promise<void> => {
    await perform(`respond:${callup.callup_id}`, async () => {
      const { error: rpcError } = await supabase.rpc('respond_to_national_team_callup_v1', {
        p_callup_id: callup.callup_id,
        p_accept: accept,
        p_note: null,
      })
      if (rpcError) throw rpcError
      setMessage(
        accept
          ? t('association.messages.callupAccepted', { rider: callup.rider_name })
          : t('association.messages.callupDeclined', { rider: callup.rider_name }),
      )
    })
  }

  const sendCallup = async (rider: CoachRider): Promise<void> => {
    await perform(`callup:${rider.rider_id}`, async () => {
      const { error: rpcError } = await supabase.rpc('send_national_team_callup_v1', {
        p_rider_id: rider.rider_id,
        p_cycle_key: cycleKey,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.calledUp', { rider: rider.rider_name }))
    })
  }

  const confirmSquad = async (): Promise<void> => {
    await perform('confirm-squad', async () => {
      const { error: rpcError } = await supabase.rpc('confirm_national_team_squad_v1', {
        p_cycle_key: cycleKey,
        p_rider_ids: selectedSquad,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.squadConfirmed'))
    })
  }

  const submitLineup = async (raceDay: number): Promise<void> => {
    const squadId = coachCallups?.squad?.squad_id
    const riderIds = lineupDrafts[raceDay] ?? []
    if (!squadId) return

    await perform(`lineup:${raceDay}`, async () => {
      const { error: rpcError } = await supabase.rpc('submit_national_team_lineup_v1', {
        p_squad_id: squadId,
        p_race_day: raceDay,
        p_rider_ids: riderIds,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.lineupConfirmed', { day: raceDay }))
    })
  }

  const acceptedRiderIds = useMemo(
    () =>
      new Set(
        (coachCallups?.callups ?? [])
          .filter(callup => callup.status === 'accepted' || callup.status === 'auto_accepted')
          .map(callup => callup.rider_id),
      ),
    [coachCallups],
  )

  const existingCallupByRider = useMemo(
    () => new Map((coachCallups?.callups ?? []).map(callup => [callup.rider_id, callup])),
    [coachCallups],
  )

  const filteredRiders = useMemo(() => {
    const search = riderSearch.trim().toLowerCase()
    const riders = dashboard?.riders ?? []
    if (!search) return riders

    return riders.filter(rider =>
      [rider.rider_name, rider.club_name, rider.role]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(search)),
    )
  }, [dashboard?.riders, riderSearch])

  const isCoach = dashboard?.allowed === true
  const currentSquad = overview?.current_squad
  const upcomingEvents = overview?.upcoming_events ?? []

  if (loading && !association) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('association.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <NationalAssociationHeader
        association={association}
        isCoach={isCoach}
        loading={loading}
        onRefresh={() => void load()}
      />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {!association?.eligible ? (
        <section className="rounded bg-white p-5 shadow">
          <h3 className="text-base font-semibold text-slate-900">
            {t('association.ineligibleTitle')}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{t('association.ineligibleText')}</p>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded bg-white shadow">
            <div className="grid gap-px bg-slate-200 md:grid-cols-4">
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.summary.association')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {association.association_exists
                    ? t(`status.${association.association_status}`, {
                        defaultValue: humanize(association.association_status),
                      })
                    : t('common.notCreated')}
                </div>
                {association.association_status ? (
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(association.association_status)}`}>
                    {t(`status.${association.association_status}`, {
                      defaultValue: humanize(association.association_status),
                    })}
                  </span>
                ) : null}
              </div>

              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.summary.members')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {association.member_count ?? 0} / {association.minimum_members ?? 5}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('association.summary.membersHint')}
                </p>
              </div>

              <div className="bg-white p-4 md:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.activation.title')}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {association.activation_coin_contributed ?? 0} / {association.activation_coin_target ?? 50} {t('association.activation.coins')}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{t('association.activation.remaining')}</div>
                    <strong className="text-sm text-slate-900">
                      {association.activation_coin_remaining ?? association.activation_coin_target ?? 50} {t('association.activation.coins')}
                    </strong>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-yellow-400"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((association.activation_coin_contributed ?? 0) /
                            Math.max(association.activation_coin_target ?? 50, 1)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>

                {(association.activation_coin_remaining ?? 0) > 0 && association.is_member ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {[1, 5, 10].map(amount => (
                      <button
                        key={amount}
                        type="button"
                        disabled={
                          busyKey === 'contribute-coins' ||
                          amount > (association.coin_balance ?? 0)
                        }
                        onClick={() => void contributeActivationCoins(amount)}
                        className="rounded bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        +{amount}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={Math.max(association.activation_coin_remaining ?? 1, 1)}
                      value={coinContributionInput}
                      onChange={event => setCoinContributionInput(event.target.value)}
                      placeholder={t('association.activation.custom')}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500"
                    />
                    <button
                      type="button"
                      disabled={
                        busyKey === 'contribute-coins' ||
                        !coinContributionInput ||
                        Number(coinContributionInput) <= 0 ||
                        Number(coinContributionInput) > (association.coin_balance ?? 0)
                      }
                      onClick={() => void contributeActivationCoins(Number(coinContributionInput))}
                      className="rounded bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-300 disabled:opacity-40"
                    >
                      {t('association.activation.giveCoins')}
                    </button>
                    <span className="text-xs text-slate-500">
                      {t('association.activation.balanceShort', {
                        balance: association.coin_balance ?? 0,
                      })}
                    </span>
                  </div>
                ) : (association.activation_coin_remaining ?? 0) <= 0 ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700">
                    {t('association.activation.funded')}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    {t('association.activation.joinFirst')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4">
              <p className="text-xs leading-5 text-slate-500">
                {t('association.activation.requirements', {
                  members: association.minimum_members ?? 5,
                  coins: association.activation_coin_target ?? 50,
                })}
              </p>

              {!association.is_member ? (
                <button
                  type="button"
                  disabled={busyKey === 'join'}
                  onClick={() => void joinAssociation()}
                  className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                >
                  {busyKey === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('association.join')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyKey === 'leave'}
                  onClick={() => void leaveAssociation()}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('association.leave')}
                </button>
              )}
            </div>
          </section>

          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('association.dashboard.eyebrow')}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {t('association.dashboard.title')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('association.dashboard.description')}
              </p>
            </div>

            <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.dashboard.season')}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {overview?.season_number ?? dashboard?.season_number ?? '—'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatGameDate(overview?.current_game_date ?? dashboard?.current_game_date)}
                </div>
              </div>
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.dashboard.activeCallups')}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {overview?.stats?.active_callups ?? 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('association.dashboard.activeCallupsHelp')}
                </div>
              </div>
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.dashboard.selectedRiders')}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {overview?.stats?.selected_riders ?? 0} / 10
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {currentSquad?.status
                    ? t(`status.${currentSquad.status}`, { defaultValue: humanize(currentSquad.status) })
                    : t('association.dashboard.noSquad')}
                </div>
              </div>
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.dashboard.lastWorldNations')}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {overview?.stats?.last_world_nations_rank
                    ? `#${overview.stats.last_world_nations_rank}`
                    : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {overview?.stats?.last_world_nations_points
                    ? t('association.dashboard.points', {
                        points: overview.stats.last_world_nations_points,
                      })
                    : t('association.dashboard.noWorldResult')}
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-4 xl:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-slate-900">
                    {t('association.dashboard.upcomingEvents')}
                  </h4>
                  <Link
                    to="/dashboard/national-association/world-nations"
                    className="text-xs font-semibold text-yellow-700 hover:underline"
                  >
                    {t('association.dashboard.openWorldNations')}
                  </Link>
                </div>

                <div className="mt-3 space-y-2">
                  {upcomingEvents.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {t('association.dashboard.noUpcomingEvents')}
                    </div>
                  ) : (
                    upcomingEvents.map(event => (
                      <div
                        key={`${event.event_type}:${event.event_date}`}
                        className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 p-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {t(`association.dashboard.event.${event.event_type}`, {
                              defaultValue: event.label,
                            })}
                          </div>
                          {event.status ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {humanize(event.status)}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold text-slate-700">
                          {formatGameDate(event.event_date)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-slate-900">
                    {t('association.dashboard.currentSelection')}
                  </h4>
                  {isCoach ? (
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-900">
                      {t('association.userStatus.nationalCoach')}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3">
                  {!currentSquad?.members?.length ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {t('association.dashboard.noCurrentSelection')}
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {currentSquad.members.map((member, index) => (
                        <div
                          key={member.rider_id}
                          className="rounded border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <div className="text-xs font-semibold text-slate-400">
                            #{index + 1}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-slate-900">
                            {member.rider_name}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {member.club_name ?? t('common.freeAgent')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {myCallups.length > 0 ? (
            <section className="rounded bg-white shadow">
              <div className="border-b border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">
                  {t('association.dashboard.yourCallups')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('association.dashboard.yourCallupsHelp')}
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {myCallups.map(callup => (
                  <div key={callup.callup_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="font-semibold text-slate-900">{callup.rider_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {callup.club_name ?? t('common.freeAgent')} · {t('common.deadline')} {formatGameDate(callup.response_deadline)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(callup.status)}`}>
                        {t(`status.${callup.status}`, { defaultValue: humanize(callup.status) })}
                      </span>
                      {callup.can_respond ? (
                        <>
                          <button
                            type="button"
                            disabled={busyKey === `respond:${callup.callup_id}`}
                            onClick={() => void respondCallup(callup, true)}
                            className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {t('common.accept')}
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `respond:${callup.callup_id}`}
                            onClick={() => void respondCallup(callup, false)}
                            className="rounded border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {t('common.decline')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {isCoach ? (
            <details className="group rounded bg-white shadow" open>
              <summary className="cursor-pointer list-none border-b border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.dashboard.coachWorkspaceEyebrow')}
                    </div>
                    <h3 className="mt-1 font-semibold text-slate-900">
                      {t('association.workspace.title')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {isNationsCycle
                        ? t('association.workspace.nationsCycleNotice')
                        : t('association.workspace.maskedOverall')}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-yellow-700">
                    {t('association.dashboard.expandCollapse')}
                  </span>
                </div>
              </summary>

              {isNationsCycle && nationsCycle?.state === 'active_cycle' ? (
                <div className="border-b border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                        {t('association.workspace.currentAssignment')}
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {nationsCycle.round_label ?? t('association.navWorldNations')} · {nationsCycle.group_label ?? '—'}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {formatGameDate(nationsCycle.day1_date)} · {formatGameDate(nationsCycle.day2_date)} · {formatGameDate(nationsCycle.day3_date)}
                      </div>
                    </div>
                    <Link
                      to="/dashboard/national-association/world-nations"
                      className="rounded border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                    >
                      {t('association.workspace.openWorldNations')}
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {t('association.workspace.eligibleRiders')}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      {t('association.workspace.eligibleHelp')}
                    </p>
                  </div>
                  <input
                    value={riderSearch}
                    onChange={event => setRiderSearch(event.target.value)}
                    placeholder={t('association.workspace.searchPlaceholder')}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-500 md:w-72"
                  />
                </div>

                <div className="overflow-x-auto rounded border border-slate-200">
                  <table className="min-w-[940px] w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">{t('common.rank')}</th>
                        <th className="px-3 py-2.5">{t('common.rider')}</th>
                        <th className="px-3 py-2.5">{t('common.club')}</th>
                        <th className="px-3 py-2.5">{t('common.overall')}</th>
                        <th className="px-3 py-2.5">{t('common.availability')}</th>
                        <th className="px-3 py-2.5">{t('association.workspace.callup')}</th>
                        <th className="px-3 py-2.5">{t('association.workspace.final10')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRiders.map(rider => {
                        const callup = existingCallupByRider.get(rider.rider_id)
                        const accepted = acceptedRiderIds.has(rider.rider_id)
                        const selected = selectedSquad.includes(rider.rider_id)

                        return (
                          <tr key={rider.rider_id} className="bg-white">
                            <td className="px-3 py-3 font-semibold text-slate-700">
                              {rider.national_rank ? `#${rider.national_rank}` : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <Link
                                to={`/dashboard/external-riders/${rider.rider_id}`}
                                className="font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
                              >
                                {rider.rider_name}
                              </Link>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {humanize(rider.role)} · {t('common.yearsShort', { years: rider.age_years ?? '—' })}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {rider.club_name ?? t('common.freeAgent')}
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-900">
                              {rider.overall_range
                                ? `${rider.overall_range.min}–${rider.overall_range.max}`
                                : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(rider.availability_status === 'fit' ? 'active' : 'inactive')}`}>
                                {t(`status.${rider.availability_status}`, {
                                  defaultValue: humanize(rider.availability_status),
                                })}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {callup ? (
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(callup.status)}`}>
                                  {t(`status.${callup.status}`, {
                                    defaultValue: humanize(callup.status),
                                  })}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyKey === `callup:${rider.rider_id}`}
                                  onClick={() => void sendCallup(rider)}
                                  className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                  {t('association.workspace.callUp')}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!accepted || Boolean(coachCallups?.squad)}
                                onChange={event => {
                                  setSelectedSquad(current => {
                                    if (event.target.checked) {
                                      if (current.length >= 10) return current
                                      return [...current, rider.rider_id]
                                    }
                                    return current.filter(id => id !== rider.rider_id)
                                  })
                                }}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {!coachCallups?.squad ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm text-slate-600">
                      {t('association.workspace.currentSelection')} <strong>{selectedSquad.length}/10</strong>
                    </div>
                    <button
                      type="button"
                      disabled={busyKey === 'confirm-squad' || selectedSquad.length !== 10}
                      onClick={() => void confirmSquad()}
                      className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {busyKey === 'confirm-squad' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('association.workspace.confirmFinalTen')}
                    </button>
                  </div>
                ) : null}
              </div>

              {coachCallups?.squad?.squad_id ? (
                <div className="border-t border-slate-200 p-4">
                  <h4 className="font-semibold text-slate-900">
                    {t('association.lineups.title')}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.lineups.description')}
                  </p>

                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    {[
                      [1, t('raceTypes.teamTimeTrial')],
                      [2, t('raceTypes.flatRoadRace')],
                      [3, t('raceTypes.hillyMountainRoadRace')],
                    ].map(([dayValue, label]) => {
                      const day = Number(dayValue)
                      const selected = lineupDrafts[day] ?? []
                      const saved = (lineupData?.lineups ?? []).find(lineup => lineup.race_day === day)

                      return (
                        <div key={day} className="rounded border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('common.raceDay', { day })}
                              </div>
                              <div className="mt-1 font-semibold text-slate-900">{label}</div>
                            </div>
                            {saved ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                                {t('common.confirmed')}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 space-y-2">
                            {(coachCallups.squad?.members ?? []).map(member => {
                              const checked = selected.includes(member.rider_id)
                              return (
                                <label
                                  key={member.rider_id}
                                  className="flex cursor-pointer items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-slate-900">
                                    {member.rider_name}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={event => {
                                      setLineupDrafts(current => {
                                        const existing = current[day] ?? []
                                        if (event.target.checked) {
                                          if (existing.length >= 7) return current
                                          return { ...current, [day]: [...existing, member.rider_id] }
                                        }
                                        return {
                                          ...current,
                                          [day]: existing.filter(id => id !== member.rider_id),
                                        }
                                      })
                                    }}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                </label>
                              )
                            })}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-600">
                              {t('common.riderCount', { count: selected.length, total: 7 })}
                            </span>
                            <button
                              type="button"
                              disabled={busyKey === `lineup:${day}` || selected.length !== 7}
                              onClick={() => void submitLineup(day)}
                              className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {t('common.confirm')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </details>
          ) : null}

          <details className="rounded border border-slate-200 bg-white shadow">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('association.guide.eyebrow')}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {t('association.guide.title')}
                  </h3>
                </div>
                <span className="text-sm font-semibold text-yellow-700">
                  {t('association.guide.expand')}
                </span>
              </div>
            </summary>

            <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['activation', t('association.guide.activationTitle'), t('association.guide.activationText')],
                ['elections', t('association.guide.electionsTitle'), t('association.guide.electionsText')],
                ['selection', t('association.guide.selectionTitle'), t('association.guide.selectionText')],
                ['package', t('association.guide.packageTitle'), t('association.guide.packageText')],
                ['worldNations', t('association.guide.worldNationsTitle'), t('association.guide.worldNationsText')],
                ['chatHistory', t('association.guide.chatHistoryTitle'), t('association.guide.chatHistoryText')],
              ].map(([key, title, body]) => (
                <div key={key} className="rounded border border-slate-200 bg-slate-50 p-4">
                  <h4 className="font-semibold text-slate-900">{title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
