/**
 * OverviewTab.tsx
 *
 * Updates:
 * - Top 5 incomes / Top 5 costs now show REAL transaction names (not “Cost item 1”).
 *   ✅ If you pass `transactions`, this component will compute top 5 income/expense transactions
 *      for the selected period (daily/weekly/monthly) and use their names in the donut legends.
 *   ✅ If you already pass `topIncomeBreakdown` / `topExpenseBreakdown`, those still win.
 *   - If neither is provided, it falls back to placeholders (as before).
 *
 * Notes:
 * - This file cannot “read the transactions table” by itself without your DB/client code.
 *   So the intended wiring is: wherever you load your Transactions table data, pass it
 *   into this component via the new `transactions` prop.
 */

import React, { useMemo, useState } from 'react'
import { Donut } from './charts'

type Granularity = 'daily' | 'weekly' | 'monthly'

type ClubFinanceSummary = {
  current_balance: string | number
  updated_at: string
}

type CashflowPoint = {
  bucket_date: string
  income: string | number
  expenses: string | number
  net: string | number
}

/**
 * BreakdownItem
 * Pass real names here (transaction name, vendor, category, etc.)
 */
type BreakdownItem = {
  name?: string
  label?: string
  amount: string | number
}

/**
 * Transaction (NEW)
 * Pass your transaction rows here so we can show real names in Top 5 costs/incomes.
 *
 * Supported fields (use whatever you have; component will pick best label/date):
 * - date fields: occurred_at | created_at | date
 * - label fields: name | title | description | memo | category
 * - kind fields: direction | type (income/expense); otherwise inferred from amount sign
 */
type Transaction = {
  id?: string | number
  occurred_at?: string
  created_at?: string
  date?: string
  name?: string
  title?: string
  description?: string
  memo?: string
  category?: string
  direction?: 'income' | 'expense'
  type?: 'income' | 'expense'
  amount: string | number
}

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

