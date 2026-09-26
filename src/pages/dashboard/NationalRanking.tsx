import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  Lock,
  MapPin,
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
  club_name?: string | null
  rider_name: string
  country_code: string
  raw_points: number
  weighted_points: number
  best_weighted_result?: number
  latest_result_date?: string | null
  overall?: number | null
  entry_path?: 'direct' | 'qualification' | null
  entry_status?: string | null
  heat_number?: number | null
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
  participation_decision?: 'pending' | 'approved' | 'auto_approved' | 'rejected'
  participation_decision_at?: string | null
  refusal_morale_delta?: number
  participation_decision_deadline?: string | null
  duty_window_start_date?: string | null
  duty_window_end_date?: string | null
  can_decide_participation?: boolean
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
  duty_window_start_date?: string | null
  duty_window_end_date?: string | null
  participation_decision_deadline?: string | null
  climate_source_country_code?: string | null
  climate_week_of_year?: number | null
  climate_expected_max_temp_c?: number | null
  climate_status?: string | null
  route_status?: string | null
  qualification_source_stage_id?: string | null
  final_source_stage_id?: string | null
}

type QualificationProjection = {
  eligible_count: number
  final_field_size: number
  direct_qualifiers: number
  qualification_population: number
  qualification_places: number
  heat_count: number
}

type HostRoute = {
  stage_id: string
  start_city: string
  finish_city: string
  route_label: string
  distance_km?: number | null
  terrain_type?: string | null
  elevation_gain_m?: number | null
  profile_type?: string | null
}

type PageTab = 'ranking' | 'duty' | 'history'

type NationalPageData = {
  season_number: number
  current_game_date: string
  country_code: string
  country_name?: string | null
  countries: CountryOption[]
  ranking_total?: number
  qualification_projection?: QualificationProjection
  qualification_host?: HostRoute | null
  final_host?: HostRoute | null
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
  ['ride_naturally', 'tactics.rideNaturally'],
  ['conserve_energy', 'tactics.conserveEnergy'],
  ['stay_near_front', 'tactics.stayNearFront'],
  ['join_breakaway', 'tactics.joinBreakaway'],
  ['attack', 'tactics.attack'],
  ['chase_breakaway', 'tactics.chaseBreakaway'],
  ['climb_hard', 'tactics.climbHard'],
  ['sprint', 'tactics.sprint'],
  ['avoid_risks', 'tactics.avoidRisks'],
] as const

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function formatDayMonth(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function seasonFromDate(value?: string | null): number | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCFullYear() - 1999
}

function formatGameDate(value?: string | null, seasonNumber?: number | null): string {
  if (!value) return '—'
  const season = seasonNumber ?? seasonFromDate(value)
  const dayMonth = formatDayMonth(value)
  return season && season > 0 ? `${dayMonth} · Season ${season}` : dayMonth
}

