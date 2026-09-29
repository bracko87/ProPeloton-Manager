import React, { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Bike,
  CalendarDays,
  CheckCircle2,
  Flag,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
  Vote,
  XCircle,
} from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

type Candidate = {
  candidate_id: string
  club_id?: string | null
  club_name?: string | null
  manifesto?: string | null
  status: string
  is_me?: boolean
  in_current_round?: boolean
}

type Election = {
  id: string
  season_number: number
  kind: string
  status: string
  registration_open_date?: string | null
  registration_close_date?: string | null
  round1_open_date?: string | null
  round1_close_date?: string | null
  current_round: number
  current_round_open_date?: string | null
  current_round_close_date?: string | null
  runoff_registration_open?: boolean
  winning_candidate_id?: string | null
  my_candidate_id?: string | null
  my_vote_candidate_id?: string | null
  candidates: Candidate[]
}

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
  has_treasury?: boolean
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
  election?: Election | null
}

type OverallRange = {
  min: number
  max: number
}

type CoachRider = {
  rider_id: string
  rider_name: string
  image_url?: string | null
  country_code: string
  role?: string | null
  age_years?: number | null
  club_id?: string | null
  club_name?: string | null
  club_is_ai?: boolean
  availability_status?: string | null
  fatigue?: number | null
  race_sharpness?: number | null
  last_raced_on?: string | null
  race_days_last_14?: number | null
  season_points?: number | null
  national_rank?: number | null
  national_raw_points?: number | null
  national_weighted_points?: number | null
  latest_ranked_result_date?: string | null
  overall_range?: OverallRange | null
  national_championship?: {
    is_current_champion?: boolean
    final_rank?: number | null
    qualification_rank?: number | null
    final_status?: string | null
    qualification_status?: string | null
  } | null
}

type StandardEquipment = {
  equipment_category: string
  specialization: string
  model_count: number
  catalog_item_id?: string | null
  display_name?: string | null
  tier?: number | null
  quality_score?: number | null
}

type StandardAsset = {
  asset_key: string
  asset_level: number
  quantity: number
  usage_note?: string | null
}

type StandardSupply = {
  supply_key: string
  display_name: string
  quantity: number
  replenishment_scope: string
}