function formatMoneyCompact(n: number, currency: 'USD' | 'EUR' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function groupSeries(
  points: { date: string; income: number; expenses: number; net: number }[],
  g: Granularity
): { label: string; income: number; expenses: number; net: number }[] {
  if (g === 'daily') return points.map((p) => ({ label: p.date, ...p }))

  const keyOf = (d: Date): string => {
    if (g === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const dd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = dd.getUTCDay() || 7
    dd.setUTCDate(dd.getUTCDate() - day + 1)
    return `${dd.getUTCFullYear()}-W${String(getISOWeek(dd)).padStart(2, '0')}`
  }

  const map = new Map<string, { label: string; income: number; expenses: number; net: number }>()
  for (const p of points) {
    const d = new Date(`${p.date}T00:00:00Z`)
    const k = keyOf(d)
    const cur = map.get(k) ?? { label: k, income: 0, expenses: 0, net: 0 }
    cur.income += p.income
    cur.expenses += p.expenses
    cur.net += p.net
    map.set(k, cur)
  }

  return Array.from(map.values()).sort((a, b) => (a.label < b.label ? -1 : 1))
}

function normalizeBreakdown(items: { label: string; value: number }[], take = 5) {
  return items
    .map((x) => ({ label: x.label, value: toNumber(x.value) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, take)
}

function prettyTimeLabel(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(5) // YYYY-MM-DD -> MM-DD
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw.slice(5)}/${raw.slice(2, 4)}` // YYYY-MM -> MM/YY
  if (/^\d{4}-W\d{2}$/.test(raw)) return raw.slice(5) // YYYY-Wxx -> Wxx
  return raw
}

function parseTxDate(t: Transaction): Date | null {
  const raw = t.occurred_at ?? t.date ?? t.created_at
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function txKind(t: Transaction): 'income' | 'expense' {
  if (t.direction === 'income' || t.direction === 'expense') return t.direction
  if (t.type === 'income' || t.type === 'expense') return t.type
  const a = toNumber(t.amount)
  return a < 0 ? 'expense' : 'income'
}

function txAmountAbs(t: Transaction): number {
  return Math.abs(toNumber(t.amount))
}

function txLabel(t: Transaction): string {
  const s =
    t.name ??
    t.title ??
    t.description ??
    t.memo ??
    t.category ??
    (t.id !== undefined ? `Transaction ${String(t.id)}` : 'Transaction')
  return String(s).trim() || 'Transaction'
}

/**
 * AxisBarChart
 * Simple SVG bars with axes + hover tooltip (via <title>).
 */
function AxisBarChart({
  title,
  points,
  currency,
  barColor,
  yTickCount = 3,
}: {
  title: string
  points: { label: string; value: number }[]
  currency: 'USD' | 'EUR'
  barColor: string
  yTickCount?: number
}): JSX.Element {
  const W = 640
  const H = 220
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 42

  const maxVal = Math.max(0, ...points.map((p) => p.value))
  const yMax = maxVal <= 0 ? 1 : maxVal * 1.15

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const n = points.length || 1
  const gap = Math.min(14, innerW / (n * 6))
  const barW = Math.max(10, (innerW - gap * (n - 1)) / n)

  const yOf = (v: number) => padT + innerH - (v / yMax) * innerH

  const ticks = Array.from({ length: yTickCount }, (_, i) => i).map((i) => {
    if (yTickCount === 1) return 0
    return (yMax * i) / (yTickCount - 1)
  })

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={title}>
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#d1d5db" strokeWidth={1} />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {ticks.map((t, i) => {
          const y = yOf(t)
          return (
            <g key={`yt-${i}`}>
              <line x1={padL - 6} y1={y} x2={padL} y2={y} stroke="#d1d5db" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} fontSize={11} fill="#6b7280" textAnchor="end">
                {formatMoneyCompact(t, currency)}
              </text>
            </g>
          )
        })}

        {points.map((p, i) => {
          const x = padL + i * (barW + gap)
          const y = yOf(p.value)
          const h = padT + innerH - y
          return (
            <g key={`${p.label}-${i}`}>
              <rect x={x} y={y} width={barW} height={h} rx={4} fill={barColor}>
                <title>
                  {p.label}: {formatMoney(p.value, currency)}
                </title>
              </rect>

              <text
                x={x + barW / 2}
                y={padT + innerH + 24}
                fontSize={11}
                fill="#6b7280"
                textAnchor="middle"
              >
                {prettyTimeLabel(p.label)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="text-xs text-gray-500 -mt-2">Hover a bar to see details.</div>
    </div>
  )
}

/**
 * AxisLineChart
 * Simple SVG line with axes + hover tooltips on points.
 */
function AxisLineChart({
  title,
  points,
  currency,
  strokeColor,
  yTickCount = 3,
}: {
  title: string
  points: { label: string; value: number }[]
  currency: 'USD' | 'EUR'
  strokeColor: string
  yTickCount?: number
}): JSX.Element {
  const W = 960
  const H = 240
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 42

  const maxVal = Math.max(...points.map((p) => p.value), 0)
  const minVal = Math.min(...points.map((p) => p.value), 0)
  const span = maxVal - minVal
  const yMin = minVal - span * 0.1
  const yMax = maxVal + span * 0.15 || 1

  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = points.length || 1

  const xOf = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yOf = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const ticks = Array.from({ length: yTickCount }, (_, i) => i).map((i) => {
    if (yTickCount === 1) return yMin
    return yMin + ((yMax - yMin) * i) / (yTickCount - 1)
  })

  const d =
    points.length === 0
      ? ''
      : points
          .map((p, i) => {
            const x = xOf(i)
            const y = yOf(p.value)
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          })
          .join(' ')

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={title}>
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#d1d5db" strokeWidth={1} />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {ticks.map((t, i) => {
          const y = yOf(t)
          return (
            <g key={`lyt-${i}`}>
              <line x1={padL - 6} y1={y} x2={padL} y2={y} stroke="#d1d5db" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} fontSize={11} fill="#6b7280" textAnchor="end">
                {formatMoneyCompact(t, currency)}
              </text>
            </g>
          )
        })}

        {d ? <path d={d} fill="none" stroke={strokeColor} strokeWidth={3} /> : null}

        {points.map((p, i) => {
          const x = xOf(i)
          const y = yOf(p.value)
          return (
            <g key={`${p.label}-${i}`}>
              <circle cx={x} cy={y} r={5} fill={strokeColor}>
                <title>
                  {p.label}: {formatMoney(p.value, currency)}
                </title>
              </circle>

              <text x={x} y={padT + innerH + 24} fontSize={11} fill="#6b7280" textAnchor="middle">
                {prettyTimeLabel(p.label)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="text-xs text-gray-500 -mt-2">Hover a dot to see details.</div>
    </div>
  )
}

/**
 * DonutBreakdown (donut + legend on the side)
 */
function DonutBreakdown({
  title,
  subtitle,
  items,
  currency,
  palette,
  emptyLabel = 'No data',
}: {
  title: string
  subtitle?: string
  items: { label: string; value: number }[]
  currency: 'USD' | 'EUR'
  palette: string[]
  emptyLabel?: string
}): JSX.Element {
  const cleaned = useMemo(() => normalizeBreakdown(items, 5), [items])
  const total = useMemo(() => cleaned.reduce((s, x) => s + x.value, 0), [cleaned])

  const r = 44
  const c = 2 * Math.PI * r
  let offsetAcc = 0

  return (
    <div className="h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-6 items-center">
        <div className="relative w-[160px] h-[160px]">
          <svg viewBox="0 0 120 120" className="w-full h-full" role="img" aria-label={title}>
            <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
            {total > 0
              ? cleaned.map((seg, i) => {
                  const len = (seg.value / total) * c
                  const dashArray = `${len} ${c - len}`
                  const dashOffset = -offsetAcc
                  offsetAcc += len
                  return (
                    <circle
                      key={`${seg.label}-${i}`}
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke={palette[i % palette.length]}
                      strokeWidth="12"
                      strokeLinecap="butt"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 60 60)"
                    >
                      <title>
                        {seg.label}: {formatMoney(seg.value, currency)}
                      </title>
                    </circle>
                  )
                })
              : null}
          </svg>

          <div className="absolute inset-0 flex items-center justify-center text-center px-3">
            {total > 0 ? (
              <div>
                <div className="text-xs text-gray-500">Total</div>
                <div className="font-semibold">{formatMoney(total, currency)}</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">{emptyLabel}</div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {cleaned.length === 0 ? (
            <div className="text-sm text-gray-500">No items to show.</div>
          ) : (
            <div className="space-y-2">
              {cleaned.map((seg, i) => (
                <div key={`${seg.label}-legend-${i}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: palette[i % palette.length] }}
                      aria-hidden="true"
                    />
                    <span className="text-sm text-gray-700 truncate">{seg.label}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{formatMoney(seg.value, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function OverviewTab({
  summary,
  cashflowDaily,
  sponsorMonthly = 0,
  currency = 'USD',
  topIncomeBreakdown,
  topExpenseBreakdown,
  transactions, // NEW
}: {
  summary: ClubFinanceSummary | null
  cashflowDaily: CashflowPoint[]
  sponsorMonthly?: number
  currency?: 'USD' | 'EUR'
  topIncomeBreakdown?: BreakdownItem[]
  topExpenseBreakdown?: BreakdownItem[]
  transactions?: Transaction[] // NEW
}): JSX.Element {
  const [granularity, setGranularity] = useState<Granularity>('monthly')

  const dailyPoints = useMemo(
    () =>
      cashflowDaily
        .slice()
        .sort((a, b) => (a.bucket_date < b.bucket_date ? -1 : 1))
        .map((p) => ({
          date: p.bucket_date,
          income: toNumber(p.income),
          expenses: toNumber(p.expenses),
          net: toNumber(p.net),
        })),
    [cashflowDaily]
  )

  const grouped = useMemo(() => groupSeries(dailyPoints, granularity), [dailyPoints, granularity])

  const periodWindow = useMemo(() => {
    if (granularity === 'daily') return dailyPoints.slice(-1)
    if (granularity === 'weekly') return dailyPoints.slice(-7)
    return dailyPoints.slice(-30)
  }, [dailyPoints, granularity])

  const periodTotals = useMemo(() => {
    if (granularity === 'daily') {
      const last = dailyPoints[dailyPoints.length - 1]
      return { income: last?.income ?? 0, expenses: last?.expenses ?? 0, net: last?.net ?? 0, label: 'Today' }
    }
    if (granularity === 'weekly') {
      const last7 = dailyPoints.slice(-7)
      return {
        income: last7.reduce((s, p) => s + p.income, 0),
        expenses: last7.reduce((s, p) => s + p.expenses, 0),
        net: last7.reduce((s, p) => s + p.net, 0),
        label: 'This week',
      }
    }
    const last30 = dailyPoints.slice(-30)
    return {
      income: last30.reduce((s, p) => s + p.income, 0),
      expenses: last30.reduce((s, p) => s + p.expenses, 0),
      net: last30.reduce((s, p) => s + p.net, 0),
      label: 'This month',
    }
  }, [dailyPoints, granularity])

  const currentBalance = summary ? toNumber(summary.current_balance) : 0

  /**
   * Period boundaries (for filtering transactions)
   * We mirror the same “last 1 / last 7 / last 30” approach used above.
   */
  const periodBounds = useMemo(() => {
    const lastDateStr = dailyPoints[dailyPoints.length - 1]?.date
    const end = lastDateStr ? new Date(`${lastDateStr}T23:59:59Z`) : new Date()
    const start = new Date(end)

    if (granularity === 'weekly') start.setUTCDate(start.getUTCDate() - 6)
    else if (granularity === 'monthly') start.setUTCDate(start.getUTCDate() - 29)
    // daily -> same day

    start.setUTCHours(0, 0, 0, 0)
    return { start, end }
  }, [dailyPoints, granularity])

  const topFromTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return { incomes: [] as { label: string; value: number }[], expenses: [] as { label: string; value: number }[] }

    const { start, end } = periodBounds

    const inPeriod = transactions.filter((t) => {
      const d = parseTxDate(t)
      if (!d) return false
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
    })

    const incomes = inPeriod
      .filter((t) => txKind(t) === 'income')
      .map((t) => ({ label: txLabel(t), value: txAmountAbs(t) }))
    const expenses = inPeriod
      .filter((t) => txKind(t) === 'expense')
      .map((t) => ({ label: txLabel(t), value: txAmountAbs(t) }))

    return {
      incomes: normalizeBreakdown(incomes, 5),
      expenses: normalizeBreakdown(expenses, 5),
    }
  }, [transactions, periodBounds])

  /**
   * Top 5 incomes:
   * 1) If topIncomeBreakdown provided -> use it (names should already be correct).
   * 2) Else if transactions provided -> compute from transactions (REAL names).
   * 3) Else fallback placeholders.
   */
  const topIncomeItems = useMemo(() => {
    if (topIncomeBreakdown && topIncomeBreakdown.length > 0) {
      return normalizeBreakdown(
        topIncomeBreakdown.map((x) => ({
          label: (x.name ?? x.label ?? 'Income').trim(),
          value: toNumber(x.amount),
        })),
        5
      )
    }

    if (topFromTransactions.incomes.length > 0) return topFromTransactions.incomes

    // fallback placeholder values
    const sorted = periodWindow
      .map((p) => ({ value: p.income }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return sorted.map((x, idx) => ({ label: `Income item ${idx + 1}`, value: x.value }))
  }, [topIncomeBreakdown, topFromTransactions.incomes, periodWindow])

  /**
   * Top 5 costs:
   * 1) If topExpenseBreakdown provided -> use it
   * 2) Else if transactions provided -> compute from transactions (REAL names)
   * 3) Else fallback placeholders
   */
  const topExpenseItems = useMemo(() => {
    if (topExpenseBreakdown && topExpenseBreakdown.length > 0) {
      return normalizeBreakdown(
        topExpenseBreakdown.map((x) => ({
          label: (x.name ?? x.label ?? 'Cost').trim(),
          value: Math.abs(toNumber(x.amount)),
        })),
        5
      )
    }

    if (topFromTransactions.expenses.length > 0) return topFromTransactions.expenses

    const sorted = periodWindow
      .map((p) => ({ value: p.expenses }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return sorted.map((x, idx) => ({ label: `Cost item ${idx + 1}`, value: x.value }))
  }, [topExpenseBreakdown, topFromTransactions.expenses, periodWindow])

  const incomePalette = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0']
  const expensePalette = ['#dc2626', '#ef4444', '#f97316', '#fb7185', '#fca5a5']

  return (
    <div className="space-y-4">
      {/* top cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Current Balance</div>
          <div className="text-2xl font-bold mt-2">{formatMoney(currentBalance, currency)}</div>
          <div className="text-xs text-gray-500 mt-1">
            {summary?.updated_at ? `Updated: ${formatDateTime(summary.updated_at)}` : ''}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Income ({periodTotals.label})</div>
          <div className="text-2xl font-bold mt-2">{formatMoney(periodTotals.income, currency)}</div>
          <div className="text-xs text-gray-500 mt-1">Sponsors / month: {formatMoney(sponsorMonthly, currency)}</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Expenses ({periodTotals.label})</div>
          <div className="text-2xl font-bold mt-2">{formatMoney(periodTotals.expenses, currency)}</div>
          <div className="text-xs text-gray-500 mt-1">Net: {formatMoney(periodTotals.net, currency)}</div>
        </div>
      </div>

      {/* breakdown selector */}
      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">Breakdown</div>
            <div className="text-sm text-gray-500">Choose aggregation for graphs.</div>
          </div>

          <div className="flex gap-2">
            <button
              className={`px-3 py-2 rounded text-sm shadow ${
                granularity === 'daily' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'
              }`}
              onClick={() => setGranularity('daily')}
              type="button"
            >
              Daily
            </button>
            <button
              className={`px-3 py-2 rounded text-sm shadow ${
                granularity === 'weekly' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'
              }`}
              onClick={() => setGranularity('weekly')}
              type="button"
            >
              Weekly
            </button>
            <button
              className={`px-3 py-2 rounded text-sm shadow ${
                granularity === 'monthly' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'
              }`}
              onClick={() => setGranularity('monthly')}
              type="button"
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* donut row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="bg-white p-5 rounded shadow h-full">
          <DonutBreakdown
            title="Top 5 incomes"
            subtitle={`Top income sources (${periodTotals.label})`}
            items={topIncomeItems}
            currency={currency}
            palette={incomePalette}
            emptyLabel="No income yet"
          />
        </div>

        <div className="bg-white p-5 rounded shadow h-full">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Income vs Expenses ({periodTotals.label})</div>
              <div className="text-sm text-gray-500">Donut chart of the selected period.</div>
            </div>
          </div>
          <div className="mt-4">
            <Donut income={periodTotals.income} expenses={periodTotals.expenses} />
          </div>
        </div>

        <div className="bg-white p-5 rounded shadow h-full">
          <DonutBreakdown
            title="Top 5 costs"
            subtitle={`Top expense items (${periodTotals.label})`}
            items={topExpenseItems}
            currency={currency}
            palette={expensePalette}
            emptyLabel="No expenses yet"
          />
        </div>
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Income</div>
            <div className="text-xs text-gray-500">last {grouped.length} periods</div>
          </div>
          <div className="mt-3">
            <AxisBarChart
              title="Income"
              points={grouped.map((p) => ({ label: p.label, value: p.income }))}
              currency={currency}
              barColor="#16a34a"
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Expenses</div>
            <div className="text-xs text-gray-500">last {grouped.length} periods</div>
          </div>
          <div className="mt-3">
            <AxisBarChart
              title="Expenses"
              points={grouped.map((p) => ({ label: p.label, value: p.expenses }))}
              currency={currency}
              barColor="#dc2626"
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Net (Income - Expenses)</div>
            <div className="text-xs text-gray-500">trend</div>
          </div>
          <div className="mt-3">
            <AxisLineChart
              title="Net trend"
              points={grouped.map((p) => ({ label: p.label, value: p.net }))}
              currency={currency}
              strokeColor="#2563eb"
            />
          </div>
        </div>
      </div>
    </div>
  )
}