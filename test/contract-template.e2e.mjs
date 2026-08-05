/* PA Manager 계약서 양식 업로드 → 생성 E2E
   목백엔드(mock) + 실제 크롬(CDP)으로 index.html 을 그대로 띄워 사람 손으로 하듯 클릭한다. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { unzip } from './ziplib.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//,''));
const TPL  = process.argv[2]; if(!TPL){ console.error('사용법: node test/contract-template.e2e.mjs <빈 계약서 양식.docx>'); process.exit(2); }
const TMP  = path.join(os.tmpdir(), 'pa-ct-e2e');
const DL   = path.join(TMP, 'dl');
fs.rmSync(DL, {recursive:true, force:true}); fs.mkdirSync(DL, {recursive:true});

/* ── 목 백엔드 ── */
const pfiles = new Map(); let pfileSeq = 9000;
let savedData = { brands: [
  { id:'basetune', name:'베이스튠', step1Rows:[], step2Rows:[], privacyRows:[], settlements:[] },
  { id:'granny',   name:'그래니샐러드', step1Rows:[], step2Rows:[], privacyRows:[], settlements:[] },
]};
const calls = []; let rev = 1;
const server = http.createServer((req,res)=>{
  if(req.method==='GET'){
    let html = fs.readFileSync(path.join(REPO,'index.html'),'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  let body='';
  req.on('data',c=>body+=c);
  req.on('end',()=>{
    const b = JSON.parse(body||'{}');
    calls.push(b.action);
    const send=o=>{ res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(o)); };
    if(b.action==='users'||b.action==='logs') return send({ok:true, users:[], logs:[]});
    if(b.action==='login')    return send({ok:true, token:'T', username:'테스터', role:'manager', brand:'all'});
    if(b.action==='get') return send({ok:true, data:savedData, rev});
    if(b.action==='rev') return send({ok:true, rev});
    if(b.action==='save'){ savedData=b.data; rev++; console.log('  [mock] save '+JSON.stringify(b.data).length+'B tpl='+!!(b.data.brands||[]).find(x=>x.contractTemplate)); return send({ok:true, rev}); }
    if(b.action==='pfileSave'){
      const id=++pfileSeq; pfiles.set(String(id), b.data);
      return send({ok:true, id, url:'/api/pfile?id='+id, name:b.name, type:b.type});
    }
    if(b.action==='pfileGet'){ const d=pfiles.get(String(b.id)); return d?send({ok:true,id:b.id,dataUrl:d}):send({error:'not found'}); }
    return send({ok:true});
  });
});
const PORT = 8931;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

/* ── 크롬 (CDP) ── */
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD=path.join(TMP,'chrome-prof'); fs.rmSync(UD,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9333',
  '--user-data-dir='+UD, 'about:blank'],{stdio:'ignore'});
async function wsUrl(){
  for(let i=0;i<60;i++){
    try{ const j=await (await fetch('http://127.0.0.1:9333/json/version')).json(); return j.webSocketDebuggerUrl; }
    catch{ await new Promise(r=>setTimeout(r,300)); }
  }
  throw new Error('크롬 기동 실패');
}
const ws=new WebSocket(await wsUrl());
await new Promise(r=>ws.addEventListener('open',r));
let msgId=0; const waiters=new Map(); const events=[];
ws.addEventListener('message',ev=>{
  const m=JSON.parse(ev.data);
  if(m.id&&waiters.has(m.id)){ const w=waiters.get(m.id); waiters.delete(m.id); m.error?w.rej(new Error(JSON.stringify(m.error))):w.res(m.result); }
  else events.push(m);
});
const send=(method,params={},sessionId)=>new Promise((res,rej)=>{
  const id=++msgId; waiters.set(id,{res,rej});
  ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const S=(m,p={})=>send(m,p,sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL}).catch(()=>{});
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL,browserContextId:undefined}).catch(()=>{});

const evalJs = async (expr)=>{
  const r=await S('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error('JS 오류: '+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr, label, ms=25000){
  const t0=Date.now();
  for(;;){
    if(await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return;
    if(Date.now()-t0>ms) throw new Error('시간초과: '+label);
    await new Promise(r=>setTimeout(r,250));
  }
}
let fail=0;
const chk=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++; };

await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`document.querySelector('.contract-link')`, '앱 로딩');
console.log('앱 로딩 완료');

// 1) 계약서 생성 모달 열기
await evalJs(`document.querySelector('.contract-link').click(), 1`);
await waitFor(`[...document.querySelectorAll('div')].some(d=>d.textContent.trim()==='📝 계약서 생성 (워드)')`, '모달');
chk(await evalJs(`document.body.innerText.includes('앱 기본 양식')`), '처음엔 앱 기본 양식 표시');
chk(await evalJs(`!!document.querySelector('input[type=file][accept=".docx"]')`), '양식 올리기 입력칸 존재');

// 2) 바뀐 계약서(.docx) 업로드
const {root:{nodeId:rootId}} = await S('DOM.getDocument',{depth:-1});
const {nodeId:fileId} = await S('DOM.querySelector',{nodeId:rootId,selector:'input[type=file][accept=".docx"]'});
await S('DOM.setFileInputFiles',{nodeId:fileId, files:[path.resolve(TPL)]});
await waitFor(`[...document.querySelectorAll('div')].some(d=>d.textContent.startsWith('저장됨 —'))`, '양식 점검 결과 표시');
const tplMsg = await evalJs(`[...document.querySelectorAll('div')].map(d=>d.textContent).find(t=>t.startsWith('저장됨'))`);
console.log('  업로드 결과:', tplMsg);
chk(/자리를 모두 찾았습니다/.test(tplMsg||''), '값 넣을 자리 전부 인식');
chk(await evalJs(`[...document.querySelectorAll('div')].some(d=>d.textContent.trim()===${JSON.stringify(path.basename(TPL))})`), '모달에 사용 양식 이름 표시');
chk(calls.includes('pfileSave'), '양식이 첨부 저장소로 분리 저장됨');

