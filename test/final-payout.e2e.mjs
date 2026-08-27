/* 최종 완료 = 수당 기준 E2E
   목백엔드 + 실제 크롬(CDP)으로 index.html 을 그대로 띄워 버튼을 눌러 확인한다.
   1) 옛 '협업성사 Y' 행이 최종완료 Y(완료일=성사일)로 이관돼 과거 수당이 유지되는가
   2) 협업성사만 켜면 수당 0, 최종완료를 켜야 2만원이 잡히는가
   3) 정산 탭 집계가 완료일 기준 달로 들어가는가
   4) 협업성사를 끄면 최종완료도 같이 풀리는가                                            */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-final-e2e');

const td=new Date(), Y=String(td.getFullYear()).slice(2), M=String(td.getMonth()+1).padStart(2,'0'), D=String(td.getDate()).padStart(2,'0');
const TODAY=`${Y}.${M}.${D}`, THISYM=`${td.getFullYear()}-${M}`;

let savedData = { paList:['안민영','권미림'], brands: [
  { id:'basetune', name:'베이스튠',
    step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[], shippingRows:[], reviewRows:[], privacyRows:[],
    step2Rows:[
      // 옛 데이터: 최종완료 키 자체가 없음 (= 이 변경 전에 성사 체크된 건)
      {id:'r1',date:'26.07.01',name:'레거시성사',link:'',followers:'',pa:'안민영',contactStatus:'컨택 완료',
       dmSent:'Y',dmDate:'26.07.02',dealDone:'Y',dealDate:'26.07.10',rate:'300000',memo:''},
      {id:'r2',date:'26.08.01',name:'신규건',link:'',followers:'',pa:'권미림',contactStatus:'진행중',
       dmSent:'Y',dmDate:TODAY,dealDone:'N',dealDate:'',finalDone:'N',finalDate:'',rate:'',memo:''},
    ] },
], settlements:{} };
let rev=1;
const server = http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html = fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.on('data',c=>body+=c);
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
const PORT=8934;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9336',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9336/json/version')).json(); return j.webSocketDebuggerUrl; }
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
const clickText=t=>evalJs(`(()=>{const b=[...document.querySelectorAll('button,a,div[role=button]')].find(x=>x.textContent.trim()===${JSON.stringify(t)});if(!b)throw new Error('없음: '+${JSON.stringify(t)});b.click();return 1})()`);
// 이름으로 행 찾아 그 행의 셀/버튼 다루기
const ROW=n=>`[...document.querySelectorAll('tbody tr')].find(tr=>tr.innerText.includes(${JSON.stringify(n)}))`;
const cellText=(n,label)=>evalJs(`(${ROW(n)}).querySelector('td[data-label=${JSON.stringify(label)}]').innerText.trim()`);
const clickYN=(n,label)=>evalJs(`((${ROW(n)}).querySelector('td[data-label=${JSON.stringify(label)}] button').click(),1)`);

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('STEP2 컨택현황'))`,'앱 로딩');
await clickText('📨 STEP2 컨택현황');
await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황 표');
console.log('앱 로딩 완료');

console.log('\n[1] 옛 성사건 -> 최종완료로 이관');
chk(await cellText('레거시성사','최종완료')==='Y','옛 협업성사 Y → 최종완료 Y');
chk(await cellText('레거시성사','완료일')==='26.07.10','완료일 = 옛 성사일',await cellText('레거시성사','완료일'));
chk((await cellText('레거시성사','완료수당')).includes('20,000'),'옛 건 수당 유지',await cellText('레거시성사','완료수당'));

console.log('\n[2] 협업성사만 켜면 수당 없음');
await clickYN('신규건','협업성사');
await new Promise(r=>setTimeout(r,300));
chk(await cellText('신규건','협업성사')==='Y','협업성사 Y');
chk(await cellText('신규건','성사일')===TODAY,'성사일 오늘 자동기록',await cellText('신규건','성사일'));
chk(await cellText('신규건','최종완료')==='N','최종완료는 아직 N');
chk((await cellText('신규건','완료수당')).trim()==='0원','수당 0원',await cellText('신규건','완료수당'));

console.log('\n[3] 최종완료를 켜야 수당 2만');
await clickYN('신규건','최종완료');
await new Promise(r=>setTimeout(r,300));
chk(await cellText('신규건','최종완료')==='Y','최종완료 Y');
chk(await cellText('신규건','완료일')===TODAY,'완료일 오늘 자동기록',await cellText('신규건','완료일'));
chk((await cellText('신규건','완료수당')).includes('20,000'),'수당 20,000원',await cellText('신규건','완료수당'));

console.log('\n[4] 정산 탭 — 완료일 달로 집계');
await clickText('💰 정산');
await waitFor(`document.body.innerText.includes('완료 수당')`,'정산 화면');
await evalJs(`(()=>{const s=document.querySelector('select');s.value=${JSON.stringify(THISYM)};
  s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await new Promise(r=>setTimeout(r,400));
const settleTxt=await evalJs(`document.body.innerText`);
chk(/권미림/.test(settleTxt),'이번 달 정산에 권미림 등장');
chk(/22,000원/.test(settleTxt),'DM 2천 + 완료 2만 = 22,000원',settleTxt.match(/[\d,]+원/g)?.slice(0,8));
chk(!/안민영/.test(settleTxt),'7월 완료건(안민영)은 이번 달에 안 잡힘');
await evalJs(`(()=>{const s=document.querySelector('select');s.value='2026-07';
  s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await new Promise(r=>setTimeout(r,400));
const julyTxt=await evalJs(`document.body.innerText`);
chk(/안민영/.test(julyTxt),'7월 정산에 안민영(옛 성사건) 유지');
chk(/22,000원/.test(julyTxt),'7월 DM 2천 + 완료 2만',julyTxt.match(/[\d,]+원/g)?.slice(0,8));

console.log('\n[5] 협업성사를 끄면 최종완료도 풀림');
await clickText('📨 STEP2 컨택현황');
await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황 복귀');
await clickYN('신규건','협업성사');
await new Promise(r=>setTimeout(r,300));
chk(await cellText('신규건','협업성사')==='N','협업성사 N');
chk(await cellText('신규건','최종완료')==='N','최종완료도 N');
chk((await cellText('신규건','완료수당')).trim()==='0원','수당 다시 0원');

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
