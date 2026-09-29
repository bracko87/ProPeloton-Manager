import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Bike,
  Check,
  CheckCircle2,
  Flag,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type OverallRange = {
  min?: number | null
  max?: number | null
}

type ChampionshipRiderState = {
  is_current_champion?: boolean
  final_rank?: number | null
  qualification_rank?: number | null
  final_status?: string | null
  qualification_status?: string | null
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
  national_weighted_points?: number | null
  overall_range?: OverallRange | null
  national_championship?: ChampionshipRiderState | null
}

type StandardEquipment = {
  equipment_category: string
  specialization: 'flat' | 'mountain' | 'time_trial' | string
  display_name: string
  tier?: number | null
  quality_score?: number | null
}

type StandardAsset = {
  asset_key: string
  asset_level: number
  quantity: number
}

type StandardSupply = {
  supply_key: string
  display_name: string
  quantity: number
}

type CoachDashboard = {
  allowed: boolean
  reason?: string
  season_number?: number
  current_game_date?: string
  association?: {
    id: string
    name: string
    country_code: string
    country_name?: string | null
  } | null
  coach?: {
    term_id: string
    term_kind: string
    club_id: string
    club_name?: string | null
    starts_on: string
    ends_on: string
  } | null
  national_championship?: {
    edition_id: string
    status: string
    qualification_date?: string | null
    final_date?: string | null
    champion_rider_id?: string | null
    champion_name?: string | null
    ranking_frozen?: boolean
  } | null
  standard_package?: {
    cost_model: string
    has_treasury: boolean
    staff: string[]
    equipment: StandardEquipment[]
    assets: StandardAsset[]
    supplies: StandardSupply[]
  } | null
  riders?: CoachRider[]
}

type CallupRow = {
  callup_id: string
  rider_id: string
  rider_name: string
  club_id?: string | null
  club_name?: string | null
  status: string
  sent_on?: string | null
  response_deadline?: string | null
  responded_on?: string | null
}

type SquadMember = {
  rider_id: string
  rider_name: string
  club_id?: string | null
  club_name?: string | null
  squad_role?: string
}

type CoachCallups = {
  allowed: boolean
  association_id?: string
  season_number?: number
  cycle_key?: string
  callups: CallupRow[]
  squad?: {
    squad_id: string
    status: string
    squad_size: number
    confirmed_on?: string | null
    duty_start_date?: string | null
    duty_end_date?: string | null
    members: SquadMember[]
  } | null
}

