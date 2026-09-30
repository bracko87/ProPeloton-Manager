import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type QualificationRound = {
  round_index: number
  round_type: string
  round_label: string
  entrants_target: number
  advance_target: number
  group_count: number
  group_size_min: number
  group_size_max: number
}

type QualificationPlan = {
  active_associations: number
  finalist_target: number
  rounds: QualificationRound[]
}

type GroupEntry = {
  group_entry_id: string
  competition_entry_id: string
  association_id: string
  association_name: string
  country_code: string
  seed_position?: number | null
  final_group_rank?: number | null
  total_points: number
  ttt_points: number
  flat_points: number
  mountain_points: number
  race_wins: number
  podium_finishes: number
  ttt_rank?: number | null
  best_day3_rider_rank?: number | null
  status: string
}

type NationsGroup = {
  id: string
  group_number: number
  group_label: string
  planned_entrant_count: number
  planned_advance_count: number
  status: string
  entries: GroupEntry[]
}

type NationsRound = {
  id: string
  round_index: number
  round_type: string
  round_label: string
  entrants_target: number
  advance_target: number
  group_count: number
  group_size_min: number
  group_size_max: number
  status: string
  starts_on_game_date?: string | null
  ends_on_game_date?: string | null
  groups: NationsGroup[]
}

type CompetitionEntry = {
  entry_id: string
  association_id: string
  association_name: string
  country_code: string
  seed_score: number
  status: string
}

type PointsCurveRow = {
  race_type: string
  finishing_position: number
  points: number
  version: number
}

type EventScheduleRow = {
  round_id: string
  round_index: number
  round_type: string
  round_label: string
  group_id: string
  group_number: number
  group_label: string
  event_id: string
  race_day: number
  race_type: string
  cycle_key: string
  event_date?: string | null
  race_id?: string | null
  stage_id?: string | null
  source_stage_id?: string | null
  host_association_id?: string | null
  host_country_code?: string | null
  host_country_name?: string | null
  status: string
}

type HistoryRow = {
  season_number: number
  association_id?: string | null
  association_name?: string | null
  country_code: string
  final_rank: number
  total_points: number
  was_host: boolean
}

type Viewer = {
  association_id?: string | null
  is_member: boolean
  is_national_coach: boolean
  can_apply_to_host: boolean
  host_application?: {
    id: string
    status: string
    statement?: string | null
    submitted_on?: string | null
  } | null
}

type Edition = {
  id: string
  competition_name: string
  status: string
  active_association_count: number
  finalist_target: number
  points_curve_version: number
  host_association_id?: string | null
  host_country_code?: string | null
  champion_association_id?: string | null
  champion_country_code?: string | null
  created_on_game_date: string
  completed_on_game_date?: string | null
}

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

type Overview = {
  season_number: number
  current_season_number: number
  current_game_date: string
  active_association_count: number
  qualification_plan: QualificationPlan
  viewer: Viewer
  edition?: Edition | null
  rounds: NationsRound[]
  entries: CompetitionEntry[]
  points_curve: PointsCurveRow[]
  history: HistoryRow[]
}

type HostStageOption = {
  stage_id: string
  stage_name?: string | null
  race_name?: string | null
  route_label?: string | null
  distance_km?: number | null
  terrain_type?: string | null
  stage_format?: string | null
}

type HostApplicationSummary = {
  application_id: string
  association_id?: string | null
  association_name?: string | null
  country_code?: string | null
  host_scope: 'qualification' | 'final'
  status: string
  submitted_on?: string | null
  ttt_stage_id?: string | null
  flat_stage_id?: string | null
  mountain_stage_id?: string | null
  statement?: string | null
}

type HostWorkspace = {
  edition_id: string
  season_number: number
  viewer_can_apply: boolean
  viewer_association_id?: string | null
  viewer_country_code?: string | null
  country_has_complete_bundle: boolean
  missing_types?: string[]
  stage_options?: {
    team_time_trial?: HostStageOption[]
    flat?: HostStageOption[]
    hilly_mountain?: HostStageOption[]
  }
  applications?: HostApplicationSummary[]
  my_applications?: HostApplicationSummary[]
  world_final_host_country_code?: string | null
  world_final_host_country_name?: string | null
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
  if (['completed', 'advanced', 'winner', 'champion', 'finalist', 'selected'].includes(status ?? '')) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (['drawn', 'qualification', 'entered', 'submitted', 'eligible'].includes(status ?? '')) {
    return 'bg-sky-100 text-sky-800'
  }
  if (['planned'].includes(status ?? '')) {
    return 'bg-amber-100 text-amber-800'
  }
  if (['eliminated', 'withdrawn', 'not_selected'].includes(status ?? '')) {
    return 'bg-slate-100 text-slate-600'
  }
  return 'bg-slate-100 text-slate-700'
}

