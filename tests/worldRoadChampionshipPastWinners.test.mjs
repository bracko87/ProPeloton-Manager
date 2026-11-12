import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const page = read('src/pages/dashboard/RaceDetailPage.tsx')
const winners = read('src/pages/dashboard/WorldChampionshipPastWinners.tsx')

test('World Road Championship header displays previous winners alongside event logo', () => {
  assert.match(page, /<WorldChampionshipPastWinners/)
  assert.match(page, /getGameDatePartsFromStoredRaceDate\(race\.start_date\)/)
  assert.match(page, /isWorldRoadChampionshipRace\(race\)/)
})
test('read-only winner history comes from completed historic editions API', () => {
  assert.match(winners, /get_world_road_championship_overview_v1/)
  assert.match(winners, /past_champions/)
  assert.match(winners, /row\.season_number < seasonNumber/)
  assert.match(winners, /row\.champion_rider_id && row\.champion_name_snapshot/)
  assert.match(winners, /champion_name_snapshot/)
  assert.doesNotMatch(winners, /second_rider_id|third_rider_id/)
  assert.doesNotMatch(winners, /\.update\(|\.insert\(|\.delete\(/)
})
test('no previous winner is shown in inaugural Season 1', () => {
  assert.match(winners, /seasonNumber <= 1/)
  assert.match(winners, /if \(seasonNumber <= 1\) return null/)
})