type StandardPackage = {
  assets?: StandardAsset[]
  equipment?: StandardEquipment[]
  supplies?: StandardSupply[]
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

type CoachDashboard = {
  allowed: boolean
  reason?: string
  season_number: number
  current_game_date: string
  association?: {
    id: string
    name: string
    country_code: string
    country_name: string
  }
  coach?: {
    term_id: string
    term_kind: string
    club_id?: string | null
    club_name?: string | null
    starts_on?: string | null
    ends_on?: string | null
  }
  national_championship?: {
    edition_id: string
    status: string
    qualification_date?: string | null
    final_date?: string | null
    champion_rider_id?: string | null
    champion_name?: string | null
    ranking_frozen?: boolean
  } | null
  standard_package?: StandardPackage
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
  association_name?: string
  country_code?: string
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

type NationsCycle = {
  state: string
  association_id?: string | null
  edition_id?: string | null
  entry_id?: string | null
  entry_status?: string | null
  season_number?: number | null
  current_game_date?: string | null
  cycle_key?: string | null
  round_id?: string | null
  round_index?: number | null
  round_type?: string | null
  round_label?: string | null
  round_status?: string | null
  group_id?: string | null
  group_number?: number | null
  group_label?: string | null
  group_status?: string | null
  group_entry_id?: string | null
  group_entry_status?: string | null
  start_date?: string | null
  end_date?: string | null
  day1_date?: string | null
  day2_date?: string | null
  day3_date?: string | null
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
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
  if (status === 'forming' || status === 'candidate_registration' || status === 'voting' || status === 'runoff' || status === 'pending') {
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
  const [nationsCycle, setNationsCycle] = useState<NationsCycle | null>(null)
  const detectedCycleKey =
    nationsCycle?.state === 'active_cycle' ? nationsCycle.cycle_key ?? null : null
  const cycleKey = requestedCycleKey || detectedCycleKey || 'season_main'
  const isNationsCycle = cycleKey.startsWith('nations:')

  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null)
  const [coachCallups, setCoachCallups] = useState<CoachCallupData | null>(null)
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [standardPackage, setStandardPackage] = useState<StandardPackage | null>(null)
  const [lineupData, setLineupData] = useState<LineupData | null>(null)
  const [lineupDrafts, setLineupDrafts] = useState<Record<number, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [manifesto, setManifesto] = useState('')
  const [selectedSquad, setSelectedSquad] = useState<string[]>([])
  const [riderSearch, setRiderSearch] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const associationResponse = await supabase.rpc('get_my_national_association_v1')
      if (associationResponse.error) throw associationResponse.error
      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      setAssociation(nextAssociation)

      const [dashboardResponse, myCallupsResponse, packageResponse, cycleResponse] = await Promise.all([
        supabase.rpc('get_national_coach_dashboard_v1'),
        supabase.rpc('get_my_national_team_callups_v1'),
        supabase.rpc('get_national_team_standard_package_v1'),
        supabase.rpc('get_my_current_nations_cycle_v1'),
      ])

      if (dashboardResponse.error) throw dashboardResponse.error
      if (myCallupsResponse.error) throw myCallupsResponse.error
      if (packageResponse.error) throw packageResponse.error
      if (cycleResponse.error) throw cycleResponse.error

      const nextDashboard = (dashboardResponse.data ?? null) as CoachDashboard | null
      const nextMyCallups = (myCallupsResponse.data ?? []) as Callup[]
      const nextPackage = (packageResponse.data ?? null) as StandardPackage | null
      const nextCycle = (cycleResponse.data ?? null) as NationsCycle | null
      const resolvedCycleKey =
        requestedCycleKey ||
        (nextCycle?.state === 'active_cycle' ? nextCycle.cycle_key ?? null : null) ||
        'season_main'

      setNationsCycle(nextCycle)

      const coachCallupsResponse = await supabase.rpc('get_my_national_coach_callups_v1', {
        p_cycle_key: resolvedCycleKey,
      })
      if (coachCallupsResponse.error) throw coachCallupsResponse.error

      const nextCoachCallups = (coachCallupsResponse.data ?? null) as CoachCallupData | null

      setDashboard(nextDashboard)
      setCoachCallups(nextCoachCallups)
      setMyCallups(nextMyCallups)
      setStandardPackage(nextPackage)

      if (nextCoachCallups?.squad?.members?.length) {
        setSelectedSquad(nextCoachCallups.squad.members.map(member => member.rider_id))
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

  const syncElection = async (): Promise<void> => {
    await perform('sync-election', async () => {
      const { error: rpcError } = await supabase.rpc('sync_my_national_association_election_v1')
      if (rpcError) throw rpcError
      setMessage(t('association.messages.electionUpdated'))
    })
  }

  const registerCandidate = async (): Promise<void> => {
    const electionId = association?.election?.id
    if (!electionId) return

    await perform('candidate', async () => {
      const { error: rpcError } = await supabase.rpc('register_national_coach_candidate_v1', {
        p_election_id: electionId,
        p_manifesto: manifesto,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.candidatureRegistered'))
    })
  }

  const voteForCandidate = async (candidateId: string): Promise<void> => {
    const electionId = association?.election?.id
    if (!electionId) return

    await perform(`vote:${candidateId}`, async () => {
      const { error: rpcError } = await supabase.rpc('cast_national_coach_vote_v1', {
        p_election_id: electionId,
        p_candidate_id: candidateId,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.voteSubmitted'))
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
          ? `${callup.rider_name}'s National Team call-up was accepted.`
          : `${callup.rider_name}'s National Team call-up was declined.`,
      )
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
    () =>
      new Map(
        (coachCallups?.callups ?? []).map(callup => [callup.rider_id, callup]),
      ),
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

  const countryFlag = flagUrl(association?.country_code ?? dashboard?.association?.country_code)
  const election = association?.election ?? null
  const isCoach = dashboard?.allowed === true

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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          {countryFlag ? (
            <img
              src={countryFlag}
              alt={association?.country_code ?? t('common.country')}
              className="mt-0.5 h-9 w-14 rounded border border-slate-200 object-cover"
            />
          ) : (
            <div className="mt-0.5 flex h-9 w-14 items-center justify-center rounded border border-slate-200 bg-white">
              <Flag className="h-4 w-4 text-slate-500" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {association?.association_name ??
                (association?.country_code
                  ? t('association.countryTitle', { country: association.country_code })
                  : t('association.title'))}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t('association.subtitle')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                to="/dashboard/national-ranking"
                className="text-xs font-semibold text-yellow-700 hover:text-yellow-800 hover:underline"
              >
                {t('association.navRanking')}
              </Link>
              <span className="text-xs text-slate-300">•</span>
              <Link
                to="/dashboard/national-ranking?tab=history"
                className="text-xs font-semibold text-yellow-700 hover:text-yellow-800 hover:underline"
              >
                {t('association.navChampionshipHistory')}
              </Link>
              <span className="text-xs text-slate-300">•</span>
              <Link
                to="/dashboard/world-nations"
                className="text-xs font-semibold text-yellow-700 hover:text-yellow-800 hover:underline"
              >
                {t('association.navWorldNations')}
              </Link>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

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
          <h3 className="text-base font-semibold text-slate-900">{t('association.ineligibleTitle')}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {t('association.ineligibleText')}
          </p>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded bg-white shadow">
            <div className="grid gap-px bg-slate-200 md:grid-cols-4">
              <div className="bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ShieldCheck className="h-4 w-4" />
                  {t('association.summary.association')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {association.association_exists ? t(`status.${association.association_status}`, { defaultValue: humanize(association.association_status) }) : t('common.notCreated')}
                </div>
                {association.association_status ? (
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(association.association_status)}`}>
                    {t(`status.${association.association_status}`, { defaultValue: humanize(association.association_status) })}
                  </span>
                ) : null}
              </div>

              <div className="bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Users className="h-4 w-4" />
                  {t('association.summary.members')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {association.member_count ?? 0} / {association.minimum_members ?? 5}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('association.summary.membersHint')}
                </p>
              </div>

              <div className="bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <UserCheck className="h-4 w-4" />
                  {t('association.summary.coach')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {association.coach?.club_name ?? t('common.notElected')}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {association.coach
                    ? t('association.summary.coachSeason', { season: association.coach.season_number, term: humanize(association.coach.term_kind) })
                    : t('common.electionRequired')}
                </p>
              </div>

              <div className="bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Bike className="h-4 w-4" />
                  {t('association.summary.operations')}
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{t('association.summary.fullyCovered')}</div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('association.summary.operationsHint')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-4">
              {!association.is_member ? (
                <button
                  type="button"
                  disabled={busyKey === 'join'}
                  onClick={() => void joinAssociation()}
                  className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                >
                  {busyKey === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  {t('association.join')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyKey === 'leave'}
                  onClick={() => void leaveAssociation()}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('association.leave')}
                </button>
              )}
            </div>
          </section>

          {association.is_member && association.association_status === 'active' ? (
            <section className="rounded bg-white shadow">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Vote className="h-5 w-5 text-yellow-600" />
                    <h3 className="text-base font-semibold text-slate-900">{t('association.election.title')}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.election.schedule')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyKey === 'sync-election'}
                  onClick={() => void syncElection()}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyKey === 'sync-election' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('association.election.update')}
                </button>
              </div>

              {election ? (
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded border border-slate-200 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.status')}</div>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(election.status)}`}>
                        {humanize(election.status)}
                      </span>
                    </div>
                    <div className="rounded border border-slate-200 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.round')}</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{election.current_round}</div>
                    </div>
                    <div className="rounded border border-slate-200 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.currentWindow')}</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {formatGameDate(election.current_round_open_date)} – {formatGameDate(election.current_round_close_date)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.votingRule')}</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{t('association.election.oneMemberOneVote')}</div>
                    </div>
                  </div>

                  {election.status === 'candidate_registration' && !election.my_candidate_id ? (
                    <div className="rounded border border-yellow-200 bg-yellow-50 p-4">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-900">{t('association.election.manifesto')}</span>
                        <textarea
                          value={manifesto}
                          onChange={event => setManifesto(event.target.value)}
                          rows={4}
                          maxLength={1000}
                          className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                          placeholder={t('association.election.manifestoPlaceholder')}
                        />
                      </label>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={busyKey === 'candidate' || manifesto.trim().length < 10}
                          onClick={() => void registerCandidate()}
                          className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                        >
                          {busyKey === 'candidate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                          {t('association.election.submitCandidature')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    {(election.candidates ?? []).map(candidate => (
                      <div
                        key={candidate.candidate_id}
                        className={[
                          'rounded border p-4',
                          candidate.in_current_round === false
                            ? 'border-slate-200 bg-slate-50 opacity-60'
                            : 'border-slate-200 bg-white',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {candidate.club_name ?? t('common.candidate')}
                              {candidate.is_me ? ` · ${t('common.you')}` : ''}
                            </div>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                              {candidate.manifesto || t('association.election.noManifesto')}
                            </p>
                          </div>
                          {election.my_vote_candidate_id === candidate.candidate_id ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                          ) : null}
                        </div>

                        {(election.status === 'voting' || election.status === 'runoff') &&
                        candidate.in_current_round !== false &&
                        !election.my_vote_candidate_id ? (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              disabled={busyKey === `vote:${candidate.candidate_id}`}
                              onClick={() => void voteForCandidate(candidate.candidate_id)}
                              className="inline-flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {busyKey === `vote:${candidate.candidate_id}`
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Vote className="h-4 w-4" />}
                              {t('common.vote')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-500">
                  {t('association.election.none')}
                </div>
              )}
            </section>
          ) : null}

          {standardPackage ? (
            <section className="rounded bg-white shadow">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Bike className="h-5 w-5 text-yellow-600" />
                  <h3 className="text-base font-semibold text-slate-900">{t('association.package.title')}</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {t('association.package.description')}
                </p>
              </div>

              <div className="grid gap-4 p-4 xl:grid-cols-3">
                <div className="rounded border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">{t('association.package.assets')}</div>
                  <div className="mt-3 space-y-2">
                    {(standardPackage?.assets ?? []).map(asset => (
                      <div key={asset.asset_key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{humanize(asset.asset_key)}</span>
                        <span className="font-semibold text-slate-900">
                          {t('association.package.assetLevel', { quantity: asset.quantity, level: asset.asset_level })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-slate-200 p-4 xl:col-span-2">
                  <div className="text-sm font-semibold text-slate-900">{t('association.package.equipment')}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(standardPackage?.equipment ?? []).map(item => (
                      <div
                        key={`${item.equipment_category}:${item.specialization}`}
                        className="rounded bg-slate-50 px-3 py-2"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {humanize(item.equipment_category)} · {humanize(item.specialization)}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {item.display_name ?? t('common.standardModel')}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {t('association.package.tierQuality', { tier: item.tier ?? '—', quality: item.quality_score ?? '—' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">{t('association.package.supplies')}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {(standardPackage?.supplies ?? []).map(supply => (
                    <div key={supply.supply_key} className="rounded bg-slate-50 px-3 py-3">
                      <div className="text-sm font-medium text-slate-700">{supply.display_name}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{supply.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {myCallups.length > 0 ? (
            <section className="rounded bg-white shadow">
              <div className="border-b border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">{t('association.callups.title')}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('association.callups.description')}
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {myCallups.map(callup => (
                  <div key={callup.callup_id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{callup.rider_name}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {callup.association_name ?? t('association.callups.team')}
                        {callup.response_deadline ? ` · ${t('association.callups.replyBy', { date: formatGameDate(callup.response_deadline) })}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(callup.status)}`}>
                        {humanize(callup.status)}
                      </span>
                      {callup.can_respond ? (
                        <>
                          <button
                            type="button"
                            disabled={busyKey === `respond:${callup.callup_id}`}
                            onClick={() => void respondCallup(callup, true)}
                            className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {t('common.accept')}
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `respond:${callup.callup_id}`}
                            onClick={() => void respondCallup(callup, false)}
                            className="inline-flex items-center gap-1.5 rounded border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
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
            <section className="rounded bg-white shadow">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-600" />
                    <h3 className="text-base font-semibold text-slate-900">{t('association.workspace.title')}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.workspace.maskedOverall')}
                    {isNationsCycle ? ` ${t('association.workspace.nationsCycleNotice')}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isNationsCycle ? (
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                      {t('association.workspace.worldNationsEvent')}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                    Season {dashboard?.season_number}
                  </span>
                </div>
              </div>

              {isNationsCycle && nationsCycle?.state === 'active_cycle' ? (
                <div className="border-b border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                        {t('association.workspace.currentAssignment')}
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {nationsCycle.round_label ?? t('association.navWorldNations')} · {nationsCycle.group_label ?? t('common.group')}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Day 1 {formatGameDate(nationsCycle.day1_date)} · Day 2 {formatGameDate(nationsCycle.day2_date)} · Day 3 {formatGameDate(nationsCycle.day3_date)}
                      </div>
                    </div>
                    <Link
                      to="/dashboard/world-nations"
                      className="rounded border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                    >
                      {t('association.workspace.openWorldNations')}
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-3">
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('association.workspace.nationalChampionship')}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {dashboard?.national_championship?.champion_name ?? t('common.notCompleted')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {dashboard?.national_championship?.ranking_frozen ? t('association.workspace.rankingFrozen') : t('association.workspace.liveRanking')}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('association.workspace.provisionalCallups')}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {(coachCallups?.callups ?? []).filter(item => ['pending', 'accepted', 'auto_accepted'].includes(item.status)).length} / 15
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('association.workspace.finalSquad')}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {coachCallups?.squad?.members?.length ?? selectedSquad.length} / 10 riders
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900">{t('association.workspace.eligibleRiders')}</h4>
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
                  <table className="min-w-[1080px] w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">{t('common.rank')}</th>
                        <th className="px-3 py-2.5">{t('common.rider')}</th>
                        <th className="px-3 py-2.5">{t('common.club')}</th>
                        <th className="px-3 py-2.5">{t('common.overall')}</th>
                        <th className="px-3 py-2.5">{t('association.workspace.ncResult')}</th>
                        <th className="px-3 py-2.5">{t('common.fatigue')}</th>
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
                        const finalRank = rider.national_championship?.final_rank
                        const ncLabel = rider.national_championship?.is_current_champion
                          ? t('common.champion')
                          : finalRank
                            ? `#${finalRank}`
                            : '—'

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
                                {humanize(rider.role)} · {rider.age_years ?? '—'} yrs
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{rider.club_name ?? t('common.freeAgent')}</td>
                            <td className="px-3 py-3 font-semibold text-slate-900">
                              {rider.overall_range
                                ? `${rider.overall_range.min}–${rider.overall_range.max}`
                                : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className={rider.national_championship?.is_current_champion ? 'font-semibold text-yellow-700' : 'text-slate-600'}>
                                {ncLabel}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{rider.fatigue ?? '—'}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(rider.availability_status === 'fit' ? 'active' : 'inactive')}`}>
                                {humanize(rider.availability_status)}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {callup ? (
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(callup.status)}`}>
                                  {humanize(callup.status)}
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
                      {t('association.workspace.selectTenPrefix')} <strong>{t('association.workspace.tenAccepted')}</strong>. {t('association.workspace.currentSelection')} <strong>{selectedSquad.length}/10</strong>.
                    </div>
                    <button
                      type="button"
                      disabled={busyKey === 'confirm-squad' || selectedSquad.length !== 10}
                      onClick={() => void confirmSquad()}
                      className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {busyKey === 'confirm-squad' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {t('association.workspace.confirmFinalTen')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 font-semibold text-emerald-900">
                      <CheckCircle2 className="h-5 w-5" />
                      {t('association.workspace.squadConfirmed')}
                    </div>
                    <p className="mt-1 text-sm text-emerald-800">
                      {t('association.workspace.squadConfirmedCount', { count: coachCallups.squad.members?.length ?? 10 })}
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {isCoach && coachCallups?.squad?.squad_id ? (
            <section className="rounded bg-white shadow">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-yellow-600" />
                  <h3 className="text-base font-semibold text-slate-900">{t('association.lineups.title')}</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {t('association.lineups.description')}
                </p>
              </div>

              <div className="grid gap-4 p-4 xl:grid-cols-3">
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
                        {(coachCallups.squad.members ?? []).map(member => {
                          const checked = selected.includes(member.rider_id)
                          return (
                            <label
                              key={member.rider_id}
                              className="flex cursor-pointer items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-sm"
                            >
                              <span>
                                <span className="font-medium text-slate-900">{member.rider_name}</span>
                                <span className="ml-2 text-xs text-slate-500">{member.club_name ?? ''}</span>
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
                        <span className="text-sm text-slate-600">{t('common.riderCount', { count: selected.length, total: 7 })}</span>
                        <button
                          type="button"
                          disabled={busyKey === `lineup:${day}` || selected.length !== 7}
                          onClick={() => void submitLineup(day)}
                          className="inline-flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {busyKey === `lineup:${day}`
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <CheckCircle2 className="h-4 w-4" />}
                          {t('common.confirm')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {!isCoach && association.coach ? (
            <section className="rounded border border-slate-200 bg-white p-5 shadow">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-slate-600" />
                <h3 className="font-semibold text-slate-900">{t('association.coachAppointed')}</h3>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {t('association.coachAppointedHelp', { manager: association.coach.club_name ?? t('association.electedManager') })}
              </p>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