// 3) 모델 정보 입력 후 생성
await evalJs(`(()=>{
  const set=(el,v)=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
                      el.dispatchEvent(new Event('input',{bubbles:true})); };
  const ins=[...document.querySelectorAll('input')].filter(i=>i.type!=='file');
  const by=ph=>ins.find(i=>(i.placeholder||'').includes(ph));
  set(by('홍길동'),'김하늘');
  set(by('010-1234-5678'),'010-9999-8888');
  set(by('서울특별시'),'서울특별시 강남구 테헤란로 1');
  set(by('비워두면'),'900101-2345678');
  set(by('800000'),'800000');
  set(document.querySelector('input[type=date]'),'2026-08-03');
  return 1;
})()`);
await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('내려받기')).click(), 1`);

// 4) 내려받은 파일 확인
let file=null;
for(let i=0;i<60;i++){
  const f=fs.readdirSync(DL).filter(n=>n.endsWith('.docx'));
  if(f.length){ file=path.join(DL,f[0]); break; }
  await new Promise(r=>setTimeout(r,300));
}
chk(!!file, '워드 파일 다운로드'+(file?' ('+path.basename(file)+')':''));
if(file){
  const xml = unzip(fs.readFileSync(file))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g,'');
  chk(xml.includes('김하늘'), '모델 이름 반영');
  chk(xml.includes('800,000'), '모델료 반영');
  chk(xml.includes('2026년 08월 03일'), '계약일자 반영');
  chk(xml.includes('010-9999-8888'), '연락처 반영');
  chk(xml.includes('900101-2345678'), '주민등록번호 반영');
  chk(xml.includes('서울특별시 강남구 테헤란로 1'), '주소 반영');
  chk(!/000\s*[(（]\s*이하/.test(xml), '양식 빈칸 제거');
  // 업로드한 양식 그대로인지 — 조항 개수·문구 유지
  const src = unzip(fs.readFileSync(path.resolve(TPL)))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g,'');
  const clauses = s=>(s.match(/제\d+조/g)||[]).length;
  chk(clauses(xml)===clauses(src) && clauses(src)>0, '조항 수 동일 ('+clauses(src)+'개)');
  const co = (src.match(/주식회사\s*\S+/)||[''])[0].replace(/\s/g,'');
  chk(xml.replace(/\s/g,'').includes(co), '올린 양식의 광고주 그대로 ('+co+')');
  chk(!xml.includes('드래프터') || co.includes('드래프터'), '앱 내장 기본양식이 아니라 올린 양식 사용');
}

// 5) 저장 데이터에 양식 참조가 남고, 본문에 파일이 박히지 않았는지
await new Promise(r=>setTimeout(r,6000));
const bt = savedData.brands.find(b=>b.id==='basetune');
chk(!!bt?.contractTemplate, '브랜드 데이터에 양식 기록');
chk(/^\/api\/pfile/.test(bt?.contractTemplate?.url||''), '본문엔 참조만(base64 미포함)');
chk(JSON.stringify(savedData).length < 60000, '저장 페이로드 작음 ('+JSON.stringify(savedData).length+'B)');

// 6) 새로고침 후에도 그 양식으로 생성되는지(다른 사람 브라우저와 동일 상황)
fs.rmSync(DL,{recursive:true,force:true}); fs.mkdirSync(DL);
await S('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await waitFor(`document.querySelector('.contract-link')`, '재로딩');
await evalJs(`document.querySelector('.contract-link').click(), 1`);
await waitFor(`document.body.innerText.includes(${JSON.stringify(path.basename(TPL))})`, '저장된 양식 표시');
chk(true, '새로고침 후에도 올린 양식 유지');
await evalJs(`(()=>{
  const set=(el,v)=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
                      el.dispatchEvent(new Event('input',{bubbles:true})); };
  const ins=[...document.querySelectorAll('input')].filter(i=>i.type!=='file');
  set(ins.find(i=>(i.placeholder||'').includes('홍길동')),'박서준');
  set(ins.find(i=>(i.placeholder||'').includes('800000')),'1200000');
  return 1;
})()`);
await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('내려받기')).click(), 1`);
let file2=null;
for(let i=0;i<60;i++){ const f=fs.readdirSync(DL).filter(n=>n.endsWith('.docx')); if(f.length){ file2=path.join(DL,f[0]); break; } await new Promise(r=>setTimeout(r,300)); }
chk(!!file2, '재접속 생성 다운로드');
if(file2){
  const x2 = unzip(fs.readFileSync(file2))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g,'');
  chk(x2.includes('박서준') && x2.includes('1,200,000'), '저장된 양식으로 값 채움');
  const src2 = unzip(fs.readFileSync(path.resolve(TPL)))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g,'');
  const co2 = (src2.match(/주식회사\s*\S+/)||[''])[0].replace(/\s/g,'');
  chk(x2.replace(/\s/g,'').includes(co2), '재접속 시 첨부 저장소에서 양식을 받아 씀(pfileGet, '+co2+')');
}

console.log('\n'+(fail?('❌ 실패 '+fail+'건'):'✅ E2E 전부 통과'));
try{ chrome.kill(); }catch{}
server.close();
process.exit(fail?1:0);
