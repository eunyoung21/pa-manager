/* 대시보드 '✓ 정산 요청' E2E
   ① 대시보드 정산 정보 줄의 버튼이 '✓ 정산 요청'  ② 단가/본명이 비면 막고 이유 안내  ③ 누르면 브리지 /settle 로
   본명·그 사람 단가·지급예정일(다음 월/목)을 보내고, 성공한 건만 정산 완료로 기록(infPayDate 등)
   ④ 노션 실패 건은 그대로 남고 사유 표시  ⑤ 모아서 '플렉스 업로드 준비' 한 번(/flex-prep)
   ⑥ 정산 탭 '인플루언서 정산'은 읽기 전용(확인용)  ⑦ 알바 계정은 버튼이 안 보임
   노션 브리지는 가짜 서버(8791)로 대신한다.  알바 확인: E2E_ROLE=staff node test/influencer-settle.e2e.mjs */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TMP  = path.join(os.tmpdir(), 'pa-infsettle-e2e');
const PORT=8938, BR=8791;
const ROLE = process.env.E2E_ROLE||'manager';
// 광고세팅·입금 단계(= 대시보드 정산 정보) 인원: 계약·제품발송·최종완료까지 끝난 사람
const S2=(id,name,rate,real,extra={})=>({id,date:'26.11.20',name,link:'',followers:'',pa:'안민영',category:'',contactStatus:'컨택 완료',dmSent:'Y',dealDone:'Y',finalDone:'Y',finalDate:'26.11.25',shippingDone:'✅ 완료',contractDone:'✅ 완료',rate,realName:real,live:'Y',...extra});
let savedData={ paList:['안민영'], brands:[{ id:'basetune', name:'베이스튠',
  step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[], shippingRows:[], reviewRows:[], privacyRows:[],
  step2Rows:[ S2('a','chan_a','80000','김가나'), S2('b','chan_b','','이다라'), S2('c','chan_c','120000','박마바'),
              S2('d','chan_d','50000','최사아',{infSettled:'Y',infSettledDate:'26.11.20',infPayDate:'2026-11-26',infAmount:'50000'}) ] }], settlements:{} };
let rev=1;
const bridgeCalls=[];
const bridge=http.createServer((req,res)=>{
  let body=''; req.on('data',c=>body+=c);
  req.on('end',()=>{
    res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const j=body?JSON.parse(body):{}; bridgeCalls.push({url:req.url,body:j});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/settle'){
      if(j.realName==='박마바'){ res.writeHead(500); return res.end(JSON.stringify({error:'노션 입력 실패(테스트)'})); } // 실패 흉내
      res.writeHead(200); return res.end(JSON.stringify({ok:true,realName:j.realName,payDate:j.payDate}));
    }
    if(req.url==='/flex-prep'){res.writeHead(200);return res.end('{"ok":true}');}
    res.writeHead(404);res.end('{}');
  });
});
await new Promise(r=>bridge.listen(BR,'127.0.0.1',r));
const server=http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html=fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html=html.replace('<div id="root"></div>',
      '<div id="root"></div><script>window.PA_API="http://127.0.0.1:'+PORT+'/api";localStorage.setItem("notion_bridge","http://127.0.0.1:'+BR+'");'+
      'localStorage.removeItem("pa_settle_mode");localStorage.removeItem("pa_flex_queue");'+
      'localStorage.setItem("pa_mgr_auth", JSON.stringify({token:"T",username:"테스터",role:"'+ROLE+'",brand:"all",pa:"안민영"}));</script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body=''; req.setEncoding('utf8'); req.on('data',c=>body+=c);
  req.on('end',()=>{ const b=JSON.parse(body||'{}');
    const send=o=>{res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
    if(b.action==='users'||b.action==='logs') return send({ok:true,users:[],logs:[]});
    if(b.action==='login') return send({ok:true,token:'T',username:'테스터',role:ROLE,brand:'all'});
    if(b.action==='get')   return send({ok:true,data:savedData,rev});
    if(b.action==='rev')   return send({ok:true,rev});
    if(b.action==='save'){ savedData=b.data; rev++; return send({ok:true,rev}); }
    return send({ok:true}); });
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9342',
  '--window-size=1400,900','--user-data-dir='+UD,'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){ try{ const j=await (await fetch('http://127.0.0.1:9342/json/version')).json(); return j.webSocketDebuggerUrl; }
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
  for(;;){ if(await evalJs('(()=>{try{return !!('+expr+')}catch(e){return false}})()')) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,250)); }
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++; };
// 데이터 행 수 — 맨 끝의 '더 보입니다' 안내행(colspan)은 뺀다

