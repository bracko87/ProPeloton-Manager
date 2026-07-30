/**
 * RiderEquipment.ts
 *
 * Immutable authoritative rider-equipment snapshot transported into one
 * deterministic stage input.
 *
 * The contract combines:
 * - physical equipment condition from
 *   race_engine_resolve_stage_rider_equipment_condition_v1;
 * - preparation-derived mechanical modifiers from
 *   race_engine_get_stage_rider_preparation_modifiers_v2.
 *
 * It contains no equipment writer, wear mutation, maintenance action, or
 * technical-incident outcome.
 */

export type StageRiderEquipmentConditionSource =
  'race_engine_resolve_stage_rider_equipment_condition_v1'

export type StageRiderEquipmentPreparationSource =
  'race_engine_get_stage_rider_preparation_modifiers_v2'

export type StageRiderEquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

export interface StageRiderEquipmentInput {
  readonly conditionSource:
    StageRiderEquipmentConditionSource

  readonly preparationSource:
    StageRiderEquipmentPreparationSource

  readonly equipmentSetupId:
    string | null

  readonly selectedComponentCount:
    number

  readonly matchedComponentCount:
    number

  readonly completeSource:
    boolean

  readonly minimumConditionPercent:
    number | null

  /**
   * Authoritative effective condition used by technical-incident risk.
   *
   * Complete source:
   * minimum condition across the six selected physical components.
   *
   * Incomplete source:
   * neutral 100 according to the existing database missing-source policy.
   */
  readonly effectiveConditionPercent:
    number

  readonly missingComponentCategories:
    readonly StageRiderEquipmentCategory[]

  /**
   * Final preparation-derived probability multiplier.
   *
   * The TypeScript engine transports this value and must not reconstruct the
   * preparation formula from mechanic staff, infrastructure, or support data.
   */
  readonly mechanicalIncidentRiskMultiplier:
    number

  /**
   * Final preparation-derived time-loss multiplier.
   *
   * Stored now for the later technical-outcome phase. Phase 8H.4B does not
   * apply technical time loss.
   */
  readonly mechanicalTimeLossMultiplier:
    number
}
