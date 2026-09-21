import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'

type FinanceSnapshot = {
  balance: number
  weeklyIncome: number
  weeklyExpenses: number
}

type SponsorObjective = {
  objective_id: string
  sponsor_name: string
  objective_title: string
  reward_amount: number
  target_value: number
  current_value: number
  objective_status: string
  target_race_name: string | null
  target_check_game_date: string | null
  eligible_to_game_date: string | null
  remaining_value: number
  progress_pct: number
  risk_band: string
}

type PremiumWorkspace = {
  sponsor_intelligence?: SponsorObjective[]
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

function PremiumLockedCard({
  title,
  description,
}: {
  title: string
  description: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Premium
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {description}
          </p>
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
}: {
  clubId: string
  snapshot: FinanceSnapshot
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [isPremium, setIsPremium] = useState(false)
  const [checking, setChecking] = useState(true)
  const [oneTimeCost, setOneTimeCost] = useState(0)
  const [weeklyExtraCost, setWeeklyExtraCost] = useState(0)
  const [monthlyExtraIncome, setMonthlyExtraIncome] = useState(0)
  const [horizon, setHorizon] = useState(60)
  const [scenarioName, setScenarioName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    void supabase.rpc('get_my_premium_status').then(({ data }) => {
      if (!alive) return
      setIsPremium(resolvePremiumStatus(data))
      setChecking(false)
    })

    return () => {
      alive = false
    }
  }, [])

  const baselineWeeklyNet = snapshot.weeklyIncome - snapshot.weeklyExpenses

  const projection = useMemo(() => {
    const weeks = horizon / 7
    const months = horizon / 30
    const projected =
      snapshot.balance -
      Number(oneTimeCost || 0) +
      baselineWeeklyNet * weeks -
      Number(weeklyExtraCost || 0) * weeks +
      Number(monthlyExtraIncome || 0) * months

    return {
      projected,
      change: projected - snapshot.balance,
    }
  }, [
    baselineWeeklyNet,
    horizon,
    monthlyExtraIncome,
    oneTimeCost,
    snapshot.balance,
    weeklyExtraCost,
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
          one_time_cost: Number(oneTimeCost || 0),
          weekly_extra_cost: Number(weeklyExtraCost || 0),
          monthly_extra_income: Number(monthlyExtraIncome || 0),
          horizon_game_days: horizon,
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

  if (checking) return <></>
  if (!isPremium) {
    return (
      <PremiumLockedCard
        title={t('finance.title')}
        description={t('finance.description')}
      />
    )
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              {t('finance.title')}
            </h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Premium
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('finance.description')}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-slate-600">
          <span className="block text-xs font-medium text-slate-500">
            {t('finance.oneTimeCost')}
          </span>
          <input
            type="number"
            min={0}
            value={oneTimeCost}
            onChange={event => setOneTimeCost(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm text-slate-600">
          <span className="block text-xs font-medium text-slate-500">
            {t('finance.weeklyCost')}
          </span>
          <input
            type="number"
            min={0}
            value={weeklyExtraCost}
            onChange={event => setWeeklyExtraCost(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm text-slate-600">
          <span className="block text-xs font-medium text-slate-500">
            {t('finance.monthlyIncome')}
          </span>
          <input
            type="number"
            min={0}
            value={monthlyExtraIncome}
            onChange={event => setMonthlyExtraIncome(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm text-slate-600">
          <span className="block text-xs font-medium text-slate-500">
            {t('finance.horizon')}
          </span>
          <select
            value={horizon}
            onChange={event => setHorizon(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value={30}>{t('finance.days30')}</option>
            <option value={60}>{t('finance.days60')}</option>
            <option value={90}>{t('finance.days90')}</option>
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{t('finance.currentBalance')}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(snapshot.balance)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{t('finance.baselineWeeklyNet')}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(baselineWeeklyNet)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">
            {t('finance.projectedBalance', { days: horizon })}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(projection.projected)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{t('finance.scenarioChange')}</div>
          <div
            className={[
              'mt-1 text-lg font-semibold',
              projection.change >= 0 ? 'text-emerald-700' : 'text-red-700',
            ].join(' ')}
          >
            {projection.change >= 0 ? '+' : ''}
            {formatCurrency(projection.change)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
        <input
          value={scenarioName}
          onChange={event => setScenarioName(event.target.value)}
          placeholder={t('finance.defaultName')}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!scenarioName.trim() || saving}
          onClick={() => void saveScenario()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {t('finance.saveScenario')}
        </button>
      </div>

      {message ? (
        <div className="mt-3 text-sm text-slate-600">{message}</div>
      ) : null}
    </div>
  )
}

export function PremiumSponsorIntelligence({
  clubId,
}: {
  clubId: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [isPremium, setIsPremium] = useState(false)
  const [checking, setChecking] = useState(true)
  const [rows, setRows] = useState<SponsorObjective[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true

    async function load(): Promise<void> {
      const status = await supabase.rpc('get_my_premium_status')
      if (!alive) return

      const premium = resolvePremiumStatus(status.data)
      setIsPremium(premium)
      setChecking(false)

      if (!premium) return

      setLoading(true)
      const { data, error } = await supabase.rpc('premium_get_command_center_v1', {
        p_club_id: clubId,
      })

      if (!alive) return

      if (!error) {
        const workspace = (data ?? {}) as PremiumWorkspace
        setRows(workspace.sponsor_intelligence ?? [])
      }
      setLoading(false)
    }

    void load()

    return () => {
      alive = false
    }
  }, [clubId])

  if (checking) return <></>
  if (!isPremium) {
    return (
      <PremiumLockedCard
        title={t('sponsors.title')}
        description={t('sponsors.description')}
      />
    )
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          {t('sponsors.title')}
        </h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Premium
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('sponsors.description')}</p>

      {loading ? (
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-50" />
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
          {t('sponsors.none')}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(row => (
            <div
              key={row.objective_id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {row.objective_title}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.sponsor_name}
                    {row.target_race_name
                      ? ` · ${t('sponsors.targetRace', { race: row.target_race_name })}`
                      : ''}
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  {row.risk_band}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${Math.max(0, Math.min(100, row.progress_pct))}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span>{row.progress_pct}%</span>
                <span>
                  {t('sponsors.remaining')}: {row.remaining_value}
                </span>
                <span>
                  {t('sponsors.reward')}: {formatCurrency(row.reward_amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
