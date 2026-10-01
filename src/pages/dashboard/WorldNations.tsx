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

type NationalTeamRankingScaleRow = {
  phase: 'qualification' | 'world_final'
  finishing_position: number
  points: number
  version: number
}

type NationalTeamStanding = {
  standing_rank: number
  association_id: string
  association_name: string
  country_code: string
  country_name: string
  season_points: number
  qualification_points: number
  world_final_points: number
  all_time_points: number
  seasons_scored: number
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

type HostRouteRequest = {
  request_id: string
  target_season_number: number
  requested_types?: string[]
  note?: string | null
  status: string
  submitted_on?: string | null
}

type HostWorkspace = {
  current_season_number: number
  target_season_number: number
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
  route_request?: HostRouteRequest | null
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
          const groupHost = groupEvents.find(event => event.host_country_code) ?? null

          return (
          <div key={group.id} className="overflow-hidden rounded border border-slate-200">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2.5">
              <div>
                <div className="font-semibold text-slate-900">{group.group_label}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {round.round_type === 'world_final' ? 'World Nations Final' : 'Qualification group'}
                  {' · '}
                  {round.round_type === 'world_final'
                    ? `Teams: ${group.entries?.length ?? 0}`
                    : `Teams: ${group.entries?.length ?? 0} / ${round.group_size_max || 16}`}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold uppercase tracking-wide text-slate-400">Host</span>
                  {groupHost?.host_country_code ? (
                    <CountryLabel
                      code={groupHost.host_country_code}
                      name={groupHost.host_country_name ?? groupHost.host_country_code}
                    />
                  ) : (
                    <span className="font-medium text-slate-500">Pending</span>
                  )}
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
  const [standings, setStandings] = useState<NationalTeamStanding[]>([])
  const [rankingScale, setRankingScale] = useState<NationalTeamRankingScaleRow[]>([])
  const [hostWorkspace, setHostWorkspace] = useState<HostWorkspace | null>(null)
  const [hostModalOpen, setHostModalOpen] = useState(false)
  const [hostMode, setHostMode] = useState<'qualification' | 'final' | 'routes'>('qualification')
  const [hostTttStageId, setHostTttStageId] = useState('')
  const [hostFlatStageId, setHostFlatStageId] = useState('')
  const [hostMountainStageId, setHostMountainStageId] = useState('')
  const [hostStatement, setHostStatement] = useState('')
  const [hostSaving, setHostSaving] = useState(false)
  const [routeRequestTypes, setRouteRequestTypes] = useState<string[]>([])
  const [routeRequestNote, setRouteRequestNote] = useState('')

  const load = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const [overviewResponse, associationResponse, standingsResponse, rankingScaleResponse] = await Promise.all([
        supabase.rpc('get_nations_competition_overview_v1', { p_season_number: null }),
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_nations_team_standings_v1', { p_season_number: null }),
        supabase.rpc('get_nations_team_ranking_scale_v1'),
      ])
      if (overviewResponse.error) throw overviewResponse.error
      if (associationResponse.error) throw associationResponse.error
      if (standingsResponse.error) throw standingsResponse.error
      if (rankingScaleResponse.error) throw rankingScaleResponse.error

      const next = (overviewResponse.data ?? null) as Overview | null
      setData(next)
      setAssociation((associationResponse.data ?? null) as AssociationData | null)
      setStandings((standingsResponse.data ?? []) as NationalTeamStanding[])
      setRankingScale((rankingScaleResponse.data ?? []) as NationalTeamRankingScaleRow[])

      if (next?.edition?.id) {
        const [eventScheduleResponse, hostWorkspaceResponse] = await Promise.all([
          supabase.rpc('get_nations_competition_event_schedule_v2', {
            p_edition_id: next.edition.id,
          }),
          supabase.rpc('get_nations_host_application_workspace_v3'),
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

  const finalHostEvent = scheduleRows.find(
    row => row.round_type === 'world_final' && row.host_country_code,
  )
  const finalHostCountry = finalHostEvent?.host_country_code ?? null

  const applicationsForScope = useMemo(
    () =>
      (hostWorkspace?.applications ?? []).filter(
        application => application.host_scope === hostMode,
      ),
    [hostMode, hostWorkspace?.applications],
  )

  const openHostModal = (scope: 'qualification' | 'final' = 'qualification'): void => {
    if (!hostWorkspace?.viewer_can_apply) return
    setHostMode(scope)
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
    setRouteRequestTypes(hostWorkspace?.route_request?.requested_types ?? hostWorkspace?.missing_types ?? [])
    setRouteRequestNote(hostWorkspace?.route_request?.note ?? '')
    setHostModalOpen(true)
  }

  const changeHostScope = (scope: 'qualification' | 'final'): void => {
    setHostMode(scope)
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
    if (hostMode === 'routes') return
    if (
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
        'submit_nations_host_application_v3',
        {
          p_host_scope: hostMode,
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

  const submitRouteRequest = async (): Promise<void> => {
    if (!hostWorkspace?.viewer_can_apply || routeRequestTypes.length === 0) return

    try {
      setHostSaving(true)
      setError(null)
      setMessage(null)
      const { error: submitError } = await supabase.rpc(
        'submit_nations_host_route_request_v1',
        {
          p_requested_types: routeRequestTypes,
          p_note: routeRequestNote.trim() || null,
        },
      )
      if (submitError) throw submitError
      setMessage(`Race creation request submitted for Season ${hostWorkspace.target_season_number}.`)
      setHostModalOpen(false)
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not submit the race creation request.')
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
                  name={finalHostEvent?.host_country_name ?? finalHostCountry}
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
              disabled={!data?.edition || !hostWorkspace?.viewer_can_apply}
              onClick={() => openHostModal('qualification')}
              className="mt-2 rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              {hostWorkspace?.viewer_can_apply
                ? `Apply for Season ${hostWorkspace?.target_season_number ?? ((data?.season_number ?? 0) + 1)}`
                : 'National Coach only'}
            </button>
            <p className="mt-1 text-xs text-slate-500">
              {hostWorkspace?.viewer_can_apply
                ? 'Host applications are always for the next season.'
                : 'Only the elected National Coach can submit host applications or missing-race requests.'}
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

      <section className="overflow-hidden rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-900">National Team Standing</h3>
          <p className="mt-1 text-sm text-slate-500">
            World Nations ranking points accumulate from season to season. There are no defending points to remove; this persistent standing seeds the next season&apos;s qualification groups.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">National Team</th>
                <th className="px-4 py-3 text-right">Season</th>
                <th className="px-4 py-3 text-right">Qualification</th>
                <th className="px-4 py-3 text-right">World Final</th>
                <th className="px-4 py-3 text-right">All-time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {standings.length ? standings.map(row => (
                <tr key={row.association_id} className="bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-900">#{row.standing_rank}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <CountryLabel code={row.country_code} name={row.country_name || row.association_name} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{row.season_points}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.qualification_points}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.world_final_points}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950">{row.all_time_points}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No active National Teams are available for the standing yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Qualification and World Final placement points are awarded when each group is completed. The point scale is versioned so it can be tuned without deleting historical awards.
        </div>
      </section>

      <details className="group rounded bg-white shadow">
        <summary className="cursor-pointer list-none border-b border-slate-200 p-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{t('world.points.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('world.points.description')}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-500 group-open:hidden">Show points</span>
            <span className="hidden shrink-0 text-xs font-semibold text-slate-500 group-open:inline">Hide points</span>
          </div>
        </summary>

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

        <div className="border-t border-slate-200 p-4">
          <div className="font-semibold text-slate-900">National Team Standing points</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            These are the persistent ranking points added to the National Team Standing after the Qualification group and World Final. They are cumulative and are never defended or removed.
          </p>
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {(['qualification', 'world_final'] as const).map(phase => (
              <div key={phase} className="rounded border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">
                  {phase === 'qualification' ? 'Qualification group' : 'World Final'}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  {rankingScale.filter(row => row.phase === phase).map(row => (
                    <div
                      key={`${phase}:${row.finishing_position}`}
                      className="flex items-center justify-between rounded bg-slate-50 px-2 py-2"
                    >
                      <span className="text-slate-500">#{row.finishing_position}</span>
                      <strong className="text-slate-900">{row.points}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          {t('world.points.tiebreak')}
        </div>
      </details>

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
                  Apply to host World Nations · Season {hostWorkspace?.target_season_number ?? '—'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Applications are always for the next season. A host must provide exactly three races from the same country: one Team Time Trial, one Flat road race and one Hilly/Mountain road race.
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
                  Application type
                </div>
                <div className="mt-2 inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => changeHostScope('qualification')}
                    className={[
                      'rounded-md px-4 py-2 text-sm font-semibold',
                      hostMode === 'qualification'
                        ? 'bg-yellow-400 text-black shadow-sm'
                        : 'text-slate-600 hover:bg-white',
                    ].join(' ')}
                  >
                    Qualification round
                  </button>
                  <button
                    type="button"
                    onClick={() => changeHostScope('final')}
                    className={[
                      'rounded-md px-4 py-2 text-sm font-semibold',
                      hostMode === 'final'
                        ? 'bg-yellow-400 text-black shadow-sm'
                        : 'text-slate-600 hover:bg-white',
                    ].join(' ')}
                  >
                    World Final
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHostMode('routes')
                      setRouteRequestTypes(
                        hostWorkspace?.route_request?.requested_types ??
                        hostWorkspace?.missing_types ??
                        [],
                      )
                      setRouteRequestNote(hostWorkspace?.route_request?.note ?? '')
                    }}
                    className={[
                      'rounded-md px-4 py-2 text-sm font-semibold',
                      hostMode === 'routes'
                        ? 'bg-yellow-400 text-black shadow-sm'
                        : 'text-slate-600 hover:bg-white',
                    ].join(' ')}
                  >
                    Request missing race type
                  </button>
                </div>
              </div>

              {hostMode === 'routes' ? (
                <div className="space-y-4">
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">
                      Request race creation for {hostWorkspace?.viewer_country_code ?? association?.country_code ?? 'your country'}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Use this only when your country is missing one of the three race types required to host World Nations. The request is sent to the Game Control Center for administrator review.
                    </p>
                    {hostWorkspace?.route_request ? (
                      <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        Existing Season {hostWorkspace.route_request.target_season_number} request: {humanize(hostWorkspace.route_request.status)}
                      </div>
                    ) : null}
                  </div>

                  {(hostWorkspace?.missing_types ?? []).length ? (
                    <div className="space-y-2">
                      {(hostWorkspace?.missing_types ?? []).map(type => {
                        const checked = routeRequestTypes.includes(type)
                        return (
                          <label
                            key={type}
                            className="flex cursor-pointer items-center gap-3 rounded border border-slate-200 bg-white px-3 py-3"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setRouteRequestTypes(current =>
                                  checked
                                    ? current.filter(item => item !== type)
                                    : [...current, type],
                                )
                              }
                            />
                            <span className="text-sm font-semibold text-slate-900">
                              {type === 'team_time_trial'
                                ? 'Team Time Trial'
                                : type === 'flat'
                                  ? 'Flat road race'
                                  : 'Hilly / Mountain road race'}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      Your country already has all three required host race types. No race-creation request is needed.
                    </div>
                  )}

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-900">Request note</span>
                    <textarea
                      rows={3}
                      value={routeRequestNote}
                      onChange={event => setRouteRequestNote(event.target.value)}
                      placeholder="Optional details for the administrator, for example preferred city, region or route character."
                      className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Countries already applied for Season {hostWorkspace?.target_season_number ?? '—'}
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
                          No countries have applied for this host type yet.
                        </span>
                      )}
                    </div>
                  </div>

                  {!hostWorkspace?.viewer_can_apply ? (
                    <div className="rounded border border-slate-200 bg-slate-50 p-4">
                      <div className="font-semibold text-slate-900">National Coach only</div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Applications can be viewed by Association members, but only the elected National Coach can submit or change an application.
                      </p>
                    </div>
                  ) : !hostWorkspace?.country_has_complete_bundle ? (
                    <div className="rounded border border-amber-200 bg-amber-50 p-4">
                      <div className="font-semibold text-amber-950">
                        Your country is missing a required host race type
                      </div>
                      <p className="mt-1 text-sm leading-6 text-amber-900">
                        A host application needs exactly one Team Time Trial, one Flat road race and one Hilly/Mountain road race from the same country.
                      </p>
                      <div className="mt-2 text-xs font-medium text-amber-800">
                        Missing: {(hostWorkspace?.missing_types ?? [])
                          .map(type =>
                            type === 'team_time_trial'
                              ? 'Team Time Trial'
                              : type === 'flat'
                                ? 'Flat road race'
                                : 'Hilly / Mountain road race',
                          )
                          .join(', ')}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setHostMode('routes')
                          setRouteRequestTypes(hostWorkspace?.missing_types ?? [])
                        }}
                        className="mt-3 rounded bg-white px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                      >
                        Request missing race type
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                        Exactly three host races will be submitted for Season {hostWorkspace?.target_season_number ?? '—'}.
                      </div>

                      {[
                        {
                          key: 'ttt',
                          label: '1 · Team Time Trial',
                          value: hostTttStageId,
                          onChange: setHostTttStageId,
                          options: hostWorkspace?.stage_options?.team_time_trial ?? [],
                        },
                        {
                          key: 'flat',
                          label: '2 · Flat road race',
                          value: hostFlatStageId,
                          onChange: setHostFlatStageId,
                          options: hostWorkspace?.stage_options?.flat ?? [],
                        },
                        {
                          key: 'mountain',
                          label: '3 · Hilly / Mountain road race',
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
                        <span className="text-sm font-semibold text-slate-900">Application note</span>
                        <textarea
                          rows={3}
                          value={hostStatement}
                          onChange={event => setHostStatement(event.target.value)}
                          placeholder="Optional note about your host proposal."
                          className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
              <button
                type="button"
                onClick={() => setHostModalOpen(false)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  hostSaving ||
                  !hostWorkspace?.viewer_can_apply ||
                  (hostMode === 'routes'
                    ? routeRequestTypes.length === 0
                    : !hostWorkspace?.country_has_complete_bundle ||
                      !hostTttStageId ||
                      !hostFlatStageId ||
                      !hostMountainStageId)
                }
                onClick={() =>
                  void (hostMode === 'routes'
                    ? submitRouteRequest()
                    : submitHostApplication())
                }
                className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hostSaving
                  ? 'Submitting…'
                  : hostMode === 'routes'
                    ? 'Submit race request'
                    : 'Submit host application'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}