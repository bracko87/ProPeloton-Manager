/**
 * EquipmentRaceSuppliesTab.tsx
 *
 * Race Supplies tab for the Equipment dashboard.
 *
 * Shows stock-based race supplies with image area and purchase controls.
 *
 * Updated for durable reusable supplies:
 * - Bidons / Water Bottles, Energy Gels, Nutrition Packs = consumables.
 * - Race Jersey Complete = mandatory durable kit, 10 stage uses per unit.
 * - Rain Jackets = optional durable weather item, 25 stage uses per unit.
 *
 * Backend note:
 * - Durable usage comes from public.club_race_supply_units and
 *   public.get_club_race_supply_unit_summary_v1().
 * - This component can display durability fields when getRaceSupplies() includes them.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { getRaceSupplies, purchaseRaceSupplies } from '../equipmentApi'
import type { RaceSupplyItem } from '../types'
import {
  formatMoney,
  getStockBadgeClass,
  makeIdempotencyKey,
} from '../equipmentFormatters'

type EquipmentRaceSuppliesTabProps = {
  clubId: string
}

type JsonRecord = Record<string, unknown>

type RaceSupplyKey =
  | 'bidons_water_bottles'
  | 'energy_gels'
  | 'nutrition_packs'
  | 'race_jersey_complete'
  | 'rain_jackets'

type RaceSupplyUseType = 'consumable' | 'durable'

type RaceSupplyRule = {
  key: RaceSupplyKey
  displayName: string
  shortLabel: string
  useType: RaceSupplyUseType
  defaultPurchaseQuantity: number
  minPurchaseQuantity: number
  maxPurchaseQuantity: number
  stockLowThreshold: number
  stageRule: string
  durabilityRule: string
  positiveEffects: string[]
  negativeEffects: string[]
}

type DurableSupplySummary = {
  totalUnits: number | null
  usableUnits: number | null
  wornOutUnits: number | null
  discardedUnits: number | null
  avgUsesRemaining: number | null
  minUsesRemaining: number | null
  maxUsesRemaining: number | null
  maxStageUses: number | null
}

const raceSupplyRules: Record<RaceSupplyKey, RaceSupplyRule> = {
  bidons_water_bottles: {
    key: 'bidons_water_bottles',
    displayName: 'Bidons / Water Bottles',
    shortLabel: 'Bidons',
    useType: 'consumable',
    defaultPurchaseQuantity: 50,
    minPurchaseQuantity: 1,
    maxPurchaseQuantity: 500,
    stockLowThreshold: 20,
    stageRule: 'Team-level stage setup: 1–4 bidons per rider.',
    durabilityRule: 'One-use consumable. Every bottle used in a stage is consumed.',
    positiveEffects: [
      'Hydration support: +0.2% stamina stability per bidon',
      'Fatigue control: -0.2% stage fatigue per bidon',
    ],
    negativeEffects: [
      'Below minimum: +1% fatigue risk',
      'No extra benefit after 4 bidons per rider',
    ],
  },

  energy_gels: {
    key: 'energy_gels',
    displayName: 'Energy Gels',
    shortLabel: 'Gels',
    useType: 'consumable',
    defaultPurchaseQuantity: 50,
    minPurchaseQuantity: 1,
    maxPurchaseQuantity: 500,
    stockLowThreshold: 20,
    stageRule: 'Team-level stage setup: 0–4 gels per rider.',
    durabilityRule: 'One-use consumable. Every gel used in a stage is consumed.',
    positiveEffects: [
      'Energy boost: +0.5% stamina per gel',
      'Final effort support: +0.25% sprint/climb/attack efficiency per gel',
    ],
    negativeEffects: [
      'No gels: -1% final-phase stamina support',
      'No extra benefit after 4 gels per rider',
    ],
  },

  nutrition_packs: {
    key: 'nutrition_packs',
    displayName: 'Nutrition Packs',
    shortLabel: 'Nutrition',
    useType: 'consumable',
    defaultPurchaseQuantity: 50,
    minPurchaseQuantity: 1,
    maxPurchaseQuantity: 300,
    stockLowThreshold: 20,
    stageRule: 'Team-level stage setup: 0–2 nutrition packs per rider.',
    durabilityRule: 'One-use consumable. Every pack used in a stage is consumed.',
    positiveEffects: [
      'Endurance support: +1% stamina stability per pack',
      'Recovery support: +0.5% post-stage recovery per pack',
    ],
    negativeEffects: [
      'No nutrition on long stages: +1% fatigue pressure',
      'No extra benefit after 2 packs per rider',
    ],
  },

  race_jersey_complete: {
    key: 'race_jersey_complete',
    displayName: 'Race Jersey Complete',
    shortLabel: 'Race Jersey',
    useType: 'durable',
    defaultPurchaseQuantity: 10,
    minPurchaseQuantity: 1,
    maxPurchaseQuantity: 50,
    stockLowThreshold: 6,
    stageRule: 'Mandatory in Stage Plans. One race jersey kit is required per selected rider.',
    durabilityRule: 'Durable reusable kit. Each kit has 10 stage uses before it becomes worn out.',
    positiveEffects: [
      'Race readiness: +0.5% setup readiness',
      'Comfort support: +0.25% fatigue control',
    ],
    negativeEffects: [
      'Missing jersey kit: blocks stage setup',
      'Worn-out kits are no longer usable',
    ],
  },

  rain_jackets: {
    key: 'rain_jackets',
    displayName: 'Rain Jackets',
    shortLabel: 'Rain Jacket',
    useType: 'durable',
    defaultPurchaseQuantity: 10,
    minPurchaseQuantity: 1,
    maxPurchaseQuantity: 50,
    stockLowThreshold: 6,
    stageRule: 'Optional in Stage Plans: None or All riders.',
    durabilityRule:
      'Durable reusable item. Each jacket has 25 stage uses. One use is counted whenever the jacket is assigned/used for a stage.',
    positiveEffects: [
      'Bad-weather protection: sickness risk ×0.50 in rain/cold/bad weather',
      'Cold/rain fatigue support: -0.5% fatigue pressure',
    ],
    negativeEffects: [
      'Efficiency penalty: -1% rider speed/efficiency when used',
      'Uses 1 jacket durability use every assigned stage',
    ],
  },
}

const allowedRaceSupplyKeys = Object.keys(raceSupplyRules) as RaceSupplyKey[]

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function getOptionalNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value)

    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return null
}

function getRaceSupplyRule(supplyKey: string): RaceSupplyRule | null {
  return raceSupplyRules[supplyKey as RaceSupplyKey] ?? null
}

function getRaceSupplyImageUrl(item: RaceSupplyItem): string | null {
  const metadata = asRecord(item.metadata)

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
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getDurableSupplySummary(item: RaceSupplyItem): DurableSupplySummary {
  const itemRecord = item as unknown as JsonRecord
  const metadata = asRecord(item.metadata)
  const durability = asRecord(metadata.durability)
  const durabilitySummary = asRecord(metadata.durability_summary)
  const reusable = asRecord(metadata.reusable)

  return {
    totalUnits: getOptionalNumber(
      itemRecord.total_units,
      durabilitySummary.total_units,
      durability.total_units,
      reusable.total_units,
    ),
    usableUnits: getOptionalNumber(
      itemRecord.usable_units,
      durabilitySummary.usable_units,
      durability.usable_units,
      reusable.usable_units,
    ),
    wornOutUnits: getOptionalNumber(
      itemRecord.worn_out_units,
      durabilitySummary.worn_out_units,
      durability.worn_out_units,
      reusable.worn_out_units,
    ),
    discardedUnits: getOptionalNumber(
      itemRecord.discarded_units,
      durabilitySummary.discarded_units,
      durability.discarded_units,
      reusable.discarded_units,
    ),
    avgUsesRemaining: getOptionalNumber(
      itemRecord.avg_uses_remaining,
      durabilitySummary.avg_uses_remaining,
      durability.avg_uses_remaining,
      reusable.avg_uses_remaining,
    ),
    minUsesRemaining: getOptionalNumber(
      itemRecord.min_uses_remaining,
      durabilitySummary.min_uses_remaining,
      durability.min_uses_remaining,
      reusable.min_uses_remaining,
    ),
    maxUsesRemaining: getOptionalNumber(
      itemRecord.max_uses_remaining,
      durabilitySummary.max_uses_remaining,
      durability.max_uses_remaining,
      reusable.max_uses_remaining,
    ),
    maxStageUses: getOptionalNumber(
      itemRecord.max_stage_uses,
      durabilitySummary.max_stage_uses,
      durability.max_stage_uses,
      reusable.max_stage_uses,
    ),
  }
}

function formatUses(value: number | null): string {
  if (value === null) return '—'
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
}

function getRaceSupplyStockStatus(
  item: RaceSupplyItem,
  rule: RaceSupplyRule,
): 'empty' | 'low' | 'ok' {
  if (item.quantity_available === 0) return 'empty'
  if (item.quantity_available < rule.stockLowThreshold) return 'low'
  return 'ok'
}

function normalizePurchaseQuantity(value: number, rule: RaceSupplyRule): number {
  if (!Number.isFinite(value)) return rule.defaultPurchaseQuantity

  return Math.min(
    Math.max(Math.floor(value), rule.minPurchaseQuantity),
    rule.maxPurchaseQuantity,
  )
}

function sortRaceSupplyItems(items: RaceSupplyItem[]): RaceSupplyItem[] {
  return [...items]
    .filter((item) => allowedRaceSupplyKeys.includes(item.supply_key as RaceSupplyKey))
    .sort((a, b) => {
      return (
        allowedRaceSupplyKeys.indexOf(a.supply_key as RaceSupplyKey) -
        allowedRaceSupplyKeys.indexOf(b.supply_key as RaceSupplyKey)
      )
    })
}

function SupplyEffectsList({
  title,
  values,
  tone,
}: {
  title: string
  values: string[]
  tone: 'positive' | 'negative'
}) {
  return (
    <div>
      <div
        className={[
          'text-xs font-semibold',
          tone === 'positive' ? 'text-emerald-700' : 'text-red-700',
        ].join(' ')}
      >
        {title}
      </div>

      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-gray-600">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

function RaceSupplyInfoTooltip({ rule }: { rule: RaceSupplyRule }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const pinTimerRef = React.useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pinTimerRef.current !== null) {
        window.clearTimeout(pinTimerRef.current)
      }
    }
  }, [])

  function updateTooltipPosition() {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const panelWidth = 560
    const margin = 16
    const left = Math.min(
      Math.max(rect.right - panelWidth, margin),
      Math.max(window.innerWidth - panelWidth - margin, margin),
    )

    setPosition({
      top: rect.bottom + 8,
      left,
    })
  }

  function startPinCountdown() {
    if (pinTimerRef.current !== null) {
      window.clearTimeout(pinTimerRef.current)
    }

    pinTimerRef.current = window.setTimeout(() => {
      setPinned(true)
      setOpen(true)
    }, 3000)
  }

  function stopPinCountdown() {
    if (pinTimerRef.current !== null) {
      window.clearTimeout(pinTimerRef.current)
      pinTimerRef.current = null
    }
  }

  function handleMouseEnter() {
    updateTooltipPosition()
    setOpen(true)
    if (!pinned) {
      startPinCountdown()
    }
  }

  function handleMouseLeave() {
    stopPinCountdown()
    if (!pinned) {
      setOpen(false)
    }
  }

  function handleToggleClick() {
    if (open && pinned) {
      setPinned(false)
      setOpen(false)
      stopPinCountdown()
      return
    }

    updateTooltipPosition()
    setOpen(true)
    setPinned(true)
    stopPinCountdown()
  }

  function handleClose() {
    setPinned(false)
    setOpen(false)
    stopPinCountdown()
  }

  return (
    <span
      className={[
        'relative inline-flex',
        open ? 'z-[9999]' : 'z-10',
      ].join(' ')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${rule.displayName} stage plan rule`}
        onClick={handleToggleClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-bold text-gray-500 shadow-sm hover:bg-gray-50"
      >
        i
      </button>

      {open ? (
        <div
          className="fixed z-[99999] max-h-[28rem] w-[35rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-left text-xs leading-5 text-gray-600 shadow-2xl ring-1 ring-black/5"
          style={{ top: position.top, left: position.left }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Stage Plan rule
            </div>

            {pinned ? (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="text-sm font-semibold text-gray-900">
            {rule.displayName}
          </div>

          <p className="mt-1 text-xs text-gray-500">{rule.stageRule}</p>
          <p className="mt-1 text-xs text-gray-500">{rule.durabilityRule}</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SupplyEffectsList
              title="Positive effects"
              values={rule.positiveEffects}
              tone="positive"
            />

            <SupplyEffectsList
              title="Negative / limits"
              values={rule.negativeEffects}
              tone="negative"
            />
          </div>

          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            Hover for 3 seconds or click the info button to pin this popup.
          </div>
        </div>
      ) : null}
    </span>
  )
}

function DurableMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-blue-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-blue-950">{value}</div>
    </div>
  )
}

function DurableSupplyOverviewPanel({
  items,
}: {
  items: RaceSupplyItem[]
}) {
  const durableItems = items.filter((item) => {
    const rule = getRaceSupplyRule(item.supply_key)
    return rule?.useType === 'durable'
  })

  if (durableItems.length === 0) return null

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">
            Durable reusable supply condition
          </h4>
          <p className="mt-1 text-sm text-gray-500">
            Race Jersey Complete and Rain Jackets are reusable units. This panel
            keeps their counts and remaining stage-use durability visible in one
            place.
          </p>
        </div>

        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          reusable units
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {durableItems.map((item) => {
          const rule = getRaceSupplyRule(item.supply_key)
          if (!rule) return null

          const summary = getDurableSupplySummary(item)
          const maxStageUses = summary.maxStageUses ?? (
            item.supply_key === 'race_jersey_complete' ? 10 : 25
          )
          const usableUnits = summary.usableUnits ?? item.quantity_available
          const wornOutUnits = summary.wornOutUnits ?? 0
          const avgUsesRemaining = summary.avgUsesRemaining ?? maxStageUses
          const minUsesRemaining = summary.minUsesRemaining
          const maxUsesRemaining = summary.maxUsesRemaining

          return (
            <div
              key={item.supply_key}
              className="relative rounded-2xl border border-blue-100 bg-blue-50 p-4 pr-32"
            >
              <span className="absolute right-4 top-4 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-blue-700 shadow-sm">
                {formatUses(maxStageUses)} stage uses
              </span>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-950">
                  {item.display_name}
                </div>
                <div className="mt-1 max-w-[34rem] text-xs leading-5 text-blue-800">
                  {rule.durabilityRule}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                <DurableMetric
                  label="Available"
                  value={formatUses(item.quantity_available)}
                />
                <DurableMetric
                  label="Purchased"
                  value={formatUses(item.total_purchased)}
                />
                <DurableMetric
                  label="Used"
                  value={formatUses(item.total_used)}
                />
                <DurableMetric
                  label="Usable units"
                  value={formatUses(usableUnits)}
                />
                <DurableMetric
                  label="Worn out"
                  value={formatUses(wornOutUnits)}
                />
                <DurableMetric
                  label="Avg uses left"
                  value={formatUses(avgUsesRemaining)}
                />
              </div>

              <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-blue-800">
                Uses range:{' '}
                <span className="font-semibold">
                  {minUsesRemaining === null || maxUsesRemaining === null
                    ? '—'
                    : `${formatUses(minUsesRemaining)}–${formatUses(maxUsesRemaining)}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

  const sortedItems = useMemo(() => sortRaceSupplyItems(items), [items])

  async function loadSupplies(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const data = await getRaceSupplies(clubId)
      const nextItems = sortRaceSupplyItems(data.items ?? [])

      setItems(nextItems)

      const initialQuantities: Record<string, number> = {}

      nextItems.forEach((item) => {
        const rule = getRaceSupplyRule(item.supply_key)

        initialQuantities[item.supply_key] =
          rule?.defaultPurchaseQuantity ?? 1
      })

      setQuantities((current) => ({ ...initialQuantities, ...current }))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load race supplies',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSupplies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  async function handleBuy(item: RaceSupplyItem): Promise<void> {
    if (!item.catalog_item_id) {
      setError(`No catalog item found for ${item.display_name}`)
      return
    }

    const rule = getRaceSupplyRule(item.supply_key)
    const quantity = normalizePurchaseQuantity(
      quantities[item.supply_key] ?? rule?.defaultPurchaseQuantity ?? 1,
      rule ?? {
        key: item.supply_key as RaceSupplyKey,
        displayName: item.display_name,
        shortLabel: item.display_name,
        useType: 'consumable',
        defaultPurchaseQuantity: 1,
        minPurchaseQuantity: 1,
        maxPurchaseQuantity: 999,
        stockLowThreshold: 20,
        stageRule: '',
        durabilityRule: '',
        positiveEffects: [],
        negativeEffects: [],
      },
    )

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
          : 'Purchase failed. Edge Function may not be deployed yet.',
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
          Race supplies used by Race Preparation and Stage Plans. Consumables are
          used once; Race Jersey Complete and Rain Jackets are durable reusable
          supplies with stage-use limits.
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
      ) : sortedItems.length === 0 ? (
        <div className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
          No race supplies found. Expected supplies are Bidons / Water Bottles,
          Energy Gels, Nutrition Packs, Race Jersey Complete and Rain Jackets.
        </div>
      ) : (
        <div className="relative grid gap-5 xl:grid-cols-2">
          {sortedItems.map((item) => {
            const rule = getRaceSupplyRule(item.supply_key)
            const stockStatus = rule
              ? getRaceSupplyStockStatus(item, rule)
              : item.quantity_available === 0
                ? 'empty'
                : item.quantity_available < 20
                  ? 'low'
                  : 'ok'

            const imageUrl = getRaceSupplyImageUrl(item)
            const isDurable = rule?.useType === 'durable'
            const purchaseQuantity = quantities[item.supply_key] ?? 1

            return (
              <div
                key={item.supply_key}
                className="relative rounded-xl bg-white shadow-sm"
              >
                <div className="grid min-h-[230px] gap-0 md:grid-cols-[220px_1fr]">
                  <div className="flex items-center justify-center bg-gray-50 p-4">
                    <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.display_name}
                          className="h-full w-full object-cover"
                          onError={(event) => {
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
                          {item.brand_name
                            ? `Brand: ${item.brand_name}`
                            : 'Generic supply'}
                        </p>

                        {rule ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={[
                                'rounded-full px-2 py-0.5 text-xs font-semibold',
                                isDurable
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700',
                              ].join(' ')}
                            >
                              {isDurable ? 'Durable reusable' : 'Consumable'}
                            </span>

                            {rule.key === 'race_jersey_complete' ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                Mandatory for stages
                              </span>
                            ) : null}

                            {rule.key === 'rain_jackets' ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                                Weather protection
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {rule ? <RaceSupplyInfoTooltip rule={rule} /> : null}

                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            getStockBadgeClass(stockStatus),
                          ].join(' ')}
                        >
                          {stockStatus}
                        </span>
                      </div>
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
                        min={rule?.minPurchaseQuantity ?? 1}
                        max={rule?.maxPurchaseQuantity ?? 999}
                        value={purchaseQuantity}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.supply_key]: normalizePurchaseQuantity(
                              Number(event.target.value),
                              rule ?? {
                                key: item.supply_key as RaceSupplyKey,
                                displayName: item.display_name,
                                shortLabel: item.display_name,
                                useType: 'consumable',
                                defaultPurchaseQuantity: 1,
                                minPurchaseQuantity: 1,
                                maxPurchaseQuantity: 999,
                                stockLowThreshold: 20,
                                stageRule: '',
                                durabilityRule: '',
                                positiveEffects: [],
                                negativeEffects: [],
                              },
                            ),
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
                        {actionLoadingKey === item.supply_key
                          ? 'Buying...'
                          : isDurable
                            ? 'Buy Units'
                            : 'Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <DurableSupplyOverviewPanel items={sortedItems} />
        </div>
      )}
    </div>
  )
}
