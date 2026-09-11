import React, { useEffect, useMemo, useState } from 'react'

import type { InfrastructureAssetConfigRow } from './infrastructureTypes'
import { formatCash, formatGameDate, toNumber } from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type EquipmentVanRosterRow = {
  van_id?: string | null
  equipment_van_id?: string | null
  id?: string | null
  display_name: string
  asset_name?: string | null
  asset_level: number
  purchase_cost_cash?: string | number | null
  support_value?: string | number | null
  condition_percent: string | number
  condition_factor?: string | number | null
  effective_support_value?: string | number | null
  status: string
  total_race_days?: string | number | null
  total_distance_km?: string | number | null
  last_used_game_date?: string | null
  current_assignment_label?: string | null
  condition_loss_per_race_day?: string | number | null
  repair_cost_per_condition_point?: string | number | null
  repair_points_per_game_day?: string | number | null
  min_assign_condition_percent?: string | number | null
}

type EquipmentVanSupportPanelProps = {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: EquipmentVanRosterRow[]
}

const MECHANICAL_RELIABILITY_BY_LEVEL: Record<number, number> = {
  1: 2,
  2: 5,
  3: 8,
}

const EQUIPMENT_PROTECTION_BY_LEVEL: Record<number, number> = {
  1: 2,
  2: 5,
  3: 10,
}

function formatPercent(value: unknown, maximumFractionDigits = 2): string {
  return `${toNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}%`
}

function formatFactor(value: unknown): string {
  return formatPercent(toNumber(value, 0) * 100, 0)
}

function conditionFactor(condition: number): number {
  if (condition >= 90) return 1
  if (condition >= 75) return 0.95
  if (condition >= 60) return 0.85
  if (condition >= 45) return 0.7
  if (condition >= 30) return 0.5
  return 0
}

function conditionBand(condition: number): string {
  if (condition >= 90) return '100% effectiveness'
  if (condition >= 75) return '95% effectiveness'
  if (condition >= 60) return '85% effectiveness'
  if (condition >= 45) return '70% effectiveness'
  if (condition >= 30) return '50% effectiveness'
  return 'Not race-ready · 0% effectiveness'
}

function mechanicalIncidentRiskMultiplier(mr: number): number {
  return Math.max(0.78, 1 - Math.min(0.22, mr * 0.025))
}

function mechanicalTimeLossMultiplier(mr: number): number {
  return Math.max(0.82, 1 - Math.min(0.18, mr * 0.02))
}

function EquipmentVanImage({
  level,
  name,
  large = false,
}: {
  level: number
  name: string
  large?: boolean
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('equipment_van', level)

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 ${
          large ? 'min-h-[280px]' : 'h-24 w-36'
        }`}
      >
        <span className="text-4xl" aria-hidden="true">🚐</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${
        large ? 'min-h-[280px]' : 'h-24 w-36 shrink-0'
      }`}
    >
      <img
        src={imageUrl}
        alt={`${name} level ${level}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${large ? 'max-h-[420px] w-full' : 'h-full w-full'} object-contain`}
      />
    </div>
  )
}

