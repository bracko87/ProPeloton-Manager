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

type EquipmentInventoryTabProps = {
  clubId: string
}

type ActionMode = 'repair' | 'sell' | 'discard'

type ActionModalState = {
  mode: ActionMode
  item: EquipmentInventoryItem
}

const PAGE_SIZE = 20

const activeStatusOptions: Array<{ value: EquipmentStatus; label: string }> = [
  { value: 'ready', label: equipmentStatusLabels.ready },
  { value: 'assigned', label: equipmentStatusLabels.assigned },
  { value: 'in_maintenance', label: equipmentStatusLabels.in_maintenance },
  { value: 'worn', label: equipmentStatusLabels.worn },
]

function isActiveInventoryItem(item: EquipmentInventoryItem): boolean {
  return item.status !== 'sold' && item.status !== 'discarded'
}

function canRunAction(item: EquipmentInventoryItem): boolean {
  return item.status === 'ready' || item.status === 'worn'
}

function canRepair(item: EquipmentInventoryItem): boolean {
  return canRunAction(item) && Number(item.condition_percent ?? 100) <= 90
}

function getQualityLabel(score: number | string | null | undefined): string {
  const value = Number(score ?? 0)

  if (value >= 75) return 'Super'
  if (value >= 60) return 'Good'
  return 'Basic'
}

