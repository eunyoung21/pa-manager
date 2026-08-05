/* PA Manager 계약서 메일 발송 E2E
   목백엔드 + 실제 크롬(CDP)으로 index.html 을 띄워 사람이 하듯 입력·클릭한다.
   확인: 📧 메일 보내기 한 번 → 백엔드가 받은 요청에 받는사람·제목·본문·계약서 첨부(.docx)가 다 들어있는가.
   실행: node test/contract-mail.e2e.mjs   (양식 인자 불필요 — 앱 기본 양식 사용) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { unzip } from './ziplib.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-ctmail-e2e');
const DL = path.join(TMP, 'dl');
fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });

/* ── 목 백엔드 ── */
let savedData = { brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
] };
let mailCall = null, mailFails = false, rev = 1;
const PORT = 8932;
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       window.open=function(u){ window.__opened=u; return null; };
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'users' || b.action === 'logs') return send({ ok: true, users: [], logs: [] });
    if (b.action === 'login') return send({ ok: true, token: 'T', username: '테스터', role: 'manager', brand: 'all' });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    if (b.action === 'save') { savedData = b.data; rev++; return send({ ok: true, rev }); }
    if (b.action === 'contractMail') {
      mailCall = b;
      if (mailFails) return send({ error: '메일 발송 실패: Invalid from address' });
      return send({ ok: true, to: b.to, from: 'cheddar@dayzcorp.kr' });
    }
    return send({ ok: true });
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ── 크롬 (CDP) ── */
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof'); fs.rmSync(UD, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9334',
  '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { const j = await (await fetch('http://127.0.0.1:9334/json/version')).json(); return j.webSocketDebuggerUrl; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('크롬 기동 실패');
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const waiters = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId; waiters.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => {});

