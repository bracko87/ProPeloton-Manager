import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8')
test('default team shields are assigned before new human clubs are inserted',()=> {
 const sql=read('supabase/migrations/20261122112203_ppm_default_club_shield_v1.sql')
 assert.match(sql,/before insert on public\.clubs/i)
 assert.match(sql,/new\.is_ai is false and new\.club_type='main'/)
 assert.match(sql,/nullif\(btrim\(new\.logo_path\),''\) is null/)
 assert.ok(sql.includes('data:image/svg+xml;base64,'))
 assert.match(sql,/new\.primary_color/)
 assert.match(sql,/new\.secondary_color/)
})
test('header, layout, ranking, team profile and customizer accept stored inline logos',()=> {
 for(const path of ['src/components/layout/MainLayout.tsx','src/components/layout/Header.tsx','src/pages/CustomizeTeam.tsx']) assert.ok(read(path).includes('data:image/svg+xml;base64,'),path)
 for(const path of ['src/pages/dashboard/TeamRanking.tsx','src/pages/dashboard/TeamProfilePage.tsx']) assert.ok(read(path).includes("startsWith('data:')"),path)
})
