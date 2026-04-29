/**
 * TaxTab.tsx
 * Tax overview tab backed by finance_get_club_tax_audits + finance_get_club_statement_v2.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  formatGameDate,
  getNextGameMonthEndLabel,
  resolveGameDate,
} from './gameDate'

const DEV_TAX_NEXT_AUDIT_OVERRIDE_LABEL: string | null = null

const GAME_YEAR_BASE = 1999

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number | null
  minute_number: number | null
}

type TaxPositionRow = {
  period_start: string
  period_end: string
  taxable_income_gross: number | string
  expected_tax: number | string
  already_withheld: number | string
  adjustment_amount: number | string
}

type AuditRow = {
  period_start: string
  period_end: string
  tax_rate_bps: number
  taxable_income_gross: number | string
  expected_tax: number | string
  already_withheld: number | string
  adjustment_amount: number | string
  audit_status: 'ok' | 'adjusted' | 'refunded'
  details: Record<string, unknown> | null
  created_at: string
}

type StatementRowV2 = {
  created_at: string
  transaction_id: string
  type: string
  type_name: string
  category: string
  net_amount: number | string
  metadata: Record<string, unknown> | null
}

const TAX_TYPES = new Set([
  'tax_withholding',
  'tax_monthly_adjustment',
  'tax_monthly_refund',
])

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function getDaysInGameMonth(month: number): number {
  switch (month) {
    case 1:
      return 31
    case 2:
      return 28
    case 3:
      return 31
    case 4:
      return 30
    case 5:
      return 31
    case 6:
      return 30
    case 7:
      return 31
    case 8:
      return 31
    case 9:
      return 30
    case 10:
      return 31
    case 11:
      return 30
    case 12:
      return 31
    default:
      return 31
  }
}

function getCurrentGameMonthPeriod(gameState: GameStateRow): {
  periodStart: string
  periodEnd: string
} {
  const year = GAME_YEAR_BASE + gameState.season_number
  const month = gameState.month_number
  const lastDay = getDaysInGameMonth(month)

  return {
    periodStart: `${year}-${pad2(month)}-01`,
    periodEnd: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  }
}

function formatGameDateRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`)
  const e = new Date(`${end}T00:00:00Z`)

  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${start} → ${end}`
  }

  const season = s.getUTCFullYear() - GAME_YEAR_BASE

  return `${pad2(s.getUTCDate())}/${pad2(s.getUTCMonth() + 1)} → ${pad2(
    e.getUTCDate()
  )}/${pad2(e.getUTCMonth() + 1)}, Season ${season}`
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0

  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  return 0
}

function formatMoney(n: number, currency: 'EUR' | 'USD' = 'EUR'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(n)

  return formatted.replace('US$', '$')
}

function getMeta(row: {
  metadata: Record<string, unknown> | null
}): Record<string, unknown> | null {
  return row.metadata && typeof row.metadata === 'object' ? row.metadata : null
}

function pickText(v: unknown): string | null {
  if (typeof v !== 'string') return null

  const t = v.trim()
  return t ? t : null
}

function extractGameDate(meta: Record<string, unknown> | null): unknown | null {
  if (!meta) return null

  return (
    meta.game_date ??
    meta.in_game_date ??
    meta.gameDate ??
    meta.source_game_date ??
    meta.sourceGameDate ??
    null
  )
}

function formatGameDateValue(value: unknown): string | null {
  const resolved = resolveGameDate(value)
  return resolved ? formatGameDate(resolved, true) : null
}

function extractPeriod(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null

  const start = pickText(meta.period_start)
  const end = pickText(meta.period_end)

  if (!start || !end) return null

  return formatGameDateRange(start, end)
}

function statusBadgeClass(status: AuditRow['audit_status']): string {
  switch (status) {
    case 'ok':
      return 'bg-green-100 text-green-800'

    case 'adjusted':
      return 'bg-yellow-100 text-yellow-800'

    case 'refunded':
      return 'bg-blue-100 text-blue-800'

    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function TaxTab({
  clubId,
  currency = 'EUR',
}: {
  clubId: string
  currency?: 'EUR' | 'USD'
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [allRows, setAllRows] = useState<StatementRowV2[]>([])
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const [currentTaxPosition, setCurrentTaxPosition] =
    useState<TaxPositionRow | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      if (!clubId) {
        setAudits([])
        setAllRows([])
        setGameState(null)
        setCurrentTaxPosition(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const gameStateRes = await supabase
        .from('game_state')
        .select('season_number, month_number, day_number, hour_number, minute_number')
        .eq('id', true)
        .single<GameStateRow>()

      if (cancelled) return

      if (gameStateRes.error) {
        setError(gameStateRes.error.message)
        setLoading(false)
        return
      }

      const currentPeriod = getCurrentGameMonthPeriod(gameStateRes.data)

      const [auditsRes, statementRes, taxPositionRes] = await Promise.all([
        supabase.rpc('finance_get_club_tax_audits', {
          p_club_id: clubId,
          p_limit: 12,
        }),
        supabase.rpc('finance_get_club_statement_v2', {
          p_club_id: clubId,
          p_limit: 500,
          p_before: null,
        }),
        supabase.rpc('finance_get_club_tax_position_for_period', {
          p_club_id: clubId,
          p_period_start: currentPeriod.periodStart,
          p_period_end: currentPeriod.periodEnd,
        }),
      ])

      if (cancelled) return

      if (auditsRes.error) {
        setError(auditsRes.error.message)
        setLoading(false)
        return
      }

      if (statementRes.error) {
        setError(statementRes.error.message)
        setLoading(false)
        return
      }

      if (taxPositionRes.error) {
        setError(taxPositionRes.error.message)
        setLoading(false)
        return
      }

      setAudits((auditsRes.data ?? []) as AuditRow[])
      setAllRows((statementRes.data ?? []) as StatementRowV2[])
      setGameState(gameStateRes.data)
      setCurrentTaxPosition(
        ((taxPositionRes.data ?? []) as TaxPositionRow[])[0] ?? null
      )
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [clubId])

  const latestAudit = audits[0] ?? null

  const nextAuditLabel = useMemo(() => {
    if (DEV_TAX_NEXT_AUDIT_OVERRIDE_LABEL) {
      return DEV_TAX_NEXT_AUDIT_OVERRIDE_LABEL
    }

    if (currentTaxPosition) {
      return `After ${
        formatGameDateValue(currentTaxPosition.period_end) ??
        currentTaxPosition.period_end
      }`
    }

    return latestAudit ? getNextGameMonthEndLabel(latestAudit.period_end) : '—'
  }, [currentTaxPosition, latestAudit])

  const summary = useMemo(() => {
    if (!currentTaxPosition) {
      return {
        gross: 0,
        expected: 0,
        withheld: 0,
        adjustment: 0,
      }
    }

    return {
      gross: toNumber(currentTaxPosition.taxable_income_gross),
      expected: toNumber(currentTaxPosition.expected_tax),
      withheld: toNumber(currentTaxPosition.already_withheld),
      adjustment: toNumber(currentTaxPosition.adjustment_amount),
    }
  }, [currentTaxPosition])

  const taxRows = useMemo(() => {
    return allRows
      .filter(row => TAX_TYPES.has(row.type))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
  }, [allRows])

  const rowById = useMemo(() => {
    const map = new Map<string, StatementRowV2>()

    for (const row of allRows) {
      map.set(row.transaction_id, row)
    }

    return map
  }, [allRows])

  function getInGameTimeLabel(row: StatementRowV2): string {
    const meta = getMeta(row)

    const ownGameDate = extractGameDate(meta)
    const ownGameDateLabel = formatGameDateValue(ownGameDate)
    if (ownGameDateLabel) return ownGameDateLabel

    const ownPeriod = extractPeriod(meta)
    if (ownPeriod) return ownPeriod

    const sourceTxId = pickText(meta?.source_transaction_id)

    if (sourceTxId) {
      const sourceRow = rowById.get(sourceTxId)

      if (sourceRow) {
        const sourceMeta = getMeta(sourceRow)

        const sourceGameDate = extractGameDate(sourceMeta)
        const sourceGameDateLabel = formatGameDateValue(sourceGameDate)
        if (sourceGameDateLabel) return sourceGameDateLabel

        const sourcePeriod = extractPeriod(sourceMeta)
        if (sourcePeriod) return sourcePeriod

        return '—'
      }
    }

    return 'Unknown'
  }

  function getReferenceText(row: StatementRowV2): string {
    const meta = getMeta(row)
    return pickText(meta?.source_transaction_id) ?? row.transaction_id
  }

  if (loading) {
    return (
      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-semibold">Tax</h4>
        <div className="mt-2 text-sm text-gray-600">Loading tax data…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-semibold">Tax</h4>
        <div className="mt-2 text-sm text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-semibold">Tax</h4>

            <div className="mt-1 text-sm text-gray-600">
              Flat tax rate on taxable income:{' '}
              <span className="font-medium">15%</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {latestAudit ? (
              <span
                className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
                  latestAudit.audit_status
                )}`}
              >
                Latest audit: {latestAudit.audit_status}
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                No audits yet
              </span>
            )}

            <span className="inline-flex items-center rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              Next audit: {nextAuditLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Current taxable income
            </div>

            <div className="mt-1 text-lg font-semibold">
              {formatMoney(summary.gross, currency)}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Expected tax so far
            </div>

            <div className="mt-1 text-lg font-semibold">
              {formatMoney(summary.expected, currency)}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Already withheld
            </div>

            <div className="mt-1 text-lg font-semibold">
              {formatMoney(summary.withheld, currency)}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Estimated adjustment
            </div>

            <div
              className={`mt-1 text-lg font-semibold ${
                summary.adjustment < 0
                  ? 'text-red-700'
                  : summary.adjustment > 0
                    ? 'text-green-700'
                    : 'text-gray-900'
              }`}
            >
              {formatMoney(summary.adjustment, currency)}
            </div>
          </div>
        </div>

        {currentTaxPosition ? (
          <div className="mt-4 text-sm text-gray-600">
            Current tax period:{' '}
            {formatGameDateRange(
              currentTaxPosition.period_start,
              currentTaxPosition.period_end
            )}
          </div>
        ) : gameState ? (
          <div className="mt-4 text-sm text-gray-600">
            Current tax period is loading…
          </div>
        ) : (
          <div className="mt-4 text-sm text-gray-600">
            Current game period unavailable.
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h5 className="font-medium">Tax statement</h5>

        {taxRows.length === 0 ? (
          <div className="mt-3 text-sm text-gray-600">
            No tax statement rows found.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 w-[20%]">Game Time</th>
                  <th className="py-2 pr-4 w-[20%]">Type</th>
                  <th className="py-2 pr-4 w-[20%]">Category</th>
                  <th className="py-2 pr-4 w-[20%]">Reference</th>
                  <th className="py-2 w-[20%] text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {taxRows.map(row => {
                  const amount = toNumber(row.net_amount)

                  return (
                    <tr
                      key={row.transaction_id}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2 pr-4">{getInGameTimeLabel(row)}</td>

                      <td className="py-2 pr-4">
                        {row.type_name || row.type}
                      </td>

                      <td className="py-2 pr-4">{row.category || '—'}</td>

                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs text-gray-600">
                          {getReferenceText(row)}
                        </span>
                      </td>

                      <td
                        className={`py-2 text-right font-medium ${
                          amount < 0
                            ? 'text-red-700'
                            : amount > 0
                              ? 'text-green-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {formatMoney(amount, currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h5 className="font-medium">Audit history</h5>

        {audits.length === 0 ? (
          <div className="mt-3 text-sm text-gray-600">No tax audits found.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 w-[22%]">Game Period</th>
                  <th className="py-2 pr-4 w-[12%]">Status</th>
                  <th className="py-2 pr-4 w-[18%]">Taxable income</th>
                  <th className="py-2 pr-4 w-[16%]">Expected tax</th>
                  <th className="py-2 pr-4 w-[16%]">Withheld</th>
                  <th className="py-2 w-[16%]">Adjustment</th>
                </tr>
              </thead>

              <tbody>
                {audits.map(audit => (
                  <tr
                    key={`${audit.period_start}-${audit.period_end}-${audit.created_at}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="py-2 pr-4">
                      {formatGameDateRange(audit.period_start, audit.period_end)}
                    </td>

                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          audit.audit_status
                        )}`}
                      >
                        {audit.audit_status}
                      </span>
                    </td>

                    <td className="py-2 pr-4">
                      {formatMoney(toNumber(audit.taxable_income_gross), currency)}
                    </td>

                    <td className="py-2 pr-4">
                      {formatMoney(toNumber(audit.expected_tax), currency)}
                    </td>

                    <td className="py-2 pr-4">
                      {formatMoney(toNumber(audit.already_withheld), currency)}
                    </td>

                    <td
                      className={`py-2 font-medium ${
                        toNumber(audit.adjustment_amount) < 0
                          ? 'text-red-700'
                          : toNumber(audit.adjustment_amount) > 0
                            ? 'text-green-700'
                            : 'text-gray-700'
                      }`}
                    >
                      {formatMoney(toNumber(audit.adjustment_amount), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}