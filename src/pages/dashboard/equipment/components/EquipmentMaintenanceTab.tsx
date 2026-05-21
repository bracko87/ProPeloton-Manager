/**
 * EquipmentMaintenanceTab.tsx
 *
 * Maintenance tab for the Equipment dashboard.
 *
 * Shows only active durable equipment that needs attention:
 * - condition <= 90%
 * - not sold
 * - not discarded
 *
 * Actions are displayed as compact text links instead of large buttons.
 */

import React, { useEffect, useMemo, useState } from 'react'
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
  makeIdempotencyKey,
  getStatusBadgeClass,
} from '../equipmentFormatters'

type EquipmentMaintenanceTabProps = {
  clubId: string
}

const PAGE_SIZE = 100

const activeStatusOptions: Array<{ value: EquipmentStatus; label: string }> = [
  { value: 'ready', label: equipmentStatusLabels.ready },
  { value: 'assigned', label: equipmentStatusLabels.assigned },
  { value: 'in_maintenance', label: equipmentStatusLabels.in_maintenance },
  { value: 'worn', label: equipmentStatusLabels.worn },
]

function isActiveMaintenanceItem(item: EquipmentInventoryItem): boolean {
  const condition = Number(item.condition_percent ?? 100)

  return (
    item.status !== 'sold' &&
    item.status !== 'discarded' &&
    condition <= 90
  )
}

function canRunAction(item: EquipmentInventoryItem): boolean {
  return item.status === 'ready' || item.status === 'worn'
}

