/* 영상검수 'PA 코드'(광고코드) 입력이 저장 후에도 남아 있는가 — 실제 크롬 E2E
   사용자 신고: 영상검수에 광고코드를 넣고 저장하면 그 내용이 사라진다.
   여기서 ① 입력 → 자동저장 ② 새로고침 ③ 다른 사람이 그 사이 저장(동시편집)
   ④ 아직 안 그려진 행 ⑤ 연속 입력 까지 전부 코드가 살아남는지 못 박는다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-reviewcode-e2e');
const N = 120;   // 한 묶음(60)보다 많게 — 점진 렌더 상태에서도 확인

const RV=n=>({id:'rv_'+n,date:'26.08.'+String(1+(n%28)).padStart(2,'0'),channelName:'@ch'+n,realName:'검수'+n,
  pa:'안민영',paCode:'',postLink:'',live:'N',contractDone:'N',checks:{}});
const S2=n=>({id:'s2_'+n,date:'26.08.'+String(1+(n%28)).padStart(2,'0'),name:'@ch'+n,link:'',followers:'1000',
  pa:'안민영',contactStatus:'진행중',dmSent:'Y',dealDone:'N',finalDone:'N',memo:''});

let savedData={ paList:['안민영'], brands:[{ id:'basetune', name:'베이스튠',
  step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[],
  step2Rows:Array.from({length:N},(_,i)=>S2(i)), shippingRows:[],
  reviewRows:Array.from({length:N},(_,i)=>RV(i)), privacyRows:[] }], settlements:{} };
let rev=1;
let saveCount=0;
const PORT=8941;
const server=http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html=fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html=html.replace('<div id="root"></div>',
      '<div id="root"></div><script>window.PA_API="http://127.0.0.1:'+PORT+'/api";'+
      'localStorage.setItem("pa_mgr_auth", JSON.stringify({token:"T",username:"테스터",role:"manager",brand:"all"}));</script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{ const b=JSON.parse(body||'{}');
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='users'||b.action==='logs') return send({ok:true,users:[],logs:[]});
    if(b.action==='login') return send({ok:true,token:'T',username:'테스터',role:'manager',brand:'all'});
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){ savedData=b.data; rev++; saveCount++; return send({ok:true,rev}); }
    return send({ok:true}); });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9351',
  '--window-size=1400,900','--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9351/json/version')).json(); return j.webSocketDebuggerUrl; }
    catch{ await new Promise(r=>setTimeout(r,300)); } }
  throw new Error('크롬 기동 실패');
}
const ws=new WebSocket(await wsUrl());
await new Promise(r=>ws.addEventListener('open',r));
let msgId=0; const waiters=new Map();
ws.addEventListener('message',ev=>{ const m=JSON.parse(ev.data);
  if(m.id&&waiters.has(m.id)){ const w=waiters.get(m.id); waiters.delete(m.id); m.error?w.rej(new Error(JSON.stringify(m.error))):w.res(m.result); } });
const send=(method,params={},sessionId)=>new Promise((res,rej)=>{ const id=++msgId; waiters.set(id,{res,rej});
  ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})); });
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const S=(m,p={})=>send(m,p,sessionId);
await S('Page.enable'); await S('Runtime.enable');
const evalJs=async expr=>{
  const r=await S('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error('JS 오류: '+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr,label,ms=25000){
  const t0=Date.now();
  for(;;){ if(await evalJs('(()=>{try{return !!('+expr+')}catch(e){return false}})()')) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,250)); }
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++; };
const srvCode=id=>{ const r=(savedData.brands[0].reviewRows||[]).find(x=>x.id===id); return r?r.paCode:'(행없음)'; };

async function openReview(){
  await waitFor("document.querySelectorAll('.step-tab').length>0",'앱 로딩');
  await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('영상검수')).click()");
  await waitFor("document.querySelectorAll('tbody tr').length>5",'영상검수 표');
  await wait(600);
}
// 채널명이 ch인 행의 PA코드 칸(6번째 td)에 코드 입력: 클릭 → 타이핑 → Enter
const ROWJS=ch=>"[...document.querySelectorAll('tbody tr')].find(t=>((t.querySelectorAll('td')[2]||{}).innerText||'').trim()==='"+ch+"')";
async function typeCode(ch,code){
  const found=await evalJs("(()=>{const tr="+ROWJS(ch)+"; if(!tr) return 'no-row';"+
    "const td=tr.querySelectorAll('td')[5]; if(!td) return 'no-td';"+
    "const v=td.querySelector('.cell-val'); if(!v) return 'no-cell'; v.click(); return 'ok';})()");
  if(found!=='ok') throw new Error('셀 못 찾음: '+found+' ('+ch+')');
  await waitFor("document.querySelector('input.cell-input')",'편집 입력칸');
  await evalJs("(()=>{const i=document.querySelector('input.cell-input');"+
    "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"+
    "set.call(i,'"+code+"'); i.dispatchEvent(new Event('input',{bubbles:true}));"+
    "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await wait(400);
}
const screenCode=ch=>evalJs("(()=>{const tr="+ROWJS(ch)+"; if(!tr) return '(행없음)';"+
  "const td=tr.querySelectorAll('td')[5]; return ((td||{}).innerText||'').trim();})()");
// 아직 안 그려진 행이면 끝까지 스크롤해 붙인다
async function ensureRow(ch){
  for(let i=0;i<12;i++){
    if(await evalJs("!!("+ROWJS(ch)+")")) return;
    await evalJs("(()=>{const w=document.querySelector('.table-wrap'); w.scrollTop=w.scrollHeight;})()");
    await wait(700);
  }
  throw new Error('행 못 찾음: '+ch);
}

await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();

console.log('\n[1] 코드를 넣으면 화면에 남고 서버에도 저장된다');
await typeCode('@ch3','ADCODE-3');
ok((await screenCode('@ch3')).includes('ADCODE-3'), '입력 직후 화면에 보인다');
await wait(3000);
ok(srvCode('rv_3')==='ADCODE-3', '서버 저장값 = "'+srvCode('rv_3')+'"');

console.log('\n[2] 새로고침해도 남아 있다');
await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();
ok((await screenCode('@ch3')).includes('ADCODE-3'), '새로고침 후 화면 = "'+(await screenCode('@ch3'))+'"');

console.log('\n[3] 다른 사람이 그 사이 저장해도(동시편집) 내 코드가 안 지워진다');
await typeCode('@ch7','ADCODE-7');
savedData=JSON.parse(JSON.stringify(savedData));
savedData.brands[0].reviewRows.find(r=>r.id==='rv_9').postLink='https://other.example';
rev++;
await wait(4000);
ok(srvCode('rv_7')==='ADCODE-7', '서버 저장값 = "'+srvCode('rv_7')+'"');
ok((await screenCode('@ch7')).includes('ADCODE-7'), '화면 = "'+(await screenCode('@ch7'))+'"');

console.log('\n[4] 아직 안 그려진(스크롤 아래) 행에 넣어도 남는다');
await ensureRow('@ch110');
await typeCode('@ch110','ADCODE-110');
await wait(3000);
ok(srvCode('rv_110')==='ADCODE-110', '서버 저장값 = "'+srvCode('rv_110')+'"');

console.log('\n[5] 연속으로 여러 행에 빠르게 입력해도 다 남는다');
for(const n of [11,12,13]) { await ensureRow('@ch'+n); await typeCode('@ch'+n,'AD-'+n); }
await wait(4000);
for(const n of [11,12,13]) ok(srvCode('rv_'+n)==='AD-'+n, 'rv_'+n+' = "'+srvCode('rv_'+n)+'"');

console.log('\n[6] 새로고침 최종 확인');
await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();
for(const [ch,code] of [['@ch3','ADCODE-3'],['@ch7','ADCODE-7'],['@ch11','AD-11']]) {
  await ensureRow(ch);
  ok((await screenCode(ch)).includes(code), ch+' = "'+(await screenCode(ch))+'"');
}

console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과');
try{ chrome.kill(); }catch{}
server.close();
process.exit(fail?1:0);