function CountryLabel({
  code,
  name,
}: {
  code?: string | null
  name?: string | null
}): JSX.Element {
  const src = flagUrl(code)
  return (
    <div className="flex items-center gap-2">
      {src ? (
        <img
          src={src}
          alt={code ?? name ?? 'Country'}
          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
        />
      ) : null}
      <span>{name || code || '—'}</span>
    </div>
  )
}

function RoundCard({
  round,
  viewerAssociationId,
  viewerIsCoach,
  scheduleRows,
  seasonNumber,
}: {
  round: NationsRound
  viewerAssociationId?: string | null
  viewerIsCoach?: boolean
  scheduleRows: EventScheduleRow[]
  seasonNumber?: number | null
}): JSX.Element {
  const { t } = useTranslation('nations')
  return (
    <section className="rounded bg-white shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <div className="flex items-center gap-2">

            <h3 className="text-base font-semibold text-slate-900">{round.round_label}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {round.round_type === 'world_final'
              ? 'Final field'
              : `${round.entrants_target} nation${round.entrants_target === 1 ? '' : 's'}`}
            {' · '}
            {formatGameDate(round.starts_on_game_date)}
            {round.ends_on_game_date ? ` – ${formatGameDate(round.ends_on_game_date)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        {(round.groups ?? []).map(group => {
          const viewerInGroup = Boolean(
            viewerAssociationId &&
              (group.entries ?? []).some(
                entry => entry.association_id === viewerAssociationId,
              ),
          )

          const groupEvents = scheduleRows.filter(event => event.group_id === group.id)

          return (
          <div key={group.id} className="overflow-hidden rounded border border-slate-200">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2.5">
              <div>
                <div className="font-semibold text-slate-900">{group.group_label}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {round.round_type === 'world_final'
                    ? `Teams: ${group.entries?.length ?? 0}`
                    : `Teams: ${group.entries?.length ?? 0} / ${round.group_size_max || 16}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewerInGroup && viewerIsCoach ? (
                  <Link
                    to={`/dashboard/national-association/squad?cycle=nations:${group.id}`}
                    className="rounded bg-yellow-400 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-yellow-300"
                  >
                    {t('world.manageNationalTeam')}
                  </Link>
                ) : null}
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClasses(group.status)}`}>
                  {t(`status.${group.status}`, { defaultValue: humanize(group.status) })}
                </span>
              </div>
            </div>

            {groupEvents.length > 0 ? (
              <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3">
                {groupEvents.map(event => (
                  <div key={event.event_id} className="bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {t('common.dayRace', { day: event.race_day, race: t(`raceTypes.${event.race_type}`, { defaultValue: humanize(event.race_type) }) })}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-900">
                        {formatGameDate(event.event_date)}
                      </span>
                      {seasonNumber ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-medium text-slate-500">
                            {t('common.seasonNumber', { season: seasonNumber })}
                          </span>
                        </>
                      ) : null}
                      <span className="text-slate-300">·</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(event.status)}`}>
                        {t(`status.${event.status}`, { defaultValue: humanize(event.status) })}
                      </span>
                    </div>
                    <Link
                      to={`/dashboard/national-association/world-nations/events/${event.event_id}`}
                      className="mt-2 inline-flex rounded-lg bg-yellow-400 px-2.5 py-1.5 text-[11px] font-semibold text-black shadow-sm hover:bg-yellow-300"
                    >
                      Open race page
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}

          </div>
          )
        })}
      </div>
    </section>
  )
}

