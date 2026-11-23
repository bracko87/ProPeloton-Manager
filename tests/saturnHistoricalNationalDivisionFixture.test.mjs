import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql=readFileSync(new URL(
 '../supabase/migrations/20261112101900_cycling_season1_preserve_unmapped_technical_amateur_division_v1.sql',
 import.meta.url),'utf8')
test('unmapped historical national club fixture is validated only when it exists',()=>{
 assert.match(sql,/IF EXISTS \(\s*SELECT 1 FROM public\.clubs c[\s\S]*?\) AND NOT EXISTS\(/i)
 assert.match(sql,/RAISE EXCEPTION 'Expected unmapped technical national team has unexpected state'/i)
 assert.match(sql,/EXECUTE replace\(v_src,/i)
 assert.match(sql,/amateur_division=coalesce\(public\.safe_get_amateur_division_for_country\(c\.country_code\),c\.amateur_division\)/)
})
