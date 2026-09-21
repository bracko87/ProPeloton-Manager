import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'

type FinanceSnapshot = {
  balance: number
  weeklyIncome: number
  weeklyExpenses: number
}

type SponsorObjective = {
  objective_id: string
  club_sponsor_id?: string | null
  sponsor_name: string
  sponsor_kind?: string | null
  objective_title: string
  objective_code?: string | null
  required_result?: string | null
  reward_amount: number
  target_value: number
  current_value: number
  objective_status: string
  target_race_id?: string | null
  target_race_name: string | null
  target_race_country?: string | null
  target_race_category?: string | null
  target_race_type?: string | null
  target_race_start_date?: string | null
  target_race_end_date?: string | null
  target_check_game_date: string | null
  eligible_to_game_date: string | null
  user_visible_deadline_label?: string | null
  display_status_label?: string | null
  progress_text?: string | null
  target_text?: string | null
  remaining_value: number
  progress_pct: number
  risk_band: string
}

type PremiumWorkspace = {
  sponsor_intelligence?: SponsorObjective[]
}

type PremiumToolProps = {
  clubId: string
  assumePremium?: boolean
  showHeaderLink?: boolean
  className?: string
}

function resolvePremiumStatus(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data
  return Boolean(
    row &&
      typeof row === 'object' &&
      (row as Record<string, unknown>).is_premium === true,
  )
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value) || 0))
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

  return appI18n.t('premiumCenter:common.seasonDate', {
    season,
    day: String(date.getUTCDate()).padStart(2, '0'),
    month,
  })
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const key = `premiumCenter:values.${value}`

  if (appI18n.exists(key)) return appI18n.t(key)

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
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

