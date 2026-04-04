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

function TextActionButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="truncate text-left font-medium text-black no-underline hover:text-gray-700"
    >
      {label}
    </button>
  )
}

function HistoryColumn({
  title,
  rows,
  onOpenRiderProfile,
  onOpenTeamPage,
}: {
  title: string
  rows: TransferHistoryRow[]
  onOpenRiderProfile: (riderId: string) => void
  onOpenTeamPage: (clubId: string) => void
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

            return (
              <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {row.rider_id ? (
                        <TextActionButton
                          label={row.rider_name || 'Unknown rider'}
                          onClick={() => onOpenRiderProfile(row.rider_id!)}
                        />
                      ) : (
                        row.rider_name || 'Unknown rider'
                      )}
                    </div>

                    <div className="mt-1 text-xs text-gray-600">
                      <span className="font-semibold text-gray-900">
                        {getMovementLabel(row.movement_type)}
                      </span>{' '}
                      • {row.direction === 'arrival' ? 'From' : 'To'}{' '}
                      {counterpartyClubId ? (
                        <TextActionButton
                          label={counterpartyLabel}
                          onClick={() => onOpenTeamPage(counterpartyClubId)}
                        />
                      ) : (
                        <span className="font-medium text-gray-900">{counterpartyLabel}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(row.amount)}
                    </div>
                    <div className="text-xs text-gray-500">{row.game_date || '—'}</div>
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
  onOpenRiderProfile,
  onOpenTeamPage,
}: {
  transferHistory: TransferHistoryRow[]
  onOpenRiderProfile: (riderId: string) => void
  onOpenTeamPage: (clubId: string) => void
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
          onOpenRiderProfile={onOpenRiderProfile}
          onOpenTeamPage={onOpenTeamPage}
        />
        <HistoryColumn
          title="Departures"
          rows={departures}
          onOpenRiderProfile={onOpenRiderProfile}
          onOpenTeamPage={onOpenTeamPage}
        />
      </div>
    </div>
  )
}