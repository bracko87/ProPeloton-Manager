import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  InfrastructureAssetConfigRow,
  InfrastructureJobRow,
} from './infrastructureTypes'
import {
  formatAssetPercent,
  formatCash,
  formatGameDays,
  toNumber,
} from './infrastructureHelpers'
import {
  getInfrastructureAssetImageUrl,
  type InfrastructureVisualAssetKey,
} from './infrastructureAssetImages'

type AssetAcquireCatalogModalProps = {
  assetKey: InfrastructureVisualAssetKey
  title: string
  description: string
  assetLabel: string
  configRows: InfrastructureAssetConfigRow[]
  ownedByLevel: Map<number, number>
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  processingKey: string | null
  processingKeyPrefix: string
  isFull: boolean
  onAcquire: (assetLevel: number) => void
  onClose: () => void
}

function countPendingForLevel(
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>,
  assetLevel: number,
): number {
  return (
    pendingJobsByLevel
      .get(assetLevel)
      ?.reduce(
        (sum, job) =>
          sum + Math.max(1, Math.floor(toNumber(job.asset_quantity, 1))),
        0,
      ) ?? 0
  )
}

function getAssetTierName(
  assetKey: InfrastructureVisualAssetKey,
  config: InfrastructureAssetConfigRow,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return t(`assetTiers.${assetKey}.level${config.asset_level}.name`, {
    defaultValue: config.asset_name,
  })
}

function getAssetTierEffect(
  assetKey: InfrastructureVisualAssetKey,
  config: InfrastructureAssetConfigRow,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return t(`assetTiers.${assetKey}.level${config.asset_level}.effect`, {
    defaultValue: config.effect_summary ?? '',
  })
}

function getFallbackIcon(assetKey: InfrastructureVisualAssetKey): string {
  switch (assetKey) {
    case 'team_car':
      return '🚙'
    case 'team_bus':
      return '🚌'
    case 'mobile_workshop':
      return '🛠️'
    case 'medical_van':
      return '⚕️'
    case 'equipment_van':
    default:
      return '🚐'
  }
}

