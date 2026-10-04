import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Crown, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AcademyRider = {
  id: string
  display_name: string
  country_code: string
  age: number
  role: string
  assessment_band: string
  development_focus: string
  workload: string
  readiness: number
  fatigue: number
  status: string
  stipend_weekly: number
}

type AcademyStaff = {
  id: string
  role_type: string
  specialization?: string | null
  team_scope?: string | null
  staff_name: string
  first_name?: string | null
  last_name?: string | null
  country_code: string
  birth_date?: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  contract_expires_at?: string | null
}

type ScoutingProgram = {
  range_code: 'local' | 'regional' | 'continental' | 'world'
  label: string
  season_cost: number
  sort_order: number
}

type RecruitmentOfferSummary = {
  id: string
  status: 'submitted' | 'academy_rejected' | 'rider_rejected' | 'accepted'
  stipend_weekly: number
  accommodation_weekly: number
  compensation_offer: number
  source_academy_decision: string
  rider_decision: string
  rejection_reason?: string | null
  submitted_on: string
}

type ScoutingReport = {
  id: string
  target_kind: 'unattached' | 'academy'
  display_name: string
  country_code: string
  age: number
  role: string
  assessment_band: string
  confidence: number
  strengths: string[]
  expected_stipend_weekly: number
  suggested_accommodation_weekly: number
  suggested_compensation: number
  relocation_difficulty: 'easy' | 'moderate' | 'hard' | 'very_hard'
  source_academy_id?: string | null
  source_academy_name?: string | null
  status: 'new' | 'shortlisted' | 'approached' | 'signed' | 'expired'
  discovered_on: string
  expires_on: string
  latest_offer?: RecruitmentOfferSummary | null
}

type ScoutingPayload = {
  activated: boolean
  premium: boolean
  read_only?: boolean
  game_date?: string
  cycle_month?: string
  cycle_week?: string
  weekly_runs_used?: number
  weekly_run_limit?: number
  free_runs_remaining?: number
  boost_runs_remaining?: number
  next_run_coin_cost?: number
  boost_coin_cost?: number
  coin_balance?: number
  scouting_range?: 'local' | 'regional' | 'continental' | 'world'
  scouting_budget?: number
  scouting_committed_amount?: number
  scout?: {
    id: string
    name: string
    country_code: string
    expertise: number
    experience: number
    efficiency: number
    score: number
    monthly_report_quota: number
    reports_per_search?: number
  } | null
  current_cycle?: {
    id: string
    cycle_month: string
    cycle_week?: string
    run_number?: number
    coin_cost?: number
    is_coin_boost?: boolean
    range: string
    scout_score: number
    reports_created: number
  } | null
  can_run?: boolean
  can_run_free?: boolean
  can_run_coin?: boolean
  director_mode?: boolean
  auto_rules?: {
    min_band: 'promising' | 'very_promising' | 'exceptional'
    max_stipend_weekly: number
    max_compensation: number
    min_free_slots: number
  }
  reports?: ScoutingReport[]
}

type OfferDraft = {
  stipend: number
  accommodation: number
  compensation: number
}

type IncomingYouthOffer = {
  id: string
  report_id: string
  rider_id: string
  rider_name: string
  rider_country_code: string
  rider_age: number
  offering_academy_id: string
  offering_club_name: string
  offering_country_code: string
  stipend_weekly: number
  accommodation_weekly: number
  compensation_offer: number
  submitted_on: string
  status: string
}

type YouthFinancePayload = {
  activated: boolean
  season_number?: number
  initial_allocation?: number
  season_budget?: number
  spent_amount?: number
  committed_amount?: number
  available_amount?: number
  senior_cash_balance?: number
  weekly_rider_support?: number
  weekly_staff_salary?: number
  weekly_operating_commitment?: number
  equipment_spend?: number
  race_income?: number
  budget_transfer_in?: number
  budget_transfer_out?: number
  ledger?: Array<{
    id: string
    game_date: string
    category: string
    description: string
    amount: number
  }>
}

type YouthEquipmentCatalogItem = {
  id: string
  display_name: string
  equipment_category: string
  tier: number
  quality_score: number
  durability_score: number
  price: number
}

type YouthEquipmentInventoryItem = {
  id: string
  catalog_item_id: string
  display_name: string
  equipment_category: string
  quality_score: number
  durability_score: number
  condition_percent: number
  purchase_cost: number
  status: string
  purchased_on: string
}

type YouthEquipmentPayload = {
  activated: boolean
  equipment_decider?: 'manager' | 'academy_director'
  catalog?: YouthEquipmentCatalogItem[]
  inventory?: YouthEquipmentInventoryItem[]
}

type YouthGraduation = {
  id: string
  youth_rider_id: string
  rider_name: string
  country_code: string
  role: string
  assessment_band: string
  became_eligible_on: string
  decision: 'pending' | 'pathway' | 'developing_team' | 'release'
  pathway_expires_on?: string | null
  completed_on?: string | null
  professional_rider_id?: string | null
  has_developing_team: boolean
  developing_team_free_slots: number
}

type YouthRaceLineupRider = {
  rider_id: string
  name: string
  age: number
  role: string
  readiness: number
  fatigue: number
  eligible: boolean
}

type YouthRaceResult = {
  rider_id?: string
  name?: string
  rider_name?: string
  country_code?: string
  academy_name?: string
  status?: string
  position?: number | null
  gap_seconds?: number | null
  regional_points?: number
  world_points?: number
}

type YouthCompetitionClass = 'world' | 'continental' | 'regional'

type YouthCompetitionMembership = {
  competition_class: YouthCompetitionClass
  division_code: string
  seed_rank?: number | null
}

type YouthMonthlyRacePlan = {
  month_number: number
  world_race_limit: number
  continental_race_limit: number
  regional_race_limit: number
  max_monthly_cost: number
  approved: boolean
  available_world: number
  available_continental: number
  available_regional: number
  entered_cost: number
}

type YouthRace = {
  id: string
  race_date: string
  race_end_date?: string
  race_days?: number
  race_name: string
  race_level: 'regional' | 'world_series' | 'world_final'
  competition_class: YouthCompetitionClass
  division_code?: string | null
  region_code: string
  host_city?: string | null
  host_country_code?: string | null
  terrain_type: string
  distance_km: number
  entry_cost: number
  lineup_size: number
  team_limit?: number
  entries_count?: number
  status: 'scheduled' | 'completed' | 'cancelled'
  prelaunch_past?: boolean
  is_home_regional?: boolean
  qualified: boolean
  invitation_status?: 'pending' | 'accepted' | 'declined' | 'expired' | 'waitlist' | null
  invitation_type?: string | null
  invitation_response_deadline?: string | null
  entry_id?: string | null
  entry_status?: string | null
  strategy?: 'conservative' | 'balanced' | 'aggressive' | null
  entered_by?: string | null
  eligible_rider_ids?: string[]
  lineup?: YouthRaceLineupRider[]
  my_results?: YouthRaceResult[]
  top_results?: YouthRaceResult[]
}

type YouthRaceCalendarPayload = {
  activated: boolean
  season_number?: number
  game_date?: string
  current_month?: number
  academy_region?: string
  regional_division?: string
  competition_membership?: YouthCompetitionMembership
  monthly_plan?: YouthMonthlyRacePlan
  race_entry_decider?: 'manager' | 'u16_head_coach'
  race_squad_decider?: 'manager' | 'u16_head_coach'
  races?: YouthRace[]
  riders?: Array<{
    id: string
    name: string
    age: number
    role: string
    readiness: number
    fatigue: number
  }>
}

type YouthRaceMonthPayload = {
  activated: boolean
  season_number?: number
  month_number?: number
  competition_filter?: 'all' | YouthCompetitionClass
  scope?: 'all' | 'my_opportunities'
  regional_division?: string
  monthly_plan?: YouthMonthlyRacePlan
  class_counts?: {
    world: number
    continental: number
    regional: number
  }
  races?: YouthRace[]
}

type YouthEquipmentInnerTab = 'overview' | 'inventory' | 'market' | 'assets'

type YouthRankingRow = {
  rank: number
  rider_id: string
  rider_name: string
  country_code: string
  academy_id: string
  academy_name: string
  points: number
  starts: number
  is_mine: boolean
}

type YouthAcademyStandingRow = {
  rank: number
  academy_id: string
  academy_name: string
  country_code: string
  points: number
  starts: number
  total_teams: number
  is_mine: boolean
  promotion_zone: boolean
  relegation_zone: boolean
}

type YouthAcademyDivision = {
  competition_class: YouthCompetitionClass
  division_code: string
  teams: YouthAcademyStandingRow[]
}

type YouthRankingsPayload = {
  activated: boolean
  season_number?: number
  region_code?: string
  my_membership?: YouthCompetitionMembership
  academy_divisions?: YouthAcademyDivision[]
  regional?: YouthRankingRow[]
  world?: YouthRankingRow[]
}

type YouthHistoryPayload = {
  activated: boolean
  race_report_frequency?: 'every_race' | 'important_only' | 'podium_exceptional' | 'problems_only' | 'never'
  summary?: {
    graduates: number
    race_wins: number
    podiums: number
    races_completed: number
  }
  alumni?: Array<{
    youth_rider_id: string
    rider_name: string
    country_code: string
    role: string
    joined_game_date: string
    joined_season: number
    joined_age: number
    graduated_on?: string | null
    graduation_age?: number | null
    graduation_decision?: string | null
    professional_rider_id?: string | null
    race_starts: number
    wins: number
    podiums: number
    regional_points: number
    world_points: number
    final_regional_rank?: number | null
    final_world_rank?: number | null
  }>
  race_reports?: Array<{
    race_id: string
    race_name: string
    race_date: string
    race_level: string
    terrain_type: string
    distance_km: number
    report_class: 'routine' | 'important' | 'exceptional' | 'problem'
    headline: string
    summary: string
    best_finish?: number | null
    podium_count: number
    dnf_count: number
    dns_count: number
    regional_points: number
    world_points: number
    fatigue_added: number
    development_events: number
    key_events?: Array<{
      rider_id: string
      rider_name: string
      result_status: string
      position?: number | null
      gap_seconds?: number | null
      regional_points?: number
      world_points?: number
      fatigue_delta?: number
      development_bonus?: number
      incident_code?: string | null
    }>
  }>
  development_history?: Array<{
    week_start: string
    processed_on: string
    youth_rider_id: string
    rider_name: string
    age: number
    workload: string
    development_focus: string
    attribute_changed?: string | null
    primary_delta: number
    secondary_attribute_changed?: string | null
    secondary_delta: number
    readiness_before: number
    readiness_after: number
    fatigue_before: number
    fatigue_after: number
  }>
}

type AcademyPayload = {
  premium: boolean
  activated: boolean
  read_only?: boolean
  club_id: string
  club_name: string
  country_code: string
  capacity: number
  starter_riders?: number
  default_season_budget?: number
  default_scouting_range?: string
  default_scouting_cost?: number
  academy?: {
    id: string
    capacity: number
    active_riders: number
    reputation: number
    activated_season: number
  }
  budget?: {
    season_number: number
    season_budget: number
    initial_allocation?: number
    spent_amount: number
    committed_amount: number
    scouting_range: 'local' | 'regional' | 'continental' | 'world'
    scouting_budget: number
  }
  settings?: {
    recruitment_decider: 'manager' | 'academy_director'
    race_entry_decider: 'manager' | 'u16_head_coach'
    race_squad_decider: 'manager' | 'u16_head_coach'
    camp_decider: 'manager' | 'academy_director'
    equipment_decider: 'manager' | 'academy_director'
    recruitment_negotiation_decider: 'manager' | 'academy_director'
    auto_recruit_min_band: 'promising' | 'very_promising' | 'exceptional'
    auto_recruit_max_stipend_weekly: number
    auto_recruit_max_compensation: number
    auto_recruit_min_free_slots: number
    training_philosophy?: 'freshness' | 'balanced' | 'development'
  }
  riders?: AcademyRider[]
  staff?: AcademyStaff[]
  scouting_programs?: ScoutingProgram[]
}

type TabKey =
  | 'overview'
  | 'riders'
  | 'staff'
  | 'budget'
  | 'scouting'
  | 'settings'
  | 'calendar'
  | 'rankings'
  | 'equipment'
  | 'history'

