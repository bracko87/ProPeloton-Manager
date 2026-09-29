import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Flag,
  Globe2,
  Loader2,
  MapPin,
  Medal,
  RefreshCw,
  Route,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'

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
  if (!value) return 'Schedule pending'
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
      ) : (
        <Flag className="h-4 w-4 text-slate-400" />
      )}
      <span>{name || code || '—'}</span>
    </div>
  )
}

function RoundCard({
  round,
  viewerAssociationId,
}: {
  round: NationsRound
  viewerAssociationId?: string | null
}): JSX.Element {
  return (
    <section className="rounded bg-white shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-yellow-600" />
            <h3 className="text-base font-semibold text-slate-900">{round.round_label}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {round.entrants_target} nations → {round.advance_target} advance
            {' · '}
            {formatGameDate(round.starts_on_game_date)}
            {round.ends_on_game_date ? ` – ${formatGameDate(round.ends_on_game_date)}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(round.status)}`}>
          {humanize(round.status)}
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

          return (
          <div key={group.id} className="overflow-hidden rounded border border-slate-200">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2.5">
              <div>
                <div className="font-semibold text-slate-900">{group.group_label}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {group.planned_entrant_count} nations · {group.planned_advance_count} advance
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewerInGroup ? (
                  <Link
                    to={`/dashboard/national-association?cycle=nations:${group.id}`}
                    className="rounded bg-yellow-400 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-yellow-300"
                  >
                    Manage National Team
                  </Link>
                ) : null}
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClasses(group.status)}`}>
                  {humanize(group.status)}
                </span>
              </div>
            </div>

            {group.entries?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="border-t border-slate-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Nation</th>
                      <th className="px-3 py-2 text-right">TTT</th>
                      <th className="px-3 py-2 text-right">Flat</th>
                      <th className="px-3 py-2 text-right">Mountain</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Status</th>
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
                            {humanize(entry.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-3 py-5 text-sm text-slate-500">
                Draw not completed yet.
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
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [hostStatement, setHostStatement] = useState('')
  const [hostSaving, setHostSaving] = useState(false)

  const load = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const { data: response, error: rpcError } = await supabase.rpc(
        'get_nations_competition_overview_v1',
        { p_season_number: null },
      )
      if (rpcError) throw rpcError
      setData((response ?? null) as Overview | null)
    } catch (caught: any) {
      setError(caught?.message ?? 'Unable to load World Nations Championship.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    setHostStatement(data?.viewer?.host_application?.statement ?? '')
  }, [data?.viewer?.host_application?.statement])

  const submitHostApplication = async (): Promise<void> => {
    const editionId = data?.edition?.id
    if (!editionId) return

    try {
      setHostSaving(true)
      setError(null)
      setMessage(null)
      const { error: rpcError } = await supabase.rpc('submit_nations_host_application_v1', {
        p_edition_id: editionId,
        p_statement: hostStatement.trim() || null,
      })
      if (rpcError) throw rpcError
      setMessage('Host application submitted. Hosting is selected by rotation, never by spending.')
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? 'Unable to submit the host application.')
    } finally {
      setHostSaving(false)
    }
  }

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
          Loading World Nations Championship...
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-7 w-7 text-yellow-600" />
            <h2 className="text-2xl font-semibold text-slate-900">World Nations Championship</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Association-based international competition: TTT, Flat and Hilly/Mountain over three race days.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <Link
              to="/dashboard/national-association"
              className="text-yellow-700 hover:text-yellow-800 hover:underline"
            >
              National Association
            </Link>
            <span className="text-slate-300">•</span>
            <Link
              to="/dashboard/national-ranking"
              className="text-yellow-700 hover:text-yellow-800 hover:underline"
            >
              National Ranking & Championship
            </Link>
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
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Users className="h-4 w-4" />
              Active Associations
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {data?.edition?.active_association_count ?? data?.active_association_count ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Season {data?.season_number ?? '—'}</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              Final Qualification
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">32 nations</div>
            <p className="mt-1 text-xs text-slate-500">4 groups of 8 · top 4 advance when the field reaches 32</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Trophy className="h-4 w-4" />
              World Final
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {data?.edition?.finalist_target ?? data?.qualification_plan?.finalist_target ?? 16} nations
            </div>
            <p className="mt-1 text-xs text-slate-500">One three-day final determines the champion nation</p>
          </div>

          <div className="bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin className="h-4 w-4" />
              Host
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {data?.edition?.host_country_code ?? 'Pending'}
            </div>
            <p className="mt-1 text-xs text-slate-500">Rotation and history only · no spending advantage</p>
          </div>
        </div>
      </section>

      {!data?.edition ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h3 className="font-semibold text-amber-950">Current season edition not generated yet</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                The competition field is created from active National Associations. The structure below is the live projection for the current field size.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.qualification_plan?.rounds ?? []).map(round => (
              <div key={round.round_index} className="rounded bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Round {round.round_index}
                </div>
                <div className="mt-1 font-semibold text-slate-900">{round.round_label}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {round.entrants_target} → {round.advance_target} nations
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {round.group_count} group{round.group_count === 1 ? '' : 's'}
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
        />
      ))}

      {data?.edition ? (
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-yellow-600" />
              <h3 className="text-base font-semibold text-slate-900">World Nations Final host</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              National Coaches may apply. The selected host receives presentation prestige only; there is no sporting advantage.
            </p>
          </div>

          <div className="p-4">
            {data.viewer?.host_application ? (
              <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-900">
                    Your Association application: {humanize(data.viewer.host_application.status)}
                  </span>
                </div>
                {data.viewer.host_application.submitted_on ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Submitted {formatGameDate(data.viewer.host_application.submitted_on)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {data.viewer?.can_apply_to_host ? (
              <>
                <textarea
                  rows={4}
                  value={hostStatement}
                  onChange={event => setHostStatement(event.target.value)}
                  placeholder="Optional hosting statement..."
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-yellow-500"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={hostSaving}
                    onClick={() => void submitHostApplication()}
                    className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {hostSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {data.viewer.host_application ? 'Update application' : 'Apply to host'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">
                {data.edition.host_country_code
                  ? `Host selected: ${data.edition.host_country_code}`
                  : 'Host applications are available to the active National Coach.'}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-yellow-600" />
            <h3 className="text-base font-semibold text-slate-900">Nations Championship Points</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Overall ranking is points-based, not summed race time. Day 1 scores the TTT; on Days 2 and 3 only the best three riders from each nation score.
          </p>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <div className="rounded border border-slate-200 p-4">
            <div className="font-semibold text-slate-900">Day 1 · Team Time Trial</div>
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
            <div className="font-semibold text-slate-900">Days 2–3 · Road race rider points</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
              {roadCurve.slice(0, 16).map(row => (
                <div key={row.finishing_position} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-2">
                  <span className="text-slate-500">#{row.finishing_position}</span>
                  <span className="font-semibold text-slate-900">{row.points}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              The three highest-scoring riders from the nation count toward that day's nation score.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Tie-break order: most race wins → most podium finishes → better TTT placing → best-placed rider on Day 3.
        </div>
      </section>

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            <h3 className="text-base font-semibold text-slate-900">World Nations history</h3>
          </div>
        </div>

        {champions.length ? (
          <div className="divide-y divide-slate-200">
            {champions.map(row => (
              <div key={`${row.season_number}:${row.country_code}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Season {row.season_number}
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    <CountryLabel code={row.country_code} name={row.association_name} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">{row.total_points} pts</div>
                  {row.was_host ? <div className="mt-0.5 text-xs text-slate-500">Host champion</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            No completed World Nations Championship yet.
          </div>
        )}
      </section>
    </div>
  )
}
