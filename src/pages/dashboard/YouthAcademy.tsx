import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays,
  Crown,
  GraduationCap,
  History,
  Search,
  Settings,
  Trophy,
  UserCog,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react'
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
  staff_name: string
  country_code: string
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  salary_weekly: number
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
  } | null
  current_cycle?: {
    id: string
    cycle_month: string
    range: string
    scout_score: number
    reports_created: number
  } | null
  can_run?: boolean
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
  season_budget?: number
  spent_amount?: number
  committed_amount?: number
  available_amount?: number
  weekly_rider_support?: number
  weekly_staff_salary?: number
  weekly_operating_commitment?: number
  equipment_spend?: number
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

type YouthRace = {
  id: string
  race_date: string
  race_name: string
  race_level: 'regional' | 'world_series' | 'world_final'
  region_code: string
  terrain_type: string
  distance_km: number
  entry_cost: number
  lineup_size: number
  status: 'scheduled' | 'completed' | 'cancelled'
  qualified: boolean
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
  academy_region?: string
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

type YouthRankingsPayload = {
  activated: boolean
  season_number?: number
  region_code?: string
  regional?: YouthRankingRow[]
  world?: YouthRankingRow[]
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

const TAB_ICONS: Record<TabKey, React.ComponentType<{ size?: number }>> = {
  overview: GraduationCap,
  riders: Users,
  staff: UserCog,
  budget: WalletCards,
  scouting: Search,
  settings: Settings,
  calendar: CalendarDays,
  rankings: Trophy,
  equipment: Wrench,
  history: History,
}

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
  const [data, setData] = useState<AcademyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [activationBudget, setActivationBudget] = useState(100000)
  const [draftBudget, setDraftBudget] = useState(100000)
  const [draftRange, setDraftRange] =
    useState<'local' | 'regional' | 'continental' | 'world'>('local')
  const [draftSettings, setDraftSettings] = useState<AcademyPayload['settings']>()
  const [scoutingData, setScoutingData] = useState<ScoutingPayload | null>(null)
  const [scoutingLoading, setScoutingLoading] = useState(false)
  const [scoutingAction, setScoutingAction] = useState<string | null>(null)
  const [offerDrafts, setOfferDrafts] = useState<Record<string, OfferDraft>>({})
  const [incomingOffers, setIncomingOffers] = useState<IncomingYouthOffer[]>([])
  const [financeData, setFinanceData] = useState<YouthFinancePayload | null>(null)
  const [equipmentData, setEquipmentData] = useState<YouthEquipmentPayload | null>(null)
  const [phase2Loading, setPhase2Loading] = useState(false)
  const [equipmentAction, setEquipmentAction] = useState<string | null>(null)
  const [graduations, setGraduations] = useState<YouthGraduation[]>([])
  const [graduationAction, setGraduationAction] = useState<string | null>(null)
  const [raceCalendar, setRaceCalendar] = useState<YouthRaceCalendarPayload | null>(null)
  const [youthRankings, setYouthRankings] = useState<YouthRankingsPayload | null>(null)
  const [phase3Loading, setPhase3Loading] = useState(false)
  const [raceAction, setRaceAction] = useState<string | null>(null)
  const [lineupDrafts, setLineupDrafts] = useState<Record<string, string[]>>({})
  const [raceStrategies, setRaceStrategies] = useState<
    Record<string, 'conservative' | 'balanced' | 'aggressive'>
  >({})

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

  const runScoutingCycle = async (): Promise<void> => {
    if (scoutingAction || data?.read_only) return
    setScoutingAction('cycle')
    setError(null)
    try {
      const { data: payload, error: cycleError } = await supabase.rpc(
        'run_my_youth_scouting_cycle_v1'
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
      setDraftBudget(Number(next.budget?.season_budget ?? next.default_season_budget ?? 100000))
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
  }, [tab, data?.activated])

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
      setDraftBudget(Number(next.budget?.season_budget ?? activationBudget))
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
          p_season_budget: Math.max(0, Math.round(draftBudget)),
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
      setDraftBudget(Number(next.budget?.season_budget ?? draftBudget))
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

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">{t('loading')}</div>
  }

  if (!data) {
    return <div className="p-6 text-sm text-red-700">{error ?? t('errors.load')}</div>
  }

  if (!data.premium) {
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

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabKeys.map(key => {
          const Icon = TAB_ICONS[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                tab === key
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Icon size={15} />
              {t(`tabs.${key}`)}
            </button>
          )
        })}
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
                          {rider.display_name}
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
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ['youth_academy_director', t('roles.director'), academyDirector],
            ['u16_head_coach', t('roles.headCoach'), headCoach],
            ['youth_scout', t('roles.scout'), youthScout],
          ].map(([role, label, member]) => {
            const staffMember = member as AcademyStaff | undefined
            return (
              <Card key={String(role)} title={String(label)}>
                {staffMember ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold text-slate-900">{staffMember.staff_name}</div>
                    <div className="text-slate-500">
                      {t('staff.expertise')}: {staffMember.expertise}
                    </div>
                    <div className="text-slate-500">
                      {t('staff.experience')}: {staffMember.experience}
                    </div>
                    <div className="text-slate-500">
                      {t('staff.salary')}: {money(staffMember.salary_weekly)}/{t('week')}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    {role === 'youth_scout' ? t('staff.scoutOptional') : t('notAssigned')}
                  </div>
                )}
                <Link
                  to="/dashboard/staff"
                  className="mt-4 inline-flex text-xs font-medium text-slate-700 underline"
                >
                  {t('staff.openStaffPage')}
                </Link>
              </Card>
            )
          })}
        </div>
      ) : null}

      {tab === 'budget' ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('budget.title')}>
              <label className="text-sm font-medium">{t('budget.seasonBudget')}</label>
              <input
                type="number"
                min={0}
                step={5000}
                value={draftBudget}
                disabled={data.read_only}
                onChange={event => setDraftBudget(Number(event.target.value || 0))}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">{t('budget.spent')}</div>
                  <div className="font-medium">
                    {money(financeData?.spent_amount ?? data.budget?.spent_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t('budget.committed')}</div>
                  <div className="font-medium">
                    {money(financeData?.committed_amount ?? data.budget?.committed_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t('budget.available')}</div>
                  <div className="font-medium">
                    {money(financeData?.available_amount ?? availableBudget)}
                  </div>
                </div>
              </div>
            </Card>
            <Card title={t('budget.scoutingAllocation')}>
              <div className="text-2xl font-semibold">{money(currentProgram?.season_cost)}</div>
              <p className="mt-2 text-sm text-slate-500">
                {t('budget.scoutingHelp', { range: humanize(draftRange) })}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
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
              <div className="text-2xl font-semibold">
                {money(financeData?.equipment_spend)}
              </div>
            </Card>
          </div>

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
                        <td className="py-2 text-right font-medium">
                          {entry.amount > 0 ? '+' : ''}
                          {money(entry.amount)}
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
                      <div className="text-xs text-slate-500">{t('scouting.monthlyReports')}</div>
                      <div className="mt-1 font-semibold">
                        {scoutingData.scout.monthly_report_quota}
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

            <Card title={t('scouting.monthlyCycle')}>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">{t('scouting.currentRange')}</div>
                  <div className="mt-1 font-semibold">
                    {t(`scouting.ranges.${scoutingData?.scouting_range ?? draftRange}`)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t('scouting.programBudget')}</div>
                  <div className="mt-1 font-semibold">
                    {money(scoutingData?.scouting_budget ?? currentProgram?.season_cost)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {scoutingData?.current_cycle
                    ? t('scouting.cycleCompleted', {
                        count: scoutingData.current_cycle.reports_created,
                      })
                    : t('scouting.cycleReady')}
                </div>
                <button
                  type="button"
                  disabled={
                    data.read_only ||
                    scoutingAction !== null ||
                    !scoutingData?.can_run
                  }
                  onClick={() => void runScoutingCycle()}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {scoutingAction === 'cycle'
                    ? t('scouting.running')
                    : scoutingData?.current_cycle
                      ? t('scouting.alreadyRun')
                      : t('scouting.run')}
                </button>
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
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['recruitment_decider', t('settings.recruitment'), ['manager', 'academy_director']],
              ['race_entry_decider', t('settings.raceEntry'), ['manager', 'u16_head_coach']],
              ['race_squad_decider', t('settings.raceSquad'), ['manager', 'u16_head_coach']],
              ['camp_decider', t('settings.camps'), ['manager', 'academy_director']],
              ['equipment_decider', t('settings.equipment'), ['manager', 'academy_director']],
              [
                'recruitment_negotiation_decider',
                t('settings.negotiations'),
                ['manager', 'academy_director'],
              ],
            ].map(([key, label, options]) => (
              <label key={String(key)} className="text-sm">
                <span className="font-medium text-slate-800">{String(label)}</span>
                <select
                  disabled={data.read_only}
                  value={String(draftSettings[key as keyof typeof draftSettings])}
                  onChange={event =>
                    setDraftSettings(current =>
                      current
                        ? {
                            ...current,
                            [String(key)]: event.target.value,
                          } as typeof current
                        : current
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {(options as string[]).map(option => (
                    <option key={option} value={option}>
                      {t(`settings.options.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
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
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t('calendar.format')}</div>
                <div className="mt-1 text-sm font-medium">{t('calendar.resultsOnly')}</div>
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
              {t('calendar.ageLimitHelp')}
            </p>
          </Card>

          {phase3Loading && !raceCalendar ? (
            <Card title={t('calendar.races')}>
              <div className="text-sm text-slate-500">{t('calendar.loading')}</div>
            </Card>
          ) : (
            <div className="space-y-3">
              {(raceCalendar?.races ?? []).map(race => {
                const selected = lineupDrafts[race.id] ?? []
                const eligible = new Set(race.eligible_rider_ids ?? [])
                const isManagerEntry = raceCalendar?.race_entry_decider === 'manager'
                const isManagerSquad = raceCalendar?.race_squad_decider === 'manager'
                const isEntered = race.entry_status === 'entered'
                const isCompleted = race.status === 'completed'

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
                        {t(`calendar.levels.${race.race_level}`)}
                      </span>
                      <span>{humanize(race.terrain_type)}</span>
                      <span>·</span>
                      <span>{race.distance_km} km</span>
                      <span>·</span>
                      <span>{money(race.entry_cost)}</span>
                      {race.race_level !== 'regional' ? (
                        <span className={`rounded-full px-2.5 py-1 ${
                          race.qualified
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}>
                          {race.qualified
                            ? t('calendar.qualified')
                            : t('calendar.notQualified')}
                        </span>
                      ) : null}
                    </div>

                    {isCompleted ? (
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
                        {!race.qualified ? (
                          <p className="mt-4 text-sm text-slate-500">
                            {t('calendar.qualificationHelp')}
                          </p>
                        ) : null}

                        {isManagerEntry && !race.entry_id && race.qualified ? (
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
                          </div>
                        ) : null}

                        {!isManagerEntry && !race.entry_id && race.qualified ? (
                          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            {t('calendar.coachEntryHelp')}
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
        <Card title={t('tabs.history')}>
          <p className="text-sm leading-6 text-slate-600">
            {t('placeholders.history')}
          </p>
        </Card>
      ) : null}

      {['budget', 'scouting', 'settings'].includes(tab) ? (
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
