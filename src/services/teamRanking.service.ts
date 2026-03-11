import { TeamRankingRecord } from '../constants/teamRanking'
import { supabase } from '../lib/supabase'

type ClubRankingRow = {
  id: string
  name: string
  country_code: string
  club_tier: string
  tier2_division: TeamRankingRecord['tier2Division'] | null
  tier3_division: TeamRankingRecord['tier3Division'] | null
  amateur_division: TeamRankingRecord['amateurDivision'] | null
  season_points: number | null
  created_at: string
  logo_path: string | null
  is_ai: boolean | null
  is_active: boolean | null
}

function mapClubTier(clubTier: string): TeamRankingRecord['tier'] {
  switch (clubTier) {
    case 'world':
    case 'worldteam':
    case 'WORLD':
    case 'WORLDTEAM':
      return 'WORLD'
    case 'pro':
    case 'proteam':
    case 'PRO':
    case 'PROTEAM':
      return 'PRO'
    case 'continental':
    case 'CONTINENTAL':
      return 'CONTINENTAL'
    case 'amateur':
    case 'AMATEUR':
      return 'AMATEUR'
    default:
      return 'AMATEUR'
  }
}

export async function getTeamRankingTeams(): Promise<TeamRankingRecord[]> {
  const { data, error } = await supabase
    .from('team_rankings_view')
    .select(`
      id,
      name,
      country_code,
      club_tier,
      tier2_division,
      tier3_division,
      amateur_division,
      season_points,
      created_at,
      logo_path,
      is_ai,
      is_active
    `)
    .order('season_points', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load team rankings: ${error.message}`)
  }

  return (data ?? []).map((row: ClubRankingRow) => ({
    id: row.id,
    name: row.name,
    country: row.country_code,
    tier: mapClubTier(row.club_tier),
    tier2Division: row.tier2_division,
    tier3Division: row.tier3_division,
    amateurDivision: row.amateur_division,
    seasonPoints: row.season_points ?? 0,
    overallRank: null,
    tierRank: null,
    divisionRank: null,
    createdAt: row.created_at,
    logoPath: row.logo_path ?? null,
    isAi: row.is_ai ?? false,
    isActive: row.is_active ?? true,
  }))
}