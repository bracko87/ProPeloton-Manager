/**
 * OverviewTab.tsx
 *
 * Updates:
 * - Top 5 incomes / Top 5 costs now show REAL transaction names.
 * - Donut legends now show SHORT labels.
 * - Emergency loan debt movement is separated from operating income/expenses:
 *   - emergency_loan_disbursement does NOT count as income.
 *   - emergency_loan_principal_repayment does NOT count as operating expense.
 *   - emergency_loan_interest DOES count as operating expense.
 * - Transactions tab remains unchanged; this is only Overview classification logic.
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
 * Pass real names here.
 *
 * Optional type allows debt filtering if parent already pre-computes breakdowns.
 */
type BreakdownItem = {
  name?: string
  label?: string
  type?: string
  amount: string | number
}

/**
 * Transaction
 *
 * Supports both:
 * - old generic amount rows
 * - finance_get_club_statement rows with net_amount
 */
type Transaction = {
  id?: string | number
  transaction_id?: string
  occurred_at?: string
  created_at?: string
  date?: string
  name?: string
  title?: string
  description?: string
  memo?: string
  category?: string
  direction?: 'income' | 'expense'
  type?: string
  amount?: string | number
  net_amount?: string | number
}

const DEBT_CASH_INFLOW_TYPES = new Set(['emergency_loan_disbursement'])

const DEBT_PRINCIPAL_REPAYMENT_TYPES = new Set(['emergency_loan_principal_repayment'])

const REAL_DEBT_EXPENSE_TYPES = new Set(['emergency_loan_interest'])

const shortTransactionLabels: Record<string, string> = {
  emergency_loan_disbursement: 'Loan',
  emergency_loan_principal_repayment: 'Principal',
  emergency_loan_interest: 'Interest',
  rider_salary_payday: 'Salary',
  staff_salary_payday: 'Staff',
  sponsor_contract_payment: 'Sponsor',
  tax_withholding: 'Tax',
  tax_monthly_adjustment: 'Tax',
  tax_monthly_refund: 'Tax Refund',
  new_club_bonus: 'Bonus',
}

function normalizeType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase()
}

function isDebtCashInflow(type: string): boolean {
  return DEBT_CASH_INFLOW_TYPES.has(normalizeType(type))
}

function isDebtPrincipalRepayment(type: string): boolean {
  return DEBT_PRINCIPAL_REPAYMENT_TYPES.has(normalizeType(type))
}

function isRealDebtExpense(type: string): boolean {
  return REAL_DEBT_EXPENSE_TYPES.has(normalizeType(type))
}

function shouldCountAsOperatingIncome(type: string, amount: number): boolean {
  if (isDebtCashInflow(type)) return false
  return amount > 0
}

function shouldCountAsOperatingExpense(type: string, amount: number): boolean {
  if (isDebtPrincipalRepayment(type)) return false
  return amount < 0
}

function shouldShowInTopIncome(type: string, amount: number): boolean {
  return shouldCountAsOperatingIncome(type, amount)
}

