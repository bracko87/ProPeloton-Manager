/**
 * Player-owned cycling clubs can apply only to ordinary club/team races.
 * National individual championships and national-association selections use
 * their own rider/association entry pipelines, even when race_entry_rules
 * incorrectly says the generic club application window is "open".
 *
 * Keep aligned with public.is_club_application_race_v1 in Supabase.
 */
type RaceEligibilityRecord = {
  category?: string | null
  metadata?: Record<string, unknown> | null
}

const isTrue = (value: unknown): boolean =>
  value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1', 'yes'].includes(value.toLowerCase()))

export function isClubApplicationRestrictedRace(
  race: RaceEligibilityRecord | null | undefined,
): boolean {
  if (!race) return false

  const category = String(race.category ?? '').trim().toUpperCase()
  if (['NC', 'NCQ', 'WNQ', 'WRC', 'NATIONAL ASSOCIATION'].includes(category)) {
    return true
  }

  const metadata = race.metadata ?? {}
  return (
    isTrue(metadata.individual_only) ||
    isTrue(metadata.national_championship) ||
    isTrue(metadata.world_road_championship) ||
    isTrue(metadata.nations_competition) ||
    Boolean(metadata.world_road_championship_edition_id)
  )
}
