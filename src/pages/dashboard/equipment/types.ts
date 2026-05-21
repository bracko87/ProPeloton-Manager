/**
 * equipment/types.ts
 * Shared type definitions for the Equipment dashboard, including tabs, categories,
 * inventory items, market items, race supplies, and RPC response shapes.
 */

/**
 * EquipmentTabKey
 * Available tabs in the equipment dashboard.
 */
export type EquipmentTabKey =
  | 'overview'
  | 'inventory'
  | 'market'
  | 'race_supplies'

/**
 * EquipmentCategory
 * Supported equipment categories for durable items.
 */
export type EquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

/**
 * RaceSupplyKey
 * Keys for consumable race supplies.
 */
export type RaceSupplyKey =
  | 'bidons_water_bottles'
  | 'energy_gels'
  | 'nutrition_packs'
  | 'race_jersey_complete'
  | 'rain_jackets'

/**
 * EquipmentStatus
 * Lifecycle status values for equipment items.
 */
export type EquipmentStatus =
  | 'ready'
  | 'assigned'
  | 'in_maintenance'
  | 'worn'
  | 'sold'
  | 'discarded'

/**
 * EquipmentDashboard
 * Aggregate dashboard view returned by the equipment overview RPC.
 */
export type EquipmentDashboard = {
  club_id: string
  overall: {
    total_items: number
    ready_items: number
    avg_condition: number
    critical_items: number
    maintenance_needed: number
    overall_readiness_pct: number
  }
  category_summary: EquipmentCategorySummary[]
  maintenance_summary: {
    pending_jobs: number
    completed_jobs: number
    critical_items: number
    maintenance_needed: number
  }
  race_supplies_summary: RaceSupplySummary[]
  default_setup: EquipmentDefaultSetup
  technical_sponsor: TechnicalSponsor | null
  support_effects: {
    mechanics_workshop_level: number
    notes?: string[]
  }
}

/**
 * EquipmentCategorySummary
 * Per-category rollup of equipment counts and condition metrics.
 */
export type EquipmentCategorySummary = {
  equipment_category: EquipmentCategory
  label: string
  owned_count: number
  ready_count: number
  assigned_count: number
  maintenance_count: number
  avg_condition: number
}

/**
 * EquipmentDefaultSetupItem
 * Single item entry in the default race setup; nullable when not configured.
 */
export type EquipmentDefaultSetupItem = {
  id: string
  display_name: string
  condition_percent: number | string
} | null

/**
 * EquipmentDefaultSetup
 * The configured default race setup across all equipment categories.
 */
export type EquipmentDefaultSetup = {
  setup_name: string
  frame: EquipmentDefaultSetupItem
  wheelset: EquipmentDefaultSetupItem
  tires: EquipmentDefaultSetupItem
  groupset: EquipmentDefaultSetupItem
  helmet: EquipmentDefaultSetupItem
  shoes: EquipmentDefaultSetupItem
}

/**
 * TechnicalSponsor
 * Details about the club's technical sponsor and discount effects.
 */
export type TechnicalSponsor = {
  club_sponsor_id: string
  company_id: string
  name: string
  logo_url: string | null
  technical_discount_pct: number
  metadata?: Record<string, unknown>
}

/**
 * RaceSupplySummary
 * Summary of race supply availability and usage per supply key.
 */
export type RaceSupplySummary = {
  supply_key: RaceSupplyKey
  display_name: string
  quantity_available: number
  total_purchased: number
  total_used: number
  stock_status: 'empty' | 'low' | 'ok' | string
}

/**
 * EquipmentInventoryItem
 * Durable equipment item stored in the club inventory.
 */
