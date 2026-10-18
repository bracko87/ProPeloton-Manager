import { useTranslation } from 'react-i18next'
import React, { useMemo, useState } from 'react'

import type { InfrastructureAssetConfigRow, MedicalVanRosterRow } from './infrastructureTypes'
import { formatCash, formatGameDate, toNumber } from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'
import { localizeAssetBenefit, localizeDefaultVehicleName } from './localizeAssetCopy'

type Props = {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: MedicalVanRosterRow[]
}

type Tier = {
  healthProtection: number
  fatigueControl: number
  recoverySupport: number
  rawEffects: string
}

const TIERS: Record<number, Tier> = {
  1: { healthProtection: 3, fatigueControl: 0, recoverySupport: 1, rawEffects: 'Medical response +2% • Minor injury risk -1% • Recovery +1%' },
  2: { healthProtection: 5, fatigueControl: 2, recoverySupport: 2, rawEffects: 'Medical response +3% • Minor injury risk -2% • Hydration +2% • Recovery +2%' },
  3: { healthProtection: 8, fatigueControl: 4, recoverySupport: 4, rawEffects: 'Medical response +4% • Minor injury risk -4% • Heat/hydration +4% • Recovery +4%' },
}

function conditionFactor(condition: number): number {
  if (condition >= 90) return 1
  if (condition >= 75) return 0.95
  if (condition >= 60) return 0.85
  if (condition >= 45) return 0.7
  if (condition >= 30) return 0.5
  return 0
}

function number(value: number, digits = 2): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function percent(value: number, digits = 2): string {
  return `${number(value, digits)}%`
}

function scaledTier(level: number, condition: number): Tier {
  const tier = TIERS[level] ?? TIERS[1]
  const factor = conditionFactor(condition)
  return {
    healthProtection: tier.healthProtection * factor,
    fatigueControl: tier.fatigueControl * factor,
    recoverySupport: tier.recoverySupport * factor,
    rawEffects: tier.rawEffects,
  }
}

function engineSummary(level: number, condition: number) {
  const tier = scaledTier(level, condition)
  const healthRisk = Math.max(0.78, 1 - Math.min(0.22, tier.healthProtection * 0.012))
  const energy = Math.max(0.9, 1 - Math.min(0.1, tier.fatigueControl * 0.003))
  const postFatigue = Math.max(0.85, 1 - Math.min(0.15, tier.fatigueControl * 0.01 + tier.recoverySupport * 0.005))
  const recovery = Math.min(8, tier.recoverySupport * 0.2 + tier.fatigueControl * 0.1)
  return { tier, healthRisk, energy, postFatigue, recovery }
}

function MedicalVanImage({ level, name, large = false }: { level: number; name: string; large?: boolean }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl('medical_van', level)

  if (!imageUrl || failed) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 ${large ? 'min-h-[260px]' : 'h-20 w-28 shrink-0'}`}>
        <span className="text-4xl" aria-hidden="true">⚕️</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${large ? 'min-h-[260px]' : 'h-20 w-28 shrink-0'}`}>
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

