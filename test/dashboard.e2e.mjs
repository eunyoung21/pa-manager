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
const S2=(name,pa,x={})=>({id:'s2_'+name,step1Id:'',date:'26.09.01',name,link:'https://instagram.com/'+name,followers:'1000',pa,contactStatus:'컨택 완료',dmSent:'Y',dealDone:'N',finalDone:'N',rate:'',shipDate:'',expectedPost:'',shippingDone:'미완료',contractDone:'미완료',contractUrl:'',memo:'',...x});
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
    ],
    shippingRows:[{id:'sh_e',requestDate:'26.09.03',requester:'권미림',channelName:'이이',recipient:'김이이',phone:'010-1111-2222',address:'서울시 강남구 1',notes:'',status:'처리중',shipDate:'',tracking:''}],
    reviewRows:[
      {id:'rv_f',date:'26.09.08',channelName:'에프',realName:'박에프',pa:'안민영',paCode:'adcode-F',postLink:'',live:'N',contractDone:'Y',checks:{}},
      {id:'rv_g',date:'26.09.08',channelName:'지지',realName:'최지지',pa:'권미림',paCode:'adcode-G',postLink:'',live:'Y',contractDone:'Y',checks:{}},
    ],
    privacyRows:[] },
], settlements:{} };
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
chk(['알바 담당','관리자 담당','담당자별 소통 중','관리자 할 일','알바 할 일','업무 매뉴얼'].every(t=>dash.includes(t)),'역할 카드·소통 중·할 일·업무 매뉴얼');
const talk=await evalJs("[...document.querySelectorAll('.talk-col')].map(c=>c.innerText.replace(/\\s+/g,' ').trim())");
const col=n=>talk.find(t=>t.startsWith(n))||'';
chk(col('안민영').includes('디디')&&col('안민영').includes('에프'),'안민영 소통 중: 디디·에프',talk);
chk(col('권미림').includes('씨씨')&&col('권미림').includes('이이'),'권미림 소통 중: 씨씨·이이',talk);
chk(!['지지','에이치','아이','비비','에이'].some(n=>talk.join(' ').includes(n)),'광고세팅·완료·거절·DM 전은 소통 중에 없음',talk);
const dots=await evalJs(`[...document.querySelectorAll('.talk-h')].map(h=>getComputedStyle(h.querySelector('span')).backgroundColor)`);
chk(new Set(dots).size===dots.length,'담당자마다 점 색이 다름',dots);

console.log('\n[이동] 이름 클릭 → 기존 탭 + 이름 검색');
await evalJs(`(()=>{[...document.querySelectorAll('.talk-item')].find(x=>x.textContent.includes('씨씨')).click();return 1})()`);
await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황'); await wait(300);
chk((await activeTab()).includes('STEP2'),'STEP2 컨택현황으로 이동',await activeTab());
chk(await searchVal()==='씨씨'&&(await bodyTxt()).includes('씨씨')&&!(await bodyTxt()).includes('디디'),'검색어 씨씨로 그 사람만',await bodyTxt());
await backToDash();
await evalJs(`(()=>{[...document.querySelectorAll('.talk-item')].find(x=>x.textContent.includes('이이')).click();return 1})()`);
await waitFor(`document.querySelector('td[data-label="출고요청일"]')`,'출고'); await wait(300);
chk((await activeTab()).includes('출고')&&await searchVal()==='김이이','제품발송 단계 → 출고 탭 · 수령자 검색',[await activeTab(),await searchVal()]);
await backToDash();

console.log('\n[이동] 단계 카드 → 필터 유지(탭 초기화에 안 덮임)');
await click('.card','계약서발송'); await waitFor(`document.querySelector('td[data-label="협업성사"]')`,'컨택현황'); await wait(300);
chk((await activeChips()).includes('협업 성사'),'계약서발송 카드 → 컨택현황 협업 성사 필터',await activeChips());
await backToDash();
await click('.card','리스트업'); await wait(500);
chk((await activeTab()).includes('STEP1'),'리스트업 카드 → STEP1',await activeTab());
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
