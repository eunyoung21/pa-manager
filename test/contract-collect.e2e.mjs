/* 영상검수 탭 [📥 계약서 수집] 버튼 E2E
   목백엔드 + 실제 크롬(CDP)으로 index.html 을 그대로 띄운다.
   보는 것: 관리자·알바 둘 다 버튼이 있는가 / 눌렀을 때 collectRun 이 가는가 /
            queued→running→done 진행이 화면에 보이는가 / 결과 건수가 맞는가 /
            소급 수집(mode:all)은 관리자만 보내는가 / 실패를 화면에 말하는가.
   ※ 이 앱은 메일함을 만지지 않는다. 요청만 넣고 회수기가 대신 도는 구조라
     여기서 검증할 것은 "요청이 제대로 가고, 결과가 제대로 보이는가" 까지다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-collect-e2e');

const RV=n=>({id:'rv_'+n,date:'26.08.0'+n,channelName:'검수'+n,realName:'',pa:'안민영',paCode:'',postLink:'',live:'N',contractDone:'N',checks:{}});
let savedData = { paList:['안민영'], brands: [
  { id:'basetune', name:'베이스튠', step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[],
    step2Rows:[], shippingRows:[], reviewRows:[1,2].map(RV), privacyRows:[] },
], settlements:{} };
let rev=1;

// 로그인 응답(테스트마다 관리자/알바로 바꾼다) + 회수기 흉내
let who = {role:'manager', username:'이은영', brand:'all'};
let runs = [];            // 받은 collectRun 요청들
let states = [];          // collectState 가 순서대로 돌려줄 응답
let failRun = false;      // collectRun 을 실패시키는 스위치

const PORT=8941;
const server = http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html = fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify(${JSON.stringify({token:'T',...who})}));</script>`);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{
    const b=JSON.parse(body||'{}');
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='users'||b.action==='logs') return send({ok:true,users:[],logs:[]});
    if(b.action==='login') return send({ok:true,token:'T',...who});
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){ savedData=b.data; rev++; return send({ok:true,rev}); }
    if(b.action==='collectRun'){
      runs.push(b);
      if(failRun) return send({error:'요청함에 적지 못했습니다'});
      return send({ok:true,req:{at:1,by:who.username,mode:b.mode||'now'},res:{state:'queued',at:1}});
    }
    if(b.action==='collectState'){
      const s = states.length>1 ? states.shift() : states[0];
      return send({ok:true,req:{at:1},res:s});
    }
    return send({ok:true});
  });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9341',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
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
  for(;;){ if(await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,250)); }
}
let fail=0;
const chk=(c,m,extra)=>{ console.log((c?'  PASS ':'  FAIL ')+m+(c||extra===undefined?'':'  -> '+JSON.stringify(extra))); if(!c) fail++; };
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clickText=t=>evalJs(`(()=>{const t=${JSON.stringify(t)};const all=[...document.querySelectorAll('button,a,div[role=button]')];
  const b=all.find(x=>x.textContent.trim()===t)||all.find(x=>x.textContent.includes(t));
  if(!b)throw new Error('없음: '+t);b.click();return 1})()`);
const clickCollect=(shift=false)=>evalJs(`(()=>{const b=document.querySelector('.cc-btn');
  if(!b)throw new Error('계약서 수집 버튼 없음');
  b.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:${shift?'true':'false'}}));return 1})()`);
const msg=()=>evalJs(`(document.querySelector('.cc-msg')||{}).textContent||''`);
const btnTxt=()=>evalJs(`(document.querySelector('.cc-btn')||{}).textContent||''`);

async function openApp(){
  await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
  await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('영상검수'))`,'앱 로딩');
  await evalJs(`(window.confirm=()=>true,1)`);   // 소급 수집 확인창은 항상 예
  await clickText('영상검수');
  await waitFor(`document.querySelector('.cc-btn')`,'검수 툴바');
  await wait(300);
}

/* ── 1) 관리자: 눌러서 끝까지 ───────────────────────────────── */
console.log('\n[관리자]');
who={role:'manager',username:'이은영',brand:'all'};
states=[{state:'queued',at:1},{state:'running',at:2},{state:'done',at:3,saved:2,dup:1,check:0,threads:12}];
runs=[];
await openApp();

