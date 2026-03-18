/**
 * src/lib/clubContext.ts
 *
 * Helper utilities to load a user's club context (main + developing club).
 *
 * Purpose:
 * - Provide a single source for resolving the current user's main and developing
 *   club rows in a compact shape suitable for UI consumption.
 * - Keep backend club shapes internal and return a small, well-typed context.
 */

import { supabase } from '@/lib/supabase'

/**
 * MainClub
 *
 * Public-facing shape for the user's main club used in layouts and headers.
 */
export type MainClub = {
  id: string
  name: string
  country_code: string
  logo_path?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  club_type: 'main'
}

/**
 * DevelopingClub
 *
 * Public-facing shape for a developing / under-construction club.
 */
export type DevelopingClub = {
  id: string
  name: string
  country_code: string
  parent_club_id: string
  club_type: 'developing'
}

/**
 * ClubContext
 *
 * Aggregated context containing the user's main club and (optional)
 * developing club. Both keys will be null when the user has no clubs.
 */
export type ClubContext = {
  mainClub: MainClub | null
  developingClub: DevelopingClub | null
}

/**
 * getMyClubContext
 *
 * Fetch the authenticated user's clubs and return a compact ClubContext.
 *
 * Behavior:
 * - If the user is not authenticated, returns { mainClub: null, developingClub: null }.
 * - Throws when Supabase auth or query errors occur so callers can surface errors.
 *
 * @returns Promise<ClubContext>
 */
export async function getMyClubContext(): Promise<ClubContext> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user?.id) {
    return { mainClub: null, developingClub: null }
  }

  const { data, error } = await supabase
    .from('clubs')
    .select(
      `
      id,
      name,
      country_code,
      logo_path,
      primary_color,
      secondary_color,
      club_type,
      parent_club_id
    `,
    )
    .eq('owner_user_id', user.id)
    .in('club_type', ['main', 'developing'])
    .order('created_at', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as any[]

  const mainRow = rows.find(c => c.club_type === 'main') ?? null
  const developingRow = rows.find(c => c.club_type === 'developing') ?? null

  return {
    mainClub: mainRow
      ? {
          id: mainRow.id,
          name: mainRow.name,
          country_code: mainRow.country_code,
          logo_path: mainRow.logo_path ?? null,
          primary_color: mainRow.primary_color ?? null,
          secondary_color: mainRow.secondary_color ?? null,
          club_type: 'main',
        }
      : null,
    developingClub: developingRow
      ? {
          id: developingRow.id,
          name: developingRow.name,
          country_code: developingRow.country_code,
          parent_club_id: developingRow.parent_club_id,
          club_type: 'developing',
        }
      : null,
  }
}