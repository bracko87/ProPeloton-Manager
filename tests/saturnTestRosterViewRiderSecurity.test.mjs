import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql=readFileSync(new URL('../supabase/migrations/20261120213000_saturn_roster_view_invoker_and_rider_update_v1.sql',import.meta.url),'utf8')

test('club_roster is a read-only JOIN VIEW and should not receive table RLS',()=>{
 assert.match(sql,/club_roster is a JOIN VIEW/)
 assert.match(sql,/pg_relation_is_updatable = 0/)
 assert.doesNotMatch(sql,/alter table public\.club_roster|create policy.*on public\.club_roster/i)
 assert.doesNotMatch(sql,/drop view|create or replace view|drop table/i)
})
test('roster view now uses requesting player security context',()=>{
 assert.match(sql,/alter view public\.club_roster set \(security_invoker = true\)/)
 assert.doesNotMatch(sql,/security_invoker = false/)
})
test('guest rider updates require owner-matched active test period',()=>{
 assert.match(sql,/create policy saturn_trial_riders_update_v1 on public\.riders/)
 assert.match(sql,/as restrictive for update to authenticated/)
 assert.match(sql,/using \(\s*exists \(/)
 assert.match(sql,/with check \(\s*exists \(/)
 assert.equal((sql.match(/public\.saturn_trial_direct_write_allowed_v1\(cr\.club_id\)/g)||[]).length,2)
 assert.match(sql,/cr\.rider_id = riders\.id/)
})
test('avoid broad permissions that bypass regular players or scheduler protections',()=>{
 assert.doesNotMatch(sql,/GRANT ALL|disable row level security|FORCE ROW LEVEL SECURITY|drop policy.*riders_update_owner_club/i)
})
test.todo('staging: public/national ranking roster screens still show intended information')
test.todo('staging: own-club and other-club reads respect underlying view caller RLS')
test.todo('staging: expired guest cannot UPDATE a rider in their team through direct Data API')
test.todo('staging: registered player rider updates remain unchanged')
test.todo('staging: simulation and season-transition rider updates remain authorized')
