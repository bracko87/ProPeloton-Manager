import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const page = read('src/pages/dashboard/CalendarPage.tsx')
const policy = read('src/lib/raceClubApplicationPolicy.ts')

test('all national, individual, and nations-only competitions are recognized as restricted club events', () => {
  for (const type of ['NC', 'NCQ', 'WRC', 'WNQ', 'WNF', 'NATIONAL ASSOCIATION']) {
    assert.ok(policy.includes("'" + type + "'"),type)
  }
  for (const marker of [
    'individual_only', 'national_championship',
    'world_road_championship', 'nations_competition',
    'national_team_only', 'national_selection',
    'world_road_championship_edition_id',
  ]) assert.ok(policy.includes('metadata.' + marker),marker)
})

test('non-club events show one simple Watch only tag, not Club entry unavailable', () => {
  assert.match(page, /const isWatchOnlyRace = isClubApplicationRestrictedRace\(race\)/)
  assert.match(page, /\{isWatchOnlyRace \? \(/)
  assert.match(page, /t\('races\.watchOnly'\)/)
  assert.match(page, /title=\{t\('races\.watchOnlyDescription'\)\}/)
  assert.doesNotMatch(page, /Club entry unavailable/)
  assert.doesNotMatch(page, /diagonal|striped|watermark/)
})

test('regular team races keep their normal application status and Open Race action', () => {
  assert.match(page, /getRaceApplicationBadgeClass\(effectiveRaceStatus\)/)
  assert.match(page, /getRaceApplicationBadgeLabel\(effectiveRaceStatus, t\)/)
  assert.match(page, /to=\{getCalendarRaceTarget\(race\)\}/)
  assert.match(page, /t\('races\.openRace'\)/)
})

test('national events are not presented as potential club sponsor objectives', () => {
  assert.match(page, /const hasSponsorObjectiveTarget = !isWatchOnlyRace &&/)
  assert.match(page, /premiumRaceFilters\.sponsorTargetsOnly &&\s+\(isClubApplicationRestrictedRace\(race\)/)
  assert.match(page, /const sponsorTargetRaces = activeMonthRaces\.filter\(\s+race => !isClubApplicationRestrictedRace\(race\)/)
})

test('Watch only label and explanation are available in all eight supported languages', () => {
  const locales = ['en','de','es','fr','it','hr','sr-Latn','ru']
  for (const code of locales) {
    const data = JSON.parse(read('src/i18n/locales/' + code + '/calendarPage.json'))
    assert.ok(data.races.watchOnly?.trim(),code)
    assert.ok(data.races.watchOnlyDescription?.trim(),code)
  }
})
