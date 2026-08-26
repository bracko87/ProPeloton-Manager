/**
 * EquipmentOverviewTab.tsx
 *
 * High-level overview tab for the Equipment dashboard.
 * Shows overall readiness, category summaries, editable default setup,
 * race supplies, and technical sponsor / support effects.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EquipmentSetupPresetsBox from './EquipmentSetupPresetsBox'
import EquipmentOptionPreviewPopover from './EquipmentOptionPreviewPopover'
import {
  getActiveTechnicalSponsorSupport,
  getEquipmentDashboard,
  getEquipmentDefaultSetupOptions,
  saveEquipmentDefaultSetupTypes,
} from '../equipmentApi'
import type {
  EquipmentDashboard,
  EquipmentDefaultSetupCategoryOption,
  EquipmentDefaultSetupOptionsResponse,
  TechnicalSponsor,
} from '../types'
import { formatCondition, formatPercent, getStockBadgeClass } from '../equipmentFormatters'
import type { EquipmentPremiumAccess } from '../equipmentApi'

type EquipmentOverviewTabProps = {
  clubId: string
  equipmentAccess: EquipmentPremiumAccess | null
  onAccessChanged?: (access: EquipmentPremiumAccess) => void
}

type DefaultSetupSelection = {
  frame: string
  wheelset: string
  tires: string
  groupset: string
  helmet: string
  shoes: string
}

type StatCardProps = {
  label: string
  value: string | number
  helper?: string
}

type ActiveTechnicalSponsorSupport = {
  has_active_support: boolean
  benefit_id?: string
  club_sponsor_id?: string
  sponsor_company_id?: string
  sponsor_name?: string
  sponsor_logo_url?: string | null
  contract_value_cash?: number | string
  cash_support_cash?: number | string
  equipment_support_budget_cash?: number | string
  equipment_support_used_cash?: number | string
  equipment_support_remaining_cash?: number | string
  equipment_support_used_pct?: number | string
  category_discounts_json?: Record<string, number | string>
  starts_game_date?: string | null
  expires_game_date?: string | null
  status?: string
  notes?: string[]
}

function toNumber(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function formatMoney(value: unknown): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

function getEquipmentCategoryTranslationKey(category: string): string | null {
  const keys: Record<string, string> = {
    frame: 'categories.frames',
    wheelset: 'categories.wheelsets',
    tires: 'categories.tires',
    groupset: 'categories.groupsets',
    helmet: 'categories.helmets',
    shoes: 'categories.shoes',
  }

  return keys[category] ?? null
}

function getSponsorInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function getTechnicalSponsorLogoUrl(sponsor: TechnicalSponsor): string | null {
  const metadata = sponsor.metadata ?? {}

  const metadataLogo =
    typeof metadata.logo_url === 'string' && metadata.logo_url.trim()
      ? metadata.logo_url.trim()
      : null

  const directLogo =
    typeof sponsor.logo_url === 'string' && sponsor.logo_url.trim()
      ? sponsor.logo_url.trim()
      : null

  return directLogo ?? metadataLogo
}

function StatCard({ label, value, helper }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-gray-500">{helper}</div> : null}
    </div>
  )
}

function makeInitialSelection(
  options: EquipmentDefaultSetupOptionsResponse | null
): DefaultSetupSelection {
  const empty: DefaultSetupSelection = {
    frame: '',
    wheelset: '',
    tires: '',
    groupset: '',
    helmet: '',
    shoes: '',
  }

  if (!options) return empty

  options.categories.forEach(category => {
    empty[category.equipment_category] =
      category.selected_catalog_item_id ??
      category.recommended_catalog_item_id ??
      ''
  })

  return empty
}

export default function EquipmentOverviewTab({
  clubId,
  equipmentAccess,
  onAccessChanged,
}: EquipmentOverviewTabProps): JSX.Element {
  const { t } = useTranslation('equipment')
  const [dashboard, setDashboard] = useState<EquipmentDashboard | null>(null)
  const [technicalSupport, setTechnicalSupport] =
    useState<ActiveTechnicalSponsorSupport | null>(null)
  const [setupOptions, setSetupOptions] =
    useState<EquipmentDefaultSetupOptionsResponse | null>(null)
  const [selection, setSelection] = useState<DefaultSetupSelection>({
    frame: '',
    wheelset: '',
    tires: '',
    groupset: '',
    helmet: '',
    shoes: '',
  })

  const [loading, setLoading] = useState(true)
  const [savingSetup, setSavingSetup] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function formatEquipmentCategoryLabel(category: string, fallback?: string): string {
    const key = getEquipmentCategoryTranslationKey(category)
    return key ? t(key) : (fallback ?? category)
  }

  function getDefaultSetupOptionLabel(option: {
    display_name: string
    available_count: number
    owned_count: number
  }): string {
    return `${option.display_name} (${t('overview.availableOwned', {
      available: option.available_count,
      owned: option.owned_count,
    })})`
  }

  function getCategoryHelper(category: EquipmentDefaultSetupCategoryOption): string {
    const selected =
      category.options.find(
        option =>
          option.catalog_item_id === category.selected_catalog_item_id ||
          option.catalog_item_id === category.recommended_catalog_item_id
      ) ?? null

    const categoryLabel = formatEquipmentCategoryLabel(
      category.equipment_category,
      category.label
    )

    if (!selected) {
      return t('overview.noOwnedType', { category: categoryLabel })
    }

    return t('overview.availableOwned', {
      available: selected.available_count,
      owned: selected.owned_count,
    })
  }

  function formatStockStatus(status: string): string {
    switch (status.toLowerCase()) {
      case 'ok':
        return t('status.ok')
      case 'low':
        return t('status.low')
      case 'empty':
        return t('status.empty')
      default:
        return status
    }
  }

  async function loadDashboard(): Promise<void> {
    setLoading(true)
    setError(null)
    setSetupMessage(null)

    try {
      const [dashboardData, setupOptionsData, technicalSupportData] =
        await Promise.all([
          getEquipmentDashboard(clubId),
          getEquipmentDefaultSetupOptions(clubId),
          getActiveTechnicalSponsorSupport(clubId).catch(() => null),
        ])

      setDashboard(dashboardData)
      setSetupOptions(setupOptionsData)
      setTechnicalSupport(
        (technicalSupportData ?? null) as ActiveTechnicalSponsorSupport | null
      )
      setSelection(makeInitialSelection(setupOptionsData))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveDefaultSetup(): Promise<void> {
    setSavingSetup(true)
    setError(null)
    setSetupMessage(null)

    try {
      const updatedOptions = await saveEquipmentDefaultSetupTypes({
        clubId,
        frameCatalogItemId: selection.frame || null,
        wheelsetCatalogItemId: selection.wheelset || null,
        tiresCatalogItemId: selection.tires || null,
        groupsetCatalogItemId: selection.groupset || null,
        helmetCatalogItemId: selection.helmet || null,
        shoesCatalogItemId: selection.shoes || null,
      })

      setSetupOptions(updatedOptions as EquipmentDefaultSetupOptionsResponse)
      setSelection(makeInitialSelection(updatedOptions as EquipmentDefaultSetupOptionsResponse))
      setSetupMessage(t('overview.defaultSaved'))
      await loadDashboard()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save Default Race Setup. Edge Function may not be deployed yet.'
      )
    } finally {
      setSavingSetup(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [clubId])

  const setupCategories = useMemo(
    () => setupOptions?.categories ?? [],
    [setupOptions]
  )

  if (loading) {
    return <div className="rounded-lg bg-white p-6 shadow-sm">{t('overview.loading')}</div>
  }

  if (error || !dashboard) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? t('overview.unable')}
      </div>
    )
  }

  const technicalSponsor = dashboard.technical_sponsor

  const hasTechnicalSupport = Boolean(technicalSupport?.has_active_support)

  const technicalSponsorName =
    technicalSupport?.sponsor_name ??
    technicalSponsor?.name ??
    null

  const technicalSponsorLogoUrl =
    technicalSupport?.sponsor_logo_url ??
    (technicalSponsor ? getTechnicalSponsorLogoUrl(technicalSponsor) : null)

  const equipmentSupportUsed = toNumber(
    technicalSupport?.equipment_support_used_cash
  )

  const equipmentSupportBudget = toNumber(
    technicalSupport?.equipment_support_budget_cash
  )

  const equipmentSupportRemaining = toNumber(
    technicalSupport?.equipment_support_remaining_cash
  )

  const equipmentSupportUsedPct =
    equipmentSupportBudget > 0
      ? Math.max(0, Math.min(100, (equipmentSupportUsed / equipmentSupportBudget) * 100))
      : 0

  const discountEntries = Object.entries(
    technicalSupport?.category_discounts_json ?? {}
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label={t('overview.overallReadiness')}
          value={formatPercent(dashboard.overall.overall_readiness_pct)}
          helper={t('overview.readyHelper', {
            ready: dashboard.overall.ready_items,
            total: dashboard.overall.total_items,
          })}
        />
        <StatCard
          label={t('overview.averageCondition')}
          value={formatCondition(dashboard.overall.avg_condition)}
        />
        <StatCard
          label={t('overview.maintenanceNeeded')}
          value={dashboard.overall.maintenance_needed}
          helper={t('overview.critical', { count: dashboard.overall.critical_items })}
        />
        <StatCard
          label={t('overview.mechanicsWorkshop')}
          value={t('overview.level', {
            level: dashboard.support_effects.mechanics_workshop_level ?? 0,
          })}
          helper={t('overview.maintenanceLater')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{t('overview.inventorySummary')}</h3>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              {t('common.refresh')}
            </button>
          </div>

          <div className="space-y-2">
            {dashboard.category_summary.map(category => (
              <div
                key={category.equipment_category}
                className="flex items-center justify-between rounded border border-gray-100 p-3"
              >
                <div>
                  <div className="font-medium text-gray-800">
                    {formatEquipmentCategoryLabel(category.equipment_category, category.label)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('overview.avgCondition', {
                      value: formatCondition(category.avg_condition),
                    })}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>{t('overview.owned', { count: category.owned_count })}</div>
                  <div>{t('overview.ready', { count: category.ready_count })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[460px] flex-col rounded-lg bg-white p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-gray-900">{t('overview.defaultSetup')}</h3>
            <p className="mt-1 text-xs text-gray-500">
              {t('overview.defaultSetupDescription')}
            </p>
          </div>

          {setupMessage ? (
            <div className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700">
              {setupMessage}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {setupCategories.map(category => {
              const selectedValue = selection[category.equipment_category] ?? ''

              return (
                <div
                  key={category.equipment_category}
                  className="grid gap-2 rounded border border-gray-100 p-2 md:grid-cols-[110px_1fr]"
                >
                  <div className="flex items-center text-sm text-gray-500">
                    {formatEquipmentCategoryLabel(
                      category.equipment_category,
                      category.label
                    )}
                  </div>

                  <div>
                    <EquipmentOptionPreviewPopover
                      clubId={clubId}
                      category={category.equipment_category}
                      option={
                        (category.options.find(
                          option => option.catalog_item_id === selectedValue,
                        ) ?? null) as never
                      }
                      disabled={category.options.length === 0}
                    >
                      <select
                        value={selectedValue}
                        disabled={category.options.length === 0}
                        onChange={event =>
                          setSelection(current => ({
                            ...current,
                            [category.equipment_category]: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        {category.options.length === 0 ? (
                          <option value="">
                            {t('overview.noOwned', {
                              category: formatEquipmentCategoryLabel(
                                category.equipment_category,
                                category.label
                              ),
                            })}
                          </option>
                        ) : (
                          category.options.map(option => (
                            <option
                              key={option.catalog_item_id}
                              value={option.catalog_item_id}
                            >
                              {getDefaultSetupOptionLabel(option)}
                            </option>
                          ))
                        )}
                      </select>
                    </EquipmentOptionPreviewPopover>

                    <div className="mt-1 text-xs text-gray-400">
                      {getCategoryHelper(category)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-auto flex justify-end pt-4">
            <button
              type="button"
              onClick={() => void handleSaveDefaultSetup()}
              disabled={savingSetup}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingSetup ? 'Saving...' : t('overview.saveDefault')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900">{t('overview.raceSupplies')}</h3>
          <div className="mt-3 space-y-2">
            {dashboard.race_supplies_summary.map(supply => (
              <div
                key={supply.supply_key}
                className="flex items-center justify-between rounded border border-gray-100 p-3"
              >
                <div>
                  <div className="font-medium text-gray-800">{supply.display_name}</div>
                  <div className="text-xs text-gray-500">
                    {t('overview.purchasedUsed', {
                      purchased: supply.total_purchased,
                      used: supply.total_used,
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{supply.quantity_available}</div>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      getStockBadgeClass(supply.stock_status),
                    ].join(' ')}
                  >
                    {formatStockStatus(supply.stock_status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {t('overview.technicalSponsor')}
                </div>

                {technicalSponsorName ? (
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">
                    {technicalSponsorName}
                  </h3>
                ) : (
                  <h3 className="mt-1 text-base font-semibold text-gray-500">
                    {t('overview.noTechnicalSponsor')}
                  </h3>
                )}
              </div>

              {technicalSponsorLogoUrl ? (
                <img
                  src={technicalSponsorLogoUrl}
                  alt={`${technicalSponsorName ?? t('overview.technicalSponsor')} logo`}
                  className="h-12 w-24 rounded object-contain"
                />
              ) : technicalSponsorName ? (
                <div className="flex h-12 w-24 items-center justify-center rounded bg-gray-100 text-sm font-semibold text-gray-500">
                  {getSponsorInitials(technicalSponsorName)}
                </div>
              ) : null}
            </div>

            {technicalSponsorName ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('overview.cashPaid')}</div>
                    <div className="mt-1 font-semibold text-gray-900">
                      {hasTechnicalSupport
                        ? formatMoney(technicalSupport?.cash_support_cash)
                        : t('overview.notCreated')}
                    </div>
                  </div>

                  <div className="rounded border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('overview.equipmentSupport')}</div>
                    <div className="mt-1 font-semibold text-gray-900">
                      {hasTechnicalSupport
                        ? `${formatMoney(equipmentSupportUsed)} / ${formatMoney(equipmentSupportBudget)}`
                        : t('overview.notCreated')}
                    </div>
                  </div>

                  <div className="rounded border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('overview.remaining')}</div>
                    <div className="mt-1 font-semibold text-gray-900">
                      {hasTechnicalSupport ? formatMoney(equipmentSupportRemaining) : '—'}
                    </div>
                  </div>
                </div>

                {hasTechnicalSupport ? (
                  <>
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-600"
                          style={{ width: `${equipmentSupportUsedPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {t('overview.supportUsed', { value: equipmentSupportUsedPct.toFixed(1) })}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        {t('overview.discounts')}
                      </p>

                      {discountEntries.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {discountEntries.map(([category, discount]) => (
                            <span
                              key={category}
                              className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200"
                            >
                              {formatEquipmentCategoryLabel(category)}:{' '}
                              {toNumber(discount).toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">
                          {t('overview.noDiscounts')}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {t('overview.supportNotice')}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    {t('overview.supportMissing')}
                  </div>
                )}

                <div className="mt-4 space-y-1 text-xs text-gray-500">
                  {(dashboard.support_effects.notes ?? []).map(note => (
                    <div key={note}>• {note}</div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded border border-gray-100 p-3 text-sm text-gray-500">
                {t('overview.noTechnicalSponsor')}
              </div>
            )}
          </div>
        </div>
      </div>

      {equipmentAccess?.is_premium ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t('overview.intelligence')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
                  {t('common.premium')}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('overview.intelligenceDescription')}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('overview.readinessWatch')}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {dashboard.overall.critical_items > 0
                  ? `${dashboard.overall.critical_items} critical item${dashboard.overall.critical_items === 1 ? '' : 's'}`
                  : t('overview.noCritical')}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {dashboard.overall.maintenance_needed} item{dashboard.overall.maintenance_needed === 1 ? '' : 's'} currently need maintenance.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('overview.lowestCondition')}</div>
              {(() => {
                const lowest = [...dashboard.category_summary].sort(
                  (a, b) => Number(a.avg_condition ?? 0) - Number(b.avg_condition ?? 0),
                )[0]
                return (
                  <>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{lowest
                        ? formatEquipmentCategoryLabel(lowest.equipment_category, lowest.label)
                        : '—'}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {lowest ? `Average condition ${formatCondition(lowest.avg_condition)}.` : 'No inventory data available.'}
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('overview.capacityHint')}</div>
              {(() => {
                const limiting = [...dashboard.category_summary].sort(
                  (a, b) => Number(a.ready_count ?? 0) - Number(b.ready_count ?? 0),
                )[0]
                return (
                  <>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{limiting
                        ? formatEquipmentCategoryLabel(limiting.equipment_category, limiting.label)
                        : '—'}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {limiting ? `${limiting.ready_count} ready unit${limiting.ready_count === 1 ? '' : 's'}; this may limit complete rider setups.` : 'No inventory data available.'}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t('overview.intelligence')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">{t('common.premium')}</span>
                <span aria-hidden="true" className="text-slate-400">🔒</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t('overview.intelligenceDescription')}
              </p>
            </div>
            <a href="/dashboard/premium" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t('common.unlockPremium')}
            </a>
          </div>
        </div>
      )}

      <EquipmentSetupPresetsBox
        clubId={clubId}
        equipmentAccess={equipmentAccess}
        onAccessChanged={onAccessChanged}
      />
    </div>
  )
}
