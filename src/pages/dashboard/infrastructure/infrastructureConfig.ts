/**
 * infrastructureConfig.ts
 * Central configuration and static metadata for the Infrastructure dashboard.
 *
 * Contains:
 * - Facility and asset constants (names, limits, labels).
 * - Helper config for mapping infrastructure DB rows into UI values.
 * - Image URLs and role label maps used by facilities and assets sections.
 */

import type {
  AssetKey,
  AssetSubTabKey,
  ClubInfrastructureRow,
  FacilityImpactKind,
  FacilityKey,
  StaffRole,
} from './infrastructureTypes'

/**
 * FACILITY_MAX_LEVEL
 * Default maximum level for most facilities unless overridden per-facility.
 */
export const FACILITY_MAX_LEVEL = 5

/**
 * DEFAULT_CURRENCY
 * Currency label used for displaying infrastructure-related costs.
 */
export const DEFAULT_CURRENCY = 'USD'

/**
 * assetSubTabs
 * Sub-tab configuration for the Assets section.
 */
export const assetSubTabs: Array<{
  key: AssetSubTabKey
  label: string
}> = [
  { key: 'team_cars', label: 'Team Cars' },
  { key: 'team_bus', label: 'Team Bus' },
  { key: 'equipment_van', label: 'Equipment Van' },
  { key: 'mobile_workshop', label: 'Mobile Workshop' },
  { key: 'medical_van', label: 'Medical Van' },
]

/**
 * facilityConfig
 * Per-facility configuration for the Facilities section.
 * Defines how to read the current level from ClubInfrastructureRow and how
 * the facility impacts gameplay.
 */
export const facilityConfig: Array<{
  id: FacilityKey
  name: string
  description: string
  longDescription: string
  getValue: (row: ClubInfrastructureRow) => number
  maxValue: number
  impactKind: FacilityImpactKind
}> = [
  {
    id: 'club_house',
    name: 'Club House',
    description: 'Main administrative headquarters of your cycling team.',
    longDescription:
      'The Club House is the core operational base of the team. It supports administration, club organization, and future business growth. Higher levels help unlock broader staff structure and future management systems.',
    getValue: (row) => row.hq_level,
    maxValue: FACILITY_MAX_LEVEL,
    impactKind: 'club',
  },
  {
    id: 'training_center',
    name: 'Training Center',
    description: 'Core training base for rider development and daily coaching work.',
    longDescription:
      'The Training Center improves the effectiveness of coaching staff and supports rider training quality, development support, and overload-risk management. Higher levels also expand trainer capacity.',
    getValue: (row) => row.training_center_level,
    maxValue: FACILITY_MAX_LEVEL,
    impactKind: 'coaching',
  },
  {
    id: 'medical_center',
    name: 'Medical Center',
    description: 'Medical facility for prevention, treatment, recovery, and rider health.',
    longDescription:
      'The Medical Center supports Team Doctors, Physios, and Nutritionists. It reduces harsh medical limitations, improves injury prevention and recovery support, and expands medical staff capacity.',
    getValue: (row) => row.medical_center_level,
    maxValue: FACILITY_MAX_LEVEL,
    impactKind: 'medical',
  },
  {
    id: 'youth_academy',
    name: 'Youth Academy',
    description: 'Long-term development facility for future riders and youth progression.',
    longDescription:
      'The Youth Academy is a strategic long-term investment. It supports youth development systems, unlocks the U23 Head Coach role, and later improves training and development for U23 riders.',
    getValue: (row) => row.youth_academy_level,
    maxValue: 2,
    impactKind: 'youth',
  },
  {
    id: 'mechanics_workshop',
    name: 'Mechanics Workshop',
    description: 'Technical operations base for equipment maintenance and support.',
    longDescription:
      'The Mechanics Workshop improves technical support capacity and prepares the club for deeper equipment systems, repair speed, and maintenance cost reductions. Higher levels unlock additional mechanic slots.',
    getValue: (row) => row.mechanics_workshop_level,
    maxValue: 4,
    impactKind: 'mechanics',
  },
  {
    id: 'scouting_office',
    name: 'Scouting Office',
    description:
      'Scouting and intelligence center for reports, market information, and talent discovery.',
    longDescription:
      'The Scouting Office controls scouting report quality cap, scouting capacity, and later market intelligence systems. Higher levels unlock more scout slots and better report-quality ceilings.',
    getValue: (row) => row.scouting_level,
    maxValue: 4,
    impactKind: 'scouting',
  },
]

/**
 * assetConfig
 * Per-asset configuration for the Assets section.
 * Defines how to read current quantities from ClubInfrastructureRow.
 */
export const assetConfig: Array<{
  id: AssetKey
  name: string
  description: string
  getValue: (row: ClubInfrastructureRow) => number
}> = [
  {
    id: 'team_car_fleet',
    name: 'Team Car Fleet',
    description: 'Race support cars for events and logistics.',
    getValue: (row) => row.team_car_fleet_quantity,
  },
  {
    id: 'team_bus',
    name: 'Team Bus',
    description: 'Transport for riders and staff.',
    getValue: (row) => row.team_bus_quantity,
  },
  {
    id: 'equipment_van',
    name: 'Equipment Van',
    description: 'Carries bikes, spare parts and race equipment.',
    getValue: (row) => row.equipment_van_quantity,
  },
  {
    id: 'mobile_workshop',
    name: 'Mobile Workshop',
    description: 'Portable technical support for repairs and maintenance.',
    getValue: (row) => row.mobile_workshop_quantity,
  },
  {
    id: 'medical_van',
    name: 'Medical Van',
    description: 'Mobile medical support for the team.',
    getValue: (row) => row.medical_van_quantity,
  },
]

/**
 * facilityNameMap
 * Human-readable labels for facility keys.
 */
export const facilityNameMap: Record<FacilityKey, string> = {
  club_house: 'Club House',
  training_center: 'Training Center',
  medical_center: 'Medical Center',
  scouting_office: 'Scouting Office',
  youth_academy: 'Youth Academy',
  mechanics_workshop: 'Mechanics Workshop',
}

/**
 * assetNameMap
 * Human-readable labels for asset keys.
 */
export const assetNameMap: Record<AssetKey, string> = {
  team_car_fleet: 'Team Car Fleet',
  team_bus: 'Team Bus',
  equipment_van: 'Equipment Van',
  mobile_workshop: 'Mobile Workshop',
  medical_van: 'Medical Van',
}

/**
 * facilityImageUrls
 * Static image URLs for facilities. Used for richer cards in the UI.
 */
export const facilityImageUrls: Partial<Record<FacilityKey, string>> = {
  club_house:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Club%20House.png',
  training_center:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Training%20Center.png',
  medical_center:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Medical%20Center.png',
  scouting_office:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Scouting%20Office.png',
  youth_academy:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Youth%20Academy.png',
  mechanics_workshop:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Infrastructure/Mechanics%20Workshop.png',
}

/**
 * roleLabelMap
 * Human-readable labels for staff roles used within infrastructure context.
 */
export const roleLabelMap: Record<StaffRole, string> = {
  head_coach: 'Head Coach',
  trainer: 'Trainer',
  u23_head_coach: 'U23 Head Coach',
  team_doctor: 'Team Doctor',
  physio: 'Physio',
  nutritionist: 'Nutritionist',
  mechanic: 'Mechanic',
  sport_director: 'Sport Director',
  scout_analyst: 'Scout / Analyst',
}