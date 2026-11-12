import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8')
}

const own = source('src/features/squad/components/RiderProfilePage.tsx')
const external = source('src/pages/dashboard/riders/RiderProfilePublicPage.tsx')
const youth = source('supabase/migrations/20261112135000_cycling_youth_academy_balance_alias_fix_v1.sql')
const teamHistory = source('supabase/migrations/20261112135500_cycling_exclude_nation_only_from_club_last_races_v1.sql')
const financeSql = source('supabase/migrations/20261112140000_cycling_club_finance_historical_season_report_v1.sql')
const financeUi = source('src/pages/dashboard/finance/FinanceSeasonHistory.tsx')
const financePage = source('src/pages/dashboard/Finance.tsx')
const nationals = source('src/pages/dashboard/WorldChampionshipExpectedField.tsx')

test('owned and external riders use the authoritative active season, not Season 1', () => {
  assert.match(own, /getActiveRiderSeasonYear/)
  assert.match(own, /team_ranking_get_current_season_year_v1/)
  assert.match(own, /\.eq\('season_year', seasonYear\)/)
  assert.match(own, /p_season_year: seasonYear/)
  assert.doesNotMatch(own, /\.eq\('season_year', 2000\)/)
  assert.doesNotMatch(own, /p_season_year: 2000/)
  assert.match(external, /team_ranking_get_current_season_year_v1/)
  assert.match(external, /\.eq\('season_year', seasonYear\)/)
  assert.doesNotMatch(external, /\.eq\('season_year', 2000\)/)
})

test('Youth Academy fixes the undeclared variable without modifying data', () => {
  assert.match(youth, /v_coin_balance>=v_activation_cost/)
  assert.match(youth, /v_balance>=v_activation_cost/)
  assert.match(youth, /pg_get_functiondef/)
  assert.doesNotMatch(youth, /UPDATE public\.youth_academies/i)
})

test('club racing list excludes nation-only championships, retaining rider history', () => {
  assert.match(teamHistory, /world_road_championship_editions/)
  assert.match(teamHistory, /national_championship_editions/)
  assert.match(teamHistory, /individual_only/)
  assert.match(teamHistory, /get_team_last_five_races/)
  assert.doesNotMatch(teamHistory, /get_rider_last_five_races/)
})

test('historical finances are owner-checked and read from existing ledger', () => {
  assert.match(financeSql, /finance_get_club_season_overview_v1/)
  assert.match(financeSql, /finance_get_club_season_history_v1/)
  assert.match(financeSql, /p_season_number between 1 and gs\.season_number/)
  assert.match(financeSql, /REVOKE ALL.*FROM PUBLIC,anon/)
  assert.match(financeUi, /finance_get_club_season_history_v1/)
  assert.match(financeUi, /Previous seasons/)
  assert.match(financePage, /<FinanceSeasonHistory/)
  assert.doesNotMatch(financeUi, /sessionStorage|localStorage/)
})

test('unqualified future national places are not misreported as active qualification', () => {
  assert.match(nationals, /row\.national_status === 'planned'/)
  assert.match(nationals, /National championship scheduled — not held yet/)
})
