/* 인플루언서 정산 탭 E2E — 정산 탭에서 '인플루언서 정산'으로 전환해
   ① 대기 목록(사람별 모델료·보류 사유)  ② 선택 → '노션 작성 → 정산 완료' 가 브리지에
   지급예정일=다음 월/목 · 사람별 금액으로 요청하는지  ③ 노션에 올라간 건만 정산완료(infSettled)로 저장되는지
   ④ 플렉스 업로드 준비(/flex-prep) 호출  ⑤ 알바 계정에는 이 화면이 안 보이는지 를 실제 클릭으로 확인.
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
const FILE={name:'a.jpg',url:'/x'};
const P=(id,ch,real,docs=true)=>({id,channelName:ch,realName:real,phone:'',address:'',notes:'',...(docs?{idFile:FILE,bankFile:FILE,contractFile:FILE}:{})});
const S2=(id,name,rate,extra={})=>({id,date:'26.11.20',name,link:'',followers:'',pa:'안민영',category:'',contactStatus:'컨택 완료',dmSent:'Y',dealDone:'Y',finalDone:'N',rate,live:'Y',...extra});
let savedData={ paList:['안민영'], brands:[{ id:'basetune', name:'베이스튠',
  step1Rows:[], claudeStep1Rows:[], claudeStep2Rows:[], shippingRows:[], reviewRows:[],
  step2Rows:[ S2('a','chan_a','80000'), S2('b','chan_b',''), S2('c','chan_c','120000'), S2('d','chan_d','50000',{infSettled:'Y',infSettledDate:'26.11.20'}) ],
  privacyRows:[ P('pa','chan_a','김가나'), P('pb','chan_b','이다라'), P('pc','chan_c','박마바',false), P('pd','chan_d','최사아') ] }], settlements:{} };
let rev=1;
const bridgeCalls=[];
const bridge=http.createServer((req,res)=>{
  let body=''; req.on('data',c=>body+=c);
  req.on('end',()=>{
    res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const j=body?JSON.parse(body):{}; bridgeCalls.push({url:req.url,body:j});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/settle-batch'){
      // 박마바는 노션 기입 실패로 흉내 — 실패 건은 정산완료로 넘어가면 안 된다
      const results=j.rows.map(r=>r.realName==='박마바'?{key:r.key,ok:false,realName:r.realName,error:'노션 입력 실패(테스트)'}:{key:r.key,ok:true,realName:r.realName,payDate:r.payDate});
      res.writeHead(200); return res.end(JSON.stringify({ok:results.every(x=>x.ok),results}));
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
      'localStorage.removeItem("pa_settle_mode");'+
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
await evalJs("[...document.querySelectorAll('.step-tab')].find(e=>e.textContent.includes('정산')).click()");
const txt=()=>evalJs("document.body.innerText");
const done=()=>{ console.log(fail? '\n❌ '+fail+'건 실패' : '\n✅ 전부 통과'); try{ chrome.kill(); }catch{} server.close(); bridge.close(); process.exit(fail?1:0); };

if(ROLE!=='manager'){
  console.log('\n[알바] 인플루언서 정산 화면은 안 보인다');
  await wait(1500);
  const tt=await txt();
  ok(!tt.includes('인플루언서 정산'), '알바에게는 전환 토글이 없다');
  ok(!tt.includes('노션 작성'), '노션 작성 버튼도 없다');
  done();
}

console.log('\n[1] 정산 탭에 두 보기 토글');
await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='인플루언서 정산')",'토글');
ok(await evalJs("[...document.querySelectorAll('button')].some(b=>b.textContent==='담당자 정산')"), '담당자 정산 / 인플루언서 정산 토글');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='인플루언서 정산').click()");
await waitFor("document.body.innerText.includes('정산 대기')",'인플루언서 정산 화면');

console.log('\n[2] 대기 목록 — 사람마다 모델료, 모자란 건 보류');
let t=await txt();
ok(t.includes('chan_a')&&t.includes('김가나'), 'chan_a / 김가나 표시');
ok(await evalJs("[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('chan_a')).querySelector('input[placeholder]').value")==='80,000', 'chan_a 모델료 80,000');
ok(await evalJs("[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('chan_c')).querySelector('input[placeholder]').value")==='120,000', 'chan_c 모델료 120,000 (사람마다 다름)');
ok(/chan_b[\s\S]*보류 — 모델료 필요/.test(t), '모델료 없는 chan_b는 보류 표시');
ok(/정산 대기\s*3명/.test(t), '정산 대기 3명 (이미 끝난 chan_d 제외)');
ok(await evalJs("[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('chan_b')).querySelector('input[type=checkbox]').disabled"), '보류 건은 체크 못 함');
ok(/지급\(예정\)일 →\s*\d{4}-\d{2}-\d{2}\([월목]\)/.test(t), '지급예정일이 월/목으로 표시');

console.log('\n[3] 전체선택 → 노션 작성 → 정산 완료');
await evalJs("document.querySelector('thead input[type=checkbox]').click()");
await waitFor("[...document.querySelectorAll('button')].some(b=>/노션 작성 → 정산 완료 \\(2명/.test(b.textContent))",'선택 2명(보류 제외)');
ok(true,'보류 제외 2명 선택됨');
await evalJs("[...document.querySelectorAll('button')].find(b=>/노션 작성 → 정산 완료/.test(b.textContent)).click()");
await waitFor("document.body.innerText.includes('노션 작성 1건 완료')",'결과 메시지',15000);
const call=bridgeCalls.find(c=>c.url==='/settle-batch');
ok(!!call, '브리지 /settle-batch 호출');
const rows=(call&&call.body.rows)||[];
ok(rows.length===2, '2명만 요청 (실 '+rows.length+')');
ok(rows.find(r=>r.realName==='김가나')?.amount==='80000' && rows.find(r=>r.realName==='박마바')?.amount==='120000', '사람별 모델료 그대로(80000 / 120000)');
const pd=rows[0]&&rows[0].payDate;
const dow=pd?new Date(pd+'T00:00').getDay():-1;
ok(/^\d{4}-\d{2}-\d{2}$/.test(pd||'')&&(dow===1||dow===4)&&new Date(pd+'T00:00')>new Date(new Date().toDateString()), '지급예정일 '+pd+' = 오늘 이후 월/목');
ok(bridgeCalls.some(c=>c.url==='/flex-prep'), '노션 성공 뒤 플렉스 업로드 준비 호출');
await wait(1500);
const s2=savedData.brands[0].step2Rows;
ok(s2.find(r=>r.id==='a').infSettled==='Y', '김가나(성공) → 정산완료 저장');
ok(s2.find(r=>r.id==='c').infSettled!=='Y', '박마바(노션 실패) → 정산완료로 넘기지 않음');
ok(s2.find(r=>r.id==='b').infSettled!=='Y', '보류(chan_b)는 손대지 않음');
t=await txt();
ok(/chan_c[\s\S]*노션 입력 실패/.test(t), '실패 사유가 그 줄에 표시');
ok(/정산 대기\s*2명/.test(t), '대기 3 → 2명');

console.log('\n[4] 정산 완료 목록 · 담당자 정산은 따로');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('정산 완료 2명')).click()");
await wait(500);
t=await txt();
ok(t.includes('chan_a')&&t.includes('chan_d'), '완료 목록에 chan_a, chan_d');
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='담당자 정산').click()");
await wait(800);
t=await txt();
ok(!t.includes('노션 작성 → 정산 완료'), '담당자 정산 보기에는 인플루언서 정산이 섞이지 않는다');
done();
