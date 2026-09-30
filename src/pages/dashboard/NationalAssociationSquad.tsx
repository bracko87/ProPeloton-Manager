import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type AssociationData = {
  country_code?: string | null
  association_name?: string | null
  association_status?: string | null
  is_member?: boolean
  coach?: {
    club_name?: string | null
    user_id?: string | null
  } | null
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
  selected?: boolean
}

type SkillSet = {
  sprint?: number | null
  climbing?: number | null
  time_trial?: number | null
  endurance?: number | null
  flat?: number | null
  recovery?: number | null
  resistance?: number | null
  race_iq?: number | null
  teamwork?: number | null
}

type SelectionScores = {
  overall?: number | null
  flat?: number | null
  climbing?: number | null
  time_trial?: number | null
}

type Rider = {
  rider_id: string
  rider_name: string
  image_url?: string | null
  country_code?: string | null
  role?: string | null
  age_years?: number | null
  club_id?: string | null
  club_name?: string | null
  club_is_ai?: boolean
  availability_status?: string | null
  fatigue?: number | null
  season_points?: number | null
  season_points_sprint?: number | null
  season_points_climbing?: number | null
  national_rank?: number | null
  overall_range?: { min?: number | null; max?: number | null } | null
  skills?: SkillSet | null
  selection_scores?: SelectionScores | null
  race_condition?: {
    race_sharpness?: number | null
    last_raced_on?: string | null
    race_days_last_14?: number | null
  } | null
  selected?: boolean
}

type Workspace = {
  allowed: boolean
  reason?: string
  association_id?: string
  country_code?: string
  season_number?: number
  cycle_key?: string
  current_game_date?: string
  timeline?: {
    target_event_date?: string | null
    recommended_selection_lock_date?: string | null
    callup_response_days?: number | null
    response_deadline?: string | null
    final_squad_deadline?: string | null
  }
  selection?: {
    selection_id?: string
    status?: string
    selected_rider_ids?: string[]
    selected_count?: number
    locked_on?: string | null
    response_deadline?: string | null
    replacement_round?: number
  }
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
  riders?: Rider[]
}

type NationsCycle = {
  state?: string | null
  cycle_key?: string | null
  round_label?: string | null
  group_label?: string | null
}

type SortKey =
  | 'selection_score'
  | 'national_rank'
  | 'overall'
  | 'flat'
  | 'climbing'
  | 'time_trial'
  | 'sprint'
  | 'age'
  | 'season_points'

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

function statusClass(status?: string | null): string {
  if (['accepted', 'auto_accepted', 'ready_to_confirm', 'confirmed', 'active'].includes(status ?? '')) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (['pending', 'awaiting_responses', 'draft'].includes(status ?? '')) {
    return 'bg-amber-100 text-amber-800'
  }
  if (['declined', 'needs_replacement', 'expired'].includes(status ?? '')) {
    return 'bg-rose-100 text-rose-700'
  }
  return 'bg-slate-100 text-slate-700'
}

