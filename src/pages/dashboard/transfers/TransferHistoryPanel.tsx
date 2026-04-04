import React, { useMemo } from 'react'

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
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function getMovementLabel(value: string): string {
  if (value === 'free_agent') return 'Free Agent'
  if (value === 'release') return 'Release'
  return 'Transfer'
}

function HistoryColumn({
  title,
  rows,
  currentClubRiderIds,
  onOpenOwnedRiderProfile,
  onOpenExternalRiderProfile,
  onOpenClubProfile,
}: {
  title: string
  rows: TransferHistoryRow[]
  currentClubRiderIds: Set<string>
  onOpenOwnedRiderProfile?: (riderId: string) => void
  onOpenExternalRiderProfile?: (riderId: string) => void
  onOpenClubProfile?: (clubId: string) => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <h5 className="text-sm font-semibold text-gray-900">{title}</h5>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <div className="text-sm text-gray-500">No {title.toLowerCase()} yet.</div>
        ) : (
          rows.map((row) => {
            const counterpartyLabel =
              row.direction === 'arrival'
                ? row.from_club_name || 'Free Agent Market'
                : row.to_club_name || 'Free Agent Market'

            const counterpartyClubId =
              row.direction === 'arrival' ? row.from_club_id : row.to_club_id

            const isOwnedArrival =
              row.direction === 'arrival' &&
              !!row.rider_id &&
              currentClubRiderIds.has(row.rider_id)

            const handleOpenRider = () => {
              if (!row.rider_id) return

              if (isOwnedArrival) {
                onOpenOwnedRiderProfile?.(row.rider_id)
                return
              }

              onOpenExternalRiderProfile?.(row.rider_id)
            }

            return (
              <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {row.rider_id ? (
                      <button
                        type="button"
                        onClick={handleOpenRider}
                        className="truncate text-left text-sm font-semibold text-gray-900 hover:text-gray-700"
                      >
                        {row.rider_name || 'Unknown rider'}
                      </button>
                    ) : (
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {row.rider_name || 'Unknown rider'}
                      </div>
                    )}

                    <div className="mt-1 text-xs text-gray-600">
                      <span className="font-semibold text-gray-900">
                        {getMovementLabel(row.movement_type)}
                      </span>{' '}
                      • {row.direction === 'arrival' ? 'From' : 'To'}{' '}
                      {counterpartyClubId ? (
                        <button
                          type="button"
                          onClick={() => onOpenClubProfile?.(counterpartyClubId)}
                          className="font-medium text-gray-900 hover:text-gray-700"
                        >
                          {counterpartyLabel}
                        </button>
                      ) : (
                        <span className="font-medium text-gray-900">{counterpartyLabel}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-start gap-3">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        row.direction === 'arrival'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                      title={row.direction === 'arrival' ? 'Arrival' : 'Departure'}
                    >
                      {row.direction === 'arrival' ? '↓' : '↑'}
                    </span>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(row.amount)}
                      </div>
                      <div className="text-xs text-gray-500">{row.game_date || '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function TransferHistoryPanel({
  transferHistory,
  currentClubRiderIds = new Set<string>(),
  onOpenOwnedRiderProfile,
  onOpenExternalRiderProfile,
  onOpenClubProfile,
}: {
  transferHistory: TransferHistoryRow[]
  currentClubRiderIds?: Set<string>
  onOpenOwnedRiderProfile?: (riderId: string) => void
  onOpenExternalRiderProfile?: (riderId: string) => void
  onOpenClubProfile?: (clubId: string) => void
}): JSX.Element {
  const arrivals = useMemo(
    () => transferHistory.filter((row) => row.direction === 'arrival'),
    [transferHistory]
  )

  const departures = useMemo(
    () => transferHistory.filter((row) => row.direction === 'departure'),
    [transferHistory]
  )

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
      <h4 className="font-semibold text-gray-900">Transfer History</h4>

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HistoryColumn
          title="Arrivals"
          rows={arrivals}
          currentClubRiderIds={currentClubRiderIds}
          onOpenOwnedRiderProfile={onOpenOwnedRiderProfile}
          onOpenExternalRiderProfile={onOpenExternalRiderProfile}
          onOpenClubProfile={onOpenClubProfile}
        />

        <HistoryColumn
          title="Departures"
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