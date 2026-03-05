/**
 * charts.tsx
 * Lightweight SVG-based mini bar, line and donut charts for the Finance tabs.
 *
 * Purpose:
 * - Provide dependency-free visualizations for income/expenses/net series.
 */

import React from 'react'

/**
 * MiniBars
 * Simple stacked mini bar chart for income/expenses series.
 */
export function MiniBars({
  points,
  height = 140,
}: {
  points: { label: string; income: number; expenses: number }[]
  height?: number
}): JSX.Element {
  if (!points.length) {
    return <div className="text-sm text-gray-500">No data yet.</div>
  }

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

/**
 * MiniLine
 * Simple line chart for a single net series.
 */
export function MiniLine({
  points,
  height = 140,
}: {
  points: { label: string; value: number }[]
  height?: number
}): JSX.Element {
  if (!points.length) {
    return <div className="text-sm text-gray-500">No data yet.</div>
  }

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
          <line
            x1={0}
            y1={height - padBottom}
            x2={width}
            y2={height - padBottom}
            stroke="currentColor"
            opacity="0.15"
          />
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

/**
 * Donut
 * Donut chart comparing income vs expenses for a selected period.
 */
export function Donut({
  income,
  expenses,
  size = 140,
}: {
  income: number
  expenses: number
  size?: number
}): JSX.Element {
  const total = Math.max(0, income) + Math.max(0, expenses)
  const pct = total === 0 ? 0 : Math.round((income / total) * 100)

  // Green for income, red for expenses.
  const bg =
    total === 0
      ? 'conic-gradient(#e5e7eb 0deg 360deg)'
      : `conic-gradient(#16a34a 0deg ${pct * 3.6}deg, #dc2626 ${pct * 3.6}deg 360deg)`

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="relative rounded-full"
        style={{ width: size, height: size, background: bg }}
      >
        {/* inner hole */}
        <div
          className="absolute rounded-full bg-white"
          style={{
            width: size * 0.68,
            height: size * 0.68,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* center text */}
        <div
          className="absolute text-center"
          style={{
            width: size * 0.68,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="text-xs text-gray-500">Income</div>
          <div className="text-sm font-semibold">{pct}%</div>
        </div>
      </div>

      <div className="text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#16a34a' }} />
          <span className="text-gray-700">Income:</span>
          <span className="font-semibold">{income.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#dc2626' }} />
          <span className="text-gray-700">Expenses:</span>
          <span className="font-semibold">{expenses.toLocaleString()}</span>
        </div>
        <div className="mt-2 text-xs text-gray-500">Total: {total.toLocaleString()}</div>
      </div>
    </div>
  )
}