function numeric(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function riderSortValue(rider: Rider, key: SortKey): number {
  switch (key) {
    case 'national_rank':
      return rider.national_rank == null ? Number.POSITIVE_INFINITY : numeric(rider.national_rank)
    case 'overall':
      return (
        numeric(rider.overall_range?.min) +
        numeric(rider.overall_range?.max)
      ) / 2
    case 'flat':
      return numeric(rider.skills?.flat)
    case 'climbing':
      return numeric(rider.skills?.climbing)
    case 'time_trial':
      return numeric(rider.skills?.time_trial)
    case 'sprint':
      return numeric(rider.skills?.sprint)
    case 'age':
      return numeric(rider.age_years)
    case 'season_points':
      return numeric(rider.season_points)
    case 'selection_score':
    default:
      return numeric(rider.selection_scores?.overall)
  }
}

export default function NationalAssociationSquadPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const location = useLocation()
  const requestedCycleKey = useMemo(() => {
    const value = new URLSearchParams(location.search).get('cycle')?.trim()
    return value || null
  }, [location.search])

  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [cycle, setCycle] = useState<NationsCycle | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('selection_score')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const cycleKey =
    requestedCycleKey ||
    (cycle?.state === 'active_cycle' && cycle.cycle_key
      ? cycle.cycle_key
      : 'season_main')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, cycleResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_my_current_nations_cycle_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error
      if (cycleResponse.error) throw cycleResponse.error

      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      const nextCycle = (cycleResponse.data ?? null) as NationsCycle | null
      const resolvedCycle =
        requestedCycleKey ||
        (nextCycle?.state === 'active_cycle' && nextCycle.cycle_key
          ? nextCycle.cycle_key
          : 'season_main')

      const workspaceResponse = await supabase.rpc(
        'get_my_national_team_squad_workspace_v1',
        { p_cycle_key: resolvedCycle },
      )
      if (workspaceResponse.error) throw workspaceResponse.error

      const nextWorkspace = (workspaceResponse.data ?? null) as Workspace | null

      setAssociation(nextAssociation)
      setCycle(nextCycle)
      setWorkspace(nextWorkspace)
      setSelectedIds(nextWorkspace?.selection?.selected_rider_ids ?? [])
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

  const callupByRider = useMemo(
    () => new Map((workspace?.callups ?? []).map(callup => [callup.rider_id, callup])),
    [workspace?.callups],
  )

  const selectedRiders = useMemo(() => {
    const byId = new Map((workspace?.riders ?? []).map(rider => [rider.rider_id, rider]))
    return selectedIds.map(id => byId.get(id)).filter(Boolean) as Rider[]
  }, [selectedIds, workspace?.riders])

  const roles = useMemo(
    () =>
      Array.from(
        new Set(
          (workspace?.riders ?? [])
            .map(rider => rider.role)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [workspace?.riders],
  )

  const filteredRiders = useMemo(() => {
    const query = search.trim().toLowerCase()
    const minAge = ageMin ? Number(ageMin) : null
    const maxAge = ageMax ? Number(ageMax) : null

    const list = (workspace?.riders ?? []).filter(rider => {
      if (
        query &&
        ![rider.rider_name, rider.club_name, rider.role]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(query))
      ) {
        return false
      }

      if (roleFilter !== 'all' && rider.role !== roleFilter) return false
      if (
        availabilityFilter !== 'all' &&
        rider.availability_status !== availabilityFilter
      ) {
        return false
      }
      if (minAge != null && numeric(rider.age_years) < minAge) return false
      if (maxAge != null && numeric(rider.age_years) > maxAge) return false

      return true
    })

    return list.sort((a, b) => {
      const av = riderSortValue(a, sortKey)
      const bv = riderSortValue(b, sortKey)
      const direction = sortDirection === 'asc' ? 1 : -1

      if (sortKey === 'national_rank') {
        return (av - bv) * (sortDirection === 'asc' ? 1 : -1)
      }

      return (av - bv) * direction
    })
  }, [
    workspace?.riders,
    search,
    roleFilter,
    availabilityFilter,
    ageMin,
    ageMax,
    sortKey,
    sortDirection,
  ])

  const selectionStatus = workspace?.selection?.status ?? 'draft'
  const canEditDraft =
    selectionStatus === 'draft' || selectionStatus === 'needs_replacement'
  const canLock = canEditDraft && selectedIds.length === 10
  const canConfirm = selectionStatus === 'ready_to_confirm'

  const lockedRiderIds = useMemo(
    () =>
      new Set(
        (workspace?.callups ?? [])
          .filter(callup =>
            callup.selected &&
            ['accepted', 'auto_accepted', 'pending'].includes(callup.status),
          )
          .map(callup => callup.rider_id),
      ),
    [workspace?.callups],
  )

  const toggleRider = (riderId: string): void => {
    if (!canEditDraft) return

    const selected = selectedIds.includes(riderId)
    if (selected) {
      if (lockedRiderIds.has(riderId)) return
      setSelectedIds(current => current.filter(id => id !== riderId))
      return
    }

    if (selectedIds.length >= 10) return
    setSelectedIds(current => [...current, riderId])
  }

  const saveDraft = async (): Promise<void> => {
    try {
      setBusy('save')
      setError(null)
      setMessage(null)

      const response = await supabase.rpc('save_my_national_team_selection_draft_v1', {
        p_cycle_key: cycleKey,
        p_rider_ids: selectedIds,
      })
      if (response.error) throw response.error

      setMessage(t('association.squad.messages.draftSaved'))
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(null)
    }
  }

  const lockSelection = async (): Promise<void> => {
    if (selectedIds.length !== 10) return

    try {
      setBusy('lock')
      setError(null)
      setMessage(null)

      const saveResponse = await supabase.rpc(
        'save_my_national_team_selection_draft_v1',
        {
          p_cycle_key: cycleKey,
          p_rider_ids: selectedIds,
        },
      )
      if (saveResponse.error) throw saveResponse.error

      const lockResponse = await supabase.rpc('lock_my_national_team_selection_v1', {
        p_cycle_key: cycleKey,
      })
      if (lockResponse.error) throw lockResponse.error

      setMessage(t('association.squad.messages.locked'))
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(null)
    }
  }

  const confirmSquad = async (): Promise<void> => {
    try {
      setBusy('confirm')
      setError(null)
      setMessage(null)

      const response = await supabase.rpc('confirm_my_national_team_selection_v1', {
        p_cycle_key: cycleKey,
      })
      if (response.error) throw response.error

      setMessage(t('association.squad.messages.confirmed'))
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(null)
    }
  }

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

  const isCoach = workspace?.allowed === true

  return (
    <div className="w-full space-y-6">
      <NationalAssociationHeader
        association={association}
        isCoach={isCoach}
        loading={loading}
        onRefresh={() => void load()}
      />

      {!isCoach ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="font-semibold text-amber-950">
            {t('association.squad.coachOnlyTitle')}
          </h3>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {t('association.squad.coachOnlyText')}
          </p>
        </section>
      ) : (
        <>
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

          <section className="rounded bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('association.squad.timelineEyebrow')}
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {t('association.squad.timelineTitle')}
                  </h3>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                    {t('association.squad.timelineDescription')}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(selectionStatus)}`}>
                  {t(`association.squad.status.${selectionStatus}`, {
                    defaultValue: humanize(selectionStatus),
                  })}
                </span>
              </div>
            </div>

            <div className="grid gap-px bg-slate-200 md:grid-cols-4">
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.squad.step1Title')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {selectedIds.length}/10
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('association.squad.step1Text')}
                </p>
                <div className="mt-2 text-xs font-medium text-slate-600">
                  {t('association.squad.recommendedLock')}:{' '}
                  {formatGameDate(workspace?.timeline?.recommended_selection_lock_date)}
                </div>
              </div>

              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.squad.step2Title')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {workspace?.selection?.locked_on
                    ? formatGameDate(workspace.selection.locked_on)
                    : t('association.squad.notLocked')}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('association.squad.step2Text')}
                </p>
              </div>

              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.squad.step3Title')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {workspace?.timeline?.response_deadline
                    ? formatGameDate(workspace.timeline.response_deadline)
                    : t('association.squad.responseWindow', {
                        days: workspace?.timeline?.callup_response_days ?? 7,
                      })}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('association.squad.step3Text')}
                </p>
              </div>

              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.squad.step4Title')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {formatGameDate(workspace?.timeline?.final_squad_deadline)}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('association.squad.step4Text')}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <strong>{t('association.squad.nextEvent')}:</strong>{' '}
              {cycle?.state === 'active_cycle'
                ? `${cycle.round_label ?? t('association.tabs.competition')} · ${cycle.group_label ?? '—'}`
                : t('association.squad.seasonPreparation')}
              {' · '}
              {formatGameDate(workspace?.timeline?.target_event_date)}
            </div>
          </section>

          <section className="rounded bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t('association.squad.selectedTenTitle')}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {t('association.squad.selectedTenDescription')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEditDraft ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void saveDraft()}
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === 'save' ? t('association.squad.saving') : t('association.squad.saveDraft')}
                    </button>
                  ) : null}
                  {canLock ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void lockSelection()}
                      className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {busy === 'lock' ? t('association.squad.locking') : t('association.squad.lockSend')}
                    </button>
                  ) : null}
                  {canConfirm ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void confirmSquad()}
                      className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {busy === 'confirm'
                        ? t('association.squad.confirming')
                        : t('association.squad.confirmFinal')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 10 }, (_, index) => {
                const rider = selectedRiders[index]
                const callup = rider ? callupByRider.get(rider.rider_id) : null
                const locked = rider ? lockedRiderIds.has(rider.rider_id) : false

                return (
                  <div
                    key={index}
                    className="min-h-[142px] rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    {!rider ? (
                      <div className="flex h-full min-h-[116px] flex-col items-center justify-center text-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-400">
                          {index + 1}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {t('association.squad.emptySlot')}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          {rider.image_url ? (
                            <img
                              src={rider.image_url}
                              alt={rider.rider_name}
                              className="h-12 w-12 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded bg-white text-xs font-bold text-slate-400">
                              {rider.rider_name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/dashboard/external-riders/${rider.rider_id}`}
                              className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
                            >
                              {rider.rider_name}
                            </Link>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {humanize(rider.role)} · {t('association.squad.ageValue', { age: rider.age_years ?? '—' })}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(callup?.status ?? selectionStatus)}`}>
                            {callup
                              ? t(`status.${callup.status}`, {
                                  defaultValue: humanize(callup.status),
                                })
                              : t('association.squad.draft')}
                          </span>

                          {canEditDraft && !locked ? (
                            <button
                              type="button"
                              onClick={() => toggleRider(rider.rider_id)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                            >
                              {t('association.squad.remove')}
                            </button>
                          ) : null}
                        </div>

                        {callup?.response_deadline ? (
                          <div className="mt-2 text-[11px] text-slate-500">
                            {t('association.squad.replyBy', {
                              date: formatGameDate(callup.response_deadline),
                            })}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {selectionStatus === 'needs_replacement' ? (
              <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {t('association.squad.replacementHelp')}
              </div>
            ) : null}

            {selectionStatus === 'awaiting_responses' ? (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('association.squad.awaitingHelp')}
              </div>
            ) : null}

            {selectionStatus === 'confirmed' ? (
              <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {t('association.squad.confirmedHelp')}
              </div>
            ) : null}
          </section>

          <section className="rounded bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {t('association.squad.riderPoolTitle')}
              </h3>
              <p className="mt-1 max-w-5xl text-sm leading-6 text-slate-500">
                {t('association.squad.riderPoolDescription')}
              </p>
            </div>

            <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-7">
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t('association.squad.searchPlaceholder')}
                className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-500 xl:col-span-2"
              />

              <select
                value={roleFilter}
                onChange={event => setRoleFilter(event.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">{t('association.squad.allRoles')}</option>
                {roles.map(role => (
                  <option key={role} value={role}>{humanize(role)}</option>
                ))}
              </select>

              <select
                value={availabilityFilter}
                onChange={event => setAvailabilityFilter(event.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">{t('association.squad.allAvailability')}</option>
                <option value="fit">{t('association.squad.fit')}</option>
                <option value="injured">{t('association.squad.injured')}</option>
              </select>

              <div className="flex gap-2">
                <input
                  type="number"
                  min={15}
                  max={60}
                  value={ageMin}
                  onChange={event => setAgeMin(event.target.value)}
                  placeholder={t('association.squad.ageMin')}
                  className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  min={15}
                  max={60}
                  value={ageMax}
                  onChange={event => setAgeMax(event.target.value)}
                  placeholder={t('association.squad.ageMax')}
                  className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </div>

              <select
                value={sortKey}
                onChange={event => setSortKey(event.target.value as SortKey)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="selection_score">{t('association.squad.sortSelectionScore')}</option>
                <option value="national_rank">{t('association.squad.sortNationalRank')}</option>
                <option value="overall">{t('association.squad.sortOverall')}</option>
                <option value="flat">{t('association.squad.sortFlat')}</option>
                <option value="climbing">{t('association.squad.sortClimbing')}</option>
                <option value="time_trial">{t('association.squad.sortTimeTrial')}</option>
                <option value="sprint">{t('association.squad.sortSprint')}</option>
                <option value="age">{t('association.squad.sortAge')}</option>
                <option value="season_points">{t('association.squad.sortSeasonPoints')}</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortDirection(current => current === 'asc' ? 'desc' : 'asc')
                }
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {sortDirection === 'desc'
                  ? t('association.squad.highToLow')
                  : t('association.squad.lowToHigh')}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1380px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">{t('association.squad.pick')}</th>
                    <th className="px-3 py-2.5">{t('common.rider')}</th>
                    <th className="px-3 py-2.5">{t('common.club')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.roleAge')}</th>
                    <th className="px-3 py-2.5">{t('common.rank')}</th>
                    <th className="px-3 py-2.5">{t('common.overall')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.selectionScore')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.flat')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.climbing')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.timeTrial')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.sprint')}</th>
                    <th className="px-3 py-2.5">{t('association.squad.fatigue')}</th>
                    <th className="px-3 py-2.5">{t('common.availability')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRiders.map(rider => {
                    const selected = selectedIds.includes(rider.rider_id)
                    const callup = callupByRider.get(rider.rider_id)
                    const locked = lockedRiderIds.has(rider.rider_id)
                    const canToggle =
                      canEditDraft &&
                      (!selected || !locked) &&
                      (selected || selectedIds.length < 10)

                    return (
                      <tr
                        key={rider.rider_id}
                        className={selected ? 'bg-yellow-50' : 'bg-white'}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!canToggle}
                            onChange={() => toggleRider(rider.rider_id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {rider.image_url ? (
                              <img
                                src={rider.image_url}
                                alt={rider.rider_name}
                                className="h-9 w-9 rounded object-cover"
                              />
                            ) : null}
                            <div>
                              <Link
                                to={`/dashboard/external-riders/${rider.rider_id}`}
                                className="font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
                              >
                                {rider.rider_name}
                              </Link>
                              {callup ? (
                                <div className="mt-0.5">
                                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(callup.status)}`}>
                                    {t(`status.${callup.status}`, {
                                      defaultValue: humanize(callup.status),
                                    })}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {rider.club_name ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {humanize(rider.role)} · {rider.age_years ?? '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-700">
                          {rider.national_rank ? `#${rider.national_rank}` : '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {rider.overall_range
                            ? `${rider.overall_range.min ?? '—'}–${rider.overall_range.max ?? '—'}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-yellow-700">
                          {rider.selection_scores?.overall ?? '—'}
                        </td>
                        <td className="px-3 py-3">{rider.skills?.flat ?? '—'}</td>
                        <td className="px-3 py-3">{rider.skills?.climbing ?? '—'}</td>
                        <td className="px-3 py-3">{rider.skills?.time_trial ?? '—'}</td>
                        <td className="px-3 py-3">{rider.skills?.sprint ?? '—'}</td>
                        <td className="px-3 py-3">{rider.fatigue ?? '—'}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(rider.availability_status === 'fit' ? 'active' : rider.availability_status)}`}>
                            {t(`status.${rider.availability_status}`, {
                              defaultValue: humanize(rider.availability_status),
                            })}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              {t('association.squad.scoreExplanation')}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
