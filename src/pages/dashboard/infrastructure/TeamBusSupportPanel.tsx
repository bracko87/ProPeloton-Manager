import { useTranslation } from 'react-i18next'
import React, { useEffect, useMemo, useState } from 'react'

import type {
  InfrastructureAssetConfigRow,
  TeamBusRosterRow,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDate,
  toNumber,
} from './infrastructureHelpers'
import { getInfrastructureAssetImageUrl } from './infrastructureAssetImages'

type TeamBusSupportPanelProps = {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: TeamBusRosterRow[]
}

type TeamBusProfileModalProps = {
  bus: TeamBusRosterRow
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

function wearForDistance(baseWear: number, distanceMultiplier: number): number {
  if (baseWear <= 0) return 0
  return clamp(baseWear * clamp(distanceMultiplier, 0.6, 1.6), 0.05, 2.5)
}

function conditionBand(condition: number): string {
  if (condition >= 70) return 'Full effectiveness'
  if (condition >= 50) return 'Reduced to 85% effectiveness'
  if (condition >= 30) return 'Reduced to 65% effectiveness'
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

function TeamBusImage({
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
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 ${
          large ? 'min-h-[260px]' : 'h-20 w-28'
        }`}
      >
        <span className="text-3xl" aria-hidden="true">🚌</span>
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

function TeamBusProfileModal({
  bus,
  config,
  onClose,
}: TeamBusProfileModalProps): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const condition = toNumber(bus.condition_percent, 0)
  const factor = toNumber(bus.condition_factor, 0)
  const baseWear = toNumber(
    bus.condition_loss_per_race_day ?? config.condition_loss_per_race_day,
    0,
  )
  const minimumCondition = toNumber(
    bus.min_assign_condition_percent ?? config.min_assign_condition_percent,
    30,
  )
  const repairCostPerPoint = toNumber(
    bus.repair_cost_per_condition_point ?? config.repair_cost_per_condition_point,
    0,
  )
  const repairPointsPerDay = toNumber(
    bus.repair_points_per_game_day ?? config.repair_points_per_game_day,
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
  const name = t(`assetTiers.team_bus.level${bus.asset_level}.name`, { defaultValue: config.asset_name || bus.asset_name || `Team Bus Level ${bus.asset_level}` })
  const cataloguePrice = toNumber(config.cost_cash, 0)
  const historicalPurchasePrice = toNumber(bus.purchase_cost_cash, cataloguePrice)

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
              {t('assets.teamBus')} · {t('common.level')} {bus.asset_level}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{name}</h3>
            {bus.display_name && bus.display_name !== name && (
              <div className="mt-1 text-sm text-gray-500">{bus.display_name}</div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <TeamBusImage level={bus.asset_level} name={name} large />

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.cataloguePrice')}</div>
                <div className="mt-1 font-semibold text-gray-900">{formatCash(cataloguePrice)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.originalPurchaseValue')}</div>
                <div className="mt-1 font-semibold text-gray-900">{formatCash(historicalPurchasePrice)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.statusLabel')}</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">
                  {t(`assetStatus.${bus.status}`, { defaultValue: String(bus.status).replaceAll('_', ' ') })}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.raceDaysUsed')}</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {toNumber(bus.total_race_days, 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.distanceCovered')}</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {toNumber(bus.total_distance_km, 0).toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })} km
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t('assetDetailCopy.lastUsed')}</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {bus.last_used_game_date ? formatGameDate(bus.last_used_game_date) : t('assetDetailCopy.notUsedYet')}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{t('assetDetailCopy.racePlanBenefits')}</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    {t('assetDetailCopy.raceProductionContext')}
                  </p>
                </div>
                <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">
                  {t('assetDetailCopy.effectiveBadge', { percent: formatEffectiveness(factor) })}
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
                        {reduced ? t('assetDetailCopy.benefitsCurrent', { value: currentBenefit }) : t('assetDetailCopy.fullValueActive')}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs leading-5 text-gray-600">
                {t('assetDetailCopy.teamBusInfo')}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">{t('common.condition')}</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.currentCondition')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(condition)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.currentEffectiveness')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatEffectiveness(factor)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.raceReadyMinimum')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{formatPercent(minimumCondition, 0)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                {t('assetDetailCopy.effectivenessBandsBus')}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">{t('assetDetailCopy.wearPerStage')}</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.shortStageFloor')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatPercent(shortStageWear)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.reference120')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatPercent(baseWear)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.longStageCeiling')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatPercent(longStageWear)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
                The universal race engine now uses this bus level's configured wear after every stage. Distance scales the 120 km reference from 60% to 160%. At the current condition this bus supports about {referenceStages} reference stages before reaching the {formatPercent(minimumCondition, 0)} assignment threshold.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-gray-900">{t('assetDetailCopy.maintenanceDelivery')}</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.repairPerCondition')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatCash(repairCostPerPoint)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.currentRepairEstimate')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatCash(currentRepairCost)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.currentRepairTime')}</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {currentRepairDays === 0 ? t('assetDetailCopy.noRepairNeeded') : t('common.gameDays', { count: currentRepairDays })}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">{t('assetDetailCopy.newDeliveryTime')}</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {t('common.gameDays', { count: toNumber(config.delivery_game_days, 0) })}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                A completed repair restores the bus to 100% condition. Repairs restore {formatPercent(repairPointsPerDay, 0)} condition points per game day and can only start while the bus is available and not locked to a race.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TeamBusSupportPanel({
  configRows,
  rosterRows,
}: TeamBusSupportPanelProps): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null)

  const sortedConfig = useMemo(
    () => [...configRows].sort((a, b) => a.asset_level - b.asset_level),
    [configRows],
  )
  const selectedBus = useMemo(
    () => rosterRows.find(bus => bus.bus_id === selectedBusId) ?? null,
    [rosterRows, selectedBusId],
  )
  const selectedConfig = useMemo(
    () => selectedBus
      ? configRows.find(config => config.asset_level === selectedBus.asset_level) ?? null
      : null,
    [configRows, selectedBus],
  )

  useEffect(() => {
    if (selectedBusId && !rosterRows.some(bus => bus.bus_id === selectedBusId)) {
      setSelectedBusId(null)
    }
  }, [rosterRows, selectedBusId])

  return (
    <>
      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              {t('assetDetailCopy.productionRaceEngineValues')}
            </div>
            <h3 className="mt-1 text-base font-semibold text-gray-900">{t('assetDetailCopy.teamBusLevelSupport')}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
              Exact prices, benefits, delivery, wear and maintenance values below come from the production Team Bus configuration used by Race Planning.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {t('assetDetailCopy.oneBus')}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {sortedConfig.map(config => {
            const benefits = splitBenefits(config.effect_summary)
            const baseWear = toNumber(config.condition_loss_per_race_day, 0)

            return (
              <div
                key={`team_bus_engine_level_${config.asset_level}`}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Level {config.asset_level}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{config.asset_name}</div>
                  </div>
                  <div className="text-xs font-semibold text-gray-700">{formatCash(config.cost_cash)}</div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {benefits.map(benefit => (
                    <div key={benefit} className="text-xs leading-4 text-gray-600">{benefit}</div>
                  ))}
                </div>

                <div className="mt-3 border-t border-gray-200 pt-2 text-[11px] leading-4 text-gray-500">
                  <div>Delivery: {toNumber(config.delivery_game_days, 0)} game days</div>
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
              <h4 className="text-sm font-semibold text-gray-900">{t('assetDetailCopy.yourBuses')}</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                {t('assetDetailCopy.openBusDetails')}
              </p>
            </div>
            <div className="text-xs font-semibold text-gray-500">{rosterRows.length} owned</div>
          </div>

          {rosterRows.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
              {t('assetDetailCopy.noBuses')}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {rosterRows.map(bus => {
                const config = configRows.find(row => row.asset_level === bus.asset_level)
                const name = config?.asset_name || bus.asset_name || `Team Bus Level ${bus.asset_level}`
                const baseWear = toNumber(
                  bus.condition_loss_per_race_day ?? config?.condition_loss_per_race_day,
                  0,
                )

                return (
                  <div
                    key={bus.bus_id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center"
                  >
                    <TeamBusImage level={bus.asset_level} name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">{bus.display_name || name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Lv {bus.asset_level}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{name}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        <span>Condition {formatPercent(toNumber(bus.condition_percent, 0))}</span>
                        <span>Effectiveness {formatEffectiveness(bus.condition_factor)}</span>
                        <span>120 km wear {formatPercent(baseWear)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBusId(bus.bus_id)}
                      disabled={!config}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('common.details')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {selectedBus && selectedConfig && (
        <TeamBusProfileModal
          bus={selectedBus}
          config={selectedConfig}
          onClose={() => setSelectedBusId(null)}
        />
      )}
    </>
  )
}
