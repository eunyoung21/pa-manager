/* 모두싸인 서명 요청 E2E (브리지 방식)
   목 백엔드 + 가짜 브리지 + 실제 크롬으로 계약서 생성 창에서 사람이 하듯 입력·클릭한다. 실제 모두싸인엔 안 나간다.
   확인: 관리자만 ✍️ 모두싸인 보임 → 카카오톡(전화번호)으로 보내면 브리지가 값 채운 계약서·받는 곳·주민번호칸 여부를 받음,
        보낸 목록 표시, 브리지 꺼져 있으면 안내, 📧 메일 방식은 그대로.
   실행: node test/modusign.e2e.mjs */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { unzip } from './ziplib.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-modusign-e2e');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const PORT = 8937, BPORT = 8938;
let role = 'manager';

/* ── 목 백엔드 ── */
let savedData = { brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
] };
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';window.MS_BRIDGE='http://127.0.0.1:${BPORT}';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:${JSON.stringify(role)},brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'login') return send({ ok: true, token: 'T', username: '테스터', role, brand: 'all' });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev: 1 });
    if (b.action === 'rev') return send({ ok: true, rev: 1 });
    return send({ ok: true, users: [], logs: [] });
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ── 가짜 브리지 ── */
const bridgeCalls = []; const sentLog = [];
let bridge = null;
const startBridge = () => new Promise(r => {
  bridge = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(JSON.stringify(o)); };
    if (req.method === 'OPTIONS') return send({});
    if (req.url.startsWith('/list')) return send({ ok: true, items: sentLog.slice().reverse() });
    let raw = ''; req.on('data', c => raw += c);
    req.on('end', () => { const b = JSON.parse(raw); bridgeCalls.push(b); sentLog.push({ name: b.name, to: b.to, method: b.method, title: b.title, sentAt: new Date().toISOString(), by: b.by }); send({ ok: true }); });
  });
  bridge.listen(BPORT, '127.0.0.1', r);
});

/* ── 크롬 (CDP) ── */
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9337',
  '--user-data-dir=' + path.join(TMP, 'prof'), 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { return (await (await fetch('http://127.0.0.1:9337/json/version')).json()).webSocketDebuggerUrl; }
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
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId; waiters.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => cdp(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
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
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const clickBtn = t => evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(t)})).click(), 1`);
const txt = () => evalJs(`document.body.innerText`);
const fill = (o) => evalJs(`(()=>{
  const set=(el,v)=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
  const ins=[...document.querySelectorAll('input')].filter(i=>i.type!=='file');
  const by=ph=>ins.find(i=>(i.placeholder||'').includes(ph));
  const o=${JSON.stringify(o)};
  if('name' in o) set(by('홍길동'),o.name);
  if('phone' in o) set(by('010-1234-5678'),o.phone);
  if('addr' in o) set(by('서울특별시'),o.addr);
  if('fee' in o) set(by('800000'),o.fee);
  if('rrn' in o) set(by('비워두면'),o.rrn);
  if('email' in o) set(by('model@example.com'),o.email);
  set(document.querySelector('input[type=date]'),'2026-09-21');
  return 1;
})()`);
const openModal = async () => {
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitFor(`document.querySelector('.contract-link')`, '앱 로딩');
  await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},1)`);
  await evalJs(`document.querySelector('.contract-link').click(), 1`);
  await waitFor(`[...document.querySelectorAll('div')].some(d=>d.textContent.trim()==='📝 계약서 생성 (워드)')`, '계약서 생성 창');
};

await openModal();
console.log('\n[기본] 📧 메일이 기본 · 기존 화면 그대로');
chk((await txt()).includes('받는 사람 이메일') && (await txt()).includes('메일 보내기'), '메일 방식: 이메일 칸·메일 보내기');
chk(await evalJs(`!!document.querySelector('.ct-via')`), '관리자는 📧/✍️ 선택이 보임');

