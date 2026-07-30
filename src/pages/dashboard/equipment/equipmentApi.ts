/**
 * equipment/equipmentApi.ts
 * Supabase RPC and Edge Function client helpers for the Equipment dashboard.
 */

import { supabase } from '@/lib/supabase'
import type {
  EquipmentDashboard,
  EquipmentDefaultSetupOptionsResponse,
  EquipmentInventoryItem,
  MarketResponse,
  QuoteMaintenanceResponse,
  QuoteSaleResponse,
  RaceSuppliesResponse,
  RpcListResponse,
} from './types'

export type EquipmentPremiumAccess = {
  club_id: string
  is_premium: boolean
  coin_balance: number
  slot_1_unlocked: boolean
  slot_2_unlocked: boolean
  slot_3_unlocked: boolean
  slot_4_unlocked: boolean
  auto_restock_enabled: boolean
  maintenance_reminder_threshold: number
}

export type EquipmentAutoRestockRule = {
  supply_key: string
  enabled: boolean
  minimum_stock: number
  order_quantity: number
}

export type SaveEquipmentSetupPresetPayload = {
  clubId: string
  setupSlot: number
  setupName: string
  frameCatalogItemId?: string | null
  wheelsetCatalogItemId?: string | null
  tiresCatalogItemId?: string | null
  groupsetCatalogItemId?: string | null
  helmetCatalogItemId?: string | null
  shoesCatalogItemId?: string | null
}

export type CalculateEquipmentCatalogSetupBonusPreviewPayload = {
  frameCatalogItemId?: string | null
  wheelsetCatalogItemId?: string | null
  tiresCatalogItemId?: string | null
  groupsetCatalogItemId?: string | null
  helmetCatalogItemId?: string | null
  shoesCatalogItemId?: string | null
}

/**
 * normalizeSingle
 * Normalizes RPCs that may return either one object or a one-row array.
 */
function normalizeSingle<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null
  }

  return (value as T | null) ?? null
}

/**
 * callRpc
 * Generic helper to call a Supabase RPC and return typed data.
 */
async function callRpc<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)

  if (error) {
    throw new Error(error.message)
  }

  return data as T
}

/**
 * callEdge
 * Generic helper to call a Supabase Edge Function and return typed data.
 */
async function callEdge<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw new Error(
      error.message || `Failed to call Edge Function: ${functionName}`
    )
  }

  return data as T
}

/**
 * getEquipmentDashboard
 * Fetch high-level equipment dashboard data for a club.
 */
export async function getEquipmentDashboard(
  clubId: string
): Promise<EquipmentDashboard> {
  return callRpc<EquipmentDashboard>('equipment_get_dashboard', {
    p_club_id: clubId,
  })
}

/**
 * getEquipmentDefaultSetupOptions
 * Fetch available catalog-level default setup options for a club.
 */
export async function getEquipmentDefaultSetupOptions(
  clubId: string
): Promise<EquipmentDefaultSetupOptionsResponse> {
  return callRpc<EquipmentDefaultSetupOptionsResponse>(
    'equipment_get_default_setup_options',
    {
      p_club_id: clubId,
    }
  )
}

/**
 * getEquipmentInventory
 * Fetch paginated equipment inventory list for a club.
 */
export async function getEquipmentInventory(params: {
  clubId: string
  category?: string | null
  status?: string | null
  search?: string | null
  sort?: string
  limit?: number
  offset?: number
}): Promise<RpcListResponse<EquipmentInventoryItem>> {
  return callRpc<RpcListResponse<EquipmentInventoryItem>>(
    'equipment_get_inventory',
    {
      p_club_id: params.clubId,
      p_equipment_category: params.category ?? null,
      p_status: params.status ?? null,
      p_search: params.search ?? null,
      p_sort: params.sort ?? 'condition_asc',
      p_limit: params.limit ?? 20,
      p_offset: params.offset ?? 0,
    }
  )
}

/**
 * getEquipmentMarket
 * Fetch paginated equipment market list for a club.
 */
export async function getEquipmentMarket(params: {
  clubId: string
  kind?: string | null
  category?: string | null
  search?: string | null
  sort?: string
  limit?: number
  offset?: number
}): Promise<MarketResponse> {
  return callRpc<MarketResponse>('equipment_get_market', {
    p_club_id: params.clubId,
    p_equipment_kind: params.kind ?? null,
    p_equipment_category: params.category ?? null,
    p_search: params.search ?? null,
    p_sort: params.sort ?? 'category_asc',
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  })
}

/**
 * getRaceSupplies
 * Fetch race supplies summary and inventory for a club.
 */
export async function getRaceSupplies(
  clubId: string
): Promise<RaceSuppliesResponse> {
  return callRpc<RaceSuppliesResponse>('equipment_get_race_supplies', {
    p_club_id: clubId,
  })
}

/**
 * quoteEquipmentSale
 * Quote sale value and eligibility for an inventory item.
 */
