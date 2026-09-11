import React, { useEffect, useMemo, useState } from 'react'

import type {
  InfrastructureAssetConfigRow,
  InfrastructureJobRow,
} from './infrastructureTypes'
import { formatCash, formatGameDays, toNumber } from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type EquipmentVanAcquireCatalogModalProps = {
  configRows: InfrastructureAssetConfigRow[]
  ownedByLevel: Map<number, number>
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  processingKey: string | null
  isFull: boolean
  onAcquire: (assetLevel: number) => void
  onClose: () => void
}

const MECHANICAL_RELIABILITY_BY_LEVEL: Record<number, number> = { 1: 2, 2: 5, 3: 8 }
const EQUIPMENT_PROTECTION_BY_LEVEL: Record<number, number> = { 1: 2, 2: 5, 3: 10 }

function countPendingForLevel(
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>,
  level: number,
): number {
  return (
    pendingJobsByLevel
      .get(level)
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

function EquipmentVanTierImage({ level, name }: { level: number; name: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('equipment_van', level)

  if (!imageUrl || failed) {
    return (
      <div className="flex aspect-[16/9] min-h-[140px] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <span className="text-5xl" aria-hidden="true">🚐</span>
      </div>
    )
  }

  return (
    <div className="flex aspect-[16/9] min-h-[140px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
      <img
        src={imageUrl}
        alt={`${name} level ${level}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full max-h-[210px] w-full object-contain"
      />
    </div>
  )
}

export function EquipmentVanAcquireCatalogModal({
  configRows,
  ownedByLevel,
  pendingJobsByLevel,
  processingKey,
  isFull,
  onAcquire,
  onClose,
}: EquipmentVanAcquireCatalogModalProps): JSX.Element {
  const sortedConfig = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-2 py-3 sm:px-4 sm:py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order Equipment Van"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Equipment Van</div>
            <h3 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl">Order Equipment Van</h3>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">
              Prices, delivery, van wear and repair values come from production configuration. Mechanical Reliability and Equipment Protection below match the production race engine.
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
              Garage capacity is full. Sell an available van, cancel a pending delivery, or unlock more capacity before ordering another one.
            </div>
          )}

          <div className="space-y-4">
            {sortedConfig.map(config => {
              const level = config.asset_level
              const mr = MECHANICAL_RELIABILITY_BY_LEVEL[level] ?? 0
              const protection = EQUIPMENT_PROTECTION_BY_LEVEL[level] ?? 0
              const owned = ownedByLevel.get(level) ?? 0
              const pending = countPendingForLevel(pendingJobsByLevel, level)
              const isProcessing = processingKey === `asset:equipment_van:${level}`

              return (
                <div
                  key={`equipment_van_catalog_${level}`}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)_250px_165px] lg:items-center">
                    <EquipmentVanTierImage level={level} name={config.asset_name} />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900">{config.asset_name}</div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          Level {level}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                          <div className="text-[11px] text-blue-600">Mechanical Reliability</div>
                          <div className="mt-0.5 text-lg font-semibold text-blue-900">{mr}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                          <div className="text-[11px] text-emerald-600">Physical equipment protection</div>
                          <div className="mt-0.5 text-lg font-semibold text-emerald-900">{formatPercent(protection)}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] leading-4 text-gray-400">
                        Protection reduces normal wear and incident damage on allocated frames, wheelsets, tires, groupsets, helmets and shoes. Benefits scale with van condition.
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
                        <div className="text-gray-400">120 km van wear</div>
                        <div className="mt-0.5 font-semibold text-gray-900">{formatPercent(config.condition_loss_per_race_day)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Repair / point</div>
                        <div className="mt-0.5 font-semibold text-gray-900">{formatCash(config.repair_cost_per_condition_point ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Owned</div>
                        <div className="mt-0.5 font-semibold text-gray-900">{owned}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Pending</div>
                        <div className="mt-0.5 font-semibold text-gray-900">{pending}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAcquire(level)}
                      disabled={isProcessing || isFull}
                      className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                        isProcessing || isFull
                          ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {isProcessing ? 'Starting…' : isFull ? 'Garage full' : 'Order for delivery'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
            Condition effectiveness: 90–100% = 100%; 75–89% = 95%; 60–74% = 85%; 45–59% = 70%; 30–44% = 50%; below 30% = 0% and cannot be newly assigned. Maximum one Equipment Van per event.
          </div>
        </div>
      </div>
    </div>
  )
}