function getQualityBadgeClass(score: number | string | null | undefined): string {
  const value = Number(score ?? 0)

  if (value >= 75) return 'bg-purple-100 text-purple-700 border-purple-200'
  if (value >= 60) return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

function formatEffectLabel(key: string): string {
  return key
    .replace(/_pct$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
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

function getShortBonuses(item: EquipmentInventoryItem): Array<{ label: string; value: string }> {
  const effects = item.effects ?? {}

  return Object.entries(effects)
    .slice(0, 3)
    .map(([key, value]) => ({
      label: formatEffectLabel(key),
      value: formatEffectValue(value),
    }))
}

export default function EquipmentInventoryTab({
  clubId,
}: EquipmentInventoryTabProps): JSX.Element {
  const [items, setItems] = useState<EquipmentInventoryItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('frame')
  const [status, setStatus] = useState<EquipmentStatus | ''>('')
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const categoryOptions = useMemo(
    () =>
      Object.entries(equipmentCategoryLabels).map(([key, label]) => ({
        value: key as EquipmentCategory,
        label,
      })),
    []
  )

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

        setMessage(`${modal.item.display_name} repair started.`)
      }

      if (modal.mode === 'sell') {
        await sellEquipmentItem({
          clubId,
          inventoryItemId: modal.item.id,
          idempotencyKey: makeIdempotencyKey('equipment_sale'),
        })

        setMessage(`${modal.item.display_name} sold.`)
      }

      if (modal.mode === 'discard') {
        await discardEquipmentItem({
          clubId,
          inventoryItemId: modal.item.id,
        })

        setMessage(`${modal.item.display_name} discarded.`)
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

    if (modal.mode === 'repair') return 'Confirm Repair'
    if (modal.mode === 'sell') return 'Confirm Sale'
    return 'Confirm Discard'
  }

  function getModalConfirmLabel(): string {
    if (!modal) return 'Confirm'

    if (modal.mode === 'repair') return actionLoading ? 'Starting repair...' : 'Confirm Repair'
    if (modal.mode === 'sell') return actionLoading ? 'Selling...' : 'Confirm Sale'
    return actionLoading ? 'Discarding...' : 'Confirm Discard'
  }

  function getModalConfirmClass(): string {
    if (!modal) return 'bg-blue-600 hover:bg-blue-700'

    if (modal.mode === 'repair') return 'bg-yellow-500 hover:bg-yellow-600'
    if (modal.mode === 'sell') return 'bg-green-600 hover:bg-green-700'
    return 'bg-red-600 hover:bg-red-700'
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                setPage(0)
                void loadInventory()
              }
            }}
            placeholder="Search equipment..."
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
          onClick={() => {
            setPage(0)
            void loadInventory()
          }}
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

      <div className="rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900">Owned Equipment</h3>
          <p className="text-xs text-gray-500">
            Showing {items.length} active {equipmentCategoryLabels[category].toLowerCase()} item
            {items.length === 1 ? '' : 's'}.
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading inventory...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No active {equipmentCategoryLabels[category].toLowerCase()} found.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(item => {
              const bonuses = getShortBonuses(item)
              const itemCanRunAction = canRunAction(item)
              const itemCanRepair = canRepair(item)

              return (
                <div
                  key={item.id}
                  className="grid gap-4 px-4 py-3 xl:grid-cols-[2.1fr_1.1fr_1.2fr_2fr_1.2fr]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">
                      {item.display_name}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>
                        {equipmentCategoryLabels[item.equipment_category]} ·{' '}
                        {item.brand_name ?? 'Generic brand'}
                      </span>

                      {item.used_in_default_setup ? (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                          Default setup
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-1 xl:border-l xl:border-gray-100 xl:pl-4">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">Quality</span>
                      <span
                        className={[
                          'rounded-full border px-2 py-0.5 font-medium',
                          getQualityBadgeClass(item.quality_score),
                        ].join(' ')}
                      >
                        ★ {getQualityLabel(item.quality_score)}
                      </span>
                    </div>

                    <span
                      className={[
                        'inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium',
                        getStatusBadgeClass(item.status),
                      ].join(' ')}
                    >
                      {equipmentStatusLabels[item.status]}
                    </span>
                  </div>

                  <div className="flex flex-col justify-center gap-1 text-sm xl:border-l xl:border-gray-100 xl:pl-4">
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
                      <span className="text-gray-400">No direct bonuses yet</span>
                    )}
                  </div>

                  <div className="flex flex-col items-start justify-center gap-1 text-left text-xs xl:border-l xl:border-gray-100 xl:pl-4">
                    {itemCanRepair ? (
                      <button
                        type="button"
                        onClick={() => void openActionModal('repair', item)}
                        className="text-xs font-medium text-yellow-600 hover:text-yellow-700"
                      >
                        Repair
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No repair needed</span>
                    )}

                    <button
                      type="button"
                      disabled={!itemCanRunAction}
                      onClick={() => void openActionModal('sell', item)}
                      className="text-xs font-medium text-green-600 hover:text-green-700 disabled:text-gray-300"
                    >
                      Sell
                    </button>

                    <button
                      type="button"
                      disabled={!itemCanRunAction}
                      onClick={() => void openActionModal('discard', item)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-300"
                    >
                      Discard
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
                className="rounded px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
              {modal.mode === 'repair' ? (
                quoteLoading ? (
                  <div className="text-gray-500">Loading repair cost...</div>
                ) : repairQuote ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current condition</span>
                      <span className="font-medium">
                        {formatCondition(repairQuote.condition_percent)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">After repair</span>
                      <span className="font-medium">
                        {formatCondition(repairQuote.condition_after)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Repair cost</span>
                      <span className="font-semibold text-gray-900">
                        {formatMoney(repairQuote.maintenance_cost_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration</span>
                      <span className="font-medium">
                        {repairQuote.duration_game_days} game day
                        {repairQuote.duration_game_days === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-red-600">Repair quote could not be loaded.</div>
                )
              ) : null}

              {modal.mode === 'sell' ? (
                quoteLoading ? (
                  <div className="text-gray-500">Loading sale value...</div>
                ) : saleQuote ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Condition</span>
                      <span className="font-medium">
                        {formatCondition(saleQuote.condition_percent)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sale income</span>
                      <span className="font-semibold text-green-700">
                        {formatMoney(saleQuote.sale_value_cash)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-red-600">Sale quote could not be loaded.</div>
                )
              ) : null}

              {modal.mode === 'discard' ? (
                <div className="space-y-2">
                  <p className="text-gray-700">
                    Discard this item permanently? This gives no money back.
                  </p>
                  <p className="text-xs text-red-600">
                    This action cannot be undone.
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
                Cancel
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