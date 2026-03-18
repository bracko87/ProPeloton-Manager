/**
 * TransactionsTab.tsx
 * Loads and displays the ledger-backed statement via RPC.
 *
 * Behavior:
 * - Uses RPC finance_get_club_statement(p_club_id, p_limit, p_before).
 * - Recent view shows only the last 30 days of transactions.
 * - Archive view shows older transactions grouped by month.
 * - Archive keeps only the last 6 months.
 * - Pagination is handled in the frontend with 20 items per page.
 * - In-game date is shown only when a complete Season + Month + Day exists.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

type GameDateObject = {
  season?: string | number | null
  month?: string | number | null
  day?: string | number | null
  date?: string | number | null
}

type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  net_amount: string | number
  metadata?: unknown
  game_date?: string | GameDateObject | null
  in_game_date?: string | GameDateObject | null
  gameDate?: string | GameDateObject | null
  season?: string | number | null
  month?: string | number | null
  day?: string | number | null
  date?: string | number | null
}

type ViewMode = 'recent' | 'archive'

type ArchiveGroup = {
  monthKey: string
  label: string
  rows: StatementRow[]
}

type ResolvedGameDateParts = {
  season: string | number
  month: string | number
  day: string | number
}

const PAGE_SIZE = 20
const RECENT_DAYS = 30
const ARCHIVE_MONTHS = 6
const RPC_BATCH_SIZE = 200
const MAX_RPC_REQUESTS = 12

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
 * getDateValue
 * Safely get a timestamp from an ISO date.
 */
function getDateValue(iso: string): number {
  const value = new Date(iso).getTime()
  return Number.isNaN(value) ? 0 : value
}

/**
 * isRecord
 * Narrow unknown values to plain objects.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * hasValue
 * Check whether a scalar value is present.
 */
function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
}

/**
 * getFirstScalar
 * Return the first usable string or number.
 */
function getFirstScalar(...values: unknown[]): string | number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

/**
 * parseCompleteInGameDateText
 * Parse a complete text label such as:
 * "Season 1, Month 2, Day 3"
 *
 * Returns null unless all 3 parts are present.
 */
function parseCompleteInGameDateText(text: string): ResolvedGameDateParts | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const seasonMatch = trimmed.match(/season\s+([^\s,]+)/i)
  const monthMatch = trimmed.match(/month\s+([^\s,]+)/i)
  const dayMatch = trimmed.match(/day\s+([^\s,]+)/i)

  if (!seasonMatch || !monthMatch || !dayMatch) {
    return null
  }

  return {
    season: seasonMatch[1],
    month: monthMatch[1],
    day: dayMatch[1],
  }
}

/**
 * formatCompleteInGameDateParts
 * Format a complete in-game date.
 */
function formatCompleteInGameDateParts(parts: ResolvedGameDateParts): string {
  return `Season ${parts.season}, Month ${parts.month}, Day ${parts.day}`
}

/**
 * resolveCompleteInGameDatePartsFromObject
 * Resolve complete Season + Month + Day from an object.
 *
 * This is intentionally strict:
 * - it returns a value only if all three parts exist
 * - season-only values are ignored
 */
function resolveCompleteInGameDatePartsFromObject(
  candidate: Record<string, unknown>
): ResolvedGameDateParts | null {
  const season = getFirstScalar(
    candidate['season'],
    candidate['game_season'],
    candidate['in_game_season'],
    candidate['season_number'],
    candidate['gameSeason'],
    candidate['inGameSeason']
  )

  const month = getFirstScalar(
    candidate['month'],
    candidate['game_month'],
    candidate['in_game_month'],
    candidate['month_number'],
    candidate['gameMonth'],
    candidate['inGameMonth']
  )

  const day = getFirstScalar(
    candidate['day'],
    candidate['date'],
    candidate['game_day'],
    candidate['in_game_day'],
    candidate['day_number'],
    candidate['gameDay'],
    candidate['inGameDay']
  )

  if (!hasValue(season) || !hasValue(month) || !hasValue(day)) {
    return null
  }

  return {
    season,
    month,
    day,
  }
}

