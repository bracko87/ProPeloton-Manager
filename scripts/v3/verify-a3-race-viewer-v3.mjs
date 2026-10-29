/**
 * Exact original alternate A3 research engine to browser payload.
 * The server is bound only to localhost, GET-only, no DB and no writes.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createViewerReplayV3,validateSandboxSelection}
  from './a3ViewerReplayV3.mjs';
import {createA3ViewerHttpServer}
  from './serve-a3-race-viewer.mjs';
import {a3GradientV3}
  from './a3RiderPerformanceV3.mjs';

const chosen=[
 {riders:32,layout:'staged',scenario:'standard'},
 {riders:106,layout:'double',scenario:'standard'},
 {riders:168,layout:'staged',scenario:'standard'},
 {riders:32,layout:'staged',scenario:'attack'}
];
const cases=[];
for(const option of chosen){
 const data=createViewerReplayV3(option);
 assert.equal(data.syntheticOnly,true);
 assert.equal(data.callsSupabase,false);
 assert.equal(data.publishesRaceResults,false);
 assert.equal(data.officialWrites,0);
 assert.equal(data.atomicLogicalLaneHandoffs,true);
 assert.equal(data.frames.length,181);
 assert.equal(data.frames[0].second,0);
 assert.equal(data.frames[180].second,180);
 assert.equal(data.frames[180].riders.length,option.riders);
 assert.equal(data.final.passedBoth,option.riders);
 assert(data.final.minimumRecordedLaneGap>=1.85-1e-5);
 assert(data.final.minimumRecordedSpeed>=6.5);
 assert(data.road.profile.some(r=>r.grade>0));
 assert.equal(data.road.profile.find(r=>r.x===1250)?.grade,
   a3GradientV3(option.layout,1250));
 assert(data.frames.every(f=>f.riders.length===option.riders));
 for(const frame of data.frames){
   assert.equal(new Set(frame.riders.map(r=>r.id)).size,option.riders);
   assert(frame.groups.every(g=>g.size>=1));
   assert.equal(frame.groups.reduce((sum,g)=>sum+g.size,0),
     option.riders);
   assert(frame.riders.every(r=>r.energy>=0&&r.energy<=23000));
 }
 if(option.scenario==='attack')
   assert(data.frames.some(f=>f.activeAttacks>0));
 const info={...option,frames:data.frames.length,
   lastTime:data.frames[180].second,
   passedBoth:data.final.passedBoth,
   lastGroups:data.final.groups,
   firstFrameRiders:data.frames[0].riders.length,
   checksum:data.replayHash,bytes:Buffer.byteLength(JSON.stringify(data))};
 cases.push(info);
 console.log('A3_VIEWER_RACE '+JSON.stringify(info));
}
const once=createViewerReplayV3(chosen[0]);
const again=createViewerReplayV3(chosen[0]);
assert.deepEqual(again,once,'full local simulation must replay identically');
for(const bad of [{riders:169},{layout:'unknown'},{scenario:'breakaway'},
 {riders:'oops'},{riders:0}]){
 assert.throws(()=>validateSandboxSelection(bad),RangeError);
}
const server=createA3ViewerHttpServer();
await new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
try{
 const port=server.address().port,base='http://127.0.0.1:'+port;
 for(const [path,expected,contentType] of [
  ['/',200,'text/html'],
  ['/viewer.js',200,'text/javascript'],
  ['/viewer.css',200,'text/css'],
  ['/not-real',404,'text/plain'],
  ['/api/replay?riders=169',400,'application/json']
 ]){
  const resp=await fetch(base+path);
  assert.equal(resp.status,expected,path);
  assert(resp.headers.get('content-type')?.startsWith(contentType));
  assert.equal(resp.headers.get('access-control-allow-origin'),null);
  const body=await resp.text();
  if(path==='/')assert(body.includes('PROPELOTON / RESEARCH LAB'));
  if(path==='/viewer.js')assert(body.includes('drawRoad'));
  if(path==='/viewer.css')assert(body.includes('.road-container'));
 }
 const method=await fetch(base+'/api/replay',{method:'POST'});
 assert.equal(method.status,405);
 const rep=await fetch(base+'/api/replay?riders=32&layout=staged&scenario=standard');
 assert.equal(rep.status,200);
 const apiData=await rep.json();
 assert.equal(apiData.replayHash,once.replayHash);
 assert.equal(apiData.frames.length,181);
 assert.equal(apiData.officialWrites,0);
 assert.equal(apiData.final.passedBoth,32);
 const repeated=await fetch(base+'/api/replay?riders=32&layout=staged&scenario=standard');
 assert.equal((await repeated.json()).replayHash,once.replayHash);
}finally{
 server.closeAllConnections();
 await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
for(const file of ['./viewer/index.html','./viewer/viewer.js',
 './viewer/viewer.css']){
 const text=await readFile(new URL(file,import.meta.url),'utf8');
 assert(text.length>500);
}
console.log('A3_VIEWER_LOCAL_SERVICE_REPORT '+JSON.stringify({
 status:'PASS',fields:cases.length,results:cases,
 full180Replay:true,individualRiderFrames:true,
 exactReplayHash:true,
 syntheticClimbAndAttacks:true,readOnlyLocalHTTP:true,
 rejectsInvalidRequests:true,neverTouchesSupabase:true,
 noProductionActivation:true}));
