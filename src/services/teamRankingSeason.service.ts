import { getTeamRankingTeams } from './teamRanking.service'
import { applySeasonReset, SeasonResetResult } from '../utils/teamRanking.utils'

export async function previewSeasonReset(): Promise<SeasonResetResult> {
  const teams = await getTeamRankingTeams()
  return applySeasonReset(teams)
}