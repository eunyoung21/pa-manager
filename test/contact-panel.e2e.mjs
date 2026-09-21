/* 컨택현황 상세 창 E2E — node test/contact-panel.e2e.mjs
   채널명을 누르면 해트케 PA 같은 상세 창(진행 단계 6개·기본 정보·단계 액션)이 열리고,
   단계 버튼이 기존 칸(DM발송·협업성사·계약·출고·최종완료·영상검수 PA코드·정산)에 제대로 기록되는지 본다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-panel-e2e');

const S2=(id,name,link,pa,x={})=>({id,step1Id:'',date:'26.09.01',name,link,followers:'1000',pa,contactStatus:'컨택 전',dmSent:'N',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:'',...x});
let savedData = { paList:['박민선','안민영','권미림'], brands: [
  { id:'basetune', name:'베이스튠',
    step1Rows:[], claudeStep1Rows:[],
    claudeStep2Rows:[{...S2('c2_j','제이','https://instagram.com/jjj',''),dmSent:'Y',contactStatus:'컨택 중',category:''}],
    step2Rows:[
      S2('s2_a','에이','https://www.instagram.com/aaa_id?igsh=1','박민선'),
      S2('s2_b','비비','https://instagram.com/bbb_id','안민영',{dmSent:'Y',dmDate:'26.09.02',contactStatus:'진행중'}),
      S2('s2_c','씨씨','https://instagram.com/ccc_id','권미림',{dmSent:'Y',contactStatus:'진행중'}),
      S2('s2_d','디디','https://instagram.com/ddd_id','권미림',{dmSent:'Y',contactStatus:'진행중'}),
    ],
    shippingRows:[], reviewRows:[], privacyRows:[] },
], settlements:{} };
let rev=1;
const PORT=8951;
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
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9352',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
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
const click=(sel,txt)=>evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel+' / '+txt)});b.click();return 1})()`);
const B=()=>savedData.brands[0];
const row=n=>B().step2Rows.find(r=>r.name===n)||{};
const saved=async n=>{await wait(1600);return row(n);};
const openCh=n=>evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`);
const panel=()=>evalJs(`(document.querySelector('.s2p')||{}).innerText||''`);
const curStage=()=>evalJs(`(()=>{const d=document.querySelector('.s2p .s2p-dot.current');return d?d.parentElement.querySelector('.s2p-tl-label').childNodes[0].textContent:''})()`);
const fill=(label,v)=>evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith(${J(label)}));const el=f.querySelector('input,textarea');
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const pbtn=txt=>click('.s2p button',txt);

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('STEP2'))`,'앱 로딩');
await evalJs(`(window.confirm=()=>true,window.alert=()=>{},1)`);
await click('.step-tab','STEP2'); await waitFor(`document.querySelector('.ch-link')`,'컨택현황'); await wait(300);

console.log('\n[열기] 채널명 누르면 오른쪽 상세 창');
await openCh('에이'); await wait(300);
let p=await panel();
chk(p.includes('@aaa_id'),'제목 = @인스타아이디',p.slice(0,40));
chk(['리스팅 목록','DM 발송 완료/ 진행 대기','계약서발송/수집','제품 발송','광고 코드/입금정보 수집','광고세팅/입금'].every(s=>p.includes(s)),'진행 단계 6개(리스팅 목록 포함)');
chk(['이름 (별칭)','협찬 제품','팔로워 수','모집일','메모'].every(s=>p.includes(s))&&p.includes('저장')&&p.includes('삭제'),'기본 정보 칸·저장·삭제');
chk(await curStage()==='리스팅 목록','DM 전 → 현재 단계 리스팅 목록',await curStage());

console.log('\n[1→2] DM 발송으로 이동');
await pbtn('DM 발송으로 이동');
let r=await saved('에이');
chk(r.dmSent==='Y'&&!!r.dmDate,'DM발송 Y·발송일 기록',r);
chk(await curStage()==='DM 발송 완료/ 진행 대기','현재 단계 DM 발송 완료/ 진행 대기',await curStage());
p=await panel();
chk(p.includes('실명 (계약/입금용)')&&p.includes('배송 주소')&&p.includes('제품만 협찬')&&p.includes('협찬 성사 완료')&&p.includes('거절됨으로'),'실명·연락처·주소·제품만 협찬·성사·거절');

console.log('\n[2→3] 실명·연락처·주소 넣고 협찬 성사 완료');
await fill('실명','홍길동'); await fill('연락처','010-1234-5678'); await fill('배송 주소','서울시 강남구 1');
await pbtn('협찬 성사 완료');
r=await saved('에이');
chk(r.dealDone==='Y'&&!!r.dealDate&&r.realName==='홍길동'&&r.phone==='010-1234-5678'&&r.address==='서울시 강남구 1','협업성사 Y·성사일 + 실명·연락처·주소 저장',r);
chk(await curStage()==='계약서발송/수집','현재 단계 계약서발송/수집',await curStage());

console.log('\n[3→4] 계약 완료');
await fill('특이사항','80,000');
await pbtn('계약 완료');
r=await saved('에이');
chk(r.contractDone==='✅ 완료'&&!!r.contractDate&&r.rate==='80,000','계약 완료·계약일·단가',r);
chk(await curStage()==='제품 발송','현재 단계 제품 발송',await curStage());
const copyVals=await evalJs(`[...document.querySelectorAll('.s2p .s2p-copy input')].map(i=>i.value)`);
chk(J(copyVals)===J(['홍길동','010-1234-5678','서울시 강남구 1']),'받는 분·연락처·주소가 복사칸에',copyVals);

console.log('\n[4→5] 제품 발송 완료');
await pbtn('제품 발송 완료');
r=await saved('에이');
chk(r.shippingDone==='✅ 완료'&&!!r.shipDate,'출고 완료·발송일',r);
chk(await curStage()==='광고 코드/입금정보 수집','현재 단계 광고 코드/입금정보 수집',await curStage());

console.log('\n[5→6] 광고코드 넣고 협찬 완료');
await fill('광고 코드','adcode-XYZ');
await pbtn('협찬 완료');
r=await saved('에이');
chk(r.finalDone==='Y'&&!!r.finalDate,'최종완료 Y·완료일(=매니저 수당 기준)',r);
const rv=B().reviewRows.find(x=>x.channelName==='에이');
chk(rv&&rv.paCode==='adcode-XYZ','광고코드 → 영상검수 행 PA 코드',rv);
chk(await curStage()==='광고세팅/입금','현재 단계 광고세팅/입금',await curStage());

console.log('\n[6→완료] 광고세팅 및 입금 완료');
await pbtn('광고세팅 및 입금 완료');
r=await saved('에이');
chk(r.infSettled==='Y'&&!!r.infSettledDate,'인플루언서 정산 기록',r);
p=await panel();
chk(p.includes('모든 단계 완료'),'✓ 모든 단계 완료',p.slice(-120));
await pbtn('닫기'); await wait(200);
chk(!(await evalJs(`!!document.querySelector('.s2p')`)),'닫기');

console.log('\n[제품만 협찬] 계약서 건너뛰고 바로 제품 발송');
await openCh('비비'); await wait(300);
await pbtn('제품만 협찬'); await wait(300);
await pbtn('협찬 성사 완료');
r=await saved('비비');
chk(r.productOnly==='Y'&&r.dealDone==='Y','제품만 협찬 표시 + 성사',r);
chk(await curStage()==='제품 발송','계약서 단계 건너뛰고 제품 발송',await curStage());
await pbtn('닫기'); await wait(200);

console.log('\n[거절·복구]');
await openCh('씨씨'); await wait(300);
await pbtn('거절됨으로');
r=await saved('씨씨');
chk(r.contactStatus==='거절'&&!!r.rejectDate,'거절·거절일',r);
chk((await panel()).includes('거절 처리된 인플루언서'),'거절 안내');
await pbtn('복구');
r=await saved('씨씨');
chk(r.contactStatus!=='거절'&&!r.rejectDate,'복구',r);
await pbtn('닫기'); await wait(200);

console.log('\n[기본 정보] 저장·삭제');
await click('.fchip','진행 중'); await wait(300);
await openCh('디디'); await wait(300);
await fill('이름','디디 새이름'); await fill('메모','메모테스트');
await pbtn('저장');
r=await saved('디디 새이름');
chk(r.id==='s2_d'&&r.memo==='메모테스트','이름(별칭)·메모 저장',r);
await pbtn('삭제'); await wait(300);
r=await saved('디디 새이름');
chk(!r.id&&!(await evalJs(`!!document.querySelector('.s2p')`)),'삭제하면 행이 지워지고 창 닫힘');
chk(B().step2Rows.length===3&&['에이','비비','씨씨'].every(n=>row(n).id),'다른 행은 그대로(4→3)',B().step2Rows.map(x=>x.name));

console.log('\n[자동화 탭] 채널명은 전처럼 바로 수정');
await evalJs(`(()=>{const m=[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('자동화'));m.click();return 1})()`); await wait(500);
chk(!(await evalJs(`!!document.querySelector('.ch-link')`))&&(await evalJs(`!!document.querySelector('td[data-label="채널명"] .cell-val')`)),'자동화 탭엔 상세 창 링크 없음');

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
