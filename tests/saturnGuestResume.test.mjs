import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUEST_SESSION_KEY as key, createGuestSessionStorage, shouldUseGuestAuth } from '../src/lib/guestSessionStorage.mjs'
const disk = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null,setItem: (k,v) => m.set(k,v),removeItem: k => m.delete(k) } }
const session = (id, anonymous, token='refresh') => JSON.stringify({user:{id,is_anonymous:anonymous},access_token:'test-access',refresh_token:token})
test('guest session and rotated refresh token survive a browser reload',()=>{
 const d=disk(); const first=createGuestSessionStorage(d)
 first.setItem(key,session('guest',true)); first.setItem(key,session('guest',true,'rotated'))
 assert.equal(createGuestSessionStorage(d).getItem(key),session('guest',true,'rotated'))
})
test('same identity survives linking but is memory-only after server conversion',()=>{
 const d=disk(); const first=createGuestSessionStorage(d)
 first.setItem(key,session('guest',true)); first.setItem(key,session('guest',false,'linked'))
 assert.ok(createGuestSessionStorage(d).getItem(key))
 first.finishConversion('guest')
 assert.equal(d.getItem(key),null)
 assert.equal(first.getItem(key),session('guest',false,'linked'))
 first.setItem(key,session('guest',false,'next'))
 assert.equal(d.getItem(key),null)
})
test('ordinary session does not persist in the guest store',()=>{
 const d=disk(); const storage=createGuestSessionStorage(d)
 storage.setItem(key,session('ordinary',false))
 assert.equal(d.getItem(key),null)
 assert.ok(storage.getItem(key))
})
test('real logout removes anonymous credentials; regular path never adopts them',()=>{
 const d=disk(); const storage=createGuestSessionStorage(d)
 storage.setItem(key,session('guest',true)); storage.removeItem(key)
 assert.equal(createGuestSessionStorage(d).getItem(key),null)
 assert.equal(shouldUseGuestAuth('https://example.com/?saturn_regular=1#/login',true,true),false)
 assert.equal(shouldUseGuestAuth('https://example.com/#/',true,true),true)
 assert.equal(shouldUseGuestAuth('https://example.com/#/test-the-game',false,true),true)
 assert.equal(shouldUseGuestAuth('https://example.com/#/test-the-game',false,false),false)
})
test('guest leave is local navigation, all common logout controls use it',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const client=read('src/lib/testAccountClient.ts')
 assert.match(client,/if \(data\.session\?\.user\.is_anonymous \|\| hasSavedGuestSession\(\)\) return/)
 for(const p of ['MainLayout','Sidebar','Header']) assert.match(read('src/components/layout/'+p+'.tsx'),/await leaveGameSession\(\)/)
 assert.match(read('src/components/home/Hero.tsx'),/Continue Test Game/)
 assert.match(read('src/pages/Login.tsx'),/Continue Test Game/)
})

test('homepage verifies a real guest team before Continue, and does not send guests through the regular creation gate',()=> {
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const hero=read('src/components/home/Hero.tsx')
 const home=read('src/pages/Home.tsx')
 const signup=read('src/pages/TestTeamSignup.tsx')
 assert.match(hero,/\.from\('saturn_test_accounts_v1'\)/)
 assert.match(hero,/data\?\.user_id === userId && data\.club_id && !data\.converted_at/)
 assert.match(hero,/const canResumeGuest = guestStatus === 'ready'/)
 assert.match(hero,/hasUnfinishedGuest \|\|/)
 assert.match(home,/if \(!user \|\| user\.is_anonymous === true/)
 assert.match(home,/'is_current_user_club_creation_allowed_v1'/)
 assert.match(signup,/Finish or start a test team/)
})
