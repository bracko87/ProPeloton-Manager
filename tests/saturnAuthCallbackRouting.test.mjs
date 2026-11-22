import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('standard email confirmation gets a secure HashRouter landing', () => {
  const register = read('src/pages/Register.tsx')
  const app = read('src/App.tsx')
  const bridge = read('src/components/auth/SignupEmailCallbackRouting.tsx')

  assert.match(register, /https:\/\/propelotonmanager\.com\/create-club/)
  assert.match(app, /<HashRouter>/)
  assert.match(app, /<SignupEmailCallbackRouting \/>/)
  assert.match(bridge, /window\.location\.pathname\.replace/)
  assert.match(bridge, /if \(loading\) return/)
  assert.match(bridge, /user\.is_anonymous === true/)
  assert.match(bridge, /!user\.email_confirmed_at/)
  assert.match(bridge, /supabase\.rpc\('get_my_club_id'\)/)
  assert.match(bridge, /clubError/)
  assert.match(bridge, /navigate\(data \? '\/dashboard\/overview' : '\/create-club'/)
  assert.doesNotMatch(bridge, /signUp\(|signInWithOAuth\(|create_club\(/)
})

test('an older browser conversion marker cannot block the current guest identity', () => {
  const conversion = read('src/pages/TestAccountRegister.tsx')
  assert.match(conversion, /if \(originId === user\.id\) return/)
  assert.match(conversion, /setOriginId\(user\.id\)/)
  assert.match(conversion, /ORIGINAL_ID_KEY/)
  assert.doesNotMatch(conversion, /if \(originId\) return/)
  assert.match(conversion, /result\?\.user_id === originId/)
  assert.match(conversion, /result\?\.user_id !== originId/)
})
