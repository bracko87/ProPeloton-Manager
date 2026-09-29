import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Bike,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Globe2,
  Loader2,
  Lock,
  RefreshCw,
  Save,
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
  qualification_window_start_date?: string | null
  qualification_window_end_date?: string | null
  final_window_start_date?: string | null
  final_window_end_date?: string | null
  can_decide_participation?: boolean
  final_participation_decision?: 'not_open' | 'pending' | 'approved' | 'auto_approved' | 'rejected'
  final_participation_decision_at?: string | null
  final_decision_notified_at?: string | null
  final_refusal_morale_delta?: number
  final_decision_deadline?: string | null
  can_decide_final_participation?: boolean
  requires_second_confirmation?: boolean
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
  source_race_id?: string | null
  start_city: string
  finish_city: string
  route_label: string
  distance_km?: number | null
  terrain_type?: string | null
  elevation_gain_m?: number | null
  profile_type?: string | null
}

type WorldRoadEdition = {
  id: string
  season_number: number
  race_date: string
  decision_deadline: string
  final_confirmation_open_date?: string | null
  final_decision_deadline?: string | null
  host_country_code?: string | null
  host_country_name_snapshot?: string | null
  climate_avg_temp_c?: number | null
  climate_expected_max_temp_c?: number | null
  race_id?: string | null
  status: string
  route_status: string
  logo_url: string
  participant_count?: number
  confirmed_count?: number
}

type WorldRoadEntry = {
  entry_id: string
  rider_id: string
  rider_name: string
  country_code: string
  club_id?: string | null
  club_name?: string | null
  entry_status: 'invited' | 'confirmed' | 'withdrawn' | 'unavailable' | string
  participation_decision: 'pending' | 'approved' | 'auto_approved' | 'rejected'
  participation_decision_at?: string | null
  morale_delta?: number
  decision_deadline: string
  race_date: string
  race_id?: string | null
  can_decide_participation?: boolean
  final_participation_decision?: 'not_open' | 'pending' | 'approved' | 'auto_approved' | 'rejected'
  final_participation_decision_at?: string | null
  final_decision_notified_at?: string | null
  final_decision_deadline?: string | null
  final_confirmation_open_date?: string | null
  can_decide_final_participation?: boolean
  requires_second_confirmation?: boolean
}

type WorldRoadOverview = {
  season_number: number
  current_game_date: string
  edition: WorldRoadEdition | null
  route?: HostRoute | null
  participant_count: number
  confirmed_count: number
  my_entries: WorldRoadEntry[]
  past_champions?: Array<Record<string, unknown>>
}

type PageTab = 'ranking' | 'duty' | 'history'

