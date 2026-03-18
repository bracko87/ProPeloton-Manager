/**
 * Finance.tsx
 * Finance container page that hosts the finance-related tabs.
 *
 * Purpose:
 * - Resolve the user's MAIN club only (club_type = 'main').
 * - Load club context (club id, summary, cashflow series) once.
 * - ALSO load statement rows up front so Overview has real transaction names immediately.
 * - Provide tab navigation and an ErrorBoundary per tab so a single tab can
 *   fail without breaking the whole page.
 * - Keep the club id out of the header; if needed, it is surfaced only inside
 *   the Other -> Debug panel.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './finance/supabase'
import { ErrorBoundary } from './finance/ErrorBoundary'
import { OverviewTab } from './finance/OverviewTab'
import { SponsorsTab } from './finance/SponsorsTab'
import { TransactionsTab } from './finance/TransactionsTab'
import { TaxTab } from './finance/TaxTab'
import { OtherTab } from './finance/OtherTab'

/**
 * TabKey
 * Keys for Finance tabs.
 */
type TabKey = 'overview' | 'sponsors' | 'transactions' | 'tax' | 'other'

/**
 * CashflowPoint
 * Shape of daily cashflow buckets returned by the RPC.
 */
type CashflowPoint = {
  bucket_date: string
  income: string | number
  expenses: string | number
  net: string | number
}

/**
 * StatementRow
 * Shape of statement rows returned by finance_get_club_statement.
 * (Field names based on your snippets; keep as "any-ish" where backend may vary.)
 */
type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  net_amount: string | number
  metadata?: unknown
}

/**
 * ClubRow
 * Minimal shape needed when resolving the user's main club.
 */
type ClubRow = {
  id: string
}

/**
 * Helpers
 */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n: number, currency: 'USD' | 'EUR' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * getTransactionLabel
 * Extracts a human label from statement metadata with safe fallback.
 */
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

/**
 * TabButton
 * Small presentational button for the page tabs.
 */
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
      className={[
        'px-4 py-2 rounded-md text-sm font-medium transition',
        active ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/**
 * FinancePage
 * Main export: loads base data and renders tabs with per-tab error isolation.
 *
 * IMPORTANT:
 * This page must always resolve the MAIN club only.
 * Do not use generic club loaders here.
 */
export default function FinancePage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('overview')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [cashflowDaily, setCashflowDaily] = useState<CashflowPoint[]>([])

  // Statement prefetch for Overview
  const [statement, setStatement] = useState<StatementRow[]>([])
  const [statementBefore, setStatementBefore] = useState<string | null>(null)
  const [statementLoaded, setStatementLoaded] = useState(false)

  // Currency: everything is USD always
  const currency: 'USD' = 'USD'

  /**
   * Top 5 incomes/costs by transaction label (aggregated from statement).
   */
  const topIncomeByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of statement) {
      const amount = toNumber(row.net_amount)
      if (amount <= 0) continue
      const label = getTransactionLabel(row)
      map.set(label, (map.get(label) ?? 0) + amount)
    }
    return Array.from(map.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [statement])

  const topCostsByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of statement) {
      const net = toNumber(row.net_amount)
      const amount = Math.abs(net)
      if (net >= 0 || amount <= 0) continue
      const label = getTransactionLabel(row)
      map.set(label, (map.get(label) ?? 0) + amount)
    }
    return Array.from(map.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [statement])

  /**
   * resetLoadedState
   * Clears all club-scoped finance state.
   */
  function resetLoadedState(): void {
    setClubId(null)
    setSummary(null)
    setCashflowDaily([])
    setStatement([])
    setStatementBefore(null)
    setStatementLoaded(false)
  }

  /**
   * resolveMainClubId
   * Resolves the user's MAIN club only.
   *
   * This replaces generic club lookup behavior. Finance must not accidentally
   * attach to U23 or any other non-main club.
   */
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
      // Treat "no rows" as "no main club yet" instead of fatal page failure.
      if (clubRes.error.code === 'PGRST116') return null
      throw clubRes.error
    }

    return clubRes.data?.id ?? null
  }

  /**
   * loadBase
   * Loads MAIN club id, finance summary, daily cashflow series (last 90 days),
   * AND statement rows (so Overview has real transaction names immediately).
   */
  async function loadBase(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const myClubId = await resolveMainClubId()
      setClubId(myClubId)

      if (!myClubId) {
        resetLoadedState()
        setLoading(false)
        return
      }

      const summaryRes = await supabase
        .from('club_finance_summary')
        .select('*')
        .eq('club_id', myClubId)
        .single()

      if (!summaryRes.error) {
        setSummary(summaryRes.data)
      } else {
        setSummary(null)
      }

      const cashflowRes = await supabase.rpc('finance_get_club_cashflow_series', {
        p_club_id: myClubId,
        p_days: 90,
      })

      if (!cashflowRes.error) {
        setCashflowDaily(((cashflowRes.data ?? []) as CashflowPoint[]) ?? [])
      } else {
        setCashflowDaily([])
      }

      const txRes = await supabase.rpc('finance_get_club_statement', {
        p_club_id: myClubId,
        p_limit: 500,
        p_before: null,
      })

      if (!txRes.error) {
        const rows = (txRes.data ?? []) as StatementRow[]
        setStatement(rows)
        setStatementBefore(rows.length ? rows[rows.length - 1].created_at : null)
        setStatementLoaded(true)
      } else {
        setStatement([])
        setStatementBefore(null)
        setStatementLoaded(false)
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

  return (
    <div className="w-full">
      {/* Header (no club id here) */}
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
            className="px-3 py-2 rounded bg-white shadow text-sm hover:bg-gray-100"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
        <TabButton active={tab === 'other'} onClick={() => setTab('other')}>
          Other
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
              <div className="space-y-4">
                {/* Pass real breakdowns into Overview so donut legends show real names */}
                <OverviewTab
                  summary={summary}
                  cashflowDaily={cashflowDaily}
                  currency={currency}
                  topIncomeBreakdown={topIncomeByName}
                  topExpenseBreakdown={topCostsByName}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded shadow">
                    <div className="font-semibold">Top 5 incomes by transaction name</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Pulled from your transaction statement{statementLoaded ? '' : ' (not loaded)'}.
                    </div>
                    <div className="mt-3 space-y-2">
                      {topIncomeByName.length === 0 ? (
                        <div className="text-sm text-gray-500">No income items found yet.</div>
                      ) : (
                        topIncomeByName.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-gray-700 truncate">{item.label}</span>
                            <span className="font-semibold text-green-700 whitespace-nowrap">
                              {formatMoney(item.amount, currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded shadow">
                    <div className="font-semibold">Top 5 costs by transaction name</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Pulled from your transaction statement{statementLoaded ? '' : ' (not loaded)'}.
                    </div>
                    <div className="mt-3 space-y-2">
                      {topCostsByName.length === 0 ? (
                        <div className="text-sm text-gray-500">No cost items found yet.</div>
                      ) : (
                        topCostsByName.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-gray-700 truncate">{item.label}</span>
                            <span className="font-semibold text-red-700 whitespace-nowrap">
                              {formatMoney(item.amount, currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
              <TaxTab />
            </ErrorBoundary>
          )}

          {tab === 'other' && (
            <ErrorBoundary title="Other tab error">
              {clubId ? (
                <OtherTab clubId={clubId} />
              ) : (
                <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
                  No main club detected. Debug information is unavailable.
                </div>
              )}
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  )
}