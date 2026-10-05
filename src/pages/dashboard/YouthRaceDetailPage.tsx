import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '@/lib/supabase'

type CompetitionClass = 'regional' | 'continental' | 'world'
type DetailTab = 'overview' | 'teams' | 'squad' | 'results'

type YouthRaceDetailPayload = {
  game_date: string
  race: {
    id: string
    season_number: number
    race_name: string
    race_date: string
    race_end_date: string
    race_days: number
    competition_class: CompetitionClass
    division_code?: string | null
    host_city?: string | null
    host_country_code?: string | null
    terrain_type: string
    distance_km: number
    entry_cost: number
    entry_fee?: number
    prize_fund_cash: number
    lineup_size: number
    team_limit: number
    entries_count: number
    status: 'scheduled' | 'completed' | 'cancelled'
    results_published_at?: string | null
    start_time_region_code?: string | null
    planned_start_time_label?: string | null
  }
  stages: Array<{
    id: string
    stage_number: number
    stage_date: string
    stage_type: string
    distance_km: number
    planned_start_time_label?: string | null
    start_time_region_code?: string | null
    start_city?: string | null
    finish_city?: string | null
    sprint_points_total: number
    mountain_points_total: number
    time_trial_points_total: number
    status: string
    results: Array<{
      position?: number | null
      rider_id: string
      rider_name: string
      country_code: string
      academy_id: string
      academy_name: string
      jersey_url?: string | null
      result_status: string
      gap_seconds?: number | null
      time_seconds?: number | null
      sprint_points: number
      mountain_points: number
      time_trial_points: number
    }>
  }>
  my_entry: {
    id: string
    status: 'entered' | 'completed'
    entered_on: string
    entered_by: string
    strategy: 'conservative' | 'balanced' | 'aggressive'
    race_squad_decider: 'manager' | 'u16_head_coach'
    entry_fee?: number
    travel_cost_total?: number
    accommodation_cost_total?: number
    logistics_cost_total?: number
    staff_accommodation_cost_total?: number
    equipment_support_cost_total?: number
    total_participation_cost?: number
  }
  teams: Array<{
    academy_id: string
    club_name: string
    country_code: string
    jersey_url?: string | null
    is_ai: boolean
    entry_status: string
    lineup_count: number
    is_mine: boolean
    team_position?: number | null
    prize_cash: number
    logo_path?: string | null
  }>
  my_lineup: Array<{
    rider_id: string
    name: string
    country_code: string
    role: string
    readiness: number
    fatigue: number
  }>
  eligible_riders: Array<{
    rider_id: string
    name: string
    country_code: string
    role: string
    readiness: number
    fatigue: number
    eligible: boolean
  }>
  rider_results: Array<{
    position?: number | null
    rider_id: string
    rider_name: string
    country_code: string
    academy_id: string
    academy_name: string
    jersey_url?: string | null
    result_status: string
    gap_seconds?: number | null
    general_points?: number
    sprint_points?: number
    mountain_points?: number
    time_trial_points?: number
    ranking_points?: number
  }>
  classifications: {
    sprint: Array<{ rider_id: string; rider_name: string; country_code: string; academy_name: string; points: number }>
    mountain: Array<{ rider_id: string; rider_name: string; country_code: string; academy_name: string; points: number }>
    time_trial: Array<{ rider_id: string; rider_name: string; country_code: string; academy_name: string; points: number }>
  }
  team_results: Array<{
    team_position: number
    academy_id: string
    academy_name: string
    country_code: string
    jersey_url?: string | null
    prize_cash: number
    is_mine: boolean
  }>
}

function money(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function flagUrl(code: string | null | undefined): string | null {
  const safe = String(code ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(safe) ? `https://flagcdn.com/w40/${safe}.png` : null
}

function JerseyThumb({ url, name }: { url?: string | null; name: string }): JSX.Element {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt={`${name} jersey`} className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="text-[9px] text-slate-400">Kit</span>
      )}
    </span>
  )
}

