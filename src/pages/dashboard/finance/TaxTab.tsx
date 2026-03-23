/**
 * TaxTab.tsx
 * Tax overview tab backed by finance_get_club_tax_audits + finance_get_club_statement_v2.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

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

function formatDateOnly(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} → ${end}`
  return `${s.toLocaleDateString()} → ${e.toLocaleDateString()}`
}

function getMeta(row: { metadata: Record<string, unknown> | null }): Record<string, unknown> | null {
  return row.metadata && typeof row.metadata === 'object' ? row.metadata : null
}

function pickText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function extractGameDate(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null

  return (
    pickText(meta.in_game_date) ||
    pickText(meta.game_date) ||
    pickText(meta.gameDate) ||
    pickText(meta.source_game_date) ||
    pickText(meta.sourceGameDate) ||
    null
  )
}

function extractPeriod(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null

  const start = pickText(meta.period_start)
  const end = pickText(meta.period_end)

  if (!start || !end) return null

  return formatDateRange(start, end)
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

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0)
}

function nextMonthlyAuditDate(latestAudit: AuditRow | null): Date {
  if (latestAudit) {
    const lastPeriodEnd = new Date(latestAudit.period_end)
    if (!Number.isNaN(lastPeriodEnd.getTime())) {
      return endOfMonth(new Date(lastPeriodEnd.getFullYear(), lastPeriodEnd.getMonth() + 1, 1))
    }
  }

  return endOfMonth(new Date())
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

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      if (!clubId) return

      setLoading(true)
      setError(null)

      const [auditsRes, statementRes] = await Promise.all([
        supabase.rpc('finance_get_club_tax_audits', {
          p_club_id: clubId,
          p_limit: 12,
        }),
        supabase.rpc('finance_get_club_statement_v2', {
          p_club_id: clubId,
          p_limit: 200,
          p_before: null,
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

      setAudits((auditsRes.data ?? []) as AuditRow[])
      setAllRows((statementRes.data ?? []) as StatementRowV2[])
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [clubId])

  const latestAudit = audits[0] ?? null

  const nextAuditDate = useMemo(() => {
    return nextMonthlyAuditDate(latestAudit)
  }, [latestAudit])

  const nextAuditLabel = useMemo(() => {
    return nextAuditDate.toLocaleDateString()
  }, [nextAuditDate])

  const summary = useMemo(() => {
    if (!latestAudit) {
      return {
        gross: 0,
        expected: 0,
        withheld: 0,
        adjustment: 0,
      }
    }

    return {
      gross: toNumber(latestAudit.taxable_income_gross),
      expected: toNumber(latestAudit.expected_tax),
      withheld: toNumber(latestAudit.already_withheld),
      adjustment: toNumber(latestAudit.adjustment_amount),
    }
  }, [latestAudit])

  const taxRows = useMemo(() => {
    return allRows
      .filter(row => TAX_TYPES.has(row.type))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
    if (ownGameDate) return formatDateOnly(ownGameDate)

    const ownPeriod = extractPeriod(meta)
    if (ownPeriod) return ownPeriod

    const sourceTxId = pickText(meta?.source_transaction_id)
    if (sourceTxId) {
      const sourceRow = rowById.get(sourceTxId)

      if (sourceRow) {
        const sourceMeta = getMeta(sourceRow)

        const sourceGameDate = extractGameDate(sourceMeta)
        if (sourceGameDate) return formatDateOnly(sourceGameDate)

        const sourcePeriod = extractPeriod(sourceMeta)
        if (sourcePeriod) return sourcePeriod

        return formatDateOnly(sourceRow.created_at)
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
              Flat tax rate on taxable income: <span className="font-medium">15%</span>
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
              Taxable income
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatMoney(summary.gross, currency)}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Expected tax
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
              Audit adjustment
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

        {latestAudit ? (
          <div className="mt-4 text-sm text-gray-600">
            Game period: {formatDateRange(latestAudit.period_start, latestAudit.period_end)}
          </div>
        ) : (
          <div className="mt-4 text-sm text-gray-600">
            No tax audit has been recorded yet for this club. Next expected audit: {nextAuditLabel}.
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h5 className="font-medium">Recent tax transactions</h5>

        {taxRows.length === 0 ? (
          <div className="mt-3 text-sm text-gray-600">No tax transactions found.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 w-[18%]">In-Game Date</th>
                  <th className="py-2 pr-4 w-[24%]">Type</th>
                  <th className="py-2 pr-4 w-[16%]">Amount</th>
                  <th className="py-2 w-[42%] text-right">Reference</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.slice(0, 20).map(row => {
                  const amount = toNumber(row.net_amount)

                  return (
                    <tr key={row.transaction_id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 text-gray-700">
                        {getInGameTimeLabel(row)}
                      </td>
                      <td className="py-2 pr-4">
                        {row.type_name || row.type}
                      </td>
                      <td
                        className={`py-2 pr-4 font-medium ${
                          amount < 0
                            ? 'text-red-700'
                            : amount > 0
                              ? 'text-green-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {formatMoney(amount, currency)}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-gray-600 whitespace-nowrap">
                        {getReferenceText(row)}
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
                      {formatDateRange(audit.period_start, audit.period_end)}
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