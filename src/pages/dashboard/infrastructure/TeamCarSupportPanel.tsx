import React, { useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabase'
import type {
  InfrastructureAssetActionTarget,
  InfrastructureAssetConfigRow,
  TeamCarRosterRow,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDate,
  toNumber,
} from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type TeamCarSupportPanelProps = {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: TeamCarRosterRow[]
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
}

type TeamCarRecentRaceRow = {
  race_id: string
  race_name: string
  category: string | null
  race_type: string | null
  country_code: string | null
  first_used_game_date: string | null
  last_used_game_date: string | null
  stages_used: number
  distance_km: string | number
  condition_loss: string | number
}

function splitBenefits(summary: string | null | undefined): string[] {
  return String(summary ?? '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
}

function formatPercent(value: number, maximumFractionDigits = 2): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}%`
}

function formatEffectiveness(factor: unknown): string {
  return formatPercent(toNumber(factor, 0) * 100, 0)
}

function scaleBenefitLine(line: string, factor: number): string {
  return line.replace(
    /([+-])(\d+(?:\.\d+)?)%/g,
    (_match, sign: string, raw: string) => {
      const scaled = Number(raw) * factor
      return `${sign}${scaled.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}%`
    },
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function wearForDistance(baseWear: number, distanceMultiplier: number): number {
  if (baseWear <= 0) return 0
  return clamp(baseWear * clamp(distanceMultiplier, 0.6, 1.6), 0.05, 2.5)
}

function conditionBand(condition: number): string {
  if (condition >= 80) return 'Full effectiveness'
  if (condition >= 60) return 'Slightly reduced'
  if (condition >= 40) return 'Reduced'
  if (condition >= 30) return 'Poor / limited'
  return 'Not race-ready'
}

function estimatedReferenceStagesBeforeService(
  condition: number,
  baseWear: number,
  minimumCondition: number,
): number {
  if (baseWear <= 0 || condition <= minimumCondition) return 0
  return Math.max(0, Math.floor((condition - minimumCondition) / baseWear))
}

function countryFlag(countryCode: string | null): string {
  const code = String(countryCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return '🏁'
  return String.fromCodePoint(...[...code].map(char => 127397 + char.charCodeAt(0)))
}

function formatRaceDateRange(first: string | null, last: string | null): string {
  const firstDate = first ? new Date(`${first}T00:00:00Z`) : null
  const lastDate = last ? new Date(`${last}T00:00:00Z`) : firstDate
  if (!firstDate || Number.isNaN(firstDate.getTime())) return '—'

  const firstMonth = firstDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const firstDay = firstDate.getUTCDate()
  if (!lastDate || Number.isNaN(lastDate.getTime()) || first === last) return `${firstMonth} ${String(firstDay).padStart(2, '0')}`

  const lastMonth = lastDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const lastDay = lastDate.getUTCDate()
  if (firstMonth === lastMonth) return `${firstMonth} ${String(firstDay).padStart(2, '0')}–${String(lastDay).padStart(2, '0')}`
  return `${firstMonth} ${String(firstDay).padStart(2, '0')}–${lastMonth} ${String(lastDay).padStart(2, '0')}`
}

function TeamCarImage({
  level,
  name,
  large = false,
}: {
  level: number
  name: string
  large?: boolean
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('team_car', level)

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 ${
          large ? 'min-h-[260px]' : 'h-20 w-28'
        }`}
      >
        <span className="text-3xl" aria-hidden="true">🚙</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${
        large ? 'min-h-[260px]' : 'h-20 w-28 shrink-0'
      }`}
    >
      <img
        src={imageUrl}
        alt={`${name} level ${level}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${large ? 'max-h-[390px] w-full' : 'h-full w-full'} object-contain`}
      />
    </div>
  )
}

function buildActionTarget(
  car: TeamCarRosterRow,
  assetName: string,
): InfrastructureAssetActionTarget {
  return {
    assetKey: 'team_car',
    assetId: car.car_id,
    displayName: car.display_name || assetName,
    assetName,
    assetLevel: car.asset_level,
    conditionPercent: car.condition_percent,
    status: car.status,
  }
}

function currentStatusCopy(car: TeamCarRosterRow): {
  label: string
  detail: string
  tone: string
} {
  if (car.status === 'in_repair') {
    return {
      label: 'In repair',
      detail: car.repair_complete_game_date
        ? `Repair scheduled to finish ${formatGameDate(car.repair_complete_game_date)}.`
        : 'This car is currently being repaired and cannot be assigned.',
      tone: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  if (car.status === 'assigned' || car.assignment_locked) {
    const assignment = car.current_assignment_label || 'current race assignment'
    const until = car.assignment_end_game_date
      ? ` until ${formatGameDate(car.assignment_end_game_date)}`
      : ''
    return {
      label: 'Assigned to race',
      detail: `${assignment}${until}. Repair and sale are locked while this assignment is active.`,
      tone: 'border-blue-200 bg-blue-50 text-blue-900',
    }
  }

  if (car.status === 'available') {
    return {
      label: 'In garage · Available',
      detail: 'This car is currently free in the garage and can be assigned, repaired or sold when eligible.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    }
  }

  return {
    label: String(car.status).replaceAll('_', ' '),
    detail: 'Current asset status from the Team Car garage.',
    tone: 'border-slate-200 bg-slate-50 text-slate-800',
  }
}

function TeamCarProfileModal({
  car,
  config,
  onOpenAssetRepair,
  onOpenAssetSell,
  onClose,
}: {
  car: TeamCarRosterRow
  config: InfrastructureAssetConfigRow
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onClose: () => void
}): JSX.Element {
  const [recentRaces, setRecentRaces] = useState<TeamCarRecentRaceRow[]>([])
  const [recentRacesLoading, setRecentRacesLoading] = useState(true)
  const [recentRacesError, setRecentRacesError] = useState<string | null>(null)

  const condition = toNumber(car.condition_percent, 0)
  const factor = toNumber(car.condition_factor, 0)
  const baseWear = toNumber(car.condition_loss_per_race_day ?? config.condition_loss_per_race_day, 0)
  const minimumCondition = toNumber(car.min_assign_condition_percent ?? config.min_assign_condition_percent, 30)
  const repairCostPerPoint = toNumber(car.repair_cost_per_condition_point ?? config.repair_cost_per_condition_point, 0)
  const repairPointsPerDay = toNumber(car.repair_points_per_game_day ?? config.repair_points_per_game_day, 0)
  const missingCondition = Math.max(0, 100 - condition)
  const currentRepairCost = Math.ceil(missingCondition * repairCostPerPoint)
  const currentRepairDays =
    missingCondition <= 0 || repairPointsPerDay <= 0
      ? 0
      : Math.max(1, Math.ceil(missingCondition / repairPointsPerDay))
  const referenceStages = estimatedReferenceStagesBeforeService(condition, baseWear, minimumCondition)
  const shortStageWear = wearForDistance(baseWear, 0.6)
  const longStageWear = wearForDistance(baseWear, 1.6)
  const benefits = splitBenefits(config.effect_summary)
  const name = config.asset_name || car.asset_name || `Team Car Level ${car.asset_level}`
  const canRepair = condition < 100 && car.status !== 'assigned' && car.status !== 'in_repair' && !car.assignment_locked
  const canSell = car.status !== 'assigned' && !car.assignment_locked
  const actionTarget = buildActionTarget(car, name)
  const statusCopy = currentStatusCopy(car)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false

    async function loadRecentRaces(): Promise<void> {
      setRecentRacesLoading(true)
      setRecentRacesError(null)
      const { data, error } = await supabase.rpc('get_team_car_recent_races_v1', {
        p_team_car_id: car.car_id,
        p_limit: 5,
      })
      if (cancelled) return

      if (error) {
        setRecentRaces([])
        setRecentRacesError('Race history could not be loaded.')
      } else {
        setRecentRaces((data ?? []) as TeamCarRecentRaceRow[])
      }
      setRecentRacesLoading(false)
    }

    void loadRecentRaces()
    return () => {
      cancelled = true
    }
  }, [car.car_id])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} profile`}
        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Team Car · Level {car.asset_level}</div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{name}</h3>
            {car.display_name && car.display_name !== name && (
              <div className="mt-1 text-sm text-gray-500">{car.display_name}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <TeamCarImage level={car.asset_level} name={name} large />

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <div>
                <div className="text-xs text-gray-400">Purchase value</div>
                <div className="mt-1 font-semibold text-gray-900">{formatCash(car.purchase_cost_cash || config.cost_cash)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Status</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">{String(car.status).replaceAll('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Race days used</div>
                <div className="mt-1 font-semibold text-gray-900">{toNumber(car.total_race_days, 0).toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Distance covered</div>
                <div className="mt-1 font-semibold text-gray-900">{toNumber(car.total_distance_km, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} km</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-400">Last used</div>
                <div className="mt-1 font-semibold text-gray-900">{car.last_used_game_date ? formatGameDate(car.last_used_game_date) : 'Not used yet'}</div>
              </div>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900">Last 5 races used</h4>
              <p className="mt-0.5 text-xs text-gray-500">Finished race usage for this exact car.</p>

              {recentRacesLoading ? (
                <div className="mt-3 rounded-xl bg-gray-50 px-3 py-4 text-xs text-gray-500">Loading race history…</div>
              ) : recentRacesError ? (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-3 text-xs text-red-700">{recentRacesError}</div>
              ) : recentRaces.length === 0 ? (
                <div className="mt-3 rounded-xl bg-gray-50 px-3 py-4 text-xs text-gray-500">No race usage recorded yet.</div>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {recentRaces.map(race => (
                    <div
                      key={race.race_id}
                      className="flex min-h-[42px] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="w-[82px] shrink-0 text-center text-[11px] font-semibold text-gray-800">
                        {formatRaceDateRange(race.first_used_game_date, race.last_used_game_date)}
                      </div>
                      <div className="h-7 w-px shrink-0 bg-emerald-400" />
                      <div className="w-6 shrink-0 text-center text-lg" title={race.country_code ?? undefined}>
                        {countryFlag(race.country_code)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-gray-900">{race.race_name}</div>
                          {race.category && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              {race.category}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                          <span>{race.stages_used} stage{race.stages_used === 1 ? '' : 's'}</span>
                          <span>· {toNumber(race.distance_km, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} km</span>
                          {race.race_type && <span>· {race.race_type.replaceAll('_', ' ')}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-gray-400">
                        -{formatPercent(toNumber(race.condition_loss, 0))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-4">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenAssetRepair(actionTarget)
                }}
                disabled={!canRepair}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  canRepair
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'cursor-not-allowed bg-gray-200 text-gray-500'
                }`}
              >
                Repair
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenAssetSell(actionTarget)
                }}
                disabled={!canSell}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  canSell
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'cursor-not-allowed bg-gray-200 text-gray-500'
                }`}
              >
                Sell
              </button>
            </div>

            <div className={`rounded-2xl border p-4 ${statusCopy.tone}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Current car status</div>
              <div className="mt-1 text-sm font-semibold">{statusCopy.label}</div>
              <div className="mt-1 text-xs leading-5 opacity-80">{statusCopy.detail}</div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Race Benefits</h4>
                  <p className="mt-1 text-xs text-gray-500">Current values below are the values that feed the race-plan bonus pipeline.</p>
                </div>
                <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">
                  {formatEffectiveness(factor)} effectiveness
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {benefits.map(benefit => {
                  const currentBenefit = scaleBenefitLine(benefit, factor)
                  const reduced = currentBenefit !== benefit
                  return (
                    <div
                      key={benefit}
                      className="flex flex-col gap-1 rounded-xl border border-blue-100 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium text-gray-800">{benefit}</span>
                      <span className={`text-xs font-semibold ${reduced ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {reduced ? `Current: ${currentBenefit}` : 'Full value active'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Condition</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Current condition</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(condition)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Current effectiveness</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatEffectiveness(factor)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Race-ready minimum</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(minimumCondition, 0)}</div></div>
              </div>
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                {conditionBand(condition)}. Effectiveness bands: 80–100% = 100%; 60–79% = 90%; 40–59% = 75%; 30–39% = 60%; below 30% cannot be assigned.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Wear per stage</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Short stage floor</div><div className="mt-1 font-semibold text-gray-900">{formatPercent(shortStageWear)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">120 km reference</div><div className="mt-1 font-semibold text-gray-900">{formatPercent(baseWear)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Long stage ceiling</div><div className="mt-1 font-semibold text-gray-900">{formatPercent(longStageWear)}</div></div>
              </div>
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                The race engine applies wear after every stage. The configured level value is the 120 km reference; distance scales it from 60% to 160%. At the current condition this car supports about {referenceStages} reference stages before reaching the {formatPercent(minimumCondition, 0)} service threshold.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Maintenance</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Repair / condition point</div><div className="mt-1 font-semibold text-gray-900">{formatCash(repairCostPerPoint)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Current full repair estimate</div><div className="mt-1 font-semibold text-gray-900">{formatCash(currentRepairCost)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Current repair time</div><div className="mt-1 font-semibold text-gray-900">{currentRepairDays === 0 ? 'No repair needed' : `${currentRepairDays} game day${currentRepairDays === 1 ? '' : 's'}`}</div></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                A completed repair restores the car to 100% condition. Repairs use {formatPercent(repairPointsPerDay, 0)} condition points per game day and can only start while the car is available and not locked to a race.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TeamCarSupportPanel({
  configRows,
  rosterRows,
  onOpenAssetRepair,
  onOpenAssetSell,
}: TeamCarSupportPanelProps): JSX.Element {
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [isEngineValuesOpen, setIsEngineValuesOpen] = useState(false)

  const sortedConfig = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )
  const selectedCar = useMemo(
    () => rosterRows.find(car => car.car_id === selectedCarId) ?? null,
    [rosterRows, selectedCarId],
  )
  const selectedConfig = useMemo(
    () => selectedCar
      ? configRows.find(config => config.asset_level === selectedCar.asset_level) ?? null
      : null,
    [configRows, selectedCar],
  )

  useEffect(() => {
    if (selectedCarId && !rosterRows.some(car => car.car_id === selectedCarId)) {
      setSelectedCarId(null)
    }
  }, [rosterRows, selectedCarId])

  return (
    <>
      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Your Team Cars</h3>
            <p className="mt-0.5 text-xs text-gray-500">Open Details to see current benefits, race history and asset actions.</p>
          </div>
          <div className="text-xs font-semibold text-gray-500">{rosterRows.length} owned</div>
        </div>

        {rosterRows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">No Team Cars owned yet.</div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {rosterRows.map(car => {
              const config = configRows.find(row => row.asset_level === car.asset_level)
              const name = config?.asset_name || car.asset_name || `Team Car Level ${car.asset_level}`
              const baseWear = toNumber(car.condition_loss_per_race_day ?? config?.condition_loss_per_race_day, 0)

              return (
                <div key={car.car_id} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
                  <TeamCarImage level={car.asset_level} name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-gray-900">{car.display_name || name}</div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Lv {car.asset_level}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{name}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>Condition {formatPercent(toNumber(car.condition_percent, 0))}</span>
                      <span>Effectiveness {formatEffectiveness(car.condition_factor)}</span>
                      <span>120 km wear {formatPercent(baseWear)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCarId(car.car_id)}
                    disabled={!config}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Details
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-5 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setIsEngineValuesOpen(value => !value)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
            aria-expanded={isEngineValuesOpen}
          >
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Production race-engine values</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">Team Car race support by level</div>
              <div className="mt-0.5 text-xs text-gray-500">Exact configured benefits, wear and maintenance values.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">Up to 3 cars per race</span>
              <span className="text-lg text-slate-500" aria-hidden="true">{isEngineValuesOpen ? '⌃' : '⌄'}</span>
            </div>
          </button>

          {isEngineValuesOpen && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {sortedConfig.map(config => {
                const benefits = splitBenefits(config.effect_summary)
                const baseWear = toNumber(config.condition_loss_per_race_day, 0)
                return (
                  <div key={`team_car_engine_level_${config.asset_level}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Level {config.asset_level}</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">{config.asset_name}</div>
                      </div>
                      <div className="text-xs font-semibold text-gray-700">{formatCash(config.cost_cash)}</div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {benefits.map(benefit => <div key={benefit} className="text-xs leading-4 text-gray-600">{benefit}</div>)}
                    </div>
                    <div className="mt-3 border-t border-gray-200 pt-2 text-[11px] leading-4 text-gray-500">
                      <div>120 km wear: {formatPercent(baseWear)}</div>
                      <div>Repair: {formatCash(config.repair_cost_per_condition_point ?? 0)} / condition point</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {selectedCar && selectedConfig && (
        <TeamCarProfileModal
          car={selectedCar}
          config={selectedConfig}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onClose={() => setSelectedCarId(null)}
        />
      )}
    </>
  )
}
