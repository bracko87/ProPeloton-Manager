import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL(
  '../supabase/migrations/20261019113500_restore_original_ai_national_pool_branding_v1.sql',
  import.meta.url),'utf8')

test('AI national branding restoration skips only on brand-new databases',()=>{
  assert.match(sql,/if not exists \(\s*select 1 from public\.clubs c[\s\S]*?where c\.is_ai is true and c\.created_at < '2026-09-29'/i)
  assert.match(sql,/raise notice 'Skipping legacy AI national branding restoration: no legacy AI clubs'/i)
  assert.match(sql,/raise exception 'Original AI national team assets missing for %'/i)
  assert.match(sql,/raise exception 'Expected one independent AI club for %/i)
  assert.match(sql,/raise exception 'AI national team % has riders of other nationalities'/i)
})