export default function WorldNationsPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [data, setData] = useState<Overview | null>(null)
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [scheduleRows, setScheduleRows] = useState<EventScheduleRow[]>([])
  const [hostWorkspace, setHostWorkspace] = useState<HostWorkspace | null>(null)
  const [hostModalOpen, setHostModalOpen] = useState(false)
  const [hostScope, setHostScope] = useState<'qualification' | 'final'>('qualification')
  const [hostTttStageId, setHostTttStageId] = useState('')
  const [hostFlatStageId, setHostFlatStageId] = useState('')
  const [hostMountainStageId, setHostMountainStageId] = useState('')
  const [hostStatement, setHostStatement] = useState('')
  const [hostSaving, setHostSaving] = useState(false)

  const load = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const [overviewResponse, associationResponse] = await Promise.all([
        supabase.rpc('get_nations_competition_overview_v1', { p_season_number: null }),
        supabase.rpc('get_my_national_association_v1'),
      ])
      if (overviewResponse.error) throw overviewResponse.error
      if (associationResponse.error) throw associationResponse.error

      const next = (overviewResponse.data ?? null) as Overview | null
      setData(next)
      setAssociation((associationResponse.data ?? null) as AssociationData | null)

      if (next?.edition?.id) {
        const [eventScheduleResponse, hostWorkspaceResponse] = await Promise.all([
          supabase.rpc('get_nations_competition_event_schedule_v2', {
            p_edition_id: next.edition.id,
          }),
          supabase.rpc('get_nations_host_application_workspace_v2', {
            p_edition_id: next.edition.id,
          }),
        ])

        if (eventScheduleResponse.error) throw eventScheduleResponse.error
        if (hostWorkspaceResponse.error) throw hostWorkspaceResponse.error

        setScheduleRows((eventScheduleResponse.data ?? []) as EventScheduleRow[])
        setHostWorkspace((hostWorkspaceResponse.data ?? null) as HostWorkspace | null)
      } else {
        setScheduleRows([])
        setHostWorkspace(null)
      }
    } catch (caught: any) {
      setError(caught?.message ?? t('world.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const tttCurve = useMemo(
    () => (data?.points_curve ?? []).filter(row => row.race_type === 'team_time_trial'),
    [data?.points_curve],
  )
  const roadCurve = useMemo(
    () => (data?.points_curve ?? []).filter(row => row.race_type === 'road_race'),
    [data?.points_curve],
  )

  const champions = useMemo(
    () => (data?.history ?? []).filter(row => row.final_rank === 1),
    [data?.history],
  )

  const finalHostCountry =
    hostWorkspace?.world_final_host_country_code ??
    scheduleRows.find(row => row.round_type === 'world_final' && row.host_country_code)
      ?.host_country_code ??
    null

  const applicationsForScope = useMemo(
    () =>
      (hostWorkspace?.applications ?? []).filter(
        application => application.host_scope === hostScope,
      ),
    [hostScope, hostWorkspace?.applications],
  )

  const openHostModal = (scope: 'qualification' | 'final' = 'qualification'): void => {
    setHostScope(scope)
    setMessage(null)
    const own = (hostWorkspace?.my_applications ?? []).find(
      application => application.host_scope === scope,
    )
    const tttOptions = hostWorkspace?.stage_options?.team_time_trial ?? []
    const flatOptions = hostWorkspace?.stage_options?.flat ?? []
    const mountainOptions = hostWorkspace?.stage_options?.hilly_mountain ?? []

    setHostTttStageId(own?.ttt_stage_id ?? tttOptions[0]?.stage_id ?? '')
    setHostFlatStageId(own?.flat_stage_id ?? flatOptions[0]?.stage_id ?? '')
    setHostMountainStageId(own?.mountain_stage_id ?? mountainOptions[0]?.stage_id ?? '')
    setHostStatement(own?.statement ?? '')
    setHostModalOpen(true)
  }

  const changeHostScope = (scope: 'qualification' | 'final'): void => {
    setHostScope(scope)
    const own = (hostWorkspace?.my_applications ?? []).find(
      application => application.host_scope === scope,
    )
    const tttOptions = hostWorkspace?.stage_options?.team_time_trial ?? []
    const flatOptions = hostWorkspace?.stage_options?.flat ?? []
    const mountainOptions = hostWorkspace?.stage_options?.hilly_mountain ?? []
    setHostTttStageId(own?.ttt_stage_id ?? tttOptions[0]?.stage_id ?? '')
    setHostFlatStageId(own?.flat_stage_id ?? flatOptions[0]?.stage_id ?? '')
    setHostMountainStageId(own?.mountain_stage_id ?? mountainOptions[0]?.stage_id ?? '')
    setHostStatement(own?.statement ?? '')
  }

  const submitHostApplication = async (): Promise<void> => {
    const editionId = data?.edition?.id
    if (
      !editionId ||
      !hostWorkspace?.viewer_can_apply ||
      !hostWorkspace.country_has_complete_bundle ||
      !hostTttStageId ||
      !hostFlatStageId ||
      !hostMountainStageId
    ) {
      return
    }

    try {
      setHostSaving(true)
      setError(null)
      setMessage(null)
      const { error: submitError } = await supabase.rpc(
        'submit_nations_host_application_v2',
        {
          p_edition_id: editionId,
          p_host_scope: hostScope,
          p_ttt_stage_id: hostTttStageId,
          p_flat_stage_id: hostFlatStageId,
          p_mountain_stage_id: hostMountainStageId,
          p_statement: hostStatement.trim() || null,
        },
      )
      if (submitError) throw submitError
      setMessage(t('world.hostApplication.saved'))
      setHostModalOpen(false)
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('world.hostApplication.error'))
    } finally {
      setHostSaving(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('world.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <NationalAssociationHeader
        association={association}
        isCoach={Boolean(data?.viewer?.is_national_coach)}
        loading={loading}
        onRefresh={() => void load()}
      />

      <section className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t('world.title')}</h3>
        <p className="mt-1 text-sm text-slate-500">{t('world.subtitle')}</p>
        <p className="mt-2 text-xs font-medium text-emerald-700">
          {t('world.autoEntry')}
        </p>
      </section>

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

      <section className="overflow-hidden rounded bg-white shadow">
        <div className="grid gap-px bg-slate-200 md:grid-cols-4">
          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

              {t('world.activeAssociations')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {data?.edition?.active_association_count ?? data?.active_association_count ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('common.seasonNumber', { season: data?.season_number ?? '—' })}</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

              {t('world.finalQualification')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">Max 16 teams per group</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Target size is 12–16 when the field is large enough. Season 1 fills the existing group before opening the next; from Season 2, ranked nations are spread evenly across groups.
            </p>
          </div>

          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('world.finalHost')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {finalHostCountry ? (
                <CountryLabel
                  code={finalHostCountry}
                  name={hostWorkspace?.world_final_host_country_name ?? finalHostCountry}
                />
              ) : (
                t('common.pending')
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t('world.finalHostHelp')}
            </p>
          </div>

          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('world.applyHost')}
            </div>
            <button
              type="button"
              disabled={!data?.edition}
              onClick={() => openHostModal('qualification')}
              className="mt-2 rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              {t('world.applyHostButton')}
            </button>
            <p className="mt-1 text-xs text-slate-500">
              {t('world.applyHostHelp')}
            </p>
          </div>
        </div>
      </section>

      {(data?.rounds ?? []).map(round => (
        <RoundCard
          key={round.id}
          round={round}
          viewerAssociationId={data?.viewer?.association_id}
          viewerIsCoach={Boolean(data?.viewer?.is_national_coach)}
          scheduleRows={scheduleRows}
          seasonNumber={data?.season_number ?? null}
        />
      ))}

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">

            <h3 className="text-base font-semibold text-slate-900">{t('world.points.title')}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {t('world.points.description')}
          </p>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <div className="rounded border border-slate-200 p-4">
            <div className="font-semibold text-slate-900">{t('world.points.day1')}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
              {tttCurve.slice(0, 16).map(row => (
                <div key={row.finishing_position} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-2">
                  <span className="text-slate-500">#{row.finishing_position}</span>
                  <span className="font-semibold text-slate-900">{row.points}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-slate-200 p-4">
            <div className="font-semibold text-slate-900">{t('world.points.days23')}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
              {roadCurve.slice(0, 16).map(row => (
                <div key={row.finishing_position} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-2">
                  <span className="text-slate-500">#{row.finishing_position}</span>
                  <span className="font-semibold text-slate-900">{row.points}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {t('world.points.bestThree')}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          {t('world.points.tiebreak')}
        </div>
      </section>

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">

            <h3 className="text-base font-semibold text-slate-900">{t('world.history.title')}</h3>
          </div>
        </div>

        {champions.length ? (
          <div className="divide-y divide-slate-200">
            {champions.map(row => (
              <div key={`${row.season_number}:${row.country_code}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('common.seasonNumber', { season: row.season_number })}
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    <CountryLabel code={row.country_code} name={row.association_name} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">{t('world.history.points', { points: row.total_points })}</div>
                  {row.was_host ? <div className="mt-0.5 text-xs text-slate-500">{t('world.history.hostChampion')}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            {t('world.history.none')}
          </div>
        )}
      </section>

      {hostModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {t('world.hostApplication.title')}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {t('world.hostApplication.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHostModalOpen(false)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('world.hostApplication.close')}
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('world.hostApplication.applyFor')}
                </div>
                <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1">
                  {(['qualification', 'final'] as const).map(scope => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => changeHostScope(scope)}
                      className={[
                        'rounded-md px-4 py-2 text-sm font-semibold',
                        hostScope === scope
                          ? 'bg-yellow-400 text-black shadow-sm'
                          : 'text-slate-600 hover:bg-white',
                      ].join(' ')}
                    >
                      {scope === 'qualification'
                        ? t('world.hostApplication.qualification')
                        : t('world.hostApplication.final')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('world.hostApplication.alreadyApplied')}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {applicationsForScope.length ? (
                    applicationsForScope.map(application => (
                      <span
                        key={application.application_id}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {application.country_code ?? application.association_name ?? '—'}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      {t('world.hostApplication.noApplications')}
                    </span>
                  )}
                </div>
              </div>

              {!hostWorkspace?.viewer_can_apply ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">
                    {t('world.hostApplication.coachOnly')}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {t('world.hostApplication.coachOnlyHelp')}
                  </p>
                </div>
              ) : !hostWorkspace?.country_has_complete_bundle ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-4">
                  <div className="font-semibold text-amber-950">
                    {t('world.hostApplication.notEligibleTitle')}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    {t('world.hostApplication.notEligibleText', {
                      country: hostWorkspace?.viewer_country_code ?? association?.country_code ?? '—',
                    })}
                  </p>
                  <div className="mt-2 text-xs font-medium text-amber-800">
                    {t('world.hostApplication.missing', {
                      types: (hostWorkspace?.missing_types ?? [])
                        .map(type => t(`world.hostApplication.type.${type}`, { defaultValue: humanize(type) }))
                        .join(', '),
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    {t('world.hostApplication.askAdmin')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">
                    {t('world.hostApplication.sameCountryRule', {
                      country: hostWorkspace?.viewer_country_code ?? association?.country_code ?? '—',
                    })}
                  </p>

                  {[
                    {
                      key: 'ttt',
                      label: t('world.hostApplication.ttt'),
                      value: hostTttStageId,
                      onChange: setHostTttStageId,
                      options: hostWorkspace?.stage_options?.team_time_trial ?? [],
                    },
                    {
                      key: 'flat',
                      label: t('world.hostApplication.flat'),
                      value: hostFlatStageId,
                      onChange: setHostFlatStageId,
                      options: hostWorkspace?.stage_options?.flat ?? [],
                    },
                    {
                      key: 'mountain',
                      label: t('world.hostApplication.mountain'),
                      value: hostMountainStageId,
                      onChange: setHostMountainStageId,
                      options: hostWorkspace?.stage_options?.hilly_mountain ?? [],
                    },
                  ].map(field => (
                    <label key={field.key} className="block">
                      <span className="text-sm font-semibold text-slate-900">{field.label}</span>
                      <select
                        value={field.value}
                        onChange={event => field.onChange(event.target.value)}
                        className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                      >
                        {field.options.map(option => (
                          <option key={option.stage_id} value={option.stage_id}>
                            {option.race_name ?? option.stage_name ?? 'Race'} · {option.route_label ?? option.stage_name ?? 'Stage'} · {Number(option.distance_km ?? 0).toFixed(1).replace(/\.0$/, '')} km
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-900">
                      {t('world.hostApplication.note')}
                    </span>
                    <textarea
                      rows={3}
                      value={hostStatement}
                      onChange={event => setHostStatement(event.target.value)}
                      placeholder={t('world.hostApplication.notePlaceholder')}
                      className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
              <button
                type="button"
                onClick={() => setHostModalOpen(false)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('world.hostApplication.cancel')}
              </button>
              <button
                type="button"
                disabled={
                  hostSaving ||
                  !hostWorkspace?.viewer_can_apply ||
                  !hostWorkspace?.country_has_complete_bundle ||
                  !hostTttStageId ||
                  !hostFlatStageId ||
                  !hostMountainStageId
                }
                onClick={() => void submitHostApplication()}
                className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hostSaving
                  ? t('world.hostApplication.saving')
                  : t('world.hostApplication.submit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}