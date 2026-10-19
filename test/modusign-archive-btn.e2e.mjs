/* 영상검수 탭 [📥 모두싸인 완료본 가져오기] 버튼 E2E (2026-10-19 메일 회수기 [계약서 수집] 버튼을 대체)
   목백엔드 + 목 모두싸인 발송기(브리지) + 실제 크롬(CDP).
   보는 것: 관리자만 버튼 · 누르면 브리지 /archive?run=1 · 결과(가져온 이름·없음·드라이브 실패·로그인 풀림·꺼짐)를 말하는가 · 옛 수집 버튼은 없다 */
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
let who = {role:'manager', username:'이은영', brand:'all'};
let calls = 0, archReply = null, bridgeOn = true;
const PORT=8941, BPORT=8942;
const bridge = http.createServer((req,res)=>{
  if(!bridgeOn){ req.socket.destroy(); return; }
  res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  if(req.url.startsWith('/archive')){ calls++; return res.end(JSON.stringify(archReply)); }
  res.end(JSON.stringify({ok:true,items:[]}));
});
await new Promise(r=>bridge.listen(BPORT,'127.0.0.1',r));
const server = http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html = fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api'; window.MS_BRIDGE='http://127.0.0.1:${BPORT}';
       localStorage.setItem('pa_mgr_auth', JSON.stringify(${JSON.stringify({token:'T',...who})}));</script>`);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{
    const b=JSON.parse(body||'{}');
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){ savedData=b.data; rev++; return send({ok:true,rev}); }
    return send({ok:true,users:[],logs:[]});
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

const BTN='.ms-arch-btn', MSG='.ms-arch-msg';
const click=()=>evalJs(`(()=>{const b=document.querySelector('${BTN}');if(!b)throw new Error('버튼 없음');b.click();return 1})()`);
const msg=()=>evalJs(`(document.querySelector('${MSG}')||{}).textContent||''`);
const waitMsg=(t,l)=>waitFor(`(document.querySelector('${MSG}')||{}).textContent.includes(${JSON.stringify(t)})`,l,15000);
async function openApp(){
  await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
  await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('영상검수'))`,'앱 로딩');
  await clickText('영상검수');
  await waitFor(`document.querySelector('.toolbar')&&document.querySelector('.toolbar').innerText.includes('드라이브')`,'검수 툴바');
  await wait(300);
}

console.log('\n[관리자]');
await openApp();
const bar=await evalJs(`document.querySelector('.toolbar').innerText`);
chk(bar.includes('모두싸인 완료본 가져오기'), '툴바에 [모두싸인 완료본 가져오기]', bar);
chk(!bar.includes('계약서 수집') && !(await evalJs(`!!document.querySelector('.cc-btn')`)), '옛 [계약서 수집] 버튼 없음', bar);

archReply={ok:true,last:{at:'x',checked:3,saved:[{name:'최진영',drive:true,err:''},{name:'김우진',drive:true,err:''}]}};
calls=0; await click(); await waitMsg('건 가져옴','가져옴 표시');
chk(calls===1, '브리지 /archive?run=1 한 번 부름', calls);
chk((await msg()).includes('2건 가져옴: 최진영, 김우진'), '가져온 건수·이름 표시', await msg());
chk(await evalJs(`document.querySelector('${BTN}').disabled`)===false, '끝나면 다시 누를 수 있음');

archReply={ok:true,last:{at:'x',checked:4,saved:[]}};
await click(); await waitMsg('없음','없음 표시');
chk((await msg()).includes('서명 기다리는 4건'), '새로 끝난 게 없으면 그렇게 말함', await msg());

archReply={ok:true,last:{at:'x',checked:1,saved:[{name:'박해트',drive:false,err:'드라이브 폴더 미지정 (hattke/계약서파일)'}]}};
await click(); await waitMsg('드라이브 실패','드라이브 실패 표시');
chk((await msg()).includes('폴더 미지정') && (await msg()).includes('완료계약서'), '드라이브 실패 이유 + PC엔 저장됨 안내', await msg());

archReply={ok:true,last:{at:'x',error:'모두싸인 로그인이 풀렸습니다'}};
await click(); await waitMsg('로그인','로그인 풀림');
chk((await msg()).startsWith('실패'), '로그인 풀림을 말함', await msg());

bridgeOn=false;
await click(); await waitMsg('꺼져','꺼짐');
chk((await msg()).includes('모두싸인 계약서 발송.bat'), '발송기 꺼짐 → 켜라는 안내', await msg());
bridgeOn=true;

console.log('\n[알바]');
who={role:'staff',username:'안민영',brand:'all',tabs:'review,shipping'};
await openApp();
chk(!(await evalJs(`!!document.querySelector('${BTN}')`)), '알바에겐 버튼 없음(발송기는 관리자 PC에만)');

console.log(fail? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
try{ ws.close(); }catch{}
chrome.kill(); server.close(); bridge.close();
process.exit(fail?1:0);
