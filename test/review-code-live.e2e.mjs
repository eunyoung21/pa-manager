/* 영상검수 광고코드(PA 코드) 유실 재현 — 라이브 스냅샷 그대로 물려서 확인
   node test/review-code-live.e2e.mjs <라이브스냅샷.json>
   목데이터가 아니라 실제 운영 데이터(용량·행수·첨부 그대로)로 돌려야
   "실제로는 사라지는데 테스트는 통과"를 피할 수 있다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const SNAP = process.argv[2];
if(!SNAP||!fs.existsSync(SNAP)){ console.error('라이브 스냅샷 JSON 경로를 인자로 주세요'); process.exit(2); }
const TMP  = path.join(os.tmpdir(), 'pa-reviewcode-live-e2e');

let savedData=JSON.parse(fs.readFileSync(SNAP,'utf8'));
const BRAND=savedData.brands[0];
console.log('스냅샷:', (JSON.stringify(savedData).length/1024/1024).toFixed(2)+'MB',
  savedData.brands.map(b=>b.name+'(검수'+(b.reviewRows||[]).length+')').join(' '));
let rev=1, saveCount=0, lastSaveErr=null;
const PORT=8942;
const server=http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html=fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html=html.replace('<div id="root"></div>',
      '<div id="root"></div><script>window.PA_API="http://127.0.0.1:'+PORT+'/api";'+
      'localStorage.setItem("pa_mgr_auth", JSON.stringify({token:"T",username:"테스터",role:"manager",brand:"all"}));</script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{ let b={}; try{ b=JSON.parse(body||'{}'); }catch(e){ lastSaveErr='본문 파싱 실패'; }
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='users'||b.action==='logs') return send({ok:true,users:[],logs:[]});
    if(b.action==='login') return send({ok:true,token:'T',username:'테스터',role:'manager',brand:'all'});
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='pfileSave') return send({ok:true,url:'pfile:'+(++saveCount)});
    if(b.action==='save'){ savedData=b.data; rev++; saveCount++; return send({ok:true,rev}); }
    return send({ok:true}); });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9352',
  '--window-size=1400,900','--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9352/json/version')).json(); return j.webSocketDebuggerUrl; }
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
const logs=[];
ws.addEventListener('message',ev=>{ const m=JSON.parse(ev.data);
  if(m.method==='Runtime.consoleAPICalled'){ logs.push((m.params.args||[]).map(a=>a.value??a.description??'').join(' ')); } });
const evalJs=async expr=>{
  const r=await S('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error('JS 오류: '+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr,label,ms=40000){
  const t0=Date.now();
  for(;;){ if(await evalJs('(()=>{try{return !!('+expr+')}catch(e){return false}})()')) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,250)); }
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++; };
const srvRow=(bi,id)=>(savedData.brands[bi].reviewRows||[]).find(x=>x.id===id);

async function openReview(){
  await waitFor("document.querySelectorAll('.step-tab').length>0",'앱 로딩');
  await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('영상검수')).click()");
  await waitFor("document.querySelectorAll('tbody tr').length>3",'영상검수 표');
  await wait(800);
}
const ROWJS="[...document.querySelectorAll('tbody tr')].filter(t=>t.querySelectorAll('td').length>8)";
// n번째 데이터행의 PA코드 칸에 코드 입력
async function typeCodeAt(n,code){
  const r=await evalJs("(()=>{const rs="+ROWJS+"; const tr=rs["+n+"]; if(!tr) return 'no-row';"+
    "const td=tr.querySelectorAll('td')[5]; const v=td&&td.querySelector('.cell-val'); if(!v) return 'no-cell';"+
    "v.click(); return tr.querySelectorAll('td')[2].innerText.trim();})()");
  if(r==='no-row'||r==='no-cell') throw new Error('셀 못 찾음: '+r);
  await waitFor("document.querySelector('input.cell-input')",'편집 입력칸');
  await evalJs("(()=>{const i=document.querySelector('input.cell-input');"+
    "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"+
    "set.call(i,"+JSON.stringify(code)+"); i.dispatchEvent(new Event('input',{bubbles:true}));"+
    "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await wait(400);
  return r;
}
const codeAt=n=>evalJs("(()=>{const tr="+ROWJS+"["+n+"]; if(!tr) return '(행없음)';"+
  "return (tr.querySelectorAll('td')[5].innerText||'').trim();})()");

const NEWCODE='adcode-TESTQ9jTBB_새로넣은광고코드-'+Date.now();

await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();

console.log('\n[1] 기존 행의 광고코드를 새 값으로 바꿔 저장');
const before=JSON.stringify(savedData.brands[0].reviewRows[0].paCode);
const ch=await typeCodeAt(0,NEWCODE);
console.log('  대상 채널:',ch,'/ 기존값',before.slice(0,30)+'…');
ok((await codeAt(0)).includes('TESTQ9jTBB'),'입력 직후 화면에 보인다');
await wait(4000);
const s0=srvRow(0,savedData.brands[0].reviewRows[0].id);
ok((savedData.brands[0].reviewRows[0].paCode||'')===NEWCODE,'서버 저장값 일치');

console.log('\n[2] 새로고침 후에도 남아 있다');
await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await openReview();
ok((await codeAt(0)).includes('TESTQ9jTBB'),'새로고침 후 화면 = '+(await codeAt(0)).slice(0,40));

console.log('\n[3] 새 검수 행 추가 → 광고코드 입력 → 저장');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('영상 검수 추가')).click()");
await waitFor("document.querySelector('.modal')",'추가 모달');
await evalJs("(()=>{const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"+
  "const ins=[...document.querySelectorAll('.modal-inp')];"+
  "set.call(ins[1],'@테스트채널'); ins[1].dispatchEvent(new Event('input',{bubbles:true}));"+
  "set.call(ins[3],'adcode-모달로넣은코드'); ins[3].dispatchEvent(new Event('input',{bubbles:true}));})()");
await wait(300);
await evalJs("[...document.querySelectorAll('.modal-foot button')].find(b=>/추가|저장/.test(b.textContent)).click()");
await wait(4000);
const added=(savedData.brands[0].reviewRows||[]).find(r=>r.channelName==='@테스트채널');
ok(!!added,'새 행이 서버에 저장됨');
ok(added&&added.paCode==='adcode-모달로넣은코드','새 행 광고코드 = '+(added&&JSON.stringify(added.paCode)));

console.log('\n[4] 브랜드를 바꿨다 돌아와도 남아 있다');
await evalJs("(()=>{const b=[...document.querySelectorAll('button,div')].find(e=>e.textContent.trim()==='그래니살라'); if(b)b.click();})()");
await wait(1500);
await evalJs("(()=>{const b=[...document.querySelectorAll('button,div')].find(e=>e.textContent.trim()==='베이스튠'); if(b)b.click();})()");
await wait(1500);
await openReview();
ok((await codeAt(0)).includes('TESTQ9jTBB'),'브랜드 왕복 후 화면 = '+(await codeAt(0)).slice(0,40));

console.log('\n[5] 저장 상태 표시기에 실패가 없다');
const st=await evalJs("document.body.innerText.match(/저장 실패|저장실패|차단/)?RegExp.lastMatch:''");
ok(!st,'저장 실패 표시 없음'+(st?' → '+st:''));
const errs=logs.filter(l=>/실패|error|Error/i.test(l));
if(errs.length) console.log('  콘솔:',errs.slice(0,5).join(' / '));

console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과');
try{ chrome.kill(); }catch{}
server.close();
process.exit(fail?1:0);