function shouldShowInTopCost(type: string, amount: number): boolean {
  return shouldCountAsOperatingExpense(type, amount)
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

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function groupSeries(
  points: { date: string; income: number; expenses: number; net: number }[],
  g: Granularity
): { label: string; income: number; expenses: number; net: number }[] {
  if (g === 'daily') return points.map(p => ({ label: p.date, ...p }))

  const keyOf = (d: Date): string => {
    if (g === 'monthly') {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    }

    const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
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
    .map(x => ({ label: x.label, value: toNumber(x.value) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, take)
}

function aggregateBreakdown(
  items: { label: string; value: number; type?: string }[],
  mapLabel: (label: string, type?: string) => string,
  take = 5
) {
  const map = new Map<string, number>()

  for (const item of items) {
    const value = toNumber(item.value)
    if (value <= 0) continue

    const label = mapLabel(item.label, item.type).trim() || 'Other'
    map.set(label, (map.get(label) ?? 0) + value)
  }

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, take)
}

function prettyTimeLabel(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(5)
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw.slice(5)}/${raw.slice(2, 4)}`
  if (/^\d{4}-W\d{2}$/.test(raw)) return raw.slice(5)
  return raw
}

function parseTxDate(t: Transaction): Date | null {
  const raw = t.occurred_at ?? t.date ?? t.created_at
  if (!raw) return null

  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function txType(t: Transaction): string {
  return normalizeType(t.type)
}

function txSignedAmount(t: Transaction): number {
  const hasNetAmount = t.net_amount !== null && t.net_amount !== undefined
  const n = toNumber(hasNetAmount ? t.net_amount : t.amount)

  /**
   * finance_get_club_statement rows should use net_amount:
   * - income positive
   * - expense negative
   *
   * This fallback keeps older generic rows working if they passed:
   * { direction: 'expense', amount: 5000 }
   */
  if (!hasNetAmount && t.direction === 'expense' && n > 0) return -n
  if (!hasNetAmount && t.direction === 'income' && n < 0) return Math.abs(n)

  return n
}

function txAmountAbs(t: Transaction): number {
  return Math.abs(txSignedAmount(t))
}

function txLabel(t: Transaction): string {
  const s =
    t.name ??
    t.title ??
    t.description ??
    t.memo ??
    t.category ??
    t.type ??
    t.transaction_id ??
    (t.id !== undefined ? `Transaction ${String(t.id)}` : 'Transaction')

  return String(s).trim() || 'Transaction'
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

function formatTransactionShortLabel(raw: string, type?: string): string {
  const normalizedType = normalizeType(type)

  if (normalizedType && shortTransactionLabels[normalizedType]) {
    return shortTransactionLabels[normalizedType]
  }

  const cleaned = stripTrailingCode(raw).replace(/[_-]+/g, ' ').toLowerCase().trim()

  if (shortTransactionLabels[cleaned]) {
    return shortTransactionLabels[cleaned]
  }

  if (cleaned.includes('loan') && cleaned.includes('interest')) {
    return 'Interest'
  }

  if (cleaned.includes('loan') && cleaned.includes('principal')) {
    return 'Principal'
  }

  if (cleaned.includes('emergency loan') || cleaned === 'loan') {
    return 'Loan'
  }

  if (
    cleaned.includes('sponsor') ||
    cleaned.includes('partnership') ||
    cleaned.includes('advertising')
  ) {
    return 'Sponsor'
  }

  if (cleaned.includes('tax') || cleaned.includes('vat')) {
    return 'Tax'
  }

  if (cleaned.includes('salary') || cleaned.includes('wage') || cleaned.includes('payroll')) {
    return 'Salary'
  }

  if (cleaned.includes('bonus')) {
    return 'Bonus'
  }

  if (cleaned.includes('training')) {
    return 'Training'
  }

  if (cleaned.includes('transfer')) {
    return 'Transfer'
  }

  if (cleaned.includes('equipment')) {
    return 'Equipment'
  }

  if (cleaned.includes('staff')) {
    return 'Staff'
  }

  if (cleaned.includes('medical')) {
    return 'Medical'
  }

  if (cleaned.includes('travel') || cleaned.includes('hotel') || cleaned.includes('transport')) {
    return 'Travel'
  }

  const first = cleaned.split(' ').find(Boolean)
  return first ? toTitleCase(first) : 'Other'
}

/**
 * AxisBarChart
 * Simple SVG bars with axes + hover tooltip via <title>.
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

  const maxVal = Math.max(0, ...points.map(p => p.value))
  const yMax = maxVal <= 0 ? 1 : maxVal * 1.15

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const n = points.length || 1
  const gap = Math.min(14, innerW / (n * 6))
  const barW = Math.max(10, (innerW - gap * (n - 1)) / n)

  const yOf = (v: number) => padT + innerH - (v / yMax) * innerH

  const ticks = Array.from({ length: yTickCount }, (_, i) => i).map(i => {
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

  const maxVal = Math.max(...points.map(p => p.value), 0)
  const minVal = Math.min(...points.map(p => p.value), 0)
  const span = maxVal - minVal
  const yMin = minVal - span * 0.1
  const yMax = maxVal + span * 0.15 || 1

  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = points.length || 1

  const xOf = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yOf = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const ticks = Array.from({ length: yTickCount }, (_, i) => i).map(i => {
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
 * DonutBreakdown
 * Donut + legend on the side.
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

                  <span className="text-sm font-medium text-gray-900">
                    {formatMoney(seg.value, currency)}
                  </span>
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
  transactions,
}: {
  summary: ClubFinanceSummary | null
  cashflowDaily: CashflowPoint[]
  sponsorMonthly?: number
  currency?: 'USD' | 'EUR'
  topIncomeBreakdown?: BreakdownItem[]
  topExpenseBreakdown?: BreakdownItem[]
  transactions?: Transaction[]
}): JSX.Element {
  const [granularity, setGranularity] = useState<Granularity>('monthly')

  const hasTransactions = Boolean(transactions && transactions.length > 0)

  const periodLabel = useMemo(() => {
    if (granularity === 'daily') return 'Today'
    if (granularity === 'weekly') return 'This week'
    return 'This month'
  }, [granularity])

  const rawDailyPoints = useMemo(
    () =>
      cashflowDaily
        .slice()
        .sort((a, b) => (a.bucket_date < b.bucket_date ? -1 : 1))
        .map(p => ({
          date: p.bucket_date,
          income: toNumber(p.income),
          expenses: toNumber(p.expenses),
          net: toNumber(p.net),
        })),
    [cashflowDaily]
  )

  const latestTransactionDateMs = useMemo(() => {
    if (!transactions || transactions.length === 0) return null

    const values = transactions
      .map(t => parseTxDate(t)?.getTime() ?? null)
      .filter((v): v is number => v !== null && Number.isFinite(v))

    if (values.length === 0) return null

    return Math.max(...values)
  }, [transactions])

  const periodBounds = useMemo(() => {
    const lastDateStr = rawDailyPoints[rawDailyPoints.length - 1]?.date

    const end = lastDateStr
      ? new Date(`${lastDateStr}T23:59:59Z`)
      : latestTransactionDateMs !== null
        ? new Date(latestTransactionDateMs)
        : new Date()

    end.setUTCHours(23, 59, 59, 999)

    const start = new Date(end)

    if (granularity === 'weekly') start.setUTCDate(start.getUTCDate() - 6)
    else if (granularity === 'monthly') start.setUTCDate(start.getUTCDate() - 29)

    start.setUTCHours(0, 0, 0, 0)

    return { start, end }
  }, [rawDailyPoints, latestTransactionDateMs, granularity])

  const periodRows = useMemo(() => {
    if (!transactions || transactions.length === 0) return []

    const { start, end } = periodBounds

    return transactions.filter(t => {
      const d = parseTxDate(t)
      if (!d) return false

      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
    })
  }, [transactions, periodBounds])

  /**
   * If transactions are supplied, rebuild chart points as operating-only data.
   * This prevents emergency_loan_disbursement from appearing as real income
   * in Overview charts.
   *
   * If transactions are not supplied, fallback to cashflowDaily exactly as before.
   */
  const operatingDailyPoints = useMemo(() => {
    if (!transactions || transactions.length === 0) return rawDailyPoints

    const map = new Map<string, { date: string; income: number; expenses: number; net: number }>()

    for (const p of rawDailyPoints) {
      map.set(p.date, {
        date: p.date,
        income: 0,
        expenses: 0,
        net: 0,
      })
    }

    for (const tx of transactions) {
      const d = parseTxDate(tx)
      if (!d) continue

      const date = toDateKey(d)
      const type = txType(tx)
      const amount = txSignedAmount(tx)

      const cur =
        map.get(date) ??
        ({
          date,
          income: 0,
          expenses: 0,
          net: 0,
        } as { date: string; income: number; expenses: number; net: number })

      if (shouldCountAsOperatingIncome(type, amount)) {
        cur.income += amount
      }

      if (shouldCountAsOperatingExpense(type, amount)) {
        cur.expenses += Math.abs(amount)
      }

      cur.net = cur.income - cur.expenses

      map.set(date, cur)
    }

    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [transactions, rawDailyPoints])

  const grouped = useMemo(
    () => groupSeries(operatingDailyPoints, granularity),
    [operatingDailyPoints, granularity]
  )

  const periodWindow = useMemo(() => {
    if (granularity === 'daily') return operatingDailyPoints.slice(-1)
    if (granularity === 'weekly') return operatingDailyPoints.slice(-7)
    return operatingDailyPoints.slice(-30)
  }, [operatingDailyPoints, granularity])

  const periodTotals = useMemo(() => {
    if (hasTransactions) {
      const income = periodRows
        .filter(row => shouldCountAsOperatingIncome(txType(row), txSignedAmount(row)))
        .reduce((sum, row) => sum + txSignedAmount(row), 0)

      const expenses = periodRows
        .filter(row => shouldCountAsOperatingExpense(txType(row), txSignedAmount(row)))
        .reduce((sum, row) => sum + Math.abs(txSignedAmount(row)), 0)

      return {
        income,
        expenses,
        net: income - expenses,
        label: periodLabel,
      }
    }

    if (granularity === 'daily') {
      const last = operatingDailyPoints[operatingDailyPoints.length - 1]

      return {
        income: last?.income ?? 0,
        expenses: last?.expenses ?? 0,
        net: last?.net ?? 0,
        label: periodLabel,
      }
    }

    if (granularity === 'weekly') {
      const last7 = operatingDailyPoints.slice(-7)

      return {
        income: last7.reduce((s, p) => s + p.income, 0),
        expenses: last7.reduce((s, p) => s + p.expenses, 0),
        net: last7.reduce((s, p) => s + p.net, 0),
        label: periodLabel,
      }
    }

    const last30 = operatingDailyPoints.slice(-30)

    return {
      income: last30.reduce((s, p) => s + p.income, 0),
      expenses: last30.reduce((s, p) => s + p.expenses, 0),
      net: last30.reduce((s, p) => s + p.net, 0),
      label: periodLabel,
    }
  }, [hasTransactions, periodRows, operatingDailyPoints, granularity, periodLabel])

  const debtMovement = useMemo(() => {
    const debtCashInflow = periodRows
      .filter(row => isDebtCashInflow(txType(row)))
      .reduce((sum, row) => sum + Math.max(txSignedAmount(row), 0), 0)

    const debtPrincipalRepaid = periodRows
      .filter(row => isDebtPrincipalRepayment(txType(row)))
      .reduce((sum, row) => sum + Math.abs(Math.min(txSignedAmount(row), 0)), 0)

    const debtInterestPaid = periodRows
      .filter(row => isRealDebtExpense(txType(row)))
      .reduce((sum, row) => sum + Math.abs(Math.min(txSignedAmount(row), 0)), 0)

    return {
      debtCashInflow,
      debtPrincipalRepaid,
      debtInterestPaid,
    }
  }, [periodRows])

  const hasDebtMovement =
    debtMovement.debtCashInflow > 0 ||
    debtMovement.debtPrincipalRepaid > 0 ||
    debtMovement.debtInterestPaid > 0

  const currentBalance = summary ? toNumber(summary.current_balance) : 0

  const topFromTransactions = useMemo(() => {
    if (!periodRows || periodRows.length === 0) {
      return {
        incomes: [] as { label: string; value: number }[],
        expenses: [] as { label: string; value: number }[],
      }
    }

    const incomesRaw = periodRows
      .filter(row => shouldShowInTopIncome(txType(row), txSignedAmount(row)))
      .map(row => ({
        label: txLabel(row),
        type: txType(row),
        value: txAmountAbs(row),
      }))

    const expensesRaw = periodRows
      .filter(row => shouldShowInTopCost(txType(row), txSignedAmount(row)))
      .map(row => ({
        label: txLabel(row),
        type: txType(row),
        value: txAmountAbs(row),
      }))

    return {
      incomes: aggregateBreakdown(incomesRaw, formatTransactionShortLabel, 5),
      expenses: aggregateBreakdown(expensesRaw, formatTransactionShortLabel, 5),
    }
  }, [periodRows])

  const topIncomeItems = useMemo(() => {
    if (topIncomeBreakdown && topIncomeBreakdown.length > 0) {
      const filtered = topIncomeBreakdown
        .map(x => {
          const amount = toNumber(x.amount)
          const type = normalizeType(x.type)

          return {
            label: (x.name ?? x.label ?? 'Income').trim(),
            type,
            value: amount,
            signedAmount: amount,
          }
        })
        .filter(x => {
          if (!x.type) return true
          return shouldShowInTopIncome(x.type, x.signedAmount)
        })
        .map(x => ({
          label: x.label,
          type: x.type,
          value: Math.abs(x.value),
        }))

      return aggregateBreakdown(filtered, formatTransactionShortLabel, 5)
    }

    if (topFromTransactions.incomes.length > 0) return topFromTransactions.incomes

    const sorted = periodWindow
      .map(p => ({ value: p.income }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return sorted.map((x, idx) => ({ label: `Income ${idx + 1}`, value: x.value }))
  }, [topIncomeBreakdown, topFromTransactions.incomes, periodWindow])

  const topExpenseItems = useMemo(() => {
    if (topExpenseBreakdown && topExpenseBreakdown.length > 0) {
      const filtered = topExpenseBreakdown
        .map(x => {
          const rawAmount = toNumber(x.amount)
          const signedAmount = rawAmount < 0 ? rawAmount : -Math.abs(rawAmount)
          const type = normalizeType(x.type)

          return {
            label: (x.name ?? x.label ?? 'Cost').trim(),
            type,
            value: Math.abs(rawAmount),
            signedAmount,
          }
        })
        .filter(x => {
          if (!x.type) return true
          return shouldShowInTopCost(x.type, x.signedAmount)
        })
        .map(x => ({
          label: x.label,
          type: x.type,
          value: x.value,
        }))

      return aggregateBreakdown(filtered, formatTransactionShortLabel, 5)
    }

    if (topFromTransactions.expenses.length > 0) return topFromTransactions.expenses

    const sorted = periodWindow
      .map(p => ({ value: p.expenses }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return sorted.map((x, idx) => ({ label: `Cost ${idx + 1}`, value: x.value }))
  }, [topExpenseBreakdown, topFromTransactions.expenses, periodWindow])

  const incomePalette = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0']
  const expensePalette = ['#dc2626', '#ef4444', '#f97316', '#fb7185', '#fca5a5']

  return (
    <div className="space-y-4">
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
          <div className="text-xs text-gray-500 mt-1">
            Sponsors / month: {formatMoney(sponsorMonthly, currency)}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Expenses ({periodTotals.label})</div>
          <div className="text-2xl font-bold mt-2">
            {formatMoney(periodTotals.expenses, currency)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Net operating: {formatMoney(periodTotals.net, currency)}
          </div>
        </div>
      </div>

      {hasDebtMovement ? (
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Emergency debt movement</div>
              <div className="text-sm text-gray-500">
                Debt cashflow is shown separately from operating income and expenses.
              </div>
            </div>

            <div className="text-xs text-gray-500">{periodTotals.label}</div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Loan received</div>
              <div className="text-lg font-semibold mt-1">
                {formatMoney(debtMovement.debtCashInflow, currency)}
              </div>
            </div>

            <div className="rounded border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Principal repaid</div>
              <div className="text-lg font-semibold mt-1">
                {formatMoney(debtMovement.debtPrincipalRepaid, currency)}
              </div>
            </div>

            <div className="rounded border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Interest paid</div>
              <div className="text-lg font-semibold mt-1">
                {formatMoney(debtMovement.debtInterestPaid, currency)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
              <div className="text-sm text-gray-500">Operating view of the selected period.</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Income</div>
            <div className="text-xs text-gray-500">last {grouped.length} periods</div>
          </div>

          <div className="mt-3">
            <AxisBarChart
              title="Income"
              points={grouped.map(p => ({ label: p.label, value: p.income }))}
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
              points={grouped.map(p => ({ label: p.label, value: p.expenses }))}
              currency={currency}
              barColor="#dc2626"
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Net Operating</div>
            <div className="text-xs text-gray-500">income - operating expenses</div>
          </div>

          <div className="mt-3">
            <AxisLineChart
              title="Net operating trend"
              points={grouped.map(p => ({ label: p.label, value: p.net }))}
              currency={currency}
              strokeColor="#2563eb"
            />
          </div>
        </div>
      </div>
    </div>
  )
}