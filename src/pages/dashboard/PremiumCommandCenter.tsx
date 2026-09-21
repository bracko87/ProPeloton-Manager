import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Calculator,
  CalendarRange,
  ChevronRight,
  Crown,
  Gauge,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings2,
  ShoppingCart,
  Target,
  Trash2,
  TrendingUp,
  WandSparkles,
  Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import appI18n from '../../i18n'

type TabKey =
  | 'summary'
  | 'strategy'
  | 'season'
  | 'transfers'
  | 'finance'
  | 'sponsors'
  | 'development'
  | 'templates'

type PremiumStatusRow = {
  is_premium: boolean
  access_tier?: string
  access_until?: string | null
}

type SeasonPlannerRow = {
  race_preparation_id: string
  race_id: string
  race_name: string
  country_code?: string | null
  start_city?: string | null
  finish_city?: string | null
  category: string | null
  race_type: string | null
  start_date: string
  end_date: string
  preparation_status: string | null
  startlist_status: string | null
  rider_submission_deadline_on: string | null
  setup_window_opens_on: string | null
  total_stages: number
  saved_stage_plans: number
  sponsor_target_count: number
  planning_state: string
}

type ShortlistRow = {
  shortlist_id: string
  rider_id: string
  rider_name: string
  country_code: string | null
  role: string | null
  age_years: number | null
  overall_label: string | null
  potential_label: string | null
  current_club_name: string | null
  availability_type?: string | null
  availability_label: string | null
  transfer_price: number | null
  expected_salary_weekly: number | null
  is_scouted: boolean
}

type TransferAlert = {
  id: string
  search_name: string | null
  target_name: string
  alert_type: string
  message: string
  created_at: string
  is_read: boolean
}

type SponsorObjective = {
  objective_id: string
  club_sponsor_id?: string | null
  sponsor_name: string
  sponsor_kind?: string | null
  objective_title: string
  objective_code?: string | null
  required_result?: string | null
  target_race_id?: string | null
  target_race_country?: string | null
  target_race_category?: string | null
  target_race_type?: string | null
  target_race_start_date?: string | null
  target_race_end_date?: string | null
  user_visible_deadline_label?: string | null
  display_status_label?: string | null
  reward_amount: number
  target_value: number
  current_value: number
  objective_status: string
  objective_result_state: string | null
  target_race_name: string | null
  target_check_game_date: string | null
  eligible_to_game_date: string | null
  progress_text: string | null
  target_text: string | null
  remaining_value: number
  progress_pct: number
  risk_band: string
}

type RiderDevelopment = {
  rider_id: string
  display_name: string
  country_code: string | null
  role: string | null
  birth_date: string | null
  overall: number | null
  potential: number | null
  fatigue: number | null
  morale: number | null
  availability_status: string | null
  latest_net_change: number | null
  latest_overall_delta: number | null
  development_8w: number
  overall_delta_8w: number
  weeks_recorded: number
}

type Workspace = {
  scope_note: string
  game_now: string
  club: {
    id: string
    name: string
    cash_balance: number
  } | null
  summary: {
    weekly_income: number
    weekly_expenses: number
    weekly_net: number
    rider_wages_weekly: number
    staff_wages_weekly: number
    active_sponsor_monthly_income: number
    policy_cost_last_30_game_days: number
    upcoming_races_60d: number
    unread_transfer_alerts: number
    shortlist_count: number
    active_sponsor_objectives: number
  }
  season_planner: SeasonPlannerRow[]
  transfer_command: {
    shortlist: ShortlistRow[]
    saved_searches: Array<Record<string, any>>
    alerts: TransferAlert[]
    pipeline: {
      open_transfer_offers: number
      open_transfer_negotiations: number
      open_free_agent_negotiations: number
    }
  }
  finance: {
    balance: number
    weekly_income: number
    weekly_expenses: number
    weekly_net: number
    rider_wages_weekly: number
    staff_wages_weekly: number
    active_sponsor_monthly_income: number
    policy_cost_last_30_game_days: number
    cashflow: Array<{
      bucket_date: string
      income: number
      expenses: number
      net: number
    }>
  }
  sponsor_intelligence: SponsorObjective[]
  rider_development: RiderDevelopment[]
}

type StrategyCandidate = {
  rider_id: string
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  fatigue: number | null
  morale: number | null
  currently_selected: boolean
  suitability_score: number
}

type StrategyStage = {
  stage_id: string
  stage_number: number
  stage_name: string | null
  stage_date: string
  terrain_type: string | null
  profile_type: string | null
  stage_format: string | null
  distance_km: number | null
  elevation_gain_m: number | null
  current_plan: {
    stage_plan_id: string
    status: string
    stage_objective: string | null
    team_strategy: string | null
    risk_level: string | null
    last_saved_at: string | null
  } | null
  top_candidates: StrategyCandidate[]
}

type StrategyLab = {
  scope_note: string
  race: {
    race_preparation_id: string
    race_id: string
    race_name: string
    category: string | null
    race_type: string | null
    start_date: string
    end_date: string
    preparation_status: string | null
    startlist_status: string | null
  }
  stages: StrategyStage[]
}

type PremiumTemplate = {
  id: string
  club_id: string
  user_id: string
  template_type:
    | 'race_strategy'
    | 'training'
    | 'financial_scenario'
    | 'season_plan'
  name: string
  payload_json: Record<string, any>
  is_default: boolean
  created_at: string
  updated_at: string
}

type AutomationRule = {
  id: string
  rule_type: 'strategy_prefill' | 'training_prefill'
  name: string
  template_id: string
  template_name: string
  template_type: string
  match_json: Record<string, string>
  is_enabled: boolean
  last_matched_at: string | null
}

const TABS: Array<{
  key: TabKey
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { key: 'summary', icon: Gauge },
  { key: 'strategy', icon: Activity },
  { key: 'season', icon: CalendarRange },
  { key: 'transfers', icon: ShoppingCart },
  { key: 'finance', icon: Calculator },
  { key: 'sponsors', icon: Target },
  { key: 'development', icon: TrendingUp },
  { key: 'templates', icon: WandSparkles },
]

function parseStoredMainClubId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem('ppm-main-club')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return typeof parsed.id === 'string' && parsed.id ? parsed.id : null
  } catch {
    return null
  }
}

function formatCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat(appI18n.resolvedLanguage || appI18n.language || undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat(appI18n.resolvedLanguage || appI18n.language || undefined, {
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0))
}

function formatGameDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const season = Math.max(1, date.getUTCFullYear() - 1999)
  const month = date.toLocaleString(appI18n.resolvedLanguage || appI18n.language || undefined, {
    month: 'short',
    timeZone: 'UTC',
  })

  return appI18n.t('premiumCenter:common.seasonDate', { season, day: String(date.getUTCDate()).padStart(2, '0'), month })
}

function formatGameDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return `${formatGameDate(value)} · ${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`
}

function formatRealDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(appI18n.resolvedLanguage || appI18n.language || undefined)
}

