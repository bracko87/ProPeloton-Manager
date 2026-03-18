import { getMyClubContext } from '@/lib/clubContext'

export type ClubScope = 'main' | 'selected'

export type ResolvedClub = {
  id: string
  owner_user_id: string
  name: string
  country_code: string
  primary_color: string
  secondary_color: string
  logo_path: string | null
  club_type?: 'main' | 'development' | 'u23' | string
  parent_club_id?: string | null
}

export type ResolvedClubContext = {
  mainClub: ResolvedClub
  selectedClub: ResolvedClub
  pageClub: ResolvedClub
  scope: ClubScope
  isMainScope: boolean
  isSelectedScope: boolean
}

export type ResolvedClubIds = {
  mainClubId: string
  selectedClubId: string
  pageClubId: string
}

export async function resolveClubScope(scope: ClubScope): Promise<ResolvedClubContext> {
  const { mainClub, activeClub } = await getMyClubContext()

  if (!mainClub) {
    throw new Error('Main club not found.')
  }

  const selectedClub = activeClub ?? mainClub
  const pageClub = scope === 'main' ? mainClub : selectedClub

  return {
    mainClub,
    selectedClub,
    pageClub,
    scope,
    isMainScope: scope === 'main',
    isSelectedScope: scope === 'selected',
  }
}

export async function resolveClubIds(scope: ClubScope): Promise<ResolvedClubIds> {
  const resolved = await resolveClubScope(scope)

  return {
    mainClubId: resolved.mainClub.id,
    selectedClubId: resolved.selectedClub.id,
    pageClubId: resolved.pageClub.id,
  }
}