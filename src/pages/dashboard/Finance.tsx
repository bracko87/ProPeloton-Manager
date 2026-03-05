/**
 * Finance.tsx
 * - Overview: balance + daily/weekly/monthly breakdown + graphs
 * - Sponsors: main sponsor (for now)
 * - Transactions: ledger-backed statement
 * - Tax / Other: placeholders (no DB calls => no 404s)
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// -----------------------------
// Supabase client (INLINE)
// -----------------------------
// Supports multiple build systems:
// - Next.js: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// - Vite:    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// - CRA:     REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY
//
// NOTE: make sure your deployment env vars are set accordingly.
const readEnv = (key: string): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procEnv = (typeof process !== 'undefined' ? (process as any).env : undefined) as any
  return procEnv?.[key] ?? metaEnv?.[key]
}

const supabaseUrl =
  readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  readEnv('VITE_SUPABASE_URL') ||
  readEnv('REACT_APP_SUPABASE_URL') ||
  ''

const supabaseAnonKey =
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  readEnv('VITE_SUPABASE_ANON_KEY') ||
  readEnv('REACT_APP_SUPABASE_ANON_KEY') ||
  ''

if (!supabaseUrl || !supabaseAnonKey) {
  // Don’t throw at module load in some environments; show a useful runtime error.
  // You’ll see this message in UI under "Error".
  // (If you prefer hard fail, you can throw here.)
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_/REACT_APP_ equivalents).'
  )
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// -----------------------------
// Types
// -----------------------------
type TabKey = 'overview' | 'sponsors' | 'transactions' | 'tax' | 'other'
type Granularity = 'daily' | 'weekly' | 'monthly'

type ClubFinanceSummary = {
  club_id: string
  current_balance: string | number
  weekly_income: string | number
  weekly_expenses: string | number
  wage_total: string | number
  updated_at: string
}

type CashflowPoint = {
  bucket_date: string // YYYY-MM-DD
  income: string | number
  expenses: string | number
  net: string | number
}

type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  net_amount: string | number
  metadata: any
}

type SponsorRow = {
  id: string
  club_id: string
  name: string
  monthly_amount: string | number
  status: string
  is_main: boolean
  started_at: string | null
  ends_at: string | null
  created_at?: string
}

// -----------------------------
// Helpers
// -----------------------------
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n: number, currency: 'EUR' | 'USD' = 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-4 py-2 rounded-md text-sm font-medium transition',
        active ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100',
      ].join(' ')}
      type="button"
    >
      {children}
    </button>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {sub ? <div className="text-xs text-gray-500 mt-1">{sub}</div> : null}
    </div>
  )
}

/** Very simple bars: income (dark), expenses (light) */
function MiniBars({
  points,
  height = 140,
}: {
  points: { label: string; income: number; expenses: number }[]
  height?: number
}) {
  const maxVal = Math.max(1, ...points.map((p) => Math.max(p.income, p.expenses)))
  const width = Math.max(1, points.length * 18)

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[680px]">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <line x1={0} y1={height - 18} x2={width} y2={height - 18} stroke="currentColor" opacity="0.15" />
          {points.map((p, i) => {
            const x = i * 18 + 6
            const base = height - 18
            const incomeH = (p.income / maxVal) * (height - 36)
            const expH = (p.expenses / maxVal) * (height - 36)
            return (
              <g key={p.label}>
                <rect x={x} y={base - incomeH} width={5} height={incomeH} rx={2} fill="currentColor" opacity="0.45" />
                <rect x={x + 7} y={base - expH} width={5} height={expH} rx={2} fill="currentColor" opacity="0.18" />
              </g>
            )
          })}
        </svg>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>Income (darker)</span>
          <span>Expenses (lighter)</span>
        </div>
      </div>
    </div>
  )
}

