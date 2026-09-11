import React, { useMemo, useState } from 'react'

import type { InfrastructureAssetConfigRow } from './infrastructureTypes'
import { formatCash, toNumber } from './infrastructureHelpers'

type SupportedAssetKey =
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

type Props = {
  assetKey: SupportedAssetKey
  configRows: InfrastructureAssetConfigRow[]
}

type Copy = {
  title: string
  description: string
  badge: string
}

const COPY: Record<SupportedAssetKey, Copy> = {
  team_bus: {
    title: 'Team Bus race support by level',
    description: 'Exact fatigue, recovery, wear and maintenance values.',
    badge: '1 bus per event',
  },
  equipment_van: {
    title: 'Equipment Van race support by level',
    description: 'Exact mechanical reliability, equipment protection, wear and maintenance values.',
    badge: '1 van per event',
  },
  mobile_workshop: {
    title: 'Mobile Workshop race support by level',
    description: 'Exact field-service, equipment recovery, wear and maintenance values.',
    badge: '1 workshop per event',
  },
  medical_van: {
    title: 'Medical Van race support by level',
    description: 'Exact health protection, fatigue, recovery, wear and maintenance values.',
    badge: '1 medical van per event',
  },
}

const BUS_CANONICAL: Record<number, string[]> = {
  1: ['Fatigue Control 2', 'Recovery Support 1'],
  2: ['Fatigue Control 4', 'Recovery Support 2'],
  3: ['Fatigue Control 7', 'Recovery Support 4'],
}

const EQUIPMENT_CANONICAL: Record<number, string[]> = {
  1: ['Mechanical Reliability 2', 'Equipment Protection 2%'],
  2: ['Mechanical Reliability 5', 'Equipment Protection 5%'],
  3: ['Mechanical Reliability 8', 'Equipment Protection 10%'],
}

const WORKSHOP_CANONICAL: Record<number, string[]> = {
  1: ['Mechanical Reliability 4', 'Field Equipment Recovery 15%'],
  2: ['Mechanical Reliability 8', 'Field Equipment Recovery 30%'],
}

const MEDICAL_CANONICAL: Record<number, string[]> = {
  1: ['Health Protection 3', 'Recovery Support 1'],
  2: ['Health Protection 5', 'Fatigue Control 2', 'Recovery Support 2'],
  3: ['Health Protection 8', 'Fatigue Control 4', 'Recovery Support 4'],
}

function formatPercent(value: unknown): string {
  return `${toNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`
}

function rawBenefits(summary: string | null | undefined): string[] {
  return String(summary ?? '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
}

function canonicalLines(assetKey: SupportedAssetKey, level: number): string[] {
  switch (assetKey) {
    case 'team_bus':
      return BUS_CANONICAL[level] ?? []
    case 'equipment_van':
      return EQUIPMENT_CANONICAL[level] ?? []
    case 'mobile_workshop':
      return WORKSHOP_CANONICAL[level] ?? []
    case 'medical_van':
      return MEDICAL_CANONICAL[level] ?? []
  }
}

export function AssetProductionValuesAccordion({ assetKey, configRows }: Props): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false)
  const sortedConfig = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )
  const copy = COPY[assetKey]

  if (sortedConfig.length === 0) return null

  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <button
        type="button"
        onClick={() => setIsOpen(value => !value)}
        className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
        aria-expanded={isOpen}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            Production race-engine values
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900">{copy.title}</div>
          <div className="mt-0.5 text-xs text-gray-500">{copy.description}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">
            {copy.badge}
          </span>
          <span className="text-lg text-slate-500" aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
        </div>
      </button>

      {isOpen && (
        <div
          className={`mt-3 grid gap-3 ${
            sortedConfig.length === 2
              ? 'md:grid-cols-2'
              : sortedConfig.length === 3
                ? 'md:grid-cols-3'
                : 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          {sortedConfig.map(config => {
            const canonical = canonicalLines(assetKey, config.asset_level)
            const raw = rawBenefits(config.effect_summary)

            return (
              <div
                key={`${assetKey}_production_${config.asset_level}`}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Level {config.asset_level}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{config.asset_name}</div>
                  </div>
                  <div className="text-xs font-semibold text-gray-700">{formatCash(config.cost_cash)}</div>
                </div>

                {canonical.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {canonical.map(line => (
                      <div key={line} className="text-xs font-medium leading-4 text-gray-700">
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                {raw.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Configured effects
                    </div>
                    <div className="space-y-1">
                      {raw.map(line => (
                        <div key={line} className="text-[11px] leading-4 text-gray-500">{line}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-gray-200 pt-2 text-[11px] leading-4 text-gray-500">
                  <div>Delivery: {toNumber(config.delivery_game_days, 0)} game days</div>
                  <div>120 km wear: {formatPercent(config.condition_loss_per_race_day)}</div>
                  <div>Repair: {formatCash(config.repair_cost_per_condition_point ?? 0)} / condition point</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
