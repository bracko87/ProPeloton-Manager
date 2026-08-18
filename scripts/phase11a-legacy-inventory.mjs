import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const sourceRoots = ['src', 'netlify']
const extensions = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i
const findings = []
let pageEngineCalls = null
let runnerEngineCalls = null

function walk(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path)
    else if (extensions.test(name)) inspect(path)
  }
}

function inspect(path) {
  const text = readFileSync(path, 'utf8')
  const rel = relative(root, path).replaceAll('\\', '/')
  const legacyMatches = [...text.matchAll(/(?:from\s+['\"]|import\s*\(\s*['\"])([^'\"]*race-simulator-v2[^'\"]*)/g)]
  for (const match of legacyMatches) findings.push({ file: rel, import: match[1] })
  const calls = (text.match(/runRaceEngine\s*\(/g) ?? []).length
  if (rel === 'src/pages/dashboard/RaceDetailPage.tsx') pageEngineCalls = calls
  if (rel === 'netlify/functions/universal-race-stage-runner.ts') runnerEngineCalls = calls
}

for (const dir of sourceRoots) walk(join(root, dir))

console.log(JSON.stringify({
  phase: '11A-verification',
  repositoryRoot: root,
  legacyImportCount: findings.length,
  legacyImports: findings,
  productionPageRunRaceEngineCalls: pageEngineCalls,
  serverRunnerRunRaceEngineCalls: runnerEngineCalls,
  expectedDuringPhase11A: {
    legacyImportsMayRemain: true,
    productionPageFallbackEngineCalls: 1,
    serverRunnerEngineCalls: 1,
  },
  deletionGate: 'Do not delete legacy files until stored production replay and persistence are verified.',
}, null, 2))
