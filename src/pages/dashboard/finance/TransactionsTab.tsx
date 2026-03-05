/**
 * TransactionsTab.tsx
 * Loads and displays the ledger-backed statement via RPC.
 *
 * Behavior:
 * - Uses RPC finance_get_club_statement(p_club_id, p_limit, p_before).
 * - Supports "load more" pagination.
 */

import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * StatementRow
 * Shape of statement rows returned by the RPC.
 */
type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  net_amount: string | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}

/**
 * toNumber
 * Safely coerce values to a finite number.
 */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * formatMoney
 * Format a number as a currency string.
 */
function formatMoney(n: number, currency: 'EUR' | 'USD' = 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * formatDateTime
 * Format an ISO string as a locale datetime.
 */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/**
 * TransactionsTab
 * Shows the paginated club wallet statement.
 */
export function TransactionsTab({
  clubId,
  currency = 'EUR',
}: {
  clubId: string
  currency?: 'EUR' | 'USD'
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StatementRow[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  /**
   * loadFirst
   * Load the initial page of transactions.
   */
  async function loadFirst(): Promise<void> {
    setLoading(true)
    const res = await supabase.rpc('finance_get_club_statement', {
      p_club_id: clubId,
      p_limit: 200,
      p_before: null,
    })

    if (res.error) {
      setRows([])
      setBefore(null)
      setLoading(false)
      return
    }

    const data = (res.data ?? []) as StatementRow[]
    setRows(data)
    setBefore(data.length ? data[data.length - 1].created_at : null)
    setLoading(false)
  }

  /**
   * loadMore
   * Load the next page of transactions, if any.
   */
  async function loadMore(): Promise<void> {
    if (!before) return
    setLoadingMore(true)

    const res = await supabase.rpc('finance_get_club_statement', {
      p_club_id: clubId,
      p_limit: 200,
      p_before: before,
    })

    if (!res.error) {
      const data = (res.data ?? []) as StatementRow[]
      if (data.length) {
        setRows((prev) => [...prev, ...data])
        setBefore(data[data.length - 1].created_at)
      } else {
        setBefore(null)
      }
    }

    setLoadingMore(false)
  }

  useEffect(() => {
    void loadFirst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="p-4 border-b">
        <h4 className="font-semibold">Transactions</h4>
        <div className="text-sm text-gray-500 mt-1">Ledger-backed statement for your club wallet.</div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-gray-600">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Amount</th>
                  <th className="text-left p-3">Transaction</th>
                  <th className="text-left p-3">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-600">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const amt = toNumber(r.net_amount)
                    const positive = amt >= 0
                    return (
                      <tr key={r.transaction_id} className="border-t">
                        <td className="p-3 text-gray-700 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="p-3 font-medium">{r.type}</td>
                        <td
                          className={`p-3 font-semibold whitespace-nowrap ${
                            positive ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {formatMoney(amt, currency)}
                        </td>
                        <td className="p-3 font-mono text-xs text-gray-700">{r.transaction_id}</td>
                        <td className="p-3 text-xs text-gray-600">
                          {r.metadata ? (
                            <pre className="whitespace-pre-wrap break-words">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t bg-gray-50 flex justify-between items-center">
            <div className="text-xs text-gray-600">Showing {rows.length} items.</div>
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore || !before}
              className={[
                'px-3 py-2 rounded text-sm shadow',
                loadingMore || !before ? 'bg-gray-200 text-gray-500' : 'bg-white hover:bg-gray-100',
              ].join(' ')}
            >
              {before ? (loadingMore ? 'Loading…' : 'Load more') : 'No more'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
