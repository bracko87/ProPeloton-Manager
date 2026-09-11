import React, { useEffect, useMemo, useState } from 'react'

import type { InfrastructureAssetConfigRow, InfrastructureJobRow } from './infrastructureTypes'
import { formatCash, formatGameDays, toNumber } from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type Props = {
  configRows: InfrastructureAssetConfigRow[]
  ownedByLevel: Map<number, number>
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  processingKey: string | null
  isFull: boolean
  onAcquire: (assetLevel: number) => void
  onClose: () => void
}

type MedicalTier = {
  healthProtection: number
  fatigueControl: number
  recoverySupport: number
  rawEffects: string
}

const MEDICAL_TIERS: Record<number, MedicalTier> = {
  1: {
    healthProtection: 3,
    fatigueControl: 0,
    recoverySupport: 1,
    rawEffects: 'Medical response +2% • Minor injury risk -1% • Recovery +1%',
  },
  2: {
    healthProtection: 5,
    fatigueControl: 2,
    recoverySupport: 2,
    rawEffects: 'Medical response +3% • Minor injury risk -2% • Hydration +2% • Recovery +2%',
  },
  3: {
    healthProtection: 8,
    fatigueControl: 4,
    recoverySupport: 4,
    rawEffects: 'Medical response +4% • Minor injury risk -4% • Heat/hydration +4% • Recovery +4%',
  },
}

function pendingCount(map: Map<number, InfrastructureJobRow[]>, level: number): number {
  return map.get(level)?.reduce(
    (sum, job) => sum + Math.max(1, Math.floor(toNumber(job.asset_quantity, 1))),
    0,
  ) ?? 0
}

function percent(value: unknown): string {
  return `${toNumber(value, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

function MedicalVanImage({ level, name }: { level: number; name: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('medical_van', level)

  if (!imageUrl || failed) {
    return (
      <div className="flex aspect-[16/9] min-h-[140px] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <span className="text-5xl" aria-hidden="true">⚕️</span>
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

export function MedicalVanAcquireCatalogModal({
  configRows,
  ownedByLevel,
  pendingJobsByLevel,
  processingKey,
  isFull,
  onAcquire,
  onClose,
}: Props): JSX.Element {
  const sorted = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-2 py-3 sm:px-4 sm:py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order Medical Van"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Medical Van</div>
            <h3 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl">Order Medical Van</h3>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">
              Choose a race-side medical and recovery tier. Prices, delivery, wear and repair values come from production configuration; the benefits below match the live race engine.
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
              Garage capacity is full. Sell an available Medical Van, cancel a pending delivery, or unlock more capacity before ordering another one.
            </div>
          )}

          <div className="space-y-4">
            {sorted.map(config => {
              const level = config.asset_level
              const tier = MEDICAL_TIERS[level] ?? MEDICAL_TIERS[1]
              const owned = ownedByLevel.get(level) ?? 0
              const pending = pendingCount(pendingJobsByLevel, level)
              const busy = processingKey === `asset:medical_van:${level}`

              return (
                <div key={`medical_van_${level}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)_250px_165px] lg:items-center">
                    <MedicalVanImage level={level} name={config.asset_name} />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900">{config.asset_name}</div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          Level {level}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                          <div className="text-[11px] text-rose-600">Health Protection</div>
                          <div className="mt-0.5 text-lg font-semibold text-rose-900">{tier.healthProtection}</div>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                          <div className="text-[11px] text-amber-700">Fatigue Control</div>
                          <div className="mt-0.5 text-lg font-semibold text-amber-900">{tier.fatigueControl}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                          <div className="text-[11px] text-emerald-600">Recovery Support</div>
                          <div className="mt-0.5 text-lg font-semibold text-emerald-900">{tier.recoverySupport}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] leading-4 text-gray-500">{tier.rawEffects}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-700 lg:bg-transparent lg:p-0">
                      <div><div className="text-gray-400">Price</div><div className="mt-0.5 font-semibold text-gray-900">{formatCash(config.cost_cash)}</div></div>
                      <div><div className="text-gray-400">Delivery</div><div className="mt-0.5 font-semibold text-gray-900">{formatGameDays(config.delivery_game_days)}</div></div>
                      <div><div className="text-gray-400">120 km own wear</div><div className="mt-0.5 font-semibold text-gray-900">{percent(config.condition_loss_per_race_day)}</div></div>
                      <div><div className="text-gray-400">Repair / point</div><div className="mt-0.5 font-semibold text-gray-900">{formatCash(config.repair_cost_per_condition_point ?? 0)}</div></div>
                      <div><div className="text-gray-400">Repair speed</div><div className="mt-0.5 font-semibold text-gray-900">{toNumber(config.repair_points_per_game_day, 0)} pts/day</div></div>
                      <div><div className="text-gray-400">Owned / pending</div><div className="mt-0.5 font-semibold text-gray-900">{owned} / {pending}</div></div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAcquire(level)}
                      disabled={busy || isFull}
                      className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                        busy || isFull
                          ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {busy ? 'Starting…' : isFull ? 'Garage full' : 'Order for delivery'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
              <span className="font-semibold text-slate-800">Condition effectiveness:</span> 90–100% = 100%; 75–89% = 95%; 60–74% = 85%; 45–59% = 70%; 30–44% = 50%; below 30% = 0% and cannot be newly assigned. Maximum one Medical Van per event.
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-900">
              <span className="font-semibold">Health Protection:</span> does not prevent a crash, puncture or mechanical incident. It lowers the probability that an eligible incident becomes a lasting moderate or major health consequence. Fatigue Control and Recovery Support use the universal preparation engine.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
