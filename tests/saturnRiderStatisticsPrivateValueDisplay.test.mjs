import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

const src = readFileSync(new URL('../src/features/squad/components/RiderStatisticsSection.tsx', import.meta.url), 'utf8')

// Exercise the actual TS helper rather than copying its logic into the test.
// Bundler transpilation only removes TypeScript syntax; no browser, game data,
// auth token, or external service is used.
const start = src.indexOf("type PrivateRiderMetric =")
const end = src.indexOf("function cx(", start)
assert.ok(start >= 0 && end > start, 'private metric helper source must exist')
const snippet = src.slice(start, end).replace(
  'function completePrivateRiderMetricTotal(',
  'export function completePrivateRiderMetricTotal(',
)
const transformed = await transform(snippet, { loader: 'ts', format: 'esm' })
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(transformed.code).toString('base64')
const { completePrivateRiderMetricTotal: total } = await import(moduleUrl)

test('SAT-09 private rider averages never count hidden null fields as zero', () => {
  const visible = [
    { overall: 72, fatigue: 4, market_value: 10000, salary: 1000 },
    { overall: 80, fatigue: 8, market_value: 15000, salary: 1200 },
  ]
  assert.equal(total(visible, 'overall'), 152)
  assert.equal(total(visible, 'fatigue'), 12)
  assert.equal(total(visible, 'market_value'), 25000)
  assert.equal(total(visible, 'salary'), 2200)

  const hiddenRival = { overall: null, fatigue: null, market_value: null, salary: null }
  for (const field of ['overall', 'fatigue', 'market_value', 'salary']) {
    assert.equal(total([...visible, hiddenRival], field), null, 'mask mixed totals: ' + field)
    assert.equal(total([hiddenRival], field), null, 'mask fully hidden totals: ' + field)
    assert.equal(total([], field), null, 'mask empty totals: ' + field)
  }
})

test('SAT-09 genuine numeric zeros remain valid, NaNs do not', () => {
  const zero = { overall: 0, fatigue: 0, market_value: 0, salary: 0 }
  for (const metric of ['overall', 'fatigue', 'market_value', 'salary']) {
    assert.equal(total([zero], metric), 0, 'real zero: ' + metric)
    assert.equal(total([{ ...zero, [metric]: NaN }], metric), null)
    assert.equal(total([{ ...zero, [metric]: undefined }], metric), null)
  }
})

test('SAT-09 UI shows unavailable aggregate and hides incomplete private finance rankings', () => {
  assert.match(src, /overallTotal !== null \?/)
  assert.match(src, /fatigueTotal !== null \?/)
  assert.match(src, /marketValueTotal !== null \?/)
  assert.match(src, /salaryTotal !== null \?/)
  assert.match(src, /marketValueTotal === null \|\| salaryTotal === null \?/)
  assert.match(src, /riders\.some\(rider => typeof rider\[metric\] !== 'number'/)
  assert.doesNotMatch(src, /row\.(overall|fatigue|market_value|salary) \?\? 0/)
  assert.match(src, /Number\(row\[riderMetric\] \?\? 0\)/)
  assert.match(src, /Number\(row\[riderTableMetric\] \?\? 0\)/)
})

test('SAT-09 public rider modal retains masked values as unavailable, not zero', () => {
  const modal = readFileSync(new URL('../src/components/riders/RiderProfileModal.tsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../src/pages/dashboard/riders/RiderProfilePublicPage.tsx', import.meta.url), 'utf8')
  assert.match(modal, /stat\.value \?\? '—'/)
  assert.match(modal, /if \(value == null \|\| Number\.isNaN\(value\)\) return '—'/)
  assert.match(page, /overall: normalizeNullableNumber\(row\.overall\)/)
  assert.match(page, /salary: normalizeNullableNumber\(row\.salary\)/)
})
