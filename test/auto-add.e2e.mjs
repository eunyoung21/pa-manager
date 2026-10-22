/* 🤖 자동화 탭 「＋ 인플루언서 추가」 팝업 E2E — node test/auto-add.e2e.mjs
   팝업으로 여러 명 입력 · 제품 2개 이상이면 제품 필수 · 중복은 차단 · 저장 행 모양 확인(2026-10-22).
      */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-autoadd-e2e');
const S2=(id,name,link,x={})=>({id,date:'26.10.01',name,link,followers:'1000',pa:'',category:'',contactStatus:'컨택 중',dmSent:'Y',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:'',...x});
let savedData = { paList:['박민선','안민영','권미림','기타'], brands: [
  { id:'hatke', name:'해트케', products:['압력이불','휘핑크림 차렵이불'],
    step1Rows:[], claudeStep1Rows:[], step2Rows:[], shippingRows:[], reviewRows:[], privacyRows:[],
    claudeStep2Rows:[S2('c2_x','기존','https://www.instagram.com/old_one/',{product:'압력이불'})] },
], settlements:{} };
let rev=1;
const PORT=8948;
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
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9349',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9349/json/version')).json(); return j.webSocketDebuggerUrl; }
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
const J=JSON.stringify;
const B=()=>savedData.brands[0];
const click=(sel,txt)=>evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel+' / '+txt)});b.click();return 1})()`);
const addBtn=()=>evalJs(`(()=>{const b=[...document.querySelectorAll('.modal .modal-foot .btn-primary')][0];return {text:b.textContent,disabled:b.disabled}})()`);
const setRow=(i,name,link)=>evalJs(`(()=>{const tr=document.querySelectorAll('.modal .add-row')[${i}];const ins=tr.querySelectorAll('input');
  const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(ins[0],${J(name)});set(ins[1],${J(link)});return 1})()`);
const submitBtn=()=>evalJs(`(()=>{const b=document.querySelector('.modal .add-submit');return {text:b.textContent,disabled:b.disabled}})()`);

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`,'앱 로딩');
await click('.step-tab','자동화'); await wait(500);
const before=B().claudeStep2Rows.length;

console.log('\n[팝업] 버튼 누르면 빈 행이 아니라 팝업');
await click('button','＋ 인플루언서 추가');
await waitFor(`document.querySelector('.modal .add-row')`,'추가 창');
chk(B().claudeStep2Rows.length===before,'누르기만 해서는 행이 안 생김',B().claudeStep2Rows.length);
const title=await evalJs(`document.querySelector('.modal .modal-title').textContent`);
chk(title.includes('자동화'),'제목이 자동화용',title);
chk(await evalJs(`!![...document.querySelectorAll('.modal .modal-lbl')].find(x=>x.textContent.includes('검수 상태'))`)===false,'검수 상태 칸 없음');

console.log('\n[제품] 제품이 2개면 골라야 추가됨');
await setRow(0,'새사람','https://www.instagram.com/new_person1/');
await setRow(1,'','https://instagram.com/new_person2');
await setRow(2,'기존 다시','https://instagram.com/OLD_ONE');
await wait(200);
let b=await submitBtn();
chk(b.disabled&&b.text.includes('제품'),'제품 안 고르면 [추가] 잠김',b);
const lv=await evalJs(`[...document.querySelectorAll('.modal .add-row .add-dup')].map(td=>td.dataset.level)`);
chk(lv[2]==='block','이미 자동화에 있는 사람 → 🚫',lv);
await evalJs(`(()=>{const s=document.querySelector('.modal .add-product');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'휘핑크림 차렵이불');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await wait(200);
b=await submitBtn();
chk(!b.disabled&&b.text.includes('2명'),'제품 고르면 2명 추가 가능(중복 1명 빠짐)',b);
await evalJs(`(()=>{document.querySelector('.modal .add-submit').click();return 1})()`);
await waitFor(`!document.querySelector('.modal .add-row')`,'창 닫힘');
await waitFor(`true`,'');
for(let i=0;i<40&&B().claudeStep2Rows.length<before+2;i++) await wait(250);

console.log('\n[저장] 자동화 탭 행 모양');
const rows=B().claudeStep2Rows.slice(before);
chk(rows.length===2,'2명 저장',rows.length);
const r1=rows.find(r=>r.username==='new_person1'), r2=rows.find(r=>r.username==='new_person2');
chk(r1&&r1.name==='새사람'&&r1.product==='휘핑크림 차렵이불','1: 이름·아이디·제품',r1);
chk(r2&&r2.name==='new_person2','2: 채널명 비우면 아이디로',r2);
chk(rows.every(r=>r.contactStatus==='컨택 전'&&r.dmSent==='N'&&r.pa===''),'컨택 전·DM N·담당자 비움',rows.map(r=>[r.contactStatus,r.dmSent,r.pa]));

ws.close(); chrome.kill(); server.close();
console.log(fail?`\n❌ 실패 ${fail}건`:'\n✅ 전부 통과');
process.exit(fail?1:0);
