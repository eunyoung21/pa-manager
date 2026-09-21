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
      S2('s2_e','이이','https://instagram.com/eee_id','안민영',{dmSent:'Y',contactStatus:'계약서 작성',dealDone:'Y',dealDate:'26.09.03',contractDone:'✅ 완료'}),
    ],
    shippingRows:[{id:'sh_e',requestDate:'26.09.04',requester:'안민영',channelName:'이이',recipient:'',phone:'',address:'',notes:'',status:'처리중',shipDate:'',tracking:'555-1'}], reviewRows:[], privacyRows:[] },
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
let sh=B().shippingRows.find(x=>x.channelName==='에이');
chk(sh&&sh.recipient==='홍길동'&&sh.phone==='010-1234-5678'&&sh.address==='서울시 강남구 1'&&sh.status==='✅ 완료'&&sh.requester==='박민선'&&!!sh.shipDate,'📦 출고 탭에 자동 등록(수령자·연락처·주소·요청자·완료)',sh);
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

console.log('\n[제품 발송] 앞에서 비워두고 넘어와도 여기서 입력됨');
const ro=await evalJs(`[...document.querySelectorAll('.s2p .s2p-copy input')].map(i=>i.readOnly)`);
chk(ro.length===3&&ro.every(x=>!x),'실명·연락처·주소 칸이 입력 가능',ro);
await fill('실명','김비비');
await evalJs(`(()=>{const i=document.querySelector('.s2p .s2p-copy input');i.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));return 1})()`);
r=await saved('비비');
chk(r.realName==='김비비','칸을 벗어나면 바로 저장',r.realName);
await fill('연락처','010-2222-3333'); await fill('배송 주소','부산시 해운대구 2');
await pbtn('제품 발송 완료');
r=await saved('비비');
chk(r.phone==='010-2222-3333'&&r.address==='부산시 해운대구 2'&&r.shippingDone==='✅ 완료','[제품 발송 완료]가 입력값도 같이 저장',r);
sh=B().shippingRows.find(x=>x.channelName==='비비');
chk(sh&&sh.recipient==='김비비'&&sh.address==='부산시 해운대구 2','비비도 출고 탭에',sh);
chk(await curStage()==='광고 코드/입금정보 수집','다음 단계로',await curStage());
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

