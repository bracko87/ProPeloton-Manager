import {
  AMATEUR_DIVISIONS,
  AMATEUR_TO_TIER3_DIVISION,
  COUNTRY_TO_AMATEUR_DIVISION,
  TIER2_DIVISIONS,
  TIER3_DIVISIONS,
  TIER3_TO_TIER2_DIVISION,
} from './teamRanking'

export function validateTeamRankingConfig(): void {
  const amateurDivisionValues = new Set(Object.values(AMATEUR_DIVISIONS))
  const tier3DivisionValues = new Set(Object.values(TIER3_DIVISIONS))
  const tier2DivisionValues = new Set(Object.values(TIER2_DIVISIONS))

  for (const [countryCode, amateurDivision] of Object.entries(COUNTRY_TO_AMATEUR_DIVISION)) {
    if (!amateurDivisionValues.has(amateurDivision)) {
      throw new Error(
        `Invalid amateur division "${amateurDivision}" configured for country "${countryCode}"`,
      )
    }
  }

  for (const [amateurDivision, tier3Division] of Object.entries(AMATEUR_TO_TIER3_DIVISION)) {
    if (!amateurDivisionValues.has(amateurDivision as (typeof AMATEUR_DIVISIONS)[keyof typeof AMATEUR_DIVISIONS])) {
      throw new Error(
        `Invalid amateur division "${amateurDivision}" in AMATEUR_TO_TIER3_DIVISION`,
      )
    }

    if (!tier3DivisionValues.has(tier3Division)) {
      throw new Error(
        `Invalid tier3 division "${tier3Division}" mapped from amateur division "${amateurDivision}"`,
      )
    }
  }

  for (const [tier3Division, tier2Division] of Object.entries(TIER3_TO_TIER2_DIVISION)) {
    if (!tier3DivisionValues.has(tier3Division as (typeof TIER3_DIVISIONS)[keyof typeof TIER3_DIVISIONS])) {
      throw new Error(`Invalid tier3 division "${tier3Division}" in TIER3_TO_TIER2_DIVISION`)
    }

    if (!tier2DivisionValues.has(tier2Division)) {
      throw new Error(
        `Invalid tier2 division "${tier2Division}" mapped from tier3 division "${tier3Division}"`,
      )
    }
  }

  if (Object.keys(COUNTRY_TO_AMATEUR_DIVISION).length === 0) {
    throw new Error('COUNTRY_TO_AMATEUR_DIVISION must not be empty')
  }
}