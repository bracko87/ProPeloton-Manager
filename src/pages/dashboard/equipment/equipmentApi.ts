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

/**
 * callRpc
 * Generic helper to call a Supabase RPC and return typed data.
 */
async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
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
async function callEdge<T>(
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
export async function getEquipmentDashboard(clubId: string): Promise<EquipmentDashboard> {
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
  return callRpc<RpcListResponse<EquipmentInventoryItem>>('equipment_get_inventory', {
    p_club_id: params.clubId,
    p_equipment_category: params.category ?? null,
    p_status: params.status ?? null,
    p_search: params.search ?? null,
    p_sort: params.sort ?? 'condition_asc',
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  })
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
export async function getRaceSupplies(clubId: string): Promise<RaceSuppliesResponse> {
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

export async function getActiveTechnicalSponsorSupport(
  clubId: string
): Promise<unknown> {
  const { data, error } = await supabase.rpc(
    'equipment_get_active_technical_sponsor_support',
    {
      p_club_id: clubId,
    }
  )

  if (error) throw error

  return data
}

export async function quoteTechnicalSponsorDiscountsBatch(
  clubId: string,
  catalogItemIds: string[],
  quantity = 1
): Promise<unknown> {
  const { data, error } = await supabase.rpc(
    'equipment_quote_technical_sponsor_discounts_batch',
    {
      p_club_id: clubId,
      p_catalog_item_ids: catalogItemIds,
      p_quantity: quantity,
    }
  )

  if (error) throw error

  return data
}

/**
 * purchaseEquipmentItem
 * Purchase a durable equipment item via Edge Function.
 */
export async function purchaseEquipmentItem(params: {
  clubId: string
  catalogItemId: string
  quantity: number
  idempotencyKey: string
}) {
  return callEdge('equipment-purchase-item', params)
}

/**
 * purchaseRaceSupplies
 * Purchase race supplies via Edge Function.
 */
export async function purchaseRaceSupplies(params: {
  clubId: string
  catalogItemId: string
  quantity: number
  idempotencyKey: string
}) {
  return callEdge('equipment-purchase-race-supplies', params)
}

/**
 * startEquipmentMaintenance
 * Start maintenance job for an inventory item via Edge Function.
 */
export async function startEquipmentMaintenance(params: {
  clubId: string
  inventoryItemId: string
  idempotencyKey: string
}) {
  return callEdge('equipment-start-maintenance', params)
}

/**
 * sellEquipmentItem
 * Sell an inventory item via Edge Function.
 */
export async function sellEquipmentItem(params: {
  clubId: string
  inventoryItemId: string
  idempotencyKey: string
}) {
  return callEdge('equipment-sell-item', params)
}

/**
 * discardEquipmentItem
 * Discard an inventory item via Edge Function.
 */
export async function discardEquipmentItem(params: {
  clubId: string
  inventoryItemId: string
}) {
  return callEdge('equipment-discard-item', params)
}

/**
 * saveEquipmentDefaultSetup
 * Save the club's default race equipment setup via Edge Function.
 */
export async function saveEquipmentDefaultSetup(params: {
  clubId: string
  frameItemId?: string | null
  wheelsetItemId?: string | null
  tiresItemId?: string | null
  groupsetItemId?: string | null
  helmetItemId?: string | null
  shoesItemId?: string | null
}) {
  return callEdge('equipment-save-default-setup', params)
}

/**
 * saveEquipmentDefaultSetupTypes
 * Save the club's default setup by catalog item types via Edge Function.
 */
export async function saveEquipmentDefaultSetupTypes(params: {
  clubId: string
  frameCatalogItemId?: string | null
  wheelsetCatalogItemId?: string | null
  tiresCatalogItemId?: string | null
  groupsetCatalogItemId?: string | null
  helmetCatalogItemId?: string | null
  shoesCatalogItemId?: string | null
}) {
  return callEdge('equipment-save-default-setup-types', params)
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

export async function getEquipmentSetupPresets(
  clubId: string
): Promise<unknown> {
  const { data, error } = await supabase.rpc('equipment_get_setup_presets', {
    p_club_id: clubId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to load equipment setup presets.')
  }

  return data
}

export async function calculateEquipmentCatalogSetupBonusPreview(
  payload: CalculateEquipmentCatalogSetupBonusPreviewPayload
): Promise<unknown> {
  const { data, error } = await supabase.rpc(
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

  if (error) {
    throw new Error(error.message || 'Failed to calculate setup bonus preview.')
  }

  return data
}

export async function saveEquipmentSetupPreset(
  payload: SaveEquipmentSetupPresetPayload
): Promise<unknown> {
  const { data, error } = await supabase.rpc('equipment_save_setup_preset', {
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

  if (error) {
    throw new Error(error.message || 'Failed to save equipment setup preset.')
  }

  return data
}