export default function EquipmentMaintenanceTab({
  clubId,
}: EquipmentMaintenanceTabProps): JSX.Element {
  const [items, setItems] = useState<EquipmentInventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('frame')
  const [status, setStatus] = useState<EquipmentStatus | ''>('')
  const [sort, setSort] = useState('condition_asc')

  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [quote, setQuote] = useState<QuoteMaintenanceResponse | QuoteSaleResponse | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadItems(): Promise<void> {
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
        offset: 0,
      })

      const maintenanceItems = (data.items ?? []).filter(isActiveMaintenanceItem)
      setItems(maintenanceItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [clubId, category, status, sort])

  const categoryOptions = useMemo(
    () =>
      Object.entries(equipmentCategoryLabels).map(([key, label]) => ({
        value: key as EquipmentCategory,
        label,
      })),
    []
  )

  async function handleQuoteMaintenance(item: EquipmentInventoryItem): Promise<void> {
    setQuote(null)
    setError(null)

    try {
      const data = await quoteEquipmentMaintenance({
        clubId,
        inventoryItemId: item.id,
      })
      setQuote(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to quote maintenance')
    }
  }

  async function handleQuoteSale(item: EquipmentInventoryItem): Promise<void> {
    setQuote(null)
    setError(null)

    try {
      const data = await quoteEquipmentSale({
        clubId,
        inventoryItemId: item.id,
      })
      setQuote(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to quote sale')
    }
  }

  async function handleStartMaintenance(item: EquipmentInventoryItem): Promise<void> {
    setActionLoadingId(item.id)
    setError(null)
    setMessage(null)

    try {
      await startEquipmentMaintenance({
        clubId,
        inventoryItemId: item.id,
        idempotencyKey: makeIdempotencyKey('equipment_maintenance'),
      })

      setMessage(`${item.display_name} maintenance started.`)
      await loadItems()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Maintenance failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleSell(item: EquipmentInventoryItem): Promise<void> {
    setActionLoadingId(item.id)
    setError(null)
    setMessage(null)

    try {
      await sellEquipmentItem({
        clubId,
        inventoryItemId: item.id,
        idempotencyKey: makeIdempotencyKey('equipment_sale'),
      })

      setMessage(`${item.display_name} sold.`)
      await loadItems()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Sale failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleDiscard(item: EquipmentInventoryItem): Promise<void> {
    setActionLoadingId(item.id)
    setError(null)
    setMessage(null)

    try {
      await discardEquipmentItem({
        clubId,
        inventoryItemId: item.id,
      })

      setMessage(`${item.display_name} discarded.`)
      await loadItems()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Discard failed. Edge Function may not be deployed yet.'
      )
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900">Maintenance</h3>
        <p className="mt-1 text-xs text-gray-500">
          Shows only active equipment with condition at 90% or below.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                void loadItems()
              }
            }}
            placeholder="Search equipment..."
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          />

          <select
            value={category}
            onChange={event => setCategory(event.target.value as EquipmentCategory)}
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
            onChange={event => setStatus(event.target.value as EquipmentStatus | '')}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Active statuses</option>
            {activeStatusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={event => setSort(event.target.value)}
            className="rounded border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="condition_asc">Condition: low first</option>
            <option value="condition_desc">Condition: high first</option>
            <option value="price_desc">Value: high first</option>
            <option value="price_asc">Value: low first</option>
            <option value="quality_desc">Quality: high first</option>
            <option value="quality_asc">Quality: low first</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadItems()}
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
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

      {quote ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          <span className="font-semibold">Quote: {quote.display_name}</span>

          {'maintenance_cost_cash' in quote ? (
            <span className="ml-2">
              Maintenance {formatMoney(quote.maintenance_cost_cash)} ·{' '}
              {quote.duration_game_days} game day(s) ·{' '}
              {quote.can_maintain ? 'Can maintain' : 'Cannot maintain'}
              {quote.reason ? ` · ${quote.reason}` : ''}
            </span>
          ) : (
            <span className="ml-2">
              Sale value {formatMoney(quote.sale_value_cash)} ·{' '}
              {quote.can_sell ? 'Can sell' : 'Cannot sell'}
              {quote.reason ? ` · ${quote.reason}` : ''}
            </span>
          )}
        </div>
      ) : null}

      <div className="rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900">Equipment Needing Maintenance</h3>
          <p className="text-xs text-gray-500">
            Showing {items.length} active {equipmentCategoryLabels[category].toLowerCase()} item
            {items.length === 1 ? '' : 's'} at 90% condition or below.
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading maintenance...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No active {equipmentCategoryLabels[category].toLowerCase()} need maintenance.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(item => {
              const isBusy = actionLoadingId === item.id
              const canAct = canRunAction(item)

              return (
                <div
                  key={item.id}
                  className="grid gap-4 px-4 py-3 lg:grid-cols-[2.2fr_1.4fr_2fr]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">
                      {item.display_name}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {equipmentCategoryLabels[item.equipment_category]} ·{' '}
                      {item.brand_name ?? 'Generic brand'}
                    </div>

                    <span
                      className={[
                        'mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        getStatusBadgeClass(item.status),
                      ].join(' ')}
                    >
                      {equipmentStatusLabels[item.status]}
                    </span>
                  </div>

                  <div className="flex flex-col justify-center gap-1 text-sm">
                    <div>
                      <span className="text-gray-500">Condition</span>{' '}
                      <span className="font-medium text-gray-900">
                        {formatCondition(item.condition_percent)}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500">Value</span>{' '}
                      <span className="font-medium text-gray-900">
                        {formatMoney(item.current_value_cash)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
                    <button
                      type="button"
                      onClick={() => void handleQuoteMaintenance(item)}
                      className="font-medium text-gray-700 hover:text-gray-900"
                    >
                      Quote maintenance
                    </button>

                    <button
                      type="button"
                      disabled={!canAct || isBusy}
                      onClick={() => void handleStartMaintenance(item)}
                      className="font-medium text-yellow-600 hover:text-yellow-700 disabled:text-gray-300"
                    >
                      Maintain
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleQuoteSale(item)}
                      className="font-medium text-gray-700 hover:text-gray-900"
                    >
                      Quote sale
                    </button>

                    <button
                      type="button"
                      disabled={!canAct || isBusy}
                      onClick={() => void handleSell(item)}
                      className="font-medium text-green-600 hover:text-green-700 disabled:text-gray-300"
                    >
                      Sell
                    </button>

                    <button
                      type="button"
                      disabled={!canAct || isBusy}
                      onClick={() => void handleDiscard(item)}
                      className="font-medium text-red-600 hover:text-red-700 disabled:text-gray-300"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}