function getFlagImageUrl(code?: string | null): string | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase() === 'UK' ? 'GB' : code.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
    : null
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function daysBetweenGameDates(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

function raceDurationDays(row: SeasonPlannerRow): number {
  const difference = daysBetweenGameDates(row.start_date, row.end_date)
  return difference === null ? 1 : Math.max(1, difference + 1)
}

function statusClasses(value: string): string {
  const normalized = value.toLowerCase()

  if (
    normalized.includes('complete') ||
    normalized.includes('on_track') ||
    normalized.includes('target_met') ||
    normalized.includes('success')
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (
    normalized.includes('failed') ||
    normalized.includes('high') ||
    normalized.includes('missed')
  ) {
    return 'border-red-200 bg-red-50 text-red-800'
  }

  if (
    normalized.includes('deadline') ||
    normalized.includes('medium') ||
    normalized.includes('incomplete')
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const fallback = value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
  return appI18n.t(`premiumCenter:values.${value}`, { defaultValue: fallback })
}

function formatPremiumValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value !== 'string') return String(value)

  const key = `premiumCenter:values.${value}`
  return appI18n.exists(key) ? appI18n.t(key) : value
}

function getTransferAlertMessage(
  alert: Pick<TransferAlert, 'alert_type' | 'message'>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (alert.alert_type === 'new_match') {
    return t('transfers.alertNewMatch')
  }

  return alert.message
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}): JSX.Element {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  )
}

