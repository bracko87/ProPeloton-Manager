import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Flag,
  Loader2,
  Lock,
  Medal,
  RefreshCw,
  Save,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type RankingRow = {
  national_rank: number
  rider_id: string
  club_id?: string | null
  rider_name: string
  country_code: string
  raw_points: number
  weighted_points: number
  best_weighted_result?: number
  latest_result_date?: string | null
  overall?: number | null
}

type CountryOption = {
  code: string
  name: string
  status: string
  final_date: string
}

type HeatRow = {
  id: string
  heat_number: number
  qualification_date: string
  qualifying_places: number
  assigned_count: number
  race_id?: string | null
  status: string
}

type RiderPlan = {
  id?: string
  equipment_setup_id?: string | null
  phase_1_command?: string
  phase_2_command?: string
  phase_3_command?: string
  phase_4_command?: string
}

type MyEntry = {
  entry_id: string
  rider_id: string
  rider_name: string
  national_rank: number
  entry_path: 'direct' | 'qualification'
  entry_status: string
  heat_id?: string | null
  heat_number?: number | null
  qualification_race_id?: string | null
  final_race_id?: string | null
  qualification_plan?: RiderPlan | null
  final_plan?: RiderPlan | null
  club_id?: string | null
  club_name?: string | null
}

type EquipmentPreset = {
  id: string
  club_id: string
  setup_name: string
  setup_slot: number
}

type ResultRow = {
  event_type: 'qualification' | 'final'
  heat_id?: string | null
  rider_id: string
  rider_name: string
  club_id?: string | null
  club_name?: string | null
  rank: number
  status: string
  race_id?: string | null
}

type PastChampion = {
  season_number: number
  country_code: string
  champion_rider_id: string
  champion_name_snapshot: string
  champion_club_id?: string | null
  champion_club_name_snapshot?: string | null
  final_race_id?: string | null
}

type EditionRow = {
  id: string
  season_number: number
  country_code: string
  ranking_snapshot_date: string
  qualification_date: string
  final_date: string
  status: string
  eligible_count?: number | null
  final_field_size: number
  direct_qualifier_count?: number | null
  qualification_places?: number | null
  qualification_heat_count?: number | null
  final_race_id?: string | null
  champion_rider_id?: string | null
  champion_name_snapshot?: string | null
  champion_club_name_snapshot?: string | null
}

type NationalPageData = {
  season_number: number
  current_game_date: string
  country_code: string
  countries: CountryOption[]
  edition: EditionRow | null
  organizer_supplies: Record<string, unknown>
  preparation_mode: Record<string, unknown>
  ranking_is_frozen: boolean
  ranking: RankingRow[]
  heats: HeatRow[]
  my_entries: MyEntry[]
  equipment_presets: EquipmentPreset[]
  results: ResultRow[]
  past_champions: PastChampion[]
}

type PlanDraft = {
  equipmentSetupId: string
  phase1: string
  phase2: string
  phase3: string
  phase4: string
}

type EventType = 'qualification' | 'final'

const TACTIC_OPTIONS = [
  ['follow_team_plan', 'Follow balanced plan'],
  ['conserve_energy', 'Conserve energy'],
  ['stay_near_front', 'Stay near front'],
  ['control_tempo', 'Control tempo'],
  ['join_breakaway', 'Join breakaway'],
  ['attack', 'Attack'],
  ['chase_breakaway', 'Chase breakaway'],
  ['climb_hard', 'Climb hard'],
  ['sprint', 'Sprint'],
  ['avoid_risks', 'Avoid risks'],
] as const

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatPoints(value?: number | null): string {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(numeric)
    : '0'
}

