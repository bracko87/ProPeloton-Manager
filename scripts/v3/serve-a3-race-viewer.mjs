/** Read-only, localhost-only A3 race viewer.
 * Start explicitly with: node scripts/v3/serve-a3-race-viewer.mjs
 * Does not import the application shell, auth, Supabase or race publishers.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createViewerReplayV3,validateSandboxSelection}
  from './a3ViewerReplayV3.mjs';
const ROOT=new URL('./viewer/',import.meta.url);
const STATIC=new Map([
 ['/','index.html'],['/viewer.js','viewer.js'],
 ['/viewer.css','viewer.css']
]);
const TYPES={'.html':'text/html; charset=utf-8',
 '.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8'};
const HEADERS={
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer',
 'Cross-Origin-Resource-Policy':'same-origin',
 'Content-Security-Policy':[
  "default-src 'none'",
  "script-src 'self'","style-src 'self'",
  "img-src 'self' data:","font-src 'self'",
  "connect-src 'self'","form-action 'none'",
  "base-uri 'none'","frame-ancestors 'none'"
 ].join('; ')
};
function send(res,status,type,body){
 res.writeHead(status,{...HEADERS,'Content-Type':type});
 res.end(body);
}
const cached=new Map();
export function createA3ViewerHttpServer(){
 return createServer(async(req,res)=>{
  try{
   if(req.method!=='GET'){
    send(res,405,'text/plain; charset=utf-8','GET only');return;
   }
   const requestUrl=new URL(req.url??'/', 'http://127.0.0.1');
   if(requestUrl.pathname==='/api/replay'){
    if(requestUrl.search.length>150){
     send(res,400,'text/plain; charset=utf-8','Invalid query');return;
    }
    let selected;
    try{selected=validateSandboxSelection({
      riders:requestUrl.searchParams.get('riders')??32,
      layout:requestUrl.searchParams.get('layout')??'staged',
      scenario:requestUrl.searchParams.get('scenario')??'standard'
    });}catch{
     send(res,400,'application/json; charset=utf-8',
       JSON.stringify({error:'Invalid synthetic sandbox selection'}));return;
    }
    const key=JSON.stringify(selected);
    if(!cached.has(key))
      cached.set(key,Promise.resolve().then(()=>
        createViewerReplayV3(selected)));
    let result;
    try{result=await cached.get(key);}
    catch(error){
      cached.delete(key);
      throw error;
    }
    send(res,200,'application/json; charset=utf-8',JSON.stringify(result));
    return;
   }
   const asset=STATIC.get(requestUrl.pathname);
   if(!asset){
    send(res,404,'text/plain; charset=utf-8','Not found');return;
   }
   const file=new URL(asset,ROOT);
   const type=TYPES[asset.slice(asset.lastIndexOf('.'))];
   const contents=await readFile(file);
   send(res,200,type,contents);
  }catch(error){
   console.error('[V3 local viewer]',error);
   send(res,500,'application/json; charset=utf-8',
    JSON.stringify({error:'Local simulation failed; no race data changed'}));
  }
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const port=Number(process.env.V3_VIEWER_PORT??4179);
 if(!Number.isInteger(port)||port<1024||port>65535)
  throw Error('Invalid V3_VIEWER_PORT');
 const server=createA3ViewerHttpServer();
 server.listen(port,'127.0.0.1',()=>{
  console.log('V3 LOCAL-ONLY SANDBOX http://127.0.0.1:'+port);
  console.log('Read-only synthetic race snapshots: no Supabase or official races');
 });
}
