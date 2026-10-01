import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'
import NationalAssociationCustomization from '../../components/nations/NationalAssociationCustomization'

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
  renewal_coin_target?: number
  renewal_paid_through_season?: number | null
  renewal_target_season?: number | null
  renewal_coin_contributed?: number
  renewal_coin_remaining?: number
  my_renewal_coin_contribution?: number
  renewal_window_open?: boolean
  renewal_window_opens_on?: string | null
  renewal_deadline?: string | null
  association_valid_until?: string | null
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

type OverviewSquad = {
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
}

type OverviewLineup = {
  lineup_id: string
  status: string
  race_day: number
  race_type: string
  riders?: Array<{
    rider_id: string
    rider_name: string
    club_id?: string | null
    club_name?: string | null
    squad_role?: string | null
  }>
}

type OverviewEvent = {
  event_id: string
  event_type: string
  event_date: string
  race_day?: number | null
  race_type?: string | null
  round_label?: string | null
  group_label?: string | null
  cycle_key?: string | null
  label: string
  status?: string | null
  lineup?: OverviewLineup | null
  squad?: OverviewSquad | null
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
  const [renewalContributionInput, setRenewalContributionInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedOverviewEventId, setSelectedOverviewEventId] = useState<string | null>(null)

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
          supabase.rpc('get_my_national_association_overview_v2'),
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

  const contributeRenewalCoins = async (amount: number): Promise<void> => {
    const requested = Math.floor(Number(amount))
    if (!Number.isFinite(requested) || requested <= 0) return

    await perform('contribute-renewal-coins', async () => {
      const { data, error: rpcError } = await supabase.rpc(
        'contribute_national_association_renewal_coins_v1',
        { p_amount: requested },
      )
      if (rpcError) throw rpcError

      const appliedAmount = Number((data as any)?.applied_amount ?? 0)
      setRenewalContributionInput('')
      window.dispatchEvent(new Event('coin-balance-changed'))
      setMessage(
        appliedAmount > 0
          ? t('association.renewal.message', { amount: appliedAmount })
          : t('association.renewal.alreadyFunded'),
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
  const upcomingEvents = overview?.upcoming_events ?? []
  const selectedOverviewEvent =
    upcomingEvents.find(event => event.event_id === selectedOverviewEventId) ??
    upcomingEvents[0] ??
    null
  const selectedEventLineup = selectedOverviewEvent?.lineup ?? null
  const selectedEventMembers = selectedEventLineup?.riders ?? []

  const overviewEventGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string
        roundLabel: string
        groupLabel: string
        events: OverviewEvent[]
      }
    >()

    for (const event of upcomingEvents) {
      const key =
        event.cycle_key ||
        `${event.round_label ?? 'World Nations'}:${event.group_label ?? 'National Team'}`
      const existing = groups.get(key)
      if (existing) {
        existing.events.push(event)
      } else {
        groups.set(key, {
          key,
          roundLabel: event.round_label ?? 'World Nations',
          groupLabel: event.group_label ?? 'National Team',
          events: [event],
        })
      }
    }

    return Array.from(groups.values())
      .map(group => ({
        ...group,
        events: [...group.events].sort(
          (a, b) =>
            (a.race_day ?? 99) - (b.race_day ?? 99) ||
            a.event_date.localeCompare(b.event_date),
        ),
      }))
      .sort((a, b) =>
        (a.events[0]?.event_date ?? '').localeCompare(b.events[0]?.event_date ?? ''),
      )
  }, [upcomingEvents])

  useEffect(() => {
    if (!upcomingEvents.length) {
      setSelectedOverviewEventId(null)
      return
    }
    if (!selectedOverviewEventId || !upcomingEvents.some(event => event.event_id === selectedOverviewEventId)) {
      setSelectedOverviewEventId(upcomingEvents[0].event_id)
    }
  }, [selectedOverviewEventId, upcomingEvents])

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
                  <div className="mt-3 space-y-3">
                    <p className="text-xs font-semibold text-emerald-700">
                      {t('association.activation.funded')}
                    </p>

                    {association.association_valid_until ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            {t('association.renewal.validityTitle')}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-emerald-950">
                            {t('association.renewal.validUntil', {
                              date: formatGameDate(association.association_valid_until),
                              season: association.renewal_target_season ?? '—',
                            })}
                          </div>
                        </div>
                        <div className="text-right text-xs text-emerald-800">
                          {t('association.renewal.cost', {
                            coins: association.renewal_coin_target ?? 30,
                          })}
                        </div>
                      </div>
                    ) : null}

                    {association.renewal_window_open ? (
                      <div className="rounded border border-amber-200 bg-amber-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                              {t('association.renewal.title', {
                                season: association.renewal_target_season ?? '—',
                              })}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {association.renewal_coin_contributed ?? 0} / {association.renewal_coin_target ?? 30} {t('association.activation.coins')}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {t('association.renewal.deadline', {
                                date: formatGameDate(association.renewal_deadline),
                              })}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            {t('association.activation.remaining')}
                            <div className="mt-0.5 text-sm font-semibold text-slate-900">
                              {association.renewal_coin_remaining ?? association.renewal_coin_target ?? 30} {t('association.activation.coins')}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                          <div
                            className="h-full rounded-full bg-yellow-400"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  ((association.renewal_coin_contributed ?? 0) /
                                    Math.max(association.renewal_coin_target ?? 30, 1)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>

                        {(association.renewal_coin_remaining ?? 0) > 0 && association.is_member ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {[1, 5, 10].map(amount => (
                              <button
                                key={amount}
                                type="button"
                                disabled={
                                  busyKey === 'contribute-renewal-coins' ||
                                  amount > (association.coin_balance ?? 0)
                                }
                                onClick={() => void contributeRenewalCoins(amount)}
                                className="rounded bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                              >
                                +{amount}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={1}
                              max={Math.max(association.renewal_coin_remaining ?? 1, 1)}
                              value={renewalContributionInput}
                              onChange={event => setRenewalContributionInput(event.target.value)}
                              placeholder={t('association.activation.custom')}
                              className="w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500"
                            />
                            <button
                              type="button"
                              disabled={
                                busyKey === 'contribute-renewal-coins' ||
                                !renewalContributionInput ||
                                Number(renewalContributionInput) <= 0 ||
                                Number(renewalContributionInput) > (association.coin_balance ?? 0)
                              }
                              onClick={() => void contributeRenewalCoins(Number(renewalContributionInput))}
                              className="rounded bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-300 disabled:opacity-40"
                            >
                              {t('association.renewal.renew')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : association.renewal_window_opens_on ? (
                      <p className="text-xs text-slate-500">
                        {t('association.renewal.opens', {
                          date: formatGameDate(association.renewal_window_opens_on),
                          season: association.renewal_target_season ?? '—',
                        })}
                      </p>
                    ) : null}
                  </div>
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
                  {selectedEventMembers.length} / 7
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedOverviewEvent
                    ? selectedOverviewEvent.label
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

                <div className="mt-3 space-y-3">
                  {overviewEventGroups.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {t('association.dashboard.noUpcomingEvents')}
                    </div>
                  ) : (
                    overviewEventGroups.map(group => (
                      <div
                        key={group.key}
                        className="overflow-hidden rounded border border-slate-200 bg-white"
                      >
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-sm font-semibold text-slate-900">
                            {group.roundLabel} · {group.groupLabel}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {group.events.length} scheduled race day{group.events.length === 1 ? '' : 's'}
                          </div>
                        </div>

                        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
                          {group.events.map(event => {
                            const selected =
                              selectedOverviewEvent?.event_id === event.event_id
                            return (
                              <div
                                key={event.event_id}
                                className={[
                                  'min-w-0 bg-white px-3 py-3',
                                  selected ? 'ring-2 ring-inset ring-yellow-400' : '',
                                ].join(' ')}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedOverviewEventId(event.event_id)}
                                  className="w-full text-left"
                                >
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Day {event.race_day ?? '—'} · {humanize(event.race_type)}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-slate-900">
                                      {formatGameDate(event.event_date)}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-medium text-slate-500">
                                      Season {overview?.season_number ?? dashboard?.season_number ?? '—'}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(event.status)}`}>
                                      {event.status ? humanize(event.status) : 'Scheduled'}
                                    </span>
                                  </div>
                                </button>

                                <Link
                                  to={`/dashboard/national-association/world-nations/events/${event.event_id}`}
                                  className="mt-2 inline-flex rounded-lg bg-yellow-400 px-2.5 py-1.5 text-[11px] font-semibold text-black shadow-sm hover:bg-yellow-300"
                                >
                                  Open race page
                                </Link>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      Selected riders
                    </h4>
                    {selectedOverviewEvent ? (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {selectedOverviewEvent.label}
                      </div>
                    ) : null}
                  </div>
                  {isCoach ? (
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-900">
                      {t('association.userStatus.nationalCoach')}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3">
                  {!selectedOverviewEvent ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      No upcoming World Nations race is assigned to this National Team.
                    </div>
                  ) : !selectedEventMembers.length ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      No 7-rider lineup has been submitted for this race yet.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedEventMembers.map((member, index) => (
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

          <NationalAssociationCustomization />

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
            <section className="rounded bg-white p-4 shadow">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('association.dashboard.coachWorkspaceEyebrow')}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {t('association.squad.selectedTenTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.dashboard.squadMovedHelp')}
                  </p>
                </div>
                <Link
                  to="/dashboard/national-association/squad"
                  className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300"
                >
                  {t('association.dashboard.openSquad')}
                </Link>
              </div>
            </section>
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
                ['membership', t('association.guide.membershipTitle'), t('association.guide.membershipText')],
                ['activation', t('association.guide.activationTitle'), t('association.guide.activationText')],
                ['elections', t('association.guide.electionsTitle'), t('association.guide.electionsText')],
                ['selection', t('association.guide.selectionTitle'), t('association.guide.selectionText')],
                ['equipment', t('association.guide.equipmentTitle'), t('association.guide.equipmentText')],
                ['competition', t('association.guide.competitionTitle'), t('association.guide.competitionText')],
                ['chat', t('association.guide.chatTitle'), t('association.guide.chatText')],
                ['history', t('association.guide.historyTitle'), t('association.guide.historyText')],
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