export function MedicalVanSupportPanel({ configRows, rosterRows }: Props): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const configByLevel = useMemo(
    () => new Map(configRows.map(config => [config.asset_level, config])),
    [configRows],
  )
  const selected = selectedId == null ? null : rosterRows.find(row => row.van_id === selectedId) ?? null
  const selectedConfig = selected ? configByLevel.get(selected.asset_level) ?? null : null

  return (
    <>
      <section className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-500">{t('assets.medicalVan')}</div>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">{t('assetDetailCopy.medicalTitle')}</h3>
              <p className="mt-1 max-w-4xl text-sm text-gray-500">
                {t('assetDetailCopy.medicalInfo')}
              </p>
            </div>
            <div className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
              {t('assetDetailCopy.medicalBadge')}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-3">
          {configRows.slice().sort((a, b) => a.asset_level - b.asset_level).map(config => {
            const tier = TIERS[config.asset_level] ?? TIERS[1]
            return (
              <div key={config.asset_level} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-400">{t('assetDetailCopy.levelLabel', { level: config.asset_level })}</div>
                <div className="mt-0.5 font-semibold text-gray-900">{t(`assetTiers.medical_van.level${config.asset_level}.name`, { defaultValue: config.asset_name })}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white px-2 py-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.health')}</div><div className="font-semibold text-rose-700">{tier.healthProtection}</div></div>
                  <div className="rounded-lg bg-white px-2 py-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.fatigue')}</div><div className="font-semibold text-amber-700">{tier.fatigueControl}</div></div>
                  <div className="rounded-lg bg-white px-2 py-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.recovery')}</div><div className="font-semibold text-emerald-700">{tier.recoverySupport}</div></div>
                </div>
                <div className="mt-3 text-[11px] leading-4 text-gray-500">{tier.rawEffects.split(' • ').map(effect => localizeAssetBenefit(effect, t)).join(' • ')}</div>
                <div className="mt-3 flex items-center justify-between text-xs"><span className="text-gray-400">{t('assetDetailCopy.catalogueShort')}</span><span className="font-semibold text-gray-900">{formatCash(config.cost_cash)}</span></div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 text-xs leading-5 text-gray-500 sm:px-5">
          {t('assetDetailCopy.conditionEffectivenessScale')}
        </div>
      </section>

      {rosterRows.length > 0 && (
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900">{t('assetDetailCopy.yourMedicalVans')}</h3>
          <div className="mt-3 space-y-3">
            {rosterRows.map(van => {
              const condition = toNumber(van.condition_percent, 0)
              const config = configByLevel.get(van.asset_level)
              const engine = engineSummary(van.asset_level, condition)
              const factor = conditionFactor(condition)
              return (
                <div key={van.van_id} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 lg:flex-row lg:items-center">
                  <MedicalVanImage level={van.asset_level} name={config?.asset_name ?? van.asset_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-gray-900">{localizeDefaultVehicleName(van.display_name, t) || t(`assetTiers.medical_van.level${van.asset_level}.name`, { defaultValue: config?.asset_name || van.asset_name })}</div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">L{van.asset_level}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">{t(`assetStatus.${van.status}`, { defaultValue: String(van.status).replaceAll('_', ' ') })}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{t('common.condition')} <strong className="text-gray-800">{percent(condition)}</strong></span>
                      <span>{t('assetDetailCopy.effectiveness')} <strong className="text-gray-800">{percent(factor * 100, 0)}</strong></span>
                      <span>HP <strong className="text-rose-700">{number(engine.tier.healthProtection)}</strong></span>
                      <span>FC <strong className="text-amber-700">{number(engine.tier.fatigueControl)}</strong></span>
                      <span>{t('assetDetailCopy.recovery')} <strong className="text-emerald-700">{number(engine.tier.recoverySupport)}</strong></span>
                    </div>
                    {van.current_assignment_label && <div className="mt-1 text-[11px] text-gray-400">{t('common.assigned')}: {van.current_assignment_label}</div>}
                  </div>
                  <button type="button" onClick={() => setSelectedId(van.van_id)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">{t('common.details')}</button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {selected && selectedConfig && (() => {
        const condition = toNumber(selected.condition_percent, 0)
        const factor = conditionFactor(condition)
        const engine = engineSummary(selected.asset_level, condition)
        const missing = Math.max(0, 100 - condition)
        const repairCost = Math.ceil(missing * toNumber(selected.repair_cost_per_condition_point ?? selectedConfig.repair_cost_per_condition_point, 0))
        const repairSpeed = toNumber(selected.repair_points_per_game_day ?? selectedConfig.repair_points_per_game_day, 0)
        const repairDays = missing <= 0 || repairSpeed <= 0 ? 0 : Math.max(1, Math.ceil(missing / repairSpeed))
        const wear = toNumber(selected.condition_loss_per_race_day ?? selectedConfig.condition_loss_per_race_day, 0)

        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6" onClick={() => setSelectedId(null)}>
            <div role="dialog" aria-modal="true" aria-label="Medical Van details" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-500">{t('assets.medicalVan')} · {t('common.level')} {selected.asset_level}</div>
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">{localizeDefaultVehicleName(selected.display_name, t) || t(`assetTiers.medical_van.level${selected.asset_level}.name`, { defaultValue: selectedConfig.asset_name })}</h3>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">{t('common.close')}</button>
              </div>

              <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <MedicalVanImage level={selected.asset_level} name={selectedConfig.asset_name} large />
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-xs">
                    <div><div className="text-gray-400">{t('assetDetailCopy.cataloguePrice')}</div><div className="mt-1 font-semibold text-gray-900">{formatCash(selectedConfig.cost_cash)}</div></div>
                    <div><div className="text-gray-400">{t('assetDetailCopy.originalPurchase')}</div><div className="mt-1 font-semibold text-gray-900">{formatCash(selected.purchase_cost_cash)}</div></div>
                    <div><div className="text-gray-400">{t('assetDetailCopy.raceDays')}</div><div className="mt-1 font-semibold text-gray-900">{toNumber(selected.total_race_days, 0)}</div></div>
                    <div><div className="text-gray-400">{t('assetDetailCopy.distance')}</div><div className="mt-1 font-semibold text-gray-900">{number(toNumber(selected.total_distance_km, 0), 0)} km</div></div>
                    <div><div className="text-gray-400">{t('assetDetailCopy.lastUsed')}</div><div className="mt-1 font-semibold text-gray-900">{selected.last_used_game_date ? formatGameDate(selected.last_used_game_date) : t('assetDetailCopy.notUsedYet')}</div></div>
                    <div><div className="text-gray-400">{t('assetDetailCopy.statusLabel')}</div><div className="mt-1 font-semibold capitalize text-gray-900">{t(`assetStatus.${selected.status}`, { defaultValue: String(selected.status).replaceAll('_', ' ') })}</div></div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                    <div className="flex items-center justify-between gap-3"><div className="font-semibold text-gray-900">{t('assetDetailCopy.medicalCurrentEffect')}</div><div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">{t('assetDetailCopy.effectiveBadge', { percent: percent(factor * 100, 0) })}</div></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.healthProtection')}</div><div className="font-semibold text-rose-700">{number(engine.tier.healthProtection)}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.fatigueControl')}</div><div className="font-semibold text-amber-700">{number(engine.tier.fatigueControl)}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-gray-400">{t('assetDetailCopy.recoverySupport')}</div><div className="font-semibold text-emerald-700">{number(engine.tier.recoverySupport)}</div></div>
                    </div>
                    <div className="mt-3 text-xs leading-5 text-rose-900">{t('assetDetailCopy.healthRiskLabel')} <strong>{number(engine.healthRisk, 3)}</strong>. {t('assetDetailCopy.medicalRiskExplanation')}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 p-4 text-xs"><div className="font-semibold text-gray-900">{t('assetDetailCopy.medicalFatigueEngine')}</div><div className="mt-2 space-y-1 text-gray-500"><div>{t('assetDetailCopy.stageEnergy')} <strong className="text-gray-800">{number(engine.energy, 3)}</strong></div><div>{t('assetDetailCopy.postFatigue')} <strong className="text-gray-800">{number(engine.postFatigue, 3)}</strong></div><div>{t('assetDetailCopy.bonusRecovery')} <strong className="text-gray-800">+{number(engine.recovery)}</strong></div></div></div>
                    <div className="rounded-xl border border-gray-100 p-4 text-xs"><div className="font-semibold text-gray-900">{t('assetDetailCopy.medicalWearRepair')}</div><div className="mt-2 space-y-1 text-gray-500"><div>{t('assetDetailCopy.medicalReferenceWear')}: <strong className="text-gray-800">{percent(wear)}</strong></div><div>{t('assetDetailCopy.repairPointLabel')} <strong className="text-gray-800">{formatCash(selected.repair_cost_per_condition_point ?? selectedConfig.repair_cost_per_condition_point ?? 0)}</strong></div><div>{t('assetDetailCopy.repairSpeed')} <strong className="text-gray-800">{t('assetDetailCopy.medicalRepairSpeed', { value: number(repairSpeed, 0) })}</strong></div><div>{t('assetDetailCopy.repairNow')} <strong className="text-gray-800">{formatCash(repairCost)} · {t('common.gameDays', { count: repairDays })}</strong></div></div></div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                    {t('assetDetailCopy.medicalAssignmentRule')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
