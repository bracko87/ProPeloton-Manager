import React, { useEffect, useMemo, useState } from 'react'

import type {
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
}

type TeamCarProfileModalProps = {
  car: TeamCarRosterRow
  config: InfrastructureAssetConfigRow
  onClose: () => void
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
      const number = scaled.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
      return `${sign}${number}%`
    },
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Universal race-engine asset wear formula.
 * Team Cars now pass their configured level wear into this existing engine path.
 */
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

function TeamCarProfileModal({
  car,
  config,
  onClose,
}: TeamCarProfileModalProps): JSX.Element {
  const condition = toNumber(car.condition_percent, 0)
  const factor = toNumber(car.condition_factor, 0)
  const baseWear = toNumber(
    car.condition_loss_per_race_day ?? config.condition_loss_per_race_day,
    0,
  )
  const minimumCondition = toNumber(
    car.min_assign_condition_percent ?? config.min_assign_condition_percent,
    30,
  )
  const repairCostPerPoint = toNumber(
    car.repair_cost_per_condition_point ?? config.repair_cost_per_condition_point,
    0,
  )
  const repairPointsPerDay = toNumber(
    car.repair_points_per_game_day ?? config.repair_points_per_game_day,
    0,
  )
  const missingCondition = Math.max(0, 100 - condition)
  const currentRepairCost = Math.ceil(missingCondition * repairCostPerPoint)
  const currentRepairDays =
    missingCondition <= 0 || repairPointsPerDay <= 0
      ? 0
      : Math.max(1, Math.ceil(missingCondition / repairPointsPerDay))
  const referenceStages = estimatedReferenceStagesBeforeService(
    condition,
    baseWear,
    minimumCondition,
  )
  const shortStageWear = wearForDistance(baseWear, 0.6)
  const longStageWear = wearForDistance(baseWear, 1.6)
  const benefits = splitBenefits(config.effect_summary)
  const name = config.asset_name || car.asset_name || `Team Car Level ${car.asset_level}`

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Team Car · Level {car.asset_level}
            </div>
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
                <div className="mt-1 font-semibold text-gray-900">
                  {formatCash(car.purchase_cost_cash || config.cost_cash)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Status</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">
                  {String(car.status).replaceAll('_', ' ')}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Race days used</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {toNumber(car.total_race_days, 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Distance covered</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {toNumber(car.total_distance_km, 0).toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })} km
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-400">Last used</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {car.last_used_game_date ? formatGameDate(car.last_used_game_date) : 'Not used yet'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Race Benefits</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    Current values below are the values that feed the race-plan bonus pipeline.
                  </p>
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
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Current condition</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {formatPercent(condition)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Current effectiveness</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {formatEffectiveness(factor)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Race-ready minimum</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {formatPercent(minimumCondition, 0)}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                {conditionBand(condition)}. Effectiveness bands: 80–100% = 100%; 60–79% = 90%; 40–59% = 75%; 30–39% = 60%; below 30% cannot be assigned.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Wear per stage</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Short stage floor</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatPercent(shortStageWear)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">120 km reference</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatPercent(baseWear)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Long stage ceiling</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatPercent(longStageWear)}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                The race engine applies wear after every stage. The configured level value is the 120 km reference; distance scales it from 60% to 160%. At the current condition this car supports about {referenceStages} reference stages before reaching the {formatPercent(minimumCondition, 0)} service threshold.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Maintenance</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Repair / condition point</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCash(repairCostPerPoint)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Current full repair estimate</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {formatCash(currentRepairCost)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Current repair time</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {currentRepairDays === 0 ? 'No repair needed' : `${currentRepairDays} game day${currentRepairDays === 1 ? '' : 's'}`}
                  </div>
                </div>
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
}: TeamCarSupportPanelProps): JSX.Element {
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              Production race-engine values
            </div>
            <h3 className="mt-1 text-base font-semibold text-gray-900">Team Car race support</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
              Exact level benefits, wear and maintenance values are read from the same Team Car configuration used by race planning and the race engine.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Up to 3 cars per race
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {sortedConfig.map(config => {
            const benefits = splitBenefits(config.effect_summary)
            const baseWear = toNumber(config.condition_loss_per_race_day, 0)

            return (
              <div
                key={`team_car_engine_level_${config.asset_level}`}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Level {config.asset_level}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {config.asset_name}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-gray-700">
                    {formatCash(config.cost_cash)}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {benefits.map(benefit => (
                    <div key={benefit} className="text-xs leading-4 text-gray-600">
                      {benefit}
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-gray-200 pt-2 text-[11px] leading-4 text-gray-500">
                  <div>120 km wear: {formatPercent(baseWear)}</div>
                  <div>Repair: {formatCash(config.repair_cost_per_condition_point ?? 0)} / condition point</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Your Team Cars</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Open Details to see the current condition-adjusted race benefits for an individual car.
              </p>
            </div>
            <div className="text-xs font-semibold text-gray-500">
              {rosterRows.length} owned
            </div>
          </div>

          {rosterRows.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
              No Team Cars owned yet.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {rosterRows.map(car => {
                const config = configRows.find(row => row.asset_level === car.asset_level)
                const name = config?.asset_name || car.asset_name || `Team Car Level ${car.asset_level}`
                const baseWear = toNumber(
                  car.condition_loss_per_race_day ?? config?.condition_loss_per_race_day,
                  0,
                )

                return (
                  <div
                    key={car.car_id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center"
                  >
                    <TeamCarImage level={car.asset_level} name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {car.display_name || name}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Lv {car.asset_level}
                        </span>
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
        </div>
      </section>

      {selectedCar && selectedConfig && (
        <TeamCarProfileModal
          car={selectedCar}
          config={selectedConfig}
          onClose={() => setSelectedCarId(null)}
        />
      )}
    </>
  )
}
