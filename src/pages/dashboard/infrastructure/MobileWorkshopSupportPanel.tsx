import React, { useEffect, useMemo, useState } from 'react'

import type { InfrastructureAssetConfigRow } from './infrastructureTypes'
import { formatCash, formatGameDate, toNumber } from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type MobileWorkshopRosterRow = {
  workshop_id?: string | null
  mobile_workshop_id?: string | null
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

type Props = {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: MobileWorkshopRosterRow[]
}

const MECHANICAL_RELIABILITY_BY_LEVEL: Record<number, number> = { 1: 4, 2: 8 }
const FIELD_RECOVERY_BY_LEVEL: Record<number, number> = { 1: 15, 2: 30 }

function formatPercent(value: unknown, maximumFractionDigits = 2): string {
  return `${toNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}%`
}

function conditionFactor(condition: number): number {
  if (condition >= 90) return 1
  if (condition >= 75) return 0.95
  if (condition >= 60) return 0.85
  if (condition >= 45) return 0.7
  if (condition >= 30) return 0.5
  return 0
}

function mechanicalRiskMultiplier(mr: number): number {
  return Math.max(0.78, 1 - Math.min(0.22, mr * 0.025))
}

function mechanicalTimeLossMultiplier(mr: number): number {
  return Math.max(0.82, 1 - Math.min(0.18, mr * 0.02))
}

function WorkshopImage({ level, name, large = false }: { level: number; name: string; large?: boolean }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('mobile_workshop', level)

  if (!imageUrl || failed) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 ${large ? 'min-h-[280px]' : 'h-24 w-36'}`}>
        <span className="text-4xl" aria-hidden="true">🛠️</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${large ? 'min-h-[280px]' : 'h-24 w-36 shrink-0'}`}>
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

function DetailModal({ workshop, config, onClose }: { workshop: MobileWorkshopRosterRow; config: InfrastructureAssetConfigRow; onClose: () => void }): JSX.Element {
  const condition = toNumber(workshop.condition_percent, 0)
  const factor = toNumber(workshop.condition_factor, conditionFactor(condition))
  const baseMr = MECHANICAL_RELIABILITY_BY_LEVEL[workshop.asset_level] ?? 0
  const baseRecovery = FIELD_RECOVERY_BY_LEVEL[workshop.asset_level] ?? 0
  const currentMr = baseMr * factor
  const currentRecovery = baseRecovery * factor
  const wear = toNumber(workshop.condition_loss_per_race_day ?? config.condition_loss_per_race_day, 0)
  const repairCostPerPoint = toNumber(workshop.repair_cost_per_condition_point ?? config.repair_cost_per_condition_point, 0)
  const repairPointsPerDay = toNumber(workshop.repair_points_per_game_day ?? config.repair_points_per_game_day, 1)
  const missing = Math.max(0, 100 - condition)
  const repairCost = Math.ceil(missing * repairCostPerPoint)
  const repairDays = missing <= 0 ? 0 : Math.max(1, Math.ceil(missing / Math.max(repairPointsPerDay, 1)))
  const name = config.asset_name || workshop.asset_name || `Mobile Workshop Level ${workshop.asset_level}`

  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name} details`} className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mobile Workshop · Level {workshop.asset_level}</div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{name}</h3>
            {workshop.display_name && workshop.display_name !== name && <div className="mt-1 text-sm text-gray-500">{workshop.display_name}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Close</button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <WorkshopImage level={workshop.asset_level} name={name} large />
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <div><div className="text-xs text-gray-400">Current catalogue price</div><div className="mt-1 font-semibold text-gray-900">{formatCash(config.cost_cash)}</div></div>
              <div><div className="text-xs text-gray-400">Original purchase value</div><div className="mt-1 font-semibold text-gray-900">{formatCash(workshop.purchase_cost_cash ?? config.cost_cash)}</div></div>
              <div><div className="text-xs text-gray-400">Status</div><div className="mt-1 font-semibold capitalize text-gray-900">{String(workshop.status).replaceAll('_', ' ')}</div></div>
              <div><div className="text-xs text-gray-400">Race days used</div><div className="mt-1 font-semibold text-gray-900">{toNumber(workshop.total_race_days, 0)}</div></div>
              <div><div className="text-xs text-gray-400">Distance covered</div><div className="mt-1 font-semibold text-gray-900">{toNumber(workshop.total_distance_km, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} km</div></div>
              <div><div className="text-xs text-gray-400">Last used</div><div className="mt-1 font-semibold text-gray-900">{workshop.last_used_game_date ? formatGameDate(workshop.last_used_game_date) : 'Not used yet'}</div></div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Production race benefits</h4>
              <p className="mt-1 text-xs leading-5 text-gray-500">This is event-side technical support. Mechanical Reliability affects race mechanicals; Field Equipment Recovery offsets part of the condition loss suffered by the physical equipment used on the stage.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-white p-3"><div className="text-xs text-gray-400">Mechanical Reliability</div><div className="mt-1 text-xl font-semibold text-gray-900">{currentMr.toLocaleString('en-US', { maximumFractionDigits: 2 })}<span className="ml-1 text-xs font-medium text-gray-400">/ base {baseMr}</span></div></div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3"><div className="text-xs text-gray-400">Field Equipment Recovery</div><div className="mt-1 text-xl font-semibold text-gray-900">{formatPercent(currentRecovery)}<span className="ml-1 text-xs font-medium text-gray-400">/ base {formatPercent(baseRecovery)}</span></div></div>
                <div className="rounded-xl border border-blue-100 bg-white p-3"><div className="text-xs text-gray-400">Mechanical incident risk</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(mechanicalRiskMultiplier(currentMr) * 100, 1)} of baseline</div></div>
                <div className="rounded-xl border border-blue-100 bg-white p-3"><div className="text-xs text-gray-400">Mechanical time loss</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(mechanicalTimeLossMultiplier(currentMr) * 100, 1)} of baseline</div></div>
              </div>
              <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs leading-5 text-gray-600">Field recovery applies to allocated frames, wheelsets, tires, groupsets, helmets and shoes, including incident damage. It does not reduce this Mobile Workshop's own wear. Equipment Van protection and Mobile Workshop recovery combine multiplicatively.</div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Condition & own wear</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Current condition</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(condition)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Effectiveness</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(factor * 100, 0)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">120 km Workshop wear</div><div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(wear)}</div></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">90–100% = 100% effectiveness; 75–89% = 95%; 60–74% = 85%; 45–59% = 70%; 30–44% = 50%; below 30% = 0% and cannot be newly assigned.</p>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">Maintenance & delivery</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Repair / point</div><div className="mt-1 font-semibold text-gray-900">{formatCash(repairCostPerPoint)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Full repair estimate</div><div className="mt-1 font-semibold text-gray-900">{formatCash(repairCost)}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">Repair time</div><div className="mt-1 font-semibold text-gray-900">{repairDays === 0 ? 'No repair needed' : `${repairDays} game day${repairDays === 1 ? '' : 's'}`}</div></div>
                <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">New delivery</div><div className="mt-1 font-semibold text-gray-900">{toNumber(config.delivery_game_days, 0)} game days</div></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileWorkshopSupportPanel({ configRows, rosterRows }: Props): JSX.Element | null {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const configs = useMemo(() => [...configRows].sort((a, b) => a.asset_level - b.asset_level), [configRows])
  const configByLevel = useMemo(() => new Map(configs.map(row => [row.asset_level, row])), [configs])
  const selected = rosterRows.find(row => String(row.workshop_id ?? row.mobile_workshop_id ?? row.id) === selectedId) ?? null
  const selectedConfig = selected ? configByLevel.get(selected.asset_level) ?? null : null

  if (configs.length === 0) return null

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Production engine</div>
        <h3 className="mt-1 text-lg font-semibold text-gray-900">Mobile Workshop benefits</h3>
        <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">Mobile Workshops are race-event field-service assets. They improve Mechanical Reliability and recover part of stage equipment condition loss. Home-base maintenance speed and cost remain the job of the permanent Mechanics Workshop facility and mechanic staff.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {configs.map(config => {
          const mr = MECHANICAL_RELIABILITY_BY_LEVEL[config.asset_level] ?? 0
          const recovery = FIELD_RECOVERY_BY_LEVEL[config.asset_level] ?? 0
          return (
            <div key={config.asset_level} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex gap-3">
                <WorkshopImage level={config.asset_level} name={config.asset_name} />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Level {config.asset_level}</div>
                  <div className="mt-1 font-semibold text-gray-900">{config.asset_name}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{formatCash(config.cost_cash)}</div>
                  <div className="mt-1 text-xs text-gray-500">Delivery: {toNumber(config.delivery_game_days, 0)} game days</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="text-blue-600">Mechanical Reliability</div><div className="mt-1 text-lg font-semibold text-blue-900">{mr}</div></div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="text-emerald-600">Field Equipment Recovery</div><div className="mt-1 text-lg font-semibold text-emerald-900">{formatPercent(recovery)}</div></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="rounded-lg bg-white p-2.5">Mechanical risk: {formatPercent(mechanicalRiskMultiplier(mr) * 100, 1)}</div>
                <div className="rounded-lg bg-white p-2.5">Time loss: {formatPercent(mechanicalTimeLossMultiplier(mr) * 100, 1)}</div>
                <div className="rounded-lg bg-white p-2.5">120 km own wear: {formatPercent(config.condition_loss_per_race_day)}</div>
                <div className="rounded-lg bg-white p-2.5">Repair / point: {formatCash(config.repair_cost_per_condition_point ?? 0)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {rosterRows.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Owned Mobile Workshops</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {rosterRows.map(workshop => {
              const rawId = workshop.workshop_id ?? workshop.mobile_workshop_id ?? workshop.id
              const id = String(rawId ?? `${workshop.display_name}-${workshop.asset_level}`)
              const condition = toNumber(workshop.condition_percent, 0)
              const factor = toNumber(workshop.condition_factor, conditionFactor(condition))
              const mr = (MECHANICAL_RELIABILITY_BY_LEVEL[workshop.asset_level] ?? 0) * factor
              const recovery = (FIELD_RECOVERY_BY_LEVEL[workshop.asset_level] ?? 0) * factor
              return (
                <div key={id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{workshop.display_name}</div>
                    <div className="mt-1 text-xs text-gray-500">Lv {workshop.asset_level} · {formatPercent(condition)} condition · {formatPercent(factor * 100, 0)} effectiveness</div>
                    <div className="mt-1 text-xs font-medium text-gray-700">Current: {mr.toLocaleString('en-US', { maximumFractionDigits: 2 })} MR · {formatPercent(recovery)} field recovery</div>
                    {workshop.current_assignment_label && <div className="mt-1 text-xs text-blue-600">Assigned: {workshop.current_assignment_label}</div>}
                  </div>
                  {rawId && <button type="button" onClick={() => setSelectedId(String(rawId))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Details</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">Only one Mobile Workshop can be assigned to an event. Submitted Race Plans freeze the Workshop benefit at submission time for deterministic race replays.</div>

      {selected && selectedConfig && <DetailModal workshop={selected} config={selectedConfig} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
