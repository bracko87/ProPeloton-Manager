export type InfrastructureVisualAssetKey =
  | 'team_car'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

/**
 * Central visual catalogue for purchasable infrastructure assets.
 *
 * Add new URLs here as artwork becomes available. Missing entries intentionally
 * resolve to null so the catalogue UI can render its safe visual fallback.
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
}

export function getInfrastructureAssetImageUrl(
  assetKey: InfrastructureVisualAssetKey,
  assetLevel: number,
): string | null {
  return infrastructureAssetImageUrls[assetKey]?.[assetLevel] ?? null
}
