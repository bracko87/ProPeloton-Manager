/**
 * TransactionsTab.tsx
 * Loads and displays the ledger-backed statement via RPC.
 *
 * Behavior:
 * - Uses RPC finance_get_club_statement_v2(p_club_id, p_limit, p_before).
 * - Recent view shows only the last 30 game days of transactions.
 * - Archive view shows older transactions grouped by in-game month.
 * - Archive keeps only the previous 6 game months.
 * - Transactions dated after the current in-game clock are hidden.
 * - Pagination is handled in the frontend with 20 items per page.
 * - Real-life created_at is used only as the RPC pagination cursor.
 * - Real-life created_at is also used as a hidden sorting fallback for old rows without game_date.
 * - Visible dates are based only on stored in-game date metadata.
 *
 * Important backend rule:
 * - created_at = real technical timestamp
 * - game_date = in-game date metadata
 * - Do not backfill old game_date values from created_at.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './supabase'
import {
  addGameDays,
  addGameMonths,
  formatGameDate,
  formatGameMonthLabel,
  getGameDateValue,
  getGameMonthKey,
  resolveGameDate,
  type GameDateParts,
} from './gameDate'

type StatementRow = {
  created_at: string
  transaction_id: string
  type: string
  type_name?: string | null
  category?: string | null
  net_amount: string | number
  metadata?: unknown
  game_date?: unknown
  in_game_date?: unknown
  gameDate?: unknown
  season?: string | number | null
  month?: string | number | null
  day?: string | number | null
  hour?: string | number | null
  minute?: string | number | null
}

type ViewMode = 'recent' | 'archive'

type ArchiveGroup = {
  monthKey: string
  label: string
  rows: StatementRow[]
}

type CurrencyCode = 'USD' | 'EUR'

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
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * getDateValue
 * Convert a real technical timestamp into a sortable numeric value.
 *
 * Important:
 * - This is used only as a hidden fallback for sorting old rows that do not
 *   have stored in-game date metadata.
 * - This value must never be used for visible Game Date display.
 */
function getDateValue(value: unknown): number {
  if (value === null || value === undefined) return 0

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : 0
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : 0
  }

  return 0
}

/**
 * getStatementGameDate
 * Resolve the transaction's stored in-game date.
 *
 * Supports:
 * - direct game date fields returned by the RPC
 * - nested metadata.game_date used by finance transaction metadata
 */
function getStatementGameDate(row: StatementRow): GameDateParts | null {
  const direct = resolveGameDate(row)

  if (direct) return direct

  if (row.metadata && typeof row.metadata === 'object') {
    const metadata = row.metadata as Record<string, unknown>
    const gameDate = metadata.game_date

    if (gameDate && typeof gameDate === 'object') {
      return resolveGameDate(gameDate)
    }
  }

  return null
}

/**
 * formatStatementGameDate
 * Format the transaction's in-game date.
 *
 * Rows without game_date intentionally show "—".
 * We do not display created_at as a fallback because created_at is real-life time.
 */
function formatStatementGameDate(row: StatementRow): string {
  const gameDate = getStatementGameDate(row)

  if (!gameDate) return '—'

  return formatGameDate(gameDate, true)
}

/**
 * getStatementGameDateValue
 * Convert the transaction's in-game date into a sortable value.
 */
function getStatementGameDateValue(row: StatementRow): number {
  return getGameDateValue(getStatementGameDate(row))
}

/**
 * getStatementSortValue
 * Sort by in-game date when available.
 *
 * For old finance rows without game date, use created_at only as a hidden
 * fallback so the UI still orders them sensibly without displaying real dates.
 */
function getStatementSortValue(row: StatementRow): number {
  const gameValue = getStatementGameDateValue(row)

  if (gameValue > 0) return gameValue

  return getDateValue(row.created_at)
}

/**
 * formatMoney
 * Format a number as a currency string.
 */
