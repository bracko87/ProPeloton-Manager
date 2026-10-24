import {readFileSync} from 'node:fs';
const fields=['components','fingerprint'];
function read(path){
  const data=JSON.parse(readFileSync(path,'utf8'));
  if(!data || typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!==fields.slice().sort().join(',')) throw Error('Invalid or unsafe manifest shape');
  if(!Number.isSafeInteger(data.components)||data.components<1|| !/^[0-9a-f]{32}$/.test(data.fingerprint)) throw Error('Invalid metadata fingerprint');
  return data;
}
if(process.argv.length!==4) {console.error('Usage: node scripts/verify-schema-fingerprint.mjs production.json isolated.json');process.exit(2)}
const [production,isolated]=process.argv.slice(2).map(read);
if(production.components!==isolated.components || production.fingerprint!==isolated.fingerprint){console.error('SCHEMA METADATA FINGERPRINT MISMATCH');process.exit(1)}
console.log('Schema metadata fingerprint matches. This is NOT proof of full schema/function/policy parity.');
