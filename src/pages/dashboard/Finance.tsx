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
 *   the Team Policies & Operations -> Debug panel.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
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

  // specific mappings first
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

  // generic cleanup fallback
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

export default function FinancePage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('overview')
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [cashflowDaily, setCashflowDaily] = useState<CashflowPoint[]>([])

  const [statement, setStatement] = useState<StatementRow[]>([])

  const currency: 'USD' = 'USD'

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabFromUrl = params.get('tab')

    if (tabFromUrl === 'sponsors') {
      setTab('sponsors')
    }
  }, [location.search])

  const overviewTransactions = useMemo(
    () =>
      statement.map(row => ({
        id: row.transaction_id,
        created_at: row.created_at,
        date: row.created_at,
        type: row.type,
        name: formatTransactionFullLabel(getTransactionLabel(row)),
        amount: row.net_amount,
      })),
    [statement]
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
            className="px-3 py-2 rounded bg-white shadow text-sm hover:bg-gray-100"
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
    </div>
  )
}