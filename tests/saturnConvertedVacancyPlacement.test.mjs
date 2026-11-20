import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8')
const sql = read('supabase/migrations/20261120234500_saturn_converted_team_approved_vacancy_v1.sql')
const ui = read('src/pages/TestAccountRegister.tsx')

test('vacancies require separate private approved, disabled-by-default category/region caps',()=>{
 assert.match(sql,/create table if not exists private\.saturn_converted_vacancy_caps_v1/)
 assert.match(sql,/world_tier smallint not null/)
 assert.match(sql,/club_tier public\.club_tier not null/)
 assert.match(sql,/region_code text not null/)
 assert.match(sql,/max_teams integer not null check\(max_teams > 0\)/)
 assert.match(sql,/enabled boolean not null default false/)
 assert.match(sql,/approved_at timestamptz not null/)
 assert.match(sql,/revoke all on private\.saturn_converted_vacancy_caps_v1 from public,anon,authenticated/)
 assert.doesNotMatch(sql,/insert into private\.saturn_converted_vacancy_caps_v1/i)
})
test('successful conversion placement has one permanent audit row and cannot be repeated',()=>{
 for(const phrase of [
  'create table if not exists private.saturn_converted_team_placements_v1',
  'user_id uuid primary key references auth.users(id)',
  'club_id uuid not null unique references public.clubs(id)',
  'revoke all on table private.saturn_converted_team_placements_v1',
  'from private.saturn_converted_team_placements_v1 p',
  "'status','already_placed'",
  'insert into private.saturn_converted_team_placements_v1(',
  'from_club_tier,from_world_tier',
  'to_club_tier,to_world_tier,to_region'
 ]) assert.ok(sql.includes(phrase), phrase)
 assert.ok(ui.includes("case 'already_placed':"))
 const writePos=sql.indexOf('update public.clubs set')
 const auditPos=sql.indexOf('insert into private.saturn_converted_team_placements_v1(')
 const successPos=sql.indexOf("'placed',true,'status','moved_to_approved_vacancy'")
 assert.ok(writePos>0 && auditPos>writePos && successPos>auditPos)
})

test('original verified converted UUID and team ownership are mandatory',()=>{
 assert.match(sql,/v_uid uuid := auth\.uid\(\)/)
 assert.match(sql,/u\.id=v_uid and u\.is_anonymous is false/)
 assert.match(sql,/where t\.user_id=v_uid for update/)
 assert.match(sql,/v_trial\.converted_at is null/)
 assert.match(sql,/c\.id=v_trial\.club_id/)
 assert.match(sql,/c\.owner_user_id=v_uid/)
 assert.match(sql,/m\.club_id=v_trial\.club_id and m\.user_id=v_uid/)
 assert.match(sql,/for update/)
})
test('race and season safeguards defer any mid-competition league move',()=>{
 assert.match(sql,/public\.season_transition_guard_active_v1\(\)/)
 assert.match(sql,/s\.is_armed is true/)
 for(const table of ['race_team_entries','race_team_applications','race_participant_teams','race_participant_teams_v1']){
   assert.ok(sql.includes('public.'+table),table+' must block mid-race move')
 }
 assert.match(sql,/coalesce\(r\.status,'unknown'\) not in \('completed','finished','cancelled'\)/)
 assert.match(sql,/'race_commitment_pending'/)
 assert.match(sql,/'season_transition_pending'/)
})
test('highest approved vacant target uses country region mapping, capacity locks and excludes AI swaps',()=>{
 assert.match(sql,/public\.get_expected_tier2_division_for_country\(v_club\.country_code\)/)
 assert.match(sql,/public\.get_expected_tier3_division_for_country\(v_club\.country_code\)/)
 assert.match(sql,/public\.safe_get_amateur_division_for_country\(v_club\.country_code\)/)
 assert.match(sql,/order by\s+case cap\.club_tier/)
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(/)
 assert.match(sql,/if v_occupied >= v_live_max_teams then continue; end if;/)
 assert.ok(sql.includes('select cap.max_teams into v_live_max_teams'))
 assert.ok(sql.includes('and cap.enabled=true and cap.approved_at is not null'))
 assert.ok(sql.includes('for update;'))
 assert.match(sql,/c\.is_active=true and c\.club_type='main'/)
 assert.match(sql,/'no_approved_higher_vacancy'/)
 assert.ok(sql.includes("league.club_type='main' and league.is_active=true"))
 assert.ok(sql.includes("league.world_tier=v_destination.world_tier"))
 assert.ok(sql.includes("league.club_tier=v_destination.club_tier"))
 assert.ok(sql.includes("end)=v_destination.region_code"))

 assert.doesNotMatch(sql,/assign_new_club_to_ai_slot\(|delete from public\.clubs|update public\.race_|update public\.riders|update public\.premium_/)
})
test('club move changes only tier and region, never identity, points, assets or cash',()=>{
 assert.match(sql,/update public\.clubs set\s+club_tier=v_destination\.club_tier/)
 assert.match(sql,/tier2_division=case/)
 assert.match(sql,/tier3_division=case/)
 assert.match(sql,/amateur_division=case/)
 assert.match(sql,/where id=v_club\.id and owner_user_id=v_uid/)
 assert.doesNotMatch(sql,/set\s+(?:season_points|cash_balance|owner_user_id|is_ai)=/)
})
test('email and Google conversion request optional server-assigned vacancy without false promises',()=>{
 assert.match(ui,/async function requestApprovedPlacement\(\)/)
 assert.match(ui,/\.rpc\('saturn_place_converted_test_team_v1'\)/)
 assert.match(ui,/'moved_to_approved_vacancy'/)
 assert.match(ui,/'race_commitment_pending'/)
 assert.match(ui,/'season_transition_pending'/)
 assert.match(ui,/No approved higher-division vacancy is available/)
 assert.ok((ui.match(/await requestApprovedPlacement\(\)/g)||[]).length===2)
})
test.todo('staging: registered player picks highest approved EMPTY tier/region, with no incumbent displaced')
test.todo('staging: registration with no approved vacancies retains bottom amateur club and points')
test.todo('staging: active/scheduled race entries block movement but final results remain intact')
test.todo('staging: simultaneous converted managers cannot overfill a single approved vacancy')
test.todo('staging: completed race history and finances are unchanged during club tier change')
test.todo('staging: season reset blocks reassignment and preserves club/race identity')
test.todo('staging: unconverted temporary player and unrelated permanent user cannot run promotion RPC')

test.todo('staging: second placement request returns already_placed without jumping further')
test.todo('staging: atomic placement and audit row roll back together on interrupted transaction')

test.todo('staging: admin reducing approved cap during conversion cannot create over-cap slot')

test.todo('staging: approved cap for nonexistent league is ignored and original club retained')