function PremiumPreview(): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const featureCards = [
    [t('preview.features.strategyTitle'), t('preview.features.strategyDesc')],
    [t('preview.features.seasonTitle'), t('preview.features.seasonDesc')],
    [t('preview.features.transfersTitle'), t('preview.features.transfersDesc')],
    [t('preview.features.financeTitle'), t('preview.features.financeDesc')],
    [t('preview.features.sponsorsTitle'), t('preview.features.sponsorsDesc')],
    [t('preview.features.developmentTitle'), t('preview.features.developmentDesc')],
    [t('preview.features.templatesTitle'), t('preview.features.templatesDesc')],
  ]

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Crown size={16} />
            {t('preview.workspace')}
          </div>
          <h2 className="mt-2 max-w-4xl text-xl font-semibold text-slate-900">
            {t('preview.headline')}
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">
            {t('preview.body')}
          </p>
          <Link
            to="/dashboard/pro"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            <Crown size={16} />
            {t('upgrade')}
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {featureCards.map(([title, description]) => (
          <Card key={title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-base font-semibold text-slate-950">{title}</div>
              <LockKeyhole size={17} className="shrink-0 text-yellow-600" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="font-semibold text-slate-900">{t('preview.whyTitle')}</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t('preview.whyBody')}
        </p>
      </Card>
    </div>
  )
}

export default function PremiumCommandCenter(): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const location = useLocation()
  const navigate = useNavigate()

  const initialTab = useMemo<TabKey>(() => {
    const candidate = new URLSearchParams(location.search).get('tab') as TabKey | null
    return TABS.some(tab => tab.key === candidate) ? (candidate as TabKey) : 'summary'
  }, [location.search])

  const queryRacePreparationId = useMemo(
    () => new URLSearchParams(location.search).get('racePreparationId'),
    [location.search],
  )

  const [tab, setTab] = useState<TabKey>(initialTab)
  const [clubId, setClubId] = useState<string | null>(null)
  const [premiumLoading, setPremiumLoading] = useState(true)
  const [isPremium, setIsPremium] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [templates, setTemplates] = useState<PremiumTemplate[]>([])
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedPreparationId, setSelectedPreparationId] = useState<string>(
    queryRacePreparationId ?? '',
  )
  const [strategyLab, setStrategyLab] = useState<StrategyLab | null>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [selectedStageId, setSelectedStageId] = useState<string>('')
  const [selectedLeaderByStage, setSelectedLeaderByStage] = useState<Record<string, string>>({})
  const [aggressionByStage, setAggressionByStage] = useState<Record<string, number>>({})
  const [objectiveByStage, setObjectiveByStage] = useState<Record<string, string>>({})
  const [strategyByStage, setStrategyByStage] = useState<Record<string, string>>({})
  const [riskByStage, setRiskByStage] = useState<Record<string, string>>({})
  const [prefillMatch, setPrefillMatch] = useState<Record<string, any> | null>(null)

  const [simOneTimeCost, setSimOneTimeCost] = useState(0)
  const [simOneTimeIncome, setSimOneTimeIncome] = useState(0)
  const [simWeeklyCost, setSimWeeklyCost] = useState(0)
  const [simWeeklyIncome, setSimWeeklyIncome] = useState(0)
  const [simMonthlyIncome, setSimMonthlyIncome] = useState(0)
  const [simMonthlyCost, setSimMonthlyCost] = useState(0)
  const [simTargetReserve, setSimTargetReserve] = useState(0)
  const [simHorizon, setSimHorizon] = useState(60)
  const [simName, setSimName] = useState('')
  const [sponsorLogoById, setSponsorLogoById] = useState<Record<string, string | null>>({})
  const [templateSection, setTemplateSection] = useState<'race' | 'training' | 'finance' | 'automation'>('race')

  const [templateName, setTemplateName] = useState('')
  const [raceTerrain, setRaceTerrain] = useState('all')
  const [raceObjective, setRaceObjective] = useState('balanced')
  const [raceStrategy, setRaceStrategy] = useState('balanced')
  const [raceRisk, setRaceRisk] = useState('normal')
  const [trainingFocus, setTrainingFocus] = useState('general')
  const [trainingIntensity, setTrainingIntensity] = useState('normal')

  const [automationName, setAutomationName] = useState('')
  const [automationTemplateId, setAutomationTemplateId] = useState('')
  const [automationMatchKey, setAutomationMatchKey] = useState('terrain_type')
  const [automationMatchValue, setAutomationMatchValue] = useState('hilly')

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setSimName(current => current || t('finance.defaultName'))
  }, [t])

  const changeTab = useCallback(
    (nextTab: TabKey) => {
      setTab(nextTab)
      const params = new URLSearchParams(location.search)
      params.set('tab', nextTab)
      navigate(`/dashboard/premium-center?${params.toString()}`, { replace: true })
    },
    [location.search, navigate],
  )

  const resolveClub = useCallback(async (): Promise<string | null> => {
    const stored = parseStoredMainClubId()
    if (stored) return stored

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id
    if (!userId) return null

    const { data } = await supabase
      .from('clubs')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('club_type', 'main')
      .maybeSingle()

    return typeof data?.id === 'string' ? data.id : null
  }, [])

  const loadWorkspace = useCallback(
    async (targetClubId: string): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const [workspaceResult, templateResult, automationResult] = await Promise.all([
          supabase.rpc('premium_get_command_center_v1', {
            p_club_id: targetClubId,
          }),
          supabase.rpc('premium_list_templates_v1', {
            p_club_id: targetClubId,
            p_template_type: null,
          }),
          supabase.rpc('premium_list_automation_rules_v1', {
            p_club_id: targetClubId,
          }),
        ])

        if (workspaceResult.error) throw workspaceResult.error
        if (templateResult.error) throw templateResult.error
        if (automationResult.error) throw automationResult.error

        let nextWorkspace = workspaceResult.data as Workspace
        const visibleTemplates = ((templateResult.data ?? []) as Array<Record<string, any>>)
          .filter(row => row.template_type !== 'equipment') as PremiumTemplate[]
        const visibleAutomationRules = ((automationResult.data ?? []) as Array<Record<string, any>>)
          .filter(row => row.rule_type !== 'equipment_prefill') as AutomationRule[]

        const raceIds = nextWorkspace.season_planner.map(row => row.race_id).filter(Boolean)
        if (raceIds.length > 0) {
          const raceMetaResult = await supabase
            .from('races')
            .select('id,country_code,start_city,finish_city')
            .in('id', raceIds)

          if (!raceMetaResult.error) {
            const raceMeta = new Map(
              (raceMetaResult.data ?? []).map(row => [String(row.id), row as Record<string, any>]),
            )
            nextWorkspace = {
              ...nextWorkspace,
              season_planner: nextWorkspace.season_planner.map(row => ({
                ...row,
                ...(raceMeta.get(row.race_id) ?? {}),
              })),
            }
          }
        }

        const sponsorDashboardResult = await supabase.rpc('sponsor_get_dashboard', {
          p_club_id: targetClubId,
        })
        if (!sponsorDashboardResult.error) {
          const signedSponsors = (
            (sponsorDashboardResult.data as Record<string, any> | null)?.signed_sponsors ?? []
          ) as Array<Record<string, any>>
          setSponsorLogoById(
            Object.fromEntries(
              signedSponsors.map(sponsor => [
                String(sponsor.id ?? ''),
                typeof sponsor.logo_url === 'string' ? sponsor.logo_url : null,
              ]),
            ),
          )
        } else {
          setSponsorLogoById({})
        }

        setWorkspace(nextWorkspace)
        setTemplates(visibleTemplates)
        setAutomationRules(visibleAutomationRules)

        setSelectedPreparationId(current => {
          if (
            current &&
            nextWorkspace.season_planner.some(
              row => row.race_preparation_id === current,
            )
          ) {
            return current
          }
          return nextWorkspace.season_planner[0]?.race_preparation_id ?? ''
        })
      } catch (loadError: any) {
        console.error('Failed to load Premium Command Center:', loadError)
        setError(loadError?.message ?? t('errors.workspaceLoad'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    let active = true

    const boot = async (): Promise<void> => {
      setPremiumLoading(true)
      setError(null)

      try {
        const [statusResult, resolvedClubId] = await Promise.all([
          supabase.rpc('get_my_premium_status'),
          resolveClub(),
        ])

        if (!active) return
        if (statusResult.error) throw statusResult.error

        const statusRows = (statusResult.data ?? []) as PremiumStatusRow[]
        const premium = statusRows[0]?.is_premium === true

        setIsPremium(premium)
        setClubId(resolvedClubId)

        if (premium && resolvedClubId) {
          await loadWorkspace(resolvedClubId)
        }
      } catch (bootError: any) {
        console.error('Failed to initialize Premium Command Center:', bootError)
        if (active) {
          setError(bootError?.message ?? t('errors.premiumCheck'))
        }
      } finally {
        if (active) setPremiumLoading(false)
      }
    }

    void boot()

    return () => {
      active = false
    }
  }, [loadWorkspace, resolveClub, t])

  const loadStrategy = useCallback(async (): Promise<void> => {
    if (!selectedPreparationId || !isPremium) {
      setStrategyLab(null)
      return
    }

    setStrategyLoading(true)
    setPrefillMatch(null)

    try {
      const { data, error: strategyError } = await supabase.rpc(
        'premium_get_race_strategy_lab_v1',
        {
          p_race_preparation_id: selectedPreparationId,
        },
      )

      if (strategyError) throw strategyError
      const next = data as StrategyLab
      setStrategyLab(next)
      setSelectedStageId(current =>
        current && next.stages.some(stage => stage.stage_id === current)
          ? current
          : next.stages[0]?.stage_id ?? '',
      )
    } catch (strategyError: any) {
      console.error('Failed to load Race Strategy Lab:', strategyError)
      setError(strategyError?.message ?? t('errors.strategyLoad'))
    } finally {
      setStrategyLoading(false)
    }
  }, [isPremium, selectedPreparationId, t])

  useEffect(() => {
    if (tab === 'strategy') {
      void loadStrategy()
    }
  }, [loadStrategy, tab])

  const selectedStage = useMemo(
    () => strategyLab?.stages.find(stage => stage.stage_id === selectedStageId) ?? null,
    [selectedStageId, strategyLab],
  )

  useEffect(() => {
    if (!selectedStage) return

    setSelectedLeaderByStage(current => {
      if (current[selectedStage.stage_id]) return current
      return {
        ...current,
        [selectedStage.stage_id]: selectedStage.top_candidates[0]?.rider_id ?? '',
      }
    })

    setAggressionByStage(current => {
      if (typeof current[selectedStage.stage_id] === 'number') return current
      return { ...current, [selectedStage.stage_id]: 50 }
    })

    setObjectiveByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.stage_objective ??
        'balanced',
    }))

    setStrategyByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.team_strategy ??
        'balanced',
    }))

    setRiskByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.risk_level ??
        'normal',
    }))
  }, [selectedStage])

  const financeProjection = useMemo(() => {
    if (!workspace) return null

    const weeks = simHorizon / 7
    const months = simHorizon / 30
    const baseline = workspace.finance.balance + workspace.finance.weekly_net * weeks
    const scenarioImpact =
      Number(simOneTimeIncome || 0) -
      Number(simOneTimeCost || 0) +
      (Number(simWeeklyIncome || 0) - Number(simWeeklyCost || 0)) * weeks +
      (Number(simMonthlyIncome || 0) - Number(simMonthlyCost || 0)) * months
    const projected = baseline + scenarioImpact

    return {
      baseline,
      projected,
      scenarioImpact,
      delta: projected - workspace.finance.balance,
      weeks,
      months,
      reserveGap: projected - Number(simTargetReserve || 0),
    }
  }, [
    simHorizon,
    simMonthlyCost,
    simMonthlyIncome,
    simOneTimeCost,
    simOneTimeIncome,
    simTargetReserve,
    simWeeklyCost,
    simWeeklyIncome,
    workspace,
  ])

  const seasonPlanningInsights = useMemo(() => {
    if (!workspace) return { raceDays: 0, freeDays: 60, overlapCount: 0, largestGap: 60, rows: [] as Array<SeasonPlannerRow & { gapBefore: number | null; overlapsPrevious: boolean }> }

    const rows = workspace.season_planner
      .slice()
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

    let raceDays = 0
    let overlapCount = 0
    let largestGap = 0
    let previousEnd: string | null = null

    const enriched = rows.map(row => {
      raceDays += raceDurationDays(row)
      const gapBefore = previousEnd ? daysBetweenGameDates(previousEnd, row.start_date) : null
      const overlapsPrevious = gapBefore !== null && gapBefore <= 0
      if (overlapsPrevious) overlapCount += 1
      if (gapBefore !== null && gapBefore > 1) largestGap = Math.max(largestGap, gapBefore - 1)

      if (!previousEnd || new Date(row.end_date).getTime() > new Date(previousEnd).getTime()) {
        previousEnd = row.end_date
      }

      return { ...row, gapBefore, overlapsPrevious }
    })

    return {
      raceDays,
      freeDays: Math.max(0, 60 - raceDays),
      overlapCount,
      largestGap,
      rows: enriched,
    }
  }, [workspace])

  const saveTemplate = useCallback(
    async (
      type: PremiumTemplate['template_type'],
      name: string,
      payload: Record<string, any>,
    ): Promise<void> => {
      if (!clubId || !name.trim()) return

      const { error: saveError } = await supabase.rpc('premium_save_template_v1', {
        p_club_id: clubId,
        p_template_id: null,
        p_template_type: type,
        p_name: name.trim(),
        p_payload_json: payload,
        p_is_default: false,
      })

      if (saveError) {
        setError(saveError.message)
        return
      }

      const { data, error: listError } = await supabase.rpc(
        'premium_list_templates_v1',
        {
          p_club_id: clubId,
          p_template_type: null,
        },
      )

      if (!listError) {
        setTemplates(
          ((data ?? []) as Array<Record<string, any>>)
            .filter(row => row.template_type !== 'equipment') as PremiumTemplate[],
        )
      }
    },
    [clubId],
  )

  const deleteTemplate = useCallback(
    async (templateId: string): Promise<void> => {
      if (!clubId) return
      const { error: deleteError } = await supabase.rpc(
        'premium_delete_template_v1',
        {
          p_club_id: clubId,
          p_template_id: templateId,
        },
      )

      if (deleteError) {
        setError(deleteError.message)
        return
      }

      setTemplates(current => current.filter(row => row.id !== templateId))
      setAutomationRules(current =>
        current.filter(row => row.template_id !== templateId),
      )
    },
    [clubId],
  )

  const saveAutomationRule = useCallback(async (): Promise<void> => {
    if (!clubId || !automationTemplateId || !automationName.trim()) return

    const selectedTemplate = templates.find(row => row.id === automationTemplateId)
    if (!selectedTemplate) return

    const ruleType =
      selectedTemplate.template_type === 'training'
        ? 'training_prefill'
        : 'strategy_prefill'

    const { error: saveError } = await supabase.rpc(
      'premium_save_automation_rule_v1',
      {
        p_club_id: clubId,
        p_rule_id: null,
        p_rule_type: ruleType,
        p_name: automationName.trim(),
        p_template_id: automationTemplateId,
        p_match_json: {
          [automationMatchKey]: automationMatchValue,
        },
        p_is_enabled: true,
      },
    )

    if (saveError) {
      setError(saveError.message)
      return
    }

    const { data, error: listError } = await supabase.rpc(
      'premium_list_automation_rules_v1',
      { p_club_id: clubId },
    )

    if (!listError) {
      setAutomationRules(
        ((data ?? []) as Array<Record<string, any>>)
          .filter(row => row.rule_type !== 'equipment_prefill') as AutomationRule[],
      )
      setAutomationName('')
    }
  }, [
    automationMatchKey,
    automationMatchValue,
    automationName,
    automationTemplateId,
    clubId,
    templates,
  ])

  const checkStrategyPrefill = useCallback(async (): Promise<void> => {
    if (!clubId || !selectedStage) return

    const { data, error: matchError } = await supabase.rpc(
      'premium_match_automation_template_v1',
      {
        p_club_id: clubId,
        p_rule_type: 'strategy_prefill',
        p_context: {
          terrain_type: selectedStage.terrain_type ?? '',
          stage_format: selectedStage.stage_format ?? '',
          profile_type: selectedStage.profile_type ?? '',
        },
      },
    )

    if (matchError) {
      setError(matchError.message)
      return
    }

    const match = (data ?? null) as Record<string, any> | null
    setPrefillMatch(match)

    if (match?.matched === true && selectedStage) {
      const payload = (match.payload_json ?? {}) as Record<string, unknown>

      if (typeof payload.stage_objective === 'string') {
        setObjectiveByStage(current => ({
          ...current,
          [selectedStage.stage_id]: String(payload.stage_objective),
        }))
      }

      if (typeof payload.team_strategy === 'string') {
        setStrategyByStage(current => ({
          ...current,
          [selectedStage.stage_id]: String(payload.team_strategy),
        }))
      }

      if (typeof payload.risk_level === 'string') {
        setRiskByStage(current => ({
          ...current,
          [selectedStage.stage_id]: String(payload.risk_level),
        }))
      }
    }
  }, [clubId, selectedStage])

  const deleteAutomationRule = useCallback(
    async (ruleId: string): Promise<void> => {
      if (!clubId) return

      const { error: deleteError } = await supabase.rpc(
        'premium_delete_automation_rule_v1',
        {
          p_club_id: clubId,
          p_rule_id: ruleId,
        },
      )

      if (deleteError) {
        setError(deleteError.message)
        return
      }

      setAutomationRules(current => current.filter(row => row.id !== ruleId))
    },
    [clubId],
  )

  if (premiumLoading) {
    return (
      <div className="mx-auto max-w-[1700px] p-6">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Premium
            </span>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            {t('subtitle')}
          </p>
        </div>

        {isPremium && clubId ? (
          <button
            type="button"
            onClick={() => void loadWorkspace(clubId)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        ) : null}
      </div>

      {!isPremium ? (
        <PremiumPreview />
      ) : !clubId ? (
        <Card className="p-6 text-sm text-red-700">
          {t('common.mainClubMissing')}
        </Card>
      ) : (
        <>
          {error ? (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </Card>
          ) : null}

          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-slate-200">
            {TABS.map(item => {
              const active = tab === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => changeTab(item.key)}
                  className={[
                    'border-b-2 px-0 pb-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-yellow-400 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {t(`tabs.${item.key}`)}
                </button>
              )
            })}
          </div>

          {loading && !workspace ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map(key => (
                <div key={key} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : null}

          {workspace && tab === 'summary' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{t('summary.title')}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t('commandOverview.description')}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {formatGameDateTime(workspace.game_now)}
                  </span>
                </div>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    key: 'strategy' as TabKey,
                    title: t('tabs.strategy'),
                    metric: t('commandOverview.racesValue', { count: workspace.summary.upcoming_races_60d }),
                    body: workspace.season_planner.some(row => row.planning_state === 'deadline_close')
                      ? t('commandOverview.strategyDeadline')
                      : workspace.season_planner.some(row => row.planning_state !== 'on_track')
                        ? t('commandOverview.strategyPlanning')
                        : t('commandOverview.strategyClear'),
                    tone: workspace.season_planner.some(row => row.planning_state === 'deadline_close') ? 'red' : 'blue',
                  },
                  {
                    key: 'season' as TabKey,
                    title: t('tabs.season'),
                    metric: t('commandOverview.freeDaysValue', { count: seasonPlanningInsights.freeDays }),
                    body: seasonPlanningInsights.overlapCount > 0
                      ? t('commandOverview.seasonOverlap', { count: seasonPlanningInsights.overlapCount })
                      : t('commandOverview.seasonGap', { count: seasonPlanningInsights.largestGap }),
                    tone: seasonPlanningInsights.overlapCount > 0 ? 'red' : 'blue',
                  },
                  {
                    key: 'transfers' as TabKey,
                    title: t('tabs.transfers'),
                    metric: t('commandOverview.pipelineValue', {
                      count:
                        workspace.transfer_command.pipeline.open_transfer_offers +
                        workspace.transfer_command.pipeline.open_transfer_negotiations +
                        workspace.transfer_command.pipeline.open_free_agent_negotiations,
                    }),
                    body: workspace.summary.unread_transfer_alerts > 0
                      ? t('commandOverview.transferAlerts', { count: workspace.summary.unread_transfer_alerts })
                      : t('commandOverview.transferQuiet'),
                    tone: workspace.summary.unread_transfer_alerts > 0 ? 'amber' : 'blue',
                  },
                  {
                    key: 'finance' as TabKey,
                    title: t('tabs.finance'),
                    metric: formatCurrency(workspace.finance.weekly_net),
                    body: workspace.finance.weekly_net < 0
                      ? t('commandOverview.financeNegative')
                      : t('commandOverview.financePositive', { balance: formatCurrency(workspace.finance.balance) }),
                    tone: workspace.finance.weekly_net < 0 ? 'red' : 'blue',
                  },
                  {
                    key: 'sponsors' as TabKey,
                    title: t('tabs.sponsors'),
                    metric: t('commandOverview.objectivesValue', { count: workspace.summary.active_sponsor_objectives }),
                    body: workspace.sponsor_intelligence.some(row => ['high', 'failed'].includes(row.risk_band))
                      ? t('commandOverview.sponsorRisk', {
                          count: workspace.sponsor_intelligence.filter(row => ['high', 'failed'].includes(row.risk_band)).length,
                        })
                      : t('commandOverview.sponsorClear'),
                    tone: workspace.sponsor_intelligence.some(row => ['high', 'failed'].includes(row.risk_band)) ? 'amber' : 'blue',
                  },
                  {
                    key: 'development' as TabKey,
                    title: t('tabs.development'),
                    metric: t('commandOverview.improvingValue', {
                      count: workspace.rider_development.filter(row => row.development_8w > 0).length,
                    }),
                    body: t('commandOverview.developmentCoverage', {
                      count: workspace.rider_development.filter(row => row.weeks_recorded > 0).length,
                      total: workspace.rider_development.length,
                    }),
                    tone: 'blue',
                  },
                  {
                    key: 'templates' as TabKey,
                    title: t('tabs.templates'),
                    metric: t('commandOverview.workflowsValue', { count: templates.length }),
                    body: t('commandOverview.automationStatus', {
                      count: automationRules.filter(rule => rule.is_enabled).length,
                    }),
                    tone: 'blue',
                  },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => changeTab(item.key)}
                    className={`group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      item.tone === 'red'
                        ? 'border-red-200'
                        : item.tone === 'amber'
                          ? 'border-amber-200'
                          : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                        <div className="mt-3 text-2xl font-semibold text-slate-950">{item.metric}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                      </div>
                      <ChevronRight size={17} className="mt-0.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-4 text-xs font-medium text-yellow-700">
                      {t('commandOverview.openDetail')}
                    </div>
                  </button>
                ))}
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{t('commandOverview.nextActions')}</div>
                    <div className="mt-1 text-sm text-slate-500">{t('commandOverview.nextActionsHint')}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {workspace.season_planner.slice(0, 2).map(row => (
                    <Link
                      key={row.race_preparation_id}
                      to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
                    >
                      <div className="text-sm font-medium text-slate-900">{row.race_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatGameDate(row.start_date)} · {humanize(row.planning_state)}
                      </div>
                    </Link>
                  ))}
                  {workspace.sponsor_intelligence.slice(0, 1).map(objective => (
                    <button
                      key={objective.objective_id}
                      type="button"
                      onClick={() => changeTab('sponsors')}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white"
                    >
                      <div className="text-sm font-medium text-slate-900">{objective.objective_title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {objective.sponsor_name} · {objective.progress_pct}%
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'strategy' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('strategy.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('strategy.description')}</p>
                  </div>
                  <Link
                    to="/dashboard/race-preparation"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('integrations.overview.openItem')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label={t('summary.upcomingRaces')} value={workspace.summary.upcoming_races_60d} hint={t('summary.next60Days')} />
                <StatCard
                  label={t('strategy.readyPlans')}
                  value={workspace.season_planner.filter(row => row.saved_stage_plans >= row.total_stages && row.total_stages > 0).length}
                  hint={t('strategy.readyPlansHint')}
                />
                <StatCard
                  label={t('strategy.attentionNeeded')}
                  value={workspace.season_planner.filter(row => row.planning_state !== 'on_track').length}
                  hint={t('strategy.attentionNeededHint')}
                />
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="text-sm font-semibold text-slate-900">{t('summary.upcomingRaces')}</div>
                  <div className="mt-1 text-xs text-slate-500">{t('strategy.raceListHint')}</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {workspace.season_planner.slice(0, 8).map(row => {
                    const flagUrl = getFlagImageUrl(row.country_code)
                    const route = [row.start_city, row.finish_city].filter(Boolean).join(' → ')
                    const isStageRace = row.total_stages > 1

                    return (
                      <Link
                        key={row.race_preparation_id}
                        to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                        className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center"
                      >
                        <div className="flex items-center gap-3">
                          <div className="min-w-[92px] text-sm font-semibold leading-5 text-slate-900">
                            {formatGameDate(row.start_date)}
                            {row.end_date !== row.start_date ? (
                              <div className="mt-0.5 text-xs font-normal text-slate-500">
                                {t('strategy.until')} {formatGameDate(row.end_date)}
                              </div>
                            ) : null}
                          </div>
                          <div className="hidden h-12 w-px bg-emerald-400 md:block" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {flagUrl ? (
                              <img src={flagUrl} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" />
                            ) : (
                              <span className="h-4 w-6 rounded-sm border border-slate-200 bg-slate-100" />
                            )}
                            <span className="truncate text-base font-semibold text-slate-900">{row.race_name}</span>
                            {row.category ? (
                              <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                                {row.category}
                              </span>
                            ) : null}
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              isStageRace ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isStageRace
                                ? t('strategy.stageRace', { count: row.total_stages })
                                : t('strategy.oneDayRace')}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {route || humanize(row.race_type)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(row.planning_state)}`}>
                            {humanize(row.planning_state)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {t('strategy.plansProgress', { saved: row.saved_stage_plans, total: row.total_stages })}
                          </span>
                          {row.startlist_status ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                              {humanize(row.startlist_status)}
                            </span>
                          ) : null}
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'season' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('season.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('season.description')}</p>
                  </div>
                  <Link
                    to="/dashboard/calendar"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('season.openCalendar')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t('season.raceDays')} value={seasonPlanningInsights.raceDays} hint={t('season.next60DaysHint')} />
                <StatCard label={t('season.freeDays')} value={seasonPlanningInsights.freeDays} hint={t('season.next60DaysHint')} />
                <StatCard
                  label={t('season.overlaps')}
                  value={seasonPlanningInsights.overlapCount}
                  hint={seasonPlanningInsights.overlapCount > 0 ? t('season.overlapWarning') : t('season.noOverlaps')}
                />
                <StatCard
                  label={t('season.largestGap')}
                  value={t('season.daysValue', { count: seasonPlanningInsights.largestGap })}
                  hint={t('season.recoveryWindow')}
                />
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t('season.scheduleMap')}</div>
                    <div className="mt-1 text-xs text-slate-500">{t('season.scheduleMapHint')}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {t('season.next60Days')}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {seasonPlanningInsights.rows.slice(0, 10).map((row, index) => {
                    const flagUrl = getFlagImageUrl(row.country_code)
                    const gapDays = row.gapBefore !== null ? Math.max(0, row.gapBefore - 1) : null

                    return (
                      <div key={row.race_preparation_id}>
                        {index > 0 && gapDays !== null ? (
                          <div className="mb-2 ml-4 flex items-center gap-2 text-xs">
                            <div className={`h-px flex-1 ${
                              row.overlapsPrevious ? 'bg-red-200' : 'bg-emerald-200'
                            }`} />
                            <span className={row.overlapsPrevious ? 'font-medium text-red-700' : 'text-slate-500'}>
                              {row.overlapsPrevious
                                ? t('season.overlapBetweenRaces')
                                : t('season.freeWindow', { count: gapDays })}
                            </span>
                            <div className={`h-px flex-1 ${
                              row.overlapsPrevious ? 'bg-red-200' : 'bg-emerald-200'
                            }`} />
                          </div>
                        ) : null}

                        <div className={`rounded-xl border p-4 ${
                          row.overlapsPrevious
                            ? 'border-red-200 bg-red-50/50'
                            : row.planning_state === 'deadline_close'
                              ? 'border-amber-200 bg-amber-50/50'
                              : 'border-slate-200 bg-white'
                        }`}>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {flagUrl ? (
                                  <img src={flagUrl} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" />
                                ) : null}
                                <span className="font-semibold text-slate-900">{row.race_name}</span>
                                {row.category ? (
                                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">{row.category}</span>
                                ) : null}
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(row.planning_state)}`}>
                                  {humanize(row.planning_state)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatGameDate(row.start_date)}
                                {row.end_date !== row.start_date ? ` → ${formatGameDate(row.end_date)}` : ''}
                                {' · '}
                                {t('season.durationDays', { count: raceDurationDays(row) })}
                              </div>
                            </div>

                            <div className="grid min-w-[440px] grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">{t('season.startlist')}</div>
                                <div className="mt-0.5 font-medium text-slate-700">{humanize(row.startlist_status)}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">{t('season.stagePlans')}</div>
                                <div className="mt-0.5 font-medium text-slate-700">{row.saved_stage_plans}/{row.total_stages}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">{t('season.sponsorTargets')}</div>
                                <div className="mt-0.5 font-medium text-slate-700">{row.sponsor_target_count}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">{t('season.deadline')}</div>
                                <div className="mt-0.5 font-medium text-slate-700">
                                  {row.rider_submission_deadline_on ? formatGameDate(row.rider_submission_deadline_on) : '—'}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap justify-end gap-3">
                            <Link
                              to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                              className="text-xs font-medium text-slate-700 hover:text-yellow-700"
                            >
                              {t('season.officialPreparation')}
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'transfers' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('transfers.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('transfers.description')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/transfers"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('transfers.openTransfers')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label={t('transfers.openOffers')} value={workspace.transfer_command.pipeline.open_transfer_offers} />
                <StatCard label={t('transfers.transferNegotiations')} value={workspace.transfer_command.pipeline.open_transfer_negotiations} />
                <StatCard label={t('transfers.freeAgentNegotiations')} value={workspace.transfer_command.pipeline.open_free_agent_negotiations} />
                <StatCard label={t('summary.transferAlerts')} value={workspace.summary.unread_transfer_alerts} />
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">
                  {t('transfers.shortlist', { count: workspace.transfer_command.shortlist.length })}
                </div>
                <div className="divide-y divide-slate-100">
                  {workspace.transfer_command.shortlist.slice(0, 6).map(rider => (
                    <Link
                      key={rider.shortlist_id}
                      to={`/dashboard/external-riders/${rider.rider_id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{rider.rider_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {[humanize(rider.role), rider.current_club_name, rider.transfer_price != null ? formatCurrency(rider.transfer_price) : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </Link>
                  ))}
                  {workspace.transfer_command.shortlist.length === 0 ? (
                    <div className="px-5 py-5 text-sm text-slate-500">{t('transfers.emptyShortlist')}</div>
                  ) : null}
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'finance' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('finance.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('finance.description')}</p>
                  </div>
                  <Link
                    to="/dashboard/finance"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('finance.openFinance')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t('summary.cashBalance')} value={formatCurrency(workspace.finance.balance)} />
                <StatCard label={t('finance.weeklyIncome')} value={formatCurrency(workspace.finance.weekly_income)} />
                <StatCard label={t('finance.weeklyExpenses')} value={formatCurrency(workspace.finance.weekly_expenses)} />
                <StatCard label={t('summary.weeklyNet')} value={formatCurrency(workspace.finance.weekly_net)} />
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{t('finance.scenarioBuilder')}</div>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('finance.scenarioBuilderHint')}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-400">{t('finance.projectedBalance')}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      {financeProjection ? formatCurrency(financeProjection.projected) : '—'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">{t('finance.oneTimeIncome')}</span>
                    <input
                      type="number"
                      value={simOneTimeIncome}
                      onChange={event => setSimOneTimeIncome(Number(event.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">{t('finance.oneTimeCost')}</span>
                    <input
                      type="number"
                      value={simOneTimeCost}
                      onChange={event => setSimOneTimeCost(Number(event.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">{t('finance.targetReserve')}</span>
                    <input
                      type="number"
                      value={simTargetReserve}
                      onChange={event => setSimTargetReserve(Number(event.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">{t('finance.weeklyExtraIncome')}</span>
                    <input
                      type="number"
                      value={simWeeklyIncome}
                      onChange={event => setSimWeeklyIncome(Number(event.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">{t('finance.weeklyExtraCost')}</span>
                    <input
                      type="number"
                      value={simWeeklyCost}
                      onChange={event => setSimWeeklyCost(Number(event.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">{t('finance.monthlyExtraIncome')}</span>
                      <input
                        type="number"
                        value={simMonthlyIncome}
                        onChange={event => setSimMonthlyIncome(Number(event.target.value) || 0)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">{t('finance.monthlyExtraCost')}</span>
                      <input
                        type="number"
                        value={simMonthlyCost}
                        onChange={event => setSimMonthlyCost(Number(event.target.value) || 0)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{t('finance.horizon')}</span>
                    <span className="font-semibold text-slate-950">{t('finance.daysValue', { count: simHorizon })}</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={365}
                    step={5}
                    value={simHorizon}
                    onChange={event => setSimHorizon(Number(event.target.value))}
                    className="mt-3 w-full"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                    <span>30</span>
                    <span>90</span>
                    <span>180</span>
                    <span>365</span>
                  </div>
                </div>

                {financeProjection ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs text-slate-400">{t('finance.baselineProjection')}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(financeProjection.baseline)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs text-slate-400">{t('finance.scenarioImpact')}</div>
                      <div className={`mt-1 text-lg font-semibold ${
                        financeProjection.scenarioImpact >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}>
                        {financeProjection.scenarioImpact > 0 ? '+' : ''}{formatCurrency(financeProjection.scenarioImpact)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs text-slate-400">{t('finance.projectedBalance')}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(financeProjection.projected)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs text-slate-400">{t('finance.reserveGap')}</div>
                      <div className={`mt-1 text-lg font-semibold ${
                        financeProjection.reserveGap >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}>
                        {financeProjection.reserveGap > 0 ? '+' : ''}{formatCurrency(financeProjection.reserveGap)}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <label className="min-w-[260px] flex-1">
                    <span className="text-xs font-medium text-slate-500">{t('finance.scenarioName')}</span>
                    <input
                      value={simName}
                      onChange={event => setSimName(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder={t('finance.scenarioNamePlaceholder')}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!simName.trim()}
                    onClick={() => {
                      void saveTemplate('financial_scenario', simName, {
                        horizon_days: simHorizon,
                        one_time_income: simOneTimeIncome,
                        one_time_cost: simOneTimeCost,
                        weekly_income: simWeeklyIncome,
                        weekly_cost: simWeeklyCost,
                        monthly_income: simMonthlyIncome,
                        monthly_cost: simMonthlyCost,
                        target_reserve: simTargetReserve,
                      })
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    <Save size={15} />
                    {t('finance.saveScenario')}
                  </button>
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'sponsors' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('sponsors.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('sponsors.description')}</p>
                  </div>
                  <Link
                    to="/dashboard/finance?tab=sponsors"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('sponsors.openSponsors')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t('sponsors.activeObjectives')} value={workspace.sponsor_intelligence.length} />
                <StatCard
                  label={t('sponsors.atRisk')}
                  value={workspace.sponsor_intelligence.filter(row => ['high', 'failed'].includes(row.risk_band)).length}
                />
                <StatCard
                  label={t('sponsors.totalRewards')}
                  value={formatCurrency(workspace.sponsor_intelligence.reduce((sum, row) => sum + Number(row.reward_amount || 0), 0))}
                />
                <StatCard
                  label={t('sponsors.raceLinked')}
                  value={workspace.sponsor_intelligence.filter(row => Boolean(row.target_race_id)).length}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {workspace.sponsor_intelligence.map(objective => {
                  const logoUrl = objective.club_sponsor_id
                    ? sponsorLogoById[objective.club_sponsor_id] ?? null
                    : null
                  const raceFlag = getFlagImageUrl(objective.target_race_country)
                  const raceDate = objective.target_race_start_date ?? objective.target_check_game_date
                  const targetSummary = objective.target_text || objective.progress_text

                  return (
                    <Card key={objective.objective_id} className="overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              {logoUrl ? (
                                <img src={logoUrl} alt={objective.sponsor_name} className="h-full w-full object-contain p-1.5" />
                              ) : (
                                <span className="text-sm font-semibold text-slate-500">{getInitials(objective.sponsor_name)}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-950">{objective.sponsor_name}</span>
                                {objective.sponsor_kind ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                    {humanize(objective.sponsor_kind)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-base font-semibold text-slate-900">{objective.objective_title}</div>
                              {targetSummary ? (
                                <div className="mt-1 text-sm leading-5 text-slate-600">{targetSummary}</div>
                              ) : null}
                            </div>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(objective.risk_band)}`}>
                            {objective.display_status_label || humanize(objective.risk_band)}
                          </span>
                        </div>

                        {objective.target_race_name ? (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {raceFlag ? (
                                <img src={raceFlag} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" />
                              ) : null}
                              <span className="text-sm font-medium text-slate-900">{objective.target_race_name}</span>
                              {objective.target_race_category ? (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                  {objective.target_race_category}
                                </span>
                              ) : null}
                              {objective.target_race_type ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  {humanize(objective.target_race_type)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {raceDate ? formatGameDate(raceDate) : '—'}
                              {objective.target_race_end_date && objective.target_race_end_date !== objective.target_race_start_date
                                ? ` → ${formatGameDate(objective.target_race_end_date)}`
                                : ''}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          <div>
                            <div className="text-slate-400">{t('sponsors.goal')}</div>
                            <div className="mt-1 font-medium text-slate-700">
                              {objective.required_result ? humanize(objective.required_result) : objective.target_text || '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400">{t('sponsors.reward')}</div>
                            <div className="mt-1 font-medium text-slate-700">{formatCurrency(objective.reward_amount)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">{t('sponsors.deadline')}</div>
                            <div className="mt-1 font-medium text-slate-700">
                              {objective.target_check_game_date
                                ? formatGameDate(objective.target_check_game_date)
                                : objective.user_visible_deadline_label || '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400">{t('sponsors.remaining')}</div>
                            <div className="mt-1 font-medium text-slate-700">{formatNumber(objective.remaining_value)}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>{objective.current_value}/{objective.target_value}</span>
                          <span>{objective.progress_pct}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-yellow-400" style={{ width: `${clamp(objective.progress_pct, 0, 100)}%` }} />
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-3">
                          {objective.target_race_id ? (
                            <Link
                              to={`/dashboard/race-preparation?raceId=${objective.target_race_id}`}
                              className="text-xs font-medium text-slate-700 hover:text-yellow-700"
                            >
                              {t('sponsors.openRace')}
                            </Link>
                          ) : null}
                          <Link
                            to="/dashboard/finance?tab=sponsors"
                            className="text-xs font-medium text-yellow-700 hover:text-yellow-800"
                          >
                            {t('sponsors.openSponsorDetail')}
                          </Link>
                        </div>
                      </div>
                    </Card>
                  )
                })}

                {workspace.sponsor_intelligence.length === 0 ? (
                  <Card className="p-5 text-sm text-slate-500">{t('sponsors.none')}</Card>
                ) : null}
              </div>
            </div>
          ) : null}

          {workspace && tab === 'development' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('development.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('development.description')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/training?tab=development"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('integrations.overview.openItem')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                        <th className="px-4 py-3">{t('transfers.rider')}</th>
                        <th className="px-4 py-3">{t('transfers.role')}</th>
                        <th className="px-4 py-3">{t('development.overall')}</th>
                        <th className="px-4 py-3">{t('development.potential')}</th>
                        <th className="px-4 py-3">{t('development.eightWeekDevelopment')}</th>
                        <th className="px-4 py-3">{t('development.fatigue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.rider_development
                        .slice()
                        .sort((a, b) => b.development_8w - a.development_8w)
                        .slice(0, 8)
                        .map(rider => (
                          <tr key={rider.rider_id} className="border-t border-slate-100">
                            <td className="px-4 py-3">
                              <Link to={`/dashboard/my-riders/${rider.rider_id}`} className="font-medium text-slate-900 hover:text-yellow-700">
                                {rider.display_name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{humanize(rider.role)}</td>
                            <td className="px-4 py-3 text-slate-900">{rider.overall ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{rider.potential ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {rider.development_8w > 0 ? '+' : ''}{formatNumber(rider.development_8w)}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{rider.fatigue ?? 0}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : null}

          {workspace && tab === 'templates' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <Settings2 size={20} className="mt-0.5 text-yellow-600" />
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{t('templates.title')}</h2>
                    <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{t('templates.description')}</p>
                  </div>
                </div>
              </Card>

              <div className="flex flex-wrap gap-2 border-b border-slate-200">
                {[
                  ['race', t('templates.raceTemplates')],
                  ['training', t('templates.trainingTemplates')],
                  ['finance', t('templates.financeScenarios')],
                  ['automation', t('templates.automationRules')],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      const section = key as 'race' | 'training' | 'finance' | 'automation'
                      setTemplateSection(section)
                    }}
                    className={`border-b-2 px-3 pb-3 pt-1 text-sm font-medium ${
                      templateSection === key
                        ? 'border-yellow-400 text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {templateSection === 'race' || templateSection === 'training' ? (
                <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                  <Card className="p-5">
                    <div className="font-semibold text-slate-950">
                      {templateSection === 'race' ? t('templates.createRaceTemplate') : t('templates.createTrainingTemplate')}
                    </div>

                    <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('templates.name')}
                    </label>
                    <input
                      value={templateName}
                      onChange={event => setTemplateName(event.target.value)}
                      placeholder={t('templates.namePlaceholder')}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    />

                    {templateSection === 'race' ? (
                      <div className="mt-4 grid gap-3">
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('templates.terrainMatch')}</span>
                          <select value={raceTerrain} onChange={event => setRaceTerrain(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="all">{t('values.all')}</option>
                            <option value="flat">{t('values.flat')}</option>
                            <option value="hilly">{t('values.hilly')}</option>
                            <option value="mountain">{t('values.mountain')}</option>
                            <option value="cobbles">{t('values.cobbles')}</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('templates.objective')}</span>
                          <select value={raceObjective} onChange={event => setRaceObjective(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="balanced">{t('values.balanced')}</option>
                            <option value="stage_win">{t('values.stage_win')}</option>
                            <option value="protect_gc">{t('values.protect_gc')}</option>
                            <option value="breakaway">{t('values.breakaway')}</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('strategy.teamStrategy')}</span>
                          <select value={raceStrategy} onChange={event => setRaceStrategy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="balanced">{t('values.balanced')}</option>
                            <option value="sprint_control">{t('values.sprint_control')}</option>
                            <option value="climber_support">{t('values.climber_support')}</option>
                            <option value="breakaway_focus">{t('values.breakaway_focus')}</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('templates.risk')}</span>
                          <select value={raceRisk} onChange={event => setRaceRisk(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="conservative">{t('values.conservative')}</option>
                            <option value="normal">{t('values.normal')}</option>
                            <option value="aggressive">{t('values.aggressive')}</option>
                          </select>
                        </label>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('templates.focus')}</span>
                          <select value={trainingFocus} onChange={event => setTrainingFocus(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="general">{t('values.general')}</option>
                            <option value="sprint">{t('values.sprint')}</option>
                            <option value="climbing">{t('values.climbing')}</option>
                            <option value="endurance">{t('values.endurance')}</option>
                            <option value="recovery">{t('values.recovery')}</option>
                            <option value="day_off">{t('values.day_off')}</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs font-semibold text-slate-500">{t('templates.intensity')}</span>
                          <select value={trainingIntensity} onChange={event => setTrainingIntensity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                            <option value="recovery">{t('values.recovery')}</option>
                            <option value="light">{t('values.light')}</option>
                            <option value="normal">{t('values.normal')}</option>
                            <option value="hard">{t('values.hard')}</option>
                          </select>
                        </label>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!templateName.trim()}
                      onClick={() => {
                        const type = templateSection === 'race' ? 'race_strategy' : 'training'
                        const payload =
                          type === 'race_strategy'
                            ? {
                                terrain_type: raceTerrain,
                                stage_objective: raceObjective,
                                team_strategy: raceStrategy,
                                risk_level: raceRisk,
                              }
                            : {
                                focus_code: trainingFocus,
                                intensity: trainingIntensity,
                              }

                        void saveTemplate(type, templateName, payload)
                        setTemplateName('')
                      }}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Save size={15} />
                      {t('templates.save')}
                    </button>
                  </Card>

                  <Card className="p-5">
                    <div className="font-semibold text-slate-950">
                      {templateSection === 'race' ? t('templates.savedRaceTemplates') : t('templates.savedTrainingTemplates')}
                    </div>
                    <div className="mt-4 space-y-2">
                      {templates.filter(template =>
                        template.template_type === (templateSection === 'race' ? 'race_strategy' : 'training')
                      ).length === 0 ? (
                        <div className="text-sm text-slate-500">{t('templates.noneSaved')}</div>
                      ) : (
                        templates
                          .filter(template =>
                            template.template_type === (templateSection === 'race' ? 'race_strategy' : 'training')
                          )
                          .map(template => (
                            <div key={template.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900">{template.name}</div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {Object.entries(template.payload_json ?? {}).map(([key, value]) => (
                                    <span key={key} className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600">
                                      {humanize(key)}: {formatPremiumValue(value)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void deleteTemplate(template.id)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))
                      )}
                    </div>
                  </Card>
                </div>
              ) : null}

              {templateSection === 'finance' ? (
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{t('templates.financeScenarios')}</div>
                      <p className="mt-1 text-sm text-slate-500">{t('templates.financeScenariosHint')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeTab('finance')}
                      className="text-sm font-medium text-yellow-700 hover:text-yellow-800"
                    >
                      {t('templates.openSimulator')}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {templates.filter(template => template.template_type === 'financial_scenario').length === 0 ? (
                      <div className="text-sm text-slate-500">{t('templates.noneSaved')}</div>
                    ) : (
                      templates
                        .filter(template => template.template_type === 'financial_scenario')
                        .map(template => (
                          <div key={template.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div>
                              <div className="font-semibold text-slate-900">{template.name}</div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {Object.entries(template.payload_json ?? {}).slice(0, 6).map(([key, value]) => (
                                  <span key={key} className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600">
                                    {humanize(key)}: {formatPremiumValue(value)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteTemplate(template.id)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </Card>
              ) : null}

              {templateSection === 'automation' ? (
                <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                  <Card className="p-5">
                    <div className="flex items-center gap-2 font-semibold text-slate-950">
                      <Zap size={16} className="text-yellow-600" />
                      {t('templates.createRule')}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t('templates.ruleExample')}</p>

                    <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('templates.ruleName')}</label>
                    <input
                      value={automationName}
                      onChange={event => setAutomationName(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      placeholder={t('templates.rulePlaceholder')}
                    />

                    <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('templates.template')}</label>
                    <select
                      value={automationTemplateId}
                      onChange={event => setAutomationTemplateId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    >
                      <option value="">{t('templates.chooseTemplate')}</option>
                      {templates
                        .filter(template => ['race_strategy', 'training'].includes(template.template_type))
                        .map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name} · {humanize(template.template_type)}
                          </option>
                        ))}
                    </select>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label>
                        <span className="text-xs font-semibold text-slate-500">{t('templates.matchField')}</span>
                        <select
                          value={automationMatchKey}
                          onChange={event => setAutomationMatchKey(event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                        >
                          <option value="terrain_type">{t('values.terrain_type')}</option>
                          <option value="stage_format">{t('values.stage_format')}</option>
                          <option value="profile_type">{t('values.profile_type')}</option>
                          <option value="availability_status">{t('values.availability_status')}</option>
                        </select>
                      </label>
                      <label>
                        <span className="text-xs font-semibold text-slate-500">{t('templates.equals')}</span>
                        <input
                          value={automationMatchValue}
                          onChange={event => setAutomationMatchValue(event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={!automationName.trim() || !automationTemplateId}
                      onClick={() => void saveAutomationRule()}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Zap size={15} />
                      {t('templates.saveRule')}
                    </button>
                  </Card>

                  <Card className="p-5">
                    <div className="font-semibold text-slate-950">{t('templates.rules')}</div>
                    <div className="mt-4 space-y-2">
                      {automationRules.length === 0 ? (
                        <div className="text-sm text-slate-500">{t('templates.noRules')}</div>
                      ) : (
                        automationRules.map(rule => (
                          <div key={rule.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold text-slate-900">{rule.name}</div>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                  {rule.is_enabled ? t('templates.enabled') : t('templates.disabled')}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{rule.template_name} · {humanize(rule.rule_type)}</div>
                              <div className="mt-2 text-xs text-slate-600">
                                {Object.entries(rule.match_json ?? {})
                                  .map(([key, value]) => `${humanize(key)} = ${formatPremiumValue(value)}`)
                                  .join(' · ')}
                              </div>
                              {rule.last_matched_at ? (
                                <div className="mt-1 text-[11px] text-slate-400">
                                  {t('templates.lastMatched', { date: formatRealDate(rule.last_matched_at) })}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteAutomationRule(rule.id)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
