/* 리스트업 중복 차단 E2E — node test/listup-dup.e2e.mjs
   같은 인플루언서는 먼저 리스트업한 사람이 담당(2026-09-17).
   진행 중·자동화가 잡은 사람은 등록 차단, 거절·반려·완료로 끝난 사람은 경고만, 승인 때는 확인창. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-dup-e2e');

const S1=(id,name,link,pa,st)=>({id,date:'26.09.01',name,link,followers:'1000',pa,persona:'',feedMemo:'',hypothesis:'',reviewStatus:st,rejectReason:'',promotedToStep2:false,memo:''});
const S2=(id,name,link,pa,x={})=>({id,step1Id:'',date:'26.09.01',name,link,followers:'1000',pa,contactStatus:'컨택 완료',dmSent:'Y',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:'',...x});
let savedData = { paList:['박민선','안민영','권미림','기타'], brands: [
  { id:'basetune', name:'베이스튠',
    step1Rows:[
      S1('s1_a','에이','https://www.instagram.com/aaa_id','박민선','검수대기'),
      S1('s1_e','이이','instagram.com/eee_id','박민선','반려'),
      S1('s1_g','지지','https://instagram.com/bbb_id?utm_source=x','권미림','검수대기'),
    ],
    claudeStep1Rows:[],
    claudeStep2Rows:[{...S2('c2_d','디디','https://instagram.com/ddd_id',''),contactStatus:'컨택 중',category:''}],
    step2Rows:[
      S2('s2_b','비비','https://instagram.com/bbb_id','안민영',{contactStatus:'진행중'}),
      S2('s2_c','씨씨','https://instagram.com/ccc_id','권미림',{contactStatus:'거절'}),
      S2('s2_f','에프','instagram.com/fff_id','안민영',{dealDone:'Y',finalDone:'Y',infSettled:'Y'}),
    ],
    shippingRows:[], reviewRows:[], privacyRows:[] },
  { id:'granny', name:'그래니살라', step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[], step2Rows:[], shippingRows:[], reviewRows:[], privacyRows:[] },
], settlements:{} };
let rev=1;
const PORT=8947;
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
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9348',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9348/json/version')).json(); return j.webSocketDebuggerUrl; }
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

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('STEP1'))`,'앱 로딩');
await evalJs(`(window.__cf=[],window.__al=[],window.__cfAns=false,window.confirm=m=>{window.__cf.push(m);return window.__cfAns},window.alert=m=>{window.__al.push(m)},1)`);
await click('.step-tab','STEP1'); await wait(500);

// 여러 명 추가 창 — 줄마다 채널명·링크·팔로워·페르소나·메모 칸
const setRow=(i,name,link)=>evalJs(`(()=>{const tr=document.querySelectorAll('.modal .add-row')[${i}];const ins=tr.querySelectorAll('input');
  const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(ins[0],${J(name)});set(ins[1],${J(link)});return 1})()`);
const rowLevels=()=>evalJs(`[...document.querySelectorAll('.modal .add-row .add-dup')].map(td=>td.dataset.level+'|'+td.textContent)`);
const submitBtn=()=>evalJs(`(()=>{const b=document.querySelector('.modal .add-submit');return {text:b.textContent,disabled:b.disabled}})()`);
const nRows=()=>evalJs(`document.querySelectorAll('.modal .add-row').length`);
const openAdd=async()=>{ await click('button','＋ 인플루언서 추가'); await waitFor(`document.querySelector('.modal .add-row')`,'추가 창'); };
const closeAdd=()=>evalJs(`(()=>{[...document.querySelectorAll('.modal .modal-foot .btn-ghost')][0].click();return 1})()`);

console.log('\n[여러 명 추가] 진행 중·자동화 → 줄마다 차단');
await openAdd();
chk(await nRows()===3,'처음에 빈 줄 3개',await nRows());
await setRow(0,'아무개','https://www.instagram.com/aaa_id');
await setRow(1,'다른이름','https://instagram.com/bbb_id?igsh=xyz&utm_source=ig');
await setRow(2,'디디 새이름','https://instagram.com/DDD_ID/');
await wait(200);
let lv=await rowLevels(), b=await submitBtn();
chk(lv[0].startsWith('block|')&&lv[0].includes('박민선'),'1줄: 리스트업 검수대기(박민선) → 🚫',lv);
const tip1=await evalJs(`document.querySelectorAll('.modal .add-row .add-dup')[1].title`);
chk(lv[1].startsWith('block|')&&tip1.includes('안민영')&&tip1.includes('권미림'),'2줄: 링크 꼬리 달라도 🚫 · 마우스 올리면 잡은 사람 모두(안민영·권미림)',{lv:lv[1],tip1});
chk(lv[2].startsWith('block|')&&lv[2].includes('자동화'),'3줄: 자동화 DM 보낸 사람(대소문자·끝 /) → 🚫',lv);
chk(b.disabled,'전부 막히면 [추가] 잠김',b);
let n=await evalJs(`(document.querySelector('.modal .dup-notice[data-level="block"]')||{}).innerText||''`);
chk(n.includes('3명은 이미 담당자가 있어'),'🚫 몇 명이 빠지는지 안내',n);
await setRow(0,'@ddd_id',''); await setRow(1,'비비',''); await setRow(2,'',''); await wait(200);
lv=await rowLevels();
chk(lv[0].startsWith('block|')&&lv[1].startsWith('block|'),'링크 없이 채널명에 아이디만 / 같은 채널명 → 🚫',lv);
chk(lv[2]==='|','빈 줄은 검사 안 함',lv);
await closeAdd(); await wait(200);

console.log('\n[여러 명 추가] 경고·새 사람·차단이 섞이면 → 막힌 사람만 빼고 한 번에 추가');
await openAdd();
await evalJs(`(()=>{document.querySelector('.modal .add-more').click();return 1})()`); await wait(150);
chk(await nRows()===5,'[＋ 줄 추가] → 2줄 더',await nRows());
await setRow(0,'씨씨 다시','https://instagram.com/ccc_id');
await setRow(1,'완전새사람','https://instagram.com/brand_new_1');
await setRow(2,'','https://instagram.com/brand_new_2');
await setRow(3,'막힐사람','https://instagram.com/aaa_id');
await wait(200);
lv=await rowLevels(); b=await submitBtn();
chk(lv[0].startsWith('warn|')&&lv[1].startsWith('|✓')&&lv[2].startsWith('|✓')&&lv[3].startsWith('block|'),'⚠️ 거절된 사람 · ✓ 새 사람 2 · 🚫 진행 중',lv);
chk(b.text==='3명 추가'&&!b.disabled,'버튼: 막힌 사람 뺀 3명',b);
n=await evalJs(`(document.querySelector('.modal .dup-notice[data-level="warn"]')||{}).innerText||''`);
chk(n.includes('1명은 전에 거절'),'⚠️ 안내',n);
const before1=B().step1Rows.length;
await click('.modal .add-submit','명 추가'); await wait(1800);
const nm1=B().step1Rows.map(r=>r.name);
chk(B().step1Rows.length===before1+3,'리스트업 +3행',B().step1Rows.length-before1);
chk(nm1.includes('씨씨 다시')&&nm1.includes('완전새사람')&&nm1.includes('brand_new_2')&&!nm1.includes('막힐사람'),'채널명 비우면 링크 아이디(brand_new_2)로 · 막힌 사람은 저장 안 됨',nm1);
const r3=B().step1Rows.find(r=>r.name==='완전새사람');
chk(r3&&r3.reviewStatus==='검수대기'&&r3.promotedToStep2===false&&!!r3.date,'공통 칸(등록일·검수상태)이 줄마다 들어감',r3);

console.log('\n[여러 명 추가] 링크 여러 줄 붙여넣기 · 창 안 중복');
await openAdd();
await evalJs(`(()=>{const inp=document.querySelectorAll('.modal .add-row')[0].querySelectorAll('input')[1];const dt=new DataTransfer();dt.setData('text/plain',${J('https://instagram.com/p1_x\nhttps://instagram.com/p2_x\nhttps://www.instagram.com/p1_x/\nhttps://instagram.com/aaa_id')});
  inp.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return 1})()`); await wait(300);
lv=await rowLevels(); b=await submitBtn();
chk(await nRows()===5,'4줄로 나뉘고 빈 줄 1개 추가',await nRows());
chk(lv[0].startsWith('|✓')&&lv[1].startsWith('|✓')&&lv[2].includes('위 줄과 같음')&&lv[3].startsWith('block|'),'✓ ✓ · 🚫 위 줄과 같음 · 🚫 진행 중',lv);
chk(b.text==='2명 추가','버튼 2명',b);
await click('.modal .add-submit','명 추가'); await wait(1800);
const nm2=B().step1Rows.map(r=>r.name);
chk(nm2.filter(x=>x==='p1_x').length===1&&nm2.includes('p2_x'),'p1_x 한 번·p2_x 저장(채널명=아이디)',nm2);

console.log('\n[붙여넣기] 차단 건은 빼고 추가');
const before=B().step1Rows.length;
await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('붙여')||x.textContent.includes('붙여넣기'));b.click();return 1})()`);
await waitFor(`document.querySelector('.modal textarea')`,'붙여넣기 창');
const tsv='채널명\t링크\t담당\n뉴원\thttps://instagram.com/new_one\t박민선\n에이복제\thttps://www.instagram.com/aaa_id/\t안민영\n자동복제\thttps://instagram.com/ddd_id\t권미림\n이이재도전\thttps://instagram.com/eee_id\t박민선';
await evalJs(`(()=>{const t=document.querySelector('.modal textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${J(tsv)});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await wait(400);
const pv=await evalJs(`document.querySelector('.modal').innerText`);
chk(pv.includes('2명은 이미 담당자가 있어')&&pv.includes('1명은 전에 거절'),'미리보기: 🚫 2명 · ⚠️ 1명 안내',pv.slice(0,400));
b=await addBtn();
chk(b.text.includes('2명 추가'),'버튼은 차단 뺀 2명',b);
await click('.modal .modal-foot .btn-primary','추가'); await wait(1800);
const names=B().step1Rows.map(r=>r.name);
chk(names.includes('뉴원')&&names.includes('이이재도전')&&!names.includes('에이복제')&&!names.includes('자동복제'),'저장: 뉴원·이이재도전만 (씨씨는 앞에서 등록돼 이제 진행 중)',names);
chk(B().step1Rows.length===before+2,'리스트업 +2행',B().step1Rows.length-before);
const al=await evalJs('window.__al.join("\\n")');
chk(al.includes('에이복제')&&al.includes('자동복제'),'추가 안 된 사람 이름을 알림으로 보여줌',al);

console.log('\n[승인] 다른 담당자 진행 중이면 확인');
await click('.fchip','검수대기'); await wait(400);
const pressStatus=()=>evalJs(`(()=>{const tr=[...document.querySelectorAll('tbody tr')].find(t=>t.innerText.includes('지지'));const c=[...tr.querySelectorAll('.cell-val')].find(x=>x.textContent.includes('검수대기'));c.click();return 1})()`);
const chooseApprove=()=>evalJs(`(()=>{const s=document.querySelector('select.cell-sel');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'승인');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await pressStatus(); await wait(200); await chooseApprove(); await wait(1800);
const cf=await evalJs('window.__cf.slice(-1)[0]||""');
chk(cf.includes('안민영')&&cf.includes('그래도 승인'),'승인 누르면 확인창(안민영 진행 중)',cf);
chk(B().step1Rows.find(r=>r.name==='지지').reviewStatus==='검수대기'&&!B().step2Rows.some(r=>r.name==='지지'),'[취소] → 승인 안 됨 · 컨택 행 안 생김');
await evalJs('(window.__cfAns=true,1)');
await pressStatus(); await wait(200); await chooseApprove(); await wait(1800);
chk(B().step1Rows.find(r=>r.name==='지지').reviewStatus==='승인'&&B().step2Rows.some(r=>r.name==='지지'),'[확인] → 승인됨(관리자가 결정 가능)');

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