export type EquipmentInventoryItem = {
  id: string
  club_id: string
  catalog_item_id: string
  item_key?: string
  equipment_category: EquipmentCategory
  display_name: string
  brand_company_id: string | null
  brand_name?: string | null
  quality_score: number
  durability_score: number
  condition_percent: number | string
  status: EquipmentStatus
  purchase_cost_cash: number
  current_value_cash: number
  total_race_days: number
  total_distance_km: number | string
  assigned_rider_id: string | null
  assigned_rider_name?: string | null
  acquired_game_date: string | null
  last_used_game_date: string | null
  sold_game_date: string | null
  discarded_game_date: string | null
  used_in_default_setup?: boolean
  effects?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * EquipmentMarketItem
 * Catalog/market entry for an equipment or race supply item.
 */
export type EquipmentMarketItem = {
  id: string
  item_key: string
  display_name: string
  equipment_kind: 'durable' | 'race_supply'
  equipment_category: EquipmentCategory | RaceSupplyKey
  brand_company_id: string | null
  brand_name: string | null
  brand_country_code?: string | null
  tier: number
  quality_score: number
  durability_score: number
  base_price_cash: number
  effective_price_cash: number
  technical_discount_pct: number
  condition_loss_per_race_day: number | string
  maintenance_cost_per_condition_point: number
  maintenance_points_per_game_day: number | string
  resale_pct: number | string
  effects: Record<string, unknown>
  metadata: Record<string, unknown>
  is_active: boolean
}

/**
 * RaceSupplyItem
 * Inventory entry for a specific race supply.
 */
export type RaceSupplyItem = {
  catalog_item_id: string | null
  item_key: string | null
  supply_key: RaceSupplyKey
  display_name: string
  brand_name: string | null
  base_price_cash: number | null
  quantity_available: number
  total_purchased: number
  total_used: number
  last_purchased_game_date: string | null
  last_used_game_date: string | null
  effects?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * RpcListResponse
 * Generic RPC response wrapper for paginated lists.
 */
export type RpcListResponse<T> = {
  club_id: string
  total_count: number
  items: T[]
  filters?: Record<string, unknown>
}

/**
 * RaceSuppliesResponse
 * RPC response shape for race supplies list queries.
 */
export type RaceSuppliesResponse = {
  club_id: string
  items: RaceSupplyItem[]
}

/**
 * MarketResponse
 * RPC response shape for equipment market queries.
 */
export type MarketResponse = RpcListResponse<EquipmentMarketItem> & {
  technical_sponsor: TechnicalSponsor | null
}

/**
 * QuoteSaleResponse
 * RPC response for quoting sale value of an inventory item.
 */
export type QuoteSaleResponse = {
  club_id: string
  inventory_item_id: string
  display_name: string
  equipment_category: EquipmentCategory
  status: EquipmentStatus
  condition_percent: number | string
  purchase_cost_cash: number
  sale_value_cash: number
  can_sell: boolean
  reason: string | null
}

/**
 * QuoteMaintenanceResponse
 * RPC response for quoting maintenance of an inventory item.
 */
export type QuoteMaintenanceResponse = {
  club_id: string
  inventory_item_id: string
  display_name: string
  equipment_category: EquipmentCategory
  status: EquipmentStatus
  condition_percent: number | string
  missing_condition: number
  condition_after: number
  maintenance_cost_cash: number
  duration_game_days: number
  can_maintain: boolean
  reason: string | null
}

/**
 * EquipmentDefaultSetupOption
 * Single selectable catalog item option for default equipment setup.
 */
export type EquipmentDefaultSetupOption = {
  catalog_item_id: string
  item_key: string
  display_name: string
  brand_name: string | null
  quality_score: number
  owned_count: number
  available_count: number
  unavailable_count: number
  avg_condition: number | string
  label: string
}

/**
 * EquipmentDefaultSetupCategoryOption
 * Category-level default setup options, including selected and recommended items.
 */
export type EquipmentDefaultSetupCategoryOption = {
  equipment_category: EquipmentCategory
  label: string
  selected_catalog_item_id: string | null
  recommended_catalog_item_id: string | null
  options: EquipmentDefaultSetupOption[]
}

/**
 * EquipmentDefaultSetupOptionsResponse
 * RPC response shape for default setup option queries.
 */
export type EquipmentDefaultSetupOptionsResponse = {
  club_id: string
  categories: EquipmentDefaultSetupCategoryOption[]
}