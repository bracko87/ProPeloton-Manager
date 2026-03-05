/**
 * Finance.tsx
 * Finance container page that hosts the finance-related tabs.
 *
 * Purpose:
 * - Load club context (club id, summary and cashflow series) once.
 * - Provide tab navigation and an ErrorBoundary per tab so a single tab can
 *   fail without breaking the whole page.
 * - Keep the club id out of the header; if needed, it is surfaced only inside
 *   the Other -&gt; Debug panel.
 */

import React, { useEffect, useState } from 'react'
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
 */
export default function FinancePage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('overview')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [cashflowDaily, setCashflowDaily] = useState<CashflowPoint[]>([])

  /**
   * loadBase
   * Loads club id, finance summary and daily cashflow series (last 90 days).
   */
  async function loadBase(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const clubRes = await supabase.rpc('get_my_club_id')
      if (clubRes.error) throw clubRes.error
      const myClubId = (clubRes.data ?? null) as string | null
      setClubId(myClubId)

      if (!myClubId) {
        setSummary(null)
        setCashflowDaily([])
        setLoading(false)
        return
      }

      const summaryRes = await supabase.from('club_finance_summary').select('*').eq('club_id', myClubId).single()
      if (!summaryRes.error) {
        setSummary(summaryRes.data)
      } else {
        // Non-fatal: keep summary null but continue.
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

      setLoading(false)
    } catch (e: any) {
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
          <div className="text-sm text-gray-500 mt-1">Overview of income, expenses and transactions.</div>
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
              <OverviewTab summary={summary} cashflowDaily={cashflowDaily} />
            </ErrorBoundary>
          )}

          {tab === 'sponsors' && (
            <ErrorBoundary title="Sponsors tab error">
              {clubId ? (
                <SponsorsTab clubId={clubId} />
              ) : (
                <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
                  Create or join a club to see sponsors.
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
                  Create or join a club to see transactions.
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
                  No club detected. Debug information is unavailable.
                </div>
              )}
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  )
}
