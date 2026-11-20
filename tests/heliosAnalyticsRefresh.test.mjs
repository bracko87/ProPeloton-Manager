import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('../src/pages/dashboard/AdminAnalyticsPage.tsx', import.meta.url), 'utf8')

test('Helios H09: control center analytics refreshes every minute while visible', () => {
  assert.match(source, /setInterval\(refreshIfVisible, 60_000\)/)
  assert.match(source, /document\.visibilityState === 'visible'/)
  assert.match(source, /window\.addEventListener\('focus', refreshIfVisible\)/)
  assert.match(source, /window\.clearInterval\(interval\)/)
  assert.match(source, /requestSequence\.current/)
})

test('Helios H09: shows successful data refresh time and preserves last known counts on errors', () => {
  assert.match(source, /Last loaded from database:/)
  assert.match(source, /Auto-refresh every 60 seconds while visible/)
  assert.match(source, /setLastLoadedAt\(new Date\(\)\)/)
  assert.match(source, /last successful/)
})
