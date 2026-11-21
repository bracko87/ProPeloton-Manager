/** Public game features. The homepage and all text-only detail pages share these stable IDs. */
export const FEATURE_KEYS = [
  'management', 'squads', 'staff', 'training', 'growth',
  'calendar', 'preparation', 'tiers', 'equipment', 'assets',
  'finance', 'sponsors', 'operations', 'transfers', 'national',
  'academy', 'replay', 'progression', 'health', 'multiplayer',
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]

export function isFeatureKey(value: string | undefined): value is FeatureKey {
  return FEATURE_KEYS.some(key => key === value)
}

/** Add-on programme notices are shown on the detail pages, not homepage cards.
 * Access to the senior squad remains part of the basic game.
 */
export const FEATURE_PAID_ADDONS: Partial<Record<FeatureKey, 'u23' | 'academy'>> = {
  squads: 'u23',
  academy: 'academy',
}