function statusClass(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'low' || normalized === 'on_track' || normalized === 'completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (normalized === 'high' || normalized === 'failed' || normalized === 'deadline_close') {
    return 'border-red-200 bg-red-50 text-red-700'
  }
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function PremiumLockedCard({
  title,
  description,
  className = '',
}: {
  title: string
  description: string
  className?: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')

  return (
    <div className={`mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Premium
            </span>
            <span aria-hidden="true" className="text-slate-400">🔒</span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
        </div>
        <Link
          to="/dashboard/pro"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('upgrade')}
        </Link>
      </div>
    </div>
  )
}

export function PremiumFinancialSimulator({
  clubId,
  snapshot,
  assumePremium = false,
  showHeaderLink = false,
  className = '',
}: PremiumToolProps & {
  snapshot: FinanceSnapshot
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [isPremium, setIsPremium] = useState(assumePremium)
  const [checking, setChecking] = useState(!assumePremium)
  const [oneTimeCost, setOneTimeCost] = useState(0)
  const [oneTimeIncome, setOneTimeIncome] = useState(0)
  const [weeklyExtraCost, setWeeklyExtraCost] = useState(0)
  const [weeklyExtraIncome, setWeeklyExtraIncome] = useState(0)
  const [monthlyExtraIncome, setMonthlyExtraIncome] = useState(0)
  const [monthlyExtraCost, setMonthlyExtraCost] = useState(0)
  const [targetReserve, setTargetReserve] = useState(0)
  const [horizon, setHorizon] = useState(60)
  const [scenarioName, setScenarioName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (assumePremium) {
      setIsPremium(true)
      setChecking(false)
      return
    }

    let alive = true

    const loadStatus = async (): Promise<void> => {
      const { data } = await supabase.rpc('get_my_premium_status')
      if (!alive) return
      setIsPremium(resolvePremiumStatus(data))
      setChecking(false)
    }

    void loadStatus()

    const handlePremiumStatusChanged = (): void => {
      setChecking(true)
      void loadStatus()
    }

    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)

    return () => {
      alive = false
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
    }
  }, [assumePremium])

  const baselineWeeklyNet = snapshot.weeklyIncome - snapshot.weeklyExpenses

  const projection = useMemo(() => {
    const weeks = horizon / 7
    const months = horizon / 30
    const baseline = snapshot.balance + baselineWeeklyNet * weeks
    const scenarioImpact =
      Number(oneTimeIncome || 0) -
      Number(oneTimeCost || 0) +
      (Number(weeklyExtraIncome || 0) - Number(weeklyExtraCost || 0)) * weeks +
      (Number(monthlyExtraIncome || 0) - Number(monthlyExtraCost || 0)) * months
    const projected = baseline + scenarioImpact

    return {
      baseline,
      scenarioImpact,
      projected,
      change: projected - snapshot.balance,
      reserveGap: projected - Number(targetReserve || 0),
    }
  }, [
    baselineWeeklyNet,
    horizon,
    monthlyExtraCost,
    monthlyExtraIncome,
    oneTimeCost,
    oneTimeIncome,
    snapshot.balance,
    targetReserve,
    weeklyExtraCost,
    weeklyExtraIncome,
  ])

  async function saveScenario(): Promise<void> {
    if (!scenarioName.trim()) return

    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase.rpc('premium_save_template_v1', {
        p_club_id: clubId,
        p_template_id: null,
        p_template_type: 'financial_scenario',
        p_name: scenarioName.trim(),
        p_payload_json: {
          horizon_days: horizon,
          one_time_income: Number(oneTimeIncome || 0),
          one_time_cost: Number(oneTimeCost || 0),
          weekly_income: Number(weeklyExtraIncome || 0),
          weekly_cost: Number(weeklyExtraCost || 0),
          monthly_income: Number(monthlyExtraIncome || 0),
          monthly_cost: Number(monthlyExtraCost || 0),
          target_reserve: Number(targetReserve || 0),
        },
        p_is_default: false,
      })

      if (error) throw error

      setMessage(t('finance.saveTitle'))
      setScenarioName('')
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t('errors.workspaceLoad'),
      )
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <div className={`mt-5 h-28 animate-pulse rounded-xl border border-slate-200 bg-white ${className}`} />
    )
  }

  if (!isPremium) {
    return (
      <PremiumLockedCard
        title={t('finance.title')}
        description={t('finance.description')}
        className={className}
      />
    )
  }

  return (
    <div className={`mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{t('finance.title')}</h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Premium
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('finance.description')}</p>
        </div>
        {showHeaderLink ? (
          <Link
            to="/dashboard/finance"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('finance.openFinance')}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">{t('finance.oneTimeIncome')}</span>
          <input
            type="number"
            value={oneTimeIncome}
            onChange={event => setOneTimeIncome(Number(event.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">{t('finance.oneTimeCost')}</span>
          <input
            type="number"
            value={oneTimeCost}
            onChange={event => setOneTimeCost(Number(event.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">{t('finance.targetReserve')}</span>
          <input
            type="number"
            value={targetReserve}
            onChange={event => setTargetReserve(Number(event.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">{t('finance.weeklyExtraIncome')}</span>
          <input
            type="number"
            value={weeklyExtraIncome}
            onChange={event => setWeeklyExtraIncome(Number(event.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">{t('finance.weeklyExtraCost')}</span>
          <input
            type="number"
            value={weeklyExtraCost}
            onChange={event => setWeeklyExtraCost(Number(event.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t('finance.monthlyExtraIncome')}</span>
            <input
              type="number"
              value={monthlyExtraIncome}
              onChange={event => setMonthlyExtraIncome(Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t('finance.monthlyExtraCost')}</span>
            <input
              type="number"
              value={monthlyExtraCost}
              onChange={event => setMonthlyExtraCost(Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">{t('finance.horizon')}</span>
          <span className="font-semibold text-slate-950">{t('finance.daysValue', { count: horizon })}</span>
        </div>
        <input
          type="range"
          min={30}
          max={365}
          step={5}
          value={horizon}
          onChange={event => setHorizon(Number(event.target.value))}
          className="mt-3 w-full"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>30</span>
          <span>90</span>
          <span>180</span>
          <span>365</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400">{t('finance.baselineProjection')}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(projection.baseline)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400">{t('finance.scenarioImpact')}</div>
          <div className={`mt-1 text-lg font-semibold ${projection.scenarioImpact >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {projection.scenarioImpact > 0 ? '+' : ''}{formatCurrency(projection.scenarioImpact)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400">{t('finance.projectedBalance')}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(projection.projected)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400">{t('finance.reserveGap')}</div>
          <div className={`mt-1 text-lg font-semibold ${projection.reserveGap >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {projection.reserveGap > 0 ? '+' : ''}{formatCurrency(projection.reserveGap)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <label className="min-w-[260px] flex-1">
          <span className="text-xs font-medium text-slate-500">{t('finance.scenarioName')}</span>
          <input
            value={scenarioName}
            onChange={event => setScenarioName(event.target.value)}
            placeholder={t('finance.scenarioNamePlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!scenarioName.trim() || saving}
          onClick={() => void saveScenario()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? t('common.saving') : t('finance.saveScenario')}
        </button>
      </div>

      {message ? <div className="mt-3 text-sm text-slate-600">{message}</div> : null}
    </div>
  )
}

export function PremiumSponsorIntelligence({
  clubId,
  assumePremium = false,
  showHeaderLink = false,
  className = '',
}: PremiumToolProps): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [isPremium, setIsPremium] = useState(assumePremium)
  const [checking, setChecking] = useState(!assumePremium)
  const [rows, setRows] = useState<SponsorObjective[]>([])
  const [logoBySponsorId, setLogoBySponsorId] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true

    async function load(): Promise<void> {
      let premium = assumePremium

      if (!assumePremium) {
        const status = await supabase.rpc('get_my_premium_status')
        if (!alive) return
        premium = resolvePremiumStatus(status.data)
        setIsPremium(premium)
        setChecking(false)
      } else {
        setIsPremium(true)
        setChecking(false)
      }

      if (!premium) {
        setRows([])
        setLogoBySponsorId({})
        return
      }

      setLoading(true)
      const [workspaceResult, sponsorDashboardResult] = await Promise.all([
        supabase.rpc('premium_get_command_center_v1', {
          p_club_id: clubId,
        }),
        supabase.rpc('sponsor_get_dashboard', {
          p_club_id: clubId,
        }),
      ])

      if (!alive) return

      if (!workspaceResult.error) {
        const workspace = (workspaceResult.data ?? {}) as PremiumWorkspace
        setRows(workspace.sponsor_intelligence ?? [])
      }

      if (!sponsorDashboardResult.error) {
        const signedSponsors = (
          (sponsorDashboardResult.data as Record<string, unknown> | null)?.signed_sponsors ?? []
        ) as Array<Record<string, unknown>>

        setLogoBySponsorId(
          Object.fromEntries(
            signedSponsors.map(sponsor => [
              String(sponsor.id ?? ''),
              typeof sponsor.logo_url === 'string' ? sponsor.logo_url : null,
            ]),
          ),
        )
      }

      setLoading(false)
    }

    void load()

    const handlePremiumStatusChanged = (): void => {
      if (!assumePremium) {
        setChecking(true)
        void load()
      }
    }

    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)

    return () => {
      alive = false
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
    }
  }, [assumePremium, clubId])

  if (checking) {
    return (
      <div className={`mt-5 h-28 animate-pulse rounded-xl border border-slate-200 bg-white ${className}`} />
    )
  }

  if (!isPremium) {
    return (
      <PremiumLockedCard
        title={t('sponsors.title')}
        description={t('sponsors.description')}
        className={className}
      />
    )
  }

  return (
    <div className={`mt-5 space-y-4 ${className}`}>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">{t('sponsors.title')}</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Premium
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{t('sponsors.description')}</p>
          </div>
          {showHeaderLink ? (
            <Link
              to="/dashboard/finance?tab=sponsors"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('sponsors.openSponsors')}
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          {t('sponsors.none')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('sponsors.activeObjectives')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{rows.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('sponsors.atRisk')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{rows.filter(row => ['high', 'failed'].includes(row.risk_band)).length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('sponsors.totalRewards')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(rows.reduce((sum, row) => sum + Number(row.reward_amount || 0), 0))}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('sponsors.raceLinked')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{rows.filter(row => Boolean(row.target_race_id)).length}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map(objective => {
              const logoUrl = objective.club_sponsor_id
                ? logoBySponsorId[objective.club_sponsor_id] ?? null
                : null
              const raceFlag = getFlagImageUrl(objective.target_race_country)
              const raceDate = objective.target_race_start_date ?? objective.target_check_game_date
              const targetSummary = objective.target_text || objective.progress_text

              return (
                <div key={objective.objective_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                        {targetSummary ? <div className="mt-1 text-sm leading-5 text-slate-600">{targetSummary}</div> : null}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(objective.risk_band)}`}>
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
                    <span>{formatNumber(objective.current_value)}/{formatNumber(objective.target_value)}</span>
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
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
