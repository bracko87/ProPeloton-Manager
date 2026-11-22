import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const layout = readFileSync(new URL('../src/components/layout/MainLayout.tsx', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/pages/dashboard/ClubDashboard.tsx', import.meta.url), 'utf8')

test('shared dashboard sidebar starts collapsed without stored preferences', () => {
  assert.match(layout, /const \[collapsed, setCollapsed\] = useState\(true\)/)
  assert.doesNotMatch(layout, /ppm-sidebar-collapsed/)
  assert.match(dashboard, /<MainLayout>/)
  assert.match(layout, /if \(event === 'SIGNED_OUT'\) \{\s*setCollapsed\(true\)/)
})

test('sidebar and header retain manual toggles during the dashboard session', () => {
  assert.match(layout, /<Sidebar collapsed=\{collapsed\} onToggle=\{\(\) => setCollapsed\(value => !value\)\} \/>/)
  assert.match(layout, /onToggle=\{\(\) => setCollapsed\(v => !v\)\}/)
})
