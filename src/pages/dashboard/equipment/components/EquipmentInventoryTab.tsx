/**
 * EquipmentInventoryTab.tsx
 *
 * Compact Inventory tab for the Equipment dashboard.
 *
 * Shows only active club-owned equipment.
 * Sold / discarded items are hidden.
 * Repair, Sell, and Discard actions live here instead of a separate Maintenance tab.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  discardEquipmentItem,
  getEquipmentInventory,
  quoteEquipmentMaintenance,
  quoteEquipmentSale,
  sellEquipmentItem,
  startEquipmentMaintenance,
} from '../equipmentApi'
import type {
  EquipmentCategory,
  EquipmentInventoryItem,
  EquipmentStatus,
  QuoteMaintenanceResponse,
  QuoteSaleResponse,
} from '../types'
import {
  equipmentCategoryLabels,
  equipmentStatusLabels,
  formatCondition,
  formatMoney,
  getStatusBadgeClass,
  makeIdempotencyKey,
} from '../equipmentFormatters'
import {
  saveEquipmentMaintenanceReminder,
  type EquipmentPremiumAccess,
} from '../equipmentApi'

type EquipmentInventoryTabProps = {
  clubId: string
  equipmentAccess: EquipmentPremiumAccess | null
}

type ActionMode = 'repair' | 'sell' | 'discard'

type EquipmentTerrainRole =
  | 'all_round'
  | 'endurance_cobble'
  | 'climbing'
  | 'aero_flat'
  | 'time_trial'
  | 'general'

type ActionModalState = {
  mode: ActionMode
  item: EquipmentInventoryItem
}


type EquipmentInventoryGroup = {
  key: string
  displayName: string
  brandName: string | null
  category: EquipmentCategory
  items: EquipmentInventoryItem[]
  totalCount: number
  readyCount: number
  averageCondition: number
  totalValue: number
  qualityScore: number | string | null | undefined
  bonuses: Array<{ label: string; value: string }>
}

const PAGE_SIZE = 200

const activeStatusOptions: EquipmentStatus[] = [
  'ready',
  'assigned',
  'in_maintenance',
  'worn',
]

type EquipmentStatusTranslationKey =
  | 'status.ready'
  | 'status.assigned'
  | 'status.inMaintenance'
  | 'status.worn'
  | 'status.sold'
  | 'status.discarded'

const equipmentStatusTranslationKeys: Partial<
  Record<EquipmentStatus, EquipmentStatusTranslationKey>
> = {
  ready: 'status.ready',
  assigned: 'status.assigned',
  in_maintenance: 'status.inMaintenance',
  worn: 'status.worn',
  sold: 'status.sold',
  discarded: 'status.discarded',
}

const terrainRoleOptions: EquipmentTerrainRole[] = [
  'all_round',
  'endurance_cobble',
  'climbing',
  'aero_flat',
  'time_trial',
  'general',
]

type EquipmentTerrainTranslationKey =
  | 'terrain.allRound'
  | 'terrain.enduranceCobble'
  | 'terrain.climbing'
  | 'terrain.aeroFlat'
  | 'terrain.timeTrial'
  | 'terrain.general'

const terrainRoleTranslationKeys: Record<
  EquipmentTerrainRole,
  EquipmentTerrainTranslationKey
> = {
  all_round: 'terrain.allRound',
  endurance_cobble: 'terrain.enduranceCobble',
  climbing: 'terrain.climbing',
  aero_flat: 'terrain.aeroFlat',
  time_trial: 'terrain.timeTrial',
  general: 'terrain.general',
}

type EquipmentEffectTranslationKey =
  | 'effects.flatBonus'
  | 'effects.hillyBonus'
  | 'effects.mountainBonus'
  | 'effects.cobbleBonus'
  | 'effects.timeTrialBonus'
  | 'effects.sprintBonus'
  | 'effects.fatigueReduction'

const effectTranslationKeys: Partial<
  Record<string, EquipmentEffectTranslationKey>
> = {
  flat_bonus_pct: 'effects.flatBonus',
  hilly_bonus_pct: 'effects.hillyBonus',
  mountain_bonus_pct: 'effects.mountainBonus',
  cobble_bonus_pct: 'effects.cobbleBonus',
  time_trial_bonus_pct: 'effects.timeTrialBonus',
  sprint_bonus_pct: 'effects.sprintBonus',
  fatigue_reduction_pct: 'effects.fatigueReduction',
}

function getEquipmentStatusDisplayLabel(
  status: EquipmentStatus,
  t: TFunction<'equipment'>
): string {
  const translationKey = equipmentStatusTranslationKeys[status]
  return translationKey ? t(translationKey) : equipmentStatusLabels[status] ?? status
}

function getInventoryItemMetadata(
  item: EquipmentInventoryItem
): Record<string, unknown> {
  const metadata = (
    item as EquipmentInventoryItem & {
      metadata?: Record<string, unknown> | null
    }
  ).metadata

  return metadata ?? {}
}

function getInventoryItemTerrainRole(
  item: EquipmentInventoryItem
): EquipmentTerrainRole {
  const metadata = getInventoryItemMetadata(item)
  const metadataRole =
    typeof metadata.terrain_role === 'string'
      ? metadata.terrain_role
      : typeof metadata.market_role === 'string'
        ? metadata.market_role
        : null

  if (
    metadataRole === 'all_round' ||
    metadataRole === 'endurance_cobble' ||
    metadataRole === 'climbing' ||
    metadataRole === 'aero_flat' ||
    metadataRole === 'time_trial'
  ) {
    return metadataRole
  }

  const effects = item.effects ?? {}
  const effectValue = (key: string): number => Number(effects[key] ?? 0)

  const scoredRoles: Array<{ role: EquipmentTerrainRole; score: number }> = [
    {
      role: 'endurance_cobble',
      score: Math.max(
        effectValue('cobble_bonus_pct'),
        effectValue('fatigue_reduction_pct')
      ),
    },
    { role: 'climbing', score: effectValue('mountain_bonus_pct') },
    {
      role: 'aero_flat',
      score: Math.max(
        effectValue('flat_bonus_pct'),
        effectValue('sprint_bonus_pct')
      ),
    },
    { role: 'time_trial', score: effectValue('time_trial_bonus_pct') },
    {
      role: 'all_round',
      score: Math.min(
        Math.max(effectValue('flat_bonus_pct'), 0),
        Math.max(effectValue('hilly_bonus_pct'), 0),
        Math.max(effectValue('mountain_bonus_pct'), 0)
      ),
    },
  ]

  const bestMatch = scoredRoles.sort((a, b) => b.score - a.score)[0]

  return bestMatch && bestMatch.score > 0 ? bestMatch.role : 'general'
}

function isActiveInventoryItem(item: EquipmentInventoryItem): boolean {
  return item.status !== 'sold' && item.status !== 'discarded'
}

function canRunAction(item: EquipmentInventoryItem): boolean {
  return item.status === 'ready' || item.status === 'worn'
}

function canRepair(item: EquipmentInventoryItem): boolean {
  return canRunAction(item) && Number(item.condition_percent ?? 100) <= 90
}

function getQualityTranslationKey(
  score: number | string | null | undefined
): 'quality.super' | 'quality.good' | 'quality.basic' {
  const value = Number(score ?? 0)

  if (value >= 75) return 'quality.super'
  if (value >= 60) return 'quality.good'
  return 'quality.basic'
}

function getQualityBadgeClass(score: number | string | null | undefined): string {
  const value = Number(score ?? 0)

  if (value >= 75) return 'bg-purple-100 text-purple-700 border-purple-200'
  if (value >= 60) return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

function formatEffectLabel(key: string, t: TFunction<'equipment'>): string {
  const translationKey = effectTranslationKeys[key]
  return translationKey ? t(translationKey) : key
}

function formatEffectValue(value: unknown): string {
  const numberValue = Number(value)

  if (Number.isFinite(numberValue)) {
    const prefix = numberValue > 0 ? '+' : ''
    return `${prefix}${numberValue}%`
  }

  if (typeof value === 'string') return value

  return String(value)
}

function getShortBonuses(
  item: EquipmentInventoryItem,
  t: TFunction<'equipment'>
): Array<{ label: string; value: string }> {
  const effects = item.effects ?? {}

  return Object.entries(effects)
    .slice(0, 3)
    .map(([key, value]) => ({
      label: formatEffectLabel(key, t),
      value: formatEffectValue(value),
    }))
}


function getEquipmentGroupKey(item: EquipmentInventoryItem): string {
  return [
    item.equipment_category,
    item.brand_name ?? 'Generic brand',
    item.display_name,
  ]
    .map(value => String(value).trim().toLowerCase())
    .join('::')
}

function getReadyInventoryCount(items: EquipmentInventoryItem[]): number {
  return items.filter(item => item.status === 'ready').length
}

function getAverageCondition(items: EquipmentInventoryItem[]): number {
  if (items.length === 0) return 0

  const total = items.reduce((sum, item) => sum + Number(item.condition_percent ?? 0), 0)
  return total / items.length
}

function getTotalCurrentValue(items: EquipmentInventoryItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.current_value_cash ?? 0), 0)
}

function buildInventoryGroups(
  items: EquipmentInventoryItem[],
  t: TFunction<'equipment'>
): EquipmentInventoryGroup[] {
  const groups = new Map<string, EquipmentInventoryGroup>()

  for (const item of items) {
    const key = getEquipmentGroupKey(item)
    const existing = groups.get(key)

    if (existing) {
      existing.items.push(item)
      existing.totalCount = existing.items.length
      existing.readyCount = getReadyInventoryCount(existing.items)
      existing.averageCondition = getAverageCondition(existing.items)
      existing.totalValue = getTotalCurrentValue(existing.items)
      continue
    }

    groups.set(key, {
      key,
      displayName: item.display_name,
      brandName: item.brand_name ?? null,
      category: item.equipment_category,
      items: [item],
      totalCount: 1,
      readyCount: item.status === 'ready' ? 1 : 0,
      averageCondition: Number(item.condition_percent ?? 0),
      totalValue: Number(item.current_value_cash ?? 0),
      qualityScore: item.quality_score,
      bonuses: getShortBonuses(item, t),
    })
  }

  return Array.from(groups.values())
}

export default function EquipmentInventoryTab({
  clubId,
  equipmentAccess,
}: EquipmentInventoryTabProps): JSX.Element {
  const { t } = useTranslation('equipment')
  const [items, setItems] = useState<EquipmentInventoryItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('frame')
  const [status, setStatus] = useState<EquipmentStatus | ''>('')
  const [terrainRole, setTerrainRole] = useState<EquipmentTerrainRole | ''>('')
  const [sort, setSort] = useState('condition_asc')
  const [page, setPage] = useState(0)

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [modal, setModal] = useState<ActionModalState | null>(null)
  const [repairQuote, setRepairQuote] = useState<QuoteMaintenanceResponse | null>(null)
  const [saleQuote, setSaleQuote] = useState<QuoteSaleResponse | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set())
  const [maintenanceThreshold, setMaintenanceThreshold] = useState(
    Number(equipmentAccess?.maintenance_reminder_threshold ?? 80),
  )
  const [bulkRepairLoading, setBulkRepairLoading] = useState(false)

  async function loadInventory(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const data = await getEquipmentInventory({
        clubId,
        category,
        status: status || null,
        search: search || null,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })

      const activeItems = (data.items ?? []).filter(isActiveInventoryItem)

      setItems(activeItems)
      setTotalCount(activeItems.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInventory()
  }, [clubId, category, status, sort, page])

  useEffect(() => {
    setExpandedGroupKeys(new Set())
  }, [clubId, category, status, terrainRole, sort, search])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const categoryOptions = useMemo(
    () =>
      Object.entries(equipmentCategoryLabels).map(([key, label]) => ({
        value: key as EquipmentCategory,
        label,
      })),
    []
  )


  const filteredItems = useMemo(
    () =>
      terrainRole
        ? items.filter(item => getInventoryItemTerrainRole(item) === terrainRole)
        : items,
    [items, terrainRole]
  )

  const groupedItems = useMemo(
    () => buildInventoryGroups(filteredItems, t),
    [filteredItems, t]
  )

  function toggleGroup(groupKey: string): void {
    setExpandedGroupKeys(current => {
      const next = new Set(current)

      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }

      return next
    })
  }

  async function openActionModal(mode: ActionMode, item: EquipmentInventoryItem): Promise<void> {
    setModal({ mode, item })
    setRepairQuote(null)
    setSaleQuote(null)
    setError(null)
    setMessage(null)

    if (mode === 'repair') {
      setQuoteLoading(true)

      try {
        const quote = await quoteEquipmentMaintenance({
          clubId,
          inventoryItemId: item.id,
        })

        setRepairQuote(quote)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to quote repair cost')
      } finally {
        setQuoteLoading(false)
      }
    }

    if (mode === 'sell') {
      setQuoteLoading(true)

      try {
        const quote = await quoteEquipmentSale({
          clubId,
          inventoryItemId: item.id,
        })

        setSaleQuote(quote)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to quote sale value')
      } finally {
        setQuoteLoading(false)
      }
    }
  }

  function closeModal(): void {
    if (actionLoading) return

    setModal(null)
    setRepairQuote(null)
    setSaleQuote(null)
    setQuoteLoading(false)
  }

  async function confirmAction(): Promise<void> {
    if (!modal) return

    setActionLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (modal.mode === 'repair') {
        await startEquipmentMaintenance({
          clubId,
          inventoryItemId: modal.item.id,
          idempotencyKey: makeIdempotencyKey('equipment_maintenance'),
        })

        setMessage(t('inventory.repairStarted', { name: modal.item.display_name }))
      }

      if (modal.mode === 'sell') {
        await sellEquipmentItem({
          clubId,
          inventoryItemId: modal.item.id,
          idempotencyKey: makeIdempotencyKey('equipment_sale'),
        })

        setMessage(t('inventory.sold', { name: modal.item.display_name }))
      }

      if (modal.mode === 'discard') {
        await discardEquipmentItem({
          clubId,
          inventoryItemId: modal.item.id,
        })

        setMessage(t('inventory.discarded', { name: modal.item.display_name }))
      }

      closeModal()
      await loadInventory()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Action failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  function getModalTitle(): string {
    if (!modal) return ''

    if (modal.mode === 'repair') return t('inventory.confirmRepair')
    if (modal.mode === 'sell') return t('inventory.confirmSale')
    return t('inventory.confirmDiscard')
  }

  function getModalConfirmLabel(): string {
    if (!modal) return t('common.confirm')

    if (modal.mode === 'repair') {
      return actionLoading ? t('inventory.startingRepair') : t('inventory.confirmRepair')
    }

    if (modal.mode === 'sell') {
      return actionLoading ? t('inventory.selling') : t('inventory.confirmSale')
    }

    return actionLoading ? t('inventory.discarding') : t('inventory.confirmDiscard')
  }

  function getModalConfirmClass(): string {
    if (!modal) return 'bg-blue-600 hover:bg-blue-700'

    if (modal.mode === 'repair') return 'bg-yellow-500 hover:bg-yellow-600'
    if (modal.mode === 'sell') return 'bg-green-600 hover:bg-green-700'
    return 'bg-red-600 hover:bg-red-700'
  }



  useEffect(() => {
    setMaintenanceThreshold(Number(equipmentAccess?.maintenance_reminder_threshold ?? 80))
  }, [equipmentAccess?.maintenance_reminder_threshold])

  const premiumRepairCandidates = useMemo(
    () =>
      items.filter(
        item =>
          canRepair(item) &&
          Number(item.condition_percent ?? 100) <= maintenanceThreshold,
      ),
    [items, maintenanceThreshold],
  )

  async function handleSaveMaintenanceReminder(): Promise<void> {
    setError(null)
    setMessage(null)

    try {
      await saveEquipmentMaintenanceReminder({
        clubId,
        threshold: maintenanceThreshold,
      })
      setMessage(`Maintenance reminder saved at ${maintenanceThreshold}% condition.`)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to save maintenance reminder.',
      )
    }
  }

  async function handleBulkRepair(): Promise<void> {
    if (!equipmentAccess?.is_premium || premiumRepairCandidates.length === 0) return

    setBulkRepairLoading(true)
    setError(null)
    setMessage(null)

    try {
      for (const item of premiumRepairCandidates) {
        await startEquipmentMaintenance({
          clubId,
          inventoryItemId: item.id,
          idempotencyKey: makeIdempotencyKey('equipment_bulk_maintenance'),
        })
      }

      setMessage(
        `${premiumRepairCandidates.length} repair job${premiumRepairCandidates.length === 1 ? '' : 's'} started. Normal cash costs and repair durations still apply.`,
      )
      await loadInventory()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Bulk maintenance failed.',
      )
    } finally {
      setBulkRepairLoading(false)
    }
  }

  function renderInventoryItemRow(item: EquipmentInventoryItem): JSX.Element {
    const bonuses = getShortBonuses(item, t)
    const itemCanRunAction = canRunAction(item)
    const itemCanRepair = canRepair(item)

    return (
      <div
        key={item.id}
        className="grid gap-4 bg-white px-4 py-3 xl:grid-cols-[2.1fr_1.1fr_1.2fr_2fr_1.2fr]"
      >
        <div className="min-w-0">
          <div className="truncate font-medium text-gray-900">
            {item.display_name}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              {equipmentCategoryLabels[item.equipment_category]} ·{' '}
              {item.brand_name ?? t('common.genericBrand')}
            </span>

            {item.used_in_default_setup ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                {t('inventory.defaultSetup')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-1 xl:border-l xl:border-gray-100 xl:pl-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">{t('common.quality')}</span>
            <span
              className={[
                'rounded-full border px-2 py-0.5 font-medium',
                getQualityBadgeClass(item.quality_score),
              ].join(' ')}
            >
              ★ {t(getQualityTranslationKey(item.quality_score))}
            </span>
          </div>

          <span
            className={[
              'inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium',
              getStatusBadgeClass(item.status),
            ].join(' ')}
          >
            {getEquipmentStatusDisplayLabel(item.status, t)}
          </span>
        </div>

        <div className="flex flex-col justify-center gap-1 text-sm xl:border-l xl:border-gray-100 xl:pl-4">
          <div>
            <span className="text-gray-500">{t('common.condition')}</span>{' '}
            <span className="font-medium text-gray-900">
              {formatCondition(item.condition_percent)}
            </span>
          </div>

          <div>
            <span className="text-gray-500">{t('common.value')}</span>{' '}
            <span className="font-medium text-gray-900">
              {formatMoney(item.current_value_cash)}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs xl:border-l xl:border-gray-100 xl:pl-4">
          {bonuses.length > 0 ? (
            bonuses.map(bonus => (
              <span
                key={`${item.id}-${bonus.label}`}
                className="rounded-full border border-purple-100 bg-purple-50 px-2 py-1 text-purple-700"
              >
                {bonus.label} {bonus.value}
              </span>
            ))
          ) : (
            <span className="text-gray-400">{t('inventory.noBonuses')}</span>
          )}
        </div>

        <div className="flex flex-col items-start justify-center gap-1 text-left text-xs xl:border-l xl:border-gray-100 xl:pl-4">
          {itemCanRepair ? (
            <button
              type="button"
              onClick={() => void openActionModal('repair', item)}
              className="text-xs font-medium text-yellow-600 hover:text-yellow-700"
            >
              {t('inventory.repair')}
            </button>
          ) : (
            <span className="text-xs text-gray-400">{t('inventory.noRepair')}</span>
          )}

          <button
            type="button"
            disabled={!itemCanRunAction}
            onClick={() => void openActionModal('sell', item)}
            className="text-xs font-medium text-green-600 hover:text-green-700 disabled:text-gray-300"
          >
            {t('inventory.sell')}
          </button>

          <button
            type="button"
            disabled={!itemCanRunAction}
            onClick={() => void openActionModal('discard', item)}
            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-300"
          >
            {t('inventory.discard')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-5">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                setPage(0)
                void loadInventory()
              }
            }}
            placeholder={t('inventory.searchPlaceholder')}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          />

          <select
            value={category}
            onChange={event => {
              setCategory(event.target.value as EquipmentCategory)
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            {categoryOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={event => {
              setStatus(event.target.value as EquipmentStatus | '')
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">{t('inventory.activeStatuses')}</option>
            {activeStatusOptions.map(statusValue => (
              <option key={statusValue} value={statusValue}>
                {getEquipmentStatusDisplayLabel(statusValue, t)}
              </option>
            ))}
          </select>

          <select
            value={terrainRole}
            onChange={event => {
              setTerrainRole(event.target.value as EquipmentTerrainRole | '')
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">{t('terrain.allRoles')}</option>
            {terrainRoleOptions.map(role => (
              <option key={role} value={role}>
                {t(terrainRoleTranslationKeys[role])}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={event => setSort(event.target.value)}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="condition_asc">{t('inventory.conditionLow')}</option>
            <option value="condition_desc">{t('inventory.conditionHigh')}</option>
            <option value="price_desc">{t('inventory.valueHigh')}</option>
            <option value="price_asc">{t('inventory.valueLow')}</option>
            <option value="quality_desc">{t('inventory.qualityHigh')}</option>
            <option value="quality_asc">{t('inventory.qualityLow')}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setPage(0)
            void loadInventory()
          }}
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('common.search')}
        </button>
      </div>

      {equipmentAccess?.is_premium ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t('inventory.maintenancePlanner')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">{t('common.premium')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('inventory.plannerDescription')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleBulkRepair()}
              disabled={bulkRepairLoading || premiumRepairCandidates.length === 0}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkRepairLoading
                ? t('inventory.startingRepairs')
                : t('inventory.repairBelow', { count: premiumRepairCandidates.length })}
            </button>
          </div>

          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {premiumRepairCandidates.length > 0
              ? premiumRepairCandidates.length === 1
                ? t('inventory.repairCandidate', {
                    count: premiumRepairCandidates.length,
                    threshold: maintenanceThreshold,
                  })
                : t('inventory.repairCandidates', {
                    count: premiumRepairCandidates.length,
                    threshold: maintenanceThreshold,
                  })
              : t('inventory.noRepairCandidates', {
                  category: equipmentCategoryLabels[category].toLowerCase(),
                  threshold: maintenanceThreshold,
                })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-700">
              {t('inventory.reminderAt')}
              <select
                value={maintenanceThreshold}
                onChange={event => setMaintenanceThreshold(Number(event.target.value))}
                className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {[90, 85, 80, 75, 70, 60].map(value => (
                  <option key={value} value={value}>{value}%</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleSaveMaintenanceReminder()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('inventory.saveReminder')}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t('inventory.maintenancePlanner')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">{t('common.premium')}</span>
                <span aria-hidden="true" className="text-slate-400">🔒</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t('inventory.plannerLocked')}
              </p>
            </div>
            <a href="/dashboard/premium" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t('common.unlockPremium')}
            </a>
          </div>
        </div>
      )}

      {message ? (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900">{t('inventory.ownedEquipment')}</h3>
          <p className="text-xs text-gray-500">
            {terrainRole
              ? t('inventory.showingRole', {
                  count: filteredItems.length,
                  category: equipmentCategoryLabels[category].toLowerCase(),
                  role: t(terrainRoleTranslationKeys[terrainRole]),
                })
              : t('inventory.showing', {
                  count: filteredItems.length,
                  category: equipmentCategoryLabels[category].toLowerCase(),
                })}
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">{t('inventory.loading')}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            {t('inventory.noneFound', {
              category: equipmentCategoryLabels[category].toLowerCase(),
            })}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groupedItems.map(group => {
              const isExpanded = expandedGroupKeys.has(group.key)

              return (
                <div key={group.key} className="divide-y divide-gray-100">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="grid w-full gap-4 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 xl:grid-cols-[2.1fr_1.1fr_1.2fr_2fr_1.2fr]"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-semibold text-gray-900">
                          {group.displayName}
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                          {group.totalCount} item{group.totalCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {equipmentCategoryLabels[group.category]} · {group.brandName ?? t('common.genericBrand')}
                      </div>
                    </div>

                    <div className="flex flex-col justify-center gap-1 xl:border-l xl:border-gray-200 xl:pl-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{t('common.quality')}</span>
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 font-medium',
                            getQualityBadgeClass(group.qualityScore),
                          ].join(' ')}
                        >
                          ★ {t(getQualityTranslationKey(group.qualityScore))}
                        </span>
                      </div>

                      <span className="inline-block w-fit rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        {t('status.ready')} {group.readyCount}/{group.totalCount}
                      </span>
                    </div>

                    <div className="flex flex-col justify-center gap-1 text-sm xl:border-l xl:border-gray-200 xl:pl-4">
                      <div>
                        <span className="text-gray-500">{t('inventory.averageCondition')}</span>{' '}
                        <span className="font-semibold text-gray-900">
                          {formatCondition(group.averageCondition)}
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-500">{t('inventory.totalValue')}</span>{' '}
                        <span className="font-medium text-gray-900">
                          {formatMoney(group.totalValue)}
                        </span>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs xl:border-l xl:border-gray-200 xl:pl-4">
                      {group.bonuses.length > 0 ? (
                        group.bonuses.map(bonus => (
                          <span
                            key={`${group.key}-${bonus.label}`}
                            className="rounded-full border border-purple-100 bg-white px-2 py-1 text-purple-700"
                          >
                            {bonus.label} {bonus.value}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400">{t('inventory.noBonuses')}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs xl:border-l xl:border-gray-200 xl:pl-4">
                      <div className="text-gray-500">
                        {isExpanded ? t('inventory.hideItems') : t('inventory.showItems')}
                      </div>

                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white text-sm font-bold text-blue-700 shadow-sm">
                        {isExpanded ? '−' : '+'}
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="divide-y divide-gray-100 bg-white">
                      {group.items.map(item => renderInventoryItemRow(item))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 p-4">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(current => Math.max(0, current - 1))}
            className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('common.previous')}
          </button>

          <div className="text-sm text-gray-500">
            Page {page + 1} / {totalPages}
          </div>

          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(current => current + 1)}
            className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        </div>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{getModalTitle()}</h3>
                <p className="mt-1 text-sm text-gray-500">{modal.item.display_name}</p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                aria-label={t('common.close')}
                title={t('common.close')}
                className="rounded px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
              {modal.mode === 'repair' ? (
                quoteLoading ? (
                  <div className="text-gray-500">{t('inventory.loadingRepair')}</div>
                ) : repairQuote ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('inventory.currentCondition')}</span>
                      <span className="font-medium">
                        {formatCondition(repairQuote.condition_percent)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('inventory.afterRepair')}</span>
                      <span className="font-medium">
                        {formatCondition(repairQuote.condition_after)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('inventory.repairCost')}</span>
                      <span className="font-semibold text-gray-900">
                        {formatMoney(repairQuote.maintenance_cost_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration</span>
                      <span className="font-medium">
                        {repairQuote.duration_game_days === 1
                          ? t('inventory.gameDay', {
                              count: repairQuote.duration_game_days,
                            })
                          : t('inventory.gameDays', {
                              count: repairQuote.duration_game_days,
                            })}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-red-600">{t('inventory.repairQuoteFailed')}</div>
                )
              ) : null}

              {modal.mode === 'sell' ? (
                quoteLoading ? (
                  <div className="text-gray-500">{t('inventory.loadingSale')}</div>
                ) : saleQuote ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('common.condition')}</span>
                      <span className="font-medium">
                        {formatCondition(saleQuote.condition_percent)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('inventory.saleIncome')}</span>
                      <span className="font-semibold text-green-700">
                        {formatMoney(saleQuote.sale_value_cash)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-red-600">{t('inventory.saleQuoteFailed')}</div>
                )
              ) : null}

              {modal.mode === 'discard' ? (
                <div className="space-y-2">
                  <p className="text-gray-700">
                    {t('inventory.discardWarning')}
                  </p>
                  <p className="text-xs text-red-600">
                    {t('inventory.cannotUndo')}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={actionLoading}
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>

              <button
                type="button"
                onClick={() => void confirmAction()}
                disabled={
                  actionLoading ||
                  quoteLoading ||
                  (modal.mode === 'repair' && (!repairQuote || !repairQuote.can_maintain)) ||
                  (modal.mode === 'sell' && (!saleQuote || !saleQuote.can_sell))
                }
                className={[
                  'rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
                  getModalConfirmClass(),
                ].join(' ')}
              >
                {getModalConfirmLabel()}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