/** Simple net line */
function MiniLine({ points, height = 140 }: { points: { label: string; value: number }[]; height?: number }) {
  const width = Math.max(1, points.length * 18)
  const maxVal = Math.max(1, ...points.map((p) => p.value))
  const minVal = Math.min(0, ...points.map((p) => p.value))
  const range = Math.max(1, maxVal - minVal)
  const padTop = 8
  const padBottom = 18
  const plotH = height - padTop - padBottom

  const coords = points.map((p, i) => {
    const x = i * 18 + 8
    const yNorm = (p.value - minVal) / range
    const y = padTop + (1 - yNorm) * plotH
    return { x, y }
  })

  const d = coords.map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`)).join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[680px]">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <line x1={0} y1={height - padBottom} x2={width} y2={height - padBottom} stroke="currentColor" opacity="0.15" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2} opacity="0.55" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={2} fill="currentColor" opacity="0.6" />
          ))}
        </svg>
        <div className="mt-2 text-xs text-gray-500">Net trend</div>
      </div>
    </div>
  )
}

function groupSeries(points: { date: string; income: number; expenses: number; net: number }[], g: Granularity) {
  if (g === 'daily') return points

  const keyOf = (d: Date) => {
    if (g === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    // weekly: ISO-ish week bucket (Mon start)
    const dd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = dd.getUTCDay() || 7
    dd.setUTCDate(dd.getUTCDate() - day + 1)
    return `${dd.getUTCFullYear()}-W${String(getISOWeek(dd)).padStart(2, '0')}`
  }

  const map = new Map<string, { label: string; income: number; expenses: number; net: number }>()
  for (const p of points) {
    const d = new Date(p.date + 'T00:00:00Z')
    const k = keyOf(d)
    const cur = map.get(k) ?? { label: k, income: 0, expenses: 0, net: 0 }
    cur.income += p.income
    cur.expenses += p.expenses
    cur.net += p.net
    map.set(k, cur)
  }

  return Array.from(map.values()).sort((a, b) => (a.label < b.label ? -1 : 1))
}

function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// -----------------------------
// Page
// -----------------------------
export default function FinancePage() {
  const currency: 'EUR' | 'USD' = 'EUR'

  const [tab, setTab] = useState<TabKey>('overview')
  const [granularity, setGranularity] = useState<Granularity>('monthly')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [summary, setSummary] = useState<ClubFinanceSummary | null>(null)

  // daily series (from RPC, last 90 days)
  const [cashflowDaily, setCashflowDaily] = useState<CashflowPoint[]>([])

  // transactions
  const [statement, setStatement] = useState<StatementRow[]>([])
  const [statementBefore, setStatementBefore] = useState<string | null>(null)
  const [statementLoaded, setStatementLoaded] = useState(false)
  const [loadingMoreTx, setLoadingMoreTx] = useState(false)

  // sponsors
  const [sponsorsLoaded, setSponsorsLoaded] = useState(false)
  const [mainSponsor, setMainSponsor] = useState<SponsorRow | null>(null)

  async function loadBase() {
    setLoading(true)
    setError(null)

    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
      }

      const clubRes = await supabase.rpc('get_my_club_id')
      if (clubRes.error) throw clubRes.error
      const myClubId = clubRes.data as string | null
      setClubId(myClubId)

      if (!myClubId) {
        setSummary(null)
        setCashflowDaily([])
        setStatement([])
        setMainSponsor(null)
        setLoading(false)
        return
      }

      const summaryRes = await supabase
        .from('club_finance_summary')
        .select('*')
        .eq('club_id', myClubId)
        .single()
      if (summaryRes.error) throw summaryRes.error
      setSummary(summaryRes.data as ClubFinanceSummary)

      const cashflowRes = await supabase.rpc('finance_get_club_cashflow_series', {
        p_club_id: myClubId,
        p_days: 90,
      })
      if (cashflowRes.error) throw cashflowRes.error
      setCashflowDaily((cashflowRes.data ?? []) as CashflowPoint[])

      // if club changes, refresh tab-loaded caches
      setStatementLoaded(false)
      setSponsorsLoaded(false)

      setLoading(false)
    } catch (e: any) {
      setLoading(false)
      setError(e?.message ?? 'Failed to load finance data.')
    }
  }

  async function loadTransactions() {
    if (!clubId || statementLoaded) return
    try {
      const res = await supabase.rpc('finance_get_club_statement', {
        p_club_id: clubId,
        p_limit: 200,
        p_before: null,
      })
      if (res.error) throw res.error
      const rows = (res.data ?? []) as StatementRow[]
      setStatement(rows)
      setStatementBefore(rows.length ? rows[rows.length - 1].created_at : null)
      setStatementLoaded(true)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load transactions.')
    }
  }

  async function loadMoreTransactions() {
    if (!clubId || !statementBefore) return
    setLoadingMoreTx(true)
    try {
      const res = await supabase.rpc('finance_get_club_statement', {
        p_club_id: clubId,
        p_limit: 200,
        p_before: statementBefore,
      })
      if (res.error) throw res.error
      const rows = (res.data ?? []) as StatementRow[]
      if (rows.length) {
        setStatement((prev) => [...prev, ...rows])
        setStatementBefore(rows[rows.length - 1].created_at)
      } else {
        setStatementBefore(null)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load more transactions.')
    } finally {
      setLoadingMoreTx(false)
    }
  }

  async function loadSponsors() {
    if (!clubId || sponsorsLoaded) return

    try {
      const res = await supabase
        .from('club_sponsors')
        .select('id,club_id,name,monthly_amount,status,is_main,started_at,ends_at,created_at')
        .eq('club_id', clubId)
        .eq('is_main', true)
        .order('created_at', { ascending: false })
        .limit(1)

      if (res.error) {
        // If the table doesn't exist yet (PGRST205), do NOT show a scary error.
        const code = (res.error as any).code
        const msg = (res.error as any).message ?? ''
        if (code === 'PGRST205' || msg.includes('Could not find the table') || msg.includes('schema cache')) {
          setMainSponsor(null)
          setSponsorsLoaded(true)
          return
        }
        throw res.error
      }

      setMainSponsor((res.data?.[0] as SponsorRow) ?? null)
      setSponsorsLoaded(true)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sponsors.')
    }
  }

  useEffect(() => {
    void loadBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab === 'transactions') void loadTransactions()
    if (tab === 'sponsors') void loadSponsors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clubId])

  const dailyPoints = useMemo(() => {
    return cashflowDaily
      .slice()
      .sort((a, b) => (a.bucket_date < b.bucket_date ? -1 : 1))
      .map((p) => ({
        date: p.bucket_date,
        income: toNumber(p.income),
        expenses: toNumber(p.expenses),
        net: toNumber(p.net),
      }))
  }, [cashflowDaily])

  const series = useMemo(() => groupSeries(dailyPoints, granularity), [dailyPoints, granularity])

  const totals30 = useMemo(() => {
    const last30 = dailyPoints.slice(-30)
    const income = last30.reduce((s, p) => s + p.income, 0)
    const expenses = last30.reduce((s, p) => s + p.expenses, 0)
    const net = last30.reduce((s, p) => s + p.net, 0)
    return { income, expenses, net }
  }, [dailyPoints])

  const sponsorMonthly = useMemo(() => {
    if (!mainSponsor || mainSponsor.status !== 'active') return 0
    return toNumber(mainSponsor.monthly_amount)
  }, [mainSponsor])

  const currentBalance = summary ? toNumber(summary.current_balance) : 0

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Finance</h2>
          <div className="text-sm text-gray-500 mt-1">
            {clubId ? (
              <span>
                Club: <span className="font-mono text-xs">{clubId}</span>
              </span>
            ) : (
              <span>You are not linked to a club.</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadBase()}
          className="px-3 py-2 rounded bg-white shadow text-sm hover:bg-gray-100"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
        <TabButton active={tab === 'sponsors'} onClick={() => setTab('sponsors')}>Sponsors</TabButton>
        <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>Transactions</TabButton>
        <TabButton active={tab === 'tax'} onClick={() => setTab('tax')}>Tax</TabButton>
        <TabButton active={tab === 'other'} onClick={() => setTab('other')}>Other</TabButton>
      </div>

      {/* State */}
      {loading && (
        <div className="bg-white p-4 rounded shadow text-sm text-gray-600">Loading…</div>
      )}

      {!loading && error && (
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm font-semibold text-red-600">Error</div>
          <div className="text-sm text-gray-700 mt-1">{error}</div>
        </div>
      )}

      {!loading && !error && !clubId && (
        <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
          Create or join a club to see finance data.
        </div>
      )}

      {/* OVERVIEW */}
      {!loading && !error && clubId && tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            <StatCard
              label="Current Balance"
              value={formatMoney(currentBalance, currency)}
              sub={summary?.updated_at ? `Updated: ${formatDateTime(summary.updated_at)}` : undefined}
            />
            <StatCard
              label="Income (last 30 days)"
              value={formatMoney(totals30.income, currency)}
              sub={`Sponsors / month: ${formatMoney(sponsorMonthly, currency)}`}
            />
            <StatCard
              label="Expenses (last 30 days)"
              value={formatMoney(totals30.expenses, currency)}
              sub={`Net: ${formatMoney(totals30.net, currency)}`}
            />
          </div>

          <div className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">Breakdown</div>
                <div className="text-sm text-gray-500">Choose aggregation for graphs.</div>
              </div>

              <div className="flex gap-2">
                <button
                  className={`px-3 py-2 rounded text-sm shadow ${granularity === 'daily' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
                  onClick={() => setGranularity('daily')}
                  type="button"
                >
                  Daily
                </button>
                <button
                  className={`px-3 py-2 rounded text-sm shadow ${granularity === 'weekly' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
                  onClick={() => setGranularity('weekly')}
                  type="button"
                >
                  Weekly
                </button>
                <button
                  className={`px-3 py-2 rounded text-sm shadow ${granularity === 'monthly' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
                  onClick={() => setGranularity('monthly')}
                  type="button"
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded shadow">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Income</div>
                <div className="text-xs text-gray-500">last {series.length} periods</div>
              </div>
              <div className="mt-3 text-gray-900">
                <MiniBars points={series.map((p) => ({ label: p.label, income: p.income, expenses: 0 }))} />
              </div>
            </div>

            <div className="bg-white p-4 rounded shadow">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Expenses</div>
                <div className="text-xs text-gray-500">last {series.length} periods</div>
              </div>
              <div className="mt-3 text-gray-900">
                <MiniBars points={series.map((p) => ({ label: p.label, income: 0, expenses: p.expenses }))} />
              </div>
            </div>

            <div className="bg-white p-4 rounded shadow lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Net (Income - Expenses)</div>
                <div className="text-xs text-gray-500">trend</div>
              </div>
              <div className="mt-3 text-gray-900">
                <MiniLine points={series.map((p) => ({ label: p.label, value: p.net }))} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SPONSORS */}
      {!loading && !error && clubId && tab === 'sponsors' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded shadow">
            <h4 className="font-semibold">Main Sponsor</h4>
            <div className="text-sm text-gray-500 mt-1">For now, only one main sponsor is shown here.</div>

            <div className="mt-4">
              {mainSponsor ? (
                <div className="border rounded p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{mainSponsor.name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Status: <span className="font-semibold">{mainSponsor.status}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Monthly:{' '}
                        <span className="font-semibold">
                          {formatMoney(toNumber(mainSponsor.monthly_amount), currency)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {mainSponsor.started_at ? `Start: ${mainSponsor.started_at}` : ''}
                        {mainSponsor.ends_at ? ` · End: ${mainSponsor.ends_at}` : ''}
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      <div className="font-mono">{mainSponsor.id}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  No main sponsor yet. (Create the <code>club_sponsors</code> table later or add a sponsor manually.)
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTIONS */}
      {!loading && !error && clubId && tab === 'transactions' && (
        <div className="bg-white rounded shadow overflow-hidden">
          <div className="p-4 border-b">
            <h4 className="font-semibold">Transactions</h4>
            <div className="text-sm text-gray-500 mt-1">Ledger-backed statement for your club wallet.</div>
          </div>

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
                {statement.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-600">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  statement.map((r) => {
                    const amt = toNumber(r.net_amount)
                    const positive = amt >= 0
                    return (
                      <tr key={r.transaction_id} className="border-t">
                        <td className="p-3 text-gray-700 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="p-3 font-medium">{r.type}</td>
                        <td className={`p-3 font-semibold whitespace-nowrap ${positive ? 'text-green-700' : 'text-red-700'}`}>
                          {formatMoney(amt, currency)}
                        </td>
                        <td className="p-3 font-mono text-xs text-gray-700">{r.transaction_id}</td>
                        <td className="p-3 text-xs text-gray-600">
                          {r.metadata ? (
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(r.metadata, null, 2)}</pre>
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
            <div className="text-xs text-gray-600">Showing {statement.length} items.</div>
            <button
              type="button"
              onClick={() => void loadMoreTransactions()}
              disabled={loadingMoreTx || !statementBefore}
              className={[
                'px-3 py-2 rounded text-sm shadow',
                loadingMoreTx || !statementBefore ? 'bg-gray-200 text-gray-500' : 'bg-white hover:bg-gray-100',
              ].join(' ')}
            >
              {statementBefore ? (loadingMoreTx ? 'Loading…' : 'Load more') : 'No more'}
            </button>
          </div>
        </div>
      )}

      {/* TAX */}
      {!loading && !error && clubId && tab === 'tax' && (
        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Tax</h4>
          <div className="mt-2 text-sm text-gray-600">Placeholder (no DB calls yet).</div>
        </div>
      )}

      {/* OTHER */}
      {!loading && !error && clubId && tab === 'other' && (
        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Other</h4>
          <div className="mt-2 text-sm text-gray-600">Placeholder.</div>

          <div className="mt-4 text-xs text-gray-500">
            <div>Club ID: <span className="font-mono">{clubId}</span></div>
            <div>Summary updated: {summary?.updated_at ? formatDateTime(summary.updated_at) : '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}