console.log('\n[브리지 꺼짐] 안내');
await clickBtn('✍️ 모두싸인'); await waitFor(`document.querySelector('.ms-list')`, '모두싸인 화면');
await waitFor(`document.body.innerText.includes('모두싸인_시작.bat')`, '브리지 꺼짐 안내');
chk(true, '목록을 못 읽으면 「모두싸인_시작.bat」 안내');
await fill({ name: '김하늘', phone: '010-9999-8888', addr: '서울특별시 강남구 테헤란로 1', fee: '800000' });
await clickBtn('서명 요청 보내기');
await waitFor(`document.body.innerText.includes('모두싸인 요청 실패')`, '발송 실패 안내');
chk((await txt()).includes('모두싸인_시작.bat'), '보내기 눌러도 브리지 꺼져 있으면 안내');

console.log('\n[발송] 카카오톡');
await startBridge();
await clickBtn('↻ 새로고침'); await wait(500);
chk((await evalJs(`document.querySelector('.ms-list').innerText`)).includes('아직 없음'), '브리지 켜면 빈 목록');
await fill({ phone: '' }); await clickBtn('서명 요청 보내기'); await wait(400);
chk((await txt()).includes('010 휴대폰 번호를 전화번호 칸에') && bridgeCalls.length === 0, '전화번호 없으면 막음');
await fill({ phone: '010-9999-8888' });
await clickBtn('서명 요청 보내기');
await waitFor(`document.body.innerText.includes('김하늘 님에게 서명 요청을 보냈습니다')`, '발송 안내');
const c0 = bridgeCalls[0] || {};
chk(/카카오톡 010-9999-8888/.test(await evalJs('window.__cf[0]||""')), '보내기 전 확인창(받는 곳)');
chk(c0.name === '김하늘' && c0.method === 'KAKAO' && c0.to === '010-9999-8888' && c0.by === '테스터', '브리지에 이름·카카오톡·번호·보낸 사람', c0);
chk(c0.needRrn === true, '주민번호 비워 보내면 모델 입력칸 요청');
chk(/광고모델계약서_김하늘/.test(c0.title || '') && !/\.docx$/.test(c0.title), '제목 = 계약서 파일명(.docx 뗌)', c0.title);
let xml = '';
try { xml = unzip(Buffer.from(String(c0.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { chk(false, '보낸 파일 풀기: ' + e.message); }
chk(xml.includes('김하늘') && xml.includes('800,000') && xml.includes('010-9999-8888') && xml.includes('서울특별시 강남구 테헤란로 1'), '보낸 파일 = 입력값 채운 계약서');
chk(xml.includes('(인)') && xml.includes('주민등록번호'), '서명 자리 기준 글자가 계약서에 있음');
await waitFor(`document.querySelectorAll('.ms-item').length===1`, '목록 갱신');
chk(/김하늘.*테스터.*카카오톡 보냄/.test(await evalJs(`document.querySelector('.ms-item').innerText.replace(/\\s+/g,' ')`)), '목록: 김하늘 · 테스터 · 카카오톡 보냄');

console.log('\n[발송] 이메일 · 주민번호 채움');
await evalJs(`[...document.querySelectorAll('input[name=ms-how]')][1].click(),1`); await wait(200);
await fill({ name: '박바다', email: 'sea@example.com', rrn: '900101-1234567' });
await clickBtn('서명 요청 보내기');
await waitFor(`document.body.innerText.includes('박바다 님에게 서명 요청을 보냈습니다')`, '이메일 발송 안내');
const c1 = bridgeCalls[1] || {};
chk(c1.method === 'EMAIL' && c1.to === 'sea@example.com' && c1.needRrn === false, '이메일·주민번호칸 없음', { m: c1.method, to: c1.to, r: c1.needRrn });

console.log('\n[매니저] 모두싸인 선택이 안 보임');
role = 'staff';
await openModal();
chk(!(await evalJs(`!!document.querySelector('.ct-via')`)) && (await txt()).includes('메일 보내기'), '매니저는 메일만');

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
server.close(); bridge?.close();
process.exit(fail ? 1 : 0);
