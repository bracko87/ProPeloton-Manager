import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  Globe2,
  Loader2,
  MapPin,
  Medal,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'

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
  created_on_game_date?: string | null
  completed_on_game_date?: string | null
}

type GroupEntry = {
  group_entry_id: string
  competition_entry_id: string
  association_id: string
  association_name: string
  country_code: string
  seed_position?: number | null
  final_group_rank?: number | null
  total_points?: number | null
  ttt_points?: number | null
  flat_points?: number | null
  mountain_points?: number | null
  race_wins?: number | null
  podium_finishes?: number | null
  ttt_rank?: number | null
  best_day3_rider_rank?: number | null
  status: string
}

type Group = {
  id: string
  group_number: number
  group_label: string
  planned_entrant_count: number
  planned_advance_count: number
  status: string
  entries: GroupEntry[]
}

type Round = {
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
  groups: Group[]
}

type CompetitionEntry = {
  entry_id: string
  association_id: string
  association_name: string
  country_code: string
  seed_score: number
  status: string
}

type PointCurveRow = {
  race_type: string
  finishing_position: number
  points: number
  version: number
}

type HistoryRow = {
  season_number: number
  association_id: string
  association_name?: string | null
  country_code: string
  final_rank?: number | null
  total_points?: number | null
  was_host?: boolean
}

type QualificationPlanRound = {
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
  active_associations?: number
  final_target?: number
  rounds?: QualificationPlanRound[]
}

type Overview = {
  season_number: number
  current_season_number: number
  current_game_date: string
  active_association_count: number
  qualification_plan?: QualificationPlan
  viewer: Viewer
  edition?: Edition | null
  rounds: Round[]
  entries: CompetitionEntry[]
  points_curve: PointCurveRow[]
  history: HistoryRow[]
}

type ScheduleRow = {
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
  status: string
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
}