await S('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
await waitFor("document.querySelectorAll('.step-tab').length>0",'앱 로딩');
await waitFor("document.body.innerText.includes('정산 정보')",'대시보드 정산 정보');
const txt=()=>evalJs("document.body.innerText");
const done=()=>{ console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과'); try{ chrome.kill(); }catch{} server.close(); bridge.close(); process.exit(fail?1:0); };
// confirm 은 자동 승인, alert 는 내용을 모아 둔다
await evalJs("window.__alerts=[];window.alert=m=>window.__alerts.push(String(m));window.confirm=m=>{window.__lastConfirm=String(m);return true;};1");
const rowBtn=name=>"(()=>{const r=[...document.querySelectorAll('.todo-item')].find(x=>x.querySelector('.todo-name')&&x.querySelector('.todo-name').textContent.trim()==='"+name+"'&&x.innerText.includes('정산'));return r?r.querySelector('button'):null})()";
const hasRow=name=>evalJs("!!"+rowBtn(name).replace('.querySelector(\'button\')','')); // 줄 자체 존재

if(ROLE!=='manager'){
  console.log('\n[알바] 정산 요청 버튼이 안 보인다');
  const t0=await txt();
  ok(t0.includes('chan_a'), '정산 정보에 chan_a 줄은 보인다');
  ok(!(await evalJs("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('정산 요청'))")), '✓ 정산 요청 버튼은 없다');
  done();
}

console.log('\n[1] 대시보드 정산 정보 — 버튼 이름');
let t=await txt();
ok(/✓\s*정산 요청/.test(t), "버튼이 '✓ 정산 요청'");
ok(!/✓\s*입금/.test(t), "옛 '✓ 입금' 은 없다");
ok(t.includes('chan_a')&&t.includes('chan_b')&&t.includes('chan_c'), '대상 3명이 줄에 보인다');
ok(/정산\s*·\s*80,000/.test(t)&&/정산\s*·\s*120,000/.test(t), '금액이 천단위 80,000 / 120,000');

console.log('\n[2] 단가가 비면 막는다');
await evalJs(rowBtn('chan_b')+".click()"); await wait(600);
const al=await evalJs("window.__alerts.join('|')");
ok(/단가/.test(al), '안내: 단가가 비어 있어요 → '+al.slice(0,40));
ok(!bridgeCalls.some(c=>c.url==='/settle'), '브리지로는 안 보냄');

console.log('\n[3] chan_a 정산 요청 → 노션(브리지) → 정산 완료');
await evalJs(rowBtn('chan_a')+".click()");
await waitFor("![...document.querySelectorAll('.todo-name')].some(x=>x.textContent.trim()==='chan_a')",'chan_a 줄이 사라짐',15000);
const call=bridgeCalls.find(c=>c.url==='/settle');
ok(!!call, '브리지 /settle 호출');
ok(call&&call.body.realName==='김가나'&&call.body.amount==='80000', '본명·그 사람 단가 그대로(김가나 / 80000)');
const pd=call&&call.body.payDate; const dow=pd?new Date(pd+'T00:00').getDay():-1;
ok(/^\d{4}-\d{2}-\d{2}$/.test(pd||'')&&(dow===1||dow===4)&&new Date(pd+'T00:00')>new Date(new Date().toDateString()), '지급예정일 '+pd+' = 오늘 이후 월/목');
ok(/80,000원/.test(await evalJs("window.__lastConfirm")||''), '확인창에 금액·지급예정일 안내');
await wait(1500);
const a=savedData.brands[0].step2Rows.find(r=>r.id==='a');
ok(a.infSettled==='Y'&&a.infPayDate===pd&&a.infAmount==='80000'&&!!a.infNotionDate, '정산 완료 + 지급예정일·금액·노션 기입일 저장');
ok(savedData.brands[0].step2Rows.find(r=>r.id==='b').infSettled!=='Y', '단가 없는 chan_b 는 그대로');
t=await txt();
ok(/정산 요청 1명\s*—\s*김가나/.test(t), '플렉스 준비 대기 막대: 1명 — 김가나');

console.log('\n[4] 노션 실패 건은 남는다');
await evalJs(rowBtn('chan_c')+".click()"); await wait(1500);
t=await txt();
ok(t.includes('chan_c'), 'chan_c 줄이 그대로 있다');
ok(/노션 입력 실패/.test(t), '실패 사유가 줄에 표시');
ok(savedData.brands[0].step2Rows.find(r=>r.id==='c').infSettled!=='Y', '정산 완료로 넘기지 않음');
ok(/다시 요청/.test(t), "버튼이 '다시 요청'");

console.log('\n[5] 플렉스 업로드 준비는 모아서 한 번');
ok(!bridgeCalls.some(c=>c.url==='/flex-prep'), '정산 요청만으로는 플렉스를 열지 않는다');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('플렉스 업로드 준비')).click()");
await wait(1000);
ok(bridgeCalls.filter(c=>c.url==='/flex-prep').length===1, '/flex-prep 1번 호출');
ok(!(await txt()).includes('플렉스 업로드 준비'), '누른 뒤 대기 막대가 사라진다');

console.log('\n[6] 정산 탭 — 확인용(읽기 전용)');
await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('정산')).click()");
await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='인플루언서 정산')",'토글');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='인플루언서 정산').click()");
await waitFor("document.body.innerText.includes('정산 요청 완료')",'읽기 전용 화면');
t=await txt();
ok(t.includes('chan_a')&&t.includes('김가나')&&t.includes('80,000'), '방금 정산 요청한 chan_a(김가나 80,000) 보임');
ok(t.includes('chan_d')&&t.includes('50,000'), '이전에 끝난 chan_d 도 보임');
ok(new RegExp((pd?(+pd.slice(5,7))+'/'+(+pd.slice(8,10)):'x')+'\\([월목]\\)').test(t), '지급예정일(월/목) 표시');
ok(!/노션 작성 →/.test(t)&&!(await evalJs("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('정산 요청')&&!b.textContent.includes('완료'))")), '여기에는 정산 요청 버튼이 없다');
ok(!t.includes('chan_c'), '실패한 chan_c 는 정산 완료 목록에 없다');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='담당자 정산').click()"); await wait(800);
ok(!(await txt()).includes('정산 요청 완료'), '담당자 정산 보기에는 섞이지 않는다');
done();
