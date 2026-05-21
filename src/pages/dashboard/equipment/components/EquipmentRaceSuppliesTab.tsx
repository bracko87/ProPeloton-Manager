/**
 * EquipmentRaceSuppliesTab.tsx
 *
 * Race Supplies tab for the Equipment dashboard.
 * Shows stock-based race supplies with image area and purchase controls.
 */

import React, { useEffect, useState } from 'react'
import { getRaceSupplies, purchaseRaceSupplies } from '../equipmentApi'
import type { RaceSupplyItem } from '../types'
import { formatMoney, getStockBadgeClass, makeIdempotencyKey } from '../equipmentFormatters'

type EquipmentRaceSuppliesTabProps = {
  clubId: string
}

function getRaceSupplyImageUrl(item: RaceSupplyItem): string | null {
  const metadata = item.metadata ?? {}

  const metadataImage =
    typeof metadata.image_url === 'string' && metadata.image_url.trim()
      ? metadata.image_url.trim()
      : null

  const metadataImageUrl =
    typeof metadata.imageUrl === 'string' && metadata.imageUrl.trim()
      ? metadata.imageUrl.trim()
      : null

  return metadataImage ?? metadataImageUrl
}

function getRaceSupplyInitials(name: string): string {
  return name
    .split(/[ /-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

export default function EquipmentRaceSuppliesTab({
  clubId,
}: EquipmentRaceSuppliesTabProps): JSX.Element {
  const [items, setItems] = useState<RaceSupplyItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadSupplies(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const data = await getRaceSupplies(clubId)
      setItems(data.items ?? [])

      const initialQuantities: Record<string, number> = {}

      ;(data.items ?? []).forEach(item => {
        initialQuantities[item.supply_key] =
          item.supply_key === 'race_jersey_complete' ? 5 : 50
      })

      setQuantities(current => ({ ...initialQuantities, ...current }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load race supplies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSupplies()
  }, [clubId])

  async function handleBuy(item: RaceSupplyItem): Promise<void> {
    if (!item.catalog_item_id) {
      setError(`No catalog item found for ${item.display_name}`)
      return
    }

    const quantity = Math.max(1, quantities[item.supply_key] ?? 1)

    setActionLoadingKey(item.supply_key)
    setMessage(null)
    setError(null)

    try {
      await purchaseRaceSupplies({
        clubId,
        catalogItemId: item.catalog_item_id,
        quantity,
        idempotencyKey: makeIdempotencyKey('race_supplies_purchase'),
      })

      setMessage(`${quantity}x ${item.display_name} purchased.`)
      await loadSupplies()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Purchase failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoadingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900">Race Supplies</h3>
        <p className="mt-1 text-xs text-gray-500">
          Stock-based supplies used for race preparation. These are not repaired or sold.
        </p>
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

      {loading ? (
        <div className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
          Loading race supplies...
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {items.map(item => {
            const stockStatus =
              item.quantity_available === 0
                ? 'empty'
                : item.quantity_available < 20
                  ? 'low'
                  : 'ok'

            const imageUrl = getRaceSupplyImageUrl(item)

            return (
              <div
                key={item.supply_key}
                className="overflow-hidden rounded-xl bg-white shadow-sm"
              >
                <div className="grid min-h-[230px] gap-0 md:grid-cols-[220px_1fr]">
                  <div className="flex items-center justify-center bg-gray-50 p-4">
                    <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.display_name}
                          className="h-full w-full object-cover"
                          onError={event => {
                            event.currentTarget.style.display = 'none'

                            const fallback = event.currentTarget
                              .nextElementSibling as HTMLElement | null

                            if (fallback) {
                              fallback.style.display = 'flex'
                            }
                          }}
                        />
                      ) : null}

                      <div
                        className={[
                          'h-full w-full items-center justify-center bg-gray-100 text-4xl font-bold text-gray-400',
                          imageUrl ? 'hidden' : 'flex',
                        ].join(' ')}
                      >
                        {getRaceSupplyInitials(item.display_name)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {item.display_name}
                        </h4>
                        <p className="mt-1 text-sm text-gray-500">
                          {item.brand_name ? `Brand: ${item.brand_name}` : 'Generic supply'}
                        </p>
                      </div>

                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          getStockBadgeClass(stockStatus),
                        ].join(' ')}
                      >
                        {stockStatus}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400">Available</div>
                        <div className="font-semibold text-gray-900">
                          {item.quantity_available}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-400">Purchased</div>
                        <div className="font-semibold text-gray-900">
                          {item.total_purchased}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-400">Used</div>
                        <div className="font-semibold text-gray-900">
                          {item.total_used}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-400">Unit price</div>
                        <div className="font-semibold text-gray-900">
                          {formatMoney(item.base_price_cash ?? 0)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto flex gap-2 pt-5">
                      <input
                        type="number"
                        min={1}
                        value={quantities[item.supply_key] ?? 1}
                        onChange={event =>
                          setQuantities(current => ({
                            ...current,
                            [item.supply_key]: Number(event.target.value),
                          }))
                        }
                        className="w-28 rounded border border-gray-200 px-3 py-2 text-sm"
                      />

                      <button
                        type="button"
                        disabled={actionLoadingKey === item.supply_key}
                        onClick={() => void handleBuy(item)}
                        className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {actionLoadingKey === item.supply_key ? 'Buying...' : 'Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}