function formatGameDate(value?: string | null): string {
  if (!value) return 'TBA'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function statusClasses(status?: string | null): string {
  if (['completed', 'advanced', 'winner', 'champion', 'finalist'].includes(String(status))) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (['planned', 'qualification', 'drawn', 'entered'].includes(String(status))) {
    return 'bg-sky-100 text-sky-800'
  }
  if (['active', 'in_progress'].includes(String(status))) {
    return 'bg-amber-100 text-amber-800'
  }
  if (['eliminated', 'withdrawn', 'cancelled'].includes(String(status))) {
    return 'bg-rose-100 text-rose-700'
  }
  return 'bg-slate-100 text-slate-700'
}

function raceTypeLabel(value?: string | null): string {
  if (value === 'team_time_trial') return 'Team Time Trial'
  if (value === 'flat_road_race') return 'Flat Road Race'
  if (value === 'mountain_road_race') return 'Hilly / Mountain Road Race'
  if (value === 'road_race') return 'Road Race'
  return humanize(value)
}

export default function NationsCompetitionPage(): JSX.Element {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [hostStatement, setHostStatement] = useState('')
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({})
  const [activeView, setActiveView] = useState<'competition' | 'schedule' | 'points' | 'history'>('competition')

  const load = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const overviewResponse = await supabase.rpc('get_nations_competition_overview_v1', {
        p_season_number: null,
      })
      if (overviewResponse.error) throw overviewResponse.error

      const next = (overviewResponse.data ?? null) as Overview | null
      setOverview(next)

      if (next?.edition?.id) {
        const scheduleResponse = await supabase.rpc('get_nations_competition_event_schedule_v1', {
          p_edition_id: next.edition.id,
        })
        if (scheduleResponse.error) throw scheduleResponse.error
        setSchedule((scheduleResponse.data ?? []) as ScheduleRow[])
      } else {
        setSchedule([])
      }

      if (next?.viewer?.host_application?.statement) {
        setHostStatement(next.viewer.host_application.statement)
      }
    } catch (caught: any) {
      setError(caught?.message ?? 'Unable to load World Nations Championship.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const submitHostApplication = async (): Promise<void> => {
    const editionId = overview?.edition?.id
    if (!editionId) return

    try {
      setBusy(true)
      setError(null)
      setMessage(null)
      const { error: rpcError } = await supabase.rpc('submit_nations_host_application_v1', {
        p_edition_id: editionId,
        p_statement: hostStatement.trim() || null,
      })
      if (rpcError) throw rpcError
      setMessage('Host application submitted successfully.')
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? 'Unable to submit the host application.')
    } finally {
      setBusy(false)
    }
  }

  const activeRound = useMemo(
    () =>
      (overview?.rounds ?? []).find(round =>
        ['drawn', 'active', 'in_progress'].includes(round.status),
      ) ?? overview?.rounds?.[0] ?? null,
    [overview?.rounds],
  )

  const myEntry = useMemo(() => {
    const associationId = overview?.viewer?.association_id
    if (!associationId) return null
    return (overview?.entries ?? []).find(entry => entry.association_id === associationId) ?? null
  }, [overview?.entries, overview?.viewer?.association_id])

  const tttPoints = useMemo(
    () => (overview?.points_curve ?? []).filter(row => row.race_type === 'team_time_trial'),
    [overview?.points_curve],
  )
  const roadPoints = useMemo(
    () => (overview?.points_curve ?? []).filter(row => row.race_type === 'road_race'),
    [overview?.points_curve],
  )

  if (loading && !overview) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading World Nations Championship...
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
            <Globe2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              World Nations Championship
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              National teams compete through qualification to reach the 16-nation World Nations Final.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              <Link to="/dashboard/national-association" className="text-yellow-700 hover:underline">
                National Association
              </Link>
              <span className="text-slate-300">•</span>
              <Link to="/dashboard/national-ranking" className="text-yellow-700 hover:underline">
                National Ranking
              </Link>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
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

      <section className="overflow-hidden rounded bg-white shadow">
        <div className="grid gap-px bg-slate-200 md:grid-cols-4">
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Season</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {overview?.season_number ?? '—'}
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatGameDate(overview?.current_game_date)}</p>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Associations</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {overview?.active_association_count ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Eligible National Associations</p>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competition status</div>
            <div className="mt-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(overview?.edition?.status ?? 'planned')}`}>
                {overview?.edition ? humanize(overview.edition.status) : 'Not generated'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Generation starts after the January election window.
            </p>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">My Association</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {myEntry?.country_code ?? (overview?.viewer?.is_member ? 'Entered later' : 'Not a member')}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {myEntry ? humanize(myEntry.status) : overview?.viewer?.is_member ? 'Association active' : 'Join your National Association first'}
            </p>
          </div>
        </div>
      </section>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {[
          ['competition', 'Competition'],
          ['schedule', 'Schedule'],
          ['points', 'Points'],
          ['history', 'History'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveView(key as typeof activeView)}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium transition',
              activeView === key
                ? 'bg-yellow-400 text-black'
                : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === 'competition' ? (
        <>
          {!overview?.edition ? (
            <section className="rounded bg-white p-5 shadow">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-sky-600" />
                <div>
                  <h3 className="font-semibold text-slate-900">Competition not generated yet</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The seasonal Nations competition is generated after the January National Coach election window closes.
                    The qualification structure scales automatically with the number of active National Associations.
                  </p>
                </div>
              </div>

              {(overview?.qualification_plan?.rounds ?? []).length > 0 ? (
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {(overview?.qualification_plan?.rounds ?? []).map(round => (
                    <div key={round.round_index} className="rounded border border-slate-200 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Round {round.round_index}
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">{round.round_label}</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-slate-500">Entrants</div>
                          <div className="font-semibold text-slate-900">{round.entrants_target}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Groups</div>
                          <div className="font-semibold text-slate-900">{round.group_count}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Advance</div>
                          <div className="font-semibold text-slate-900">{round.advance_target}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  A qualification plan will appear once at least one active National Association is available.
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="rounded bg-white shadow">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-600" />
                      <h3 className="font-semibold text-slate-900">
                        {overview.edition.competition_name || 'World Nations Championship'}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {overview.edition.active_association_count} nations · target {overview.edition.finalist_target} finalists
                    </p>
                  </div>
                  {overview.edition.host_country_code ? (
                    <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                      <MapPin className="h-4 w-4" />
                      Host: {overview.edition.host_country_code}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 p-4">
                  {(overview.rounds ?? []).map(round => {
                    const expanded = expandedRounds[round.id] ?? round.id === activeRound?.id
                    return (
                      <div key={round.id} className="overflow-hidden rounded border border-slate-200">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRounds(current => ({
                              ...current,
                              [round.id]: !expanded,
                            }))
                          }
                          className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left"
                        >
                          <div className="flex items-center gap-3">
                            {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                            <div>
                              <div className="font-semibold text-slate-900">{round.round_label}</div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {round.entrants_target} entrants · {round.group_count} groups · {round.advance_target} advance
                              </div>
                            </div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(round.status)}`}>
                            {humanize(round.status)}
                          </span>
                        </button>

                        {expanded ? (
                          <div className="grid gap-4 p-4 xl:grid-cols-2">
                            {(round.groups ?? []).map(group => (
                              <div key={group.id} className="rounded border border-slate-200">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                                  <div>
                                    <div className="font-semibold text-slate-900">{group.group_label}</div>
                                    <div className="text-xs text-slate-500">
                                      Top {group.planned_advance_count} advance
                                    </div>
                                  </div>
                                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClasses(group.status)}`}>
                                    {humanize(group.status)}
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[620px] text-sm">
                                    <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      <tr>
                                        <th className="px-3 py-2">Rank</th>
                                        <th className="px-3 py-2">Nation</th>
                                        <th className="px-3 py-2 text-right">TTT</th>
                                        <th className="px-3 py-2 text-right">Flat</th>
                                        <th className="px-3 py-2 text-right">Mountain</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {(group.entries ?? []).map(entry => {
                                        const flag = flagUrl(entry.country_code)
                                        return (
                                          <tr key={entry.group_entry_id}>
                                            <td className="px-3 py-2.5 font-semibold text-slate-700">
                                              {entry.final_group_rank ? `#${entry.final_group_rank}` : '—'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <div className="flex items-center gap-2">
                                                {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" /> : <Flag className="h-4 w-4 text-slate-400" />}
                                                <span className="font-medium text-slate-900">{entry.association_name}</span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">{entry.ttt_points ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-right">{entry.flat_points ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-right">{entry.mountain_points ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{entry.total_points ?? '—'}</td>
                                            <td className="px-3 py-2.5">
                                              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClasses(entry.status)}`}>
                                                {humanize(entry.status)}
                                              </span>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>

              {overview.viewer?.can_apply_to_host ? (
                <section className="rounded bg-white shadow">
                  <div className="border-b border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-yellow-600" />
                      <h3 className="font-semibold text-slate-900">Apply to host the World Nations Final</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Hosting provides prestige and presentation only. It gives no racing advantage.
                    </p>
                  </div>
                  <div className="p-4">
                    {overview.viewer.host_application ? (
                      <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          Application submitted
                        </div>
                        <div className="mt-1 text-xs">
                          Status: {humanize(overview.viewer.host_application.status)}
                          {overview.viewer.host_application.submitted_on ? ` · ${formatGameDate(overview.viewer.host_application.submitted_on)}` : ''}
                        </div>
                      </div>
                    ) : null}
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={hostStatement}
                      onChange={event => setHostStatement(event.target.value)}
                      placeholder="Optional host statement..."
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-500"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submitHostApplication()}
                        className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                        {overview.viewer.host_application ? 'Update application' : 'Submit application'}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {activeView === 'schedule' ? (
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-sky-600" />
              <h3 className="font-semibold text-slate-900">Competition schedule</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Every group event contains three race days: TTT, Flat and Hilly/Mountain.
            </p>
          </div>

          {schedule.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Round</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Race</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schedule.map(row => (
                    <tr key={row.event_id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.round_label}</td>
                      <td className="px-4 py-3 text-slate-600">{row.group_label}</td>
                      <td className="px-4 py-3 text-slate-600">{row.race_day}</td>
                      <td className="px-4 py-3 text-slate-900">{raceTypeLabel(row.race_type)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatGameDate(row.event_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
                          {humanize(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">
              Event dates have not been scheduled yet.
            </div>
          )}
        </section>
      ) : null}

      {activeView === 'points' ? (
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-yellow-600" />
              <h3 className="font-semibold text-slate-900">Nations Championship Points</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Event total = Team Time Trial points + best three Flat riders + best three Hilly/Mountain riders.
            </p>
          </div>

          <div className="grid gap-5 p-4 xl:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Team Time Trial</h4>
              <div className="mt-3 overflow-hidden rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {tttPoints.map(row => (
                      <tr key={row.finishing_position}>
                        <td className="px-3 py-2">#{row.finishing_position}</td>
                        <td className="px-3 py-2 text-right font-semibold">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900">Road-race rider points</h4>
              <p className="mt-1 text-xs text-slate-500">
                Only the three highest-scoring riders from each nation count on each road-race day.
              </p>
              <div className="mt-3 max-h-[520px] overflow-auto rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {roadPoints.map(row => (
                      <tr key={row.finishing_position}>
                        <td className="px-3 py-2">#{row.finishing_position}</td>
                        <td className="px-3 py-2 text-right font-semibold">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Tie-break order</h4>
            <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-4">
              <div className="rounded bg-slate-50 px-3 py-2">1. Most race wins</div>
              <div className="rounded bg-slate-50 px-3 py-2">2. Most podium finishes</div>
              <div className="rounded bg-slate-50 px-3 py-2">3. Better TTT placing</div>
              <div className="rounded bg-slate-50 px-3 py-2">4. Best Day 3 rider placing</div>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === 'history' ? (
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              <h3 className="font-semibold text-slate-900">World Nations history</h3>
            </div>
          </div>

          {(overview?.history ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Season</th>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Nation</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3">Host</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(overview?.history ?? []).map((row, index) => {
                    const flag = flagUrl(row.country_code)
                    return (
                      <tr key={`${row.season_number}:${row.association_id}:${index}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">Season {row.season_number}</td>
                        <td className="px-4 py-3">
                          {row.final_rank === 1 ? <Trophy className="inline h-4 w-4 text-yellow-600" /> : null}
                          <span className="ml-1">{row.final_rank ? `#${row.final_rank}` : '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" /> : null}
                            <span>{row.association_name ?? row.country_code}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{row.total_points ?? '—'}</td>
                        <td className="px-4 py-3">{row.was_host ? 'Yes' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">
              No completed World Nations Championship history yet.
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