function statusLabel(value?: string | null): string {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function planFromValue(value?: RiderPlan | null): PlanDraft {
  return {
    equipmentSetupId: value?.equipment_setup_id ?? '',
    phase1: value?.phase_1_command ?? 'follow_team_plan',
    phase2: value?.phase_2_command ?? 'follow_team_plan',
    phase3: value?.phase_3_command ?? 'follow_team_plan',
    phase4: value?.phase_4_command ?? 'follow_team_plan',
  }
}

function planKey(riderId: string, eventType: EventType): string {
  return `${riderId}:${eventType}`
}

function NationalDutyPlanCard({
  entry,
  eventType,
  eventDate,
  raceId,
  plan,
  equipmentPresets,
  onChange,
  onSave,
  saving,
}: {
  entry: MyEntry
  eventType: EventType
  eventDate?: string | null
  raceId?: string | null
  plan: PlanDraft
  equipmentPresets: EquipmentPreset[]
  onChange: (next: PlanDraft) => void
  onSave: () => void
  saving: boolean
}) {
  const eventName =
    eventType === 'qualification'
      ? `Qualification Heat ${entry.heat_number ?? ''}`.trim()
      : 'National Championship Final'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h4 className="text-base font-bold text-slate-900">{eventName}</h4>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(eventDate)}
            {raceId ? (
              <>
                {' · '}
                <Link
                  className="font-medium text-blue-600 hover:text-blue-700"
                  to={`/dashboard/races/${raceId}`}
                >
                  Open race
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Team plan: Balanced
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Bike className="h-4 w-4" />
            Rider equipment
          </span>
          <select
            value={plan.equipmentSetupId}
            onChange={event =>
              onChange({ ...plan, equipmentSetupId: event.target.value })
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"
          >
            <option value="">Club default equipment</option>
            {equipmentPresets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.setup_name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Equipment is the only club inventory choice used here. Staff, vehicles and race
            supplies are organizer-managed.
          </p>
        </label>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Individual race strategy
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Start', 'phase1'],
              ['Early / middle', 'phase2'],
              ['Late race', 'phase3'],
              ['Finish', 'phase4'],
            ].map(([label, key]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs text-slate-500">{label}</span>
                <select
                  value={plan[key as keyof PlanDraft]}
                  onChange={event =>
                    onChange({
                      ...plan,
                      [key]: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                >
                  {TACTIC_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save rider plan
        </button>
      </div>
    </div>
  )
}

export default function NationalRankingPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const queryCountry = useMemo(
    () => new URLSearchParams(location.search).get('country')?.toUpperCase() ?? '',
    [location.search],
  )

  const [countryCode, setCountryCode] = useState(queryCountry)
  const [data, setData] = useState<NationalPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadPage = async (requestedCountry?: string): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_national_ranking_page_v1',
        {
          p_country_code: requestedCountry || null,
          p_season_number: null,
          p_limit: 200,
        },
      )

      if (rpcError) throw rpcError

      const next = (rpcData ?? null) as NationalPageData | null
      if (!next) throw new Error('National Ranking data is unavailable.')

      setData(next)

      const resolvedCountry = next.country_code || requestedCountry || ''
      setCountryCode(resolvedCountry)

      if (resolvedCountry && resolvedCountry !== queryCountry) {
        navigate(
          `${location.pathname}?country=${encodeURIComponent(resolvedCountry)}`,
          { replace: true },
        )
      }

      const nextDrafts: Record<string, PlanDraft> = {}
      for (const entry of next.my_entries ?? []) {
        nextDrafts[planKey(entry.rider_id, 'qualification')] = planFromValue(
          entry.qualification_plan,
        )
        nextDrafts[planKey(entry.rider_id, 'final')] = planFromValue(entry.final_plan)
      }
      setDrafts(nextDrafts)
    } catch (caught: any) {
      setError(caught?.message ?? 'Failed to load National Ranking.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage(queryCountry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryCountry])

  const onCountryChange = (nextCountry: string): void => {
    setCountryCode(nextCountry)
    navigate(
      `${location.pathname}?country=${encodeURIComponent(nextCountry)}`,
      { replace: true },
    )
  }

  const savePlan = async (entry: MyEntry, eventType: EventType): Promise<void> => {
    const key = planKey(entry.rider_id, eventType)
    const draft = drafts[key] ?? planFromValue(null)

    try {
      setSavingKey(key)
      setSaveMessage(null)

      const { error: saveError } = await supabase.rpc(
        'save_my_national_championship_rider_plan_v1',
        {
          p_edition_id: data?.edition?.id,
          p_event_type: eventType,
          p_rider_id: entry.rider_id,
          p_equipment_setup_id: draft.equipmentSetupId || null,
          p_phase_1_command: draft.phase1,
          p_phase_2_command: draft.phase2,
          p_phase_3_command: draft.phase3,
          p_phase_4_command: draft.phase4,
        },
      )

      if (saveError) throw saveError

      setSaveMessage(`${entry.rider_name}: ${statusLabel(eventType)} plan saved.`)
      await loadPage(countryCode)
    } catch (caught: any) {
      setSaveMessage(caught?.message ?? 'Could not save rider plan.')
    } finally {
      setSavingKey(null)
    }
  }

  const edition = data?.edition ?? null
  const finalResults = (data?.results ?? []).filter(result => result.event_type === 'final')
  const qualificationResults = (data?.results ?? []).filter(
    result => result.event_type === 'qualification',
  )

  const countryName =
    data?.countries.find(country => country.code === data.country_code)?.name ??
    data?.country_code ??
    'National'

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading National Ranking…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
        <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              <Flag className="h-4 w-4" />
              National competition
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              {countryName} National Ranking
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Rider-only national ranking, championship qualification, National Duty and
              individual championship preparation. Team Ranking points are not affected.
            </p>
          </div>

          <div className="min-w-[220px]">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Country
            </label>
            <select
              value={countryCode}
              onChange={event => onCountryChange(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none"
            >
              {(data?.countries ?? []).map(country => (
                <option key={country.code} value={country.code} className="text-slate-900">
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {saveMessage}
        </div>
      ) : null}

      {edition ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-4 w-4" />
              Ranking freeze
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900">
              {formatDate(edition.ranking_snapshot_date)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data?.ranking_is_frozen ? 'Ranking frozen for this edition' : 'Live ranking still moving'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Medal className="h-4 w-4" />
              Qualification
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900">
              {edition.qualification_heat_count
                ? formatDate(edition.qualification_date)
                : 'Not required'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {edition.qualification_heat_count
                ? `${edition.qualification_heat_count} heat(s) · ${edition.qualification_places ?? 0} final places`
                : 'Field fits directly into the final'}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <Trophy className="h-4 w-4" />
              National final
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900">
              {formatDate(edition.final_date)}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Target field {edition.final_field_size} · {statusLabel(edition.status)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              Preparation
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900">Rider controlled</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Equipment + individual tactics. Staff, assets and supplies are standardized.
            </div>
          </div>
        </section>
      ) : null}

      {(data?.my_entries?.length ?? 0) > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">My National Duty</h2>
              <p className="mt-1 text-sm text-slate-500">
                These riders are entered automatically. You only manage their equipment and individual race strategy.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <Lock className="h-4 w-4" />
              Team plan, staff, assets and supplies are locked
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="font-semibold text-emerald-900">Organizer race pack</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-800">
              <span className="rounded-full bg-white/70 px-3 py-1">
                {String(data?.organizer_supplies?.bidons_water_bottles ?? 8)} bidons
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {String(data?.organizer_supplies?.energy_gels ?? 6)} gels
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {String(data?.organizer_supplies?.nutrition_packs ?? 2)} nutrition packs
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">Championship kit supplied</span>
              <span className="rounded-full bg-white/70 px-3 py-1">Rain protection supplied if needed</span>
            </div>
          </div>

          {(data?.my_entries ?? []).map(entry => {
            const showQualification =
              entry.entry_path === 'qualification' &&
              Boolean(entry.qualification_race_id) &&
              !['eliminated'].includes(entry.entry_status)

            const showFinal =
              Boolean(entry.final_race_id) &&
              ['direct_qualified', 'qualified', 'finalist'].includes(entry.entry_status)

            return (
              <div key={entry.entry_id} className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                        {entry.national_rank}
                      </span>
                      <div>
                        <Link
                          to={`/dashboard/riders/${entry.rider_id}`}
                          className="font-bold text-slate-900 hover:text-blue-600"
                        >
                          {entry.rider_name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {entry.club_name ?? 'Club'} · {statusLabel(entry.entry_status)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {entry.entry_path === 'direct'
                      ? 'Direct qualifier'
                      : `Qualification heat ${entry.heat_number ?? '—'}`}
                  </div>
                </div>

                {showQualification ? (
                  <NationalDutyPlanCard
                    entry={entry}
                    eventType="qualification"
                    eventDate={edition?.qualification_date}
                    raceId={entry.qualification_race_id}
                    plan={
                      drafts[planKey(entry.rider_id, 'qualification')] ??
                      planFromValue(entry.qualification_plan)
                    }
                    equipmentPresets={data?.equipment_presets ?? []}
                    onChange={next =>
                      setDrafts(current => ({
                        ...current,
                        [planKey(entry.rider_id, 'qualification')]: next,
                      }))
                    }
                    onSave={() => void savePlan(entry, 'qualification')}
                    saving={savingKey === planKey(entry.rider_id, 'qualification')}
                  />
                ) : null}

                {showFinal ? (
                  <NationalDutyPlanCard
                    entry={entry}
                    eventType="final"
                    eventDate={edition?.final_date}
                    raceId={entry.final_race_id}
                    plan={
                      drafts[planKey(entry.rider_id, 'final')] ??
                      planFromValue(entry.final_plan)
                    }
                    equipmentPresets={data?.equipment_presets ?? []}
                    onChange={next =>
                      setDrafts(current => ({
                        ...current,
                        [planKey(entry.rider_id, 'final')]: next,
                      }))
                    }
                    onSave={() => void savePlan(entry, 'final')}
                    saving={savingKey === planKey(entry.rider_id, 'final')}
                  />
                ) : null}

                {!showQualification && !showFinal ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    No editable National Duty plan is currently open for this rider.
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      ) : null}

      {(data?.heats?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Medal className="h-5 w-5 text-slate-700" />
            <h2 className="text-lg font-black text-slate-900">Qualification heats</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.heats.map(heat => (
              <div key={heat.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900">Heat {heat.heat_number}</div>
                  <div className="text-xs font-semibold text-slate-500">{statusLabel(heat.status)}</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {heat.assigned_count} riders · top {heat.qualifying_places} advance
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatDate(heat.qualification_date)}</div>
                {heat.race_id ? (
                  <Link
                    to={`/dashboard/races/${heat.race_id}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Open heat
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {data?.ranking_is_frozen ? 'Frozen National Ranking' : 'Live National Ranking'}
            </h2>
            <p className="text-xs text-slate-500">
              Based on rider race points with recency weighting. National Championship bonuses are rider-only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPage(countryCode)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Weighted points</th>
                <th className="px-4 py-3">Raw points</th>
                <th className="px-4 py-3">Latest result</th>
                <th className="px-4 py-3">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.ranking ?? []).map(row => (
                <tr key={row.rider_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-black',
                        row.national_rank <= 3
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700',
                      ].join(' ')}
                    >
                      {row.national_rank}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {flagUrl(row.country_code) ? (
                        <img
                          src={flagUrl(row.country_code) ?? undefined}
                          alt={row.country_code}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                        />
                      ) : null}
                      <Link
                        to={`/dashboard/riders/${row.rider_id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600"
                      >
                        {row.rider_name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {formatPoints(row.weighted_points)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatPoints(row.raw_points)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.latest_result_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{row.overall ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(finalResults.length > 0 || qualificationResults.length > 0 || (data?.past_champions?.length ?? 0) > 0) ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-black text-slate-900">Championship results</h2>
            </div>

            {finalResults.length > 0 ? (
              <div className="space-y-2">
                {finalResults.slice(0, 20).map(result => (
                  <div
                    key={`${result.rider_id}:${result.rank}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 font-black text-slate-700">{result.rank}</span>
                      <Link
                        to={`/dashboard/riders/${result.rider_id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600"
                      >
                        {result.rider_name}
                      </Link>
                    </div>
                    <span className="text-xs text-slate-500">{result.club_name ?? 'Independent'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                Final results will appear automatically after the championship is calculated.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-black text-slate-900">Past champions</h2>
            </div>

            {(data?.past_champions?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {data?.past_champions.map(champion => (
                  <div
                    key={`${champion.season_number}:${champion.champion_rider_id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <div className="text-xs text-slate-500">Season {champion.season_number}</div>
                      <Link
                        to={`/dashboard/riders/${champion.champion_rider_id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600"
                      >
                        {champion.champion_name_snapshot}
                      </Link>
                    </div>
                    <div className="text-xs text-slate-500">
                      {champion.champion_club_name_snapshot ?? 'Independent'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                The first champion will be added here automatically.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
