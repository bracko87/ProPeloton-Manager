// src/constants/teamRanking.ts

export const TEAM_TIERS = {
  WORLD: 'WORLD',
  PRO: 'PRO',
  CONTINENTAL: 'CONTINENTAL',
  AMATEUR: 'AMATEUR',
} as const

export type TeamTier = (typeof TEAM_TIERS)[keyof typeof TEAM_TIERS]

export const TIER2_DIVISIONS = {
  PRO_WEST: 'PRO_WEST',
  PRO_EAST: 'PRO_EAST',
} as const

export type Tier2Division = (typeof TIER2_DIVISIONS)[keyof typeof TIER2_DIVISIONS]

export const TIER3_DIVISIONS = {
  CONTINENTAL_EUROPE: 'CONTINENTAL_EUROPE',
  CONTINENTAL_AMERICA: 'CONTINENTAL_AMERICA',
  CONTINENTAL_ASIA: 'CONTINENTAL_ASIA',
  CONTINENTAL_AFRICA: 'CONTINENTAL_AFRICA',
  CONTINENTAL_OCEANIA: 'CONTINENTAL_OCEANIA',
} as const

export type Tier3Division = (typeof TIER3_DIVISIONS)[keyof typeof TIER3_DIVISIONS]

export const AMATEUR_DIVISIONS = {
  NORTH_AMERICA: 'NORTH_AMERICA',
  SOUTH_AMERICA: 'SOUTH_AMERICA',
  WESTERN_EUROPE: 'WESTERN_EUROPE',
  CENTRAL_EUROPE: 'CENTRAL_EUROPE',
  SOUTHERN_BALKAN_EUROPE: 'SOUTHERN_BALKAN_EUROPE',
  NORTHERN_EASTERN_EUROPE: 'NORTHERN_EASTERN_EUROPE',
  WEST_NORTH_AFRICA: 'WEST_NORTH_AFRICA',
  CENTRAL_SOUTH_AFRICA: 'CENTRAL_SOUTH_AFRICA',
  WEST_CENTRAL_ASIA: 'WEST_CENTRAL_ASIA',
  SOUTH_ASIA: 'SOUTH_ASIA',
  EAST_SOUTHEAST_ASIA: 'EAST_SOUTHEAST_ASIA',
  OCEANIA: 'OCEANIA',
} as const

export type AmateurDivision =
  (typeof AMATEUR_DIVISIONS)[keyof typeof AMATEUR_DIVISIONS]

export type CompetitionDivision =
  | 'WORLD'
  | Tier2Division
  | Tier3Division
  | AmateurDivision

export const DIVISION_LABELS: Record<CompetitionDivision, string> = {
  WORLD: 'WorldTeam',

  PRO_WEST: 'ProTeam West',
  PRO_EAST: 'ProTeam East',

  CONTINENTAL_EUROPE: 'Continental Europe',
  CONTINENTAL_AMERICA: 'Continental America',
  CONTINENTAL_ASIA: 'Continental Asia',
  CONTINENTAL_AFRICA: 'Continental Africa',
  CONTINENTAL_OCEANIA: 'Continental Oceania',

  NORTH_AMERICA: 'North America',
  SOUTH_AMERICA: 'South America',
  WESTERN_EUROPE: 'Western Europe',
  CENTRAL_EUROPE: 'Central Europe',
  SOUTHERN_BALKAN_EUROPE: 'Southern & Balkan Europe',
  NORTHERN_EASTERN_EUROPE: 'Northern & Eastern Europe',
  WEST_NORTH_AFRICA: 'West & North Africa',
  CENTRAL_SOUTH_AFRICA: 'Central & South Africa',
  WEST_CENTRAL_ASIA: 'West & Central Asia',
  SOUTH_ASIA: 'South Asia',
  EAST_SOUTHEAST_ASIA: 'East & Southeast Asia',
  OCEANIA: 'Oceania',
}