type NationalPageData = {
  season_number: number
  current_game_date: string
  country_code: string
  country_name?: string | null
  my_club_ids?: string[]
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

function formatGameDate(
  value?: string | null,
  seasonLabel?: string | null,
): string {
  if (!value) return '—'
  const dayMonth = formatDayMonth(value)
  return seasonLabel ? `${dayMonth} · ${seasonLabel}` : dayMonth
}

function formatGameDateRange(
  start?: string | null,
  end?: string | null,
  seasonLabel?: string | null,
): string {
  if (!start && !end) return '—'
  if (!start) return formatGameDate(end, seasonLabel)
  if (!end) return formatGameDate(start, seasonLabel)
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}${
    seasonLabel ? ` · ${seasonLabel}` : ''
  }`
}

function addGameDays(value: string | null | undefined, days: number): string {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}


function worldChampionshipPhase(
  overview: WorldRoadOverview | null,
): string {
  const edition = overview?.edition
  if (!edition) return 'Planned'

  if (edition.status === 'completed') return 'Completed'

  const currentDate = overview?.current_game_date ?? ''
  const finalOpen = edition.final_confirmation_open_date ?? ''
  const firstDeadline = edition.decision_deadline ?? ''

  if (finalOpen && currentDate >= finalOpen) return 'Final confirmations'

  if (
    firstDeadline &&
    currentDate > firstDeadline &&
    (overview?.participant_count ?? 0) > 0
  ) {
    return 'Startlist confirmed'
  }

  if ((overview?.participant_count ?? 0) > 0) return 'Invitations open'

  return 'National champions qualifying'
}

function worldChampionshipPhaseClasses(label: string): string {
  if (label === 'Completed') return 'bg-emerald-100 text-emerald-800'
  if (label === 'Final confirmations') return 'bg-violet-100 text-violet-800'
  if (label === 'Startlist confirmed') return 'bg-blue-100 text-blue-800'
  if (label === 'Invitations open') return 'bg-amber-100 text-amber-800'
  return 'bg-sky-100 text-sky-800'
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
  raceHref,
  plan,
  equipmentPresets,
  onChange,
  onSave,
  saving,
}: {
  entry: MyEntry
  eventType: EventType
  eventDate?: string | null
  raceHref?: string | null
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
  const eventSeason = seasonFromDate(eventDate)
  const eventDateLabel = formatGameDate(
    eventDate,
    eventSeason ? t('champions.season', { number: eventSeason }) : null,
  )

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h4 className="text-base font-bold text-slate-900">{eventName}</h4>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {eventDateLabel}
            {raceHref ? (
              <>
                {' · '}
                <Link
                  className="font-medium text-yellow-700 hover:text-yellow-800 hover:underline"
                  to={raceHref}
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
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
            className="w-full rounded border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"
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
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
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

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
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
  const [worldData, setWorldData] = useState<WorldRoadOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [decisionSavingRiderId, setDecisionSavingRiderId] = useState<string | null>(null)
  const [worldDecisionSavingRiderId, setWorldDecisionSavingRiderId] = useState<string | null>(null)
  const [nationalFinalDecisionSavingRiderId, setNationalFinalDecisionSavingRiderId] = useState<string | null>(null)
  const [worldFinalDecisionSavingRiderId, setWorldFinalDecisionSavingRiderId] = useState<string | null>(null)
  const [finalWithdrawalSavingRiderId, setFinalWithdrawalSavingRiderId] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [rankingPage, setRankingPage] = useState(1)

  const loadPage = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const [nationalResponse, worldResponse, confirmationResponse] =
        await Promise.all([
          supabase.rpc(
            'get_national_ranking_page_v1',
            {
              p_country_code: null,
              p_season_number: null,
              p_limit: 5000,
            },
          ),
          supabase.rpc(
            'get_world_road_championship_overview_v1',
            { p_season_number: null },
          ),
          supabase.rpc('get_my_championship_second_confirmations_v1'),
        ])

      if (nationalResponse.error) throw nationalResponse.error
      if (worldResponse.error) throw worldResponse.error
      if (confirmationResponse.error) throw confirmationResponse.error

      const next = (nationalResponse.data ?? null) as NationalPageData | null
      if (!next) throw new Error(t('errors.unavailable'))

      const confirmations = (confirmationResponse.data ?? {
        national: [],
        world: [],
      }) as {
        national?: Array<Record<string, unknown>>
        world?: Array<Record<string, unknown>>
      }

      const nationalFinalByRider = new Map(
        (confirmations.national ?? []).map(row => [
          String(row.rider_id ?? ''),
          row,
        ]),
      )

      const mergedNational: NationalPageData = {
        ...next,
        my_entries: (next.my_entries ?? []).map(entry => ({
          ...entry,
          ...(nationalFinalByRider.get(entry.rider_id) ?? {}),
        })),
      }

      const nextWorld =
        (worldResponse.data ?? null) as WorldRoadOverview | null
      const worldFinalByRider = new Map(
        (confirmations.world ?? []).map(row => [
          String(row.rider_id ?? ''),
          row,
        ]),
      )
      const mergedWorld = nextWorld
        ? {
            ...nextWorld,
            my_entries: (nextWorld.my_entries ?? []).map(entry => ({
              ...entry,
              ...(worldFinalByRider.get(entry.rider_id) ?? {}),
            })),
          }
        : null

      setData(mergedNational)
      setWorldData(mergedWorld)

      const nextDrafts: Record<string, PlanDraft> = {}
      for (const entry of mergedNational.my_entries ?? []) {
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

  const decideWorldParticipation = async (
    entry: WorldRoadEntry,
    approve: boolean,
  ): Promise<void> => {
    const worldEditionId = worldData?.edition?.id
    if (!worldEditionId) return

    try {
      setWorldDecisionSavingRiderId(entry.rider_id)
      setSaveMessage(null)

      const { error: decisionError } = await supabase.rpc(
        'set_my_world_road_championship_participation_v1',
        {
          p_edition_id: worldEditionId,
          p_rider_id: entry.rider_id,
          p_approve: approve,
        },
      )

      if (decisionError) throw decisionError

      setSaveMessage(
        approve
          ? `${entry.rider_name} will ride the World Road Championship Grand Finale. Morale +10.`
          : `${entry.rider_name} will not ride the World Road Championship Grand Finale. Morale -15.`,
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(
        caught?.message ??
          'Unable to update World Road Championship participation.',
      )
    } finally {
      setWorldDecisionSavingRiderId(null)
    }
  }

  const decideNationalFinalParticipation = async (
    entry: MyEntry,
    approve: boolean,
  ): Promise<void> => {
    const editionId = data?.edition?.id
    if (!editionId) return

    try {
      setNationalFinalDecisionSavingRiderId(entry.rider_id)
      setSaveMessage(null)

      const { error: decisionError } = await supabase.rpc(
        'set_my_national_championship_final_participation_v1',
        {
          p_edition_id: editionId,
          p_rider_id: entry.rider_id,
          p_approve: approve,
        },
      )

      if (decisionError) throw decisionError

      setSaveMessage(
        approve
          ? `${entry.rider_name} is confirmed again for the National Championship final.`
          : `${entry.rider_name} will not ride the National Championship final.`,
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(
        caught?.message ??
          'Unable to update the second National Championship confirmation.',
      )
    } finally {
      setNationalFinalDecisionSavingRiderId(null)
    }
  }

  const decideWorldFinalParticipation = async (
    entry: WorldRoadEntry,
    approve: boolean,
  ): Promise<void> => {
    const worldEditionId = worldData?.edition?.id
    if (!worldEditionId) return

    try {
      setWorldFinalDecisionSavingRiderId(entry.rider_id)
      setSaveMessage(null)

      const { error: decisionError } = await supabase.rpc(
        'set_my_world_road_championship_final_participation_v1',
        {
          p_edition_id: worldEditionId,
          p_rider_id: entry.rider_id,
          p_approve: approve,
        },
      )

      if (decisionError) throw decisionError

      setSaveMessage(
        approve
          ? `${entry.rider_name} is finally confirmed for the World Road Championship.`
          : `${entry.rider_name} has been withdrawn from the World Road Championship. Morale -15.`,
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(
        caught?.message ??
          'Unable to update the final World Championship confirmation.',
      )
    } finally {
      setWorldFinalDecisionSavingRiderId(null)
    }
  }

  const withdrawFromNationalFinal = async (
    entry: MyEntry,
  ): Promise<void> => {
    const editionId = data?.edition?.id
    if (!editionId) return

    try {
      setFinalWithdrawalSavingRiderId(entry.rider_id)
      setSaveMessage(null)

      const { error: withdrawError } = await supabase.rpc(
        'withdraw_my_national_championship_final_v1',
        {
          p_edition_id: editionId,
          p_rider_id: entry.rider_id,
        },
      )

      if (withdrawError) throw withdrawError

      setSaveMessage(
        `${entry.rider_name} has been withdrawn from the National Championship final. The rider was removed from the final startlist and received the refusal morale penalty.`,
      )
      await loadPage()
    } catch (caught: any) {
      setSaveMessage(
        caught?.message ??
          'Unable to withdraw this rider from the National Championship final.',
      )
    } finally {
      setFinalWithdrawalSavingRiderId(null)
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
  const pageDate = (
    value?: string | null,
    seasonNumber?: number | null,
  ): string => {
    const season = seasonNumber ?? seasonFromDate(value)
    return formatGameDate(
      value,
      season && season > 0
        ? t('champions.season', { number: season })
        : null,
    )
  }
  const pageDateRange = (
    start?: string | null,
    end?: string | null,
    seasonNumber?: number | null,
  ): string => {
    const season =
      seasonNumber ?? seasonFromDate(start) ?? seasonFromDate(end)
    return formatGameDateRange(
      start,
      end,
      season && season > 0
        ? t('champions.season', { number: season })
        : null,
    )
  }

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

  const projectedGroupSize = (
    totalRiders: number,
    groups: number,
    groupNumber: number,
  ): number => {
    if (groups <= 0 || groupNumber < 1 || groupNumber > groups) return 0

    const cycleSize = groups * 2
    const fullCycles = Math.floor(totalRiders / cycleSize)
    let count = fullCycles * 2
    const remainder = totalRiders % cycleSize

    for (let index = 0; index < remainder; index += 1) {
      const block = Math.floor(index / groups)
      const position = index % groups
      const assignedGroup =
        block % 2 === 0 ? position + 1 : groups - position

      if (assignedGroup === groupNumber) count += 1
    }

    return count
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
    if (row.entry_status === 'finalist') {
      return {
        label: t('ranking.qualifiedFinal'),
        className: 'bg-emerald-100 text-emerald-700',
      }
    }
    if (row.entry_status === 'direct_qualified') {
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

    return {
      label: t('ranking.qualificationHeat', {
        number: projectedHeatNumber(row.national_rank) ?? '—',
      }),
      className: 'bg-amber-100 text-amber-800',
    }
  }

  const pageSize = 20
  const rankingTotal = Number(data?.ranking_total ?? data?.ranking?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(rankingTotal / pageSize))
  const safePage = Math.min(rankingPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageRows = (data?.ranking ?? []).slice(pageStart, pageStart + pageSize)
  const pageEnd = Math.min(pageStart + pageRows.length, rankingTotal)

  const drawHeats =
    (data?.heats?.length ?? 0) > 0
      ? data?.heats ?? []
      : Array.from({ length: heatCount }, (_, index) => {
          const basePlaces =
            heatCount > 0
              ? Math.floor(
                  Number(
                    edition?.qualification_places ??
                      projection?.qualification_places ??
                      0,
                  ) / heatCount,
                )
              : 0
          const remainder =
            heatCount > 0
              ? Number(
                  edition?.qualification_places ??
                    projection?.qualification_places ??
                    0,
                ) % heatCount
              : 0

          return {
            id: `projected-${index + 1}`,
            heat_number: index + 1,
            qualification_date: addGameDays(
              edition?.qualification_window_start_date ??
                edition?.qualification_date,
              index,
            ),
            qualifying_places: basePlaces + (index < remainder ? 1 : 0),
            assigned_count:
              heatCount > 0
                ? projectedGroupSize(rankingTotal, heatCount, index + 1)
                : 0,
            race_id: null,
            status: 'planned',
          }
        })

  const myClubIds = data?.my_club_ids ?? []
  const riderProfilePath = (
    riderId: string,
    clubId?: string | null,
  ): string =>
    clubId && myClubIds.includes(clubId)
      ? `/dashboard/my-riders/${riderId}`
      : `/dashboard/external-riders/${riderId}`

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
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          {countryFlag ? (
            <img
              src={countryFlag}
              alt={data?.country_code ?? countryName}
              className="mt-0.5 h-8 w-12 rounded border border-slate-200 object-cover"
            />
          ) : (
            <div className="mt-0.5 flex h-8 w-12 items-center justify-center rounded border border-slate-200 bg-white">
              <Flag className="h-4 w-4 text-slate-500" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {t('title', { country: countryName })}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t('header.subtitle')}</p>
          </div>
        </div>

        <div className="inline-flex self-start rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
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
                'rounded-md px-4 py-2 text-sm font-medium transition',
                activeTab === tab
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100',
              ].join(' ')}
            >
              {label}
              {tab === 'duty' && pendingApprovals.length > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingApprovals.length}
                </span>
              ) : null}
            </button>
          ))}
          <Link
            to="/dashboard/national-association"
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            National Association
          </Link>
          <Link
            to="/dashboard/nations-competition"
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            World Nations
          </Link>
          <Link
            to="/dashboard/world-nations"
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            World Nations
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          {saveMessage}
        </div>
      ) : null}

      {edition ? (
        <section className="overflow-hidden rounded bg-white shadow">
          <div className="grid gap-px bg-slate-200 md:grid-cols-4">
            <div className="bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('cards.freeze')}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {pageDate(edition.ranking_snapshot_date, edition.season_number)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {data?.ranking_is_frozen ? t('cards.frozen') : t('cards.live')}
              </div>
            </div>

            <div className="bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('cards.qualification')}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {heatCount > 0
                  ? pageDateRange(
                      edition.qualification_window_start_date ??
                        edition.qualification_date,
                      edition.qualification_window_end_date ??
                        addGameDays(edition.qualification_date, heatCount - 1),
                      edition.season_number,
                    )
                  : t('cards.notRequired')}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
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

            <div className="bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('cards.final')}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {pageDate(edition.final_date, edition.season_number)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {t('cards.targetField', {
                  count: edition.final_field_size,
                  status: t(`status.${edition.status}`, {
                    defaultValue: edition.status.replaceAll('_', ' '),
                  }),
                })}
              </div>
            </div>

            <div className="bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('cards.hostRoute')}
              </div>
              {data?.final_host ? (
                <Link
                  to={`/dashboard/national-championships/${edition.id}/final`}
                  className="mt-1 block truncate text-sm font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
                >
                  {data.final_host.route_label}
                </Link>
              ) : (
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {t('cards.hostPending')}
                </div>
              )}
              <div className="mt-0.5 text-xs text-slate-500">
                {data?.final_host
                  ? formatRouteMeta(data.final_host)
                  : t('cards.hostPendingHelp')}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {edition?.climate_status && edition.climate_status !== 'ready' ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">{t('availability.climateTitle')}</div>
          <div className="mt-1">
            {t('availability.climateUnavailable', {
              temperature: edition.climate_expected_max_temp_c ?? '—',
            })}
          </div>
        </div>
      ) : null}

      {edition?.route_status === 'missing_route' ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-semibold">{t('availability.routeTitle')}</div>
          <div className="mt-1">{t('availability.routeMissing')}</div>
        </div>
      ) : edition?.route_status === 'single_route_only' ? (
        <div className="rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {t('availability.singleRoute')}
        </div>
      ) : null}

      {edition ? (
        <section className="overflow-hidden rounded bg-white shadow">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{t('draw.title')}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {data?.ranking_is_frozen ? t('draw.confirmed') : t('draw.projected')}
              </p>
            </div>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
              {t('champions.season', { number: edition.season_number })}
            </span>
          </div>

          <div className="overflow-x-auto p-4">
            {heatCount > 0 ? (
              <div className="grid min-w-[1120px] grid-cols-[minmax(300px,1.2fr)_80px_minmax(280px,0.9fr)_80px_minmax(320px,1fr)] items-center gap-4">
                <div className="space-y-2">
                  {drawHeats.map(heat => (
                    <Link
                      key={heat.id}
                      to={`/dashboard/national-championships/${edition.id}/qualification/${heat.heat_number}`}
                      className="block rounded border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-yellow-400 hover:bg-yellow-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {t('draw.qualificationHeat', { number: heat.heat_number })}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {pageDate(heat.qualification_date, edition.season_number)}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {data?.qualification_host?.route_label ?? t('draw.routePending')}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{t('draw.ridersCount', { count: heat.assigned_count })}</div>
                          <div className="mt-1 font-semibold text-slate-700">
                            {t('draw.advanceCount', { count: heat.qualifying_places })}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="relative h-full min-h-[150px]">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300" />
                  <div className="absolute bottom-4 left-1/2 top-4 w-px bg-slate-300" />
                  <ChevronRight className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 bg-white text-slate-500" />
                </div>

                <Link
                  to={`/dashboard/national-championships/${edition.id}/final`}
                  className="block rounded border border-yellow-300 bg-yellow-50 px-4 py-4 transition hover:border-yellow-500"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-yellow-800">
                    {t('draw.final')}
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {pageDate(edition.final_date, edition.season_number)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {data?.final_host?.route_label ?? t('draw.routePending')}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-700">
                    {t('draw.finalFieldCount', { count: edition.final_field_size })}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-yellow-800">
                    Winner qualifies automatically for the World Road Championship
                  </div>
                </Link>

                <div className="relative h-full min-h-[150px]">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-sky-300" />
                  <div className="absolute bottom-4 left-1/2 top-4 w-px bg-sky-300" />
                  <ChevronRight className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 bg-white text-sky-600" />
                </div>

                {worldData?.edition?.race_id ? (
                  <Link
                    to={`/dashboard/races/${worldData.edition.race_id}`}
                    className="block rounded border border-sky-300 bg-gradient-to-br from-sky-50 via-white to-amber-50 px-4 py-4 transition hover:border-sky-500 hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={worldData.edition.logo_url}
                        alt="World Road Championship"
                        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                          World Road Championship
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-base font-bold text-slate-950">
                            Grand Finale
                          </div>
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              worldChampionshipPhaseClasses(
                                worldChampionshipPhase(worldData),
                              ),
                            ].join(' ')}
                          >
                            {worldChampionshipPhase(worldData)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {pageDate(
                            worldData.edition.race_date,
                            worldData.edition.season_number,
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      {worldData.edition.host_country_name_snapshot ?? 'Warm-weather host'}
                      {worldData.route?.route_label
                        ? ` · ${worldData.route.route_label}`
                        : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
                        {worldData.participant_count} champions qualified
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                        {worldData.confirmed_count} confirmed
                      </span>
                    </div>
                    <div className="mt-3 text-xs font-bold text-sky-800">
                      Open World Championship →
                    </div>
                  </Link>
                ) : (
                  <div className="rounded border border-sky-200 bg-sky-50 px-4 py-4">
                    <div className="flex items-center gap-3">
                      {worldData?.edition?.logo_url ? (
                        <img
                          src={worldData.edition.logo_url}
                          alt="World Road Championship"
                          className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1"
                        />
                      ) : (
                        <Globe2 className="h-9 w-9 text-sky-700" />
                      )}
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                          World Road Championship
                        </div>
                        <div className="mt-1 font-bold text-slate-950">Grand Finale</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      Scheduled from the start of the season. National champions are added automatically.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid min-w-[760px] max-w-5xl grid-cols-[minmax(300px,1fr)_80px_minmax(320px,1fr)] items-center gap-4">
                <Link
                  to={`/dashboard/national-championships/${edition.id}/final`}
                  className="block rounded border border-yellow-300 bg-yellow-50 px-4 py-4 transition hover:border-yellow-500"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-yellow-800">
                    {t('draw.final')}
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {pageDate(edition.final_date, edition.season_number)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {data?.final_host?.route_label ?? t('draw.routePending')}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-700">
                    {t('draw.finalFieldCount', { count: edition.final_field_size })}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-yellow-800">
                    Winner qualifies automatically for the World Road Championship
                  </div>
                </Link>

                <div className="relative h-full min-h-[150px]">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-sky-300" />
                  <div className="absolute bottom-4 left-1/2 top-4 w-px bg-sky-300" />
                  <ChevronRight className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 bg-white text-sky-600" />
                </div>

                {worldData?.edition?.race_id ? (
                  <Link
                    to={`/dashboard/races/${worldData.edition.race_id}`}
                    className="block rounded border border-sky-300 bg-gradient-to-br from-sky-50 via-white to-amber-50 px-4 py-4 transition hover:border-sky-500 hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={worldData.edition.logo_url}
                        alt="World Road Championship"
                        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                          World Road Championship
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-base font-bold text-slate-950">
                            Grand Finale
                          </div>
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              worldChampionshipPhaseClasses(
                                worldChampionshipPhase(worldData),
                              ),
                            ].join(' ')}
                          >
                            {worldChampionshipPhase(worldData)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {pageDate(
                            worldData.edition.race_date,
                            worldData.edition.season_number,
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      {worldData.edition.host_country_name_snapshot ?? 'Warm-weather host'}
                      {worldData.route?.route_label
                        ? ` · ${worldData.route.route_label}`
                        : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
                        {worldData.participant_count} champions qualified
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                        {worldData.confirmed_count} confirmed
                      </span>
                    </div>
                    <div className="mt-3 text-xs font-bold text-sky-800">
                      Open World Championship →
                    </div>
                  </Link>
                ) : (
                  <div className="rounded border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-slate-600">
                    World Road Championship Grand Finale is scheduled for this season.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'ranking' ? (
        <div className="space-y-4">
          <section className="overflow-hidden rounded bg-white shadow">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {data?.ranking_is_frozen ? t('ranking.frozen') : t('ranking.live')}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{t('ranking.description')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-slate-600">
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
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('ranking.refresh')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.rank')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.rider')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.team')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.weighted')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.raw')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.latest')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('ranking.qualificationStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(row => {
                    const qStatus = qualificationStatus(row)
                    return (
                      <tr key={row.rider_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {row.national_rank}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            {flagUrl(row.country_code) ? (
                              <img
                                src={flagUrl(row.country_code) ?? undefined}
                                alt={row.country_code}
                                className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                              />
                            ) : null}
                            <Link
                              to={riderProfilePath(row.rider_id, row.club_id)}
                              className="font-semibold text-slate-900 hover:underline"
                            >
                              {row.rider_name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.club_name ?? t('ranking.freeAgent')}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                          {formatPoints(row.weighted_points)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">
                          {formatPoints(row.raw_points)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {pageDate(row.latest_result_date)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${qStatus.className}`}>
                            {qStatus.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setRankingPage(page => Math.max(1, page - 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('ranking.previous')}
              </button>
              <div className="text-xs text-slate-600">
                {t('ranking.page', { page: safePage, pages: totalPages })}
              </div>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setRankingPage(page => Math.min(totalPages, page + 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('ranking.next')}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          <aside className="rounded bg-white p-4 shadow">
            <h3 className="text-base font-semibold text-slate-900">{t('info.title')}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('info.description')}</p>
          </aside>
        </div>
      ) : null}

      {activeTab === 'duty' ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{t('duty.title')}</h3>
              <p className="mt-1 text-sm text-slate-600">{t('duty.description')}</p>
            </div>
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
              <Lock className="h-4 w-4" />
              {t('duty.locked')}
            </div>
          </div>

          <div className="rounded bg-white p-4 shadow">
            <div className="font-semibold text-slate-900">{t('organizer.title')}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {t('organizer.bidons', {
                  count: String(data?.organizer_supplies?.bidons_water_bottles ?? 8),
                })}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {t('organizer.gels', {
                  count: String(data?.organizer_supplies?.energy_gels ?? 6),
                })}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {t('organizer.nutrition', {
                  count: String(data?.organizer_supplies?.nutrition_packs ?? 2),
                })}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{t('organizer.kit')}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{t('organizer.rain')}</span>
            </div>
          </div>

          {(worldData?.my_entries?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {(worldData?.my_entries ?? []).map(entry => (
                <div
                  key={entry.entry_id}
                  className="overflow-hidden rounded border border-sky-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-sky-50 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          worldData?.edition?.logo_url ??
                          'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp'
                        }
                        alt=""
                        className="h-11 w-11 rounded-lg border border-sky-200 bg-white object-contain p-1"
                      />
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-sky-700">
                          World Road Championship invitation
                        </div>
                        <Link
                          to={riderProfilePath(entry.rider_id, entry.club_id)}
                          className="mt-0.5 block font-bold text-slate-950 hover:underline"
                        >
                          {entry.rider_name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {entry.country_code} National Champion · {entry.club_name ?? t('ranking.freeAgent')}
                        </div>
                      </div>
                    </div>

                    <span
                      className={[
                        'rounded-full px-3 py-1 text-xs font-bold',
                        entry.entry_status === 'unavailable'
                          ? 'bg-rose-100 text-rose-700'
                          : entry.participation_decision === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : entry.participation_decision === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700',
                      ].join(' ')}
                    >
                      {entry.entry_status === 'unavailable'
                        ? 'Unavailable'
                        : entry.participation_decision.replaceAll('_', ' ')}
                    </span>
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="text-sm text-slate-600">
                      <div>
                        Grand Finale: <strong className="text-slate-900">
                          {pageDate(
                            entry.race_date,
                            worldData?.edition?.season_number,
                          )}
                        </strong>
                      </div>
                      <div className="mt-1">
                        Decision deadline: {pageDate(
                          entry.decision_deadline,
                          worldData?.edition?.season_number,
                        )}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        The rider is reserved for this World Championship duty. All costs are covered by the organizer. Approval gives <strong>+10 morale</strong>; refusal gives <strong>-15 morale</strong>. Race fatigue and normal race effects still apply.
                      </div>
                      {entry.race_id ? (
                        <Link
                          to={`/dashboard/races/${entry.race_id}`}
                          className="mt-2 inline-block text-xs font-bold text-sky-700 hover:underline"
                        >
                          Open World Championship race page
                        </Link>
                      ) : null}
                    </div>

                    {entry.participation_decision === 'pending' &&
                    entry.can_decide_participation !== false &&
                    entry.entry_status !== 'unavailable' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={worldDecisionSavingRiderId === entry.rider_id}
                          onClick={() => void decideWorldParticipation(entry, true)}
                          className="inline-flex items-center gap-2 rounded bg-yellow-400 px-3 py-2 text-xs font-bold text-black hover:bg-yellow-300 disabled:opacity-50"
                        >
                          {worldDecisionSavingRiderId === entry.rider_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Allow rider
                        </button>
                        <button
                          type="button"
                          disabled={worldDecisionSavingRiderId === entry.rider_id}
                          onClick={() => void decideWorldParticipation(entry, false)}
                          className="rounded border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Refuse
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {entry.requires_second_confirmation ? (
                    <div
                      className={[
                        'mx-4 mb-4 rounded border p-4',
                        entry.final_participation_decision === 'rejected'
                          ? 'border-red-200 bg-red-50'
                          : entry.final_participation_decision === 'pending'
                            ? 'border-violet-200 bg-violet-50'
                            : 'border-emerald-200 bg-emerald-50',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-950">
                            2nd confirmation · World Championship final
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-600">
                            You already accepted the World Championship invitation.
                            Please confirm the rider again shortly before the Grand Finale.
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Final confirmation deadline:{' '}
                            {pageDate(
                              entry.final_decision_deadline,
                              worldData?.edition?.season_number,
                            )}
                          </div>
                          <div className="mt-2 text-xs font-semibold text-slate-700">
                            Status:{' '}
                            {(entry.final_participation_decision ?? 'not_open').replaceAll(
                              '_',
                              ' ',
                            )}
                          </div>
                        </div>

                        {entry.final_participation_decision === 'pending' &&
                        entry.can_decide_final_participation !== false ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                worldFinalDecisionSavingRiderId === entry.rider_id
                              }
                              onClick={() =>
                                void decideWorldFinalParticipation(entry, true)
                              }
                              className="inline-flex items-center gap-2 rounded bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                            >
                              {worldFinalDecisionSavingRiderId === entry.rider_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Confirm again
                            </button>
                            <button
                              type="button"
                              disabled={
                                worldFinalDecisionSavingRiderId === entry.rider_id
                              }
                              onClick={() =>
                                void decideWorldFinalParticipation(entry, false)
                              }
                              className="rounded border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Refuse final
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {(data?.my_entries?.length ?? 0) === 0 &&
          (worldData?.my_entries?.length ?? 0) === 0 ? (
            <div className="rounded bg-white p-6 text-sm text-slate-500 shadow">
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
                <div key={entry.entry_id} className="overflow-hidden rounded bg-white shadow">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-7 text-sm font-semibold text-slate-900">
                        #{entry.national_rank}
                      </span>
                      <div>
                        <Link
                          to={riderProfilePath(entry.rider_id, entry.club_id)}
                          className="font-semibold text-slate-900 hover:underline"
                        >
                          {entry.rider_name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {entry.club_name ?? t('ranking.freeAgent')}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                      {entry.entry_path === 'direct'
                        ? t('duty.directQualifier')
                        : t('duty.qualificationHeat', {
                            number: entry.heat_number ?? '—',
                          })}
                    </span>
                  </div>

                  <div className="space-y-4 p-4">
                    <div
                      className={[
                        'rounded border p-4',
                        entry.participation_decision === 'rejected'
                          ? 'border-red-200 bg-red-50'
                          : entry.participation_decision === 'pending'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-green-200 bg-green-50',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {t('decision.title')}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-600">
                            {t('decision.blockedWindow', {
                              start: pageDate(
                                entry.duty_window_start_date,
                                edition?.season_number,
                              ),
                              end: pageDate(
                                entry.duty_window_end_date,
                                edition?.season_number,
                              ),
                            })}
                          </div>
                          {entry.participation_decision_deadline ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {t('decision.deadline', {
                                date: pageDate(
                                  entry.participation_decision_deadline,
                                  edition?.season_number,
                                ),
                              })}
                            </div>
                          ) : null}
                          <div className="mt-2 text-xs font-medium text-slate-700">
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
                              className="inline-flex items-center gap-2 rounded bg-yellow-400 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="rounded border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t('decision.reject')}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {entry.participation_decision === 'pending' ? (
                        <div className="mt-3 text-xs text-red-700">
                          {t('decision.rejectWarning')}
                        </div>
                      ) : null}
                      {entry.participation_decision !== 'rejected' ? (
                        <div className="mt-2 text-xs text-slate-600">
                          {t('decision.participationBenefit')}
                        </div>
                      ) : null}
                    </div>

                    {showFinal && entry.requires_second_confirmation ? (
                      <div
                        className={[
                          'rounded border p-4',
                          entry.final_participation_decision === 'rejected'
                            ? 'border-red-200 bg-red-50'
                            : entry.final_participation_decision === 'pending'
                              ? 'border-violet-200 bg-violet-50'
                              : 'border-emerald-200 bg-emerald-50',
                        ].join(' ')}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              2nd confirmation · National Championship final
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-600">
                              This rider has reached the National Championship final.
                              The manager must approve or refuse the final separately.
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Final: {pageDate(edition?.final_date, edition?.season_number)}
                              {' · '}
                              Decision deadline:{' '}
                              {pageDate(
                                entry.final_decision_deadline,
                                edition?.season_number,
                              )}
                            </div>
                            <div className="mt-2 text-xs font-medium text-slate-700">
                              Status:{' '}
                              {(entry.final_participation_decision ?? 'not_open').replaceAll(
                                '_',
                                ' ',
                              )}
                            </div>
                          </div>

                          {entry.final_participation_decision === 'pending' &&
                          entry.can_decide_final_participation !== false ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={
                                  nationalFinalDecisionSavingRiderId === entry.rider_id
                                }
                                onClick={() =>
                                  void decideNationalFinalParticipation(entry, true)
                                }
                                className="inline-flex items-center gap-2 rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                              >
                                {nationalFinalDecisionSavingRiderId === entry.rider_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Confirm final
                              </button>
                              <button
                                type="button"
                                disabled={
                                  nationalFinalDecisionSavingRiderId === entry.rider_id
                                }
                                onClick={() =>
                                  void decideNationalFinalParticipation(entry, false)
                                }
                                className="rounded border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Refuse final
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {showQualification &&
                    entry.participation_decision !== 'rejected' ? (
                      <NationalDutyPlanCard
                        entry={entry}
                        eventType="qualification"
                        eventDate={entry.duty_window_start_date ?? edition?.qualification_date}
                        raceHref={
                          edition
                            ? `/dashboard/national-championships/${edition.id}/qualification/${entry.heat_number ?? 1}`
                            : null
                        }
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
                      <div className="space-y-2">
                        <NationalDutyPlanCard
                          entry={entry}
                          eventType="final"
                          eventDate={edition?.final_date}
                          raceHref={
                            edition
                              ? `/dashboard/national-championships/${edition.id}/final`
                              : null
                          }
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

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-4 py-3">
                          <div className="text-xs leading-5 text-red-800">
                            A qualified rider can still be withdrawn before the final. The rider will be removed immediately from the final startlist and receives the National Championship refusal morale penalty.
                          </div>
                          <button
                            type="button"
                            disabled={
                              finalWithdrawalSavingRiderId === entry.rider_id
                            }
                            onClick={() => void withdrawFromNationalFinal(entry)}
                            className="inline-flex shrink-0 items-center gap-2 rounded border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {finalWithdrawalSavingRiderId === entry.rider_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Withdraw from final
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {((!showQualification && !showFinal) ||
                      entry.participation_decision === 'rejected') ? (
                      <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        {t('duty.noPlan')}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </section>
      ) : null}

      {activeTab === 'history' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded bg-white p-4 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-slate-900">{t('results.title')}</h3>
            </div>

            {finalResults.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {finalResults.slice(0, 50).map(result => (
                  <div
                    key={`${result.rider_id}:${result.rank}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 font-semibold text-slate-700">{result.rank}</span>
                      <Link
                        to={riderProfilePath(result.rider_id, result.club_id)}
                        className="font-semibold text-slate-900 hover:underline"
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
            ) : (
              <div className="text-sm text-slate-500">{t('results.pending')}</div>
            )}
          </div>

          <div className="rounded bg-white p-4 shadow">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-slate-900">{t('champions.title')}</h3>
            </div>

            {(data?.past_champions?.length ?? 0) > 0 ? (
              <div className="divide-y divide-slate-100">
                {data?.past_champions.map(champion => (
                  <div
                    key={`${champion.season_number}:${champion.champion_rider_id}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div>
                      <div className="text-xs text-slate-500">
                        {t('champions.season', { number: champion.season_number })}
                      </div>
                      <Link
                        to={riderProfilePath(
                          champion.champion_rider_id,
                          champion.champion_club_id,
                        )}
                        className="font-semibold text-slate-900 hover:underline"
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
