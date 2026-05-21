/**
 * equipment/equipmentFormatters.ts
 * Utility formatters and label maps for the Equipment dashboard.
 */

import type { EquipmentCategory, EquipmentStatus, RaceSupplyKey } from './types'

export const equipmentCategoryLabels: Record<EquipmentCategory, string> = {
  frame: 'Frames',
  wheelset: 'Wheelsets',
  tires: 'Tires',
  groupset: 'Groupsets',
  helmet: 'Helmets',
  shoes: 'Shoes',
}

export const raceSupplyLabels: Record<RaceSupplyKey, string> = {
  bidons_water_bottles: 'Bidons / Water Bottles',
  energy_gels: 'Energy Gels',
  nutrition_packs: 'Nutrition Packs',
  race_jersey_complete: 'Race Jersey Complete',
  rain_jackets: 'Rain Jackets',
}

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  ready: 'Ready',
  assigned: 'Assigned',
  in_maintenance: 'In maintenance',
  worn: 'Worn',
  sold: 'Sold',
  discarded: 'Discarded',
}

export function formatMoney(value: number | string | null | undefined): string {
  const numberValue = Number(value ?? 0)

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numberValue)
}

export function formatPercent(value: number | string | null | undefined): string {
  const numberValue = Number(value ?? 0)
  return `${numberValue.toFixed(numberValue % 1 === 0 ? 0 : 1)}%`
}

export function formatCondition(value: number | string | null | undefined): string {
  return formatPercent(value)
}

export function makeIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `${prefix}:${random}`
}

export function getStockBadgeClass(stockStatus: string): string {
  if (stockStatus === 'ok') return 'bg-green-100 text-green-700'
  if (stockStatus === 'low') return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

export function getStatusBadgeClass(status: EquipmentStatus): string {
  if (status === 'ready') return 'bg-green-100 text-green-700'
  if (status === 'assigned') return 'bg-blue-100 text-blue-700'
  if (status === 'in_maintenance') return 'bg-yellow-100 text-yellow-700'
  if (status === 'worn') return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-600'
}