const bar = await evalJs(`(()=>{const t=document.querySelector('.toolbar');return t?t.innerText:''})()`);
chk(bar.includes('계약서 수집'), '툴바에 [계약서 수집] 있음', bar);
chk(bar.indexOf('드라이브')>=0 && bar.indexOf('계약서 수집')>bar.indexOf('드라이브'), '드라이브 버튼 바로 옆', bar);

await clickCollect(); await wait(600);
chk(runs.length===1, 'collectRun 요청이 갔다', runs);
chk(runs[0] && runs[0].token==='T', '로그인 토큰을 달고 간다', runs[0]&&runs[0].token);
chk(!runs[0].mode, '평소 클릭은 소급이 아니다(mode 없음)', runs[0]);
chk((await btnTxt()).includes('수집 중'), '누르는 동안 버튼이 잠긴다', await btnTxt());
chk(await evalJs(`document.querySelector('.cc-btn').disabled`)===true, '연타 방지로 비활성화');

await waitFor(`(document.querySelector('.cc-msg')||{}).textContent.includes('수집 중…')`,'running 표시',15000);
chk(true, '회수기가 시작하면 "수집 중…" 으로 바뀐다');

await waitFor(`(document.querySelector('.cc-msg')||{}).textContent.includes('저장')`,'done 표시',20000);
const m1=await msg();
chk(m1.includes('저장 2')&&m1.includes('이미저장 1')&&m1.includes('확인필요 0'), '결과 건수를 그대로 보여준다', m1);
chk(await evalJs(`document.querySelector('.cc-btn').disabled`)===false, '끝나면 다시 누를 수 있다');

// 소급 수집은 관리자만 — Shift+클릭
runs=[]; states=[{state:'done',at:9,saved:0,dup:0,check:0}];
await clickCollect(true); await wait(600);
chk(runs.length===1 && runs[0].mode==='all', '관리자 Shift+클릭 = 소급 수집(mode:all)', runs[0]);

/* ── 2) 알바: 같은 버튼이 그대로 된다 ───────────────────────── */
console.log('\n[알바(스태프)]');
who={role:'staff',username:'안민영',brand:'all',tabs:'review,shipping'};
states=[{state:'queued',at:1},{state:'running',at:2},{state:'done',at:3,saved:1,dup:0,check:1}];
runs=[];
await openApp();
chk(await evalJs(`!!document.querySelector('.cc-btn')`), '알바 화면에도 버튼이 있다');
await clickCollect(true);   // 알바가 Shift 를 눌러도 소급이 되면 안 된다
await wait(600);
chk(runs.length===1, '알바도 요청이 간다', runs);
chk(!runs[0].mode, '알바는 Shift 를 눌러도 소급 요청을 못 보낸다', runs[0]);
await waitFor(`(document.querySelector('.cc-msg')||{}).textContent.includes('저장')`,'알바 결과',20000);
chk((await msg()).includes('확인필요 1'), '알바도 결과를 본다', await msg());

/* ── 3) 실패는 화면에 말한다 ────────────────────────────────── */
console.log('\n[실패 표시]');
failRun=true; runs=[];
await clickCollect(); await wait(800);
chk((await msg()).includes('실패'), '요청 자체가 실패하면 그렇게 말한다', await msg());
chk(await evalJs(`document.querySelector('.cc-btn').disabled`)===false, '실패해도 버튼이 잠기지 않는다');

console.log(fail? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
try{ ws.close(); }catch{}
chrome.kill(); server.close();
process.exit(fail?1:0);
