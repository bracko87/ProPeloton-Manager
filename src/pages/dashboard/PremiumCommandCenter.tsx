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
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
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
  sponsor_name: string
  objective_title: string
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
  const [simWeeklyCost, setSimWeeklyCost] = useState(0)
  const [simMonthlyIncome, setSimMonthlyIncome] = useState(0)
  const [simHorizon, setSimHorizon] = useState(60)
  const [simName, setSimName] = useState('')

  const [templateType, setTemplateType] = useState<PremiumTemplate['template_type']>('race_strategy')
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

        const nextWorkspace = workspaceResult.data as Workspace
        const visibleTemplates = ((templateResult.data ?? []) as Array<PremiumTemplate & { template_type: string }>)
          .filter(row => row.template_type !== 'equipment') as PremiumTemplate[]
        const visibleAutomationRules = ((automationResult.data ?? []) as Array<AutomationRule & { rule_type: string }>)
          .filter(row => row.rule_type !== 'equipment_prefill') as AutomationRule[]

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

  const commandItems = useMemo(() => {
    if (!workspace) return [] as Array<{ title: string; body: string; href: string; tone: string }>

    const items: Array<{ title: string; body: string; href: string; tone: string }> = []

    workspace.season_planner
      .filter(row => row.planning_state !== 'on_track')
      .slice(0, 3)
      .forEach(row => {
        items.push({
          title: row.race_name,
          body:
            row.planning_state === 'deadline_close'
              ? t('summary.deadlineClose', { saved: row.saved_stage_plans, total: row.total_stages })
              : t('summary.plansSaved', { saved: row.saved_stage_plans, total: row.total_stages }),
          href: `/dashboard/race-preparation?raceId=${row.race_id}`,
          tone: row.planning_state === 'deadline_close' ? 'red' : 'amber',
        })
      })

    workspace.sponsor_intelligence
      .filter(objective => ['high', 'failed'].includes(objective.risk_band))
      .slice(0, 2)
      .forEach(objective => {
        items.push({
          title: objective.objective_title,
          body: t('summary.sponsorProgress', { percent: objective.progress_pct, remaining: objective.remaining_value }),
          href: '/dashboard/finance',
          tone: objective.risk_band === 'failed' ? 'red' : 'amber',
        })
      })

    if (workspace.summary.unread_transfer_alerts > 0) {
      items.push({
        title: t('summary.marketAlertsTitle'),
        body: t('summary.marketAlertsBody', { count: workspace.summary.unread_transfer_alerts }),
        href: '/dashboard/transfers',
        tone: 'blue',
      })
    }

    if (workspace.finance.weekly_net < 0) {
      items.push({
        title: t('summary.negativeCashFlow'),
        body: t('summary.currentWeeklyNet', { value: formatCurrency(workspace.finance.weekly_net) }),
        href: '/dashboard/finance',
        tone: 'red',
      })
    }

    return items.slice(0, 7)
  }, [t, workspace])

  const financeProjection = useMemo(() => {
    if (!workspace) return null

    const weeks = simHorizon / 7
    const months = simHorizon / 30
    const projected =
      workspace.finance.balance -
      Number(simOneTimeCost || 0) +
      workspace.finance.weekly_net * weeks -
      Number(simWeeklyCost || 0) * weeks +
      Number(simMonthlyIncome || 0) * months

    return {
      projected,
      delta: projected - workspace.finance.balance,
      weeks,
    }
  }, [
    simHorizon,
    simMonthlyIncome,
    simOneTimeCost,
    simWeeklyCost,
    workspace,
  ])

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
          ((data ?? []) as Array<PremiumTemplate & { template_type: string }>)
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
        ((data ?? []) as Array<AutomationRule & { rule_type: string }>)
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
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Users size={18} className="mt-0.5 shrink-0 text-blue-700" />
              <div>
                <div className="font-semibold text-slate-900">{t('scopeTitle')}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t('scopeBody')}
                </p>
              </div>
            </div>
          </Card>

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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label={t('summary.cashBalance')}
                  value={formatCurrency(workspace.finance.balance)}
                />
                <StatCard
                  label={t('summary.weeklyNet')}
                  value={formatCurrency(workspace.finance.weekly_net)}
                />
                <StatCard
                  label={t('summary.upcomingRaces')}
                  value={workspace.summary.upcoming_races_60d}
                  hint={t('summary.next60Days')}
                />
                <StatCard
                  label={t('summary.transferAlerts')}
                  value={workspace.summary.unread_transfer_alerts}
                  hint={t('summary.unreadMarketAlerts')}
                />
                <StatCard
                  label={t('summary.sponsorObjectives')}
                  value={workspace.summary.active_sponsor_objectives}
                  hint={t('summary.currentlyActive')}
                />
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {t('summary.title')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {t('summary.subtitle')}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {formatGameDateTime(workspace.game_now)}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {commandItems.length === 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 lg:col-span-2">
                      {t('summary.noPriority')}
                    </div>
                  ) : (
                    commandItems.map((item, index) => (
                      <Link
                        key={`${item.title}-${index}`}
                        to={item.href}
                        className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                          item.tone === 'red'
                            ? 'border-red-200 bg-red-50'
                            : item.tone === 'amber'
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-blue-200 bg-blue-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{item.title}</div>
                            <div className="mt-1 text-sm leading-6 text-slate-600">
                              {item.body}
                            </div>
                          </div>
                          <ChevronRight
                            size={17}
                            className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5"
                          />
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-950">{t('summary.seasonPreparation')}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">
                    {workspace.season_planner.filter(row => row.planning_state !== 'on_track').length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('summary.seasonPreparationHint')}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeTab('season')}
                    className="mt-4 text-sm font-semibold text-yellow-700 hover:text-yellow-800"
                  >
                    {t('summary.openSeasonPlanner')}
                  </button>
                </Card>

                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-950">{t('summary.transferPipeline')}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">
                    {workspace.transfer_command.pipeline.open_transfer_offers +
                      workspace.transfer_command.pipeline.open_transfer_negotiations +
                      workspace.transfer_command.pipeline.open_free_agent_negotiations}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('summary.transferPipelineHint')}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeTab('transfers')}
                    className="mt-4 text-sm font-semibold text-yellow-700 hover:text-yellow-800"
                  >
                    {t('summary.openTransferCommand')}
                  </button>
                </Card>

                <Card className="p-5">
                  <div className="text-sm font-semibold text-slate-950">{t('summary.savedWorkflows')}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">
                    {templates.length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('summary.savedWorkflowsHint', { templates: templates.length, rules: automationRules.filter(rule => rule.is_enabled).length })}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeTab('templates')}
                    className="mt-4 text-sm font-semibold text-yellow-700 hover:text-yellow-800"
                  >
                    {t('summary.manageTemplates')}
                  </button>
                </Card>
              </div>
            </div>
          ) : null}

          {workspace && tab === 'strategy' ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('strategy.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('strategy.description')}
                    </p>
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
                <StatCard
                  label={t('summary.upcomingRaces')}
                  value={workspace.summary.upcoming_races_60d}
                  hint={t('summary.next60Days')}
                />
                <StatCard
                  label={t('season.stagePlans')}
                  value={workspace.season_planner.reduce((sum, row) => sum + row.saved_stage_plans, 0)}
                />
                <StatCard
                  label={t('season.sponsorTargets')}
                  value={workspace.season_planner.reduce((sum, row) => sum + row.sponsor_target_count, 0)}
                />
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">
                  {t('summary.upcomingRaces')}
                </div>
                <div className="divide-y divide-slate-100">
                  {workspace.season_planner.slice(0, 5).map(row => (
                    <Link
                      key={row.race_preparation_id}
                      to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{row.race_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {formatGameDate(row.start_date)} · {row.saved_stage_plans}/{row.total_stages}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </Link>
                  ))}
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
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('season.description')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/calendar"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('integrations.overview.openItem')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label={t('summary.upcomingRaces')} value={workspace.summary.upcoming_races_60d} />
                <StatCard
                  label={t('summary.sponsorObjectives')}
                  value={workspace.summary.active_sponsor_objectives}
                />
                <StatCard
                  label={t('season.stagePlans')}
                  value={workspace.season_planner.reduce((sum, row) => sum + row.saved_stage_plans, 0)}
                />
              </div>

              <Card className="overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {workspace.season_planner.slice(0, 6).map(row => (
                    <div key={row.race_preparation_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{row.race_name}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(row.planning_state)}`}>
                            {humanize(row.planning_state)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatGameDate(row.start_date)} · {row.saved_stage_plans}/{row.total_stages}
                        </div>
                      </div>
                      <Link
                        to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                        className="text-xs font-medium text-slate-700 hover:text-yellow-700"
                      >
                        {t('season.officialPreparation')}
                      </Link>
                    </div>
                  ))}
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
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('finance.description')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/finance"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('integrations.overview.openItem')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label={t('summary.cashBalance')} value={formatCurrency(workspace.finance.balance)} />
                <StatCard label={t('summary.weeklyNet')} value={formatCurrency(workspace.finance.weekly_net)} />
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{t('finance.saveTitle')}</div>
                    <div className="mt-1 text-sm text-slate-500">{t('finance.description')}</div>
                  </div>
                  <Link
                    to="/dashboard/finance"
                    className="text-sm font-medium text-slate-700 hover:text-yellow-700"
                  >
                    {t('finance.title')}
                  </Link>
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
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      {t('sponsors.description')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/finance?tab=sponsors"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('integrations.overview.openItem')}
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                {workspace.sponsor_intelligence.slice(0, 6).map(objective => (
                  <Card key={objective.objective_id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500">{objective.sponsor_name}</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{objective.objective_title}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(objective.risk_band)}`}>
                        {humanize(objective.risk_band)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>{objective.current_value}/{objective.target_value}</span>
                      <span>{objective.progress_pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-yellow-400" style={{ width: `${clamp(objective.progress_pct, 0, 100)}%` }} />
                    </div>
                  </Card>
                ))}
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
                    to="/dashboard/training#premium-development"
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
                    <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                      {t('templates.description')}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <Card className="p-5">
                  <div className="font-semibold text-slate-950">{t('templates.create')}</div>

                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('templates.type')}
                  </label>
                  <select
                    value={templateType}
                    onChange={event =>
                      setTemplateType(event.target.value as PremiumTemplate['template_type'])
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <option value="race_strategy">{t('templates.raceStrategy')}</option>
                    <option value="training">{t('templates.training')}</option>
                  </select>

                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('templates.name')}
                  </label>
                  <input
                    value={templateName}
                    onChange={event => setTemplateName(event.target.value)}
                    placeholder={t('templates.namePlaceholder')}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />

                  {templateType === 'race_strategy' ? (
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
                  ) : null}

                  {templateType === 'training' ? (
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
                  ) : null}

                  <button
                    type="button"
                    disabled={!templateName.trim()}
                    onClick={() => {
                      const payload =
                        templateType === 'race_strategy'
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

                      void saveTemplate(templateType, templateName, payload)
                      setTemplateName('')
                    }}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Save size={15} />
                    {t('templates.save')}
                  </button>
                </Card>

                <Card className="p-5">
                  <div className="font-semibold text-slate-950">{t('templates.saved')}</div>
                  <div className="mt-4 space-y-2">
                    {templates.length === 0 ? (
                      <div className="text-sm text-slate-500">{t('templates.noneSaved')}</div>
                    ) : (
                      templates.map(template => (
                        <div
                          key={template.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{template.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {humanize(template.template_type)}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {Object.entries(template.payload_json ?? {}).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600"
                                >
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

              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <Card className="p-5">
                  <div className="flex items-center gap-2 font-semibold text-slate-950">
                    <Zap size={16} className="text-yellow-600" />
                    {t('templates.createRule')}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {t('templates.ruleExample')}
                  </p>

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
                      .filter(template => ['race_strategy', 'training', 'equipment'].includes(template.template_type))
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
                        <div
                          key={rule.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-slate-900">{rule.name}</div>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                {rule.is_enabled ? t('templates.enabled') : t('templates.disabled')}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {rule.template_name} · {humanize(rule.rule_type)}
                            </div>
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
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
