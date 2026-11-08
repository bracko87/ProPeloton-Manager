import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const content = readFileSync('src/universal-race-engine/runRaceEngineReplayCpuOptimizedV1.ts', 'utf8')
const header = `// CPU-safe frozen 92de266 engine copy. All sporting physics remains identical.
 // Only the deterministic replay group lookup is memoized and memory-bounded.
 // Five dependencies resolve to the immutable original 92de266 source files.
`.replaceAll('\n ', '\n')
assert.ok(content.startsWith(header), 'Expected pinned optimization provenance header')
const first = content.indexOf('  // Replay-only optimization: the rider group at a physical kilometre is')
const last = content.indexOf('  const physicalDropProbeKms = ', first)
assert.ok(first > 0 && last > first, 'Expected bounded group-cache optimization')
const previous = `  const physicalChaseDropGroupsAt = (km: number) => groupsAtKm(km)
  const groupOfRiderAt = (riderId: string, km: number): string | null =>
    physicalChaseDropGroupsAt(km).find((g) => g.riderIds.includes(riderId))
      ?.displayCode ?? null`
let normalized = content.slice(header.length)
const start = normalized.indexOf('  // Replay-only optimization: the rider group at a physical kilometre is')
const stop = normalized.indexOf('  const physicalDropProbeKms = ', start)
normalized = normalized.slice(0, start) + previous + '\n' + normalized.slice(stop)
let pinnedImports = 0
normalized = normalized.replace(
  /(\bfrom\s*['"])https:\/\/raw\.githubusercontent\.com\/bracko87\/ProPeloton-Manager\/92de26698126e646f6ecc4ae74455bfc831e66c2\/src\/universal-race-engine\/([^'"]+)(['"])/g,
  (_, left, name, right) => { pinnedImports++; return left + './' + name + right },
)
assert.equal(pinnedImports, 5, 'All five frozen dependencies must be present')
const blob = Buffer.from(normalized, 'utf8')
const sha = createHash('sha1')
  .update(Buffer.from(`blob ${blob.byteLength}\0`))
  .update(blob)
  .digest('hex')
assert.equal(sha, '1929dc459c06634c0242d982c130d2b155098a44', 'Any non-replay physics change must fail the source-integrity check')
console.log('PASS exact pinned 92de sporting source retained; only replay lookup and five immutable import URLs differ')