function formatMoney(n: number, currency: CurrencyCode = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * transactionTypeLabelKeyMap
 * Translation keys for known backend finance transaction types.
 *
 * Important:
 * - The backend transaction type code itself is never changed.
 * - Unknown/future transaction types continue through the existing prettifying fallback.
 */
const transactionTypeLabelKeyMap = {
  sponsor_contract_payment: 'transactionLabels.sponsorContractPayment',
  tax_withholding: 'transactionLabels.taxWithholding',

  rider_salary_payday: 'transactionLabels.riderSalaryPayday',
  staff_salary_payday: 'transactionLabels.staffSalaryPayday',

  new_club_bonus: 'transactionLabels.newClubBonus',

  staff_course_fee: 'transactionLabels.staffCourseFee',
  staff_release_cost: 'transactionLabels.staffReleaseCost',

  infrastructure_facility_start: 'transactionLabels.infrastructureFacilityStart',
  infrastructure_asset_start: 'transactionLabels.infrastructureAssetStart',
  infrastructure_asset_repair: 'transactionLabels.infrastructureAssetRepair',
  infrastructure_asset_sale: 'transactionLabels.infrastructureAssetSale',
  infrastructure_job_refund: 'transactionLabels.infrastructureJobRefund',

  team_policy_housing_cost: 'transactionLabels.teamPolicyHousingCost',
} as const

/**
 * prettifyTransactionType
 * Preserve the existing fallback for unknown/future backend transaction types.
 */
function prettifyTransactionType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * sortRowsByGameDateDesc
 * Sort transactions from newest to oldest.
 *
 * Primary sort:
 * - stored in-game date
 *
 * Compatibility fallback:
 * - real created_at only for old rows missing game_date
 *
 * Display still never uses created_at.
 */
function sortRowsByGameDateDesc(rows: StatementRow[]): StatementRow[] {
  return [...rows].sort((a, b) => {
    const diff = getStatementSortValue(b) - getStatementSortValue(a)

    if (diff !== 0) return diff

    return String(b.transaction_id).localeCompare(String(a.transaction_id))
  })
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
 * getCreatedAtCursor
 * Returns the real-life created_at cursor used only for RPC pagination.
 *
 * Important:
 * - This does not affect visible date display.
 * - It is only needed because finance_get_club_statement_v2 uses p_before.
 */
function getCreatedAtCursor(rows: StatementRow[]): string | null {
  return rows[rows.length - 1]?.created_at ?? null
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
  currency: CurrencyCode
  emptyMessage: string
}): JSX.Element {
  const { t } = useTranslation('finance')

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left p-3 whitespace-nowrap">{t('transactions.gameDate')}</th>
            <th className="text-left p-3">{t('transactions.type')}</th>
            <th className="text-left p-3 whitespace-nowrap">{t('transactions.amount')}</th>
            <th
              className="p-3 pr-4 text-right whitespace-nowrap"
              style={{ width: '1%' }}
            >
              {t('transactions.transaction')}
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-4 text-gray-600">
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
                  <td className="p-3 text-gray-700 whitespace-nowrap">
                    {formatStatementGameDate(r)}
                  </td>

                  <td className="p-3 font-medium text-gray-800 whitespace-nowrap">
                    <span title={r.type || undefined}>
                      {!r.type
                        ? t('transactions.transaction')
                        : transactionTypeLabelKeyMap[
                            r.type as keyof typeof transactionTypeLabelKeyMap
                          ]
                          ? t(
                              transactionTypeLabelKeyMap[
                                r.type as keyof typeof transactionTypeLabelKeyMap
                              ],
                            )
                          : prettifyTransactionType(r.type)}
                    </span>
                  </td>

                  <td className={`p-3 font-semibold whitespace-nowrap ${amountColorClass}`}>
                    {formatMoney(amt, currency)}
                  </td>

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
  currency = 'USD',
}: {
  clubId: string
  currency?: CurrencyCode
}): JSX.Element {
  const { t } = useTranslation('finance')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StatementRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('recent')
  const [recentPage, setRecentPage] = useState(1)
  const [archivePages, setArchivePages] = useState<Record<string, number>>({})
  const [currentGameDate, setCurrentGameDate] = useState<GameDateParts | null>(null)

  /**
   * loadTransactions
   * Load enough transactions to cover recent data and the previous 6 archive game months.
   */
  async function loadTransactions(): Promise<void> {
    setLoading(true)

    let loadedCurrentGameDate: GameDateParts | null = null

    const gameStateRes = await supabase
      .from('game_state')
      .select('season_number, month_number, day_number, hour_number, minute_number')
      .eq('id', true)
      .single()

    if (!gameStateRes.error && gameStateRes.data) {
      loadedCurrentGameDate = {
        season: Number(gameStateRes.data.season_number),
        month: Number(gameStateRes.data.month_number),
        day: Number(gameStateRes.data.day_number),
        hour: Number(gameStateRes.data.hour_number ?? 0),
        minute: Number(gameStateRes.data.minute_number ?? 0),
      }

      setCurrentGameDate(loadedCurrentGameDate)
    } else {
      setCurrentGameDate(null)
    }

    const archiveCutoffValue = loadedCurrentGameDate
      ? getGameDateValue(addGameMonths(loadedCurrentGameDate, -ARCHIVE_MONTHS))
      : 0

    let before: string | null = null
    let requestCount = 0
    let collected: StatementRow[] = []

    while (requestCount < MAX_RPC_REQUESTS) {
      const res = await supabase.rpc('finance_get_club_statement_v2', {
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

      const rawRows = (res.data ?? []) as StatementRow[]
      const data = sortRowsByGameDateDesc(rawRows)

      if (data.length === 0) {
        break
      }

      collected = [...collected, ...data]

      before = getCreatedAtCursor(rawRows)
      requestCount += 1

      const loadedGameDateValues = data
        .map((row) => getStatementGameDateValue(row))
        .filter((value) => value > 0)

      const oldestLoadedGameDate =
        loadedGameDateValues.length > 0 ? Math.min(...loadedGameDateValues) : 0

      if (
        !before ||
        data.length < RPC_BATCH_SIZE ||
        (archiveCutoffValue > 0 &&
          oldestLoadedGameDate > 0 &&
          oldestLoadedGameDate < archiveCutoffValue)
      ) {
        break
      }
    }

    const currentGameDateValue = loadedCurrentGameDate
      ? getGameDateValue(loadedCurrentGameDate)
      : 0

    const normalizedRows = sortRowsByGameDateDesc(dedupeRows(collected)).filter((row) => {
      const rowGameDateValue = getStatementGameDateValue(row)

      // Keep legacy rows that do not have stored game-date metadata.
      // If the current game date could not be resolved, do not hide valid ledger rows.
      if (rowGameDateValue <= 0 || currentGameDateValue <= 0) return true

      // A rewind/test reset can leave immutable ledger rows from a future season/date.
      // They must not appear in the current Recent/Archive views until the game reaches them again.
      return rowGameDateValue <= currentGameDateValue
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

  const recentCutoff = useMemo(() => {
    if (!currentGameDate) return 0
    return getGameDateValue(addGameDays(currentGameDate, -RECENT_DAYS))
  }, [currentGameDate])

  const archiveCutoff = useMemo(() => {
    if (!currentGameDate) return 0
    return getGameDateValue(addGameMonths(currentGameDate, -ARCHIVE_MONTHS))
  }, [currentGameDate])

  const recentRows = useMemo(() => {
    return rows.filter((row) => {
      const value = getStatementGameDateValue(row)

      // Old ledger rows without game_date stay visible.
      // The UI will show "—" instead of using real-life created_at.
      if (value <= 0) return true

      return value >= recentCutoff
    })
  }, [rows, recentCutoff])

  const archiveGroups = useMemo<ArchiveGroup[]>(() => {
    const archiveRows = rows.filter((row) => {
      const time = getStatementGameDateValue(row)

      // Missing game-date rows stay in Recent for now.
      if (time <= 0) return false

      return time < recentCutoff && time >= archiveCutoff
    })

    const grouped = new Map<string, StatementRow[]>()

    archiveRows.forEach((row) => {
      const monthKey = getGameMonthKey(getStatementGameDate(row))
      const existing = grouped.get(monthKey) ?? []
      existing.push(row)
      grouped.set(monthKey, existing)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, ARCHIVE_MONTHS)
      .map(([monthKey, monthRows]) => ({
        monthKey,
        label: formatGameMonthLabel(monthKey),
        rows: sortRowsByGameDateDesc(monthRows),
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
            <h4 className="font-semibold">{t('transactions.title')}</h4>
            <div className="text-sm text-gray-500 mt-1">
              {t('transactions.description')}
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
              {t('transactions.title')}
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
              {t('transactions.archive')}
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
            emptyMessage={t('transactions.noRecent')}
          />

          <div className="p-3 border-t bg-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="text-xs text-gray-600">
              {t('transactions.showRecent', {
                start: recentRows.length === 0 ? 0 : (safeRecentPage - 1) * PAGE_SIZE + 1,
                end: Math.min(safeRecentPage * PAGE_SIZE, recentRows.length),
                total: recentRows.length,
              })}
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
                {t('common.previous')}
              </button>

              <div className="text-xs text-gray-600 min-w-[72px] text-center">
                {t('transactions.page', {
                  page: safeRecentPage,
                  total: recentTotalPages,
                })}
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
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="divide-y">
          {archiveGroups.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              {t('transactions.noArchive')}
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
                      {t(
                        group.rows.length === 1
                          ? 'transactions.archiveCount'
                          : 'transactions.archiveCountPlural',
                        { count: group.rows.length },
                      )}
                    </div>
                  </div>

                  <TransactionsTable
                    rows={monthRows}
                    currency={currency}
                    emptyMessage={t('transactions.noMonth', { month: group.label })}
                  />

                  <div className="p-3 bg-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div className="text-xs text-gray-600">
                      {t('transactions.showMonth', {
                        start: group.rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1,
                        end: Math.min(currentPage * PAGE_SIZE, group.rows.length),
                        total: group.rows.length,
                        month: group.label,
                      })}
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
                          currentPage <= 1
                            ? 'bg-gray-200 text-gray-500'
                            : 'bg-white hover:bg-gray-100',
                        ].join(' ')}
                      >
                        {t('common.previous')}
                      </button>

                      <div className="text-xs text-gray-600 min-w-[72px] text-center">
                        {t('transactions.page', {
                          page: currentPage,
                          total: totalPages,
                        })}
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
                        {t('common.next')}
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