/**
 * resolveCompleteInGameDateCandidate
 * Try to resolve a complete in-game date from a value or nested object.
 *
 * Supported examples:
 * - "Season 1, Month 2, Day 3"
 * - { season: 1, month: 2, day: 3 }
 * - { in_game_date: { season: 1, month: 2, day: 3 } }
 * - { metadata: { season_number: 1, month_number: 2, day_number: 3 } }
 *
 * Important:
 * - If only season exists, returns null
 * - This prevents misleading output like "Season 2"
 */
function resolveCompleteInGameDateCandidate(candidate: unknown, depth = 0): ResolvedGameDateParts | null {
  if (depth > 3) return null

  if (typeof candidate === 'string') {
    return parseCompleteInGameDateText(candidate)
  }

  if (!isRecord(candidate)) {
    return null
  }

  const directTextCandidates = [
    candidate['in_game_date_label'],
    candidate['game_date_label'],
    candidate['inGameDateLabel'],
    candidate['in_game_date'],
    candidate['game_date'],
    candidate['gameDate'],
  ]

  for (const value of directTextCandidates) {
    if (typeof value === 'string') {
      const parsed = parseCompleteInGameDateText(value)
      if (parsed) {
        return parsed
      }
    }
  }

  const directParts = resolveCompleteInGameDatePartsFromObject(candidate)
  if (directParts) {
    return directParts
  }

  const nestedKeys = [
    'game_date',
    'in_game_date',
    'gameDate',
    'metadata',
    'details',
    'game_date_info',
    'in_game_date_info',
  ]

  for (const key of nestedKeys) {
    const nested = candidate[key]
    if (nested !== undefined && nested !== null && nested !== candidate) {
      const resolved = resolveCompleteInGameDateCandidate(nested, depth + 1)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
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
 * formatTransactionType
 * Convert values like "sponsor_contract_payment" into readable text.
 */
function formatTransactionType(value: string): string {
  if (!value) return '—'

  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * formatInGameDate
 * Resolve and format the in-game date from the row.
 *
 * This is strict by design:
 * - show only full dates
 * - hide partial values like "Season 2"
 */
function formatInGameDate(row: StatementRow): string {
  const resolved = resolveCompleteInGameDateCandidate(row)
  return resolved ? formatCompleteInGameDateParts(resolved) : '—'
}

/**
 * sortRowsByDateDesc
 * Sort transactions from newest to oldest.
 */
function sortRowsByDateDesc(rows: StatementRow[]): StatementRow[] {
  return [...rows].sort((a, b) => getDateValue(b.created_at) - getDateValue(a.created_at))
}

/**
 * dedupeRows
 * Remove duplicate rows by transaction id while preserving first occurrence.
 */
function dedupeRows(rows: StatementRow[]): StatementRow[] {
  const map = new Map<string, StatementRow>()

  rows.forEach((row) => {
    if (!map.has(row.transaction_id)) {
      map.set(row.transaction_id, row)
    }
  })

  return Array.from(map.values())
}

/**
 * getRecentCutoff
 * Returns the timestamp cutoff for recent transactions.
 */
function getRecentCutoff(now: Date = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - RECENT_DAYS)
  return d.getTime()
}

/**
 * getArchiveCutoff
 * Returns the timestamp cutoff for archive visibility.
 */
function getArchiveCutoff(now: Date = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() - ARCHIVE_MONTHS)
  return d.getTime()
}

/**
 * getMonthKey
 * Returns a YYYY-MM key for grouping.
 */
function getMonthKey(iso: string): string {
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) {
    return 'unknown'
  }

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * formatMonthLabel
 * Converts YYYY-MM to a readable month label.
 */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)

  if (!year || !month) {
    return 'Unknown month'
  }

  const d = new Date(year, month - 1, 1)

  return d.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * slicePage
 * Returns one page of items.
 */
function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/**
 * getTotalPages
 * Returns at least 1 page.
 */
function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

/**
 * clampPage
 * Keeps page value in valid bounds.
 */
function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1))
}

/**
 * TransactionsTable
 * Shared table renderer for transaction lists.
 */