type ClubCallupRow = CallupRow & {
  association_id: string
  association_name: string
  country_code: string
  season_number: number
  cycle_key: string
  can_respond?: boolean
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
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

function callupBadge(status: string): string {
  if (status === 'accepted' || status === 'auto_accepted') {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'declined' || status === 'expired') {
    return 'bg-red-100 text-red-800'
  }
  return 'bg-slate-100 text-slate-700'
}

export default function NationalTeamPage(): JSX.Element {
  const { t } = useTranslation('nationalRanking')
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null)
  const [coachCallups, setCoachCallups] = useState<CoachCallups | null>(null)
  const [clubCallups, setClubCallups] = useState<ClubCallupRow[]>([])
  const [selectedRiders, setSelectedRiders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadPage = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const [dashboardResponse, clubResponse] = await Promise.all([
        supabase.rpc('get_national_coach_dashboard_v1'),
        supabase.rpc('get_my_national_team_callups_v1'),
      ])

      if (dashboardResponse.error) throw dashboardResponse.error
      if (clubResponse.error) throw clubResponse.error

      const nextDashboard = (dashboardResponse.data ?? null) as CoachDashboard | null
      const nextClubCallups = Array.isArray(clubResponse.data)
        ? (clubResponse.data as ClubCallupRow[])
        : []

      setDashboard(nextDashboard)
      setClubCallups(nextClubCallups)

      if (nextDashboard?.allowed) {
        const callupsResponse = await supabase.rpc(
          'get_my_national_coach_callups_v1',
          { p_cycle_key: 'season_main' },
        )
        if (callupsResponse.error) throw callupsResponse.error

        const nextCallups = (callupsResponse.data ?? null) as CoachCallups | null
        setCoachCallups(nextCallups)

        if (nextCallups?.squad?.members?.length) {
          setSelectedRiders(
            nextCallups.squad.members.map(member => member.rider_id),
          )
        } else {
          setSelectedRiders(previous =>
            previous.filter(riderId =>
              (nextCallups?.callups ?? []).some(
                callup =>
                  callup.rider_id === riderId &&
                  ['accepted', 'auto_accepted'].includes(callup.status),
              ),
            ),
          )
        }
      } else {
        setCoachCallups(null)
        setSelectedRiders([])
      }
    } catch (caught: any) {
      setError(caught?.message ?? t('nationalTeamPage.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const runAction = async (
    key: string,
    action: () => Promise<{ error: any }>,
    successMessage: string,
  ): Promise<void> => {
    try {
      setActionKey(key)
      setError(null)
      setMessage(null)
      const response = await action()
      if (response.error) throw response.error
      setMessage(successMessage)
      await loadPage()
    } catch (caught: any) {
      setError(caught?.message ?? t('nationalTeamPage.errors.action'))
    } finally {
      setActionKey(null)
    }
  }

  const callupByRider = useMemo(
    () =>
      new Map(
        (coachCallups?.callups ?? []).map(callup => [
          callup.rider_id,
          callup,
        ]),
      ),
    [coachCallups?.callups],
  )

  const acceptedCallups = useMemo(
    () =>
      (coachCallups?.callups ?? []).filter(callup =>
        ['accepted', 'auto_accepted'].includes(callup.status),
      ),
    [coachCallups?.callups],
  )

  const sendCallup = (rider: CoachRider): Promise<void> =>
    runAction(
      `callup:${rider.rider_id}`,
      () =>
        supabase.rpc('send_national_team_callup_v1', {
          p_rider_id: rider.rider_id,
          p_cycle_key: 'season_main',
        }),
      t('nationalTeamPage.messages.callupSent', { rider: rider.rider_name }),
    )

  const respondCallup = (
    callup: ClubCallupRow,
    accept: boolean,
  ): Promise<void> =>
    runAction(
      `respond:${callup.callup_id}`,
      () =>
        supabase.rpc('respond_to_national_team_callup_v1', {
          p_callup_id: callup.callup_id,
          p_accept: accept,
          p_note: null,
        }),
      accept
        ? t('nationalTeamPage.messages.callupAccepted', {
            rider: callup.rider_name,
          })
        : t('nationalTeamPage.messages.callupDeclined', {
            rider: callup.rider_name,
          }),
    )

  const toggleSquadRider = (riderId: string): void => {
    setSelectedRiders(previous => {
      if (previous.includes(riderId)) {
        return previous.filter(id => id !== riderId)
      }
      if (previous.length >= 10) return previous
      return [...previous, riderId]
    })
  }

  const confirmSquad = (): Promise<void> =>
    runAction(
      'confirm-squad',
      () =>
        supabase.rpc('confirm_national_team_squad_v1', {
          p_cycle_key: 'season_main',
          p_rider_ids: selectedRiders,
        }),
      t('nationalTeamPage.messages.squadConfirmed'),
    )

  const flag = flagUrl(dashboard?.association?.country_code)

  if (loading && !dashboard) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('nationalTeamPage.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {flag ? (
                <img
                  src={flag}
                  alt={dashboard?.association?.country_code ?? ''}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Flag className="h-7 w-7 text-slate-500" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                {t('nationalTeamPage.eyebrow')}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                {dashboard?.association?.country_name
                  ? t('nationalTeamPage.title', {
                      country: dashboard.association.country_name,
                    })
                  : t('nationalTeamPage.titleFallback')}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t('nationalTeamPage.description')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadPage()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('nationalTeamPage.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {clubCallups.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            {t('nationalTeamPage.clubCallups.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('nationalTeamPage.clubCallups.description')}
          </p>
          <div className="mt-4 space-y-3">
            {clubCallups.map(callup => (
              <div
                key={callup.callup_id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="font-bold text-slate-950">{callup.rider_name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {callup.association_name}
                    {callup.response_deadline
                      ? ` · ${t('nationalTeamPage.clubCallups.deadline', {
                          date: formatGameDate(callup.response_deadline),
                        })}`
                      : ''}
                  </div>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${callupBadge(callup.status)}`}>
                    {t(`nationalTeamPage.callupStatus.${callup.status}`, {
                      defaultValue: callup.status,
                    })}
                  </span>
                </div>

                {callup.can_respond ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={actionKey === `respond:${callup.callup_id}`}
                      onClick={() => void respondCallup(callup, true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      {t('nationalTeamPage.clubCallups.accept')}
                    </button>
                    <button
                      type="button"
                      disabled={actionKey === `respond:${callup.callup_id}`}
                      onClick={() => void respondCallup(callup, false)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t('nationalTeamPage.clubCallups.decline')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {dashboard?.allowed ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('nationalTeamPage.cards.coach')}
              </div>
              <div className="mt-2 text-lg font-bold text-slate-950">
                {dashboard.coach?.club_name ?? '—'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {dashboard.coach?.term_kind ?? ''}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('nationalTeamPage.cards.callups')}
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {coachCallups?.callups?.length ?? 0} / 15
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t('nationalTeamPage.cards.accepted', {
                  count: acceptedCallups.length,
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('nationalTeamPage.cards.squad')}
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {coachCallups?.squad?.members?.length ?? selectedRiders.length} / 10
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {coachCallups?.squad?.status
                  ? t(`nationalTeamPage.squadStatus.${coachCallups.squad.status}`, {
                      defaultValue: coachCallups.squad.status,
                    })
                  : t('nationalTeamPage.cards.notConfirmed')}
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {t('nationalTeamPage.riders.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t('nationalTeamPage.riders.description')}
                </p>
              </div>
              <div className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                {t('nationalTeamPage.riders.maskedOverall')}
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.rank')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.rider')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.club')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.overall')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.form')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.fatigue')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.nc')}</th>
                    <th className="px-3 py-3">{t('nationalTeamPage.riders.callup')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(dashboard.riders ?? []).map(rider => {
                    const callup = callupByRider.get(rider.rider_id)
                    const isUnavailable =
                      rider.availability_status &&
                      rider.availability_status !== 'fit'
                    return (
                      <tr key={rider.rider_id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold text-slate-700">
                          {rider.national_rank ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-950">
                            {rider.rider_name}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {rider.role ?? '—'} · {rider.age_years ?? '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {rider.club_name ?? t('nationalTeamPage.riders.freeAgent')}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-bold text-slate-950">
                            {rider.overall_range?.min ?? '—'}–{rider.overall_range?.max ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {rider.race_sharpness != null
                            ? Math.round(Number(rider.race_sharpness))
                            : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className={Number(rider.fatigue ?? 0) >= 70 ? 'font-semibold text-red-700' : 'text-slate-600'}>
                            {rider.fatigue ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {rider.national_championship?.is_current_champion
                            ? t('nationalTeamPage.riders.champion')
                            : rider.national_championship?.final_rank
                              ? t('nationalTeamPage.riders.finalRank', {
                                  rank: rider.national_championship.final_rank,
                                })
                              : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {callup ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${callupBadge(callup.status)}`}>
                              {t(`nationalTeamPage.callupStatus.${callup.status}`, {
                                defaultValue: callup.status,
                              })}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                Boolean(isUnavailable) ||
                                actionKey === `callup:${rider.rider_id}`
                              }
                              onClick={() => void sendCallup(rider)}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {actionKey === `callup:${rider.rider_id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Flag className="h-3.5 w-3.5" />
                              )}
                              {t('nationalTeamPage.riders.sendCallup')}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {t('nationalTeamPage.squad.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t('nationalTeamPage.squad.description')}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
                {selectedRiders.length} / 10
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {acceptedCallups.map(callup => {
                const checked = selectedRiders.includes(callup.rider_id)
                return (
                  <button
                    type="button"
                    key={callup.callup_id}
                    onClick={() => toggleSquadRider(callup.rider_id)}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
                      checked
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-950">
                        {callup.rider_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {callup.club_name ?? '—'}
                      </div>
                    </div>
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                      checked
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 text-transparent'
                    }`}>
                      <Check className="h-4 w-4" />
                    </div>
                  </button>
                )
              })}
            </div>

            {acceptedCallups.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                {t('nationalTeamPage.squad.noAccepted')}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={
                  selectedRiders.length !== 10 ||
                  actionKey === 'confirm-squad'
                }
                onClick={() => void confirmSquad()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {actionKey === 'confirm-squad' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {t('nationalTeamPage.squad.confirm')}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">
                {t('nationalTeamPage.package.title')}
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {t('nationalTeamPage.package.description')}
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Bike className="h-4 w-4" />
                  {t('nationalTeamPage.package.equipment')}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {(dashboard.standard_package?.equipment ?? []).map(item => (
                    <div key={`${item.equipment_category}:${item.specialization}`}>
                      <span className="font-semibold text-slate-800">
                        {item.equipment_category} · {item.specialization}:
                      </span>{' '}
                      {item.display_name}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4" />
                  {t('nationalTeamPage.package.assets')}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {(dashboard.standard_package?.assets ?? []).map(asset => (
                    <div key={asset.asset_key}>
                      {asset.quantity} × {asset.asset_key} · {t('nationalTeamPage.package.level', {
                        level: asset.asset_level,
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-bold text-slate-900">
                  {t('nationalTeamPage.package.supplies')}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {(dashboard.standard_package?.supplies ?? []).map(supply => (
                    <div key={supply.supply_key}>
                      {supply.quantity} × {supply.display_name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-500" />
            <div>
              <h2 className="font-bold text-slate-950">
                {t('nationalTeamPage.notCoach.title')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t('nationalTeamPage.notCoach.body')}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