function EquipmentVanProfileModal({
  van,
  config,
  onClose,
}: {
  van: EquipmentVanRosterRow
  config: InfrastructureAssetConfigRow
  onClose: () => void
}): JSX.Element {
  const condition = toNumber(van.condition_percent, 0)
  const factor = toNumber(van.condition_factor, conditionFactor(condition))
  const baseMr = MECHANICAL_RELIABILITY_BY_LEVEL[van.asset_level] ?? 0
  const baseProtection = EQUIPMENT_PROTECTION_BY_LEVEL[van.asset_level] ?? 0
  const effectiveMr = baseMr * factor
  const effectiveProtection = baseProtection * factor
  const wear = toNumber(van.condition_loss_per_race_day ?? config.condition_loss_per_race_day, 0)
  const repairCostPerPoint = toNumber(
    van.repair_cost_per_condition_point ?? config.repair_cost_per_condition_point,
    0,
  )
  const repairPointsPerDay = toNumber(
    van.repair_points_per_game_day ?? config.repair_points_per_game_day,
    0,
  )
  const minCondition = toNumber(
    van.min_assign_condition_percent ?? config.min_assign_condition_percent,
    30,
  )
  const missing = Math.max(0, 100 - condition)
  const repairCost = Math.ceil(missing * repairCostPerPoint)
  const repairDays =
    missing <= 0 || repairPointsPerDay <= 0
      ? 0
      : Math.max(1, Math.ceil(missing / repairPointsPerDay))
  const name = config.asset_name || van.asset_name || `Equipment Van Level ${van.asset_level}`

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} details`}
        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Equipment Van · Level {van.asset_level}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{name}</h3>
            {van.display_name && van.display_name !== name && (
              <div className="mt-1 text-sm text-gray-500">{van.display_name}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <EquipmentVanImage level={van.asset_level} name={name} large />
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <div>
                <div className="text-xs text-gray-400">Current catalogue price</div>
                <div className="mt-1 font-semibold text-gray-900">{formatCash(config.cost_cash)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Original purchase value</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {formatCash(van.purchase_cost_cash ?? config.cost_cash)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Status</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">
                  {String(van.status).replaceAll('_', ' ')}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Race days used</div>
                <div className="mt-1 font-semibold text-gray-900">{toNumber(van.total_race_days, 0)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Distance covered</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {toNumber(van.total_distance_km, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} km
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Last used</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {van.last_used_game_date ? formatGameDate(van.last_used_game_date) : 'Not used yet'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Production race benefits</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    Mechanical Reliability feeds the race engine. Equipment Protection reduces normal physical equipment wear and incident damage.
                  </p>
                </div>
                <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">
                  {formatFactor(factor)} effectiveness
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-xs text-gray-400">Mechanical Reliability</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">
                    {effectiveMr.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    <span className="ml-1 text-xs font-medium text-gray-400">/ base {baseMr}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-xs text-gray-400">Physical equipment protection</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">
                    {formatPercent(effectiveProtection)}
                    <span className="ml-1 text-xs font-medium text-gray-400">/ base {formatPercent(baseProtection)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-xs text-gray-400">Mechanical incident risk</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {formatPercent(mechanicalIncidentRiskMultiplier(effectiveMr) * 100, 1)} of baseline
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-xs text-gray-400">Mechanical time loss</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {formatPercent(mechanicalTimeLossMultiplier(effectiveMr) * 100, 1)} of baseline
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs leading-5 text-gray-600">
                Protection applies to the frames, wheelsets, tires, groupsets, helmets and shoes actually allocated to riders for the stage. It does not reduce this van's own wear.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Condition & wear</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Current condition</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(condition)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Effectiveness</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatFactor(factor)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">120 km van wear</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(wear)}</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                {conditionBand(condition)}. Bands: 90–100% = 100%; 75–89% = 95%; 60–74% = 85%; 45–59% = 70%; 30–44% = 50%; below 30% cannot be newly assigned and provides no new Race Plan benefit.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Maintenance & delivery</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Repair / point</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatCash(repairCostPerPoint)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Full repair estimate</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatCash(repairCost)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Repair time</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {repairDays === 0 ? 'No repair needed' : `${repairDays} game day${repairDays === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">New delivery</div>
                  <div className="mt-1 font-semibold text-gray-900">{toNumber(config.delivery_game_days, 0)} game days</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                Assignment threshold: {formatPercent(minCondition, 0)}. Already-submitted Race Plans keep their frozen historical bonus snapshot; new submissions use the current production balance.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EquipmentVanSupportPanel({
  configRows,
  rosterRows,
}: EquipmentVanSupportPanelProps): JSX.Element | null {
  const [selectedVanId, setSelectedVanId] = useState<string | null>(null)
  const configs = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )
  const configByLevel = useMemo(
    () => new Map(configs.map(config => [config.asset_level, config])),
    [configs],
  )
  const selectedVan = useMemo(
    () =>
      rosterRows.find(row => (row.van_id ?? row.equipment_van_id ?? row.id) === selectedVanId) ?? null,
    [rosterRows, selectedVanId],
  )
  const selectedConfig = selectedVan ? configByLevel.get(selectedVan.asset_level) ?? null : null

  if (configs.length === 0) return null

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Production engine</div>
        <h3 className="mt-1 text-lg font-semibold text-gray-900">Equipment Van benefits</h3>
        <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">
          Equipment Vans are the race-equipment logistics asset: they add Mechanical Reliability and directly protect allocated physical race equipment from normal stage wear and incident damage.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {configs.map(config => {
          const mr = MECHANICAL_RELIABILITY_BY_LEVEL[config.asset_level] ?? 0
          const protection = EQUIPMENT_PROTECTION_BY_LEVEL[config.asset_level] ?? 0

          return (
            <div key={config.asset_level} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex gap-3">
                <EquipmentVanImage level={config.asset_level} name={config.asset_name} />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Level {config.asset_level}</div>
                  <div className="mt-1 font-semibold text-gray-900">{config.asset_name}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{formatCash(config.cost_cash)}</div>
                  <div className="mt-1 text-xs text-gray-500">Delivery: {toNumber(config.delivery_game_days, 0)} game days</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <div className="text-blue-600">Mechanical Reliability</div>
                  <div className="mt-1 text-lg font-semibold text-blue-900">{mr}</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="text-emerald-600">Equipment Protection</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-900">{formatPercent(protection)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="rounded-lg bg-white p-2.5">Mechanical risk: {formatPercent(mechanicalIncidentRiskMultiplier(mr) * 100, 1)}</div>
                <div className="rounded-lg bg-white p-2.5">Time loss: {formatPercent(mechanicalTimeLossMultiplier(mr) * 100, 1)}</div>
                <div className="rounded-lg bg-white p-2.5">120 km wear: {formatPercent(config.condition_loss_per_race_day)}</div>
                <div className="rounded-lg bg-white p-2.5">Repair / point: {formatCash(config.repair_cost_per_condition_point ?? 0)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {rosterRows.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Owned Equipment Vans</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {rosterRows.map(van => {
              const id = van.van_id ?? van.equipment_van_id ?? van.id ?? `${van.display_name}-${van.asset_level}`
              const condition = toNumber(van.condition_percent, 0)
              const factor = toNumber(van.condition_factor, conditionFactor(condition))
              const baseMr = MECHANICAL_RELIABILITY_BY_LEVEL[van.asset_level] ?? 0
              const protection = EQUIPMENT_PROTECTION_BY_LEVEL[van.asset_level] ?? 0

              return (
                <div key={id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{van.display_name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Lv {van.asset_level} · {formatPercent(condition)} condition · {formatFactor(factor)} effectiveness
                    </div>
                    <div className="mt-1 text-xs font-medium text-gray-700">
                      Current: {Number(baseMr * factor).toLocaleString('en-US', { maximumFractionDigits: 2 })} MR · {formatPercent(protection * factor)} equipment protection
                    </div>
                    {van.current_assignment_label && (
                      <div className="mt-1 text-xs text-blue-600">Assigned: {van.current_assignment_label}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedVanId(String(van.van_id ?? van.equipment_van_id ?? van.id))}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Details
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
        Condition scaling: 90–100% = 100%; 75–89% = 95%; 60–74% = 85%; 45–59% = 70%; 30–44% = 50%; below 30% = 0% and cannot be newly assigned. Only one Equipment Van can be assigned to an event.
      </div>

      {selectedVan && selectedConfig && (
        <EquipmentVanProfileModal
          van={selectedVan}
          config={selectedConfig}
          onClose={() => setSelectedVanId(null)}
        />
      )}
    </div>
  )
}
