/* 점진 렌더(긴 표) E2E
   행이 수백 개일 때 처음엔 일부만 그리고 스크롤하면 이어 붙는다 — 그러면서도
   ① 개수 표시는 전체 기준  ② '전체 선택'은 걸러진 전체 행  ③ 검색은 아직 안 그린 행도 찾는다
   를 지켜야 한다. 눈에 안 보이는 행이 몰래 빠지면 삭제·정산이 어긋나므로 여기서 못 박는다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-progressive-e2e');
const N = 300;   // 한 묶음(60)보다 훨씬 많게

const S1=n=>({id:'s1_'+n,date:'26.08.'+String(1+(n%28)).padStart(2,'0'),name:'리스트'+n,link:'',followers:'1000',
  pa:'안민영',persona:'',feedMemo:'',hypothesis:'',reviewStatus:'검수대기',memo:''});
let savedData={ paList:['안민영'], brands:[{ id:'basetune', name:'베이스튠',
  step1Rows:Array.from({length:N},(_,i)=>S1(i)), claudeStep1Rows:[], claudeStep2Rows:[],
  step2Rows:[], shippingRows:[], reviewRows:[], privacyRows:[] }], settlements:{} };
let rev=1;
const PORT=8937;
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
    if(b.action==='save'){ savedData=b.data; rev++; return send({ok:true,rev}); }
    return send({ok:true}); });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9341',
  '--window-size=1400,900','--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9341/json/version')).json(); return j.webSocketDebuggerUrl; }
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
// 데이터 행 수 — 맨 끝의 '더 보입니다' 안내행(colspan)은 뺀다
const dataRows=()=>evalJs("[...document.querySelectorAll('tbody tr')].filter(tr=>!tr.querySelector('td[colspan]')).length");
const setInput=(sel,val)=>evalJs("(()=>{const i=document.querySelector('"+sel+"');"+
  "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"+
  "set.call(i,'"+val+"'); i.dispatchEvent(new Event('input',{bubbles:true}));})()");

await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await waitFor("document.querySelectorAll('.step-tab').length>0",'앱 로딩');
await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('STEP1')).click()");
await waitFor("document.querySelectorAll('tbody tr').length>10",'표 렌더');
await wait(800);

console.log('\n[1] 처음엔 일부만 그린다 (전체 ' + N + '행)');
const n1=await dataRows();
ok(n1>0 && n1<N, '처음 그린 행 '+n1+'개 < 전체 '+N+'개');
ok(await evalJs("!!document.querySelector('tbody td[colspan]')"), '표 끝에 "더 보입니다" 안내행이 있다');

console.log('\n[2] 개수 표시는 전체 기준');
const cntTxt=await evalJs("(document.querySelector('.cnt')||{}).textContent||''");
ok(cntTxt.includes(String(N)), '상단 개수 표시 "'+cntTxt+'" 가 전체 '+N+' 을 말한다');

console.log('\n[3] 아래로 내리면 이어서 그려진다');
await evalJs("(()=>{const w=document.querySelector('.table-wrap'); w.scrollTop=w.scrollHeight; return w.scrollTop;})()");
await wait(1200);
const n2=await dataRows();
ok(n2>n1, '스크롤 후 '+n1+' → '+n2+' 행으로 늘었다');

console.log('\n[4] 전체 선택은 안 그려진 행까지 전부');
await evalJs("document.querySelector('thead .sel-box').click()");
await waitFor("/선택됨/.test(document.body.innerText)",'선택 바');
const bar=await evalJs("(document.body.innerText.match(/(\\d+)\\s*명?\\s*선택됨/)||[])[1]||''");
ok(bar===String(N), '"'+bar+'" 선택 — 화면에 안 그려진 행까지 전부('+N+')');
await evalJs("document.querySelector('thead .sel-box').click()");

console.log('\n[5] 검색은 아직 안 그린 행도 찾는다');
await setInput('input.srch','리스트299');
await wait(1000);
const found=await evalJs("[...document.querySelectorAll('tbody tr')].map(t=>t.innerText).join('|')");
ok(found.includes('리스트299'), '맨 끝(300번째) 행도 검색으로 나온다');
const n3=await dataRows();
ok(n3===1, '검색 결과 1행만 남았다 (실제 '+n3+')');

console.log('\n[6] 검색을 지우면 다시 처음 묶음부터');
await setInput('input.srch','');
await wait(1000);
const n4=await dataRows();
ok(n4>0 && n4<N, '다시 '+n4+'행부터 (전체를 한 번에 그리지 않는다)');

console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과');
try{ chrome.kill(); }catch{}
server.close();
process.exit(fail?1:0);