export const DIVISION_CAPACITY = {
  WORLD: { min: 25, max: 25 },

  PRO_WEST: { min: 20, max: 25 },
  PRO_EAST: { min: 20, max: 25 },

  CONTINENTAL_EUROPE: { min: 20, max: 25 },
  CONTINENTAL_AMERICA: { min: 20, max: 25 },
  CONTINENTAL_ASIA: { min: 20, max: 25 },
  CONTINENTAL_AFRICA: { min: 20, max: 25 },
  CONTINENTAL_OCEANIA: { min: 20, max: 25 },

  NORTH_AMERICA: { min: 0, max: null },
  SOUTH_AMERICA: { min: 0, max: null },
  WESTERN_EUROPE: { min: 0, max: null },
  CENTRAL_EUROPE: { min: 0, max: null },
  SOUTHERN_BALKAN_EUROPE: { min: 0, max: null },
  NORTHERN_EASTERN_EUROPE: { min: 0, max: null },
  WEST_NORTH_AFRICA: { min: 0, max: null },
  CENTRAL_SOUTH_AFRICA: { min: 0, max: null },
  WEST_CENTRAL_ASIA: { min: 0, max: null },
  SOUTH_ASIA: { min: 0, max: null },
  EAST_SOUTHEAST_ASIA: { min: 0, max: null },
  OCEANIA: { min: 0, max: null },
} as const

export const AMATEUR_TO_TIER3_DIVISION: Record<AmateurDivision, Tier3Division> = {
  WESTERN_EUROPE: 'CONTINENTAL_EUROPE',
  CENTRAL_EUROPE: 'CONTINENTAL_EUROPE',
  SOUTHERN_BALKAN_EUROPE: 'CONTINENTAL_EUROPE',
  NORTHERN_EASTERN_EUROPE: 'CONTINENTAL_EUROPE',

  NORTH_AMERICA: 'CONTINENTAL_AMERICA',
  SOUTH_AMERICA: 'CONTINENTAL_AMERICA',

  WEST_NORTH_AFRICA: 'CONTINENTAL_AFRICA',
  CENTRAL_SOUTH_AFRICA: 'CONTINENTAL_AFRICA',

  WEST_CENTRAL_ASIA: 'CONTINENTAL_ASIA',
  SOUTH_ASIA: 'CONTINENTAL_ASIA',
  EAST_SOUTHEAST_ASIA: 'CONTINENTAL_ASIA',

  OCEANIA: 'CONTINENTAL_OCEANIA',
}

export const TIER3_TO_TIER2_DIVISION: Record<Tier3Division, Tier2Division> = {
  CONTINENTAL_EUROPE: 'PRO_WEST',
  CONTINENTAL_AMERICA: 'PRO_WEST',
  CONTINENTAL_ASIA: 'PRO_EAST',
  CONTINENTAL_AFRICA: 'PRO_EAST',
  CONTINENTAL_OCEANIA: 'PRO_EAST',
}

