/**
 * Explicit Mountain V2 stage registry.
 *
 * This is NOT the V1 pilot list and it is NOT an automatic "all mountains"
 * setting. Stage IDs are opt-in, road/mountain only. V2 currently has no
 * authority to replace the official engine, even for a stage listed here.
 *
 * Do not allow a calendar name, country, profile type, category, difficulty,
 * date or terrain alone to activate Mountain V2.
 */
export type MountainV2StageSelectionInput = {
  readonly stageId: string
  readonly stageFormat: string
  readonly terrainType: string
}

export interface MountainV2StageRegistryEntry {
  readonly stageId: string
  readonly race: string
  readonly stage: string
  readonly gameDate: string
  readonly mode: 'sandbox_shadow_only'
  readonly rationale: string
}

/** Selection is BY STAGE, not by entire race. */
export const MOUNTAIN_V2_STAGE_REGISTRY: readonly MountainV2StageRegistryEntry[] = [
  {
    stageId: 'be7ce2aa-ec52-4b6b-a6c6-48bfab89ab9b',
    race: 'Montenegro Tour',
    stage: 'Stage 3: Durmitor Finale',
    gameDate: '2000-10-03',
    mode: 'sandbox_shadow_only',
    rationale: '96-rider real-route pilot, 1875/2150 m sampled climbing; V2 synthetic regression fixture.',
  },
  {
    stageId: '1c4b77a8-5102-40c9-bf0d-8695b0deb877',
    race: 'GP Urubici Ciclismo',
    stage: 'GP Urubici Ciclismo',
    gameDate: '2000-10-04',
    mode: 'sandbox_shadow_only',
    rationale: 'Second mountain climbing/descending control case, 23 route samples, 108 registered riders.',
  },
  {
    stageId: '0885f370-5082-4bbe-994f-3938f00b7b11',
    race: 'Trofeo Tessile & Moda - Valdengo-Oropa',
    stage: 'Valdengo-Oropa summit finish',
    gameDate: '2000-10-12',
    mode: 'sandbox_shadow_only',
    rationale: 'Summit-finish test with 46 sampled profile points; awaiting an actual registered field.',
  },
] as const

const registry = new Map(MOUNTAIN_V2_STAGE_REGISTRY.map(row => [row.stageId, row]))
if (registry.size !== MOUNTAIN_V2_STAGE_REGISTRY.length) {
  throw new Error('Duplicate Mountain V2 stage registry ID')
}

export type MountainV2Selection =
  | { readonly mode: 'baseline_universal'; readonly stageId: string; readonly reason: 'not_listed' | 'not_mountain_road_race' }
  | { readonly mode: 'sandbox_shadow_only'; readonly stageId: string; readonly stage: MountainV2StageRegistryEntry; readonly authoritative: false }

export function selectMountainV2Stage(
  stage: MountainV2StageSelectionInput,
): MountainV2Selection {
  const stageId = stage.stageId.toLowerCase()
  if (stage.stageFormat !== 'road_race' || stage.terrainType !== 'mountain') {
    return { mode: 'baseline_universal', stageId, reason: 'not_mountain_road_race' }
  }
  const entry = registry.get(stageId)
  if (!entry) return { mode: 'baseline_universal', stageId, reason: 'not_listed' }
  return { mode: 'sandbox_shadow_only', stageId, stage: entry, authoritative: false }
}

/** No V2 stages can write an official race result until a distinct, reviewed
 * authoritative adapter, replay and scoring contract have passed acceptance.
 * Adding a row to the above registry cannot bypass this gate.
 */
export function canMountainV2WriteOfficialResults(
  _stage: MountainV2StageSelectionInput,
): false {
  return false
}