function AssetTierImage({
  assetKey,
  assetLevel,
  assetName,
  large = false,
}: {
  assetKey: InfrastructureVisualAssetKey
  assetLevel: number
  assetName: string
  large?: boolean
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const imageUrl = getInfrastructureAssetImageUrl(assetKey, assetLevel)

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center ${
          large ? 'min-h-[260px] sm:min-h-[360px]' : 'aspect-[16/9] min-h-[130px]'
        }`}
      >
        <div className="text-4xl" aria-hidden="true">
          {getFallbackIcon(assetKey)}
        </div>
        <div className="mt-2 text-xs font-semibold text-slate-600">
          {assetName}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Level {assetLevel} image coming soon
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white ${
        large ? 'min-h-[260px] sm:min-h-[360px]' : 'aspect-[16/9] min-h-[130px]'
      }`}
    >
      <img
        src={imageUrl}
        alt={`${assetName} level ${assetLevel}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`h-full w-full ${large ? 'max-h-[460px]' : 'max-h-[190px]'} object-contain`}
      />
    </div>
  )
}

export function AssetAcquireCatalogModal({
  assetKey,
  title,
  description,
  assetLabel,
  configRows,
  ownedByLevel,
  pendingJobsByLevel,
  processingKey,
  processingKeyPrefix,
  isFull,
  onAcquire,
  onClose,
}: AssetAcquireCatalogModalProps): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)

  const selectedConfig = useMemo(
    () =>
      selectedLevel == null
        ? null
        : configRows.find(config => config.asset_level === selectedLevel) ?? null,
    [configRows, selectedLevel],
  )

  useEffect(() => {
    setSelectedLevel(null)
  }, [assetKey])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (selectedLevel != null) {
        setSelectedLevel(null)
      } else {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedLevel])

  const renderOrderButton = (
    config: InfrastructureAssetConfigRow,
    fullWidth = false,
  ) => {
    const isProcessing =
      processingKey === `${processingKeyPrefix}:${config.asset_level}`

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
        {isProcessing
          ? t('common.starting')
          : isFull
            ? t('common.garageFull')
            : t('assets.startDelivery')}
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
        aria-label={title}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {selectedConfig ? (
              <button
                type="button"
                onClick={() => setSelectedLevel(null)}
                className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-600"
              >
                <span aria-hidden="true">←</span>
                Back to {assetLabel}
              </button>
            ) : (
              <div className="text-xs uppercase tracking-wide text-gray-400">
                {assetLabel}
              </div>
            )}

            <h3 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl">
              {selectedConfig
                ? getAssetTierName(assetKey, selectedConfig, t)
                : title}
            </h3>

            <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500">
              {selectedConfig
                ? `Level ${selectedConfig.asset_level} ${assetLabel}`
                : description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isFull && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('assets.garageFullDescription')}
            </div>
          )}

          {!selectedConfig && configRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('assets.noTiers')}
            </div>
          )}

          {!selectedConfig && configRows.length > 0 && (
            <div className="space-y-4">
              {configRows.map(config => {
                const ownedCount = ownedByLevel.get(config.asset_level) ?? 0
                const pendingForLevel = countPendingForLevel(
                  pendingJobsByLevel,
                  config.asset_level,
                )
                const tierName = getAssetTierName(assetKey, config, t)
                const tierEffect = getAssetTierEffect(assetKey, config, t)

                return (
                  <div
                    key={`${processingKeyPrefix}_catalog_${config.asset_level}`}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                  >
                    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[240px_minmax(0,1fr)_230px_150px] lg:items-center">
                      <AssetTierImage
                        key={`${assetKey}-${config.asset_level}-list`}
                        assetKey={assetKey}
                        assetLevel={config.asset_level}
                        assetName={tierName}
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-gray-900">
                            {tierName}
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Level {config.asset_level}
                          </span>
                        </div>

                        <div className="mt-1 text-xs font-medium text-gray-500">
                          {t('common.support')} {formatAssetPercent(config.support_value)}
                        </div>

                        {tierEffect && (
                          <p className="mt-2 text-xs leading-5 text-gray-600">
                            {tierEffect}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-700 lg:bg-transparent lg:p-0">
                        <div>
                          <div className="text-gray-400">{t('common.cost')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {formatCash(config.cost_cash)}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.delivery')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {formatGameDays(config.delivery_game_days)}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.owned')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {ownedCount}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.pending')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {pendingForLevel}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row gap-2 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => setSelectedLevel(config.asset_level)}
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Details
                        </button>
                        <div className="flex-1">{renderOrderButton(config, true)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedConfig && (() => {
            const tierName = getAssetTierName(assetKey, selectedConfig, t)
            const tierEffect = getAssetTierEffect(assetKey, selectedConfig, t)
            const ownedCount = ownedByLevel.get(selectedConfig.asset_level) ?? 0
            const pendingForLevel = countPendingForLevel(
              pendingJobsByLevel,
              selectedConfig.asset_level,
            )

            return (
              <div className="space-y-5">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <AssetTierImage
                    key={`${assetKey}-${selectedConfig.asset_level}-detail`}
                    assetKey={assetKey}
                    assetLevel={selectedConfig.asset_level}
                    assetName={tierName}
                    large
                  />

                  <div className="flex flex-col">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-gray-400">
                            {assetLabel}
                          </div>
                          <div className="mt-1 text-xl font-semibold text-gray-900">
                            {tierName}
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            Level {selectedConfig.asset_level} · {t('common.support')}{' '}
                            {formatAssetPercent(selectedConfig.support_value)}
                          </div>
                        </div>

                        <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-900">
                          Level {selectedConfig.asset_level}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-gray-400">{t('common.cost')}</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatCash(selectedConfig.cost_cash)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-gray-400">{t('common.delivery')}</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatGameDays(selectedConfig.delivery_game_days)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-gray-400">{t('common.owned')}</div>
                          <div className="mt-1 font-semibold text-gray-900">{ownedCount}</div>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-gray-400">{t('common.pending')}</div>
                          <div className="mt-1 font-semibold text-gray-900">{pendingForLevel}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-1 flex-col justify-end">
                      {renderOrderButton(selectedConfig, true)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
                    <div className="text-sm font-semibold text-gray-900">
                      Benefits
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Support value
                        </div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">
                          {formatAssetPercent(selectedConfig.support_value)}
                        </div>
                      </div>

                      {tierEffect && (
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Gameplay effect
                          </div>
                          <p className="mt-1 text-sm leading-6 text-gray-700">
                            {tierEffect}
                          </p>
                        </div>
                      )}

                      {selectedConfig.unlock_summary && (
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Capability / unlock
                          </div>
                          <p className="mt-1 text-sm leading-6 text-gray-700">
                            {selectedConfig.unlock_summary}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
                    <div className="text-sm font-semibold text-gray-900">
                      What this asset provides
                    </div>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      {tierEffect || selectedConfig.unlock_summary ||
                        `${tierName} provides ${formatAssetPercent(selectedConfig.support_value)} support when it is eligible for the relevant game system.`}
                    </p>

                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      The displayed tier is the asset you are ordering. Delivery, ownership and race eligibility continue to use the existing infrastructure and assignment rules.
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