function classLabel(value: CompetitionClass): string {
  if (value === 'world') return 'World Class'
  if (value === 'continental') return 'Continental Class'
  return 'Regional Class'
}

function classBadge(value: CompetitionClass): string {
  if (value === 'world') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (value === 'continental') return 'border-orange-200 bg-orange-50 text-orange-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function statusInfo(
  payload: YouthRaceDetailPayload
): { label: string; className: string } {
  const race = payload.race
  const gameDate = String(payload.game_date ?? '').slice(0, 10)
  const start = String(race.race_date ?? '').slice(0, 10)
  const end = String(race.race_end_date ?? race.race_date ?? '').slice(0, 10)

  if (race.status === 'completed' || (gameDate && gameDate > end)) {
    return { label: 'Finished', className: 'bg-slate-100 text-slate-700' }
  }

  if (race.status === 'scheduled' && gameDate >= start && gameDate <= end) {
    return { label: 'Active', className: 'bg-emerald-50 text-emerald-700' }
  }

  return { label: 'Scheduled', className: 'bg-amber-50 text-amber-800' }
}

function Section({
  title,
  children,
  right,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function YouthRaceDetailPage(): JSX.Element {
  const { raceId } = useParams()
  const navigate = useNavigate()
  const [payload, setPayload] = useState<YouthRaceDetailPayload | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [selectedRiders, setSelectedRiders] = useState<string[]>([])
  const [strategy, setStrategy] =
    useState<'conservative' | 'balanced' | 'aggressive'>('balanced')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedStageNumber, setSelectedStageNumber] = useState(1)
  const [resultView, setResultView] = useState<'general' | 'sprint' | 'mountain' | 'time_trial'>('general')
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    if (!raceId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: loadError } = await supabase.rpc(
        'get_my_youth_race_detail_v1',
        { p_race_id: raceId }
      )
      if (loadError) throw loadError
      const next = data as YouthRaceDetailPayload
      setPayload(next)
      setSelectedRiders((next.my_lineup ?? []).map(rider => rider.rider_id))
      setStrategy(next.my_entry?.strategy ?? 'balanced')
      setSelectedStageNumber(current =>
        (next.stages ?? []).some(stage => stage.stage_number === current)
          ? current
          : Number(next.stages?.[0]?.stage_number ?? 1)
      )
    } catch (loadError: any) {
      console.error('Youth race detail load failed:', loadError)
      setError(
        loadError?.message ??
          'This Youth race page is available only for races your Academy participates in.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [raceId])

  const canManageSquad =
    payload?.my_entry?.status === 'entered' &&
    payload?.my_entry?.race_squad_decider === 'manager' &&
    payload?.race?.status === 'scheduled'

  const status = useMemo(
    () => (payload ? statusInfo(payload) : null),
    [payload]
  )

  const toggleRider = (riderId: string, eligible: boolean): void => {
    if (!eligible || !payload) return
    setSelectedRiders(current => {
      if (current.includes(riderId)) {
        return current.filter(id => id !== riderId)
      }
      if (current.length >= Number(payload.race.lineup_size ?? 0)) {
        return current
      }
      return [...current, riderId]
    })
  }

  const saveLineup = async (): Promise<void> => {
    if (!raceId || !payload || !canManageSquad || saving) return
    if (
      selectedRiders.length < 3 ||
      selectedRiders.length > Number(payload.race.lineup_size ?? 0)
    ) {
      setError(
        `Select between 3 and ${payload.race.lineup_size} riders for this Youth race.`
      )
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: saveError } = await supabase.rpc(
        'save_my_youth_race_lineup_v1',
        {
          p_race_id: raceId,
          p_rider_ids: selectedRiders,
          p_strategy: strategy,
        }
      )
      if (saveError) throw saveError
      await load()
    } catch (saveError: any) {
      console.error('Youth race lineup save failed:', saveError)
      setError(saveError?.message ?? 'Unable to save the Youth race squad.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading Youth race…</div>
  }

  if (!payload || error && !payload) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/youth-academy?tab=calendar')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
        >
          ← Back to Youth Calendar
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error ??
            'This Youth race page is available only for races your Academy participates in.'}
        </div>
      </div>
    )
  }

  const { race } = payload
  const raceDays = Math.max(1, Number(race.race_days ?? 1))
  const isFinished = race.status === 'completed'
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'teams', label: `Teams (${payload.teams.length})` },
    { key: 'squad', label: 'My Squad' },
    { key: 'results', label: 'Results' },
  ]

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate('/dashboard/youth-academy?tab=calendar')}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        ← Back to Youth Calendar
      </button>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-5">
            <div className="flex min-w-[88px] flex-col items-center justify-center rounded-xl bg-slate-50 px-3 py-3 text-center">
              <span className="text-sm font-semibold text-slate-950">
                {shortDate(race.race_date)}
              </span>
              {race.race_end_date !== race.race_date ? (
                <span className="mt-1 text-sm font-semibold text-slate-950">
                  {shortDate(race.race_end_date)}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {flagUrl(race.host_country_code) ? (
                  <img
                    src={flagUrl(race.host_country_code) ?? ''}
                    alt=""
                    className="h-4 w-6 rounded-sm object-cover"
                  />
                ) : null}
                <h1 className="text-2xl font-semibold text-slate-950">
                  {race.race_name}
                </h1>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {race.host_city ? `${race.host_city} · ` : ''}
                {humanize(race.terrain_type)} · {race.distance_km} km
                {raceDays > 1 ? ' / stage' : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {status ? (
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
            ) : null}
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${classBadge(race.competition_class)}`}>
              {classLabel(race.competition_class)}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
              {race.entries_count} / {race.team_limit} teams
            </span>
            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
              Prize fund {money(race.prize_fund_cash)}
            </span>
          </div>
        </div>
      </section>

      <div className="inline-flex flex-wrap rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        {tabs.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === item.key
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <Section title="Race information">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Competition', classLabel(race.competition_class)],
              ['Dates', race.race_end_date !== race.race_date
                ? `${shortDate(race.race_date)} – ${shortDate(race.race_end_date)}`
                : shortDate(race.race_date)],
              ['Race length', raceDays === 1 ? '1 day' : `${raceDays} days`],
              ['Distance', `${race.distance_km} km${raceDays > 1 ? ' / stage' : ''}`],
              ['Teams', `${race.entries_count} / ${race.team_limit}`],
              ['Prize fund', money(race.prize_fund_cash)],
              ['Entry fee', money(race.entry_fee ?? race.entry_cost)],
              ['My entry', humanize(payload.my_entry.status)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            The prize fund is paid to the best Youth Academy teams after the race.
            Up to five teams receive prize money, with the winner receiving the largest share.
          </p>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Participation cost</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Entry fee', money(payload.my_entry.entry_fee ?? race.entry_fee ?? race.entry_cost)],
                ['Travel', money(payload.my_entry.travel_cost_total)],
                ['Rider accommodation', money(payload.my_entry.accommodation_cost_total)],
                ['Staff accommodation', money(payload.my_entry.staff_accommodation_cost_total)],
                ['Logistics', money(payload.my_entry.logistics_cost_total)],
                ['Equipment & race support', money(payload.my_entry.equipment_support_cost_total)],
                ['Staff travelling', '2'],
                ['Total deducted', money(payload.my_entry.total_participation_cost ?? race.entry_cost)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Stages</h3>
              <span className="text-xs text-slate-500">{payload.stages.length} stage{payload.stages.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {payload.stages.map(stage => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => {
                    setSelectedStageNumber(stage.stage_number)
                    if (stage.status === 'completed') setTab('results')
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Stage {stage.stage_number} · {shortDate(stage.stage_date)}
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">{humanize(stage.stage_type)}</div>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                      {stage.planned_start_time_label ?? '—'}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    {stage.start_city && stage.finish_city
                      ? `${stage.start_city} → ${stage.finish_city}`
                      : race.host_city ?? 'Route TBC'}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{stage.distance_km} km</div>
                </button>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {tab === 'teams' ? (
        <Section title="Participating teams">
          <div className="space-y-2">
            {payload.teams.map((team, index) => {
              const flag = flagUrl(team.country_code)
              return (
                <div
                  key={team.academy_id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 ${
                    team.is_mine
                      ? 'border-yellow-300 bg-yellow-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-7 text-center text-xs font-semibold text-slate-500">
                      {team.team_position ? `#${team.team_position}` : index + 1}
                    </span>
                    {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm object-cover" /> : null}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {team.club_name}
                        {team.is_mine ? ' · My Academy' : ''}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {team.lineup_count} riders selected
                      </div>
                    </div>
                  </div>
                  {isFinished && team.prize_cash > 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {money(team.prize_cash)}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {tab === 'squad' ? (
        <Section
          title="My Youth race squad"
          right={
            <span className="text-xs text-slate-500">
              {selectedRiders.length} / {race.lineup_size}
            </span>
          }
        >
          {canManageSquad ? (
            <>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {payload.eligible_riders.map(rider => {
                  const selected = selectedRiders.includes(rider.rider_id)
                  const flag = flagUrl(rider.country_code)
                  return (
                    <button
                      key={rider.rider_id}
                      type="button"
                      disabled={!rider.eligible}
                      onClick={() => toggleRider(rider.rider_id, rider.eligible)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left ${
                        !rider.eligible
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                          : selected
                            ? 'border-yellow-400 bg-yellow-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        readOnly
                        checked={selected}
                        disabled={!rider.eligible}
                      />
                      {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm object-cover" /> : null}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {rider.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {humanize(rider.role)} · {rider.readiness}% ready · {rider.fatigue}% fatigue
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <label className="text-xs font-medium text-slate-600">
                  Strategy
                  <select
                    value={strategy}
                    onChange={event =>
                      setStrategy(
                        event.target.value as
                          | 'conservative'
                          | 'balanced'
                          | 'aggressive'
                      )
                    }
                    className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="conservative">Conservative</option>
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={
                    saving ||
                    selectedRiders.length < 3 ||
                    selectedRiders.length > race.lineup_size
                  }
                  onClick={() => void saveLineup()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save squad'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {payload.my_lineup.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No Youth race squad has been selected yet.
                </p>
              ) : (
                payload.my_lineup.map((rider, index) => (
                  <div
                    key={rider.rider_id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>{index + 1}. {rider.name}</span>
                    <span className="text-xs text-slate-500">{humanize(rider.role)}</span>
                  </div>
                ))
              )}
              {payload.my_entry.race_squad_decider !== 'manager' ? (
                <p className="pt-2 text-xs text-slate-500">
                  Squad selection is delegated to the U16 Head Coach.
                </p>
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      {tab === 'results' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {([
              ['general', 'General'],
              ['sprint', 'Sprint'],
              ['mountain', 'Mountain'],
              ['time_trial', 'Time Trial'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setResultView(key)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  resultView === key ? 'bg-yellow-400 text-black' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Section title={
              resultView === 'general'
                ? 'General classification'
                : resultView === 'sprint'
                  ? 'Sprint classification'
                  : resultView === 'mountain'
                    ? 'Mountain classification'
                    : 'Time Trial classification'
            }>
              {resultView === 'general' ? (
                payload.rider_results.length === 0 ? (
                  <p className="text-sm text-slate-500">General classification will appear as stages are completed.</p>
                ) : (
                  <div className="space-y-1.5">
                    {payload.rider_results.map((result, index) => {
                      const flag = flagUrl(result.country_code)
                      return (
                        <div key={`${result.rider_id}:${index}`} className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <strong>{result.position ? `#${result.position}` : result.result_status.toUpperCase()}</strong>
                          <span className="flex min-w-0 items-center gap-2">
                            <JerseyThumb url={result.jersey_url} name={result.academy_name} />
                            {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm object-cover" /> : null}
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{result.rider_name}</span>
                              <span className="block truncate text-xs text-slate-500">{result.academy_name}</span>
                            </span>
                          </span>
                          <span className="text-xs font-medium text-slate-600">{Number(result.ranking_points ?? 0)} pts</span>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                (() => {
                  const rows = payload.classifications?.[resultView] ?? []
                  return rows.length === 0 ? (
                    <p className="text-sm text-slate-500">No points are available for this classification in this race.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {rows.map((row, index) => (
                        <div key={row.rider_id} className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <strong>#{index + 1}</strong>
                          <span>{row.rider_name}</span>
                          <span className="font-medium">{row.points} pts</span>
                        </div>
                      ))}
                    </div>
                  )
                })()
              )}
            </Section>

            <Section
              title="Stage results"
              right={
                <select
                  value={selectedStageNumber}
                  onChange={event => setSelectedStageNumber(Number(event.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  {payload.stages.map(stage => (
                    <option key={stage.id} value={stage.stage_number}>
                      Stage {stage.stage_number} · {shortDate(stage.stage_date)} · {humanize(stage.stage_type)}
                    </option>
                  ))}
                </select>
              }
            >
              {(() => {
                const stage = payload.stages.find(item => item.stage_number === selectedStageNumber)
                if (!stage) return <p className="text-sm text-slate-500">No stage selected.</p>
                if (stage.status !== 'completed' || stage.results.length === 0) {
                  return (
                    <div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Date</div><div className="mt-1 text-sm font-medium">{shortDate(stage.stage_date)}</div></div>
                        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Type</div><div className="mt-1 text-sm font-medium">{humanize(stage.stage_type)}</div></div>
                        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Route</div><div className="mt-1 text-sm font-medium">{stage.start_city && stage.finish_city ? `${stage.start_city} → ${stage.finish_city}` : race.host_city ?? '—'}</div></div>
                        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Distance / start</div><div className="mt-1 text-sm font-medium">{stage.distance_km} km · {stage.planned_start_time_label ?? '—'}</div></div>
                      </div>
                      <p className="mt-4 text-sm text-slate-500">Stage results will appear after this stage is completed.</p>
                    </div>
                  )
                }
                return (
                  <div className="space-y-1.5">
                    {stage.results.map((result, index) => (
                      <div key={`${result.rider_id}:${index}`} className="grid grid-cols-[46px_minmax(0,1fr)_minmax(130px,210px)] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <strong>{result.position ? `#${result.position}` : result.result_status.toUpperCase()}</strong>
                        <span className="truncate font-medium">{result.rider_name}</span>
                        <span className="flex min-w-0 items-center justify-end gap-2 text-xs text-slate-500">
                          <JerseyThumb url={result.jersey_url} name={result.academy_name} />
                          <span className="truncate">{result.academy_name}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Section>
          </div>

          {isFinished ? (
            <Section title="Team classification & prize money">
              <div className="space-y-2">
                {payload.team_results.map(team => {
                  const flag = flagUrl(team.country_code)
                  return (
                    <div key={team.academy_id} className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm ${team.is_mine ? 'bg-yellow-50' : 'bg-slate-50'}`}>
                      <strong>#{team.team_position}</strong>
                      <span className="flex min-w-0 items-center gap-2">
                        <JerseyThumb url={team.jersey_url} name={team.academy_name} />
                        {flag ? <img src={flag} alt="" className="h-4 w-6 rounded-sm object-cover" /> : null}
                        <span className="truncate">{team.academy_name}</span>
                      </span>
                      <span className="font-medium text-emerald-700">{team.prize_cash > 0 ? money(team.prize_cash) : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
