import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('same-identity email verification returns to conversion and success replaces forms',()=>{
 const page=read('src/pages/TestAccountRegister.tsx')
 assert.match(page,/emailRedirectTo:.*saturn_email_link=1#\/test-account-register/)
 assert.match(page,/if \(success\) return/)
 assert.match(page,/Registration successful!/)
 assert.match(page,/Go to my dashboard/)
 assert.match(read('src/pages/Home.tsx'),/originalId === user.id/)
 assert.match(read('src/lib/guestSessionStorage.mjs'),/saturn_email_link/)
})
test('AI swap preserves both league sizes and checks former trial identity',()=>{
 const sql=read('supabase/migrations/20261122185042_saturn_conversion_highest_safe_ai_slot_v2.sql')
 assert.match(sql,/v_trial\.converted_at is null/)
 assert.match(sql,/v_source_count/)
 assert.match(sql,/v_target_count/)
 assert.match(sql,/Conversion placement changed league capacity/)
 assert.match(sql,/'moved_to_ai_slot'/)
})
test('branded email retains canonical confirmation token and ordinary email change case',()=>{
 const html=read('supabase/templates/email-change.html')
 assert.ok(html.includes('{{ .ConfirmationURL }}'))
 assert.ok(html.includes('{{ if .Email }}'))
 assert.ok(html.includes('Verify my email address'))
})