const evalJs = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 오류: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr, label, ms = 25000) {
  const t0 = Date.now();
  for (;;) {
    if (await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return;
    if (Date.now() - t0 > ms) throw new Error('시간초과: ' + label);
    await new Promise(r => setTimeout(r, 250));
  }
}
const waitCall = async (get, label, ms = 20000) => {
  const t0 = Date.now();
  while (!get()) { if (Date.now() - t0 > ms) throw new Error('시간초과: ' + label); await new Promise(r => setTimeout(r, 200)); }
};
let fail = 0;
const chk = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
const clickBtn = t => evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(t)})).click(), 1`);
const fillForm = (email) => evalJs(`(()=>{
  const set=(el,v)=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
                      el.dispatchEvent(new Event('input',{bubbles:true})); };
  const ins=[...document.querySelectorAll('input')].filter(i=>i.type!=='file');
  const by=ph=>ins.find(i=>(i.placeholder||'').includes(ph));
  set(by('홍길동'),'김하늘');
  set(by('010-1234-5678'),'010-9999-8888');
  set(by('서울특별시'),'서울특별시 강남구 테헤란로 1');
  set(by('800000'),'800000');
  set(document.querySelector('input[type=date]'),'2026-08-05');
  ${email ? `set(by('model@example.com'),${JSON.stringify(email)});` : ''}
  return 1;
})()`);

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`document.querySelector('.contract-link')`, '앱 로딩');
await evalJs(`document.querySelector('.contract-link').click(), 1`);
await waitFor(`[...document.querySelectorAll('div')].some(d=>d.textContent.trim()==='📝 계약서 생성 (워드)')`, '모달');
console.log('모달 열림');

// 1) 이메일 칸 존재 + 이메일 없이 보내면 막힌다
chk(await evalJs(`!!document.body.innerText.includes('받는 사람 이메일')`), '받는 사람 이메일 입력칸 있음');
await fillForm('');
await clickBtn('메일 보내기');
await new Promise(r => setTimeout(r, 600));
chk(await evalJs(`document.body.innerText.includes('받는 사람 이메일을 정확히')`), '이메일 없이 보내면 경고');
chk(mailCall === null, '이메일 없으면 발송 요청 안 감');

// 2) 원클릭 발송
await fillForm('model@example.com');
await clickBtn('메일 보내기');
await waitCall(() => mailCall, '발송 요청');
chk(mailCall.action === 'contractMail', '백엔드에 contractMail 요청');
chk(mailCall.to === 'model@example.com', '받는 사람 전달 ('+mailCall.to+')');
chk(/김하늘/.test(mailCall.subject || ''), '제목 자동 작성 ('+mailCall.subject+')');
chk(/800,000원/.test(mailCall.body || ''), '본문에 모델료');
chk(/2026년 08월 05일/.test(mailCall.body || ''), '본문에 계약일자');
chk(/주민등록번호/.test(mailCall.body || ''), '비워둔 칸(주민등록번호)을 모델이 채우도록 안내');
chk(!/연락처·/.test(mailCall.body || '') && !/'모델'란의 연락처/.test(mailCall.body || ''), '이미 채운 칸(연락처)은 안내에서 빠짐');
chk(/\.docx$/.test(mailCall.filename || ''), '첨부 파일명 .docx ('+mailCall.filename+')');
chk(/^data:application\/vnd\.openxmlformats/.test(mailCall.data || ''), '첨부가 워드 데이터로 전달됨');

// 3) 첨부가 진짜 계약서인지 — 풀어서 값 확인
const buf = Buffer.from(String(mailCall.data).split(',')[1], 'base64');
chk(buf.length > 500, '첨부 크기 정상 ('+buf.length+'B)');
let xml = '';
try { xml = unzip(buf)['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { chk(false, '첨부 zip 해제: ' + e.message); }
chk(xml.includes('김하늘'), '첨부 계약서에 모델 이름');
chk(xml.includes('800,000'), '첨부 계약서에 모델료');
chk(xml.includes('2026년 08월 05일'), '첨부 계약서에 계약일자');
chk(xml.includes('010-9999-8888'), '첨부 계약서에 연락처');
chk(xml.includes('광고모델 계약서'), '첨부가 계약서 본문 전체');

// 4) 성공 안내
await waitFor(`document.body.innerText.includes('model@example.com 님에게 보냈습니다')`, '발송 완료 안내');
chk(true, '발송 완료 안내 표시');
chk(fs.readdirSync(DL).filter(n => n.endsWith('.docx')).length === 0, '메일 발송만 하면 파일은 안 내려받음');

// 5) 발송 실패 → 수동 경로(다운로드 + Gmail 작성창) 제공
mailFails = true; mailCall = null;
await clickBtn('메일 보내기');
await waitCall(() => mailCall, '실패 요청');
await waitFor(`document.body.innerText.includes('메일 발송 실패')`, '실패 안내');
chk(true, '발송 실패 시 이유 표시');
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Gmail 작성창 열기'))`, '폴백 버튼');
await clickBtn('Gmail 작성창 열기');
let dl = null;
for (let i = 0; i < 40; i++) { const f = fs.readdirSync(DL).filter(n => n.endsWith('.docx')); if (f.length) { dl = path.join(DL, f[0]); break; } await new Promise(r => setTimeout(r, 300)); }
chk(!!dl, '폴백에서 계약서 파일 다운로드');
const opened = await evalJs(`window.__opened||''`);
chk(/mail\.google\.com/.test(opened), 'Gmail 작성창 열림');
chk(/to=model%40example\.com/.test(opened), '작성창에 받는 사람 채워짐');
chk(/authuser=cheddar%40dayzcorp\.kr/.test(opened), '팀 계정으로 작성');

// 6) 올린 양식(.docx)으로도 첨부되는지 — 실제 운영은 브랜드별 업로드 양식을 쓴다
const TPL = process.argv[2];
if (TPL) {
  mailFails = false; mailCall = null;
  const { root: { nodeId: rootId } } = await S('DOM.getDocument', { depth: -1 });
  const { nodeId: fileId } = await S('DOM.querySelector', { nodeId: rootId, selector: 'input[type=file][accept=".docx"]' });
  await S('DOM.setFileInputFiles', { nodeId: fileId, files: [path.resolve(TPL)] });
  await waitFor(`[...document.querySelectorAll('div')].some(d=>d.textContent.startsWith('저장됨 —'))`, '양식 업로드');
  await fillForm('model2@example.com');
  await clickBtn('메일 보내기');
  await waitCall(() => mailCall, '양식 발송 요청');
  chk(mailCall.to === 'model2@example.com', '올린 양식으로도 발송 요청');
  const b2 = Buffer.from(String(mailCall.data).split(',')[1], 'base64');
  const x2 = unzip(b2)['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, '');
  const src = unzip(fs.readFileSync(path.resolve(TPL)))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, '');
  const co = (src.match(/주식회사\s*\S+/) || [''])[0].replace(/\s/g, '');
  chk(x2.includes('김하늘') && x2.includes('800,000'), '첨부에 값 채워짐(올린 양식)');
  chk(x2.replace(/\s/g, '').includes(co), '첨부가 올린 양식 그대로 (' + co + ')');
} else {
  console.log('  (양식 인자 없음 — 업로드 양식 첨부 검사는 건너뜀)');
}

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 메일 발송 E2E 전부 통과'));
try { chrome.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
