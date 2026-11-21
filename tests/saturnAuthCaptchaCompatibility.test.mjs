import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ordinary auth CAPTCHA is independent of guest feature flags and optional until a site key is configured',()=>{
 const code=read('src/components/auth/AuthCaptcha.tsx')
 assert.match(code,/Boolean\(SATURN_TURNSTILE_SITE_KEY\)/)
 assert.doesNotMatch(code,/VITE_SATURN_(TEST_ACCOUNTS_ENABLED|PUBLIC_SIGNUP_ENABLED)/)
 assert.match(code,/if \(!required\) return undefined/)
 assert.match(code,/if \(!value\) throw new Error/)
 assert.match(code,/onTokenChange\(null\)\s+return value/)
 assert.match(code,/key=\{captcha.attempt\}/)
})
for(const [page,method,count] of [['Login','signInWithPassword',1],['Register','signUp',2],['ForgotPassword','resetPasswordForEmail',1]]){
 test(page+' renders challenge, supplies a single-use token and resets after each auth attempt',()=>{
  const code=read('src/pages/'+page+'.tsx')
  assert.ok(code.includes('supabase.auth.'+method+'('))
  assert.equal((code.match(/captchaToken: captcha.consume\(\)/g)||[]).length,count)
  assert.equal((code.match(/finally \{\s+captcha.reset\(\)/g)||[]).length,count)
  assert.match(code,/<AuthCaptcha captcha=\{captcha\} \/>/)
  assert.match(code,/!captcha.ready/)
  if(page==='Register')assert.ok(code.includes('supabase.auth.resend('))
 })
}
test('password reset CAPTCHA denial is not presented as successful email delivery',()=>{
 const code=read('src/pages/ForgotPassword.tsx')
 assert.match(code,/error\?\.code === 'captcha_failed'[\s\S]*?setStatus\('error'\)[\s\S]*?return/)
})

test('custom esbuild supplies only explicit public configuration and defaults guest routes off',()=>{
 const build=read('scripts/build.mjs')
 assert.match(build,/'import\.meta\.env': JSON.stringify\(\{/)
 for(const name of ['TEST_ACCOUNTS_ENABLED','PUBLIC_SIGNUP_ENABLED']){
  assert.ok(build.includes("process.env.VITE_SATURN_"+name+" === 'true' ? 'true' : 'false'"))
 }
 assert.match(build,/VITE_SATURN_TURNSTILE_SITE_KEY: process\.env\.VITE_SATURN_TURNSTILE_SITE_KEY/)
 assert.doesNotMatch(build,/JSON\.stringify\(process\.env|\.\.\.process\.env/)
})