export const COUNTRY_TO_AMATEUR_DIVISION: Record<string, AmateurDivision> = {
  US: 'NORTH_AMERICA',
  CA: 'NORTH_AMERICA',
  MX: 'NORTH_AMERICA',
  BS: 'NORTH_AMERICA',
  CU: 'NORTH_AMERICA',
  DO: 'NORTH_AMERICA',
  HT: 'NORTH_AMERICA',
  JM: 'NORTH_AMERICA',
  TT: 'NORTH_AMERICA',
  CR: 'NORTH_AMERICA',
  PA: 'NORTH_AMERICA',
  DM: 'NORTH_AMERICA',
  BB: 'NORTH_AMERICA',

  AR: 'SOUTH_AMERICA',
  BR: 'SOUTH_AMERICA',
  CL: 'SOUTH_AMERICA',
  CO: 'SOUTH_AMERICA',
  PE: 'SOUTH_AMERICA',
  VE: 'SOUTH_AMERICA',
  UY: 'SOUTH_AMERICA',
  PY: 'SOUTH_AMERICA',
  BO: 'SOUTH_AMERICA',

  GB: 'WESTERN_EUROPE',
  IE: 'WESTERN_EUROPE',
  FR: 'WESTERN_EUROPE',
  BE: 'WESTERN_EUROPE',
  NL: 'WESTERN_EUROPE',
  LU: 'WESTERN_EUROPE',
  MC: 'WESTERN_EUROPE',
  ES: 'WESTERN_EUROPE',
  PT: 'WESTERN_EUROPE',
  AD: 'WESTERN_EUROPE',

  DE: 'CENTRAL_EUROPE',
  CH: 'CENTRAL_EUROPE',
  AT: 'CENTRAL_EUROPE',
  LI: 'CENTRAL_EUROPE',
  PL: 'CENTRAL_EUROPE',
  CZ: 'CENTRAL_EUROPE',
  SK: 'CENTRAL_EUROPE',
  HU: 'CENTRAL_EUROPE',

  IT: 'SOUTHERN_BALKAN_EUROPE',
  SM: 'SOUTHERN_BALKAN_EUROPE',
  MT: 'SOUTHERN_BALKAN_EUROPE',
  HR: 'SOUTHERN_BALKAN_EUROPE',
  SI: 'SOUTHERN_BALKAN_EUROPE',
  BA: 'SOUTHERN_BALKAN_EUROPE',
  RS: 'SOUTHERN_BALKAN_EUROPE',
  ME: 'SOUTHERN_BALKAN_EUROPE',
  XK: 'SOUTHERN_BALKAN_EUROPE',
  MK: 'SOUTHERN_BALKAN_EUROPE',
  AL: 'SOUTHERN_BALKAN_EUROPE',
  GR: 'SOUTHERN_BALKAN_EUROPE',
  CY: 'SOUTHERN_BALKAN_EUROPE',
  RO: 'SOUTHERN_BALKAN_EUROPE',
  BG: 'SOUTHERN_BALKAN_EUROPE',
  MD: 'SOUTHERN_BALKAN_EUROPE',

  DK: 'NORTHERN_EASTERN_EUROPE',
  SE: 'NORTHERN_EASTERN_EUROPE',
  NO: 'NORTHERN_EASTERN_EUROPE',
  FI: 'NORTHERN_EASTERN_EUROPE',
  IS: 'NORTHERN_EASTERN_EUROPE',
  EE: 'NORTHERN_EASTERN_EUROPE',
  LV: 'NORTHERN_EASTERN_EUROPE',
  LT: 'NORTHERN_EASTERN_EUROPE',
  UA: 'NORTHERN_EASTERN_EUROPE',
  BY: 'NORTHERN_EASTERN_EUROPE',
  RU: 'NORTHERN_EASTERN_EUROPE',
  GE: 'NORTHERN_EASTERN_EUROPE',
  AM: 'NORTHERN_EASTERN_EUROPE',
  AZ: 'NORTHERN_EASTERN_EUROPE',

  MA: 'WEST_NORTH_AFRICA',
  DZ: 'WEST_NORTH_AFRICA',
  TN: 'WEST_NORTH_AFRICA',
  LY: 'WEST_NORTH_AFRICA',
  EG: 'WEST_NORTH_AFRICA',
  SN: 'WEST_NORTH_AFRICA',
  GM: 'WEST_NORTH_AFRICA',
  GN: 'WEST_NORTH_AFRICA',
  GW: 'WEST_NORTH_AFRICA',
  SL: 'WEST_NORTH_AFRICA',
  LR: 'WEST_NORTH_AFRICA',
  ML: 'WEST_NORTH_AFRICA',
  NE: 'WEST_NORTH_AFRICA',
  BF: 'WEST_NORTH_AFRICA',
  TG: 'WEST_NORTH_AFRICA',
  BJ: 'WEST_NORTH_AFRICA',
  GH: 'WEST_NORTH_AFRICA',
  NG: 'WEST_NORTH_AFRICA',
  CV: 'WEST_NORTH_AFRICA',

  CM: 'CENTRAL_SOUTH_AFRICA',
  CF: 'CENTRAL_SOUTH_AFRICA',
  CG: 'CENTRAL_SOUTH_AFRICA',
  CD: 'CENTRAL_SOUTH_AFRICA',
  GA: 'CENTRAL_SOUTH_AFRICA',
  SD: 'CENTRAL_SOUTH_AFRICA',
  SS: 'CENTRAL_SOUTH_AFRICA',
  ET: 'CENTRAL_SOUTH_AFRICA',
  KE: 'CENTRAL_SOUTH_AFRICA',
  TZ: 'CENTRAL_SOUTH_AFRICA',
  UG: 'CENTRAL_SOUTH_AFRICA',
  RW: 'CENTRAL_SOUTH_AFRICA',
  BI: 'CENTRAL_SOUTH_AFRICA',
  AO: 'CENTRAL_SOUTH_AFRICA',
  NA: 'CENTRAL_SOUTH_AFRICA',
  BW: 'CENTRAL_SOUTH_AFRICA',
  ZA: 'CENTRAL_SOUTH_AFRICA',
  LS: 'CENTRAL_SOUTH_AFRICA',
  SZ: 'CENTRAL_SOUTH_AFRICA',
  ZM: 'CENTRAL_SOUTH_AFRICA',
  ZW: 'CENTRAL_SOUTH_AFRICA',
  MW: 'CENTRAL_SOUTH_AFRICA',
  MZ: 'CENTRAL_SOUTH_AFRICA',
  MG: 'CENTRAL_SOUTH_AFRICA',
  MU: 'CENTRAL_SOUTH_AFRICA',
  SC: 'CENTRAL_SOUTH_AFRICA',

  TR: 'WEST_CENTRAL_ASIA',
  IR: 'WEST_CENTRAL_ASIA',
  IQ: 'WEST_CENTRAL_ASIA',
  SY: 'WEST_CENTRAL_ASIA',
  LB: 'WEST_CENTRAL_ASIA',
  IL: 'WEST_CENTRAL_ASIA',
  PS: 'WEST_CENTRAL_ASIA',
  JO: 'WEST_CENTRAL_ASIA',
  KW: 'WEST_CENTRAL_ASIA',
  QA: 'WEST_CENTRAL_ASIA',
  SA: 'WEST_CENTRAL_ASIA',
  AE: 'WEST_CENTRAL_ASIA',
  OM: 'WEST_CENTRAL_ASIA',
  YE: 'WEST_CENTRAL_ASIA',
  KZ: 'WEST_CENTRAL_ASIA',
  UZ: 'WEST_CENTRAL_ASIA',
  TM: 'WEST_CENTRAL_ASIA',
  KG: 'WEST_CENTRAL_ASIA',
  TJ: 'WEST_CENTRAL_ASIA',

  IN: 'SOUTH_ASIA',
  PK: 'SOUTH_ASIA',
  BD: 'SOUTH_ASIA',
  NP: 'SOUTH_ASIA',
  LK: 'SOUTH_ASIA',

  CN: 'EAST_SOUTHEAST_ASIA',
  JP: 'EAST_SOUTHEAST_ASIA',
  KR: 'EAST_SOUTHEAST_ASIA',
  MN: 'EAST_SOUTHEAST_ASIA',
  TH: 'EAST_SOUTHEAST_ASIA',
  VN: 'EAST_SOUTHEAST_ASIA',
  KH: 'EAST_SOUTHEAST_ASIA',
  LA: 'EAST_SOUTHEAST_ASIA',
  MM: 'EAST_SOUTHEAST_ASIA',
  MY: 'EAST_SOUTHEAST_ASIA',
  SG: 'EAST_SOUTHEAST_ASIA',
  BN: 'EAST_SOUTHEAST_ASIA',
  ID: 'EAST_SOUTHEAST_ASIA',
  PH: 'EAST_SOUTHEAST_ASIA',

  AU: 'OCEANIA',
  NZ: 'OCEANIA',
  FJ: 'OCEANIA',
  WS: 'OCEANIA',
  PG: 'OCEANIA',
  NC: 'OCEANIA',
  TO: 'OCEANIA',
}