export async function quoteEquipmentSale(params: {
  clubId: string
  inventoryItemId: string
}): Promise<QuoteSaleResponse> {
  return callRpc<QuoteSaleResponse>('equipment_quote_sale', {
    p_club_id: params.clubId,
    p_inventory_item_id: params.inventoryItemId,
  })
}

/**
 * quoteEquipmentMaintenance
 * Quote maintenance cost and duration for an inventory item.
 */
export async function quoteEquipmentMaintenance(params: {
  clubId: string
  inventoryItemId: string
}): Promise<QuoteMaintenanceResponse> {
  return callRpc<QuoteMaintenanceResponse>('equipment_quote_maintenance', {
    p_club_id: params.clubId,
    p_inventory_item_id: params.inventoryItemId,
  })
}

/**
 * getActiveTechnicalSponsorSupport
 * Fetch active technical-sponsor equipment support for the club.
 */
export async function getActiveTechnicalSponsorSupport(
  clubId: string
): Promise<unknown> {
  return callRpc<unknown>('equipment_get_active_technical_sponsor_support', {
    p_club_id: clubId,
  })
}

/**
 * quoteTechnicalSponsorDiscountsBatch
 * Quote technical-sponsor discounts for one or more catalog items.
 */
export async function quoteTechnicalSponsorDiscountsBatch(
  clubId: string,
  catalogItemIds: string[],
  quantity = 1
): Promise<unknown> {
  return callRpc<unknown>(
    'equipment_quote_technical_sponsor_discounts_batch',
    {
      p_club_id: clubId,
      p_catalog_item_ids: catalogItemIds,
      p_quantity: quantity,
    }
  )
}

/**
 * purchaseEquipmentItem
 * Purchase durable equipment through the existing Edge Function.
 */
export async function purchaseEquipmentItem(params: {
  clubId: string
  catalogItemId: string
  quantity: number
  idempotencyKey: string
}): Promise<unknown> {
  return callEdge('equipment-purchase-item', params)
}

/**
 * purchaseRaceSupplies
 * Purchase race supplies through the existing Edge Function.
 */
export async function purchaseRaceSupplies(params: {
  clubId: string
  catalogItemId: string
  quantity: number
  idempotencyKey: string
}): Promise<unknown> {
  return callEdge('equipment-purchase-race-supplies', params)
}

/**
 * startEquipmentMaintenance
 * Start normal cash-based maintenance for an inventory item.
 */
export async function startEquipmentMaintenance(params: {
  clubId: string
  inventoryItemId: string
  idempotencyKey: string
}): Promise<unknown> {
  return callEdge('equipment-start-maintenance', params)
}

/**
 * sellEquipmentItem
 * Sell an inventory item through the existing Edge Function.
 */
export async function sellEquipmentItem(params: {
  clubId: string
  inventoryItemId: string
  idempotencyKey: string
}): Promise<unknown> {
  return callEdge('equipment-sell-item', params)
}

/**
 * discardEquipmentItem
 * Permanently discard an inventory item.
 */
export async function discardEquipmentItem(params: {
  clubId: string
  inventoryItemId: string
}): Promise<unknown> {
  return callEdge('equipment-discard-item', params)
}

/**
 * saveEquipmentDefaultSetup
 * Save the club's default race setup using inventory-item IDs.
 */
export async function saveEquipmentDefaultSetup(params: {
  clubId: string
  frameItemId?: string | null
  wheelsetItemId?: string | null
  tiresItemId?: string | null
  groupsetItemId?: string | null
  helmetItemId?: string | null
  shoesItemId?: string | null
}): Promise<unknown> {
  return callEdge('equipment-save-default-setup', params)
}

/**
 * saveEquipmentDefaultSetupTypes
 * Save the club's default setup using catalog-item type IDs.
 */
export async function saveEquipmentDefaultSetupTypes(params: {
  clubId: string
  frameCatalogItemId?: string | null
  wheelsetCatalogItemId?: string | null
  tiresCatalogItemId?: string | null
  groupsetCatalogItemId?: string | null
  helmetCatalogItemId?: string | null
  shoesCatalogItemId?: string | null
}): Promise<unknown> {
  return callEdge('equipment-save-default-setup-types', params)
}

/**
 * getEquipmentSetupPresets
 * Fetch setup slots, options, saved selections, and bonus previews.
 * Premium/coin access metadata may also be returned by the backend migration.
 */
export async function getEquipmentSetupPresets(
  clubId: string
): Promise<unknown> {
  return callRpc<unknown>('equipment_get_setup_presets', {
    p_club_id: clubId,
  })
}

/**
 * calculateEquipmentCatalogSetupBonusPreview
 * Calculate the weighted preview for a catalog-level setup selection.
 */
