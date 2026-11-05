import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('./sql/v4_single_stage_private_research_capture_cron_20261105.sql',import.meta.url),'utf8')
const sql=source.replace(/--[^\r\n]*/g,'')
const stageId='c7800ffd-f417-4feb-8a66-b928551daa4d'
const name='ppm-v4-private-capture-c7800ffd-20261105'

test('research-only cron has one exact immutable stage and auto terminates',()=>{
 assert.match(sql,/SELECT cron\.schedule\(/)
 assert.match(sql,/\* \* \* \* \*/)
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE/)
 assert.match(sql,/COMMIT;/)
 assert.match(sql,/private\.v4_capture_research_locked_stage_source_v1\(/)
 assert.match(sql,/private\.v4_research_locked_full_stage_sources_v1/)
 assert.match(sql,/cron\.unschedule\('ppm-v4-private-capture-c7800ffd-20261105'\)/)
 assert.match(sql,/now\(\) >= '2026-11-08 00:00:00\+00'::timestamptz/)
 assert.match(sql,/public\.get_current_game_timestamp\(\) >=/)
 assert.equal(sql.split(stageId).length-1,4)
 assert.equal(sql.split(name).length-1,2)
})
test('time, terrain and stage identity cannot drift to a different race',()=>{
 assert.match(sql,/s\.stage_date=DATE '2000-10-20'/)
 assert.match(sql,/s\.stage_format='road_race' AND s\.terrain_type='hilly'/)
 assert.match(sql,/s\.planned_start_hour_number=11 AND s\.planned_start_minute=15/)
 assert.match(sql,/'2000-10-20 11:15:00\+00'::timestamptz/)
 assert.match(sql,/V4_RESEARCH_STAGE_IDENTITY_CHANGED/)
 assert.match(sql,/THEN private\.v4_capture_research_locked_stage_source_v1\(/)
})
test('expiry and stage start are checked BEFORE capture is attempted',()=>{
 const capture=sql.indexOf('THEN private.v4_capture_research_locked_stage_source_v1(')
 const early=sql.indexOf("now() < '2026-11-08 00:00:00+00'::timestamptz")
 const start=sql.indexOf("public.get_current_game_timestamp() <")
 const stop=sql.indexOf("now() >= '2026-11-08 00:00:00+00'::timestamptz")
 assert(early>=0&&early<capture)
 assert(start>=0&&start<capture)
 assert(stop>capture)
 assert.equal((sql.match(/private\.v4_capture_research_locked_stage_source_v1\(/g)||[]).length,1)
})
test('scheduled job contains no official write, game-clock reset or worker call',()=>{
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|ALTER|DROP)\s+(?:public|auth|net|storage|cron)\./i)
 assert.equal((sql.match(/cron\.unschedule\('/g)||[]).length,1)
 assert.doesNotMatch(sql,/net\.http_|vault\.|service_role|worker_secret/i)
 assert.doesNotMatch(sql,/\b(?:advance_game_state|is_paused\s*=|race_stage_authoritative_runs|race_stage_simulation_runs|runRaceEngine)\b/i)
 assert.equal(sql.split('private.v4_capture_research_locked_stage_source_v1(').length-1,1)
})