export const WORLD_RULES = {
  teamLimit: 25,
  relegated: 5,
} as const

export const TIER2_RULES = {
  directPromotionToWorld: {
    PRO_WEST: 1,
    PRO_EAST: 1,
  },
  playoffEligibleRanks: [2, 3, 4] as const,
  playoffPromotionToWorld: 3,
  relegatedPerDivision: 5,
} as const

export const TIER3_RULES = {
  directPromotionToTier2: {
    CONTINENTAL_EUROPE: 1,
    CONTINENTAL_AMERICA: 1,
    CONTINENTAL_ASIA: 1,
    CONTINENTAL_AFRICA: 1,
    CONTINENTAL_OCEANIA: 1,
  },
  playoffEligibleRanks: [2, 3, 4] as const,
  playoffPromotionToTier2: {
    PRO_WEST: 3,
    PRO_EAST: 2,
  },
  relegatedToAmateur: {
    CONTINENTAL_EUROPE: 6,
    CONTINENTAL_AMERICA: 5,
    CONTINENTAL_ASIA: 6,
    CONTINENTAL_AFRICA: 5,
    CONTINENTAL_OCEANIA: 3,
  },
} as const

export const TIER4_RULES = {
  europe: {
    divisions: [
      'WESTERN_EUROPE',
      'CENTRAL_EUROPE',
      'SOUTHERN_BALKAN_EUROPE',
      'NORTHERN_EASTERN_EUROPE',
    ] as const,
    directPromoted: 4,
    playoffEligibleRanks: [2, 3] as const,
    playoffPromoted: 2,
    targetTier3: 'CONTINENTAL_EUROPE' as const,
  },
  america: {
    divisions: ['NORTH_AMERICA', 'SOUTH_AMERICA'] as const,
    directPromoted: 2,
    playoffEligibleRanks: [2, 3, 4] as const,
    playoffPromoted: 3,
    targetTier3: 'CONTINENTAL_AMERICA' as const,
  },
  africa: {
    divisions: ['WEST_NORTH_AFRICA', 'CENTRAL_SOUTH_AFRICA'] as const,
    directPromoted: 2,
    playoffEligibleRanks: [2, 3, 4] as const,
    playoffPromoted: 3,
    targetTier3: 'CONTINENTAL_AFRICA' as const,
  },
  asia: {
    divisions: ['WEST_CENTRAL_ASIA', 'SOUTH_ASIA', 'EAST_SOUTHEAST_ASIA'] as const,
    directPromoted: 3,
    playoffEligibleRanks: [2, 3, 4] as const,
    playoffPromoted: 3,
    targetTier3: 'CONTINENTAL_ASIA' as const,
  },
  oceania: {
    divisions: ['OCEANIA'] as const,
    directPromoted: 3,
    playoffEligibleRanks: [] as const,
    playoffPromoted: 0,
    targetTier3: 'CONTINENTAL_OCEANIA' as const,
  },
} as const

export type TeamRankingRecord = {
  id: string
  name: string
  country: string
  tier: TeamTier
  tier2Division?: Tier2Division | null
  tier3Division?: Tier3Division | null
  amateurDivision: AmateurDivision | null
  seasonPoints: number
  overallRank: number | null
  tierRank: number | null
  divisionRank: number | null
  createdAt: string
  logoPath?: string | null
  isAi?: boolean
  isActive?: boolean
}

export function getAmateurDivisionByCountry(countryCode: string): AmateurDivision {
  const normalized = countryCode.trim().toUpperCase()
  const division = COUNTRY_TO_AMATEUR_DIVISION[normalized]

  if (!division) {
    throw new Error(`No amateur division configured for country code "${countryCode}"`)
  }

  return division
}

export function getTier3DivisionByAmateurDivision(
  amateurDivision: AmateurDivision,
): Tier3Division {
  return AMATEUR_TO_TIER3_DIVISION[amateurDivision]
}

export function getTier2DivisionByTier3Division(
  tier3Division: Tier3Division,
): Tier2Division {
  return TIER3_TO_TIER2_DIVISION[tier3Division]
}