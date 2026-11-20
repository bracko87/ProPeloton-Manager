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
export const FEATURE_IMAGES: Partial<Record<FeatureKey, ReadonlyArray<{ src: string; alt: string }>>> = {
  management: [
    { src: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Deep%20team%20management%202.png', alt: 'Deep team management — gameplay screenshot 1' },
    { src: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Deep%20team%20management%203.png', alt: 'Deep team management — gameplay screenshot 2' },
    { src: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Deep%20team%20management%20banner.png', alt: 'Deep team management — gameplay screenshot 3' },
  ],
}


/**
 * Optional, feature-specific header image. Add the URL supplied by the developer
 * under its feature key when it becomes available. No placeholder stock photos.
 * Example: management: { src: '<owner-supplied URL>', position: 'center 40%' }
 */
export type FeatureBackground = { src: string; position?: string }
export const FEATURE_BACKGROUNDS: Partial<Record<FeatureKey, FeatureBackground>> = {
  management: {
    src: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Deep%20team%20management%201.png',
    position: 'center',
  },
}