function TransactionsTable({
  rows,
  currency,
  emptyMessage,
}: {
  rows: StatementRow[]
  currency: 'EUR' | 'USD'
  emptyMessage: string
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left p-3 whitespace-nowrap">Date</th>
            <th className="text-left p-3">Type</th>
            <th className="text-left p-3 whitespace-nowrap">Amount</th>
            <th className="text-left p-3 whitespace-nowrap">In-Game Date</th>
            <th
              className="p-3 pr-4 text-right whitespace-nowrap"
              style={{ width: '1%' }}
            >
              Transaction
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-gray-600">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const amt = toNumber(r.net_amount)
              const amountColorClass =
                amt > 0 ? 'text-green-700' : amt < 0 ? 'text-red-700' : 'text-gray-700'

              return (
                <tr key={r.transaction_id} className="border-t">
                  <td className="p-3 text-gray-700 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td className="p-3 font-medium text-gray-800 whitespace-nowrap">
                    {formatTransactionType(r.type)}
                  </td>
                  <td className={`p-3 font-semibold whitespace-nowrap ${amountColorClass}`}>
                    {formatMoney(amt, currency)}
                  </td>
                  <td className="p-3 text-gray-700 whitespace-nowrap">{formatInGameDate(r)}</td>
                  <td
                    className="p-3 pr-4 font-mono text-xs text-gray-700 whitespace-nowrap text-right"
                    style={{ width: '1%' }}
                  >
                    {r.transaction_id}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * TransactionsTab
 * Shows recent and archived club wallet transactions.
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
  const [viewMode, setViewMode] = useState<ViewMode>('recent')
  const [recentPage, setRecentPage] = useState(1)
  const [archivePages, setArchivePages] = useState<Record<string, number>>({})

  /**
   * loadTransactions
   * Load enough transactions to cover recent data and the last 6 archive months.
   */
  async function loadTransactions(): Promise<void> {
    setLoading(true)

    const archiveCutoff = getArchiveCutoff()
    let before: string | null = null
    let requestCount = 0
    let collected: StatementRow[] = []

    while (requestCount < MAX_RPC_REQUESTS) {
      const res = await supabase.rpc('finance_get_club_statement', {
        p_club_id: clubId,
        p_limit: RPC_BATCH_SIZE,
        p_before: before,
      })

      if (res.error) {
        setRows([])
        setRecentPage(1)
        setArchivePages({})
        setLoading(false)
        return
      }

      const data = sortRowsByDateDesc((res.data ?? []) as StatementRow[])

      if (data.length === 0) {
        break
      }

      collected = [...collected, ...data]
      before = data[data.length - 1].created_at
      requestCount += 1

      const oldestLoaded = getDateValue(data[data.length - 1].created_at)

      if (data.length < RPC_BATCH_SIZE || oldestLoaded < archiveCutoff) {
        break
      }
    }

    const normalizedRows = sortRowsByDateDesc(dedupeRows(collected)).filter((row) => {
      const time = getDateValue(row.created_at)
      return time > 0 && time >= archiveCutoff
    })

    setRows(normalizedRows)
    setRecentPage(1)
    setArchivePages({})
    setLoading(false)
  }

  useEffect(() => {
    void loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  const recentCutoff = useMemo(() => getRecentCutoff(), [])
  const archiveCutoff = useMemo(() => getArchiveCutoff(), [])

  const recentRows = useMemo(() => {
    return rows.filter((row) => getDateValue(row.created_at) >= recentCutoff)
  }, [rows, recentCutoff])

  const archiveGroups = useMemo<ArchiveGroup[]>(() => {
    const archiveRows = rows.filter((row) => {
      const time = getDateValue(row.created_at)
      return time < recentCutoff && time >= archiveCutoff
    })

    const grouped = new Map<string, StatementRow[]>()

    archiveRows.forEach((row) => {
      const monthKey = getMonthKey(row.created_at)
      const existing = grouped.get(monthKey) ?? []
      existing.push(row)
      grouped.set(monthKey, existing)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, ARCHIVE_MONTHS)
      .map(([monthKey, monthRows]) => ({
        monthKey,
        label: formatMonthLabel(monthKey),
        rows: sortRowsByDateDesc(monthRows),
      }))
  }, [rows, recentCutoff, archiveCutoff])

  const recentTotalPages = getTotalPages(recentRows.length, PAGE_SIZE)
  const safeRecentPage = clampPage(recentPage, recentTotalPages)
  const visibleRecentRows = slicePage(recentRows, safeRecentPage, PAGE_SIZE)

  useEffect(() => {
    setRecentPage((prev) => clampPage(prev, getTotalPages(recentRows.length, PAGE_SIZE)))
  }, [recentRows.length])

  useEffect(() => {
    setArchivePages((prev) => {
      const next: Record<string, number> = {}

      archiveGroups.forEach((group) => {
        const totalPages = getTotalPages(group.rows.length, PAGE_SIZE)
        next[group.monthKey] = clampPage(prev[group.monthKey] ?? 1, totalPages)
      })

      return next
    })
  }, [archiveGroups])

  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="p-4 border-b">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="font-semibold">Transactions</h4>
            <div className="text-sm text-gray-500 mt-1">
              Recent view shows the last 30 days. Archive keeps the previous 6 months grouped by month.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('recent')}
              className={[
                'px-3 py-2 rounded text-sm border',
                viewMode === 'recent'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              Transactions
            </button>

            <button
              type="button"
              onClick={() => setViewMode('archive')}
              className={[
                'px-3 py-2 rounded text-sm border',
                viewMode === 'archive'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-gray-600">Loading…</div>
      ) : viewMode === 'recent' ? (
        <>
          <TransactionsTable
            rows={visibleRecentRows}
            currency={currency}
            emptyMessage="No transactions found in the last 30 days."
          />

          <div className="p-3 border-t bg-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="text-xs text-gray-600">
              Showing {recentRows.length === 0 ? 0 : (safeRecentPage - 1) * PAGE_SIZE + 1}-
              {Math.min(safeRecentPage * PAGE_SIZE, recentRows.length)} of {recentRows.length} recent transactions.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecentPage((prev) => Math.max(prev - 1, 1))}
                disabled={safeRecentPage <= 1}
                className={[
                  'px-3 py-2 rounded text-sm shadow',
                  safeRecentPage <= 1 ? 'bg-gray-200 text-gray-500' : 'bg-white hover:bg-gray-100',
                ].join(' ')}
              >
                Previous
              </button>

              <div className="text-xs text-gray-600 min-w-[72px] text-center">
                Page {safeRecentPage} / {recentTotalPages}
              </div>

              <button
                type="button"
                onClick={() => setRecentPage((prev) => Math.min(prev + 1, recentTotalPages))}
                disabled={safeRecentPage >= recentTotalPages}
                className={[
                  'px-3 py-2 rounded text-sm shadow',
                  safeRecentPage >= recentTotalPages
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-white hover:bg-gray-100',
                ].join(' ')}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="divide-y">
          {archiveGroups.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No archived transactions found in the last 6 months.
            </div>
          ) : (
            archiveGroups.map((group) => {
              const totalPages = getTotalPages(group.rows.length, PAGE_SIZE)
              const currentPage = clampPage(archivePages[group.monthKey] ?? 1, totalPages)
              const monthRows = slicePage(group.rows, currentPage, PAGE_SIZE)

              return (
                <div key={group.monthKey}>
                  <div className="px-4 py-3 bg-gray-50 border-b">
                    <div className="font-semibold text-gray-800">{group.label}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {group.rows.length} archived transaction{group.rows.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  <TransactionsTable
                    rows={monthRows}
                    currency={currency}
                    emptyMessage={`No transactions in ${group.label}.`}
                  />

                  <div className="p-3 bg-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div className="text-xs text-gray-600">
                      Showing {group.rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-
                      {Math.min(currentPage * PAGE_SIZE, group.rows.length)} of {group.rows.length} items in{' '}
                      {group.label}.
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setArchivePages((prev) => ({
                            ...prev,
                            [group.monthKey]: Math.max((prev[group.monthKey] ?? 1) - 1, 1),
                          }))
                        }
                        disabled={currentPage <= 1}
                        className={[
                          'px-3 py-2 rounded text-sm shadow',
                          currentPage <= 1 ? 'bg-gray-200 text-gray-500' : 'bg-white hover:bg-gray-100',
                        ].join(' ')}
                      >
                        Previous
                      </button>

                      <div className="text-xs text-gray-600 min-w-[72px] text-center">
                        Page {currentPage} / {totalPages}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setArchivePages((prev) => ({
                            ...prev,
                            [group.monthKey]: Math.min((prev[group.monthKey] ?? 1) + 1, totalPages),
                          }))
                        }
                        disabled={currentPage >= totalPages}
                        className={[
                          'px-3 py-2 rounded text-sm shadow',
                          currentPage >= totalPages
                            ? 'bg-gray-200 text-gray-500'
                            : 'bg-white hover:bg-gray-100',
                        ].join(' ')}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}