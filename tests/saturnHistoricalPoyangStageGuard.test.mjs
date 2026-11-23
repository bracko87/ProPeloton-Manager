import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL(
  '../supabase/migrations/20261014054032_guard_time_checks_from_sprint_scoring.sql',
  import.meta.url),'utf8')

test('targeted Poyang repair skips only absent historical stage, retaining all safety guards',()=>{
  assert.match(source,/IF NOT EXISTS \(\s*SELECT 1 FROM public\.race_stages[\s\S]*?RAISE NOTICE 'Skipping historical Poyang Stage 8 correction/i)
  assert.match(source,/RAISE EXCEPTION 'Poyang Stage 8 is already started/)
  assert.match(source,/RAISE EXCEPTION 'The expected false Poyang ITT sprint scoring point was not found/)
  assert.match(source,/RAISE EXCEPTION 'Post-correction Poyang Stage 8 scorepoint\/marker verification failed/)
  assert.match(source,/DO \$poyang\$[\s\S]*END;\s*\$poyang\$;/)
})
