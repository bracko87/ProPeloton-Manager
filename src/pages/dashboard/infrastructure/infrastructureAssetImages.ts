export type InfrastructureVisualAssetKey =
  | 'team_car'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

/**
 * Central visual catalogue for purchasable infrastructure assets.
 *
 * Asset artwork is intentionally mapped directly in code so the catalogue and
 * detail views always know which image belongs to a specific asset type/level.
 * Missing entries resolve to null and are handled by the UI fallback.
 */
const infrastructureAssetImageUrls: Partial<
  Record<InfrastructureVisualAssetKey, Record<number, string>>
> = {
  team_car: {
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%201.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%202.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%203.png',
    4: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%204.png',
    5: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%205.png',
  },
  team_bus: {
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl1.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl2.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl3.png',
  },
  equipment_van: {
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl1.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl2.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl3.png',
  },
  mobile_workshop: {
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Mobile%20Workshops%20lvl%201.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Mobile%20Workshops%20lvl%202.png',
  },
  medical_van: {
    1: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl1.png',
    2: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl%202.png',
    3: 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl%203.png',
  },
}

export function getInfrastructureAssetImageUrl(
  assetKey: InfrastructureVisualAssetKey,
  assetLevel: number,
): string | null {
  return infrastructureAssetImageUrls[assetKey]?.[assetLevel] ?? null
}
