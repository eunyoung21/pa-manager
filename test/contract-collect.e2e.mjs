/* 영상검수 탭 [📥 계약서 수집] 버튼 E2E
   목백엔드 + 실제 크롬(CDP)으로 index.html 을 그대로 띄운다.
   보는 것: 버튼이 드라이브 옆에 있는가 / 주소를 물어보는가 / 그 주소를 ?run=1 로 여는가 /
            한 번 넣은 주소는 다시 안 묻는가 / 엉뚱한 주소는 막는가. */
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
const PORT=8941;
const server = http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html = fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{
    const b=JSON.parse(body||'{}');
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='users'||b.action==='logs') return send({ok:true,users:[],logs:[]});
    if(b.action==='login') return send({ok:true,token:'T',username:'테스터',role:'manager',brand:'all'});
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){ savedData=b.data; rev++; return send({ok:true,rev}); }
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

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('STEP2 컨택현황'))`,'앱 로딩');
console.log('앱 로딩 완료');

// 새 창·물음창을 가로채 기록만 한다(진짜로 열지 않는다)
const stub = (answer)=>evalJs(`(()=>{
  window.__opened=[]; window.__asked=[]; window.__alerts=[];
  window.open=(u,n,f)=>{ window.__opened.push(u); return {focus(){}}; };
  window.prompt=(m,d)=>{ window.__asked.push(m); return ${JSON.stringify(answer)}; };
  window.alert=m=>{ window.__alerts.push(m); };
  return 1})()`);
const opened=()=>evalJs(`window.__opened`);
const asked =()=>evalJs(`window.__asked`);
const alerts=()=>evalJs(`window.__alerts`);
const clickCollect=()=>evalJs(`(()=>{const b=document.querySelector('.cc-btn');
  if(!b)throw new Error('계약서 수집 버튼 없음');b.click();return 1})()`);

console.log('\n[영상검수 탭]');
await clickText('영상검수');
await waitFor(`document.querySelector('tbody td.del-col')`,'검수 표');
await wait(300);

// 1) 버튼이 드라이브 옆에 있다
const bar = await evalJs(`(()=>{const t=document.querySelector('.toolbar');return t?t.innerText:''})()`);
chk(bar.includes('계약서 수집'), '툴바에 [계약서 수집] 있음', bar);
chk(bar.indexOf('드라이브')>=0 && bar.indexOf('계약서 수집')>bar.indexOf('드라이브'), '드라이브 버튼 바로 옆', bar);

// 2) 주소가 없으면 물어보고, 그 주소를 ?run=1 로 연다
await evalJs(`(localStorage.removeItem('pa_contract_collector_url'),1)`);
await stub('https://script.google.com/macros/s/ABC123/exec');
await clickCollect(); await wait(200);
chk((await asked()).length===1, '주소가 없으면 한 번 물어본다', await asked());
chk((await opened())[0]==='https://script.google.com/macros/s/ABC123/exec?run=1', '?run=1 을 붙여 연다', await opened());
chk(await evalJs(`localStorage.getItem('pa_contract_collector_url')`)==='https://script.google.com/macros/s/ABC123/exec', '주소를 이 브라우저에 기억', await evalJs(`localStorage.getItem('pa_contract_collector_url')`));

// 3) 두 번째부터는 묻지 않는다
await stub('');
await clickCollect(); await wait(200);
chk((await asked()).length===0, '두 번째 클릭은 묻지 않음', await asked());
chk((await opened())[0]==='https://script.google.com/macros/s/ABC123/exec?run=1', '기억한 주소로 바로 연다', await opened());

// 4) 엉뚱한 주소는 막는다 (주소를 지운 상태에서)
await evalJs(`(localStorage.removeItem('pa_contract_collector_url'),1)`);
await stub('https://example.com/hello');
await clickCollect(); await wait(200);
chk((await opened()).length===0, '웹앱 주소가 아니면 열지 않음', await opened());
chk((await alerts()).length===1, '왜 안 되는지 알려준다', await alerts());
chk(await evalJs(`localStorage.getItem('pa_contract_collector_url')`)===null, '엉뚱한 주소는 저장도 안 함');

console.log(fail? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
try{ ws.close(); }catch{}
chrome.kill(); server.close();
process.exit(fail?1:0);
