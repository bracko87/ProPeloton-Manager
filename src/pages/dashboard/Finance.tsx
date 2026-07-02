/**
 * Finance.tsx
 * Finance container page that hosts the finance-related tabs.
 *
 * Purpose:
 * - Resolve the user's MAIN club only (club_type = 'main').
 * - Load club context using restart-safe finance RPCs.
 * - Do NOT read public.club_finance_summary directly because it is ledger-managed.
 * - Load statement rows up front so Overview has real transaction names immediately.
 * - Prevent stale pre-restart finance data from staying in page state.
 * - Provide tab navigation and an ErrorBoundary per tab so a single tab can
 *   fail without breaking the whole page.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import {
  financeTutorialSteps,
  financeWelcomeTutorial,
} from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import { supabase } from './finance/supabase'
import { ErrorBoundary } from './finance/ErrorBoundary'
import { OverviewTab } from './finance/OverviewTab'
import { SponsorsTab } from './finance/SponsorsTab'
import { TransactionsTab } from './finance/TransactionsTab'
import { TaxTab } from './finance/TaxTab'
import { TeamPoliciesOperationsTab } from './finance/TeamPoliciesOperationsTab'

type TabKey =
  | 'overview'
  | 'sponsors'
  | 'transactions'
  | 'tax'
  | 'teamPoliciesOperations'

type CashflowPoint = {
  bucket_date: string
  income: string | number
  expenses: string | number
  net: string | number
}

type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  net_amount: string | number
  metadata?: unknown
}

type ClubRow = {
  id: string
}

type RestartSafeSummary = {
  club_id: string
  current_balance: number
  weekly_income: number
  weekly_expenses: number
  wage_total: number
  updated_at?: string
  restart_boundary?: string | null
  source?: string
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalizeCashflowPoint(point: CashflowPoint): CashflowPoint {
  return {
    bucket_date: point.bucket_date,
    income: toNumber(point.income),
    expenses: toNumber(point.expenses),
    net: toNumber(point.net),
  }
}

function createZeroCashflowSeries(days = 90): CashflowPoint[] {
  const today = new Date()
  const rows: CashflowPoint[] = []

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)

    rows.push({
      bucket_date: d.toISOString().slice(0, 10),
      income: 0,
      expenses: 0,
      net: 0,
    })
  }

  return rows
}

function normalizeRestartSafeSummary(
  raw: unknown,
  clubId: string,
): RestartSafeSummary {
  const data =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  return {
    club_id: String(data.club_id ?? clubId),
    current_balance: toNumber(data.current_balance),
    weekly_income: toNumber(data.weekly_income),
    weekly_expenses: toNumber(data.weekly_expenses),
    wage_total: toNumber(data.wage_total),
    updated_at:
      typeof data.updated_at === 'string' ? data.updated_at : undefined,
    restart_boundary:
      typeof data.restart_boundary === 'string'
        ? data.restart_boundary
        : null,
    source:
      typeof data.source === 'string'
        ? data.source
        : 'restart_safe_ledger_view',
  }
}

function stripTrailingCode(raw: string): string {
  return raw
    .replace(/\s*\(([a-f0-9-]{6,}|[A-Z0-9-]{6,})\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toTitleCase(raw: string): string {
  return raw
    .split(' ')
    .filter(Boolean)
    .map(word => {
      const lower = word.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function formatTransactionFullLabel(raw: string): string {
  const cleaned = stripTrailingCode(raw).replace(/[_-]+/g, ' ').toLowerCase().trim()

  if (!cleaned) return 'Transaction'

  if (cleaned.includes('competition reward cash')) return 'Competition Reward'
  if (cleaned.includes('competition reward')) return 'Competition Reward'
  if (cleaned.includes('race reward cash')) return 'Race Reward'
  if (cleaned.includes('race reward')) return 'Race Reward'

  if (cleaned.includes('sponsor contract payment')) return 'Sponsor Contract'
  if (cleaned.includes('sponsor contract')) return 'Sponsor Contract'
  if (cleaned.includes('sponsor payment')) return 'Sponsor Payment'
  if (cleaned.includes('sponsor')) return 'Sponsor'

  if (cleaned.includes('new club bonus')) return 'New Club Bonus'
  if (cleaned.includes('signing bonus')) return 'Signing Bonus'
  if (cleaned.includes('bonus')) return 'Bonus'

  if (cleaned.includes('tax withholding')) return 'Tax Withholding'
  if (cleaned.includes('tax payment')) return 'Tax Payment'
  if (cleaned.includes('tax')) return 'Tax'

  if (cleaned.includes('rider salary payday')) return 'Rider Salary'
  if (cleaned.includes('rider salary')) return 'Rider Salary'
  if (cleaned.includes('staff salary')) return 'Staff Salary'
  if (cleaned.includes('salary')) return 'Salary'

  if (cleaned.includes('training camp refund')) return 'Training Camp Refund'
  if (cleaned.includes('training camp booking')) return 'Training Camp Booking'
  if (cleaned.includes('training camp')) return 'Training Camp'
  if (cleaned.includes('training')) return 'Training'

  if (cleaned.includes('infrastructure facility start')) return 'Infrastructure Upgrade'
  if (cleaned.includes('infrastructure asset delivery')) return 'Infrastructure Delivery'
  if (cleaned.includes('infrastructure facility')) return 'Infrastructure Upgrade'
  if (cleaned.includes('infrastructure')) return 'Infrastructure'

  if (cleaned.includes('equipment purchase')) return 'Equipment Purchase'
  if (cleaned.includes('equipment')) return 'Equipment'

  if (cleaned.includes('medical')) return 'Medical'
  if (cleaned.includes('staff')) return 'Staff'
  if (cleaned.includes('transfer fee')) return 'Transfer Fee'
  if (cleaned.includes('transfer')) return 'Transfer'
  if (cleaned.includes('travel')) return 'Travel'
  if (cleaned.includes('hotel')) return 'Hotel'
  if (cleaned.includes('transport')) return 'Transport'

  const genericWords = new Set([
    'payment',
    'payday',
    'booking',
    'cash',
    'start',
    'delivery',
    'fee',
  ])

  const words = cleaned.split(' ').filter(word => word && !genericWords.has(word))
  const fallback = words.join(' ').trim()

  return toTitleCase(fallback || cleaned)
}

function getTransactionLabel(row: StatementRow): string {
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null

  const pick = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t ? t : null
  }

  const candidates: Array<string | null> = [
    pick(meta?.name),
    pick(meta?.label),
    pick(meta?.title),
    pick(meta?.description),
    pick(meta?.reason),
    pick(meta?.expense_name),
    pick(meta?.income_name),
    pick(meta?.item_name),
    pick(meta?.vendor),
    pick(meta?.merchant),
    pick(meta?.category),
  ]

  const nested = meta?.transaction
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>
    candidates.push(pick(n.name))
    candidates.push(pick(n.label))
    candidates.push(pick(n.description))
  }

  const found = candidates.find(Boolean)
  const shortId =
    typeof row.transaction_id === 'string' ? row.transaction_id.slice(0, 8) : 'unknown'
  const t = row.type ? String(row.type) : 'transaction'

  return (found as string) ?? `${t} (${shortId})`
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
        active ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function getFinanceTabForTutorialStepKey(stepKey?: string | null): TabKey {
  switch (stepKey) {
    case 'finance-sponsors':
      return 'sponsors'
    case 'finance-transactions':
      return 'transactions'
    case 'finance-tax':
      return 'tax'
    case 'finance-policies':
      return 'teamPoliciesOperations'
    case 'finance-overview':
    default:
      return 'overview'
  }
}

export default function FinancePage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('overview')
  const location = useLocation()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [summary, setSummary] = useState<RestartSafeSummary | null>(null)
  const [cashflowDaily, setCashflowDaily] = useState<CashflowPoint[]>([])
  const [statement, setStatement] = useState<StatementRow[]>([])

  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>(
    'closed',
  )
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  const currency: 'USD' = 'USD'

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabFromUrl = params.get('tab')

    if (tabFromUrl === 'sponsors') {
      setTab('sponsors')
    }
  }, [location.search])

  useEffect(() => {
    let alive = true

    async function loadFinanceTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'finance'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = financeTutorialSteps[0]

        await saveTutorialProgress('finance', 'started', firstStep?.key ?? null)

        if (!alive) return

        setTab('overview')
        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('finance')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = financeTutorialSteps.findIndex(
          step => step.key === progress.last_step_key,
        )

        const nextStepIndex = savedStepIndex >= 0 ? savedStepIndex : 0
        const nextStep = financeTutorialSteps[nextStepIndex]

        setTab(getFinanceTabForTutorialStepKey(nextStep?.key))
        setTutorialStepIndex(nextStepIndex)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadFinanceTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  const overviewTransactions = useMemo(
    () =>
      statement.map(row => ({
        id: row.transaction_id,
        created_at: row.created_at,
        date: row.created_at,
        type: row.type,
        name: formatTransactionFullLabel(getTransactionLabel(row)),
        amount: toNumber(row.net_amount),
      })),
    [statement],
  )

  function resetLoadedState(): void {
    setClubId(null)
    setSummary(null)
    setCashflowDaily([])
    setStatement([])
  }

  async function resolveMainClubId(): Promise<string | null> {
    const authRes = await supabase.auth.getUser()
    if (authRes.error) throw authRes.error

    const userId = authRes.data.user?.id ?? null
    if (!userId) return null

    const clubRes = await supabase
      .from('clubs')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('club_type', 'main')
      .single<ClubRow>()

    if (clubRes.error) {
      if (clubRes.error.code === 'PGRST116') return null
      throw clubRes.error
    }

    return clubRes.data?.id ?? null
  }

  async function loadBase(): Promise<void> {
    setLoading(true)
    setError(null)

    /*
      Important after Restart Team:
      Clear previous tab data immediately so stale old finance numbers do not stay
      visible while the refresh request is running.
    */
    resetLoadedState()

    try {
      const myClubId = await resolveMainClubId()
      setClubId(myClubId)

      if (!myClubId) {
        setLoading(false)
        return
      }

      /*
        Restart-safe summary source.
        Do not read public.club_finance_summary directly.
        That table is ledger-managed and may contain stale weekly fields from before restart.
      */
      const summaryRes = await supabase.rpc('finance_get_restart_safe_overview_summary_v1', {
        p_club_id: myClubId,
      })

      if (!summaryRes.error) {
        setSummary(normalizeRestartSafeSummary(summaryRes.data, myClubId))
      } else {
        setSummary(
          normalizeRestartSafeSummary(
            {
              club_id: myClubId,
              current_balance: 0,
              weekly_income: 0,
              weekly_expenses: 0,
              wage_total: 0,
              source: 'restart_safe_summary_fallback',
            },
            myClubId,
          ),
        )
      }

      /*
        Restart-safe cashflow source.
        The backend RPC filters ledger rows before latest restart.
        If the RPC returns no rows, send an explicit zero series so OverviewTab
        does not need to invent fallback/mock chart rows.
      */
      const cashflowRes = await supabase.rpc('finance_get_club_cashflow_series', {
        p_club_id: myClubId,
        p_days: 90,
      })

      if (!cashflowRes.error) {
        const rows = ((cashflowRes.data ?? []) as CashflowPoint[]).map(
          normalizeCashflowPoint,
        )

        setCashflowDaily(rows.length > 0 ? rows : createZeroCashflowSeries(90))
      } else {
        setCashflowDaily(createZeroCashflowSeries(90))
      }

      /*
        Restart-safe transaction statement.
        v2 filters immutable ledger rows before latest restart.
      */
      const txRes = await supabase.rpc('finance_get_club_statement_v2', {
        p_club_id: myClubId,
        p_limit: 500,
        p_before: null,
      })

      if (!txRes.error) {
        setStatement((txRes.data ?? []) as StatementRow[])
      } else {
        setStatement([])
      }

      setLoading(false)
    } catch (e: any) {
      resetLoadedState()
      setLoading(false)
      setError(e?.message ?? 'Failed to load finance data.')
    }
  }

  useEffect(() => {
    void loadBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStartFinanceTutorial() {
    const firstStep = financeTutorialSteps[0]

    await saveTutorialProgress('finance', 'started', firstStep?.key ?? null)

    setTab('overview')
    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipFinanceTutorial() {
    await saveTutorialProgress('finance', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextFinanceTutorialStep() {
    const currentStep = financeTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= financeTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = financeTutorialSteps[nextIndex]
      const nextTab = getFinanceTabForTutorialStepKey(nextStep.key)

      setTab(nextTab)

      await saveTutorialProgress('finance', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('finance', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'menu')
    navigate('/dashboard/overview')
  }

  async function handleFinishFinanceTutorialForNow() {
    const currentStep = financeTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('finance', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseFinanceTutorial() {
    const currentStep = financeTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('finance', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'finance',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Finance</h2>
          <div className="text-sm text-gray-500 mt-1">
            Overview of income, expenses and transactions.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadBase()}
            className="px-3 py-2 rounded bg-white shadow text-sm hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm flex-wrap">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'sponsors'} onClick={() => setTab('sponsors')}>
          Sponsors
        </TabButton>
        <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
          Transactions
        </TabButton>
        <TabButton active={tab === 'tax'} onClick={() => setTab('tax')}>
          Tax
        </TabButton>
        <TabButton
          active={tab === 'teamPoliciesOperations'}
          onClick={() => setTab('teamPoliciesOperations')}
        >
          Team Policies &amp; Operations
        </TabButton>
      </div>

      {loading && <div className="bg-white p-4 rounded shadow text-sm text-gray-600">Loading…</div>}

      {!loading && error && (
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm font-semibold text-red-600">Error</div>
          <div className="text-sm text-gray-700 mt-1">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div>
          {tab === 'overview' && (
            <ErrorBoundary title="Overview tab error">
              <OverviewTab
                summary={summary}
                cashflowDaily={cashflowDaily}
                currency={currency}
                transactions={overviewTransactions}
              />
            </ErrorBoundary>
          )}

          {tab === 'sponsors' && (
            <ErrorBoundary title="Sponsors tab error">
              {clubId ? (
                <SponsorsTab clubId={clubId} />
              ) : (
                <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
                  Create or join a main club to see sponsors.
                </div>
              )}
            </ErrorBoundary>
          )}

          {tab === 'transactions' && (
            <ErrorBoundary title="Transactions tab error">
              {clubId ? (
                <TransactionsTab clubId={clubId} />
              ) : (
                <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
                  Create or join a main club to see transactions.
                </div>
              )}
            </ErrorBoundary>
          )}

          {tab === 'tax' && (
            <ErrorBoundary title="Tax tab error">
              {clubId ? (
                <TaxTab clubId={clubId} currency={currency} />
              ) : (
                <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
                  Create or join a main club to see tax data.
                </div>
              )}
            </ErrorBoundary>
          )}

          {tab === 'teamPoliciesOperations' && (
            <ErrorBoundary title="Team Policies & Operations tab error">
              <TeamPoliciesOperationsTab />
            </ErrorBoundary>
          )}
        </div>
      )}

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={financeWelcomeTutorial.title}
          body={financeWelcomeTutorial.body}
          primaryAction={financeWelcomeTutorial.primaryAction}
          secondaryAction={financeWelcomeTutorial.secondaryAction}
          onPrimary={handleStartFinanceTutorial}
          onSecondary={handleSkipFinanceTutorial}
          onClose={handleCloseFinanceTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={financeTutorialSteps[tutorialStepIndex].title}
          body={financeTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${financeTutorialSteps.length}`}
          primaryAction={
            financeTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
          }
          secondaryAction={
            tutorialStepIndex === financeTutorialSteps.length - 1
              ? financeTutorialSteps[tutorialStepIndex].secondaryAction
              : 'Skip tutorial'
          }
          onPrimary={handleNextFinanceTutorialStep}
          onSecondary={
            tutorialStepIndex === financeTutorialSteps.length - 1
              ? handleFinishFinanceTutorialForNow
              : handleSkipFinanceTutorial
          }
          onClose={handleCloseFinanceTutorial}
        />
      ) : null}
    </div>
  )
}