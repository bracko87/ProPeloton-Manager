import React, { useEffect, useMemo, useState } from 'react'

const TRANSFER_HISTORY_ITEMS_PER_PAGE = 5

export type TransferHistoryRow = {
  id: string
  direction: 'arrival' | 'departure'
  movement_type: 'transfer' | 'free_agent' | 'release' | string
  rider_id: string | null
  rider_name: string
  from_club_id: string | null
  from_club_name: string | null
  to_club_id: string | null
  to_club_name: string | null
  amount: number | null
  game_date: string | null
  completed_at?: string | null
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function isFreeAgentMarketPlaceholder(value: string | null | undefined) {
  const normalized = normalizeText(value)

  return (
    normalized === 'listed on free agent market' ||
    normalized === 'free agent market'
  )
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function getHistoryAmountLabel(row: TransferHistoryRow): string {
  if (row.movement_type === 'release') return 'Released'
  if (row.movement_type === 'free_agent') return 'Free Transfer'
  return formatCurrency(row.amount)
}

function formatHistoryGameDate(value: string | null | undefined): string {
  if (!value) return '—'

  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value

  const seasonNumber = Math.max(1, parsed.getUTCFullYear() - 1999)

  const weekday = parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })

  const monthDay = parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return `Season ${seasonNumber} - ${weekday} - ${monthDay}`
}

function getMovementLabel(value: string): string {
  if (value === 'free_agent') return 'Free Agent'
  if (value === 'release') return 'Free Agent Market'
  return 'Transfer'
}

