import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL(
 '../supabase/migrations/20261117092000_preserve_player_clubs_in_season1_world_restart_v1.sql',
 import.meta.url),'utf8')
test('four-slot world restart correction is required only for existing history',()=>{
 assert.match(sql,/IF NOT EXISTS \(\s*SELECT 1 FROM public\.clubs\s+WHERE id IN \(/i)
 assert.match(sql,/Skipping historical four-slot player replacement on fresh install/i)
 assert.match(sql,/IF v_pairs<>4 THEN/i)
 assert.match(sql,/Four historical player-slot replacements could not be verified/i)
 assert.match(sql,/Season 1 competition baseline integrity failed/i)
})
