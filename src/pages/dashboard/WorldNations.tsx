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
  scheduleRows,
}: {
  round: NationsRound
  viewerAssociationId?: string | null
  scheduleRows: EventScheduleRow[]
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
            {t('world.roundSummary', { entrants: round.entrants_target, advance: round.advance_target })}
            {' · '}
            {formatGameDate(round.starts_on_game_date)}
            {round.ends_on_game_date ? ` – ${formatGameDate(round.ends_on_game_date)}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(round.status)}`}>
          {t(`status.${round.status}`, { defaultValue: humanize(round.status) })}
        </span>
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
                  {t('world.groupSummary', { entrants: group.planned_entrant_count, advance: group.planned_advance_count })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewerInGroup ? (
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
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {formatGameDate(event.event_date)}
                    </div>
                    {event.host_country_code ? (
                      <div className="mt-1">
                        <CountryLabel
                          code={event.host_country_code}
                          name={t('world.raceHostShort', { country: event.host_country_code })}
                        />
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(event.status)}`}>
                        {t(`status.${event.status}`, { defaultValue: humanize(event.status) })}
                      </span>
                      <Link
                        to={`/dashboard/national-association/world-nations/events/${event.event_id}`}
                        className="text-[11px] font-semibold text-yellow-700 hover:underline"
                      >
                        {t('world.openRace')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {group.entries?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="border-t border-slate-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{t('world.table.nation')}</th>
                      <th className="px-3 py-2 text-right">{t('world.table.ttt')}</th>
                      <th className="px-3 py-2 text-right">{t('world.table.flat')}</th>
                      <th className="px-3 py-2 text-right">{t('world.table.mountain')}</th>
                      <th className="px-3 py-2 text-right">{t('world.table.total')}</th>
                      <th className="px-3 py-2">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.entries.map((entry, index) => (
                      <tr key={entry.group_entry_id} className="bg-white">
                        <td className="px-3 py-2.5 font-semibold text-slate-600">
                          {entry.final_group_rank ?? index + 1}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          <CountryLabel code={entry.country_code} name={entry.association_name} />
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{entry.ttt_points}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{entry.flat_points}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{entry.mountain_points}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{entry.total_points}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClasses(entry.status)}`}>
                            {t(`status.${entry.status}`, { defaultValue: humanize(entry.status) })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-3 py-5 text-sm text-slate-500">
                {t('world.drawPending')}
              </div>
            )}
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
  const [scheduleRows, setScheduleRows] = useState<EventScheduleRow[]>([])

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
        const { data: eventSchedule, error: eventScheduleError } = await supabase.rpc(
          'get_nations_competition_event_schedule_v1',
          { p_edition_id: next.edition.id },
        )
        if (eventScheduleError) throw eventScheduleError
        setScheduleRows((eventSchedule ?? []) as EventScheduleRow[])
      } else {
        setScheduleRows([])
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
        <div className="mt-2">
          <Link
            to="/dashboard/national-ranking"
            className="text-xs font-semibold text-yellow-700 hover:text-yellow-800 hover:underline"
          >
            {t('world.navRankingChampionship')}
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
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
            <div className="mt-2 text-xl font-semibold text-slate-900">{t('world.nationsCount', { count: 32 })}</div>
            <p className="mt-1 text-xs text-slate-500">{t('world.finalQualificationHelp')}</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

              {t('world.worldFinal')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {data?.edition?.finalist_target ?? data?.qualification_plan?.finalist_target ?? 16} {t('world.nationsLabel')}
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('world.worldFinalHelp')}</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

              {t('world.raceHosts')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {t('world.raceHostsRotating')}
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('world.raceHostsHelp')}</p>
          </div>
        </div>
      </section>

      {!data?.edition ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">

            <div>
              <h3 className="font-semibold text-amber-950">{t('world.noEditionTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                {t('world.noEditionHelp')}
              </p>
              {data?.season_number === 1 ? (
                <p className="mt-2 text-sm font-medium leading-6 text-amber-950">
                  {t('world.season1LaunchNote')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.qualification_plan?.rounds ?? []).map(round => (
              <div key={round.round_index} className="rounded bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('common.roundNumber', { round: round.round_index })}
                </div>
                <div className="mt-1 font-semibold text-slate-900">{round.round_label}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {t('world.projectionAdvance', { entrants: round.entrants_target, advance: round.advance_target })}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('world.groupCount', { count: round.group_count })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(data?.rounds ?? []).map(round => (
        <RoundCard
          key={round.id}
          round={round}
          viewerAssociationId={data?.viewer?.association_id}
          scheduleRows={scheduleRows}
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
    </div>
  )
}
