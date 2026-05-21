/**
 * EquipmentMarketTab.tsx
 *
 * Equipment market tab for durable equipment purchases.
 * Shows category-filtered market items with quality, terrain role,
 * bonuses, sponsor discounts, and buy action.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { getEquipmentMarket, purchaseEquipmentItem } from '../equipmentApi'
import type { EquipmentCategory, EquipmentMarketItem } from '../types'
import {
  equipmentCategoryLabels,
  formatMoney,
  makeIdempotencyKey,
} from '../equipmentFormatters'

type EquipmentMarketTabProps = {
  clubId: string
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

type EquipmentEffectEntry = {
  key: string
  label: string
  value: number
}

const PAGE_SIZE = 20

const effectLabels: Record<string, string> = {
  flat_bonus_pct: 'Flat Bonus',
  hilly_bonus_pct: 'Hilly Bonus',
  mountain_bonus_pct: 'Mountain Bonus',
  cobble_bonus_pct: 'Cobble Bonus',
  time_trial_bonus_pct: 'Time Trial Bonus',
  sprint_bonus_pct: 'Sprint Bonus',
  fatigue_reduction_pct: 'Fatigue Reduction',
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

function getPurchaseTotalCash(item: EquipmentMarketItem, quantity: number): number {
  return getEffectivePriceCash(item) * getSafePurchaseQuantity(quantity)
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${preview.title} image preview`}
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
            Close
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
  draft,
  isSubmitting,
  onQuantityChange,
  onClose,
  onConfirm,
}: {
  draft: MarketPurchaseDraft
  isSubmitting: boolean
  onQuantityChange: (quantity: number) => void
  onClose: () => void
  onConfirm: () => void
}): JSX.Element {
  const item = draft.item
  const quantity = getSafePurchaseQuantity(draft.quantity)
  const unitPriceCash = getEffectivePriceCash(item)
  const totalCostCash = getPurchaseTotalCash(item, quantity)
  const hasDiscount = Number(item.technical_discount_pct ?? 0) > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Buy ${item.display_name}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Buy equipment
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Choose quantity and confirm purchase.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {item.brand_name ?? 'Generic brand'}
            </div>

            <div className="mt-1 text-base font-semibold text-gray-900">
              {item.display_name}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-400">Unit price</div>
                <div className="font-semibold text-gray-900">
                  {formatMoney(unitPriceCash)}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400">Total cost</div>
                <div className="font-semibold text-gray-900">
                  {formatMoney(totalCostCash)}
                </div>
              </div>
            </div>

            {hasDiscount ? (
              <div className="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">
                Technical sponsor discount applied:{' '}
                {Number(item.technical_discount_pct).toFixed(1)}%
              </div>
            ) : null}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Quantity</span>
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

          <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            After confirmation, the purchase is sent to the Edge Function. The
            database should reduce club funds, create the finance transaction,
            and add the purchased items to the equipment inventory.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting
              ? 'Purchasing...'
              : `Purchase for ${formatMoney(totalCostCash)}`}
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

function getQualityBadgeClass(item: EquipmentMarketItem): string {
  const label = getQualityLabel(item).toLowerCase()

  if (label === 'super') return 'border-purple-200 bg-purple-50 text-purple-700'
  if (label === 'good') return 'border-blue-200 bg-blue-50 text-blue-700'

  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function getTerrainRoleLabel(item: EquipmentMarketItem): string {
  const role =
    getMetadataString(item.metadata, 'terrain_role') ??
    getMetadataString(item.metadata, 'market_role')

  if (role === 'aero_flat') return 'Aero / Flat'
  if (role === 'climbing') return 'Climbing'
  if (role === 'time_trial') return 'Time Trial'
  if (role === 'endurance_cobble') return 'Endurance / Cobble'
  if (role === 'all_round') return 'All-round'

  return 'General'
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
        label: effectLabels[key] ?? key,
        value,
      }
    })
    .filter(entry => Number.isFinite(entry.value) && entry.value !== 0)
    .sort((a, b) => {
      if (a.value >= 0 && b.value < 0) return -1
      if (a.value < 0 && b.value >= 0) return 1
      return a.label.localeCompare(b.label)
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

function hasSponsorDiscount(item: EquipmentMarketItem): boolean {
  return Number(item.technical_discount_pct ?? 0) > 0
}

function EquipmentMarketRulesBox(): JSX.Element {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      <h3 className="font-semibold text-blue-950">Equipment bonus rules</h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="font-medium">How bonuses are calculated</p>
          <p className="mt-1 text-blue-800">
            Item bonuses are not added directly together. A full setup uses a weighted
            calculation so equipment gives a realistic support advantage without replacing
            rider skill.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800">
            <span>Frame</span>
            <span className="font-medium">25%</span>
            <span>Wheelset</span>
            <span className="font-medium">25%</span>
            <span>Tires</span>
            <span className="font-medium">20%</span>
            <span>Groupset</span>
            <span className="font-medium">15%</span>
            <span>Shoes</span>
            <span className="font-medium">10%</span>
            <span>Helmet</span>
            <span className="font-medium">5%</span>
          </div>
        </div>

        <div>
          <p className="font-medium">Balance caps</p>
          <p className="mt-1 text-blue-800">
            Even if every selected item has a strong bonus, the equipment setup bonus is
            capped. This prevents a weak rider with perfect equipment from becoming better
            than a much stronger rider.
          </p>

          <div className="mt-3 space-y-1 text-xs text-blue-800">
            <div>
              <span className="font-medium">Equipment stage bonus cap:</span> 4%
            </div>
            <div>
              <span className="font-medium">Team support cap:</span> 5%
            </div>
            <div>
              <span className="font-medium">Total non-rider support cap:</span> 8%
            </div>
            <div>
              <span className="font-medium">Fatigue reduction cap:</span> 10%
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded border border-blue-200 bg-white/60 p-3 text-xs text-blue-800">
        Example: if all six equipment items have <span className="font-medium">Flat +4%</span>,
        the setup does not become +24%. It is weighted by category and capped around +4%.
        Specialist equipment can include trade-offs, shown in red. For example, a pure climbing
        item may give <span className="font-medium">Mountain +4%</span> but
        <span className="font-medium"> Flat -1%</span> and
        <span className="font-medium"> Sprint -2%</span>.
      </div>
    </div>
  )
}

export default function EquipmentMarketTab({
  clubId,
}: EquipmentMarketTabProps): JSX.Element {
  const [items, setItems] = useState<EquipmentMarketItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('frame')
  const [sort, setSort] = useState('price_asc')
  const [page, setPage] = useState(0)
  const [imagePreview, setImagePreview] = useState<MarketImagePreview | null>(null)
  const [purchaseDraft, setPurchaseDraft] = useState<MarketPurchaseDraft | null>(null)

  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadMarket(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const data = await getEquipmentMarket({
        clubId,
        kind: 'durable',
        category,
        search: search || null,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })

      setItems(data.items ?? [])
      setTotalCount(data.total_count ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equipment market')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMarket()
  }, [clubId, category, sort, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const categoryOptions = useMemo(
    () =>
      Object.entries(equipmentCategoryLabels).map(([key, label]) => ({
        value: key as EquipmentCategory,
        label,
      })),
    []
  )

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
        `Purchase completed: ${quantity} × ${item.display_name} added to inventory.`
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
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                setPage(0)
                void loadMarket()
              }
            }}
            placeholder="Search market..."
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
            value={sort}
            onChange={event => {
              setSort(event.target.value)
              setPage(0)
            }}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="price_asc">Price: low first</option>
            <option value="price_desc">Price: high first</option>
            <option value="quality_desc">Quality: high first</option>
            <option value="quality_asc">Quality: low first</option>
            <option value="category_asc">Category</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setPage(0)
              void loadMarket()
            }}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </div>

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
          <h3 className="font-semibold text-gray-900">Equipment Market</h3>
          <p className="text-xs text-gray-500">
            Showing {items.length} of {totalCount}{' '}
            {equipmentCategoryLabels[category].toLowerCase()}.
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading market...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No market items found for {equipmentCategoryLabels[category].toLowerCase()}.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {items.map(item => {
              const effectEntries = getEffectEntries(item.effects)
              const discounted = hasSponsorDiscount(item)
              const imageUrl = getMarketItemImageUrl(item)

              return (
                <div
                  key={item.id}
                  className="grid gap-5 rounded-lg border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[14rem_1fr_8rem]"
                >
                  <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white p-3 md:w-56">
                    {imageUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setImagePreview({
                            imageUrl,
                            title: item.display_name,
                            subtitle: item.brand_name ?? 'Equipment item',
                          })
                        }
                        className="flex h-full w-full items-center justify-center"
                        aria-label={`Open larger image for ${item.display_name}`}
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
                      {item.brand_name ?? 'Generic brand'}
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
                        ★ {getQualityLabel(item)}
                      </span>

                      <span
                        className={[
                          'rounded-full border px-2 py-1 text-xs font-medium',
                          getTerrainBadgeClass(item),
                        ].join(' ')}
                      >
                        {getTerrainRoleLabel(item)}
                      </span>

                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600">
                        Tier {item.tier}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Bonuses
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
                              {effect.label} {formatEffectValue(effect.value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-gray-400">
                          No direct bonuses listed.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 text-xs text-gray-500">
                      <div>Base price: {formatMoney(item.base_price_cash)}</div>
                      {discounted ? (
                        <div className="font-medium text-green-700">
                          Sponsor discount:{' '}
                          {Number(item.technical_discount_pct).toFixed(1)}%
                        </div>
                      ) : (
                        <div>No sponsor discount</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start justify-between gap-4 md:items-end md:text-right">
                    <div>
                      <div className="text-xs text-gray-400">Club price</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatMoney(item.effective_price_cash ?? item.base_price_cash)}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={actionLoadingId === item.id}
                      onClick={() => openPurchaseModal(item)}
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoadingId === item.id ? 'Purchasing...' : 'Buy'}
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
            Previous
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
            Next
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