function money(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function humanizeCode(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function contractSeason(value: string | null | undefined): string {
  if (!value) return '—'
  const year = Number(String(value).slice(0, 4))
  return Number.isFinite(year) && year >= 2000 ? `Season ${year - 1999}` : '—'
}

function youthStaffScore(member: AcademyStaff): number {
  const role = member.role_type
  const weights =
    role === 'youth_academy_director'
      ? [0.20, 0.15, 0.10, 0.25, 0.25, 0.05]
      : role === 'u16_head_coach'
        ? [0.30, 0.10, 0.20, 0.10, 0.25, 0.05]
        : [0.35, 0.20, 0.10, 0.05, 0.25, 0.05]
  const values = [
    member.expertise, member.experience, member.potential,
    member.leadership, member.efficiency, member.loyalty,
  ]
  return Math.round(values.reduce((sum, value, index) => sum + Number(value ?? 0) * weights[index], 0))
}

function youthStaffLevel(score: number): string {
  if (score < 30) return 'Poor'
  if (score < 45) return 'Basic'
  if (score < 60) return 'Competent'
  if (score < 75) return 'Strong'
  if (score < 90) return 'Elite'
  return 'World Class'
}

function youthSalaryRange(role: string): string {
  if (role === 'youth_academy_director') return '€432–€1,296/week'
  if (role === 'u16_head_coach') return '€405–€1,269/week'
  return '€351–€1,215/week'
}

function percent(part: number | null | undefined, total: number | null | undefined): number {
  const safeTotal = Number(total ?? 0)
  if (safeTotal <= 0) return 0
  return Math.max(0, Math.min(100, (Number(part ?? 0) / safeTotal) * 100))
}

function monthLabel(month: number | null | undefined): string {
  const safe = Math.max(1, Math.min(12, Number(month ?? 1)))
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    new Date(2000, safe - 1, 1)
  )
}

function flagUrl(code: string | null | undefined): string | null {
  const safe = String(code ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(safe) ? `https://flagcdn.com/w40/${safe}.png` : null
}

function Card({
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
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function YouthAcademyPage(): JSX.Element {
  const { t } = useTranslation('youthAcademy')
  const location = useLocation()
  const [data, setData] = useState<AcademyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [activationBudget, setActivationBudget] = useState(100000)
  const [draftRange, setDraftRange] =
    useState<'local' | 'regional' | 'continental' | 'world'>('local')
  const [draftSettings, setDraftSettings] = useState<AcademyPayload['settings']>()
  const [scoutingData, setScoutingData] = useState<ScoutingPayload | null>(null)
  const [scoutingLoading, setScoutingLoading] = useState(false)
  const [scoutingAction, setScoutingAction] = useState<string | null>(null)
  const [offerDrafts, setOfferDrafts] = useState<Record<string, OfferDraft>>({})
  const [incomingOffers, setIncomingOffers] = useState<IncomingYouthOffer[]>([])
  const [financeData, setFinanceData] = useState<YouthFinancePayload | null>(null)
  const [budgetTransferDirection, setBudgetTransferDirection] = useState<'senior_to_youth' | 'youth_to_senior'>('senior_to_youth')
  const [budgetTransferAmount, setBudgetTransferAmount] = useState(10000)
  const [budgetTransferLoading, setBudgetTransferLoading] = useState(false)
  const [equipmentData, setEquipmentData] = useState<YouthEquipmentPayload | null>(null)
  const [equipmentInnerTab, setEquipmentInnerTab] = useState<YouthEquipmentInnerTab>('overview')
  const [phase2Loading, setPhase2Loading] = useState(false)
  const [equipmentAction, setEquipmentAction] = useState<string | null>(null)
  const [graduations, setGraduations] = useState<YouthGraduation[]>([])
  const [graduationAction, setGraduationAction] = useState<string | null>(null)
  const [raceCalendar, setRaceCalendar] = useState<YouthRaceCalendarPayload | null>(null)
  const [raceMonthData, setRaceMonthData] = useState<YouthRaceMonthPayload | null>(null)
  const [youthRankings, setYouthRankings] = useState<YouthRankingsPayload | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(0)
  const [calendarClassFilter, setCalendarClassFilter] = useState<'all' | YouthCompetitionClass>('all')
  const [calendarScope, setCalendarScope] = useState<'all' | 'my_opportunities'>('all')
  const [rankingClassFilter, setRankingClassFilter] = useState<'world' | 'continental' | 'regional'>('world')
  const [rankingDivisionFilter, setRankingDivisionFilter] = useState('')
  const [responsibilityAction, setResponsibilityAction] = useState<string | null>(null)
  const [monthlyPlanDraft, setMonthlyPlanDraft] = useState<YouthMonthlyRacePlan | null>(null)
  const [phase3Loading, setPhase3Loading] = useState(false)
  const [raceAction, setRaceAction] = useState<string | null>(null)
  const [lineupDrafts, setLineupDrafts] = useState<Record<string, string[]>>({})
  const [raceStrategies, setRaceStrategies] = useState<
    Record<string, 'conservative' | 'balanced' | 'aggressive'>
  >({})
  const [historyData, setHistoryData] = useState<YouthHistoryPayload | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [raceReportFrequency, setRaceReportFrequency] = useState<
    'every_race' | 'important_only' | 'podium_exceptional' | 'problems_only' | 'never'
  >('important_only')

  const competitionLabel = (
    competitionClass: YouthCompetitionClass | null | undefined,
    divisionCode?: string | null
  ): string => {
    if (competitionClass === 'world') return t('calendar.competition.world')
    if (competitionClass === 'continental') {
      return `${t('calendar.competition.continental')} · ${humanizeCode(String(divisionCode ?? '').replace('CONTINENTAL_', ''))}`
    }
    if (competitionClass === 'regional') {
      return `${t('calendar.competition.regional')} · ${humanizeCode(divisionCode)}`
    }
    return t('calendar.competition.youth')
  }

  const applyScoutingPayload = (payload: ScoutingPayload): void => {
    setScoutingData(payload)
    setOfferDrafts(current => {
      const next = { ...current }
      for (const report of payload.reports ?? []) {
        if (!next[report.id]) {
          next[report.id] = {
            stipend: Number(report.expected_stipend_weekly ?? 100),
            accommodation: Number(report.suggested_accommodation_weekly ?? 0),
            compensation: Number(report.suggested_compensation ?? 0),
          }
        }
      }
      return next
    })
  }

  const loadScouting = async (): Promise<void> => {
    setScoutingLoading(true)
    try {
      const [scoutingResult, incomingResult] = await Promise.all([
        supabase.rpc('get_my_youth_scouting_v1'),
        supabase.rpc('get_my_youth_incoming_offers_v1'),
      ])

      if (scoutingResult.error) throw scoutingResult.error
      if (incomingResult.error) throw incomingResult.error

      applyScoutingPayload(scoutingResult.data as ScoutingPayload)
      setIncomingOffers((incomingResult.data ?? []) as IncomingYouthOffer[])
    } catch (scoutingError: any) {
      console.error('Youth scouting load failed:', scoutingError)
      setError(scoutingError?.message ?? t('errors.scoutingLoad'))
    } finally {
      setScoutingLoading(false)
    }
  }

  const runScoutingCycle = async (useCoins = false): Promise<void> => {
    if (scoutingAction || data?.read_only) return
    setScoutingAction(useCoins ? 'cycle-coins' : 'cycle')
    setError(null)
    try {
      const { data: payload, error: cycleError } = await supabase.rpc(
        'run_my_youth_scouting_search_v2',
        { p_use_coins: useCoins }
      )
      if (cycleError) throw cycleError
      applyScoutingPayload(payload as ScoutingPayload)
      await load()
    } catch (cycleError: any) {
      console.error('Youth scouting cycle failed:', cycleError)
      setError(cycleError?.message ?? t('errors.scoutingRun'))
    } finally {
      setScoutingAction(null)
    }
  }

  const updateOfferDraft = (
    report: ScoutingReport,
    key: keyof OfferDraft,
    value: number
  ): void => {
    setOfferDrafts(current => ({
      ...current,
      [report.id]: {
        stipend: current[report.id]?.stipend ?? report.expected_stipend_weekly,
        accommodation:
          current[report.id]?.accommodation ?? report.suggested_accommodation_weekly,
        compensation:
          current[report.id]?.compensation ?? report.suggested_compensation,
        [key]: Math.max(0, Math.round(value || 0)),
      },
    }))
  }

  const submitRecruitmentOffer = async (report: ScoutingReport): Promise<void> => {
    if (scoutingAction || data?.read_only || report.status === 'signed') return
    const draft = offerDrafts[report.id] ?? {
      stipend: report.expected_stipend_weekly,
      accommodation: report.suggested_accommodation_weekly,
      compensation: report.suggested_compensation,
    }

    setScoutingAction(report.id)
    setError(null)
    try {
      const { data: payload, error: offerError } = await supabase.rpc(
        'submit_youth_recruitment_offer_v1',
        {
          p_report_id: report.id,
          p_stipend_weekly: Math.max(50, Math.round(draft.stipend)),
          p_accommodation_weekly: Math.max(0, Math.round(draft.accommodation)),
          p_compensation_offer: Math.max(0, Math.round(draft.compensation)),
        }
      )
      if (offerError) throw offerError
      applyScoutingPayload(payload as ScoutingPayload)
      await load()
    } catch (offerError: any) {
      console.error('Youth recruitment offer failed:', offerError)
      setError(offerError?.message ?? t('errors.recruitmentOffer'))
    } finally {
      setScoutingAction(null)
    }
  }

  const respondToIncomingOffer = async (
    offer: IncomingYouthOffer,
    accept: boolean
  ): Promise<void> => {
    if (scoutingAction || data?.read_only) return

    setScoutingAction(`incoming:${offer.id}`)
    setError(null)
    try {
      const { data: payload, error: responseError } = await supabase.rpc(
        'respond_to_youth_recruitment_offer_v1',
        {
          p_offer_id: offer.id,
          p_accept: accept,
        }
      )
      if (responseError) throw responseError

      setIncomingOffers((payload ?? []) as IncomingYouthOffer[])
      await load()
      await loadScouting()
    } catch (responseError: any) {
      console.error('Youth incoming recruitment response failed:', responseError)
      setError(responseError?.message ?? t('errors.incomingOffer'))
    } finally {
      setScoutingAction(null)
    }
  }

  const loadFinance = async (): Promise<void> => {
    setPhase2Loading(true)
    try {
      const { data: payload, error: financeError } = await supabase.rpc(
        'get_my_youth_academy_finances_v1'
      )
      if (financeError) throw financeError
      setFinanceData(payload as YouthFinancePayload)
    } catch (financeError: any) {
      console.error('Youth Academy finance load failed:', financeError)
      setError(financeError?.message ?? t('errors.financeLoad'))
    } finally {
      setPhase2Loading(false)
    }
  }

  const transferYouthBudget = async (): Promise<void> => {
    if (data?.read_only || budgetTransferLoading || budgetTransferAmount <= 0) return
    setBudgetTransferLoading(true)
    setError(null)
    try {
      const { data: payload, error: transferError } = await supabase.rpc(
        'transfer_my_youth_academy_budget_v1',
        {
          p_direction: budgetTransferDirection,
          p_amount: Math.max(1, Math.round(budgetTransferAmount)),
        }
      )
      if (transferError) throw transferError
      setFinanceData(payload as YouthFinancePayload)
      await load()
    } catch (transferError: any) {
      console.error('Youth Academy budget transfer failed:', transferError)
      setError(transferError?.message ?? t('errors.budgetTransfer'))
    } finally {
      setBudgetTransferLoading(false)
    }
  }

  const loadEquipment = async (): Promise<void> => {
    setPhase2Loading(true)
    try {
      const { data: payload, error: equipmentError } = await supabase.rpc(
        'get_my_youth_academy_equipment_v1'
      )
      if (equipmentError) throw equipmentError
      setEquipmentData(payload as YouthEquipmentPayload)
    } catch (equipmentError: any) {
      console.error('Youth Academy equipment load failed:', equipmentError)
      setError(equipmentError?.message ?? t('errors.equipmentLoad'))
    } finally {
      setPhase2Loading(false)
    }
  }

  const purchaseEquipment = async (
    item: YouthEquipmentCatalogItem
  ): Promise<void> => {
    if (data?.read_only || equipmentAction) return
    setEquipmentAction(item.id)
    setError(null)
    try {
      const { data: payload, error: purchaseError } = await supabase.rpc(
        'purchase_my_youth_academy_equipment_v1',
        { p_catalog_item_id: item.id }
      )
      if (purchaseError) throw purchaseError
      setEquipmentData(payload as YouthEquipmentPayload)
      await loadFinance()
      await load()
    } catch (purchaseError: any) {
      console.error('Youth Academy equipment purchase failed:', purchaseError)
      setError(purchaseError?.message ?? t('errors.equipmentPurchase'))
    } finally {
      setEquipmentAction(null)
    }
  }

  const runEquipmentDirector = async (): Promise<void> => {
    if (data?.read_only || equipmentAction) return
    setEquipmentAction('director')
    setError(null)
    try {
      const { data: payload, error: directorError } = await supabase.rpc(
        'run_my_youth_academy_equipment_director_v1'
      )
      if (directorError) throw directorError
      setEquipmentData(payload as YouthEquipmentPayload)
      await loadFinance()
      await load()
    } catch (directorError: any) {
      console.error('Youth Academy Director equipment run failed:', directorError)
      setError(directorError?.message ?? t('errors.equipmentDirector'))
    } finally {
      setEquipmentAction(null)
    }
  }

  const applyRaceCalendar = (payload: YouthRaceCalendarPayload): void => {
    setRaceCalendar(payload)
    setMonthlyPlanDraft(payload.monthly_plan ?? null)
    setCalendarMonth(current => current || payload.current_month || 1)
    setLineupDrafts(current => {
      const next = { ...current }
      for (const race of payload.races ?? []) {
        if (!next[race.id]) {
          next[race.id] = (race.lineup ?? []).map(item => item.rider_id)
        }
      }
      return next
    })
    setRaceStrategies(current => {
      const next = { ...current }
      for (const race of payload.races ?? []) {
        if (!next[race.id]) {
          next[race.id] = race.strategy ?? 'balanced'
        }
      }
      return next
    })
  }

  const loadHistory = async (): Promise<void> => {
    setHistoryLoading(true)
    try {
      const { data: payload, error: historyError } = await supabase.rpc(
        'get_my_youth_academy_history_v1'
      )
      if (historyError) throw historyError
      const next = payload as YouthHistoryPayload
      setHistoryData(next)
      setRaceReportFrequency(next.race_report_frequency ?? 'important_only')
    } catch (historyError: any) {
      console.error('Youth Academy history load failed:', historyError)
      setError(historyError?.message ?? t('errors.historyLoad'))
    } finally {
      setHistoryLoading(false)
    }
  }

  const saveRaceReportFrequency = async (): Promise<void> => {
    if (data?.read_only || saving) return
    setSaving(true)
    setError(null)
    try {
      const { error: frequencyError } = await supabase.rpc(
        'update_my_youth_race_report_frequency_v1',
        { p_frequency: raceReportFrequency }
      )
      if (frequencyError) throw frequencyError
      await loadHistory()
    } catch (frequencyError: any) {
      console.error('Youth race report preference save failed:', frequencyError)
      setError(frequencyError?.message ?? t('errors.reportFrequency'))
    } finally {
      setSaving(false)
    }
  }

  const loadRaceCalendar = async (): Promise<void> => {
    setPhase3Loading(true)
    try {
      const { data: payload, error: calendarError } = await supabase.rpc(
        'get_my_youth_race_calendar_v1'
      )
      if (calendarError) throw calendarError
      applyRaceCalendar(payload as YouthRaceCalendarPayload)
    } catch (calendarError: any) {
      console.error('Youth race calendar load failed:', calendarError)
      setError(calendarError?.message ?? t('errors.calendarLoad'))
    } finally {
      setPhase3Loading(false)
    }
  }

  const loadRaceMonth = async (
    month = calendarMonth || raceCalendar?.current_month || 1,
    competitionClass = calendarClassFilter,
    scope = calendarScope
  ): Promise<void> => {
    setPhase3Loading(true)
    try {
      const { data: payload, error: monthError } = await supabase.rpc(
        'get_my_youth_race_month_v1',
        {
          p_month_number: month,
          p_competition_class: competitionClass,
          p_scope: scope,
        }
      )
      if (monthError) throw monthError
      const next = payload as YouthRaceMonthPayload
      setRaceMonthData(next)
      if (next.monthly_plan) setMonthlyPlanDraft(next.monthly_plan)
    } catch (monthError: any) {
      console.error('Youth race month load failed:', monthError)
      setError(monthError?.message ?? t('errors.calendarLoad'))
    } finally {
      setPhase3Loading(false)
    }
  }

  const loadYouthRankings = async (): Promise<void> => {
    setPhase3Loading(true)
    try {
      const { data: payload, error: rankingsError } = await supabase.rpc(
        'get_my_youth_rankings_v1'
      )
      if (rankingsError) throw rankingsError
      setYouthRankings(payload as YouthRankingsPayload)
    } catch (rankingsError: any) {
      console.error('Youth rankings load failed:', rankingsError)
      setError(rankingsError?.message ?? t('errors.rankingsLoad'))
    } finally {
      setPhase3Loading(false)
    }
  }

  const saveYouthMonthlyRacePlan = async (): Promise<void> => {
    if (data?.read_only || !monthlyPlanDraft || raceAction) return
    setRaceAction('monthly-plan')
    setError(null)
    try {
      const { data: payload, error: planError } = await supabase.rpc(
        'save_my_youth_monthly_race_plan_v1',
        {
          p_month_number: monthlyPlanDraft.month_number,
          p_world_race_limit: monthlyPlanDraft.world_race_limit,
          p_continental_race_limit: monthlyPlanDraft.continental_race_limit,
          p_regional_race_limit: monthlyPlanDraft.regional_race_limit,
          p_max_monthly_cost: Math.max(0, Math.round(monthlyPlanDraft.max_monthly_cost)),
        }
      )
      if (planError) throw planError
      applyRaceCalendar(payload as YouthRaceCalendarPayload)
      await loadRaceMonth(monthlyPlanDraft.month_number, calendarClassFilter, calendarScope)
      await loadFinance()
    } catch (planError: any) {
      console.error('Youth monthly race plan save failed:', planError)
      setError(planError?.message ?? t('errors.monthlyRacePlan'))
    } finally {
      setRaceAction(null)
    }
  }

  const declineYouthRaceInvitation = async (race: YouthRace): Promise<void> => {
    if (data?.read_only || raceAction) return
    setRaceAction(`decline:${race.id}`)
    setError(null)
    try {
      const { data: payload, error: declineError } = await supabase.rpc(
        'decline_my_youth_race_invitation_v1',
        { p_race_id: race.id }
      )
      if (declineError) throw declineError
      applyRaceCalendar(payload as YouthRaceCalendarPayload)
      await loadRaceMonth(calendarMonth, calendarClassFilter, calendarScope)
    } catch (declineError: any) {
      console.error('Youth race invitation decline failed:', declineError)
      setError(declineError?.message ?? t('errors.raceInvitationDecline'))
    } finally {
      setRaceAction(null)
    }
  }

  const enterYouthRace = async (race: YouthRace): Promise<void> => {
    if (data?.read_only || raceAction) return
    setRaceAction(race.id)
    setError(null)
    try {
      const { data: payload, error: enterError } = await supabase.rpc(
        'enter_my_youth_race_v1',
        {
          p_race_id: race.id,
          p_strategy: raceStrategies[race.id] ?? 'balanced',
        }
      )
      if (enterError) throw enterError
      applyRaceCalendar(payload as YouthRaceCalendarPayload)
      await loadRaceMonth(calendarMonth, calendarClassFilter, calendarScope)
      await loadFinance()
    } catch (enterError: any) {
      console.error('Youth race entry failed:', enterError)
      setError(enterError?.message ?? t('errors.raceEntry'))
    } finally {
      setRaceAction(null)
    }
  }

  const toggleRaceLineupRider = (
    race: YouthRace,
    riderId: string
  ): void => {
    setLineupDrafts(current => {
      const selected = current[race.id] ?? []
      if (selected.includes(riderId)) {
        return {
          ...current,
          [race.id]: selected.filter(id => id !== riderId),
        }
      }
      if (selected.length >= race.lineup_size) return current
      return {
        ...current,
        [race.id]: [...selected, riderId],
      }
    })
  }

  const saveYouthRaceLineup = async (race: YouthRace): Promise<void> => {
    if (data?.read_only || raceAction) return
    setRaceAction(`lineup:${race.id}`)
    setError(null)
    try {
      const { data: payload, error: lineupError } = await supabase.rpc(
        'save_my_youth_race_lineup_v1',
        {
          p_race_id: race.id,
          p_rider_ids: lineupDrafts[race.id] ?? [],
          p_strategy: raceStrategies[race.id] ?? 'balanced',
        }
      )
      if (lineupError) throw lineupError
      applyRaceCalendar(payload as YouthRaceCalendarPayload)
    } catch (lineupError: any) {
      console.error('Youth race lineup save failed:', lineupError)
      setError(lineupError?.message ?? t('errors.raceLineup'))
    } finally {
      setRaceAction(null)
    }
  }

  const loadGraduations = async (): Promise<void> => {
    try {
      const { data: payload, error: graduationError } = await supabase.rpc(
        'get_my_youth_graduations_v1'
      )
      if (graduationError) throw graduationError
      setGraduations((payload ?? []) as YouthGraduation[])
    } catch (graduationError: any) {
      console.error('Youth Academy graduation load failed:', graduationError)
      setError(graduationError?.message ?? t('errors.graduationLoad'))
    }
  }

  const decideGraduation = async (
    graduation: YouthGraduation,
    decision: 'pathway' | 'developing_team' | 'release'
  ): Promise<void> => {
    if (data?.read_only || graduationAction) return
    setGraduationAction(graduation.id)
    setError(null)
    try {
      const { data: payload, error: graduationError } = await supabase.rpc(
        'decide_my_youth_graduation_v1',
        {
          p_youth_rider_id: graduation.youth_rider_id,
          p_decision: decision,
        }
      )
      if (graduationError) throw graduationError
      setGraduations((payload ?? []) as YouthGraduation[])
      await load()
    } catch (graduationError: any) {
      console.error('Youth Academy graduation decision failed:', graduationError)
      setError(graduationError?.message ?? t('errors.graduationDecision'))
    } finally {
      setGraduationAction(null)
    }
  }

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const { data: payload, error: loadError } = await supabase.rpc(
        'get_my_youth_academy_v1'
      )
      if (loadError) throw loadError
      const next = payload as AcademyPayload
      setData(next)
      setActivationBudget(Number(next.default_season_budget ?? 100000))
      setDraftRange(next.budget?.scouting_range ?? 'local')
      setDraftSettings(next.settings)
    } catch (loadError: any) {
      console.error('Youth Academy load failed:', loadError)
      setError(loadError?.message ?? t('errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab') as TabKey | null
    if (requestedTab && [
      'overview','riders','staff','budget','scouting','settings',
      'calendar','rankings','equipment','history',
    ].includes(requestedTab)) {
      setTab(requestedTab)
    }
  }, [location.search])

  useEffect(() => {
    if (tab === 'scouting' && data?.activated) {
      void loadScouting()
    }
    if (tab === 'budget' && data?.activated) {
      void loadFinance()
    }
    if (tab === 'riders' && data?.activated) {
      void loadGraduations()
    }
    if (tab === 'equipment' && data?.activated) {
      void loadEquipment()
      void loadFinance()
    }
    if (tab === 'calendar' && data?.activated) {
      void loadRaceCalendar()
    }
    if (tab === 'rankings' && data?.activated) {
      void loadYouthRankings()
    }
    if (tab === 'history' && data?.activated) {
      void loadHistory()
    }
  }, [tab, data?.activated])

  useEffect(() => {
    if (tab !== 'calendar' || !data?.activated || !calendarMonth) return
    void loadRaceMonth(calendarMonth, calendarClassFilter, calendarScope)
  }, [tab, data?.activated, calendarMonth, calendarClassFilter, calendarScope])

  useEffect(() => {
    if (!youthRankings?.academy_divisions?.length) return
    const mine = youthRankings.my_membership
    if (mine) {
      setRankingClassFilter(mine.competition_class)
      setRankingDivisionFilter(mine.division_code)
    } else {
      const first = youthRankings.academy_divisions[0]
      setRankingClassFilter(first.competition_class)
      setRankingDivisionFilter(first.division_code)
    }
  }, [youthRankings?.season_number])

  const activate = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const { data: payload, error: activateError } = await supabase.rpc(
        'activate_my_youth_academy_v1',
        { p_season_budget: Math.max(0, Math.round(activationBudget)) }
      )
      if (activateError) throw activateError
      const next = payload as AcademyPayload
      setData(next)
      setDraftRange(next.budget?.scouting_range ?? 'local')
      setDraftSettings(next.settings)
    } catch (activateError: any) {
      console.error('Youth Academy activation failed:', activateError)
      setError(activateError?.message ?? t('errors.activate'))
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async (): Promise<void> => {
    if (!data?.activated || !draftSettings || saving) return
    setSaving(true)
    setError(null)
    try {
      const { data: payload, error: saveError } = await supabase.rpc(
        'update_my_youth_academy_settings_v2',
        {
          p_recruitment_decider: draftSettings.recruitment_decider,
          p_race_entry_decider: draftSettings.race_entry_decider,
          p_race_squad_decider: draftSettings.race_squad_decider,
          p_camp_decider: draftSettings.camp_decider,
          p_equipment_decider: draftSettings.equipment_decider,
          p_recruitment_negotiation_decider:
            draftSettings.recruitment_negotiation_decider,
          p_scouting_range: draftRange,
          p_season_budget: null,
          p_auto_recruit_min_band: draftSettings.auto_recruit_min_band,
          p_auto_recruit_max_stipend_weekly: Math.max(
            50,
            Math.round(draftSettings.auto_recruit_max_stipend_weekly)
          ),
          p_auto_recruit_max_compensation: Math.max(
            0,
            Math.round(draftSettings.auto_recruit_max_compensation)
          ),
          p_auto_recruit_min_free_slots: Math.max(
            0,
            Math.min(8, Math.round(draftSettings.auto_recruit_min_free_slots))
          ),
        }
      )
      if (saveError) throw saveError

      const {
        data: philosophyPayload,
        error: philosophyError,
      } = await supabase.rpc('update_my_youth_training_philosophy_v1', {
        p_training_philosophy:
          draftSettings.training_philosophy ?? 'balanced',
      })
      if (philosophyError) throw philosophyError

      const next = (philosophyPayload ?? payload) as AcademyPayload
      setData(next)
      setDraftRange(next.budget?.scouting_range ?? draftRange)
      setDraftSettings(next.settings)
      if (scoutingData) {
        await loadScouting()
      }
    } catch (saveError: any) {
      console.error('Youth Academy settings save failed:', saveError)
      setError(saveError?.message ?? t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  const confirmResponsibility = async (key: string): Promise<void> => {
    if (!draftSettings || data?.read_only || responsibilityAction) return
    setResponsibilityAction(key)
    setError(null)
    try {
      const { data: payload, error: saveError } = await supabase.rpc(
        'update_my_youth_academy_settings_v2',
        {
          p_recruitment_decider: draftSettings.recruitment_decider,
          p_race_entry_decider: draftSettings.race_entry_decider,
          p_race_squad_decider: draftSettings.race_squad_decider,
          p_camp_decider: draftSettings.camp_decider,
          p_equipment_decider: draftSettings.equipment_decider,
          p_recruitment_negotiation_decider: draftSettings.recruitment_negotiation_decider,
          p_scouting_range: draftRange,
          p_season_budget: null,
          p_auto_recruit_min_band: draftSettings.auto_recruit_min_band,
          p_auto_recruit_max_stipend_weekly: draftSettings.auto_recruit_max_stipend_weekly,
          p_auto_recruit_max_compensation: draftSettings.auto_recruit_max_compensation,
          p_auto_recruit_min_free_slots: draftSettings.auto_recruit_min_free_slots,
        }
      )
      if (saveError) throw saveError
      const next = payload as AcademyPayload
      setData(next)
      setDraftSettings(next.settings)
    } catch (saveError: any) {
      setError(saveError?.message ?? t('errors.save'))
    } finally {
      setResponsibilityAction(null)
    }
  }

  const riders = data?.riders ?? []
  const staff = data?.staff ?? []
  const programs = data?.scouting_programs ?? []
  const academyDirector = staff.find(member => member.role_type === 'youth_academy_director')
  const headCoach = staff.find(member => member.role_type === 'u16_head_coach')
  const youthScout = staff.find(member => member.role_type === 'youth_scout')
  const currentProgram = programs.find(program => program.range_code === draftRange)

  const availableBudget = useMemo(() => {
    const budget = Number(data?.budget?.season_budget ?? 0)
    const spent = Number(data?.budget?.spent_amount ?? 0)
    const committed = Number(data?.budget?.committed_amount ?? 0)
    return Math.max(0, budget - spent - committed)
  }, [data?.budget])

  const visibleYouthRaces = useMemo(
    () => raceMonthData?.races ?? [],
    [raceMonthData?.races]
  )

  const rankingDivisions = useMemo(
    () =>
      (youthRankings?.academy_divisions ?? []).filter(
        division => division.competition_class === rankingClassFilter
      ),
    [youthRankings?.academy_divisions, rankingClassFilter]
  )

  const selectedRankingDivision = useMemo(() => {
    if (rankingDivisions.length === 0) return null
    return rankingDivisions.find(division => division.division_code === rankingDivisionFilter)
      ?? rankingDivisions[0]
  }, [rankingDivisions, rankingDivisionFilter])

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">{t('loading')}</div>
  }

  if (!data) {
    return <div className="p-6 text-sm text-red-700">{error ?? t('errors.load')}</div>
  }

  if (!data.premium && !data.activated) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <Crown size={20} />
            <span className="font-semibold">{t('premium.title')}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {t('premium.description')}
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <li>• {t('premium.capacity')}</li>
            <li>• {t('premium.localStart')}</li>
            <li>• {t('premium.staff')}</li>
            <li>• {t('premium.scouting')}</li>
          </ul>
          <Link
            to="/dashboard/pro"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Crown size={16} />
            {t('premium.openPremium')}
          </Link>
        </div>
      </div>
    )
  }

  if (!data.activated) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <GraduationCap size={22} />
            <h2 className="text-lg font-semibold">{t('activation.title')}</h2>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            {t('activation.description')}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              [t('activation.capacityLabel'), '16'],
              [t('activation.starterRidersLabel'), '6'],
              [t('activation.staffLabel'), '2'],
              [t('activation.infrastructureLabel'), t('activation.none')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 max-w-sm">
            <label className="text-sm font-medium text-slate-800">
              {t('activation.seasonBudget')}
            </label>
            <input
              type="number"
              min={0}
              step={5000}
              value={activationBudget}
              onChange={event => setActivationBudget(Number(event.target.value || 0))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              {t('activation.budgetHelp')}
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void activate()}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t('activation.activating') : t('activation.activate')}
          </button>
        </div>
      </div>
    )
  }

  const tabKeys: TabKey[] = [
    'overview',
    'riders',
    'staff',
    'budget',
    'scouting',
    'settings',
    'calendar',
    'rankings',
    'equipment',
    'history',
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Premium
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {data.club_name} · {t('header.capacity', {
              current: data.academy?.active_riders ?? riders.length,
              max: 16,
            })}
          </p>
        </div>
        {data.read_only ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('readOnly')}
          </div>
        ) : null}
      </div>

      <div className="mb-1 inline-flex flex-wrap rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        {tabKeys.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('overview.budget')}>
            <div className="text-2xl font-semibold">{money(availableBudget)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {t('overview.ofSeasonBudget', {
                value: money(data.budget?.season_budget),
              })}
            </div>
          </Card>
          <Card title={t('overview.roster')}>
            <div className="text-2xl font-semibold">{riders.length}/16</div>
            <div className="mt-1 text-xs text-slate-500">{t('overview.fixedCapacity')}</div>
          </Card>
          <Card title={t('overview.scouting')}>
            <div className="text-2xl font-semibold">{humanize(data.budget?.scouting_range)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {money(data.budget?.scouting_budget)} {t('overview.perSeason')}
            </div>
          </Card>

          <div className="xl:col-span-2">
            <Card title={t('overview.directorReport')}>
              <p className="text-sm leading-6 text-slate-600">
                {academyDirector
                  ? t('overview.directorReady', { name: academyDirector.staff_name })
                  : t('overview.directorMissing')}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.nextRace')}</div>
                  <div className="mt-1 text-sm font-medium">{t('comingSoon')}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.recruitment')}</div>
                  <div className="mt-1 text-sm font-medium">{humanize(data.budget?.scouting_range)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.reputation')}</div>
                  <div className="mt-1 text-sm font-medium">{data.academy?.reputation ?? 0}</div>
                </div>
              </div>
            </Card>
          </div>

          <Card title={t('overview.staff')}>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{t('roles.director')}</div>
                <div className="font-medium">{academyDirector?.staff_name ?? t('notAssigned')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('roles.headCoach')}</div>
                <div className="font-medium">{headCoach?.staff_name ?? t('notAssigned')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('roles.scout')}</div>
                <div className="font-medium">{youthScout?.staff_name ?? t('optionalNotHired')}</div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'riders' ? (
        <div className="space-y-4">
        <Card
          title={t('riders.title')}
          right={<span className="text-xs text-slate-500">{riders.length}/16</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t('riders.rider')}</th>
                  <th className="py-2 pr-3">{t('riders.age')}</th>
                  <th className="py-2 pr-3">{t('riders.role')}</th>
                  <th className="py-2 pr-3">{t('riders.assessment')}</th>
                  <th className="py-2 pr-3">{t('riders.focus')}</th>
                  <th className="py-2 pr-3">{t('riders.readiness')}</th>
                  <th className="py-2">{t('riders.stipend')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riders.map(rider => {
                  const flag = flagUrl(rider.country_code)
                  return (
                    <tr key={rider.id}>
                      <td className="py-3 pr-3 font-medium">
                        <div className="flex items-center gap-2">
                          {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                          <Link
                            to={`/dashboard/youth-academy/riders/${rider.id}`}
                            className="font-semibold text-slate-900 hover:text-amber-700 hover:underline"
                          >
                            {rider.display_name}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 pr-3">{rider.age}</td>
                      <td className="py-3 pr-3">{humanize(rider.role)}</td>
                      <td className="py-3 pr-3">{rider.assessment_band}</td>
                      <td className="py-3 pr-3">{humanize(rider.development_focus)}</td>
                      <td className="py-3 pr-3">{rider.readiness}%</td>
                      <td className="py-3">{money(rider.stipend_weekly)}/{t('week')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('riders.potentialNote')}</p>
        </Card>

        <Card
          title={t('graduation.title')}
          right={
            <span className="text-xs text-slate-500">
              {t('graduation.pendingCount', {
                count: graduations.filter(item => !item.completed_on).length,
              })}
            </span>
          }
        >
          {graduations.filter(item => !item.completed_on).length === 0 ? (
            <div className="text-sm text-slate-500">{t('graduation.none')}</div>
          ) : (
            <div className="space-y-3">
              {graduations
                .filter(item => !item.completed_on)
                .map(item => {
                  const flag = flagUrl(item.country_code)
                  const busy = graduationAction === item.id
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {flag ? (
                              <img src={flag} alt="" className="h-4 w-6 object-cover" />
                            ) : null}
                            <div className="font-semibold text-slate-900">
                              {item.rider_name}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {humanize(item.role)} · {item.assessment_band}
                          </div>
                        </div>
                        {item.decision === 'pathway' && item.pathway_expires_on ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                            {t('graduation.pathwayUntil', {
                              date: item.pathway_expires_on,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {item.decision === 'pathway'
                          ? t('graduation.pathwayHelp')
                          : t('graduation.decisionHelp')}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={data.read_only || busy}
                          onClick={() => void decideGraduation(item, 'pathway')}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          {t('graduation.pathway')}
                        </button>
                        <button
                          type="button"
                          disabled={
                            data.read_only ||
                            busy ||
                            !item.has_developing_team ||
                            item.developing_team_free_slots <= 0
                          }
                          onClick={() => void decideGraduation(item, 'developing_team')}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {t('graduation.toDeveloping', {
                            slots: item.developing_team_free_slots,
                          })}
                        </button>
                        <button
                          type="button"
                          disabled={data.read_only || busy}
                          onClick={() => void decideGraduation(item, 'release')}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          {t('graduation.release')}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </Card>
        </div>
      ) : null}

      {tab === 'staff' ? (
        <div className="space-y-4">
          <Card title={t('staff.careerFramework', { defaultValue: 'Youth staff levels & salaries' })}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">
                  {t('roles.director')}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {youthSalaryRange('youth_academy_director')}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('staff.directorBonusHelp', {
                    defaultValue:
                      'Leadership and efficiency improve Academy management. Strong Directors can reduce Youth equipment purchase costs by up to 8%.',
                  })}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">
                  {t('roles.headCoach')}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {youthSalaryRange('u16_head_coach')}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('staff.coachBonusHelp', {
                    defaultValue:
                      'Expertise, potential and efficiency improve weekly rider development, workload decisions and race selection.',
                  })}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">
                  {t('roles.scout')}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {youthSalaryRange('youth_scout')}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('staff.scoutBonusHelp', {
                    defaultValue:
                      'Expertise, experience and efficiency improve prospect selection, report confidence and reports produced per search.',
                  })}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {t('staff.levelScaleHelp', {
                defaultValue:
                  'Levels use the same staff scale as the senior team: Poor (<30), Basic (30–44), Competent (45–59), Strong (60–74), Elite (75–89) and World Class (90+).',
              })}
            </p>
          </Card>

          <div className="space-y-3">
            {staff.map(member => {
              const flag = flagUrl(member.country_code)
              const roleLabel =
                member.role_type === 'youth_academy_director'
                  ? t('roles.director')
                  : member.role_type === 'u16_head_coach'
                    ? t('roles.headCoach')
                    : t('roles.scout')
              const score = youthStaffScore(member)
              const level = youthStaffLevel(score)
              const scoutReports = Math.min(6, Math.max(1, 2 + Math.floor((score - 45) / 15)))
              const directorDiscount = Math.min(8, Math.max(0, Math.floor((score - 45) / 6)))
              const bonusText =
                member.role_type === 'youth_academy_director'
                  ? t('staff.directorActiveBonus', {
                      value: directorDiscount,
                      defaultValue: 'Up to {{value}}% Youth equipment purchasing discount',
                    })
                  : member.role_type === 'u16_head_coach'
                    ? t('staff.coachActiveBonus', {
                        score,
                        defaultValue:
                          'Development score {{score}}: affects weekly progression, readiness and race selection',
                      })
                    : t('staff.scoutActiveBonus', {
                        score,
                        reports: scoutReports,
                        defaultValue:
                          'Scout score {{score}}: up to {{reports}} reports per search with stronger assessment accuracy',
                      })

              return (
                <div
                  key={member.id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {flag ? (
                            <img
                              src={flag}
                              alt=""
                              className="h-4 w-6 rounded-sm border border-gray-200 object-cover"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {member.staff_name}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500">
                              <span>{roleLabel}</span>
                              {member.specialization ? (
                                <>
                                  <span>•</span>
                                  <span>{humanizeCode(member.specialization)}</span>
                                </>
                              ) : null}
                              <span>•</span>
                              <span>{t('staff.youthScope')}</span>
                            </div>
                          </div>
                        </div>

                        <Link
                          to={`/dashboard/staff?role=${member.role_type}&staff=${member.id}`}
                          className="rounded-md bg-yellow-400 px-3 py-2 text-xs font-medium text-black transition hover:bg-yellow-300"
                        >
                          {t('staff.openProfile', { defaultValue: 'Open staff profile' })}
                        </Link>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                        {[
                          [t('staff.expertise'), member.expertise],
                          [t('staff.experience'), member.experience],
                          [t('staff.potential'), member.potential],
                          [t('staff.leadership'), member.leadership],
                          [t('staff.efficiency'), member.efficiency],
                          [t('staff.loyalty'), member.loyalty],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-gray-400">
                              {String(label)}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              {String(value)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                          {t('staff.activeBonus', { defaultValue: 'Active role bonus' })}
                        </div>
                        <div className="mt-1 text-sm text-amber-950">{bonusText}</div>
                      </div>
                    </div>

                    <div className="grid w-full gap-2 rounded-lg bg-gray-50 px-3 py-3 sm:grid-cols-2 xl:w-72 xl:grid-cols-1">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          {t('staff.level', { defaultValue: 'Level' })}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                          {level} · {score}/100
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          {t('staff.weeklyWage')}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                          {money(member.salary_weekly)}/{t('week')}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {t('staff.salaryRange', {
                            value: youthSalaryRange(member.role_type),
                            defaultValue: 'Role range: {{value}}',
                          })}
                        </div>
                      </div>
                      {member.contract_expires_at ? (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-400">
                            {t('staff.contract', { defaultValue: 'Contract' })}
                          </div>
                          <div className="mt-1 text-sm font-medium text-gray-900">
                            {contractSeason(member.contract_expires_at)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}

            {staff.filter(member => member.role_type === 'youth_scout').length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500">
                <div className="font-medium text-gray-900">{t('roles.scout')}</div>
                <div className="mt-1">{t('staff.scoutOptional')}</div>
                <Link
                  to="/dashboard/staff?role=youth_scout"
                  className="mt-3 inline-flex rounded-md bg-yellow-400 px-3 py-2 text-xs font-medium text-black"
                >
                  {t('staff.openScoutStaff', { defaultValue: 'Open Youth Scout staff' })}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Link
              to="/dashboard/staff"
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t('staff.openStaffPage')}
            </Link>
          </div>
        </div>
      ) : null}

      {tab === 'budget' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title={t('budget.initialAllocation')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.initial_allocation ?? data.budget?.initial_allocation ?? data.budget?.season_budget)}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {t('budget.initialAllocationHelp')}
              </p>
            </Card>
            <Card title={t('budget.currentFunds')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.season_budget ?? data.budget?.season_budget)}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('budget.includesIncomeTransfers')}
              </p>
            </Card>
            <Card title={t('budget.available')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.available_amount ?? availableBudget)}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('budget.afterCommitments')}
              </p>
            </Card>
            <Card title={t('budget.seniorBalance')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.senior_cash_balance)}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('budget.seniorBalanceHelp')}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={t('budget.fundsChart')}>
              {(() => {
                const total = Number(financeData?.season_budget ?? data.budget?.season_budget ?? 0)
                const spent = Number(financeData?.spent_amount ?? data.budget?.spent_amount ?? 0)
                const committed = Number(financeData?.committed_amount ?? data.budget?.committed_amount ?? 0)
                const available = Number(financeData?.available_amount ?? availableBudget)
                return (
                  <div className="space-y-4">
                    {[
                      [t('budget.available'), available, 'bg-emerald-500'],
                      [t('budget.committed'), committed, 'bg-amber-400'],
                      [t('budget.spent'), spent, 'bg-slate-800'],
                    ].map(([label, value, barClass]) => (
                      <div key={String(label)}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-500">{String(label)}</span>
                          <span className="font-medium text-slate-800">{money(Number(value))}</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${barClass}`}
                            style={{ width: `${percent(Number(value), total)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Card>

            <Card title={t('budget.incomeChart')}>
              {(() => {
                const raceIncome = Number(financeData?.race_income ?? 0)
                const transfersIn = Number(financeData?.budget_transfer_in ?? 0)
                const transfersOut = Number(financeData?.budget_transfer_out ?? 0)
                const maxValue = Math.max(raceIncome, transfersIn, transfersOut, 1)
                return (
                  <div className="space-y-4">
                    {[
                      [t('budget.raceIncome'), raceIncome, 'bg-yellow-400'],
                      [t('budget.transfersIn'), transfersIn, 'bg-blue-500'],
                      [t('budget.transfersOut'), transfersOut, 'bg-rose-400'],
                    ].map(([label, value, barClass]) => (
                      <div key={String(label)}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-500">{String(label)}</span>
                          <span className="font-medium text-slate-800">{money(Number(value))}</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${barClass}`}
                            style={{ width: `${percent(Number(value), maxValue)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title={t('budget.weeklyRiderSupport')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.weekly_rider_support)}/{t('week')}
              </div>
            </Card>
            <Card title={t('budget.weeklyStaff')}>
              <div className="text-2xl font-semibold">
                {money(financeData?.weekly_staff_salary)}/{t('week')}
              </div>
            </Card>
            <Card title={t('budget.equipmentSpend')}>
              <div className="text-2xl font-semibold">{money(financeData?.equipment_spend)}</div>
            </Card>
            <Card title={t('budget.scoutingAllocation')}>
              <div className="text-2xl font-semibold">{money(currentProgram?.season_cost)}</div>
              <p className="mt-2 text-xs text-slate-500">
                {t('budget.scoutingHelp', { range: humanize(draftRange) })}
              </p>
            </Card>
          </div>

          <Card title={t('budget.adjustBudget')}>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('budget.direction')}
                </span>
                <select
                  value={budgetTransferDirection}
                  disabled={data.read_only || budgetTransferLoading}
                  onChange={event =>
                    setBudgetTransferDirection(event.target.value as 'senior_to_youth' | 'youth_to_senior')
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="senior_to_youth">{t('budget.seniorToYouth')}</option>
                  <option value="youth_to_senior">{t('budget.youthToSenior')}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('budget.transferAmount')}
                </span>
                <input
                  type="number"
                  min={1}
                  step={5000}
                  value={budgetTransferAmount}
                  disabled={data.read_only || budgetTransferLoading}
                  onChange={event => setBudgetTransferAmount(Math.max(0, Number(event.target.value || 0)))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={data.read_only || budgetTransferLoading || budgetTransferAmount <= 0}
                onClick={() => void transferYouthBudget()}
                className="rounded-md bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-yellow-300 disabled:opacity-50"
              >
                {budgetTransferLoading ? t('budget.transferring') : t('budget.transferFunds')}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {t('budget.transferHelp')}
            </p>
          </Card>

          <Card
            title={t('budget.ledger')}
            right={
              phase2Loading ? (
                <span className="text-xs text-slate-500">{t('budget.loadingLedger')}</span>
              ) : null
            }
          >
            {(financeData?.ledger?.length ?? 0) === 0 ? (
              <div className="text-sm text-slate-500">{t('budget.noLedger')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{t('budget.date')}</th>
                      <th className="py-2 pr-3">{t('budget.category')}</th>
                      <th className="py-2 pr-3">{t('budget.description')}</th>
                      <th className="py-2 text-right">{t('budget.amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(financeData?.ledger ?? []).map(entry => (
                      <tr key={entry.id}>
                        <td className="py-2 pr-3">{entry.game_date}</td>
                        <td className="py-2 pr-3">{humanize(entry.category)}</td>
                        <td className="py-2 pr-3">{entry.description}</td>
                        <td className={`py-2 text-right font-medium ${
                          entry.amount > 0 ? 'text-emerald-700' : 'text-slate-900'
                        }`}>
                          {entry.amount > 0 ? '+' : ''}{money(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'scouting' ? (
        <div className="space-y-4">
          <Card title={t('scouting.title')}>
            <p className="text-sm text-slate-600">{t('scouting.description')}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {programs.map(program => (
                <button
                  key={program.range_code}
                  type="button"
                  disabled={data.read_only}
                  onClick={() => setDraftRange(program.range_code)}
                  className={`rounded-xl border p-4 text-left ${
                    draftRange === program.range_code
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="font-semibold">
                    {t(`scouting.ranges.${program.range_code}`)}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {money(program.season_cost)}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">{t('scouting.skillNote')}</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t('scouting.scoutReport')}>
              {scoutingLoading && !scoutingData ? (
                <div className="text-sm text-slate-500">{t('scouting.loading')}</div>
              ) : scoutingData?.scout ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {scoutingData.scout.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t('scouting.scoutScore', { score: scoutingData.scout.score })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{t('staff.expertise')}</div>
                      <div className="mt-1 font-semibold">{scoutingData.scout.expertise}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">
                        {t('scouting.reportsPerSearch', { defaultValue: 'Reports per search' })}
                      </div>
                      <div className="mt-1 font-semibold">
                        {scoutingData.scout.reports_per_search ?? scoutingData.scout.monthly_report_quota}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs leading-5 text-slate-500">
                    {t('scouting.qualityExplainer')}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">
                    {t('scouting.noScout')}
                  </p>
                  <Link
                    to="/dashboard/staff"
                    className="inline-flex text-sm font-medium text-slate-800 underline"
                  >
                    {t('staff.openStaffPage')}
                  </Link>
                </div>
              )}
            </Card>

            <Card title={t('scouting.weeklySearch', { defaultValue: 'Weekly scouting searches' })}>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t('scouting.runsThisWeek', { defaultValue: 'Searches this week' })}
                    </div>
                    <div className="mt-1 font-semibold">
                      {Number(scoutingData?.weekly_runs_used ?? 0)}/{Number(scoutingData?.weekly_run_limit ?? 4)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t('scouting.coinBalance', { defaultValue: 'Coin balance' })}
                    </div>
                    <div className="mt-1 font-semibold">
                      {Number(scoutingData?.coin_balance ?? 0)} Coins
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">{t('scouting.currentRange')}</div>
                  <div className="mt-1 font-semibold">
                    {t(`scouting.ranges.${scoutingData?.scouting_range ?? draftRange}`)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                  <div className="font-medium text-slate-800">
                    {t('scouting.weeklyRule', {
                      defaultValue: '1 free search + up to 3 Coin searches per in-game week',
                    })}
                  </div>
                  <div className="mt-1">
                    {t('scouting.boostPrices', {
                      defaultValue:
                        'Extra search cost: Local 10 · Regional 15 · Continental 20 · Worldwide 30 Coins.',
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    data.read_only ||
                    scoutingAction !== null ||
                    !scoutingData?.can_run ||
                    (
                      scoutingData?.can_run_coin === true &&
                      Number(scoutingData?.coin_balance ?? 0) <
                        Number(scoutingData?.boost_coin_cost ?? 0)
                    )
                  }
                  onClick={() => void runScoutingCycle(scoutingData?.can_run_coin === true)}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {scoutingAction === 'cycle' || scoutingAction === 'cycle-coins'
                    ? t('scouting.running')
                    : scoutingData?.can_run_free
                      ? t('scouting.runFreeSearch', { defaultValue: 'Run free weekly search' })
                      : scoutingData?.can_run_coin
                        ? t('scouting.runCoinSearch', {
                            cost: Number(scoutingData?.boost_coin_cost ?? 0),
                            defaultValue: 'Run extra search · {{cost}} Coins',
                          })
                        : t('scouting.weeklyLimitReached', {
                            defaultValue: 'Weekly search limit reached',
                          })}
                </button>

                {scoutingData?.current_cycle ? (
                  <div className="text-xs text-slate-500">
                    {t('scouting.lastSearch', {
                      reports: scoutingData.current_cycle.reports_created,
                      run: scoutingData.current_cycle.run_number ?? 1,
                      defaultValue: 'Last search: run {{run}} · {{reports}} reports created',
                    })}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card title={t('scouting.delegation')}>
              <div className="space-y-3 text-sm">
                <div className="font-medium text-slate-900">
                  {scoutingData?.director_mode
                    ? t('scouting.directorMode')
                    : t('scouting.managerMode')}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  {scoutingData?.director_mode
                    ? t('scouting.directorModeHelp')
                    : t('scouting.managerModeHelp')}
                </p>
                {scoutingData?.auto_rules ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {t('scouting.autoRuleSummary', {
                      band: t(
                        `scouting.assessmentBands.${scoutingData.auto_rules.min_band}`
                      ),
                      stipend: money(scoutingData.auto_rules.max_stipend_weekly),
                      compensation: money(scoutingData.auto_rules.max_compensation),
                      slots: scoutingData.auto_rules.min_free_slots,
                    })}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card
            title={t('scouting.incoming.title')}
            right={
              <span className="text-xs text-slate-500">
                {t('scouting.incoming.count', { count: incomingOffers.length })}
              </span>
            }
          >
            {incomingOffers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center">
                <div className="text-sm font-medium text-slate-800">
                  {t('scouting.incoming.none')}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('scouting.incoming.noneHelp')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {incomingOffers.map(offer => {
                  const riderFlag = flagUrl(offer.rider_country_code)
                  const clubFlag = flagUrl(offer.offering_country_code)
                  const actionKey = `incoming:${offer.id}`
                  const isResponding = scoutingAction === actionKey

                  return (
                    <div
                      key={offer.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {riderFlag ? (
                              <img
                                src={riderFlag}
                                alt=""
                                className="h-4 w-6 rounded-sm object-cover"
                              />
                            ) : null}
                            <div className="font-semibold text-slate-950">
                              {offer.rider_name}
                            </div>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {offer.rider_age}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            {clubFlag ? (
                              <img
                                src={clubFlag}
                                alt=""
                                className="h-3.5 w-5 rounded-sm object-cover"
                              />
                            ) : null}
                            {t('scouting.incoming.approachFrom', {
                              club: offer.offering_club_name,
                            })}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.developmentCompensation')}
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {money(offer.compensation_offer)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.incoming.newStipend')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {money(offer.stipend_weekly)}/{t('week')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.incoming.accommodation')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {money(offer.accommodation_weekly)}/{t('week')}
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {t('scouting.incoming.decisionHelp')}
                      </p>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={data.read_only || scoutingAction !== null}
                          onClick={() => void respondToIncomingOffer(offer, false)}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                        >
                          {isResponding
                            ? t('scouting.incoming.processing')
                            : t('scouting.incoming.decline')}
                        </button>
                        <button
                          type="button"
                          disabled={data.read_only || scoutingAction !== null}
                          onClick={() => void respondToIncomingOffer(offer, true)}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {isResponding
                            ? t('scouting.incoming.processing')
                            : t('scouting.incoming.accept')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card
            title={t('scouting.prospects')}
            right={
              <span className="text-xs text-slate-500">
                {t('scouting.reportCount', {
                  count: scoutingData?.reports?.length ?? 0,
                })}
              </span>
            }
          >
            {scoutingLoading ? (
              <div className="py-4 text-sm text-slate-500">{t('scouting.loading')}</div>
            ) : (scoutingData?.reports?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <div className="text-sm font-medium text-slate-800">
                  {t('scouting.noReports')}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('scouting.noReportsHelp')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(scoutingData?.reports ?? []).map(report => {
                  const flag = flagUrl(report.country_code)
                  const draft = offerDrafts[report.id] ?? {
                    stipend: report.expected_stipend_weekly,
                    accommodation: report.suggested_accommodation_weekly,
                    compensation: report.suggested_compensation,
                  }
                  const latestOffer = report.latest_offer
                  const signed = report.status === 'signed' || latestOffer?.status === 'accepted'
                  const waitingForAcademy =
                    latestOffer?.status === 'submitted' &&
                    latestOffer.source_academy_decision === 'pending'

                  return (
                    <div
                      key={report.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {flag ? (
                              <img
                                src={flag}
                                alt=""
                                className="h-4 w-6 rounded-sm object-cover"
                              />
                            ) : null}
                            <div className="font-semibold text-slate-950">
                              {report.display_name}
                            </div>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {report.age}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {t(`scouting.roles.${report.role}`)} ·{' '}
                            {report.target_kind === 'academy'
                              ? t('scouting.fromAcademy', {
                                  academy: report.source_academy_name ?? t('scouting.otherAcademy'),
                                })
                              : t('scouting.unattachedProspect')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-900">
                            {t(`scouting.assessmentBands.${report.assessment_band
                              .toLowerCase()
                              .replaceAll(' ', '_')}`)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('scouting.confidence', { value: report.confidence })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.strengths')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {(report.strengths ?? [])
                              .map(strength => t(`scouting.skillNames.${strength}`))
                              .join(' · ') || '—'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.relocation')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {t(`scouting.relocationValues.${report.relocation_difficulty}`)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.expectedSupport')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {money(report.expected_stipend_weekly)}/{t('week')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {t('scouting.developmentCompensation')}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {report.target_kind === 'academy'
                              ? money(report.suggested_compensation)
                              : t('scouting.none')}
                          </div>
                        </div>
                      </div>

                      {latestOffer ? (
                        <div
                          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                            latestOffer.status === 'accepted'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-900'
                          }`}
                        >
                          <div className="font-medium">
                            {t(`scouting.offerStatuses.${latestOffer.status}`)}
                          </div>
                          {latestOffer.status !== 'accepted' ? (
                            <div className="mt-1 text-xs">
                              {t(`scouting.offerStatusHelp.${latestOffer.status}`)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {!signed ? (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('scouting.offerPackage')}
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="text-xs text-slate-600">
                              {t('scouting.weeklyStipend')}
                              <input
                                type="number"
                                min={50}
                                step={10}
                                disabled={data.read_only}
                                value={draft.stipend}
                                onChange={event =>
                                  updateOfferDraft(
                                    report,
                                    'stipend',
                                    Number(event.target.value || 0)
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="text-xs text-slate-600">
                              {t('scouting.accommodation')}
                              <input
                                type="number"
                                min={0}
                                step={10}
                                disabled={data.read_only}
                                value={draft.accommodation}
                                onChange={event =>
                                  updateOfferDraft(
                                    report,
                                    'accommodation',
                                    Number(event.target.value || 0)
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="text-xs text-slate-600">
                              {t('scouting.compensationOffer')}
                              <input
                                type="number"
                                min={0}
                                step={500}
                                disabled={data.read_only || report.target_kind !== 'academy'}
                                value={draft.compensation}
                                onChange={event =>
                                  updateOfferDraft(
                                    report,
                                    'compensation',
                                    Number(event.target.value || 0)
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="max-w-2xl text-xs leading-5 text-slate-500">
                              {t('scouting.offerHelp')}
                            </p>
                            <button
                              type="button"
                              disabled={
                                data.read_only ||
                                scoutingAction !== null ||
                                waitingForAcademy
                              }
                              onClick={() => void submitRecruitmentOffer(report)}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {scoutingAction === report.id
                                ? t('scouting.submittingOffer')
                                : waitingForAcademy
                                  ? t('scouting.awaitingAcademyResponse')
                                  : latestOffer
                                    ? t('scouting.improveOffer')
                                    : t('scouting.submitOffer')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 text-sm font-medium text-emerald-700">
                          {t('scouting.signedToAcademy')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'settings' && draftSettings ? (
        <Card title={t('settings.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('settings.description')}</p>
          <div className="space-y-3">
            {([
              {
                key: 'recruitment_decider',
                label: t('settings.recruitment'),
                description: t('settings.recruitmentHelp', {
                  defaultValue:
                    'Decides which scouted prospects should enter the Academy recruitment process and whether the Academy actively pursues a rider.',
                }),
                options: ['manager', 'academy_director'],
              },
              {
                key: 'race_entry_decider',
                label: t('settings.raceEntry'),
                description: t('settings.raceEntryHelp', {
                  defaultValue:
                    'Decides which Youth race invitations are accepted or declined and which events the Academy will enter.',
                }),
                options: ['manager', 'u16_head_coach'],
              },
              {
                key: 'race_squad_decider',
                label: t('settings.raceSquad'),
                description: t('settings.raceSquadHelp', {
                  defaultValue:
                    'Selects the riders and race strategy for each entered Youth event, including rotation between simultaneous races.',
                }),
                options: ['manager', 'u16_head_coach'],
              },
              {
                key: 'camp_decider',
                label: t('settings.camps'),
                description: t('settings.campsHelp', {
                  defaultValue:
                    'Approves Youth Academy camps and the related use of Academy funds when camp opportunities are available.',
                }),
                options: ['manager', 'academy_director'],
              },
              {
                key: 'equipment_decider',
                label: t('settings.equipment'),
                description: t('settings.equipmentHelp', {
                  defaultValue:
                    'Controls Youth equipment purchasing. The Academy Director can automatically fill missing equipment within the available Academy budget.',
                }),
                options: ['manager', 'academy_director'],
              },
              {
                key: 'recruitment_negotiation_decider',
                label: t('settings.negotiations'),
                description: t('settings.negotiationsHelp', {
                  defaultValue:
                    'Manages stipend, accommodation and development-compensation offers after a Youth prospect has been identified.',
                }),
                options: ['manager', 'academy_director'],
              },
            ] as Array<{
              key: keyof NonNullable<AcademyPayload['settings']>
              label: string
              description: string
              options: string[]
            }>).map(item => {
              const savedValue = data.settings?.[item.key]
              const draftValue = draftSettings[item.key]
              const changed = String(savedValue ?? '') !== String(draftValue ?? '')

              return (
                <div
                  key={String(item.key)}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <h4 className="text-sm font-semibold text-slate-900">{item.label}</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        changed
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {changed
                        ? t('settings.pendingConfirmation', {
                            defaultValue: 'Pending confirmation',
                          })
                        : t('settings.confirmed', { defaultValue: 'Confirmed' })}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <label className="text-sm">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {t('settings.responsiblePerson', {
                          defaultValue: 'Responsible person',
                        })}
                      </span>
                      <select
                        disabled={data.read_only || responsibilityAction !== null}
                        value={String(draftValue ?? '')}
                        onChange={event =>
                          setDraftSettings(current =>
                            current
                              ? {
                                  ...current,
                                  [String(item.key)]: event.target.value,
                                } as typeof current
                              : current
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                      >
                        {item.options.map(option => (
                          <option key={option} value={option}>
                            {t(`settings.options.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      disabled={
                        data.read_only ||
                        responsibilityAction !== null ||
                        !changed
                      }
                      onClick={() => void confirmResponsibility(String(item.key))}
                      className="rounded-md bg-yellow-400 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {responsibilityAction === String(item.key)
                        ? t('settings.confirming', { defaultValue: 'Confirming…' })
                        : t('settings.confirmResponsibility', {
                            defaultValue: 'Confirm responsibility',
                          })}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mb-6 border-b border-slate-200 pb-5">
            <h4 className="text-sm font-semibold text-slate-900">
              {t('reports.title')}
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t('reports.description')}
            </p>
            <label className="mt-4 block max-w-sm text-sm">
              <span className="font-medium text-slate-800">
                {t('reports.frequency')}
              </span>
              <select
                disabled={data.read_only}
                value={raceReportFrequency}
                onChange={event =>
                  setRaceReportFrequency(
                    event.target.value as
                      | 'every_race'
                      | 'important_only'
                      | 'podium_exceptional'
                      | 'problems_only'
                      | 'never'
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="every_race">{t('reports.options.every_race')}</option>
                <option value="important_only">{t('reports.options.important_only')}</option>
                <option value="podium_exceptional">{t('reports.options.podium_exceptional')}</option>
                <option value="problems_only">{t('reports.options.problems_only')}</option>
                <option value="never">{t('reports.options.never')}</option>
              </select>
            </label>
            <button
              type="button"
              disabled={data.read_only || saving}
              onClick={() => void saveRaceReportFrequency()}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? t('saving') : t('reports.save')}
            </button>
          </div>

          <div className="mb-6 border-b border-slate-200 pb-5">
            <h4 className="text-sm font-semibold text-slate-900">
              {t('training.title')}
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t('training.description')}
            </p>
            <label className="mt-4 block max-w-sm text-sm">
              <span className="font-medium text-slate-800">
                {t('training.philosophy')}
              </span>
              <select
                disabled={data.read_only}
                value={draftSettings.training_philosophy ?? 'balanced'}
                onChange={event =>
                  setDraftSettings(current =>
                    current
                      ? {
                          ...current,
                          training_philosophy: event.target.value as
                            | 'freshness'
                            | 'balanced'
                            | 'development',
                        }
                      : current
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="freshness">{t('training.options.freshness')}</option>
                <option value="balanced">{t('training.options.balanced')}</option>
                <option value="development">{t('training.options.development')}</option>
              </select>
            </label>
          </div>

          {draftSettings.recruitment_decider === 'academy_director' ? (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('settings.autoRecruitmentTitle')}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t('settings.autoRecruitmentDescription')}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm">
                  <span className="font-medium text-slate-800">
                    {t('settings.minimumAssessment')}
                  </span>
                  <select
                    disabled={data.read_only}
                    value={draftSettings.auto_recruit_min_band}
                    onChange={event =>
                      setDraftSettings(current =>
                        current
                          ? {
                              ...current,
                              auto_recruit_min_band: event.target.value as
                                | 'promising'
                                | 'very_promising'
                                | 'exceptional',
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="promising">{t('settings.bands.promising')}</option>
                    <option value="very_promising">
                      {t('settings.bands.very_promising')}
                    </option>
                    <option value="exceptional">{t('settings.bands.exceptional')}</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="font-medium text-slate-800">
                    {t('settings.maxStipend')}
                  </span>
                  <input
                    type="number"
                    min={50}
                    step={10}
                    disabled={data.read_only}
                    value={draftSettings.auto_recruit_max_stipend_weekly}
                    onChange={event =>
                      setDraftSettings(current =>
                        current
                          ? {
                              ...current,
                              auto_recruit_max_stipend_weekly: Number(
                                event.target.value || 0
                              ),
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="font-medium text-slate-800">
                    {t('settings.maxCompensation')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    disabled={data.read_only}
                    value={draftSettings.auto_recruit_max_compensation}
                    onChange={event =>
                      setDraftSettings(current =>
                        current
                          ? {
                              ...current,
                              auto_recruit_max_compensation: Number(
                                event.target.value || 0
                              ),
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="font-medium text-slate-800">
                    {t('settings.keepFreeSlots')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={1}
                    disabled={data.read_only}
                    value={draftSettings.auto_recruit_min_free_slots}
                    onChange={event =>
                      setDraftSettings(current =>
                        current
                          ? {
                              ...current,
                              auto_recruit_min_free_slots: Number(
                                event.target.value || 0
                              ),
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'equipment' ? (
        <div className="space-y-4">
          <Card
            title={t('equipment.title')}
            right={
              <span className="text-xs text-slate-500">
                {t(
                  equipmentData?.equipment_decider === 'academy_director'
                    ? 'equipment.directorManaged'
                    : 'equipment.managerManaged'
                )}
              </span>
            }
          >
            <p className="text-sm leading-6 text-slate-600">
              {t('equipment.description')}
            </p>
            {equipmentData?.equipment_decider === 'academy_director' ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                <p className="max-w-2xl text-sm text-slate-600">
                  {t('equipment.directorHelp')}
                </p>
                <button
                  type="button"
                  disabled={data.read_only || equipmentAction !== null}
                  onClick={() => void runEquipmentDirector()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {equipmentAction === 'director'
                    ? t('equipment.equipping')
                    : t('equipment.runDirector')}
                </button>
              </div>
            ) : null}
          </Card>

          <Card
            title={t('equipment.inventory')}
            right={
              <span className="text-xs text-slate-500">
                {t('equipment.itemsOwned', {
                  count: equipmentData?.inventory?.length ?? 0,
                })}
              </span>
            }
          >
            {(equipmentData?.inventory?.length ?? 0) === 0 ? (
              <div className="text-sm text-slate-500">{t('equipment.noInventory')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{t('equipment.item')}</th>
                      <th className="py-2 pr-3">{t('equipment.category')}</th>
                      <th className="py-2 pr-3">{t('equipment.quality')}</th>
                      <th className="py-2 pr-3">{t('equipment.condition')}</th>
                      <th className="py-2">{t('equipment.cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(equipmentData?.inventory ?? []).map(item => (
                      <tr key={item.id}>
                        <td className="py-3 pr-3 font-medium">{item.display_name}</td>
                        <td className="py-3 pr-3">{humanize(item.equipment_category)}</td>
                        <td className="py-3 pr-3">{item.quality_score}</td>
                        <td className="py-3 pr-3">{Number(item.condition_percent).toFixed(0)}%</td>
                        <td className="py-3">{money(item.purchase_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {equipmentData?.equipment_decider !== 'academy_director' ? (
            <Card title={t('equipment.catalog')}>
              <p className="mb-4 text-xs leading-5 text-slate-500">
                {t('equipment.catalogHelp')}
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(equipmentData?.catalog ?? []).map(item => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.display_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {humanize(item.equipment_category)} · {t('equipment.tier', {
                            tier: item.tier,
                          })}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{money(item.price)}</div>
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-slate-500">
                      <span>{t('equipment.quality')}: {item.quality_score}</span>
                      <span>{t('equipment.durability')}: {item.durability_score}</span>
                    </div>
                    <button
                      type="button"
                      disabled={data.read_only || equipmentAction !== null}
                      onClick={() => void purchaseEquipment(item)}
                      className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {equipmentAction === item.id
                        ? t('equipment.purchasing')
                        : t('equipment.purchase')}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'calendar' ? (
        <div className="space-y-4">
          <Card
            title={t('calendar.title')}
            right={
              <span className="text-xs text-slate-500">
                {humanize(raceCalendar?.academy_region)}
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t('calendar.academyCompetition')}</div>
                <div className="mt-1 text-sm font-medium">
                  {competitionLabel(
                    raceCalendar?.competition_membership?.competition_class,
                    raceCalendar?.competition_membership?.division_code
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">
                  {t('calendar.selectedMonth', { defaultValue: 'Selected month' })}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {monthLabel(calendarMonth || raceCalendar?.current_month || 1)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t('calendar.entryResponsibility')}</div>
                <div className="mt-1 text-sm font-medium">
                  {raceCalendar?.race_entry_decider === 'manager'
                    ? t('settings.options.manager')
                    : t('settings.options.u16_head_coach')}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t('calendar.squadResponsibility')}</div>
                <div className="mt-1 text-sm font-medium">
                  {raceCalendar?.race_squad_decider === 'manager'
                    ? t('settings.options.manager')
                    : t('settings.options.u16_head_coach')}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {t('calendar.competitionHelp', {
                defaultValue:
                  'World Class, Continental and Regional events use age-based start limits, rider readiness and fatigue. Separate Academy squads may race at the same time, but the same rider cannot be selected for overlapping events.',
              })}
            </p>
          </Card>

          {monthlyPlanDraft ? (
            <Card
              title={t('calendar.monthlyPlanTitle', { month: monthLabel(monthlyPlanDraft.month_number) })}
              right={
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  monthlyPlanDraft.approved
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800'
                }`}>
                  {monthlyPlanDraft.approved ? t('calendar.approved') : t('calendar.approvalRequired')}
                </span>
              }
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {([
                  [t('calendar.competition.world'), 'world_race_limit', monthlyPlanDraft.available_world, 6],
                  [t('calendar.competition.continental'), 'continental_race_limit', monthlyPlanDraft.available_continental, 10],
                  [t('calendar.competition.regional'), 'regional_race_limit', monthlyPlanDraft.available_regional, 6],
                ] as const).map(([label, key, available, max]) => (
                  <label key={key} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {t('calendar.raceLimitLabel', { className: label })}
                    <div className="mt-1 text-[11px] text-slate-400">{t('calendar.calendarEventsThisMonth', { count: available })}</div>
                    <input
                      type="number"
                      min={0}
                      max={max}
                      value={monthlyPlanDraft[key]}
                      disabled={data.read_only}
                      onChange={event =>
                        setMonthlyPlanDraft(current =>
                          current
                            ? {
                                ...current,
                                [key]: Math.max(
                                  0,
                                  Math.min(max, Math.round(Number(event.target.value || 0)))
                                ),
                              }
                            : current
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                ))}
                <label className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {t('calendar.monthlyBudget')}
                  <div className="mt-1 text-[11px] text-slate-400">
                    {t('calendar.enteredSoFar', { value: money(monthlyPlanDraft.entered_cost) })}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={250}
                    value={monthlyPlanDraft.max_monthly_cost}
                    disabled={data.read_only}
                    onChange={event =>
                      setMonthlyPlanDraft(current =>
                        current
                          ? {
                              ...current,
                              max_monthly_cost: Math.max(
                                0,
                                Math.round(Number(event.target.value || 0))
                              ),
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={data.read_only || raceAction !== null}
                    onClick={() => void saveYouthMonthlyRacePlan()}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {raceAction === 'monthly-plan'
                      ? t('calendar.savingPlan')
                      : monthlyPlanDraft.approved
                        ? t('calendar.updatePlan')
                        : t('calendar.approvePlan')}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {t('calendar.planHelp')}
              </p>
            </Card>
          ) : null}

          <Card
            title={t('calendar.raceCalendar')}
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  value={calendarMonth || raceCalendar?.current_month || 1}
                  onChange={event => setCalendarMonth(Number(event.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(month => (
                    <option key={month} value={month}>
                      {monthLabel(month)}
                    </option>
                  ))}
                </select>
                <select
                  value={calendarClassFilter}
                  onChange={event =>
                    setCalendarClassFilter(
                      event.target.value as 'all' | YouthCompetitionClass
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  <option value="all">
                    {t('calendar.allCompetitions', { defaultValue: 'All competitions' })}
                  </option>
                  <option value="world">{t('calendar.competition.world')}</option>
                  <option value="continental">{t('calendar.competition.continental')}</option>
                  <option value="regional">{t('calendar.competition.regional')}</option>
                </select>
                <select
                  value={calendarScope}
                  onChange={event =>
                    setCalendarScope(
                      event.target.value as 'all' | 'my_opportunities'
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  <option value="all">
                    {t('calendar.allRaces', { defaultValue: 'All races' })}
                  </option>
                  <option value="my_opportunities">
                    {t('calendar.myOpportunities', {
                      defaultValue: 'My Academy opportunities',
                    })}
                  </option>
                </select>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>
                {t('calendar.visibleEvents', { count: visibleYouthRaces.length })}
              </span>
              <span>·</span>
              <span>
                {t('calendar.classCounts', {
                  world: Number(raceMonthData?.class_counts?.world ?? 0),
                  continental: Number(raceMonthData?.class_counts?.continental ?? 0),
                  regional: Number(raceMonthData?.class_counts?.regional ?? 0),
                  defaultValue:
                    'World {{world}} · Continental {{continental}} · Regional {{regional}}',
                })}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t('calendar.browserHelp', {
                defaultValue:
                  'This browser shows the complete Youth race calendar for the selected month. Use My Academy opportunities to narrow it to invitations and your home Regional division.',
              })}
            </p>
          </Card>

          {phase3Loading && !raceCalendar ? (
            <Card title={t('calendar.races')}>
              <div className="text-sm text-slate-500">{t('calendar.loading')}</div>
            </Card>
          ) : (
            <div className="space-y-3">
              {visibleYouthRaces.map(race => {
                const selected = lineupDrafts[race.id] ?? []
                const eligible = new Set(race.eligible_rider_ids ?? [])
                const isManagerEntry = raceCalendar?.race_entry_decider === 'manager'
                const isManagerSquad = raceCalendar?.race_squad_decider === 'manager'
                const isEntered = race.entry_status === 'entered'
                const isCompleted = race.status === 'completed'
                const isPastPrelaunch = race.status === 'cancelled' && race.prelaunch_past === true
                const isScheduled = race.status === 'scheduled'

                return (
                  <Card
                    key={race.id}
                    title={race.race_name}
                    right={
                      <span className="text-xs text-slate-500">
                        {race.race_date}
                      </span>
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                        {competitionLabel(race.competition_class, race.division_code)}
                      </span>
                      {race.host_city ? (
                        <span className="inline-flex items-center gap-1.5">
                          {flagUrl(race.host_country_code) ? (
                            <img
                              src={flagUrl(race.host_country_code) ?? ''}
                              alt=""
                              className="h-3.5 w-5 object-cover"
                            />
                          ) : null}
                          {race.host_city}
                        </span>
                      ) : null}
                      <span>·</span>
                      <span>
                        {race.race_days && race.race_days > 1
                          ? t('calendar.days', { count: race.race_days })
                          : t('calendar.oneDay')}
                      </span>
                      <span>·</span>
                      <span>{t('calendar.teams', { current: Number(race.entries_count ?? 0), max: Number(race.team_limit ?? 16) })}</span>
                      <span>·</span>
                      <span>{humanize(race.terrain_type)}</span>
                      <span>·</span>
                      <span>{race.distance_km} km</span>
                      <span>·</span>
                      <span>{money(race.entry_cost)}</span>
                      {race.invitation_status ? (
                        <span className={`rounded-full px-2.5 py-1 ${
                          race.invitation_status === 'accepted'
                            ? 'bg-emerald-50 text-emerald-700'
                            : race.invitation_status === 'pending'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-500'
                        }`}>
                          {t(`calendar.invitationStatuses.${race.invitation_status}`, { defaultValue: humanize(race.invitation_status) })}
                          {race.invitation_type ? ` · ${humanize(race.invitation_type)}` : ''}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
                          {t('calendar.noInvitation')}
                        </span>
                      )}
                      {isPastPrelaunch ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          {t('calendar.pastPrelaunch', {
                            defaultValue: 'Past · pre-launch',
                          })}
                        </span>
                      ) : null}
                    </div>

                    {isPastPrelaunch ? (
                      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                        {t('calendar.prelaunchHelp', {
                          defaultValue:
                            'This event is kept in the calendar for completeness. It was already in the past when the Youth competition system was launched, so no result was generated.',
                        })}
                      </div>
                    ) : isCompleted ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('calendar.myResults')}
                          </div>
                          {(race.my_results?.length ?? 0) === 0 ? (
                            <div className="text-sm text-slate-500">{t('calendar.didNotRace')}</div>
                          ) : (
                            <div className="space-y-1.5 text-sm">
                              {(race.my_results ?? []).map(result => (
                                <div
                                  key={result.rider_id}
                                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                                >
                                  <span>
                                    {result.position ? `#${result.position} · ` : ''}
                                    {result.name}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    +{Number(result.regional_points ?? 0)} R · +{Number(result.world_points ?? 0)} W
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('calendar.topResults')}
                          </div>
                          <div className="space-y-1.5 text-sm">
                            {(race.top_results ?? []).slice(0, 5).map(result => {
                              const flag = flagUrl(result.country_code)
                              return (
                                <div
                                  key={`${result.position}-${result.rider_name}`}
                                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                                >
                                  <span className="flex items-center gap-2">
                                    <strong>#{result.position}</strong>
                                    {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                                    {result.rider_name}
                                  </span>
                                  <span className="text-xs text-slate-500">{result.academy_name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {isScheduled && !race.qualified ? (
                          <p className="mt-4 text-sm text-slate-500">
                            {t('calendar.qualificationHelp')}
                          </p>
                        ) : null}

                        {isScheduled && isManagerEntry && !race.entry_id && race.qualified ? (
                          <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="text-xs text-slate-600">
                              {t('calendar.strategy')}
                              <select
                                value={raceStrategies[race.id] ?? 'balanced'}
                                onChange={event =>
                                  setRaceStrategies(current => ({
                                    ...current,
                                    [race.id]: event.target.value as
                                      | 'conservative'
                                      | 'balanced'
                                      | 'aggressive',
                                  }))
                                }
                                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                              >
                                <option value="conservative">{t('calendar.strategies.conservative')}</option>
                                <option value="balanced">{t('calendar.strategies.balanced')}</option>
                                <option value="aggressive">{t('calendar.strategies.aggressive')}</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={data.read_only || raceAction !== null}
                              onClick={() => void enterYouthRace(race)}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {raceAction === race.id ? t('calendar.entering') : t('calendar.enterRace')}
                            </button>
                            {race.invitation_status === 'pending' ? (
                              <button
                                type="button"
                                disabled={data.read_only || raceAction !== null}
                                onClick={() => void declineYouthRaceInvitation(race)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                              >
                                {raceAction === `decline:${race.id}` ? t('calendar.declining') : t('calendar.declineInvitation')}
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {isScheduled && !isManagerEntry && !race.entry_id && race.qualified ? (
                          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            {t('calendar.coachEntryHelp')}
                          </div>
                        ) : null}

                        {isScheduled && race.invitation_status === 'pending' && race.invitation_response_deadline ? (
                          <div className="mt-3 text-xs text-amber-700">
                            {t('calendar.responseDeadline', { date: race.invitation_response_deadline })}
                          </div>
                        ) : null}

                        {isEntered ? (
                          <div className="mt-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-slate-900">
                                  {t('calendar.entered')}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {t('calendar.enteredBy', {
                                    who: humanize(race.entered_by),
                                  })}
                                </div>
                              </div>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                {humanize(race.strategy)}
                              </span>
                            </div>

                            {isManagerSquad ? (
                              <div className="mt-4 border-t border-slate-200 pt-4">
                                <div className="mb-2 text-sm font-medium text-slate-900">
                                  {t('calendar.selectLineup', {
                                    count: selected.length,
                                    max: race.lineup_size,
                                  })}
                                </div>
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                  {(raceCalendar?.riders ?? []).map(rider => {
                                    const canSelect = eligible.has(rider.id)
                                    const checked = selected.includes(rider.id)
                                    return (
                                      <label
                                        key={rider.id}
                                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                          canSelect
                                            ? 'border-slate-200 bg-white'
                                            : 'border-slate-100 bg-slate-50 text-slate-400'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={!canSelect || data.read_only}
                                          checked={checked}
                                          onChange={() => toggleRaceLineupRider(race, rider.id)}
                                        />
                                        <span className="min-w-0">
                                          <span className="block truncate font-medium">{rider.name}</span>
                                          <span className="block text-xs text-slate-500">
                                            {rider.age} · {humanize(rider.role)} · {rider.readiness}% / {rider.fatigue}%
                                          </span>
                                        </span>
                                      </label>
                                    )
                                  })}
                                </div>
                                <div className="mt-3 flex flex-wrap items-end gap-3">
                                  <label className="text-xs text-slate-600">
                                    {t('calendar.strategy')}
                                    <select
                                      value={raceStrategies[race.id] ?? race.strategy ?? 'balanced'}
                                      onChange={event =>
                                        setRaceStrategies(current => ({
                                          ...current,
                                          [race.id]: event.target.value as
                                            | 'conservative'
                                            | 'balanced'
                                            | 'aggressive',
                                        }))
                                      }
                                      className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                    >
                                      <option value="conservative">{t('calendar.strategies.conservative')}</option>
                                      <option value="balanced">{t('calendar.strategies.balanced')}</option>
                                      <option value="aggressive">{t('calendar.strategies.aggressive')}</option>
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    disabled={
                                      data.read_only ||
                                      raceAction !== null ||
                                      selected.length < 3 ||
                                      selected.length > race.lineup_size
                                    }
                                    onClick={() => void saveYouthRaceLineup(race)}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                                  >
                                    {raceAction === `lineup:${race.id}`
                                      ? t('calendar.savingLineup')
                                      : t('calendar.saveLineup')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 text-xs text-slate-500">
                                {t('calendar.coachLineupHelp', {
                                  count: race.lineup?.length ?? 0,
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'rankings' ? (
        <div className="space-y-4">
          <Card title={t('rankings.title')}>
            <p className="text-sm leading-6 text-slate-600">
              {t('rankings.description', {
                region: humanize(youthRankings?.region_code),
              })}
            </p>
          </Card>

          {(youthRankings?.academy_divisions ?? []).map(division => (
            <Card
              key={`${division.competition_class}-${division.division_code}`}
              title={competitionLabel(division.competition_class, division.division_code)}
              right={
                youthRankings?.my_membership?.competition_class === division.competition_class &&
                youthRankings?.my_membership?.division_code === division.division_code ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                    {t('rankings.yourDivision')}
                  </span>
                ) : null
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{t('rankings.rank')}</th>
                      <th className="py-2 pr-3">{t('rankings.academy')}</th>
                      <th className="py-2 pr-3">{t('rankings.raceStarts')}</th>
                      <th className="py-2 text-right">{t('rankings.points')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(division.teams ?? []).map(team => {
                      const flag = flagUrl(team.country_code)
                      return (
                        <tr key={team.academy_id} className={team.is_mine ? 'bg-amber-50/50' : ''}>
                          <td className="py-3 pr-3 font-semibold">#{team.rank}</td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                              <span className="font-medium">{team.academy_name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3">{team.starts}</td>
                          <td className="py-3 text-right font-semibold">{team.points}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <Card title={t('rankings.riderRankings')}>
            <p className="text-sm leading-6 text-slate-600">
              {t('rankings.promotionNote')}
            </p>
          </Card>

          {[
            ['regional', t('rankings.regionalTitle'), youthRankings?.regional ?? []],
            ['world', t('rankings.worldTitle'), youthRankings?.world ?? []],
          ].map(([key, title, rows]) => (
            <Card key={String(key)} title={String(title)}>
              {phase3Loading && !youthRankings ? (
                <div className="text-sm text-slate-500">{t('rankings.loading')}</div>
              ) : (rows as YouthRankingRow[]).length === 0 ? (
                <div className="text-sm text-slate-500">{t('rankings.noPoints')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">{t('rankings.rank')}</th>
                        <th className="py-2 pr-3">{t('rankings.rider')}</th>
                        <th className="py-2 pr-3">{t('rankings.academy')}</th>
                        <th className="py-2 pr-3">{t('rankings.starts')}</th>
                        <th className="py-2 text-right">{t('rankings.points')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(rows as YouthRankingRow[]).map(row => {
                        const flag = flagUrl(row.country_code)
                        return (
                          <tr key={row.rider_id} className={row.is_mine ? 'bg-amber-50/50' : ''}>
                            <td className="py-3 pr-3 font-semibold">#{row.rank}</td>
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2">
                                {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                                <span className="font-medium">{row.rider_name}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-3">{row.academy_name}</td>
                            <td className="py-3 pr-3">{row.starts}</td>
                            <td className="py-3 text-right font-semibold">{row.points}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              [t('history.graduates'), historyData?.summary?.graduates ?? 0],
              [t('history.raceWins'), historyData?.summary?.race_wins ?? 0],
              [t('history.podiums'), historyData?.summary?.podiums ?? 0],
              [t('history.racesCompleted'), historyData?.summary?.races_completed ?? 0],
            ].map(([label, value]) => (
              <Card key={String(label)} title={String(label)}>
                <div className="text-2xl font-semibold text-slate-950">{String(value)}</div>
              </Card>
            ))}
          </div>

          <Card
            title={t('history.alumni')}
            right={
              <span className="text-xs text-slate-500">
                {t('history.alumniCount', { count: historyData?.alumni?.length ?? 0 })}
              </span>
            }
          >
            {historyLoading && !historyData ? (
              <div className="text-sm text-slate-500">{t('history.loading')}</div>
            ) : (historyData?.alumni?.length ?? 0) === 0 ? (
              <div className="text-sm text-slate-500">{t('history.noAlumni')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{t('history.rider')}</th>
                      <th className="py-2 pr-3">{t('history.joined')}</th>
                      <th className="py-2 pr-3">{t('history.graduated')}</th>
                      <th className="py-2 pr-3">{t('history.path')}</th>
                      <th className="py-2 pr-3">{t('history.starts')}</th>
                      <th className="py-2 pr-3">{t('history.wins')}</th>
                      <th className="py-2 pr-3">{t('history.regionalRank')}</th>
                      <th className="py-2 pr-3">{t('history.worldRank')}</th>
                      <th className="py-2 pr-3">{t('history.regionalPoints')}</th>
                      <th className="py-2">{t('history.worldPoints')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(historyData?.alumni ?? []).map(rider => {
                      const flag = flagUrl(rider.country_code)
                      return (
                        <tr key={rider.youth_rider_id}>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                              <div>
                                <div className="font-medium text-slate-900">{rider.rider_name}</div>
                                <div className="text-xs text-slate-500">{humanize(rider.role)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            {rider.joined_game_date} · {t('history.ageValue', { age: rider.joined_age })}
                          </td>
                          <td className="py-3 pr-3">
                            {rider.graduated_on
                              ? `${rider.graduated_on} · ${t('history.ageValue', { age: rider.graduation_age })}`
                              : '—'}
                          </td>
                          <td className="py-3 pr-3">{humanize(rider.graduation_decision)}</td>
                          <td className="py-3 pr-3">{rider.race_starts}</td>
                          <td className="py-3 pr-3">{rider.wins}</td>
                          <td className="py-3 pr-3">
                            {rider.final_regional_rank ? `#${rider.final_regional_rank}` : '—'}
                          </td>
                          <td className="py-3 pr-3">
                            {rider.final_world_rank ? `#${rider.final_world_rank}` : '—'}
                          </td>
                          <td className="py-3 pr-3">{rider.regional_points}</td>
                          <td className="py-3">{rider.world_points}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title={t('history.raceReports')}
            right={
              <span className="text-xs text-slate-500">
                {t('history.reportCount', { count: historyData?.race_reports?.length ?? 0 })}
              </span>
            }
          >
            {(historyData?.race_reports?.length ?? 0) === 0 ? (
              <div className="text-sm text-slate-500">{t('history.noReports')}</div>
            ) : (
              <div className="space-y-3">
                {(historyData?.race_reports ?? []).map(report => (
                  <div
                    key={report.race_id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{report.headline}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {report.race_date} · {humanize(report.race_level)} · {humanize(report.terrain_type)} · {report.distance_km} km
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        report.report_class === 'problem'
                          ? 'bg-red-50 text-red-700'
                          : report.report_class === 'exceptional'
                            ? 'bg-emerald-50 text-emerald-700'
                            : report.report_class === 'important'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                      }`}>
                        {t(`history.reportClasses.${report.report_class}`)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{report.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{t('history.regionalPoints')}: +{report.regional_points}</span>
                      <span>{t('history.worldPoints')}: +{report.world_points}</span>
                      <span>{t('history.fatigue')}: +{report.fatigue_added}</span>
                      <span>{t('history.developmentEvents')}: {report.development_events}</span>
                    </div>
                    {(report.key_events?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {(report.key_events ?? []).slice(0, 8).map(event => (
                          <div
                            key={`${report.race_id}-${event.rider_id}-${event.result_status}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-slate-800">
                              {event.position ? `#${event.position} · ` : ''}
                              {event.rider_name}
                            </span>
                            <span className="text-slate-500">
                              {humanize(event.result_status)}
                              {event.incident_code ? ` · ${humanize(event.incident_code)}` : ''}
                              {event.development_bonus
                                ? ` · +${event.development_bonus} ${t('history.development')}`
                                : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={t('history.developmentHistory')}
            right={
              <span className="text-xs text-slate-500">
                {t('history.latestWeeks', { count: historyData?.development_history?.length ?? 0 })}
              </span>
            }
          >
            {(historyData?.development_history?.length ?? 0) === 0 ? (
              <div className="text-sm text-slate-500">{t('history.noDevelopmentHistory')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{t('history.week')}</th>
                      <th className="py-2 pr-3">{t('history.rider')}</th>
                      <th className="py-2 pr-3">{t('history.focus')}</th>
                      <th className="py-2 pr-3">{t('history.workload')}</th>
                      <th className="py-2 pr-3">{t('history.change')}</th>
                      <th className="py-2">{t('history.readinessFatigue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(historyData?.development_history ?? []).slice(0, 100).map((row, index) => {
                      const changes = [
                        row.primary_delta > 0 && row.attribute_changed
                          ? `+${row.primary_delta} ${humanize(row.attribute_changed)}`
                          : null,
                        row.secondary_delta > 0 && row.secondary_attribute_changed
                          ? `+${row.secondary_delta} ${humanize(row.secondary_attribute_changed)}`
                          : null,
                      ].filter(Boolean).join(' · ')
                      return (
                        <tr key={`${row.week_start}-${row.youth_rider_id}-${index}`}>
                          <td className="py-3 pr-3">{row.week_start}</td>
                          <td className="py-3 pr-3 font-medium">{row.rider_name}</td>
                          <td className="py-3 pr-3">{humanize(row.development_focus)}</td>
                          <td className="py-3 pr-3">{humanize(row.workload)}</td>
                          <td className="py-3 pr-3">{changes || '—'}</td>
                          <td className="py-3">
                            {row.readiness_before}% → {row.readiness_after}% · {row.fatigue_before}% → {row.fatigue_after}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {['scouting', 'settings'].includes(tab) ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || data.read_only}
            onClick={() => void saveSettings()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
