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

type EngineProfile = {
  raceSupport: number
  mechanical: number
  health: number
  fatigue: number
}

const ENGINE_PROFILE: Record<number, EngineProfile> = {
  1: { raceSupport: 2, mechanical: 1, health: 0, fatigue: 0 },
  2: { raceSupport: 3, mechanical: 2, health: 0, fatigue: 0 },
  3: { raceSupport: 5, mechanical: 3, health: 1, fatigue: 0 },
  4: { raceSupport: 9, mechanical: 4, health: 3, fatigue: 1 },
  5: { raceSupport: 15, mechanical: 5, health: 4, fatigue: 2 },
}

function splitBenefits(summary: string | null | undefined): string[] {
  return String(summary ?? '').split(';').map(v => v.trim()).filter(Boolean)
}

function countPending(map: Map<number, InfrastructureJobRow[]>, level: number): number {
  return map.get(level)?.reduce((sum, job) => sum + Math.max(1, Math.floor(toNumber(job.asset_quantity, 1))), 0) ?? 0
}

function percentOfBaseline(multiplier: number): string {
  return `${(multiplier * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

function engineImpact(profile: EngineProfile) {
  const energy = Math.max(0.9, 1 - Math.min(0.1, profile.fatigue * 0.003 + profile.raceSupport * 0.0015))
  const command = Math.min(1.5, profile.raceSupport * 0.05)
  const health = Math.max(0.78, 1 - Math.min(0.22, profile.health * 0.012 + profile.raceSupport * 0.002))
  const mechRisk = Math.max(0.78, 1 - Math.min(0.22, profile.mechanical * 0.025 + profile.raceSupport * 0.002))
  const mechLoss = Math.max(0.82, 1 - Math.min(0.18, profile.mechanical * 0.02 + profile.raceSupport * 0.0015))
  const postFatigue = Math.max(0.85, 1 - Math.min(0.15, profile.fatigue * 0.01))
  return { energy, command, health, mechRisk, mechLoss, postFatigue }
}

function CarImage({ level, name, large = false }: { level: number; name: string; large?: boolean }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const url = getInfrastructureAssetImageUrl('team_car', level)
  if (!url || failed) {
    return <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 ${large ? 'min-h-[320px]' : 'h-28'}`}><span className="text-5xl">🚙</span></div>
  }
  return <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${large ? 'min-h-[320px]' : 'h-28'}`}><img src={url} alt={name} onError={() => setFailed(true)} className="h-full w-full object-contain" /></div>
}

export function TeamCarAcquireCatalogModal({ configRows, ownedByLevel, pendingJobsByLevel, processingKey, isFull, onAcquire, onClose }: Props): JSX.Element {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const configs = useMemo(() => [...configRows].sort((a, b) => a.asset_level - b.asset_level), [configRows])
  const selected = selectedLevel == null ? null : configs.find(row => row.asset_level === selectedLevel) ?? null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedLevel != null) setSelectedLevel(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedLevel])

  const orderButton = (config: InfrastructureAssetConfigRow) => {
    const busy = processingKey === `asset:team_car:${config.asset_level}`
    return <button type="button" onClick={() => onAcquire(config.asset_level)} disabled={busy || isFull} className={`w-full rounded-lg px-4 py-2.5 text-xs font-semibold ${busy || isFull ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}>{busy ? 'Starting…' : isFull ? 'Garage full' : 'Order for delivery'}</button>
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-2 py-3 sm:px-4 sm:py-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
          <div>
            {selected && <button type="button" onClick={() => setSelectedLevel(null)} className="mb-2 text-xs font-semibold text-blue-700">← Back to Team Cars</button>}
            <h3 className="text-xl font-semibold text-gray-900">{selected ? selected.asset_name : 'Order Team Car'}</h3>
            <p className="mt-1 text-sm text-gray-500">{selected ? `Level ${selected.asset_level} Team Car` : 'Compare exact production race-engine benefits before ordering.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600">Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {!selected ? (
            <div className="space-y-4">
              {configs.map(config => {
                const profile = ENGINE_PROFILE[config.asset_level] ?? { raceSupport: 0, mechanical: 0, health: 0, fatigue: 0 }
                return <div key={config.asset_level} className="grid gap-4 rounded-2xl border border-gray-200 p-4 lg:grid-cols-[220px_minmax(0,1fr)_230px_160px] lg:items-center">
                  <CarImage level={config.asset_level} name={config.asset_name} />
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold text-gray-900">{config.asset_name}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Level {config.asset_level}</span></div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Race Support {profile.raceSupport}</span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">Mechanical {profile.mechanical}</span>
                      {profile.health > 0 && <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">Health {profile.health}</span>}
                      {profile.fatigue > 0 && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Fatigue {profile.fatigue}</span>}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{config.effect_summary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><div className="text-gray-400">Cost</div><div className="font-semibold">{formatCash(config.cost_cash)}</div></div>
                    <div><div className="text-gray-400">Delivery</div><div className="font-semibold">{formatGameDays(config.delivery_game_days)}</div></div>
                    <div><div className="text-gray-400">Owned</div><div className="font-semibold">{ownedByLevel.get(config.asset_level) ?? 0}</div></div>
                    <div><div className="text-gray-400">Pending</div><div className="font-semibold">{countPending(pendingJobsByLevel, config.asset_level)}</div></div>
                  </div>
                  <div className="space-y-2"><button type="button" onClick={() => setSelectedLevel(config.asset_level)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-700">Details</button>{orderButton(config)}</div>
                </div>
              })}
            </div>
          ) : (() => {
            const profile = ENGINE_PROFILE[selected.asset_level] ?? { raceSupport: 0, mechanical: 0, health: 0, fatigue: 0 }
            const impact = engineImpact(profile)
            const benefits = splitBenefits(selected.effect_summary)
            return <div className="space-y-5">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <CarImage level={selected.asset_level} name={selected.asset_name} large />
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <div className="flex items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-gray-400">Team Cars</div><div className="mt-1 text-xl font-semibold text-gray-900">{selected.asset_name}</div></div><span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-900">Level {selected.asset_level}</span></div>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-white p-3"><div className="text-xs text-gray-400">Cost</div><div className="mt-1 font-semibold">{formatCash(selected.cost_cash)}</div></div><div className="rounded-lg bg-white p-3"><div className="text-xs text-gray-400">Delivery</div><div className="mt-1 font-semibold">{formatGameDays(selected.delivery_game_days)}</div></div><div className="rounded-lg bg-white p-3"><div className="text-xs text-gray-400">Owned</div><div className="mt-1 font-semibold">{ownedByLevel.get(selected.asset_level) ?? 0}</div></div><div className="rounded-lg bg-white p-3"><div className="text-xs text-gray-400">Pending</div><div className="mt-1 font-semibold">{countPending(pendingJobsByLevel, selected.asset_level)}</div></div></div>
                  </div>
                  {orderButton(selected)}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-gray-100 bg-white p-5">
                  <h4 className="text-sm font-semibold text-gray-900">Exact configured bonuses</h4>
                  <div className="mt-3 space-y-2">{benefits.map(line => <div key={line} className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-700">{line}</div>)}</div>
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">These are the raw Team Car effects saved into Race Plan preparation. Condition scales them when the car is worn.</div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5">
                  <h4 className="text-sm font-semibold text-gray-900">Canonical race-engine translation</h4>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-blue-50 p-3"><div className="text-blue-600">Race Support</div><div className="mt-1 text-xl font-semibold text-blue-900">{profile.raceSupport}</div></div>
                    <div className="rounded-xl bg-slate-100 p-3"><div className="text-slate-600">Mechanical Reliability</div><div className="mt-1 text-xl font-semibold text-slate-900">{profile.mechanical}</div></div>
                    <div className="rounded-xl bg-rose-50 p-3"><div className="text-rose-600">Health Protection</div><div className="mt-1 text-xl font-semibold text-rose-900">{profile.health}</div></div>
                    <div className="rounded-xl bg-emerald-50 p-3"><div className="text-emerald-600">Fatigue Control</div><div className="mt-1 text-xl font-semibold text-emerald-900">{profile.fatigue}</div></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-500">Race Support combines coverage, tactical communication and feeding support. Mechanical Response feeds Mechanical Reliability. Incident Response feeds Health Protection. Race Fatigue Protection feeds Fatigue Control.</p>
                </section>
              </div>

              <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                <h4 className="text-sm font-semibold text-gray-900">What this changes in a race at full condition</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Rider energy cost</div><div className="mt-1 font-semibold">{percentOfBaseline(impact.energy)} of baseline</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Command bonus</div><div className="mt-1 font-semibold">+{impact.command.toFixed(2)}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Mechanical incident risk</div><div className="mt-1 font-semibold">{percentOfBaseline(impact.mechRisk)} of baseline</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Mechanical time loss</div><div className="mt-1 font-semibold">{percentOfBaseline(impact.mechLoss)} of baseline</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Health-incident multiplier</div><div className="mt-1 font-semibold">{percentOfBaseline(impact.health)} of baseline</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-xs text-gray-400">Post-stage fatigue</div><div className="mt-1 font-semibold">{percentOfBaseline(impact.postFatigue)} of baseline</div></div>
                </div>
                <p className="mt-3 text-xs leading-5 text-blue-800">The Team Car is strongest as a broad race-day support asset: better command execution and energy efficiency, lower mechanical risk/time loss, plus health/fatigue protection on higher tiers. Up to three eligible cars can contribute to an event, subject to the Race Plan rules.</p>
              </section>
            </div>
          })()}
        </div>
      </div>
    </div>
  )
}