export async function calculateEquipmentCatalogSetupBonusPreview(
  payload: CalculateEquipmentCatalogSetupBonusPreviewPayload
): Promise<unknown> {
  return callRpc<unknown>(
    'equipment_calculate_catalog_setup_bonus_preview',
    {
      p_frame_catalog_item_id: payload.frameCatalogItemId ?? null,
      p_wheelset_catalog_item_id: payload.wheelsetCatalogItemId ?? null,
      p_tires_catalog_item_id: payload.tiresCatalogItemId ?? null,
      p_groupset_catalog_item_id: payload.groupsetCatalogItemId ?? null,
      p_helmet_catalog_item_id: payload.helmetCatalogItemId ?? null,
      p_shoes_catalog_item_id: payload.shoesCatalogItemId ?? null,
    }
  )
}

/**
 * saveEquipmentSetupPreset
 * Save one setup slot. The backend migration enforces Premium/coin access
 * for restricted slots, so direct RPC calls cannot bypass the lock.
 */
export async function saveEquipmentSetupPreset(
  payload: SaveEquipmentSetupPresetPayload
): Promise<unknown> {
  return callRpc<unknown>('equipment_save_setup_preset', {
    p_club_id: payload.clubId,
    p_setup_slot: payload.setupSlot,
    p_setup_name: payload.setupName,
    p_frame_catalog_item_id: payload.frameCatalogItemId ?? null,
    p_wheelset_catalog_item_id: payload.wheelsetCatalogItemId ?? null,
    p_tires_catalog_item_id: payload.tiresCatalogItemId ?? null,
    p_groupset_catalog_item_id: payload.groupsetCatalogItemId ?? null,
    p_helmet_catalog_item_id: payload.helmetCatalogItemId ?? null,
    p_shoes_catalog_item_id: payload.shoesCatalogItemId ?? null,
  })
}

/**
 * getEquipmentPremiumAccess
 * Fetch Premium state, coin balance, permanent setup-slot unlocks,
 * auto-restock availability, and maintenance reminder preference.
 */
export async function getEquipmentPremiumAccess(
  clubId: string
): Promise<EquipmentPremiumAccess> {
  const data = await callRpc<unknown>('equipment_get_premium_features_v1', {
    p_club_id: clubId,
  })

  const row = normalizeSingle<Partial<EquipmentPremiumAccess>>(data)

  return {
    club_id: String(row?.club_id ?? clubId),
    is_premium: row?.is_premium === true,
    coin_balance: Number(row?.coin_balance ?? 0),
    slot_1_unlocked: row?.slot_1_unlocked !== false,
    slot_2_unlocked: row?.slot_2_unlocked !== false,
    slot_3_unlocked: row?.slot_3_unlocked === true,
    slot_4_unlocked: row?.slot_4_unlocked === true,
    auto_restock_enabled: row?.auto_restock_enabled === true,
    maintenance_reminder_threshold: Number(
      row?.maintenance_reminder_threshold ?? 80
    ),
  }
}

/**
 * unlockEquipmentSetupSlot
 * Permanently unlock setup slot 3 or 4 for the backend-defined coin price.
 * Coin deduction and ledger creation happen transactionally in the RPC.
 */
export async function unlockEquipmentSetupSlot(
  clubId: string,
  setupSlot: 3 | 4
): Promise<EquipmentPremiumAccess> {
  const data = await callRpc<unknown>('equipment_unlock_setup_slot_v1', {
    p_club_id: clubId,
    p_setup_slot: setupSlot,
  })

  const row = normalizeSingle<EquipmentPremiumAccess>(data)

  if (!row) {
    return getEquipmentPremiumAccess(clubId)
  }

  return {
    ...row,
    coin_balance: Number(row.coin_balance ?? 0),
    maintenance_reminder_threshold: Number(
      row.maintenance_reminder_threshold ?? 80
    ),
  }
}

/**
 * getEquipmentAutoRestockRules
 * Fetch the club's saved Premium race-supply auto-restock rules.
 */
export async function getEquipmentAutoRestockRules(
  clubId: string
): Promise<EquipmentAutoRestockRule[]> {
  const data = await callRpc<unknown>('equipment_get_auto_restock_rules_v1', {
    p_club_id: clubId,
  })

  return (Array.isArray(data) ? data : []) as EquipmentAutoRestockRule[]
}

/**
 * saveEquipmentAutoRestockRule
 * Create or update one Premium race-supply auto-restock rule.
 * Actual purchases continue to use normal club cash and normal prices.
 */
export async function saveEquipmentAutoRestockRule(params: {
  clubId: string
  supplyKey: string
  enabled: boolean
  minimumStock: number
  orderQuantity: number
}): Promise<void> {
  await callRpc<unknown>('equipment_save_auto_restock_rule_v1', {
    p_club_id: params.clubId,
    p_supply_key: params.supplyKey,
    p_enabled: params.enabled,
    p_minimum_stock: params.minimumStock,
    p_order_quantity: params.orderQuantity,
  })
}

/**
 * saveEquipmentMaintenanceReminder
 * Save the Premium maintenance-planner condition threshold.
 */
export async function saveEquipmentMaintenanceReminder(params: {
  clubId: string
  threshold: number
}): Promise<void> {
  await callRpc<unknown>('equipment_save_maintenance_reminder_v1', {
    p_club_id: params.clubId,
    p_condition_threshold: params.threshold,
  })
}
