/** Public-facing feature catalogue. Add user-provided screenshots in FEATURE_IMAGES when supplied. */
export const FEATURE_KEYS = [
  'management', 'squads', 'staff', 'training', 'growth', 'calendar',
  'preparation', 'tiers', 'equipment', 'assets', 'finance', 'sponsors',
  'operations', 'transfers', 'national', 'academy', 'replay', 'progression',
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]

export function isFeatureKey(value: string | undefined): value is FeatureKey {
  return FEATURE_KEYS.some(key => key === value)
}

/** Only these optional programmes require Premium AND seasonal Coins.
 * The senior squad and ordinary management systems remain available without the add-on.
 */
export const FEATURE_PAID_ADDONS: Partial<Record<FeatureKey, 'u23' | 'academy'>> = {
  squads: 'u23',
  academy: 'academy',
}

/** Screenshots must come from the game owner. No stock or fabricated gameplay imagery. */
export const FEATURE_IMAGES: Partial<Record<FeatureKey, ReadonlyArray<{ src: string; alt: string }>>> = {}


/**
 * Optional, feature-specific header image. Add the URL supplied by the developer
 * under its feature key when it becomes available. No placeholder stock photos.
 * Example: management: { src: '<owner-supplied URL>', position: 'center 40%' }
 */
export type FeatureBackground = { src: string; position?: string }
export const FEATURE_BACKGROUNDS: Partial<Record<FeatureKey, FeatureBackground>> = {}
