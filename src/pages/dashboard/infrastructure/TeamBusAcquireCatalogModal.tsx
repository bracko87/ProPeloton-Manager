import React, { useEffect, useMemo, useState } from 'react'

import type {
  InfrastructureAssetConfigRow,
  InfrastructureJobRow,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDays,
  toNumber,
} from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type TeamBusAcquireCatalogModalProps = {
  configRows: InfrastructureAssetConfigRow[]
  ownedByLevel: Map<number, number>
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  processingKey: string | null
  isFull: boolean
  onAcquire: (assetLevel: number) => void
  onClose: () => void
}

function splitBenefits(summary: string | null | undefined): string[] {
  return String(summary ?? '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
}

function countPendingForLevel(
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>,
  assetLevel: number,
): number {
  return (
    pendingJobsByLevel
      .get(assetLevel)
      ?.reduce(
        (sum, job) => sum + Math.max(1, Math.floor(toNumber(job.asset_quantity, 1))),
        0,
      ) ?? 0
  )
}

function formatPercent(value: unknown): string {
  return `${toNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`
}

function TeamBusTierImage({
  level,
  name,
  large = false,
}: {
  level: number
  name: string
  large?: boolean
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('team_bus', level)

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 ${
          large ? 'min-h-[300px]' : 'aspect-[16/9] min-h-[140px]'
        }`}
      >
        <span className="text-5xl" aria-hidden="true">🚌</span>
      </div>
    )
  }

  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${
        large ? 'min-h-[300px]' : 'aspect-[16/9] min-h-[140px]'
      }`}
    >
      <img
        src={imageUrl}
        alt={`${name} level ${level}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${large ? 'max-h-[460px]' : 'max-h-[200px]'} h-full w-full object-contain`}
      />
    </div>
  )
}

export function TeamBusAcquireCatalogModal({
  configRows,
  ownedByLevel,
  pendingJobsByLevel,
  processingKey,
  isFull,
  onAcquire,
  onClose,
}: TeamBusAcquireCatalogModalProps): JSX.Element {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)

  const sortedConfig = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )
  const selectedConfig = useMemo(
    () =>
      selectedLevel == null
        ? null
        : configRows.find(row => row.asset_level === selectedLevel) ?? null,
    [configRows, selectedLevel],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedLevel != null) setSelectedLevel(null)
      else onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedLevel])

  const renderOrderButton = (config: InfrastructureAssetConfigRow, fullWidth = false) => {
    const isProcessing = processingKey === `asset:team_bus:${config.asset_level}`

    return (
      <button
        type="button"
        onClick={() => onAcquire(config.asset_level)}
        disabled={isProcessing || isFull}
        className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
          fullWidth ? 'w-full sm:w-auto' : ''
        } ${
          isProcessing || isFull
            ? 'cursor-not-allowed bg-gray-200 text-gray-500'
            : 'bg-yellow-400 text-black hover:bg-yellow-300'
        }`}
      >
        {isProcessing ? 'Starting…' : isFull ? 'Garage full' : 'Order for delivery'}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-2 py-3 sm:px-4 sm:py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order Team Bus"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div>
            {selectedConfig ? (
              <button
                type="button"
                onClick={() => setSelectedLevel(null)}
                className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-600"
              >
                <span aria-hidden="true">←</span>
                Back to Team Buses
              </button>
            ) : (
              <div className="text-xs uppercase tracking-wide text-gray-400">Team Bus</div>
            )}
            <h3 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl">
              {selectedConfig ? selectedConfig.asset_name : 'Order Team Bus'}
            </h3>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">
              {selectedConfig
                ? `Level ${selectedConfig.asset_level} · production configuration`
                : 'Choose a bus tier. Prices, benefits, delivery, wear and repair values below come directly from the current production configuration.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isFull && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Garage capacity is full. Sell an available bus, cancel a pending delivery, or unlock more capacity before ordering another bus.
            </div>
          )}

          {!selectedConfig && (
            <div className="space-y-4">
              {sortedConfig.map(config => {
                const benefits = splitBenefits(config.effect_summary)
                const ownedCount = ownedByLevel.get(config.asset_level) ?? 0
                const pendingCount = countPendingForLevel(pendingJobsByLevel, config.asset_level)

                return (
                  <div
                    key={`team_bus_catalog_${config.asset_level}`}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                  >
                    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)_230px_160px] lg:items-center">
                      <TeamBusTierImage
                        level={config.asset_level}
                        name={config.asset_name}
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-gray-900">{config.asset_name}</div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Level {config.asset_level}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {benefits.map(benefit => (
                            <div key={benefit} className="text-xs font-medium text-gray-600">{benefit}</div>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] leading-4 text-gray-400">
                          Fatigue Protection → Fatigue Control · Recovery Comfort → Recovery Support
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-700 lg:bg-transparent lg:p-0">
                        <div>
                          <div className="text-gray-400">Price</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{formatCash(config.cost_cash)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Delivery</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{formatGameDays(config.delivery_game_days)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">120 km wear</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{formatPercent(config.condition_loss_per_race_day)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Repair / point</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{formatCash(config.repair_cost_per_condition_point ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Owned</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{ownedCount}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Pending</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{pendingCount}</div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {renderOrderButton(config, true)}
                        <button
                          type="button"
                          onClick={() => setSelectedLevel(config.asset_level)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedConfig && (
            <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1fr)]">
              <TeamBusTierImage
                level={selectedConfig.asset_level}
                name={selectedConfig.asset_name}
                large
              />

              <div className="space-y-4">
                <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <h4 className="text-sm font-semibold text-gray-900">Production race benefits</h4>
                  <div className="mt-3 space-y-2">
                    {splitBenefits(selectedConfig.effect_summary).map(benefit => (
                      <div key={benefit} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                        {benefit}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-600">
                    Only one Team Bus can be assigned per event. Benefits are condition-scaled at Race Plan calculation: 70–100% condition = 100%, 50–69% = 85%, 30–49% = 65%, below 30% = no new Race Plan benefit and not assignable.
                  </p>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">Price</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatCash(selectedConfig.cost_cash)}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">Delivery</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatGameDays(selectedConfig.delivery_game_days)}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">120 km wear</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatPercent(selectedConfig.condition_loss_per_race_day)}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">Repair / point</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatCash(selectedConfig.repair_cost_per_condition_point ?? 0)}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">Repair speed</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatPercent(selectedConfig.repair_points_per_game_day)} / day</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400">Minimum condition</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatPercent(selectedConfig.min_assign_condition_percent)}</div>
                    </div>
                  </div>
                </section>

                <div className="flex justify-end">{renderOrderButton(selectedConfig)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
