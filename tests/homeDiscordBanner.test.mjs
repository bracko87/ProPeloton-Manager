import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8')
const home=read('src/pages/Home.tsx')
const banner=read('src/components/home/HomeDiscord.tsx')
const placement=home.indexOf('<HomeDiscord inviteUrl={DISCORD_INVITE_URL} />')
assert.ok(placement>home.indexOf("t('stats.title')")&&placement<home.indexOf("t('features.title')"))
assert.ok(home.includes("const DISCORD_INVITE_URL = 'https://discord.gg/BpgqTXsjAW'"))
assert.equal(home.split('<HomeDiscord inviteUrl=').length,2)
assert.ok(banner.includes('href={inviteUrl}')&&banner.includes('rel="noopener noreferrer"'))
assert.ok(banner.includes('#5865f2')&&banner.includes('text-white')&&banner.includes('bg-white'))
const languages=[...read('src/i18n/languages.ts').matchAll(/\bcode:\s*['"]([^'"]+)['"]/g)].map(x=>x[1])
assert.equal(languages.length,8)
for(const language of languages){
 const copy=JSON.parse(read('src/i18n/locales/'+language+'/home.json')).discordCommunity
 for(const key of ['eyebrow','title','description','join']){
  assert.ok(typeof copy[key]==='string'&&copy[key].trim(),language+':'+key)
  assert.ok(banner.includes("t('discordCommunity."+key+"')"))
 }
}
console.log('PASS: Discord banner after Quick Stats, official invite, responsive styling and eight locales')
