/**
 * EquipmentMarketTab.tsx
 *
 * Equipment market tab for durable equipment purchases.
 * Shows category-filtered market items with quality, terrain role,
 * bonuses, sponsor discounts, and buy action.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getEquipmentMarket,
  purchaseEquipmentItem,
  quoteTechnicalSponsorDiscountsBatch,
} from '../equipmentApi'
import type {
  EquipmentCategory,
  EquipmentMarketItem,
  SponsorDiscountQuote,
} from '../types'
import {
  equipmentCategoryLabels,
  formatMoney,
  makeIdempotencyKey,
} from '../equipmentFormatters'
import type { EquipmentPremiumAccess } from '../equipmentApi'

type EquipmentMarketTabProps = {
  clubId: string
  equipmentAccess: EquipmentPremiumAccess | null
}

type MarketImagePreview = {
  imageUrl: string
  title: string
  subtitle: string
}

type MarketPurchaseDraft = {
  item: EquipmentMarketItem
  quantity: number
}

type EquipmentTerrainRole =
  | 'all_round'
  | 'endurance_cobble'
  | 'climbing'
  | 'aero_flat'
  | 'time_trial'
  | 'general'

type EquipmentEffectEntry = {
  key: string
  labelKey: string | null
  value: number
}

const PAGE_SIZE = 200

const terrainRoleOptions: Array<{
  value: EquipmentTerrainRole
  labelKey: string
}> = [
  { value: 'all_round', labelKey: 'terrain.allRound' },
  { value: 'endurance_cobble', labelKey: 'terrain.enduranceCobble' },
  { value: 'climbing', labelKey: 'terrain.climbing' },
  { value: 'aero_flat', labelKey: 'terrain.aeroFlat' },
  { value: 'time_trial', labelKey: 'terrain.timeTrial' },
  { value: 'general', labelKey: 'terrain.general' },
]

const effectLabelKeys: Record<string, string> = {
  flat_bonus_pct: 'effects.flatBonus',
  hilly_bonus_pct: 'effects.hillyBonus',
  mountain_bonus_pct: 'effects.mountainBonus',
  cobble_bonus_pct: 'effects.cobbleBonus',
  time_trial_bonus_pct: 'effects.timeTrialBonus',
  sprint_bonus_pct: 'effects.sprintBonus',
  fatigue_reduction_pct: 'effects.fatigueReduction',
}

const terrainRoleLabelKeys: Record<EquipmentTerrainRole, string> = {
  all_round: 'terrain.allRound',
  endurance_cobble: 'terrain.enduranceCobble',
  climbing: 'terrain.climbing',
  aero_flat: 'terrain.aeroFlat',
  time_trial: 'terrain.timeTrial',
  general: 'terrain.general',
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key]

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getEffectivePriceCash(item: EquipmentMarketItem): number {
  const effectivePrice = Number(item.effective_price_cash ?? item.base_price_cash ?? 0)
  return Number.isFinite(effectivePrice) ? effectivePrice : 0
}

function getSafePurchaseQuantity(value: unknown): number {
  const parsed = Math.floor(Number(value))

  if (!Number.isFinite(parsed) || parsed < 1) return 1
  if (parsed > 99) return 99

  return parsed
}

function getMarketItemImageUrl(item: EquipmentMarketItem): string | null {
  const metadata = item.metadata ?? {}

  const imageUrl =
    typeof metadata.image_url === 'string' && metadata.image_url.trim()
      ? metadata.image_url.trim()
      : null

  const imageUrlCamel =
    typeof metadata.imageUrl === 'string' && metadata.imageUrl.trim()
      ? metadata.imageUrl.trim()
      : null

  return imageUrl ?? imageUrlCamel
}

function getMarketItemInitials(item: EquipmentMarketItem): string {
  return item.display_name
    .split(/[ /-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function EquipmentImagePreviewModal({
  preview,
  onClose,
}: {
  preview: MarketImagePreview
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation('equipment')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('market.imagePreview', { name: preview.title })}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {preview.title}
            </h3>
            <p className="text-sm text-gray-500">{preview.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            {t('market.close')}
          </button>
        </div>

        <div className="flex max-h-[75vh] items-center justify-center bg-gray-50 p-6">
          <img
            src={preview.imageUrl}
            alt={preview.title}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  )
}

function EquipmentPurchaseModal({
  clubId,
  draft,
  isSubmitting,
  onQuantityChange,
  onClose,
  onConfirm,
}: {
  clubId: string
  draft: MarketPurchaseDraft
  isSubmitting: boolean
  onQuantityChange: (quantity: number) => void
  onClose: () => void
  onConfirm: () => void
}): JSX.Element {
  const { t } = useTranslation('equipment')
  const [purchaseQuote, setPurchaseQuote] =
    useState<SponsorDiscountQuote | null>(null)

  const item = draft.item
  const quantity = getSafePurchaseQuantity(draft.quantity)
  const unitPriceCash = getEffectivePriceCash(item)

  useEffect(() => {
    let cancelled = false

    async function loadPurchaseQuote(): Promise<void> {
      try {
        const quote = await quoteTechnicalSponsorDiscountsBatch(
          clubId,
          [draft.item.id],
          quantity
        )

        if (cancelled) return

        const itemQuote =
          (quote as Record<string, SponsorDiscountQuote>)[draft.item.id] ?? null

        setPurchaseQuote(itemQuote)
      } catch {
        if (!cancelled) {
          setPurchaseQuote(null)
        }
      }
    }

    setPurchaseQuote(null)
    void loadPurchaseQuote()

    return () => {
      cancelled = true
    }
  }, [clubId, draft.item.id, quantity])

  const popupBaseCost = Number(
    purchaseQuote?.base_total_cash ?? item.base_price_cash * quantity
  )

  const popupDiscountCash = Number(purchaseQuote?.discount_cash ?? 0)

  const popupClubPays = Number(
    purchaseQuote?.club_pays_total_cash ?? unitPriceCash * quantity
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('market.buyEquipment')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('market.buyEquipment')}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('market.buyDescription')}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {item.brand_name ?? t('common.genericBrand')}
            </div>

            <div className="mt-1 text-base font-semibold text-gray-900">
              {item.display_name}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-400">{t('common.unitPrice')}</div>
                <div className="font-semibold text-gray-900">
                  {formatMoney(unitPriceCash)}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400">{t('common.totalCost')}</div>
                <div className="font-semibold text-gray-900">
                  {formatMoney(popupClubPays)}
                </div>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">{t('common.quantity')}</span>
            <input
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={event =>
                onQuantityChange(getSafePurchaseQuantity(event.target.value))
              }
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
            />
          </label>

          {purchaseQuote?.has_discount ? (
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
              <div className="flex justify-between">
                <span>{t('market.baseCost')}</span>
                <span>{formatMoney(popupBaseCost)}</span>
              </div>

              <div className="mt-1">
                {t('market.sponsorPays', {
                  amount: `-${formatMoney(popupDiscountCash)}`,
                })}
              </div>

              <div className="mt-1 flex justify-between font-semibold">
                <span>{t('market.youPay')}</span>
                <span>{formatMoney(popupClubPays)}</span>
              </div>

              <div className="mt-2 text-xs">
                {t('market.remainingSupport', {
                  amount: formatMoney(
                    Number(
                      purchaseQuote.equipment_support_remaining_after_purchase_cash ?? 0
                    )
                  ),
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {t('market.purchaseInfo')}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting
              ? t('market.purchasing')
              : t('market.purchaseFor', { amount: formatMoney(popupClubPays) })}
          </button>
        </div>
      </div>
    </div>
  )
}

function getQualityLabel(item: EquipmentMarketItem): string {
  const metadataLabel = getMetadataString(item.metadata, 'quality_label')

  if (metadataLabel) {
    return metadataLabel.charAt(0).toUpperCase() + metadataLabel.slice(1)
  }

  const value = Number(item.quality_score ?? 0)

  if (value >= 75) return 'Super'
  if (value >= 60) return 'Good'
  return 'Basic'
}

function getQualityTranslationKey(item: EquipmentMarketItem): string | null {
  const metadataLabel = getMetadataString(item.metadata, 'quality_label')?.toLowerCase()

  if (metadataLabel === 'super') return 'quality.super'
  if (metadataLabel === 'good') return 'quality.good'
  if (metadataLabel === 'basic') return 'quality.basic'
  if (metadataLabel) return null

  const value = Number(item.quality_score ?? 0)

  if (value >= 75) return 'quality.super'
  if (value >= 60) return 'quality.good'
  return 'quality.basic'
}

function getQualityBadgeClass(item: EquipmentMarketItem): string {
  const label = getQualityLabel(item).toLowerCase()

  if (label === 'super') return 'border-purple-200 bg-purple-50 text-purple-700'
  if (label === 'good') return 'border-blue-200 bg-blue-50 text-blue-700'

  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function getTerrainRole(item: EquipmentMarketItem): EquipmentTerrainRole {
  const role =
    getMetadataString(item.metadata, 'terrain_role') ??
    getMetadataString(item.metadata, 'market_role')

  if (
    role === 'all_round' ||
    role === 'endurance_cobble' ||
    role === 'climbing' ||
    role === 'aero_flat' ||
    role === 'time_trial'
  ) {
    return role
  }

  return 'general'
}

function getTerrainBadgeClass(item: EquipmentMarketItem): string {
  const role =
    getMetadataString(item.metadata, 'terrain_role') ??
    getMetadataString(item.metadata, 'market_role')

  if (role === 'time_trial') return 'border-indigo-200 bg-indigo-50 text-indigo-700'
  if (role === 'climbing') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (role === 'aero_flat') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (role === 'endurance_cobble') return 'border-orange-200 bg-orange-50 text-orange-700'

  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function getEffectEntries(
  effects: Record<string, unknown> | null | undefined
): EquipmentEffectEntry[] {
  return Object.entries(effects ?? {})
    .map(([key, rawValue]) => {
      const value = Number(rawValue)

      return {
        key,
        labelKey: effectLabelKeys[key] ?? null,
        value,
      }
    })
    .filter(entry => Number.isFinite(entry.value) && entry.value !== 0)
    .sort((a, b) => {
      if (a.value >= 0 && b.value < 0) return -1
      if (a.value < 0 && b.value >= 0) return 1
      return (a.labelKey ?? a.key).localeCompare(b.labelKey ?? b.key)
    })
}

function formatEffectValue(value: number): string {
  if (value > 0) return `+${value}%`
  return `${value}%`
}

function getEffectBadgeClass(value: number): string {
  if (value > 0) {
    return 'border-green-100 bg-green-50 text-green-700'
  }

  if (value < 0) {
    return 'border-red-100 bg-red-50 text-red-700'
  }

  return 'border-gray-100 bg-gray-50 text-gray-600'
}

function EquipmentMarketRulesBox(): JSX.Element {
  const { t } = useTranslation('equipment')

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      <h3 className="font-semibold text-blue-950">{t('market.rules.title')}</h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="font-medium">{t('market.rules.calculation')}</p>
          <p className="mt-1 text-blue-800">
            {t('market.rules.calculationText')}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800">
            <span>{t('market.rules.frame')}</span>
            <span className="font-medium">25%</span>
            <span>{t('market.rules.wheelset')}</span>
            <span className="font-medium">25%</span>
            <span>{t('market.rules.tires')}</span>
            <span className="font-medium">20%</span>
            <span>{t('market.rules.groupset')}</span>
            <span className="font-medium">15%</span>
            <span>{t('market.rules.shoes')}</span>
            <span className="font-medium">10%</span>
            <span>{t('market.rules.helmet')}</span>
            <span className="font-medium">5%</span>
          </div>
        </div>

        <div>
          <p className="font-medium">{t('market.rules.balanceCaps')}</p>
          <p className="mt-1 text-blue-800">
            {t('market.rules.balanceText')}
          </p>

          <div className="mt-3 space-y-1 text-xs text-blue-800">
            <div>
              <span className="font-medium">{t('market.rules.stageCap')}</span> 4%
            </div>
            <div>
              <span className="font-medium">{t('market.rules.teamCap')}</span> 5%
            </div>
            <div>
              <span className="font-medium">{t('market.rules.totalCap')}</span> 8%
            </div>
            <div>
              <span className="font-medium">{t('market.rules.fatigueCap')}</span> 10%
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded border border-blue-200 bg-white/60 p-3 text-xs text-blue-800">
        {t('market.rules.example')}
      </div>
    </div>
  )
}

export default function EquipmentMarketTab({
  clubId,
  equipmentAccess,
}: EquipmentMarketTabProps): JSX.Element {
  const { t } = useTranslation('equipment')
  const [items, setItems] = useState<EquipmentMarketItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('frame')
  const [terrainRole, setTerrainRole] = useState<EquipmentTerrainRole | ''>('')
  const [sort, setSort] = useState('price_asc')
  const [page, setPage] = useState(0)
  const [imagePreview, setImagePreview] = useState<MarketImagePreview | null>(null)
  const [purchaseDraft, setPurchaseDraft] = useState<MarketPurchaseDraft | null>(null)
  const [sponsorDiscountsByItemId, setSponsorDiscountsByItemId] = useState<
    Record<string, SponsorDiscountQuote>
  >({})

  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [comparisonExpanded, setComparisonExpanded] = useState(true)

  async function loadMarket(): Promise<void> {
    setLoading(true)
    setError(null)
    setSponsorDiscountsByItemId({})

    try {
      const response = await getEquipmentMarket({
        clubId,
        kind: 'durable',
        category,
        search: search || null,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })

      const marketItems = response.items ?? []

      setItems(marketItems)
      setTotalCount(response.total_count ?? 0)

      const itemIds = marketItems.map(item => item.id)

      if (itemIds.length > 0) {
        const discounts = (await quoteTechnicalSponsorDiscountsBatch(
          clubId,
          itemIds,
          1
        )) as Record<string, SponsorDiscountQuote>

        setSponsorDiscountsByItemId(discounts)
      }
    } catch (err) {
      setItems([])
      setTotalCount(0)
      setSponsorDiscountsByItemId({})
      setError(err instanceof Error ? err.message : 'Failed to load equipment market')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMarket()
  }, [clubId, category, sort, page])

  const filteredItems = useMemo(
    () =>
      terrainRole
        ? items.filter(item => getTerrainRole(item) === terrainRole)
        : items,
    [items, terrainRole]
  )

  const filteredTotalCount = terrainRole ? filteredItems.length : totalCount
  const totalPages = Math.max(1, Math.ceil(filteredTotalCount / PAGE_SIZE))

  const categoryOptions = useMemo(
    () =>
      Object.keys(equipmentCategoryLabels).map(key => ({
        value: key as EquipmentCategory,
        label: t(`categories.${key}`),
      })),
    [t]
  )


  const comparisonItems = useMemo(
    () => comparisonIds.flatMap(id => {
      const item = items.find(candidate => candidate.id === id)
      return item ? [item] : []
    }),
    [comparisonIds, items],
  )

  function toggleComparison(itemId: string): void {
    if (!equipmentAccess?.is_premium) return

    setComparisonIds(current => {
      if (current.includes(itemId)) return current.filter(id => id !== itemId)
      if (current.length >= 3) return [...current.slice(1), itemId]
      return [...current, itemId]
    })
  }

  function openPurchaseModal(item: EquipmentMarketItem): void {
    setMessage(null)
    setError(null)
    setPurchaseDraft({
      item,
      quantity: 1,
    })
  }

  function updatePurchaseQuantity(quantity: number): void {
    setPurchaseDraft(current =>
      current
        ? {
            ...current,
            quantity: getSafePurchaseQuantity(quantity),
          }
        : current
    )
  }

  async function handleConfirmPurchase(): Promise<void> {
    if (!purchaseDraft) return

    const item = purchaseDraft.item
    const quantity = getSafePurchaseQuantity(purchaseDraft.quantity)

    setActionLoadingId(item.id)
    setMessage(null)
    setError(null)

    try {
      await purchaseEquipmentItem({
        clubId,
        catalogItemId: item.id,
        quantity,
        idempotencyKey: makeIdempotencyKey('equipment_purchase'),
      })

      setMessage(
        t('market.purchaseCompleted', {
          quantity,
          name: item.display_name,
        })
      )
      setPurchaseDraft(null)
      await loadMarket()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Purchase failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                setPage(0)
                void loadMarket()
              }
            }}
            placeholder={t('market.searchPlaceholder')}
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
            value={terrainRole}
            onChange={event => {
              setTerrainRole(event.target.value as EquipmentTerrainRole | '')
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">{t('terrain.allRoles')}</option>
            {terrainRoleOptions.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={event => {
              setSort(event.target.value)
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="price_asc">{t('market.priceLow')}</option>
            <option value="price_desc">{t('market.priceHigh')}</option>
            <option value="quality_desc">{t('market.qualityHigh')}</option>
            <option value="quality_asc">{t('market.qualityLow')}</option>
            <option value="category_asc">{t('market.category')}</option>
          </select>

        </div>

        <button
          type="button"
          onClick={() => {
            setPage(0)
            void loadMarket()
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
                <h3 className="font-semibold text-slate-900">{t('market.comparison')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">{t('common.premium')}</span>
                {comparisonItems.length > 0 ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{t('market.selectedCount', { count: comparisonItems.length })}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('market.comparisonDescription')}</p>
            </div>
            <div className="flex items-center gap-2">
              {comparisonIds.length > 0 ? (
                <button type="button" onClick={() => setComparisonIds([])} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('market.clear')}</button>
              ) : null}
              <button type="button" onClick={() => setComparisonExpanded(value => !value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {comparisonExpanded ? t('market.hideComparison') : t('market.showComparison')}
              </button>
            </div>
          </div>

          {comparisonExpanded ? (
            comparisonItems.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t('market.comparisonEmpty')}</div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {comparisonItems.map(item => {
                  const effects = getEffectEntries(item.effects)
                  const positiveEffects = effects.filter(effect => effect.value > 0)
                  const negativeEffects = effects.filter(effect => effect.value < 0)
                  const lowestPrice = Math.min(...comparisonItems.map(candidate => getEffectivePriceCash(candidate)))
                  const isLowestPrice = getEffectivePriceCash(item) === lowestPrice
                  return (
                    <div key={item.id} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <button type="button" onClick={() => toggleComparison(item.id)} className="absolute right-3 top-3 text-lg leading-none text-slate-400 hover:text-slate-700" aria-label={t('market.removeComparison', { name: item.display_name })}>×</button>
                      <div className="pr-7">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.brand_name ?? t('common.genericBrand')}</div>
                        <div className="mt-1 font-semibold text-slate-900">{item.display_name}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isLowestPrice ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{t('market.lowestPrice')}</span> : null}
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700">{getQualityTranslationKey(item) ? t(getQualityTranslationKey(item)!) : getQualityLabel(item)}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700">{t(terrainRoleLabelKeys[getTerrainRole(item)])}</span>
                      </div>
                      <div className="mt-4 text-2xl font-semibold text-slate-900">{formatMoney(getEffectivePriceCash(item))}</div>
                      <div className="mt-4 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('market.advantages', { count: positiveEffects.length })}</div>
                        <div className="flex flex-wrap gap-1.5">{positiveEffects.length ? positiveEffects.map(effect => <span key={effect.key} className="rounded-full border border-green-100 bg-green-50 px-2 py-0.5 text-xs text-green-700">{effect.labelKey ? t(effect.labelKey) : effect.key} {formatEffectValue(effect.value)}</span>) : <span className="text-xs text-slate-400">{t('market.none')}</span>}</div>
                        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('market.tradeoffs', { count: negativeEffects.length })}</div>
                        <div className="flex flex-wrap gap-1.5">{negativeEffects.length ? negativeEffects.map(effect => <span key={effect.key} className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-xs text-red-700">{effect.labelKey ? t(effect.labelKey) : effect.key} {formatEffectValue(effect.value)}</span>) : <span className="text-xs text-slate-400">{t('market.none')}</span>}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t('market.comparison')}</h3>
                <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">{t('common.premium')}</span>
                <span aria-hidden="true" className="text-slate-400">🔒</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{t('market.comparisonLocked')}</p>
            </div>
            <a href="/dashboard/premium" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('common.unlockPremium')}</a>
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
          <h3 className="font-semibold text-gray-900">{t('market.title')}</h3>
          <p className="text-xs text-gray-500">
            {terrainRole
              ? t('market.showingRole', {
                  shown: filteredItems.length,
                  total: filteredTotalCount,
                  category: t(`categories.${category}`),
                  role: t(terrainRoleLabelKeys[terrainRole]),
                })
              : t('market.showing', {
                  shown: filteredItems.length,
                  total: filteredTotalCount,
                  category: t(`categories.${category}`),
                })}
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">{t('market.loading')}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            {t('market.noneFound', { category: t(`categories.${category}`) })}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {filteredItems.map(item => {
              const effectEntries = getEffectEntries(item.effects)
              const imageUrl = getMarketItemImageUrl(item)
              const sponsorDiscount = sponsorDiscountsByItemId[item.id]
              const hasSponsorDiscount = Boolean(sponsorDiscount?.has_discount)

              const basePriceCash = Number(
                sponsorDiscount?.base_total_cash ?? item.base_price_cash ?? 0
              )

              const clubPaysCash = Number(
                sponsorDiscount?.club_pays_total_cash ??
                  item.effective_price_cash ??
                  item.base_price_cash ??
                  0
              )

              const discountCash = Number(sponsorDiscount?.discount_cash ?? 0)
              const discountPct = Number(sponsorDiscount?.discount_pct ?? 0)
              const remainingAfterPurchase = Number(
                sponsorDiscount?.equipment_support_remaining_after_purchase_cash ?? 0
              )

              return (
                <div
                  key={item.id}
                  className="grid gap-5 rounded-lg border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[14rem_minmax(0,1fr)_12rem]"
                >
                  <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white p-3 md:w-56">
                    {imageUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setImagePreview({
                            imageUrl,
                            title: item.display_name,
                            subtitle: item.brand_name ?? t('common.equipmentItem'),
                          })
                        }
                        className="flex h-full w-full items-center justify-center"
                        aria-label={t('market.openImage', { name: item.display_name })}
                      >
                        <img
                          src={imageUrl}
                          alt={item.display_name}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain transition-transform hover:scale-105"
                        />
                      </button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded bg-gray-50 text-lg font-semibold text-gray-400">
                        {getMarketItemInitials(item)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      {item.brand_name ?? t('common.genericBrand')}
                    </div>

                    <h4 className="mt-1 truncate text-lg font-semibold text-gray-900">
                      {item.display_name}
                    </h4>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={[
                          'rounded-full border px-2 py-1 text-xs font-medium',
                          getQualityBadgeClass(item),
                        ].join(' ')}
                      >
                        ★ {getQualityTranslationKey(item) ? t(getQualityTranslationKey(item)!) : getQualityLabel(item)}
                      </span>

                      <span
                        className={[
                          'rounded-full border px-2 py-1 text-xs font-medium',
                          getTerrainBadgeClass(item),
                        ].join(' ')}
                      >
                        {t(terrainRoleLabelKeys[getTerrainRole(item)])}
                      </span>

                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600">
                        {t('common.tier', { tier: item.tier })}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        {t('market.bonuses')}
                      </div>

                      {effectEntries.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {effectEntries.map(effect => (
                            <span
                              key={effect.key}
                              className={[
                                'rounded-full border px-2.5 py-1 text-xs font-medium',
                                getEffectBadgeClass(effect.value),
                              ].join(' ')}
                            >
                              {effect.labelKey ? t(effect.labelKey) : effect.key} {formatEffectValue(effect.value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-gray-400">
                          {t('market.noBonuses')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-auto flex min-w-[190px] flex-col items-end justify-between gap-3 self-stretch">
                    {hasSponsorDiscount ? (
                      <div className="w-full rounded-lg border border-green-200 bg-green-50 p-3 text-right">
                        <div className="text-xs text-gray-400">{t('market.sponsorPrice')}</div>

                        <div className="mt-1 text-sm text-gray-400 line-through">
                          {formatMoney(basePriceCash)}
                        </div>

                        <div className="text-xl font-semibold leading-tight text-green-700">
                          {formatMoney(clubPaysCash)}
                        </div>

                        <div className="mt-2 text-xs text-green-700">
                          {t('market.saveAmount', { amount: formatMoney(discountCash), percent: discountPct.toFixed(0) })}
                        </div>

                        <div className="mt-1 text-xs text-green-700">
                          {t('market.sponsorPays', { amount: formatMoney(discountCash) })}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {t('market.remainingFund', { amount: formatMoney(remainingAfterPurchase) })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{t('market.clubPrice')}</div>
                        <div className="text-xl font-semibold text-gray-900">
                          {formatMoney(clubPaysCash)}
                        </div>
                      </div>
                    )}

                    <div className="flex w-full justify-end">
                      {equipmentAccess?.is_premium ? (
                        <label className={[
                          'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition',
                          comparisonIds.includes(item.id)
                            ? 'border-yellow-400 bg-yellow-50 text-yellow-900'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        ].join(' ')}>
                          <input
                            type="checkbox"
                            checked={comparisonIds.includes(item.id)}
                            onChange={() => toggleComparison(item.id)}
                            className="h-4 w-4 rounded border-slate-300 text-yellow-500 focus:ring-yellow-400"
                          />
                          {comparisonIds.includes(item.id) ? t('common.selected') : t('market.compare')}
                        </label>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={actionLoadingId === item.id}
                      onClick={() => openPurchaseModal(item)}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoadingId === item.id ? t('market.purchasing') : t('market.buy')}
                    </button>
                  </div>
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
            {t('common.pageCount', { page: page + 1, pages: totalPages })}
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

      <EquipmentMarketRulesBox />

      {imagePreview && (
        <EquipmentImagePreviewModal
          preview={imagePreview}
          onClose={() => setImagePreview(null)}
        />
      )}

      {purchaseDraft && (
        <EquipmentPurchaseModal
          clubId={clubId}
          draft={purchaseDraft}
          isSubmitting={actionLoadingId === purchaseDraft.item.id}
          onQuantityChange={updatePurchaseQuantity}
          onClose={() => {
            if (actionLoadingId !== purchaseDraft.item.id) {
              setPurchaseDraft(null)
            }
          }}
          onConfirm={() => void handleConfirmPurchase()}
        />
      )}
    </div>
  )
}
