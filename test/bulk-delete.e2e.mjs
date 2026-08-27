/* 전체선택 삭제 + 개별 삭제 E2E
   목백엔드 + 실제 크롬(CDP)으로 index.html 을 그대로 띄워 다섯 탭을 모두 눌러 확인한다.
   탭마다: 머리글 체크박스로 전체선택 → 선택 삭제 → 개별 × 삭제 까지.
   추가로 '필터로 걸러진 행만 전체선택되는가'(안 보이는 행이 몰래 지워지면 안 됨)를 본다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-bulkdel-e2e');

const S1=n=>({id:'s1_'+n,date:'26.08.0'+n,name:'리스트'+n,link:'',followers:'1000',pa:'안민영',persona:'',feedMemo:'',hypothesis:'',reviewStatus:n===3?'승인':'검수대기',memo:''});
const S2=n=>({id:'s2_'+n,date:'26.08.0'+n,name:'컨택'+n,link:'',followers:'1000',pa:'안민영',contactStatus:'컨택 전',dmSent:'N',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:''});
const C2=n=>({...S2(n),id:'c2_'+n,name:'자동화'+n,category:''});
const SH=n=>({id:'sh_'+n,requestDate:'26.08.0'+n,requester:'안민영',channelName:'',recipient:'수령'+n,phone:'010-0000-000'+n,address:'서울',notes:'',status:'처리중',shipDate:'',tracking:''});
const RV=n=>({id:'rv_'+n,date:'26.08.0'+n,channelName:'검수'+n,realName:'',pa:'안민영',paCode:'',postLink:'',live:'N',contractDone:'N',checks:{}});

let savedData = { paList:['안민영','권미림'], brands: [
  { id:'basetune', name:'베이스튠',
    step1Rows:[1,2,3].map(S1), claudeStep1Rows:[], claudeStep2Rows:[1,2,3].map(C2),
    step2Rows:[1,2,3].map(S2), shippingRows:[1,2,3].map(SH), reviewRows:[1,2,3].map(RV), privacyRows:[] },
], settlements:{} };
let rev=1;
const PORT=8936;
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
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9338',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9338/json/version')).json(); return j.webSocketDebuggerUrl; }
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
  if(!b)throw new Error('없음: '+t+' / 있는것: '+all.map(x=>x.textContent.trim()).filter(Boolean).slice(0,40).join(' | '));b.click();return 1})()`);

// ── 표 조작 도우미 ────────────────────────────────────────────────
const nRows   = ()=>evalJs(`document.querySelectorAll('tbody td.del-col').length`);
const bodyTxt = ()=>evalJs(`document.querySelector('tbody').innerText`);
const barTxt  = ()=>evalJs(`(document.querySelector('.bulk-bar')||{}).innerText||''`);
const selAll  = ()=>evalJs(`(()=>{const c=document.querySelector('thead th.del-col input.sel-box');if(!c)throw new Error('전체선택 체크박스 없음');c.click();return 1})()`);
const headState=()=>evalJs(`(()=>{const c=document.querySelector('thead th.del-col input.sel-box');return{checked:c.checked,indeterminate:c.indeterminate}})()`);
const nChecked= ()=>evalJs(`[...document.querySelectorAll('tbody td.del-col input.sel-box')].filter(c=>c.checked).length`);
const uncheckFirst=()=>evalJs(`(()=>{document.querySelector('tbody td.del-col input.sel-box').click();return 1})()`);
const bulkDel = ()=>evalJs(`(()=>{const b=document.querySelector('.bulk-del');if(!b)throw new Error('선택 삭제 버튼 없음');b.click();return 1})()`);
const delRow  = name=>evalJs(`(()=>{const tr=[...document.querySelectorAll('tbody tr')].find(t=>t.innerText.includes(${JSON.stringify(name)}));
  if(!tr)throw new Error('행 없음: '+${JSON.stringify(name)});tr.querySelector('td.del-col .row-del-x').click();return 1})()`);

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('STEP2 컨택현황'))`,'앱 로딩');
await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},1)`); // 확인창은 항상 예
console.log('앱 로딩 완료');

// 탭마다 같은 시나리오를 돌린다: 전체선택 → 하나 해제 → 선택 삭제 → 남은 1건 개별 삭제
async function runTab(tabLabel, waitSel, keepName, unit, expect){
  console.log(`\n[${tabLabel}]`);
  await clickText(tabLabel);
  await waitFor(waitSel, tabLabel+' 표');
  await wait(300);
  const n0=await nRows();
  chk(n0===expect, `시작 ${n0}행 (${expect}행 기대)`, n0);

  // 선택 전엔 삭제 바가 없다
  chk((await barTxt())==='', '선택 전엔 선택삭제 바 숨김', await barTxt());

  // 전체선택
  await selAll(); await wait(250);
  chk(await nChecked()===expect, `전체선택 → ${expect}행 체크`, await nChecked());
  chk((await headState()).checked===true, '머리글 체크박스 ON');
  chk((await barTxt()).includes(`${expect}${unit} 선택됨`), `바에 "${expect}${unit} 선택됨"`, await barTxt());

  // 하나 해제 → 중간 상태
  await uncheckFirst(); await wait(250);
  chk(await nChecked()===expect-1, `하나 해제 → ${expect-1}행`, await nChecked());
  const hs=await headState();
  chk(hs.checked===false&&hs.indeterminate===true, '머리글은 중간 상태', hs);
  chk((await barTxt()).includes(`${expect-1}${unit} 선택됨`), `바에 "${expect-1}${unit} 선택됨"`, await barTxt());

  // 선택 삭제
  const before=await bodyTxt();
  chk(before.includes(keepName), '(사전조건) 남길 행이 원래 첫 행');
  await bulkDel(); await wait(500);
  const n1=await nRows();
  chk(n1===1, '선택 삭제 후 1행 남음', n1);
  chk((await bodyTxt()).includes(keepName), `남은 행은 ${keepName}`, await bodyTxt());
  chk((await barTxt())==='', '삭제 뒤 선택 해제되어 바 사라짐', await barTxt());

  // 개별 삭제
  await delRow(keepName); await wait(500);
  chk(await nRows()===0, '개별 × 로 마지막 행 삭제', await nRows());
  const cf=await evalJs(`window.__cf.slice(-1)[0]||''`);
  chk(cf.includes(keepName), '개별 삭제 확인창에 대상 이름 표시', cf);
}

// ① 먼저 '필터로 좁힌 뒤 전체선택' — 보이는 행만 잡혀야 한다(안 보이는 행이 몰래 지워지면 안 됨)
console.log('\n[필터 범위] 승인 1건만 보이게 하고 전체선택');
await clickText('📋 STEP1 리스트업');
await waitFor(`document.querySelector('thead th.del-col input.sel-box')`,'리스트업 표');
await wait(300);
chk(await nRows()===3, '진행 중 3행', await nRows());
await evalJs(`(()=>{const b=[...document.querySelectorAll('.fchip')].find(x=>x.textContent.includes('승인'));b.click();return 1})()`);
await wait(400);
chk(await nRows()===1, '승인 필터 → 1행만 보임', await nRows());
await selAll(); await wait(250);
chk((await barTxt()).includes('1명 선택됨'), '전체선택해도 보이는 1명만', await barTxt());
await bulkDel(); await wait(600);
await evalJs(`(()=>{const b=[...document.querySelectorAll('.fchip')].find(x=>x.textContent.includes('진행 중'));b.click();return 1})()`);
await wait(400);
const left=await bodyTxt();
chk(await nRows()===2 && left.includes('리스트1') && left.includes('리스트2'),
    '숨어 있던 2행은 그대로 남음', left);

// ② 탭마다 전체선택 삭제 + 개별 삭제
await runTab('📋 STEP1 리스트업', `document.querySelector('thead th.del-col input.sel-box')`, '리스트1', '명', 2);
await runTab('📨 STEP2 컨택현황', `document.querySelector('td[data-label="협업성사"]')`, '컨택1', '명', 3);
await runTab('🤖 자동화',        `document.querySelector('td[data-label="협업성사"]')`, '자동화1', '명', 3);
await runTab('📦 출고',          `document.querySelector('td[data-label="출고요청일"]')`, '수령1', '건', 3);
await runTab('🎬 영상검수',      `document.querySelector('thead th.del-col input.sel-box')`, '검수1', '건', 3);

// ③ 서버에도 반영됐는지 (자동저장)
console.log('\n[자동저장] 서버 저장본 확인');
await wait(1500);
const svd=savedData.brands[0];
chk((svd.step1Rows||[]).length===0 && (svd.step2Rows||[]).length===0 && (svd.claudeStep2Rows||[]).length===0
   && (svd.shippingRows||[]).length===0 && (svd.reviewRows||[]).length===0, '다섯 탭 모두 서버에서도 비었음',
   {s1:svd.step1Rows?.length,s2:svd.step2Rows?.length,c2:svd.claudeStep2Rows?.length,sh:svd.shippingRows?.length,rv:svd.reviewRows?.length});

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
