/* ProPeloton A3 deterministic race viewer — local-only, read-only.
 * Renderer consumes actual verified research engine snapshots via /api/replay.
 */
'use strict';
const byId=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const palette=['#4d8ff3','#e8ac50','#44b8aa','#b697ed','#e26d81','#79a0bd'];
let replay=null,index=0,selectedId='r000',playing=false,timer=null,rate=2;
const fmtSec=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const fmtNum=(n,d=1)=>Number(n).toFixed(d);
const typeLabel=s=>String(s).replaceAll('_',' ');
const el=(tag,attrs={},text='')=>{
 const node=document.createElementNS(NS,tag);
 for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
 if(text)node.textContent=text;
 return node;
};
function setNotice(text,level=''){
 const n=byId('notice');n.textContent=text;n.className='notice '+level;
}
function stop(){
 playing=false;if(timer!==null)clearInterval(timer);timer=null;
 byId('play').textContent='▶ Play';
}
function setPlaying(value){
 if(!replay)return;
 stop();
 if(!value)return;
 if(index>=180)index=0;
 playing=true;byId('play').textContent='Ⅱ Pause';
 timer=setInterval(()=>{
  if(!replay||index>=180){stop();return;}
  setIndex(index+1);
  if(index>=180)stop();
 },1000/rate);
}
function setIndex(n){
 if(!replay)return;
 index=Math.max(0,Math.min(180,Math.round(n)));
 const frame=replay.frames[index];
 if(!frame)return;
 byId('seek').value=String(index);
 byId('current-seek').textContent=fmtSec(index);
 byId('elapsed').textContent=fmtSec(index);
 byId('metric-riders').textContent=String(frame.riders.length);
 byId('metric-groups').textContent=String(frame.groups.length);
 const gate1=frame.riders.filter(r=>r.firstGate).length;
 const gate2=frame.riders.filter(r=>r.secondGate).length;
 byId('metric-gates').textContent=gate1+' / '+gate2;
 byId('metric-attacks').textContent=String(frame.activeAttacks);
 const focus=frame.riders.find(r=>r.id===selectedId)??frame.riders[0];
 selectedId=focus.id;
 byId('camera').textContent=focus.id+' ('+typeLabel(focus.type)+')';
 drawRoad(frame,focus);
 drawElevation(frame,focus);
 drawLeaderboard(frame);
 drawRider(frame,focus);
}
function capacity(x){
 if(x<680)return 5;
 if(x<1020)return 2;
 if(x<1130&&replay.selection.layout==='staged')return 5;
 return 2;
}
function drawRoad(frame,focus){
 const svg=byId('road');svg.replaceChildren();
 const w=1200,h=320,range=390;
 const origin=focus.x-155,ending=origin+range;
 const screenX=x=>(x-origin)*w/range;
 const topAt=x=>capacity(x)===5?42:94;
 const botAt=x=>capacity(x)===5?278:226;
 svg.append(el('rect',{width:w,height:h,fill:'#24493c'}));
 // Grass diagonals and visual texture, intentionally decorative only.
 for(let i=-1;i<24;i++)svg.append(el('line',{
  x1:i*68,y1:0,x2:i*68+94,y2:320,
  stroke:'#3c6354','stroke-width':2,opacity:.17
 }));
 const pointsTop=[],pointsBottom=[];
 for(let x=origin;x<=ending+5;x+=2){
  pointsTop.push(screenX(x).toFixed(2)+','+topAt(x));
  pointsBottom.push(screenX(x).toFixed(2)+','+botAt(x));
 }
 pointsBottom.reverse();
 svg.append(el('polygon',{points:[...pointsTop,...pointsBottom].join(' '),
  fill:'#414b57',stroke:'#a5b1b9','stroke-width':3}));
 for(let x=Math.floor(origin/50)*50;x<=ending;x+=50){
  const sx=screenX(x);
  svg.append(el('line',{x1:sx,x2:sx,y1:topAt(x)+8,y2:botAt(x)-8,
   stroke:'#f0f4fa','stroke-width':1,opacity:.12,
   'stroke-dasharray':'5 9'}));
  if(x%100===0)svg.append(el('text',{x:sx+5,y:22,fill:'#cce6da',
   'font-size':13,'font-weight':700},x+' m'));
 }
 for(const v of [680,1020,1130,1470]){
  if(v<origin||v>ending)continue;
  const xx=screenX(v);
  svg.append(el('line',{x1:xx,x2:xx,y1:23,y2:296,
   stroke:v===680||v===1130?'#f3b863':'#d7e6f9',
   'stroke-width':3,'stroke-dasharray':'8 7',opacity:.88}));
  svg.append(el('text',{x:xx+7,y:308,fill:'#f5eadb','font-size':12,
   'font-weight':800},v===680||v===1130?'MERGE':'OPEN'));
 }
 const visible=frame.riders.filter(r=>r.x>=origin-3&&r.x<=ending+3);
 visible.sort((a,b)=>a.id===selectedId?1:b.id===selectedId?-1:0);
 for(const r of visible){
  const x=screenX(r.x),y=160+(r.lane-2)*36;
  if(x<0||x>w)continue;
  const focused=r.id===selectedId;
  const color=r.attack==='attacking'?'#f36c66':
   palette[(r.group-1)%palette.length];
  if(focused)svg.append(el('circle',{cx:x,cy:y,r:15,
     fill:'none',stroke:'#ffb94d','stroke-width':4}));
  svg.append(el('circle',{cx:x,cy:y,r:focused?9.5:6,
   fill:focused?'#ffbe56':color,
   stroke:'#14263c','stroke-width':1.5,opacity:focused?1:.94}));
  if(focused)svg.append(el('text',{x:x+14,y:y-14,fill:'white',
   'font-size':14,'font-weight':850},r.id));
 }
 svg.append(el('text',{x:18,y:305,fill:'#e8f7f0','font-size':13,
   'font-weight':800},visible.length+' riders in camera range'));
 svg.append(el('text',{x:1190,y:305,fill:'#e8f7f0','font-size':13,
   'font-weight':800,'text-anchor':'end'},
   'VIEW '+Math.max(0,Math.round(origin))+'–'+Math.round(ending)+' m'));
 svg.onclick=event=>{
  const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
  const matrix=svg.getScreenCTM();
  if(!matrix)return;
  const p=pt.matrixTransform(matrix.inverse());
  let best=null,d=17;
  for(const r of visible){
   const dx=screenX(r.x)-p.x,dy=160+(r.lane-2)*36-p.y;
   const magnitude=Math.hypot(dx,dy);
   if(magnitude<d){d=magnitude;best=r;}
  }
  if(best){selectedId=best.id;setIndex(index);}
 };
}
function drawElevation(frame,focus){
 const svg=byId('elevation');svg.replaceChildren();
 const points=replay.road.profile,w=1200,base=155;
 const min=500,max=2600,height=Math.max(38,...points.map(p=>p.elevation))+10;
 const cx=x=>25+1150*(x-min)/(max-min);
 const cy=y=>base-117*y/height;
 svg.append(el('line',{x1:25,y1:base,x2:1175,y2:base,
   stroke:'#cdd9e8','stroke-width':1.5}));
 for(const [left,right,color] of [[680,1020,'#c4d6f5'],[1130,1470,'#f6debb']]){
  svg.append(el('rect',{x:cx(left),y:12,width:cx(right)-cx(left),
   height:143,fill:color,opacity:.28}));
 }
 const poly='25,'+base+' '+points.map(p=>
  cx(p.x).toFixed(2)+','+cy(p.elevation).toFixed(2)).join(' ')+
  ' 1175,'+base;
 svg.append(el('polygon',{points:poly,fill:'#b8e1d6',opacity:.65}));
 const line=points.map((p,i)=>(i===0?'M':'L')+
   cx(p.x).toFixed(2)+' '+cy(p.elevation).toFixed(2)).join(' ');
 svg.append(el('path',{d:line,fill:'none',stroke:'#28978a',
   'stroke-width':3.5,'stroke-linejoin':'round'}));
 const ahead=frame.leaderX;
 for(const [x,color,label] of [[ahead,'#5285df','LEADER'],
    [focus.x,'#ef9d3c','SELECTED']]){
  if(x<500||x>2600)continue;
  svg.append(el('line',{x1:cx(x),y1:15,x2:cx(x),y2:155,
    stroke:color,'stroke-dasharray':'5 5','stroke-width':2}));
  svg.append(el('circle',{cx:cx(x),cy:16,r:5,fill:color}));
  svg.append(el('text',{x:cx(x)+7,y:24,fill:color,
    'font-size':11,'font-weight':850},label));
 }
 for(const x of [500,1000,1500,2000,2500]){
  svg.append(el('text',{x:cx(x),y:171,fill:'#7890aa',
   'font-size':12,'text-anchor':'middle'},(x/1000).toFixed(1)+' km'));
 }
}
function drawRider(frame,rider){
 const list=[...frame.riders].sort((a,b)=>b.x-a.x||a.ordinal-b.ordinal);
 const rank=list.findIndex(r=>r.id===rider.id)+1;
 const behind=(frame.leaderX-rider.x)/Math.max(rider.speed,1);
 byId('jersey').textContent=String(rider.ordinal+1).padStart(2,'0');
 byId('rider-name').textContent='Rider '+rider.id;
 byId('rider-type').textContent=typeLabel(rider.type)+' · Lane '+(rider.lane+1);
 byId('rider-speed').textContent=fmtNum(rider.speed*3.6)+' km/h';
 byId('rider-pos').textContent=rank+' / '+frame.riders.length;
 byId('rider-group').textContent='Group '+rider.group;
 byId('rider-gap').textContent=rank===1?'Leader':'+'+fmtNum(behind)+'s';
 const energy=Math.max(0,Math.min(100,rider.energy/23000*100));
 byId('energy-value').textContent=fmtNum(energy)+'%';
 byId('energy-fill').style.width=energy+'%';
 const status=rider.attack==='attacking'?'ATTACK IN PROGRESS':
  rider.attack==='recovering'?'RECOVERING AFTER ATTACK':
  rider.phase==='middle'?'WIDE ROAD SECTION':
  rider.phase==='wide'?'PREPARING FIRST MERGE':'RACING / '+typeLabel(rider.type);
 byId('rider-status').textContent=status+' · '+fmtNum(rider.x/1000,3)+
  ' km from route origin · '+(rider.firstGate?'First gate passed':'First gate ahead');
}
function drawLeaderboard(frame){
 const leaderboard=byId('leaderboard');leaderboard.replaceChildren();
 const leaders=[...frame.riders].sort((a,b)=>b.x-a.x||a.ordinal-b.ordinal);
 const visible=leaders.slice(0,12);
 if(!visible.some(r=>r.id===selectedId)){
  const match=leaders.find(r=>r.id===selectedId);
  if(match)visible.push(match);
 }
 for(const r of visible){
  const rank=leaders.findIndex(a=>a.id===r.id)+1;
  const row=document.createElement('button');
  row.type='button';row.className='ranking'+(r.id===selectedId?' active':'');
  row.setAttribute('aria-label','Select '+r.id+' position '+rank);
  const gap=(frame.leaderX-r.x)/Math.max(1,r.speed);
  const pos=document.createElement('span');pos.className='rank-no';
  pos.textContent=String(rank);
  const circle=document.createElement('span');circle.className='rank-dot';
  circle.textContent=String(r.ordinal+1);
  const name=document.createElement('span');name.className='rank-name';
  name.textContent='Rider '+r.id;
  const sub=document.createElement('small');
  sub.textContent=typeLabel(r.type)+' · G'+r.group;
  name.append(sub);
  const value=document.createElement('span');value.className='rank-gap';
  value.textContent=rank===1?'LEADER':'+'+fmtNum(gap)+'s';
  row.append(pos,circle,name,value);
  row.addEventListener('click',()=>{selectedId=r.id;setIndex(index);});
  leaderboard.append(row);
 }
}
async function generate(){
 stop();
 const old=replay;
 replay=null;
 for(const id of ['field','layout','scenario','generate'])byId(id).disabled=true;
 setNotice('Calculating the original 10 Hz research simulation locally. Building all 181 replay frames…');
 try{
  const p=new URLSearchParams({
   riders:byId('field').value,
   layout:byId('layout').value,
   scenario:byId('scenario').value
  });
  const response=await fetch('/api/replay?'+p.toString(),{
    cache:'no-store',credentials:'omit',redirect:'error'
  });
  if(!response.ok)throw Error('Simulation request failed ('+response.status+')');
  const data=await response.json();
  if(data.syntheticOnly!==true||data.officialWrites!==0||
     data.frames?.length!==181||data.final.passedBoth!==
     Number(byId('field').value))
    throw Error('Invalid or incomplete read-only race evidence');
  replay=data;index=0;selectedId='r000';
  byId('loaded-hash').textContent=data.replayHash.slice(0,12);
  setIndex(0);
  setNotice('Complete: 180 seconds simulated · '+data.final.passedBoth+
   ' riders through both gates · deterministic checksum '+
   data.replayHash.slice(0,12)+'. Synthetic local viewer only.','good');
 }catch(error){
  replay=old;
  if(replay)setIndex(index);
  setNotice('Could not generate the local research simulation: '+
    (error?.message??String(error)), 'error');
 }finally{
  for(const id of ['field','layout','scenario','generate'])
   byId(id).disabled=false;
 }
}
byId('generate').addEventListener('click',generate);
byId('play').addEventListener('click',()=>setPlaying(!playing));
byId('reset').addEventListener('click',()=>{stop();setIndex(0);});
byId('back').addEventListener('click',()=>{stop();setIndex(index-5);});
byId('forward').addEventListener('click',()=>{stop();setIndex(index+5);});
byId('seek').addEventListener('input',e=>{stop();setIndex(Number(e.target.value));});
byId('speed').addEventListener('change',e=>{
 rate=Math.max(1,Math.min(8,Number(e.target.value)||1));
 if(playing)setPlaying(true);
});
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLInputElement||
    e.target instanceof HTMLSelectElement||
    e.target instanceof HTMLButtonElement)return;
 if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
 if(e.code==='ArrowLeft'){stop();setIndex(index-1);}
 if(e.code==='ArrowRight'){stop();setIndex(index+1);}
});
// Load smallest test initially so UI is useful without further clicks.
generate();
