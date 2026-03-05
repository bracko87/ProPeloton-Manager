/**
 * utils.tsx
 * Shared helpers and small chart rendering primitives used by finance tabs.
 *
 * Contains:
 * - basic helpers: toNumber, formatMoney, formatDateTime
 * - grouping helpers for aggregation (daily/weekly/monthly)
 * - MiniBars, MiniLine and DonutChart SVG components
 */

import React from 'react'

/**
 * toNumber
 * Safely convert unknown to number.
 */
export function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * formatMoney
 * Format integer currency values (no cents).
 */
export function formatMoney(n: number, currency: 'EUR' | 'USD' = 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * formatDateTime
 * Friendly datetime output for table cells.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/**
 * getISOWeek
 * ISO week helper used for weekly grouping.
 */
export function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * groupSeries
 * Aggregate daily points into daily/weekly/monthly buckets.
 */
export function groupSeries(
  points: { date: string; income: number; expenses: number; net: number }[],
  g: 'daily' | 'weekly' | 'monthly'
) {
  if (g === 'daily') return points

  const keyOf = (d: Date) => {
    if (g === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

/**
 * MiniBars
 * Small SVG bars chart for income/expenses.
 */
export function MiniBars({
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
          <line x1={0} y1={height - 18} x2={width} y2={height - 18} stroke="currentColor" opacity="0.08" />
          {points.map((p, i) => {
            const x = i * 18 + 6
            const base = height - 18
            const incomeH = (p.income / maxVal) * (height - 36)
            const expH = (p.expenses / maxVal) * (height - 36)
            return (
              <g key={`${p.label}-${i}`}>
                <rect x={x} y={base - incomeH} width={5} height={incomeH} rx={2} fill="#065f46" opacity="0.85" />
                <rect x={x + 7} y={base - expH} width={5} height={expH} rx={2} fill="#991b1b" opacity="0.6" />
              </g>
            )
          })}
        </svg>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>Income (green)</span>
          <span>Expenses (red)</span>
        </div>
      </div>
    </div>
  )
}

/**
 * MiniLine
 * Simple net trend line.
 */
export function MiniLine({ points, height = 140 }: { points: { label: string; value: number }[]; height?: number }) {
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
          <line x1={0} y1={height - padBottom} x2={width} y2={height - padBottom} stroke="currentColor" opacity="0.08" />
          <path d={d} fill="none" stroke="#065f46" strokeWidth={2} opacity="0.9" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={2} fill="#065f46" opacity="0.9" />
          ))}
        </svg>
        <div className="mt-2 text-xs text-gray-500">Net trend</div>
      </div>
    </div>
  )
}

/**
 * DonutChart
 * Simple donut/pie implemented with SVG using two arcs (income & expenses).
 *
 * Props:
 * - income, expenses: numbers (non-negative)
 * - size: pixel diameter
 */
export function DonutChart({ income, expenses, size = 160 }: { income: number; expenses: number; size?: number }) {
  const total = Math.max(1, income + expenses)
  const incomePct = income / total
  const expensesPct = expenses / total

  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  const incomeLen = c * incomePct
  const expensesLen = c * expensesPct

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          {/* background ring */}
          <circle r={r} fill="none" stroke="#f3f4f6" strokeWidth={16} />
          {/* income arc (green) */}
          <circle
            r={r}
            fill="none"
            stroke="#065f46"
            strokeWidth={16}
            strokeDasharray={`${incomeLen} ${c - incomeLen}`}
            strokeLinecap="butt"
          />
          {/* expenses arc (red) */}
          <circle
            r={r}
            fill="none"
            stroke="#991b1b"
            strokeWidth={16}
            strokeDasharray={`${expensesLen} ${c - expensesLen}`}
            strokeDashoffset={-incomeLen}
            strokeLinecap="butt"
          />
        </g>
      </svg>
    </div>
  )
}