function formatGameDateRange(
  start?: string | null,
  end?: string | null,
  seasonNumber?: number | null,
): string {
  if (!start && !end) return '—'
  if (!start) return formatGameDate(end, seasonNumber)
  if (!end) return formatGameDate(start, seasonNumber)
  const season = seasonNumber ?? seasonFromDate(start) ?? seasonFromDate(end)
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}${
    season && season > 0 ? ` · Season ${season}` : ''
  }`
}

function formatRouteMeta(route?: HostRoute | null): string {
  if (!route) return '—'
  const parts: string[] = []
  if (Number.isFinite(Number(route.distance_km))) {
    parts.push(`${Number(route.distance_km).toFixed(1).replace(/\.0$/, '')} km`)
  }
  if (route.terrain_type) {
    parts.push(
      route.terrain_type
        .replaceAll('_', ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase()),
    )
  }
  return parts.join(' · ') || '—'
}

function formatPoints(value?: number | null): string {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(numeric)
    : '0'
}

function planFromValue(value?: RiderPlan | null): PlanDraft {
  return {
    equipmentSetupId: value?.equipment_setup_id ?? '',
    phase1: value?.phase_1_command ?? 'ride_naturally',
    phase2: value?.phase_2_command ?? 'ride_naturally',
    phase3: value?.phase_3_command ?? 'ride_naturally',
    phase4: value?.phase_4_command ?? 'ride_naturally',
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
  const { t } = useTranslation('nationalRanking')
  const eventName =
    eventType === 'qualification'
      ? t('plan.qualificationHeat', { number: entry.heat_number ?? '—' })
      : t('plan.final')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h4 className="text-base font-bold text-slate-900">{eventName}</h4>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatGameDate(eventDate)}
            {raceId ? (
              <>
                {' · '}
                <Link
                  className="font-medium text-blue-600 hover:text-blue-700"
                  to={`/dashboard/races/${raceId}`}
                >
                  {t('plan.openRace')}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {t('plan.individualBadge')}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Bike className="h-4 w-4" />
            {t('plan.equipment')}
          </span>
          <select
            value={plan.equipmentSetupId}
            onChange={event =>
              onChange({ ...plan, equipmentSetupId: event.target.value })
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"
          >
            <option value="">{t('plan.organizerEquipment')}</option>
            {equipmentPresets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.setup_name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {t('plan.equipmentHelp')}
          </p>
        </label>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('plan.strategy')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [t('plan.phaseStart'), 'phase1'] as const,
              [t('plan.phaseEarly'), 'phase2'] as const,
              [t('plan.phaseLate'), 'phase3'] as const,
              [t('plan.phaseFinish'), 'phase4'] as const,
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
                  {TACTIC_OPTIONS.map(([value, labelKey]) => (
                    <option key={value} value={value}>
                      {t(labelKey)}
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
          {t('plan.save')}
        </button>
      </div>
    </div>
  )
}

export default function NationalRankingPage(): JSX.Element {
  const { t } = useTranslation('nationalRanking')
  const location = useLocation()
  const navigate = useNavigate()

  const requestedTab = useMemo<PageTab>(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    return tab === 'duty' || tab === 'history' ? tab : 'ranking'
  }, [location.search])

  const [activeTab, setActiveTab] = useState<PageTab>(requestedTab)
  const [data, setData] = useState<NationalPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [decisionSavingRiderId, setDecisionSavingRiderId] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [rankingPage, setRankingPage] = useState(1)

  const loadPage = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_national_ranking_page_v1',
        {
          p_country_code: null,
          p_season_number: null,
          p_limit: 500,
        },
      )

      if (rpcError) throw rpcError

      const next = (rpcData ?? null) as NationalPageData | null
      if (!next) throw new Error(t('errors.unavailable'))

      setData(next)

      const nextDrafts: Record<string, PlanDraft> = {}
      for (const entry of next.my_entries ?? []) {
        nextDrafts[planKey(entry.rider_id, 'qualification')] = planFromValue(
          entry.qualification_plan,
        )
        nextDrafts[planKey(entry.rider_id, 'final')] = planFromValue(entry.final_plan)
      }
      setDrafts(nextDrafts)
    } catch (caught: any) {
      setError(caught?.message ?? t('errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setActiveTab(requestedTab)
  }, [requestedTab])

  useEffect(() => {
    setRankingPage(1)
  }, [data?.country_code, data?.ranking_is_frozen])

  const changeTab = (tab: PageTab): void => {
    setActiveTab(tab)
    navigate(`${location.pathname}?tab=${tab}`, { replace: true })
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

      setSaveMessage(
        t('plan.saved', { rider: entry.rider_name, event: t(`event.${eventType}`) }),
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(caught?.message ?? t('errors.save'))
    } finally {
      setSavingKey(null)
    }
  }

  const decideParticipation = async (
    entry: MyEntry,
    approve: boolean,
  ): Promise<void> => {
    try {
      setDecisionSavingRiderId(entry.rider_id)
      setSaveMessage(null)

      const { error: decisionError } = await supabase.rpc(
        'set_my_national_championship_participation_v1',
        {
          p_edition_id: data?.edition?.id,
          p_rider_id: entry.rider_id,
          p_approve: approve,
        },
      )

      if (decisionError) throw decisionError

      setSaveMessage(
        approve
          ? t('decision.approvedMessage', { rider: entry.rider_name })
          : t('decision.rejectedMessage', { rider: entry.rider_name }),
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(caught?.message ?? t('decision.error'))
    } finally {
      setDecisionSavingRiderId(null)
    }
  }

  const edition = data?.edition ?? null
  const projection = data?.qualification_projection ?? null
  const countryName =
    data?.country_name ??
    data?.countries?.[0]?.name ??
    data?.country_code ??
    t('common.national')
  const countryFlag = flagUrl(data?.country_code)

  const finalResults = (data?.results ?? []).filter(
    result => result.event_type === 'final',
  )
  const qualificationResults = (data?.results ?? []).filter(
    result => result.event_type === 'qualification',
  )
  const pendingApprovals = (data?.my_entries ?? []).filter(
    entry => entry.participation_decision === 'pending',
  )

  const heatCount = Number(
    edition?.qualification_heat_count ?? projection?.heat_count ?? 0,
  )

  const projectedHeatNumber = (rank: number): number | null => {
    if (!projection || projection.heat_count <= 0) return null
    if (rank <= projection.direct_qualifiers) return null

    const index = rank - projection.direct_qualifiers - 1
    const block = Math.floor(index / projection.heat_count)
    const position = index % projection.heat_count
    return block % 2 === 0
      ? position + 1
      : projection.heat_count - position
  }

  const qualificationStatus = (
    row: RankingRow,
  ): { label: string; className: string } => {
    if (row.entry_status === 'withdrawn') {
      return {
        label: t('ranking.withdrawn'),
        className: 'bg-slate-100 text-slate-600',
      }
    }
    if (row.entry_status === 'eliminated') {
      return {
        label: t('ranking.eliminated'),
        className: 'bg-rose-100 text-rose-700',
      }
    }
    if (row.entry_status === 'qualified') {
      return {
        label: t('ranking.qualifiedFinal'),
        className: 'bg-emerald-100 text-emerald-700',
      }
    }
    if (
      row.entry_status === 'direct_qualified' ||
      row.entry_status === 'finalist'
    ) {
      return {
        label: t('ranking.directFinal'),
        className: 'bg-emerald-100 text-emerald-700',
      }
    }
    if (row.entry_status === 'qualification_assigned') {
      return {
        label: t('ranking.qualificationHeat', {
          number: row.heat_number ?? projectedHeatNumber(row.national_rank) ?? '—',
        }),
        className: 'bg-amber-100 text-amber-800',
      }
    }

    if (!projection || projection.heat_count <= 0) {
      return {
        label: t('ranking.directFinal'),
        className: 'bg-emerald-100 text-emerald-700',
      }
    }

    if (row.national_rank <= projection.direct_qualifiers) {
      return {
        label: t('ranking.directFinal'),
        className: 'bg-emerald-100 text-emerald-700',
      }
    }

    return {
      label: t('ranking.qualificationHeat', {
        number: projectedHeatNumber(row.national_rank) ?? '—',
      }),
      className: 'bg-amber-100 text-amber-800',
    }
  }

  const pageSize = 50
  const rankingTotal = Number(data?.ranking_total ?? data?.ranking?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(rankingTotal / pageSize))
  const safePage = Math.min(rankingPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageRows = (data?.ranking ?? []).slice(pageStart, pageStart + pageSize)
  const pageEnd = Math.min(pageStart + pageRows.length, rankingTotal)

  const drawHeats =
    (data?.heats?.length ?? 0) > 0
      ? data?.heats ?? []
      : Array.from({ length: heatCount }, (_, index) => ({
          id: `projected-${index + 1}`,
          heat_number: index + 1,
          qualification_date: edition?.qualification_date ?? '',
          qualifying_places: 0,
          assigned_count: 0,
          race_id: null,
          status: 'planned',
        }))

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-4">
        {countryFlag ? (
          <img
            src={countryFlag}
            alt={data?.country_code ?? countryName}
            className="h-11 w-16 rounded-lg border border-slate-200 object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-11 w-16 items-center justify-center rounded-lg bg-slate-100">
            <Flag className="h-5 w-5 text-slate-500" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            {t('title', { country: countryName })}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('header.subtitle')}</p>
        </div>
      </header>

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
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-4 w-4" />
              {t('cards.freeze')}
            </div>
            <div className="mt-2 text-base font-black text-slate-900">
              {formatGameDate(edition.ranking_snapshot_date, edition.season_number)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data?.ranking_is_frozen ? t('cards.frozen') : t('cards.live')}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Medal className="h-4 w-4" />
              {t('cards.qualification')}
            </div>
            <div className="mt-2 text-base font-black text-slate-900">
              {heatCount > 0
                ? formatGameDate(edition.qualification_date, edition.season_number)
                : t('cards.notRequired')}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {heatCount > 0
                ? t('cards.heatPlaces', {
                    heats: heatCount,
                    places:
                      edition.qualification_places ??
                      projection?.qualification_places ??
                      0,
                  })
                : t('cards.directField')}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
              <Trophy className="h-4 w-4" />
              {t('cards.final')}
            </div>
            <div className="mt-2 text-base font-black text-slate-900">
              {formatGameDate(edition.final_date, edition.season_number)}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {t('cards.targetField', {
                count: edition.final_field_size,
                status: t(`status.${edition.status}`, {
                  defaultValue: edition.status.replaceAll('_', ' '),
                }),
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
              <ShieldCheck className="h-4 w-4" />
              {t('cards.dutyWindow')}
            </div>
            <div className="mt-2 text-base font-black text-slate-900">
              {formatGameDateRange(
                edition.duty_window_start_date,
                edition.duty_window_end_date,
                edition.season_number,
              )}
            </div>
            <div className="mt-1 text-xs text-slate-600">{t('cards.noTeamCost')}</div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
              <MapPin className="h-4 w-4" />
              {t('cards.hostRoute')}
            </div>
            <div className="mt-2 text-base font-black text-slate-900">
              {data?.final_host?.route_label ?? t('cards.hostPending')}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {data?.final_host ? formatRouteMeta(data.final_host) : t('cards.hostPendingHelp')}
            </div>
          </div>
        </section>
      ) : null}

      {edition?.climate_status && edition.climate_status !== 'ready' ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <div className="font-bold">{t('availability.climateTitle')}</div>
          <div className="mt-1">
            {t('availability.climateUnavailable', {
              temperature: edition.climate_expected_max_temp_c ?? '—',
            })}
          </div>
        </div>
      ) : null}

      {edition?.route_status === 'missing_route' ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <div className="font-bold">{t('availability.routeTitle')}</div>
          <div className="mt-1">{t('availability.routeMissing')}</div>
        </div>
      ) : edition?.route_status === 'single_route_only' ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
          {t('availability.singleRoute')}
        </div>
      ) : null}

      {edition ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{t('draw.title')}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {data?.ranking_is_frozen ? t('draw.confirmed') : t('draw.projected')}
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {t('champions.season', { number: edition.season_number })}
            </div>
          </div>

          <div className="mt-4 flex items-stretch gap-3 overflow-x-auto pb-1">
            {heatCount > 0 ? (
              <>
                <div className="flex min-w-max gap-2">
                  {drawHeats.map(heat => (
                    <div
                      key={heat.id}
                      className="min-w-[190px] rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {t('draw.qualificationHeat', { number: heat.heat_number })}
                      </div>
                      <div className="mt-1 font-bold text-slate-900">
                        {formatGameDate(
                          heat.qualification_date || edition.qualification_date,
                          edition.season_number,
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {data?.qualification_host?.route_label ??
                          t('draw.routePending')}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center px-1 text-slate-400">
                  <ChevronRight className="h-6 w-6" />
                </div>
              </>
            ) : null}

            <div className="min-w-[230px] rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-700">
                {t('draw.final')}
              </div>
              <div className="mt-1 font-black text-slate-900">
                {formatGameDate(edition.final_date, edition.season_number)}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {data?.final_host?.route_label ?? t('draw.routePending')}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-2 border-b border-slate-200">
        {(
          [
            ['ranking', t('tabs.ranking')],
            ['duty', t('tabs.duty')],
            ['history', t('tabs.history')],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => changeTab(tab)}
            className={[
              'relative px-4 py-3 text-sm font-bold transition',
              activeTab === tab
                ? 'text-amber-700'
                : 'text-slate-500 hover:text-slate-800',
            ].join(' ')}
          >
            {label}
            {tab === 'duty' && pendingApprovals.length > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                {pendingApprovals.length}
              </span>
            ) : null}
            {activeTab === tab ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-500" />
            ) : null}
          </button>
        ))}
      </nav>

      {activeTab === 'ranking' ? (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {data?.ranking_is_frozen ? t('ranking.frozen') : t('ranking.live')}
                </h2>
                <p className="text-xs text-slate-500">{t('ranking.description')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs font-semibold text-slate-500">
                  {t('ranking.pageRange', {
                    from: rankingTotal === 0 ? 0 : pageStart + 1,
                    to: pageEnd,
                    total: rankingTotal,
                  })}
                  {' · '}
                  {t('ranking.perPage', { count: pageSize })}
                </div>
                <button
                  type="button"
                  onClick={() => void loadPage()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('ranking.refresh')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('ranking.rank')}</th>
                    <th className="px-4 py-3">{t('ranking.rider')}</th>
                    <th className="px-4 py-3">{t('ranking.team')}</th>
                    <th className="px-4 py-3">{t('ranking.weighted')}</th>
                    <th className="px-4 py-3">{t('ranking.raw')}</th>
                    <th className="px-4 py-3">{t('ranking.latest')}</th>
                    <th className="px-4 py-3">{t('ranking.overall')}</th>
                    <th className="px-4 py-3">{t('ranking.qualificationStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(row => {
                    const qStatus = qualificationStatus(row)
                    return (
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
                              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                            >
                              {row.rider_name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.club_name ?? t('ranking.freeAgent')}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {formatPoints(row.weighted_points)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatPoints(row.raw_points)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatGameDate(row.latest_result_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.overall ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${qStatus.className}`}
                          >
                            {qStatus.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setRankingPage(page => Math.max(1, page - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('ranking.previous')}
              </button>
              <div className="text-xs font-semibold text-slate-500">
                {t('ranking.page', { page: safePage, pages: totalPages })}
              </div>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setRankingPage(page => Math.min(totalPages, page + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('ranking.next')}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <div className="font-black">{t('info.title')}</div>
            <p className="mt-1 leading-6">{t('info.description')}</p>
          </aside>
        </div>
      ) : null}

      {activeTab === 'duty' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">{t('duty.title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('duty.description')}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <Lock className="h-4 w-4" />
              {t('duty.locked')}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="font-semibold text-emerald-900">{t('organizer.title')}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-800">
              <span className="rounded-full bg-white/70 px-3 py-1">
                {t('organizer.bidons', {
                  count: String(data?.organizer_supplies?.bidons_water_bottles ?? 8),
                })}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {t('organizer.gels', {
                  count: String(data?.organizer_supplies?.energy_gels ?? 6),
                })}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {t('organizer.nutrition', {
                  count: String(data?.organizer_supplies?.nutrition_packs ?? 2),
                })}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {t('organizer.kit')}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1">
                {t('organizer.rain')}
              </span>
            </div>
          </div>

          {(data?.my_entries?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {t('duty.empty')}
            </div>
          ) : (
            (data?.my_entries ?? []).map(entry => {
              const showQualification =
                entry.entry_path === 'qualification' &&
                Boolean(entry.qualification_race_id) &&
                !['eliminated'].includes(entry.entry_status)

              const showFinal =
                Boolean(entry.final_race_id) &&
                ['direct_qualified', 'qualified', 'finalist'].includes(entry.entry_status)

              return (
                <div
                  key={entry.entry_id}
                  className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                        {entry.national_rank}
                      </span>
                      <div>
                        <Link
                          to={`/dashboard/riders/${entry.rider_id}`}
                          className="font-bold text-blue-700 underline-offset-2 hover:underline"
                        >
                          {entry.rider_name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {entry.club_name ?? t('ranking.freeAgent')}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {entry.entry_path === 'direct'
                        ? t('duty.directQualifier')
                        : t('duty.qualificationHeat', {
                            number: entry.heat_number ?? '—',
                          })}
                    </div>
                  </div>

                  <div
                    className={[
                      'rounded-2xl border p-4',
                      entry.participation_decision === 'rejected'
                        ? 'border-rose-200 bg-rose-50'
                        : entry.participation_decision === 'pending'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-emerald-200 bg-emerald-50',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {t('decision.title')}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">
                          {t('decision.blockedWindow', {
                            start: formatGameDate(
                              entry.duty_window_start_date,
                              edition?.season_number,
                            ),
                            end: formatGameDate(
                              entry.duty_window_end_date,
                              edition?.season_number,
                            ),
                          })}
                        </div>
                        {entry.participation_decision_deadline ? (
                          <div className="mt-1 text-xs text-slate-500">
                            {t('decision.deadline', {
                              date: formatGameDate(
                                entry.participation_decision_deadline,
                                edition?.season_number,
                              ),
                            })}
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs font-semibold text-slate-700">
                          {t(
                            `decision.status.${entry.participation_decision ?? 'pending'}`,
                          )}
                        </div>
                      </div>

                      {entry.participation_decision === 'pending' &&
                      entry.can_decide_participation !== false ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={decisionSavingRiderId === entry.rider_id}
                            onClick={() => void decideParticipation(entry, true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {decisionSavingRiderId === entry.rider_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {t('decision.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={decisionSavingRiderId === entry.rider_id}
                            onClick={() => void decideParticipation(entry, false)}
                            className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t('decision.reject')}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {entry.participation_decision === 'pending' ? (
                      <div className="mt-3 text-xs text-rose-700">
                        {t('decision.rejectWarning')}
                      </div>
                    ) : null}
                    {entry.participation_decision !== 'rejected' ? (
                      <div className="mt-2 text-xs text-slate-600">
                        {t('decision.participationBenefit')}
                      </div>
                    ) : null}
                  </div>

                  {showQualification &&
                  entry.participation_decision !== 'rejected' ? (
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
                      saving={
                        savingKey === planKey(entry.rider_id, 'qualification')
                      }
                    />
                  ) : null}

                  {showFinal && entry.participation_decision !== 'rejected' ? (
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

                  {((!showQualification && !showFinal) ||
                    entry.participation_decision === 'rejected') ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      {t('duty.noPlan')}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </section>
      ) : null}

      {activeTab === 'history' ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-black text-slate-900">{t('results.title')}</h2>
            </div>

            {finalResults.length > 0 ? (
              <div className="space-y-2">
                {finalResults.slice(0, 50).map(result => (
                  <div
                    key={`${result.rider_id}:${result.rank}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 font-black text-slate-700">
                        {result.rank}
                      </span>
                      <Link
                        to={`/dashboard/riders/${result.rider_id}`}
                        className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                      >
                        {result.rider_name}
                      </Link>
                    </div>
                    <span className="text-xs text-slate-500">
                      {result.club_name ?? t('ranking.freeAgent')}
                    </span>
                  </div>
                ))}
              </div>
            ) : qualificationResults.length > 0 ? (
              <div className="text-sm text-slate-500">{t('results.pending')}</div>
            ) : (
              <div className="text-sm text-slate-500">{t('results.pending')}</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-black text-slate-900">
                {t('champions.title')}
              </h2>
            </div>

            {(data?.past_champions?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {data?.past_champions.map(champion => (
                  <div
                    key={`${champion.season_number}:${champion.champion_rider_id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <div className="text-xs text-slate-500">
                        {t('champions.season', { number: champion.season_number })}
                      </div>
                      <Link
                        to={`/dashboard/riders/${champion.champion_rider_id}`}
                        className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                      >
                        {champion.champion_name_snapshot}
                      </Link>
                    </div>
                    <div className="text-xs text-slate-500">
                      {champion.champion_club_name_snapshot ??
                        t('results.independent')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t('champions.first')}</div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
