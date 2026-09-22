/* 대시보드 E2E — node test/dashboard.e2e.mjs
   역할별 단계 카드·담당자별 소통 중·할 일이 맞게 보이고, 누르면 기존 탭으로 필터·검색을 유지한 채 이동하는지,
   → 빠른 처리가 그 사람 행에만 기록되는지 본다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-dash-e2e');

// 단계마다 한 사람씩:
//  에이(수동 리스트업) 엠(자동, DM 전) 비비(수동 DM) 제이·케이·엘(자동 DM, 담당자 없음) 씨씨(답장옴) 디디(계약서)
//  이이(제품발송) 에프(광고코드) 지지(광고세팅) 에이치(완료) 아이(거절)
// 날짜는 오늘 기준으로 만든다(DM '최근 60일' 조건이 시간이 지나도 깨지지 않게)
const ymd=n=>{const t=new Date(Date.now()-n*864e5);return String(t.getFullYear()).slice(2)+'.'+String(t.getMonth()+1).padStart(2,'0')+'.'+String(t.getDate()).padStart(2,'0');};
const ym=n=>{const t=new Date(Date.now()-n*864e5);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0');};
const S2=(name,pa,x={})=>({id:'s2_'+name,step1Id:'',date:ymd(10),name,link:'https://instagram.com/'+name,followers:'1000',pa,contactStatus:'컨택 완료',dmSent:'Y',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:'',...x});
const C2=(name,x={})=>({...S2(name,''),id:'c2_'+name,contactStatus:'컨택 중',category:'',...x});
let savedData = { paList:['유송미','박민선','안민영','권미림','기타'], brands: [
  { id:'basetune', name:'베이스튠',
    step1Rows:[
      {id:'s1_a',date:'26.09.01',name:'에이',link:'',followers:'500',pa:'안민영',persona:'',feedMemo:'',hypothesis:'',reviewStatus:'검수대기',promotedToStep2:false,memo:''},
      {id:'s1_b',date:'26.09.01',name:'비비',link:'',followers:'500',pa:'안민영',persona:'',feedMemo:'',hypothesis:'',reviewStatus:'승인',promotedToStep2:true,memo:''},
    ],
    claudeStep1Rows:[],
    claudeStep2Rows:[C2('제이'),C2('케이'),C2('엘'),C2('엠',{dmSent:'N',contactStatus:'컨택 전'})],
    step2Rows:[
      S2('비비','안민영',{step1Id:'s1_b'}),
      S2('씨씨','권미림',{contactStatus:'진행중'}),
      S2('디디','안민영',{dealDone:'Y',contactStatus:'계약서 작성'}),
      S2('이이','권미림',{dealDone:'Y',contractDone:'✅ 완료'}),
      S2('에프','안민영',{dealDone:'Y',contractDone:'✅ 완료',shippingDone:'✅ 완료'}),
      S2('지지','권미림',{dealDone:'Y',shippingDone:'✅ 완료',finalDone:'Y'}),
      S2('에이치','안민영',{dealDone:'Y',shippingDone:'✅ 완료',finalDone:'Y',infSettled:'Y',infSettledDate:'26.09.10'}),
      S2('아이','권미림',{contactStatus:'거절'}),
      // DM 보낸 인플루언서 칸 — 오래된 DM(100일 전), DM 수당이 이미 지급된 달의 DM 은 빠져야 한다
      S2('올드','안민영',{date:ymd(100),dmDate:ymd(100)}),
      S2('지급','권미림',{date:ymd(40),dmDate:ymd(40)}),
    ],
    shippingRows:[{id:'sh_e',requestDate:'26.09.03',requester:'권미림',channelName:'이이',recipient:'김이이',phone:'010-1111-2222',address:'서울시 강남구 1',notes:'',status:'처리중',shipDate:'',tracking:''}],
    reviewRows:[
      {id:'rv_f',date:'26.09.08',channelName:'에프',realName:'박에프',pa:'안민영',paCode:'adcode-F',postLink:'',live:'N',contractDone:'Y',checks:{}},
      {id:'rv_g',date:'26.09.08',channelName:'지지',realName:'최지지',pa:'권미림',paCode:'adcode-G',postLink:'',live:'Y',contractDone:'Y',checks:{}},
    ],
    privacyRows:[] },
], settlements:{ basetune:{ [ym(40)]:{ '권미림':{paid:2000,paidDate:'지급',note:''} } } } };
let rev=1;
const PORT=8943;
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
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9346',
  '--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9346/json/version')).json(); return j.webSocketDebuggerUrl; }
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
const activeTab=()=>evalJs(`(document.querySelector('.step-tab.active')||{}).textContent||''`);
const searchVal=()=>evalJs(`(document.querySelector('.srch')||{}).value||''`);
const bodyTxt=()=>evalJs(`(document.querySelector('tbody')||{}).innerText||''`);
const activeChips=()=>evalJs(`[...document.querySelectorAll('.fchip.active')].map(x=>x.textContent).join('|')`);
const backToDash=async()=>{ await click('.step-tab','대시보드'); await waitFor(`document.querySelector('.role-header.part')`,'대시보드'); await wait(200); };
const B=()=>savedData.brands[0];
const s2=n=>B().step2Rows.find(r=>r.name===n);

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`document.querySelector('.talk-col')`,'대시보드 로딩');
await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},window.alert=()=>{},1)`);

console.log('\n[대시보드] 구성');
const dash=await evalJs(`document.querySelector('.hk-in').innerText`);
chk(['매니저 담당','관리자 담당','담당자별 소통 중','관리자 할 일','매니저 할 일'].every(t=>dash.includes(t)),'역할 카드·소통 중·할 일');
chk(!dash.includes('업무 매뉴얼'),'업무 매뉴얼은 삭제됨');
chk(!dash.includes('담당자별 DM 보낸 인플루언서')&&!(await evalJs(`!!document.querySelector('.dm-col')`)),'DM 보낸 인플루언서 칸이 따로 없음(소통 중으로 합침)');

console.log('\n[대시보드] 담당자별 소통 중 = 답장 이후 진행 중 + 최근 DM 보낸 사람');
const talkNow=()=>evalJs("[...document.querySelectorAll('.talk-col')].map(c=>c.innerText.replace(/\\s+/g,' ').trim())");
let talk=await talkNow();
const col=n=>talk.find(t=>t.startsWith(n))||'';
chk(['비비','디디','에프'].every(n=>col('안민영').includes(n)),'안민영: 비비(답장 전)·디디(계약서)·에프(광고코드)',talk);
chk(['씨씨','이이','지지'].every(n=>col('권미림').includes(n)),'권미림: 씨씨(답장옴)·이이(제품발송)·지지(DM 보낸 사람)',talk);
chk(col('안민영').includes('답장 전'),'DM만 보낸 사람은 [답장 전] 표시',col('안민영'));
chk((col('안민영').match(/디디/g)||[]).length===1,'같은 사람은 한 번만',col('안민영'));
chk(!['에이치','아이','올드','지급','에이 '].some(n=>talk.join(' ').includes(n)),'정산 완료·거절·오래된 DM·DM수당 지급월·DM 전은 안 보임',talk);
chk(!talk.join(' ').match(/제이|케이|엘/),'담당 없는 자동화 DM은 안 보임',talk);
const dots=await evalJs(`[...document.querySelectorAll('.talk-h')].map(h=>getComputedStyle(h.querySelector('span')).backgroundColor)`);
chk(new Set(dots).size===dots.length,'담당자마다 점 색이 다름',dots);
await evalJs(`(()=>{const s=document.querySelector('.role-header select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'30');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`); await wait(300);
talk=await talkNow();
chk(col('안민영').includes('비비')&&col('안민영').includes('디디'),'30일로 줄여도 최근 건은 그대로',talk);
await evalJs(`(()=>{const c=[...document.querySelectorAll('.talk-col')].find(x=>x.innerText.trim().startsWith('안민영'));const i=c.querySelector('.srch-in');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'디디');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await wait(250);
const dSearch=await evalJs("[...[...document.querySelectorAll('.talk-col')].find(x=>x.innerText.trim().startsWith('안민영')).querySelectorAll('.talk-item .nm')].map(x=>x.textContent)");
chk(JSON.stringify(dSearch)===JSON.stringify(['디디']),'칸 검색 → 디디만',dSearch);
await evalJs(`(()=>{const c=[...document.querySelectorAll('.talk-col')].find(x=>x.innerText.trim().startsWith('안민영'));const i=c.querySelector('.srch-in');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await wait(250);
await evalJs(`(()=>{[...document.querySelectorAll('.talk-item')].find(x=>x.textContent.includes('비비')).click();return 1})()`);
await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황'); await wait(300);
chk((await activeTab()).includes('인플루언서 관리')&&await searchVal()==='비비','답장 전 사람 클릭 → 컨택현황에서 검색',[await activeTab(),await searchVal()]);
await backToDash();

console.log('\n[할 일] 이미 다 처리된 건(최종완료)은 안 띄움');
const todoTxt=await evalJs(`[...document.querySelectorAll('.todo-box')].map(x=>x.innerText.replace(/\\s+/g,' '))`);
chk(!todoTxt[0].includes('지지')&&!todoTxt[0].includes('광고세팅·입금완료'),'관리자 할 일: 최종완료(지지)·광고세팅 묶음 없음',todoTxt[0]);
chk(!todoTxt[1].includes('지지')&&!todoTxt[0].includes('에이치')&&!todoTxt[1].includes('에이치'),'매니저 할 일에도 없음 · 정산 끝난 에이치도 없음',todoTxt[1]);
chk(todoTxt[0].includes('디디')&&todoTxt[1].includes('씨씨'),'아직 할 일(디디 계약서·씨씨 답장옴)은 그대로',todoTxt);
const cardAdset=await evalJs(`(()=>{const c=[...document.querySelectorAll('.card')].find(x=>x.innerText.includes('광고세팅'));return c?c.querySelector('.card-count').textContent:''})()`);
chk(cardAdset==='1','단계 카드 숫자는 그대로(광고세팅 1)',cardAdset);

console.log('\n[담당자 추가] 👥 담당자 관리에서 추가하면 대시보드에 바로 뜸');
await click('button','관리 ▾'); await wait(200);
await click('.menu-item','담당자 관리'); await waitFor(`document.querySelector('.modal input.modal-inp')`,'담당자 관리 창');
await evalJs(`(()=>{const i=document.querySelector('.modal input.modal-inp');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'신입매니저');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await wait(150);
await click('.modal button','＋ 추가'); await wait(150);
await click('.modal .modal-foot button','완료'); await wait(400);
const tabs2=await evalJs(`[...document.querySelectorAll('.ptab')].map(x=>x.textContent).join('|')`);
chk(tabs2.includes('신입매니저 (0)'),'담당자 탭에 새 사람(0건)',tabs2);
const newCol=await evalJs(`(()=>{const c=[...document.querySelectorAll('.talk-col')].find(x=>x.innerText.trim().startsWith('신입매니저'));return c?c.innerText.replace(/\\s+/g,' '):''})()`);
chk(newCol.includes('소통 중인 사람 없음'),'소통 중에 새 사람 칸(비어 있음 안내)',newCol);
const partBox2=await evalJs(`document.querySelectorAll('.todo-box')[1].innerText.replace(/\\s+/g,' ')`);
chk(/신입매니저 0 할 일 없음/.test(partBox2),'매니저 할 일에 새 사람 · 할 일 없음',partBox2);
chk(!tabs2.includes('기타'),'기타는 건수 없으면 안 뜸',tabs2);
await wait(1800);
chk((savedData.paList||[]).includes('신입매니저'),'담당자 목록이 저장됨',savedData.paList);

console.log('\n[이동] 이름 클릭 → 기존 탭 + 이름 검색');
await evalJs(`(()=>{[...document.querySelectorAll('.talk-item')].find(x=>x.textContent.includes('씨씨')).click();return 1})()`);
await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황'); await wait(300);
chk((await activeTab()).includes('인플루언서 관리'),'인플루언서 관리로 이동',await activeTab());
chk(await searchVal()==='씨씨'&&(await bodyTxt()).includes('씨씨')&&!(await bodyTxt()).includes('디디'),'검색어 씨씨로 그 사람만',await bodyTxt());
await backToDash();
await evalJs(`(()=>{[...document.querySelectorAll('.talk-item')].find(x=>x.textContent.includes('이이')).click();return 1})()`);
await waitFor(`document.querySelector('td[data-label="출고요청일"]')`,'출고'); await wait(300);
chk((await activeTab()).includes('출고')&&await searchVal()==='김이이','제품발송 단계 → 출고 탭 · 수령자 검색',[await activeTab(),await searchVal()]);
await backToDash();

console.log('\n[이동] 단계 카드 → 필터 유지(탭 초기화에 안 덮임)');
await click('.card','계약서발송'); await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황'); await wait(300);
chk((await activeChips()).includes('진행 중'),'계약서발송 카드 → 컨택현황 진행 중',await activeChips());
await backToDash();
await click('.card','리스트업'); await wait(500);
// STEP1은 '인플루언서 관리' 탭 안 '리스팅 목록' 칩으로 합쳐졌다.
chk((await activeTab()).includes('인플루언서 관리')&&(await activeChips()).includes('리스팅 목록'),'리스트업 카드 → 인플루언서 관리(리스팅 목록)',[await activeTab(),await activeChips()]);
await backToDash();

console.log('\n[담당자 탭] 자동화 → 카드가 자동화 탭으로');
await click('.ptab','자동화'); await wait(300);
await click('.card','DM발송'); await wait(500);
chk((await activeTab()).includes('자동화'),'자동화 담당자에서 DM발송 카드 → 🤖 자동화 탭',await activeTab());
await backToDash();
await click('.ptab','전체'); await wait(200);

console.log('\n[→ 빠른 처리] 관리자 할 일 · 다른 데이터는 그대로');
const before=J({s1:B().step1Rows,ship:B().shippingRows,rev:B().reviewRows,c2:B().claudeStep2Rows});
await evalJs(`(()=>{const it=[...document.querySelectorAll('.todo-item')].find(x=>x.querySelector('.todo-name')&&x.querySelector('.todo-name').textContent==='디디');it.querySelector('button').click();return 1})()`);
await wait(1800);
chk(s2('디디').stage==='ship'&&s2('디디').contractDone==='✅ 완료','디디 계약서발송 → 제품발송 기록',s2('디디'));
chk((await evalJs('window.__cf.length'))===1,'→ 는 확인창 1번');
chk(J({s1:B().step1Rows,ship:B().shippingRows,rev:B().reviewRows,c2:B().claudeStep2Rows})===before,'리스트업·출고·영상검수·자동화 데이터는 그대로');
chk(B().step2Rows.filter(r=>r.name!=='디디').every(r=>!r.stage),'다른 컨택 행은 손대지 않음');

console.log('\n'+(fail?`❌ 실패 ${fail}건`:'✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail?1:0);