function HistoryColumn({
  title,
  direction,
  rows = [],
  currentClubRiderIds,
  onOpenOwnedRiderProfile,
  onOpenExternalRiderProfile,
  onOpenClubProfile,
}: {
  title: string
  direction: 'arrival' | 'departure'
  rows?: TransferHistoryRow[]
  currentClubRiderIds: Set<string>
  onOpenOwnedRiderProfile: (riderId: string) => void
  onOpenExternalRiderProfile: (riderId: string) => void
  onOpenClubProfile: (clubId: string) => void
}) {
  const [page, setPage] = useState(1)

  const sortedRows = useMemo(() => {
    const safeRows = Array.isArray(rows) ? [...rows] : []

    safeRows.sort((a, b) => {
      const aTime = a.completed_at
        ? new Date(a.completed_at).getTime()
        : a.game_date
          ? new Date(`${a.game_date}T00:00:00Z`).getTime()
          : 0

      const bTime = b.completed_at
        ? new Date(b.completed_at).getTime()
        : b.game_date
          ? new Date(`${b.game_date}T00:00:00Z`).getTime()
          : 0

      return bTime - aTime
    })

    return safeRows
  }, [rows])

  const totalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / TRANSFER_HISTORY_ITEMS_PER_PAGE)
  )

  useEffect(() => {
    setPage(1)
  }, [sortedRows.length])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const paginatedRows = useMemo(() => {
    const startIndex = (page - 1) * TRANSFER_HISTORY_ITEMS_PER_PAGE
    return sortedRows.slice(
      startIndex,
      startIndex + TRANSFER_HISTORY_ITEMS_PER_PAGE
    )
  }, [sortedRows, page])

  const cardClassName =
    direction === 'arrival'
      ? 'flex items-center justify-between gap-3 rounded-lg border border-green-100 bg-green-50/60 px-4 py-3'
      : 'flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/60 px-4 py-3'

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>

      <div className="mt-4 space-y-3">
        {paginatedRows.length ? (
          paginatedRows.map((row) => {
            const isOwned =
              row.rider_id != null && currentClubRiderIds.has(row.rider_id)

            const movementLabel = getMovementLabel(row.movement_type)

            const counterpartyName =
              row.direction === 'arrival'
                ? row.from_club_name
                : row.to_club_name

            const showCounterparty =
              !!counterpartyName &&
              !isFreeAgentMarketPlaceholder(counterpartyName)

            const counterpartyPrefix =
              row.direction === 'arrival' ? 'From' : 'To'

            return (
              <div key={row.id} className={cardClassName}>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!row.rider_id) return
                      if (isOwned) {
                        onOpenOwnedRiderProfile(row.rider_id)
                      } else {
                        onOpenExternalRiderProfile(row.rider_id)
                      }
                    }}
                    className="truncate text-left text-base font-semibold text-gray-900 hover:underline"
                  >
                    {row.rider_name || 'Unknown rider'}
                  </button>

                  <div className="mt-1 text-sm text-gray-600">
                    {!showCounterparty ? (
                      <>{movementLabel}</>
                    ) : (
                      <>
                        {movementLabel} • {counterpartyPrefix}{' '}
                        {row.direction === 'arrival' ? (
                          row.from_club_id ? (
                            <button
                              type="button"
                              onClick={() => onOpenClubProfile(row.from_club_id)}
                              className="font-medium text-gray-700 hover:underline"
                            >
                              {counterpartyName || 'Unknown club'}
                            </button>
                          ) : (
                            <span className="font-medium text-gray-700">
                              {counterpartyName || 'Unknown club'}
                            </span>
                          )
                        ) : row.to_club_id ? (
                          <button
                            type="button"
                            onClick={() => onOpenClubProfile(row.to_club_id)}
                            className="font-medium text-gray-700 hover:underline"
                          >
                            {counterpartyName || 'Unknown club'}
                          </button>
                        ) : (
                          <span className="font-medium text-gray-700">
                            {counterpartyName || 'Unknown club'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {getHistoryAmountLabel(row)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatHistoryGameDate(row.game_date)}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
            No history yet.
          </div>
        )}
      </div>

      {sortedRows.length > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            Showing {(page - 1) * TRANSFER_HISTORY_ITEMS_PER_PAGE + 1}-
            {Math.min(page * TRANSFER_HISTORY_ITEMS_PER_PAGE, sortedRows.length)} of{' '}
            {sortedRows.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              First
            </button>

            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <div className="text-sm text-gray-600">
              Page {page} / {totalPages}
            </div>

            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>

            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function TransferHistoryPanel({
  transferHistory = [],
  currentClubRiderIds = new Set<string>(),
  onOpenOwnedRiderProfile = () => {},
  onOpenExternalRiderProfile = () => {},
  onOpenClubProfile = () => {},
}: {
  transferHistory?: TransferHistoryRow[]
  currentClubRiderIds?: Set<string>
  onOpenOwnedRiderProfile?: (riderId: string) => void
  onOpenExternalRiderProfile?: (riderId: string) => void
  onOpenClubProfile?: (clubId: string) => void
}): JSX.Element {
  const safeHistory = Array.isArray(transferHistory) ? transferHistory : []

  const arrivals = useMemo(
    () => safeHistory.filter((row) => row.direction === 'arrival'),
    [safeHistory]
  )

  const departures = useMemo(
    () => safeHistory.filter((row) => row.direction === 'departure'),
    [safeHistory]
  )

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
      <h4 className="font-semibold text-gray-900">Transfer History</h4>

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HistoryColumn
          title="Arrivals"
          direction="arrival"
          rows={arrivals}
          currentClubRiderIds={currentClubRiderIds}
          onOpenOwnedRiderProfile={onOpenOwnedRiderProfile}
          onOpenExternalRiderProfile={onOpenExternalRiderProfile}
          onOpenClubProfile={onOpenClubProfile}
        />

        <HistoryColumn
          title="Departures"
          direction="departure"
          rows={departures}
          currentClubRiderIds={currentClubRiderIds}
          onOpenOwnedRiderProfile={onOpenOwnedRiderProfile}
          onOpenExternalRiderProfile={onOpenExternalRiderProfile}
          onOpenClubProfile={onOpenClubProfile}
        />
      </div>
    </div>
  )
}