console.log('\n[되돌리기] 진행 단계에서 지난 단계를 누르면 그 단계로');
await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},1)`);
const stepClick=name=>evalJs(`(()=>{const it=[...document.querySelectorAll('.s2p .s2p-tl-item')].find(x=>x.querySelector('.s2p-tl-label').childNodes[0].textContent===${J(name)});it.click();return 1})()`);
// 에이 는 정산까지 끝나 '완료' 필터에만 있을 수 있어 검색으로 연다
await evalJs(`(()=>{const i=document.querySelector('.srch');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'에이');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await wait(500);
await openCh('에이'); await wait(300);
chk((await panel()).includes('모든 단계 완료'),'(사전) 에이 = 전부 완료');
await stepClick('제품 발송'); r=await saved('에이');
const cf1=await evalJs('window.__cf.slice(-1)[0]||""');
chk(cf1.includes("'제품 발송' 단계로 되돌릴까요")&&cf1.includes('정산(입금) 완료'),'확인창에 풀리는 단계 안내',cf1);
chk(r.infSettled!=='Y'&&r.finalDone==='N'&&!r.finalDate&&r.shippingDone==='미완료'&&!r.shipDate,'정산·최종완료·출고 기록만 풀림',r);
chk(!B().shippingRows.some(x=>x.channelName==='에이'),'상세 창이 만든 출고 행(송장 없음)은 지워짐',B().shippingRows.map(x=>x.channelName));
chk(r.contractDone==='✅ 완료'&&r.dealDone==='Y'&&r.dmSent==='Y','앞 단계(계약·성사·DM)는 그대로',r);
chk(await curStage()==='제품 발송','현재 단계 제품 발송',await curStage());
await stepClick('리스팅 목록'); r=await saved('에이');
chk(r.dmSent==='N'&&r.dealDone==='N'&&r.contractDone==='미완료'&&r.contractBack==='Y','처음(리스팅 목록)까지 되돌림',r);
chk(await curStage()==='리스팅 목록','현재 단계 리스팅 목록',await curStage());
const nCf=await evalJs('window.__cf.length');
await stepClick('광고세팅/입금'); await wait(300);
chk(await evalJs('window.__cf.length')===nCf&&await curStage()==='리스팅 목록','아직 안 한 단계를 눌러도 아무 일 없음');
await evalJs(`window.confirm=m=>{window.__cf.push(m);return false},1`);
await pbtn('DM 발송으로 이동'); await pbtn('협찬 성사 완료'); await wait(300);
chk(await curStage()==='계약서발송/수집','영상검수에 계약서 Y가 있어도 되돌린 계약은 다시 계약서 단계부터',await curStage());
await stepClick('DM 발송 완료/ 진행 대기'); await wait(1600);
chk(row('에이').dealDone==='Y','확인창에서 [취소]하면 안 바뀜',row('에이').dealDone);
await evalJs(`(window.confirm=m=>{window.__cf.push(m);return true},1)`);
await pbtn('닫기'); await wait(200);
await evalJs(`(()=>{const i=document.querySelector('.srch');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await wait(300);

console.log('\n[출고 탭에 이미 있는 사람] 새로 안 만들고 채움');
await openCh('이이'); await wait(300);
chk(await curStage()==='제품 발송','(사전) 이이 = 제품 발송 단계',await curStage());
const nShip=B().shippingRows.length;
await fill('실명','이이본명'); await fill('연락처','010-5555-6666'); await fill('배송 주소','대구시 3');
await pbtn('제품 발송 완료'); await wait(1600);
const she=B().shippingRows.filter(x=>x.channelName==='이이');
chk(B().shippingRows.length===nShip&&she.length===1,'출고 행 개수 그대로(중복 안 만듦)',B().shippingRows.length);
chk(she[0].id==='sh_e'&&she[0].recipient==='이이본명'&&she[0].address==='대구시 3'&&she[0].status==='✅ 완료'&&she[0].tracking==='555-1','기존 행에 수령자·주소 채우고 완료 · 송장 그대로',she[0]);
await stepClick('제품 발송'); await wait(1600);
const she2=B().shippingRows.find(x=>x.id==='sh_e');
chk(she2&&she2.status==='처리중'&&!she2.shipDate&&she2.tracking==='555-1','되돌리면 송장 있는 행은 남기고 처리중으로',she2);
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
chk(B().step2Rows.length===4&&['에이','비비','씨씨','이이'].every(n=>row(n).id),'다른 행은 그대로(5→4)',B().step2Rows.map(x=>x.name));

console.log('\n[표 칸] 메모·개인정보·성사일·수당 칸은 화면에서만 숨김');
const HIDE=['성사일','DM수당','완료수당','소계','메모','개인정보'];
let heads=await evalJs(`[...document.querySelectorAll('thead th')].map(t=>t.textContent.trim())`);
chk(!heads.some(x=>HIDE.includes(x))&&heads.includes('단가')&&heads.includes('최종완료'),'컨택현황: 숨김 칸 없음 · 단가·최종완료는 그대로',heads);
chk(row('씨씨').memo!==undefined,'메모 데이터는 그대로 남음');

console.log('\n[상세 창] 개인정보 버튼(표에서 빠진 대신)');
await openCh('씨씨'); await wait(300);
await pbtn('개인정보'); await wait(400);
chk(await evalJs(`[...document.querySelectorAll('.overlay .modal')].some(m=>m.innerText.includes('개인정보')||m.innerText.includes('실명'))`),'🔒 개인정보 버튼 → 개인정보 입력 창 열림');
await evalJs(`(()=>{const o=[...document.querySelectorAll('.overlay')].pop();o&&o.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 1})()`); await wait(300);
await evalJs(`(()=>{const b=[...document.querySelectorAll('.overlay .modal button')].find(x=>/취소|닫기/.test(x.textContent));b&&b.click();return 1})()`); await wait(300);
await pbtn('닫기'); await wait(200);

console.log('\n[자동화 탭] 같은 상세 창 · 기록은 자동화 목록에');
await evalJs(`(()=>{const m=[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('자동화'));m.click();return 1})()`); await wait(500);
heads=await evalJs(`[...document.querySelectorAll('thead th')].map(t=>t.textContent.trim())`);
chk(!heads.some(x=>HIDE.includes(x))&&heads.includes('답장')&&heads.includes('승인'),'자동화: 성사일·완료수당·메모·개인정보 숨김 · 답장·승인 그대로',heads);
await openCh('제이'); await wait(300);
chk(await curStage()==='DM 발송 완료/ 진행 대기','자동화 행도 상세 창(현재 DM 발송 완료)',await curStage());
await fill('실명','제이본명');
await pbtn('협찬 성사 완료'); await wait(1600);
const cj=B().claudeStep2Rows.find(x=>x.name==='제이');
chk(cj&&cj.dealDone==='Y'&&cj.realName==='제이본명'&&!B().step2Rows.some(x=>x.name==='제이'),'자동화 목록 행에 기록(컨택현황에 안 생김)',cj);
chk(await curStage()==='계약서발송/수집','다음 단계로',await curStage());

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
