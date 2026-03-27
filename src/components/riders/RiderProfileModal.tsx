/**
 * src/components/riders/RiderProfileModal.tsx
 */

import React from 'react'

type RiderProfileModalProps = {
  rider: {
    id?: string
    display_name?: string
    country_code?: string | null
    role?: string | null
    overall?: number | null
    potential?: number | null
    sprint?: number | null
    climbing?: number | null
    time_trial?: number | null
    endurance?: number | null
    flat?: number | null
    recovery?: number | null
    resistance?: number | null
    race_iq?: number | null
    teamwork?: number | null
    morale?: number | null
    birth_date?: string | null
    market_value?: number | null
    salary?: number | null
    contract_expires_season?: number | null
    availability_status?: string | null
    fatigue?: number | null
    image_url?: string | null
    club_id?: string | null
    club_name?: string | null
    club_country_code?: string | null
    club_tier?: string | null
    club_is_ai?: boolean | null
    club_is_active?: boolean | null
    age_years?: number | null
    season_points_overall?: number
    season_points_sprint?: number
    season_points_climbing?: number
  } | null
  isOpen: boolean
  onClose: () => void
  onOpenTeamProfile: () => void
  isRiderScouted: boolean
  setIsRiderScouted: React.Dispatch<React.SetStateAction<boolean>>
  showRiderHistory: boolean
  setShowRiderHistory: React.Dispatch<React.SetStateAction<boolean>>
  countryNameByCode: Map<string, string>
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Number(value).toLocaleString('de-DE')}`
}

function getCountryName(
  countryCode: string | null | undefined,
  countryNameByCode: Map<string, string>
) {
  if (!countryCode) return 'Unknown'
  return countryNameByCode.get(countryCode.toUpperCase()) || countryCode.toUpperCase()
}

export default function RiderProfileModal({
  rider,
  isOpen,
  onClose,
  onOpenTeamProfile,
  isRiderScouted,
  setIsRiderScouted,
  showRiderHistory,
  setShowRiderHistory,
  countryNameByCode,
}: RiderProfileModalProps) {
  if (!isOpen || !rider) return null

  const stats = [
    { label: 'OVR', value: rider.overall },
    { label: 'POT', value: rider.potential },
    { label: 'Sprint', value: rider.sprint },
    { label: 'Climbing', value: rider.climbing },
    { label: 'TT', value: rider.time_trial },
    { label: 'Endurance', value: rider.endurance },
    { label: 'Flat', value: rider.flat },
    { label: 'Recovery', value: rider.recovery },
    { label: 'Resistance', value: rider.resistance },
    { label: 'Race IQ', value: rider.race_iq },
    { label: 'Teamwork', value: rider.teamwork },
    { label: 'Morale', value: rider.morale },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {rider.display_name || 'Unknown rider'}
            </h3>
            <div className="mt-1 text-sm text-gray-500">
              {rider.role || '—'} • Age {rider.age_years ?? '—'} •{' '}
              {getCountryName(rider.country_code, countryNameByCode)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
              {rider.image_url ? (
                <img
                  src={rider.image_url}
                  alt={rider.display_name || 'Rider'}
                  className="h-72 w-full object-cover"
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-gray-400">
                  No image
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Club:</span>{' '}
                <span className="font-medium text-gray-900">
                  {rider.club_name || 'No club'}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Market value:</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatCurrency(rider.market_value)}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Salary:</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatCurrency(rider.salary)}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Availability:</span>{' '}
                <span className="font-medium text-gray-900">
                  {rider.availability_status || '—'}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Contract season:</span>{' '}
                <span className="font-medium text-gray-900">
                  {rider.contract_expires_season ?? '—'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">{stat.label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {stat.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Season Points</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_overall ?? 0}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Sprint Points</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_sprint ?? 0}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Climbing Points</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_climbing ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsRiderScouted((prev) => !prev)}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
              >
                {isRiderScouted ? 'Unmark Scouted' : 'Mark as Scouted'}
              </button>

              <button
                type="button"
                onClick={() => setShowRiderHistory((prev) => !prev)}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {showRiderHistory ? 'Hide History' : 'Show History'}
              </button>

              <button
                type="button"
                onClick={onOpenTeamProfile}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open Team
              </button>
            </div>

            {showRiderHistory ? (
              <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                Rider history panel placeholder.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}