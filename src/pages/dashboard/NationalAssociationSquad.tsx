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
  club_country_code?: string | null
  club_is_ai?: boolean
  availability_status?: string | null
  fatigue?: number | null
  season_points?: number | null
  season_points_sprint?: number | null
  season_points_climbing?: number | null
  national_rank?: number | null
  uci_rank?: number | null
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
  start_date?: string | null
  end_date?: string | null
  day1_date?: string | null
  day2_date?: string | null
  day3_date?: string | null
}

type SortKey =
  | 'uci_rank'
  | 'overall'
  | 'flat'
  | 'climbing'
  | 'time_trial'
  | 'sprint'
  | 'age'
  | 'season_points'

const RIDERS_PER_PAGE = 30

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
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
    case 'uci_rank':
      return rider.uci_rank == null ? Number.POSITIVE_INFINITY : numeric(rider.uci_rank)
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
    default:
      return numeric(rider.uci_rank, Number.POSITIVE_INFINITY)
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
  const [sortKey, setSortKey] = useState<SortKey>('uci_rank')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
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

      if (sortKey === 'uci_rank') {
        const aMissing = a.uci_rank == null
        const bMissing = b.uci_rank == null
        if (aMissing && bMissing) return a.rider_name.localeCompare(b.rider_name)
        if (aMissing) return 1
        if (bMissing) return -1
        return (av - bv) * direction
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

  const pageCount = Math.max(1, Math.ceil(filteredRiders.length / RIDERS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const paginatedRiders = useMemo(
    () =>
      filteredRiders.slice(
        (currentPage - 1) * RIDERS_PER_PAGE,
        currentPage * RIDERS_PER_PAGE,
      ),
    [filteredRiders, currentPage],
  )

  useEffect(() => {
    setPage(1)
  }, [search, roleFilter, availabilityFilter, ageMin, ageMax, sortKey, sortDirection])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const selectionStatus = workspace?.selection?.status ?? 'draft'
  const canEditDraft =
    selectionStatus === 'draft' || selectionStatus === 'needs_replacement'
  const invitationWindowOpen =
    !workspace?.timeline?.recommended_selection_lock_date ||
    !workspace?.current_game_date ||
    workspace.current_game_date >= workspace.timeline.recommended_selection_lock_date
  const canLock = canEditDraft && selectedIds.length === 10 && invitationWindowOpen
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

            <div className="border-t border-slate-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Current National Team selection window
                  </div>
                  <div className="mt-1 font-semibold">
                    {cycle?.state === 'active_cycle'
                      ? `${cycle.round_label ?? t('association.tabs.competition')} · ${cycle.group_label ?? '—'}`
                      : t('association.squad.seasonPreparation')}
                  </div>
                  <div className="mt-1 text-xs text-sky-800">
                    Race window: {cycle?.start_date ? formatGameDate(cycle.start_date) : formatGameDate(workspace?.timeline?.target_event_date)}
                    {' – '}
                    {cycle?.end_date ? formatGameDate(cycle.end_date) : formatGameDate(workspace?.timeline?.target_event_date)}
                  </div>
                </div>
                <div className="grid gap-1 text-xs text-sky-900 sm:text-right">
                  <div>
                    Draft / invitations recommended by:{' '}
                    <strong>{formatGameDate(workspace?.timeline?.recommended_selection_lock_date)}</strong>
                  </div>
                  <div>
                    Final 10-rider squad due:{' '}
                    <strong>{formatGameDate(workspace?.timeline?.final_squad_deadline)}</strong>
                  </div>
                </div>
              </div>
              {cycle?.round_label?.toLowerCase().includes('final') ? (
                <div className="mt-3 rounded border border-sky-200 bg-white/70 px-3 py-2 text-xs leading-5 text-sky-900">
                  This is a new competition window. The National Coach may keep riders from the previous round or choose a different eligible 10-rider squad for this Final.
                </div>
              ) : null}
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
                  {canEditDraft && selectedIds.length === 10 ? (
                    <button
                      type="button"
                      disabled={busy !== null || !invitationWindowOpen}
                      onClick={() => void lockSelection()}
                      title={
                        invitationWindowOpen
                          ? undefined
                          : `Invitations open on ${formatGameDate(workspace?.timeline?.recommended_selection_lock_date)}`
                      }
                      className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'lock'
                        ? t('association.squad.locking')
                        : invitationWindowOpen
                          ? t('association.squad.lockSend')
                          : `Invitations open ${formatGameDate(workspace?.timeline?.recommended_selection_lock_date)}`}
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
                <option value="uci_rank">UCI rank</option>
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
              <table className="min-w-[1260px] w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-14 px-3 py-2.5 text-center">{t('association.squad.pick')}</th>
                    <th className="w-48 px-3 py-2.5">{t('common.rider')}</th>
                    <th className="w-52 px-3 py-2.5">{t('common.club')}</th>
                    <th className="w-36 px-3 py-2.5">{t('association.squad.roleAge')}</th>
                    <th
                      className="w-24 px-3 py-2.5 text-center"
                      title="Current UCI World Ranking position from the Statistics ranking."
                    >
                      UCI rank
                    </th>
                    <th className="w-24 px-3 py-2.5 text-center">{t('common.overall')}</th>
                    <th className="w-20 px-3 py-2.5 text-center">{t('association.squad.flat')}</th>
                    <th className="w-20 px-3 py-2.5 text-center">{t('association.squad.climbing')}</th>
                    <th className="w-24 px-3 py-2.5 text-center">{t('association.squad.timeTrial')}</th>
                    <th className="w-20 px-3 py-2.5 text-center">{t('association.squad.sprint')}</th>
                    <th className="w-20 px-3 py-2.5 text-center">{t('association.squad.fatigue')}</th>
                    <th className="w-24 px-3 py-2.5 text-center">Sharpness</th>
                    <th className="w-28 px-3 py-2.5 text-center">{t('common.availability')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedRiders.map(rider => {
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
                          <div className="flex min-w-0 items-center gap-2">
                            {flagUrl(rider.country_code) ? (
                              <img
                                src={flagUrl(rider.country_code) ?? undefined}
                                alt={rider.country_code ?? 'Rider country'}
                                className="h-3.5 w-5 shrink-0 rounded-sm border border-slate-200 object-cover"
                              />
                            ) : null}
                            <div className="min-w-0">
                              <Link
                                to={`/dashboard/external-riders/${rider.rider_id}`}
                                className="block truncate font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
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
                          <div className="flex min-w-0 items-center gap-2">
                            {flagUrl(rider.club_country_code) ? (
                              <img
                                src={flagUrl(rider.club_country_code) ?? undefined}
                                alt={rider.club_country_code ?? 'Club country'}
                                className="h-3.5 w-5 shrink-0 rounded-sm border border-slate-200 object-cover"
                              />
                            ) : null}
                            <span className="truncate">{rider.club_name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {humanize(rider.role)} · {rider.age_years ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-700">
                          {rider.uci_rank ? `#${rider.uci_rank}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-900">
                          {rider.overall_range
                            ? `${rider.overall_range.min ?? '—'}–${rider.overall_range.max ?? '—'}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">{rider.skills?.flat ?? '—'}</td>
                        <td className="px-3 py-3 text-center">{rider.skills?.climbing ?? '—'}</td>
                        <td className="px-3 py-3 text-center">{rider.skills?.time_trial ?? '—'}</td>
                        <td className="px-3 py-3 text-center">{rider.skills?.sprint ?? '—'}</td>
                        <td className="px-3 py-3 text-center">{rider.fatigue ?? '—'}</td>
                        <td className="px-3 py-3 text-center">{rider.race_condition?.race_sharpness ?? '—'}</td>
                        <td className="px-3 py-3 text-center">
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs leading-5 text-slate-500">
                UCI rank = current UCI World Ranking position from the Statistics ranking. Showing {filteredRiders.length === 0 ? 0 : (currentPage - 1) * RIDERS_PER_PAGE + 1}–{Math.min(currentPage * RIDERS_PER_PAGE, filteredRiders.length)} of {filteredRiders.length} riders.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="min-w-20 text-center text-xs font-semibold text-slate-600">
                  Page {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
