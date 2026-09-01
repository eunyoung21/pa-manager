/* ★ 광고코드가 사라지던 진짜 상황 재현 — "동시 편집 충돌(conflict) 중에 계속 타자를 친다"
   실제 운영: 관리자가 영상검수에 광고코드를 줄줄이 넣는 동안 알바가 다른 탭에서 저장한다.
   그러면 내 저장이 conflict 로 되돌아오고, 앱은 서버 최신본을 다시 받아(앱스스크립트라 2~4초)
   병합한 결과를 화면에 덮어쓴다. 그 몇 초 사이에 친 광고코드가
     ① 병합 기준이 "몇 초 전 payload" 라서 병합 결과에 안 들어가고
     ② 덮어쓰기 직후 5초 동안은 자동저장이 통째로 생략돼(skipSave)
   화면에서도 서버에서도 사라졌다.
   이 테스트가 그 상황을 그대로 만들어 광고코드가 살아남는지 못 박는다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-reviewcode-conflict-e2e');
const N = 40;

const RV=n=>({id:'rv_'+n,date:'26.08.'+String(1+(n%28)).padStart(2,'0'),channelName:'@ch'+n,realName:'검수'+n,
  pa:'안민영',paCode:'',postLink:'',live:'N',contractDone:'N',checks:{}});
let savedData={ paList:['안민영'], brands:[{ id:'basetune', name:'베이스튠',
  step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[], step2Rows:[], shippingRows:[],
  reviewRows:Array.from({length:N},(_,i)=>RV(i)), privacyRows:[] }], settlements:{} };
let rev=1;
let nextSaveConflicts=false;   // 다음 save 를 충돌로 되돌린다(= 그 사이 남이 저장함)
let getDelayMs=0;              // 충돌 후 재조회를 느리게 — 앱스스크립트 실제 지연 흉내
let saveFails=false;           // 저장이 계속 실패하는 상황(앱스스크립트 busy·할당량)
let lastGetAt=0;               // 마지막 get 이 들어온 시각(재조회 착지 시점 맞추기용)
const T0=Date.now();
const TRACE=[];
const trace=m=>{ TRACE.push(((Date.now()-T0)/1000).toFixed(2)+'s  '+m); };
const PORT=8943;
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
    if(b.action==='get'){ lastGetAt=Date.now(); trace('get 요청'+(getDelayMs?' (지연 '+getDelayMs+'ms)':''));
      return getDelayMs?void setTimeout(()=>send({ok:true,data:savedData,rev}),getDelayMs):send({ok:true,data:savedData,rev}); }
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){
      if(saveFails){ trace('save → 실패(busy) 응답'); return send({error:'busy, retry'}); }
      const rs=(((b.data||{}).brands||[])[0]||{}).reviewRows||[];
      const pk=n=>{const r=rs.find(x=>x.id==='rv_'+n); return (r&&r.paCode)||'-';};
      trace('save baseRev='+b.baseRev+' rev='+rev+' [1]'+pk(1)+' [2]'+pk(2)+' [3]'+pk(3)+(nextSaveConflicts?' → CONFLICT':''));
      if(nextSaveConflicts){ nextSaveConflicts=false; rev++; return send({conflict:true,rev}); }
      savedData=b.data; rev++; return send({ok:true,rev});
    }
    return send({ok:true}); });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9353',
  '--window-size=1400,900','--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9353/json/version')).json(); return j.webSocketDebuggerUrl; }
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
const clog=[];
ws.addEventListener('message',ev=>{ const m=JSON.parse(ev.data);
  if(m.method==='Runtime.consoleAPICalled')
    clog.push(new Date().toISOString().slice(14,23)+' '+(m.params.args||[]).map(a=>a.value!==undefined?(typeof a.value==='object'?JSON.stringify(a.value).slice(0,120):a.value):(a.description||a.type)).join(' ').slice(0,200)); });
const evalJs=async expr=>{
  const r=await S('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error('JS 오류: '+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr,label,ms=30000){
  const t0=Date.now();
  for(;;){ if(await evalJs('(()=>{try{return !!('+expr+')}catch(e){return false}})()')) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,200)); }
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++; };
const srvCode=id=>{ const r=(savedData.brands[0].reviewRows||[]).find(x=>x.id===id); return r?String(r.paCode||''):'(행없음)'; };

const ROWJS=ch=>"[...document.querySelectorAll('tbody tr')].find(t=>((t.querySelectorAll('td')[2]||{}).innerText||'').trim()==='"+ch+"')";
async function openReview(){
  await waitFor("document.querySelectorAll('.step-tab').length>0",'앱 로딩');
  await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('영상검수')).click()");
  await waitFor("document.querySelectorAll('tbody tr').length>5",'영상검수 표');
  await wait(600);
}
async function typeCode(ch,code){
  const r=await evalJs("(()=>{const tr="+ROWJS(ch)+"; if(!tr) return 'no-row';"+
    "const td=tr.querySelectorAll('td')[5]; const v=td&&td.querySelector('.cell-val'); if(!v) return 'no-cell';"+
    "v.click(); return 'ok';})()");
  if(r!=='ok') throw new Error('셀 못 찾음: '+r+' ('+ch+')');
  await waitFor("document.querySelector('input.cell-input')",'편집 입력칸');
  await evalJs("(()=>{const i=document.querySelector('input.cell-input');"+
    "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"+
    "set.call(i,"+JSON.stringify(code)+"); i.dispatchEvent(new Event('input',{bubbles:true}));"+
    "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
}
const screenCode=ch=>evalJs("(()=>{const tr="+ROWJS(ch)+"; if(!tr) return '(행없음)';"+
  "return (tr.querySelectorAll('td')[5].innerText||'').trim();})()");
// 충돌 뒤 앱이 서버 최신본을 다시 받으러 올 때까지 대기 (lastGetAt 은 호출 전에 0으로 비워둔다)
async function waitForGet(ms=15000){
  const t0=Date.now();
  while(!lastGetAt){ if(Date.now()-t0>ms) throw new Error('재조회(get)가 안 옴'); await wait(50); }
}

await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();

console.log('\n[1] 충돌 복구가 화면에 착지하는 순간에 친 광고코드가 살아남는다');
// ★ 가장 위험한 타이밍: 충돌 복구본이 화면을 덮어쓰는 바로 그때, 방금 친 코드는
//   아직 700ms 디바운스 대기 중이라 서버에 안 올라가 있다. 그 순간을 정확히 겨냥한다.
await wait(3000);           // 로드 직후 자동저장(정규화 등)이 끝난 뒤부터 시작
getDelayMs=6000;            // 충돌 뒤 재조회가 느린 상황(앱스스크립트 실제 지연)
nextSaveConflicts=true;     // 내 첫 저장은 "그 사이 남이 저장함"으로 되돌아온다
lastGetAt=0;
await typeCode('@ch1','adcode-AAA');
await waitForGet();                        // 충돌 → 재조회 시작
const landAt=lastGetAt+getDelayMs;         // 재조회가 화면에 착지할 시각
await wait(Math.max(0, landAt-Date.now()-400));
await typeCode('@ch2','adcode-BBB');       // ← 착지 400ms 전(디바운스 대기 중) 입력
await wait(700);
await typeCode('@ch3','adcode-CCC');       // ← 착지 직후 5초 창(skipSave) 안에서 입력
await wait(12000);
ok(srvCode('rv_1')==='adcode-AAA','서버 rv_1 = "'+srvCode('rv_1')+'"');
ok(srvCode('rv_2')==='adcode-BBB','서버 rv_2 = "'+srvCode('rv_2')+'"');
ok(srvCode('rv_3')==='adcode-CCC','서버 rv_3 = "'+srvCode('rv_3')+'"');
ok((await screenCode('@ch2')).includes('adcode-BBB'),'화면 @ch2 = "'+(await screenCode('@ch2'))+'"');
ok((await screenCode('@ch3')).includes('adcode-CCC'),'화면 @ch3 = "'+(await screenCode('@ch3'))+'"');

if(process.env.PA_DEBUG){ console.log('--- 서버가 본 요청 ---'); TRACE.forEach(l=>console.log('  '+l)); }

console.log('\n[2] 새로고침해도 셋 다 남아 있다');
getDelayMs=0;
await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();
for(const [ch,code] of [['@ch1','adcode-AAA'],['@ch2','adcode-BBB'],['@ch3','adcode-CCC']])
  ok((await screenCode(ch)).includes(code), ch+' = "'+(await screenCode(ch))+'"');

console.log('\n[3] 충돌이 연달아 나도(2번 연속) 안 사라진다');
nextSaveConflicts=true; getDelayMs=1500;
await typeCode('@ch5','adcode-EEE');
await wait(900);
nextSaveConflicts=true;
await typeCode('@ch6','adcode-FFF');
await wait(9000);
ok(srvCode('rv_5')==='adcode-EEE','서버 rv_5 = "'+srvCode('rv_5')+'"');
ok(srvCode('rv_6')==='adcode-FFF','서버 rv_6 = "'+srvCode('rv_6')+'"');

console.log('\n[4] 충돌 중 남이 넣은 값도 안 지워진다(상대 입력 보존)');
getDelayMs=0;
savedData=JSON.parse(JSON.stringify(savedData));
savedData.brands[0].reviewRows.find(r=>r.id==='rv_20').paCode='adcode-남이넣은값';
rev++;
nextSaveConflicts=true;
await typeCode('@ch7','adcode-GGG');
await wait(9000);
ok(srvCode('rv_7')==='adcode-GGG','내 값 rv_7 = "'+srvCode('rv_7')+'"');
ok(srvCode('rv_20')==='adcode-남이넣은값','상대 값 rv_20 = "'+srvCode('rv_20')+'"');

// 폴링(2분)이 끼어드는 경우까지 보려면 PA_SLOW=1 — 약 2분 30초 더 걸린다
if(process.env.PA_SLOW){
  console.log('\n[5] 저장이 실패하는 동안 폴링이 서버본을 가져와도 내 광고코드가 안 지워진다 (2분 대기)');
  saveFails=true;                                   // 앱스스크립트 busy — 저장이 계속 실패
  await typeCode('@ch8','adcode-HHH');
  await wait(1500);
  savedData=JSON.parse(JSON.stringify(savedData));  // 그 사이 다른 사람이 저장(폴링이 가져올 서버본)
  savedData.brands[0].reviewRows.find(r=>r.id==='rv_25').paCode='adcode-남이넣은값2';
  rev++;
  await wait(135000);                               // 폴링 주기(120초)를 넘겨 대기
  ok((await screenCode('@ch8')).includes('adcode-HHH'),'폴링 후 화면 @ch8 = "'+(await screenCode('@ch8'))+'"');
  ok((await screenCode('@ch25')).includes('adcode-남이넣은값2'),'상대 값도 화면에 들어옴 @ch25');
  saveFails=false;                                  // 저장 복구 → 재시도가 올려야 한다
  await wait(70000);
  ok(srvCode('rv_8')==='adcode-HHH','저장 복구 후 서버 rv_8 = "'+srvCode('rv_8')+'"');
}

console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과');
try{ chrome.kill(); }catch{}
server.close();
process.exit(fail?1:0);
