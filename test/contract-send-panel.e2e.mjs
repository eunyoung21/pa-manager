/* 컨택현황 상세 창 '계약서발송/수집' 단계 — 이메일 발송 E2E (모두싸인 연동 임시 중단, 2026-09-22)
   목 백엔드 + 실제 크롬. 확인: 관리자만 📧 버튼 · 등록된 브랜드 양식으로 입력값 채운 계약서를 contractMail 로 보냄
   (첫 클릭은 확인만) · 발송 기록(contractSent)·실명/이메일/주소/단가 저장, 계약 완료는 안 건드림 · 주민번호는 저장 안 함 ·
   양식 없는 브랜드는 앱 내장 양식으로 보냄 · 발송 실패 시 안내 · 매니저는 예전 화면(계약 완료만).
   실행: node test/contract-send-panel.e2e.mjs */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { unzip } from './ziplib.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-contract-send-e2e');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const PORT = 8937;
let role = 'manager', mailFails = false;

const S2 = (id, name, pa, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: 'https://instagram.com/' + id, followers: '1000', pa,
  contactStatus: '진행중', dmSent: 'Y', dmDate: '26.09.02', dealDone: 'Y', dealDate: '26.09.03', finalDone: 'N', rate: '', shipDate: '', expectedPost: '',
  shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
let savedData = { brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('s2_a', '에이채널', '박민선', { realName: '김하늘', phone: '010-9999-8888', address: '서울시 강남구 1' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('g2_a', '그래니채널', '안민영', { realName: '박바다', phone: '010-1111-2222', rate: '50000' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
], settlements: {} };
let rev = 1, tplData = '', mailCall = null;
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:${JSON.stringify(role)},brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', c => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'login') return send({ ok: true, token: 'T', username: '테스터', role, brand: 'all' });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    // 테스트가 서버 쪽에 직접 심어둔 계약서 양식은, 그걸 아직 모르는(먼저 로드된) 탭의 저장으로 지워지면 안 된다.
    if (b.action === 'save') { const tpl = savedData.brands[0].contractTemplate; savedData = b.data; if (tpl && !savedData.brands[0].contractTemplate) savedData.brands[0].contractTemplate = tpl; rev++; return send({ ok: true, rev }); }
    if (b.action === '_setTpl') { tplData = b.data; return send({ ok: true }); }
    if (b.action === 'pfileGet') return send(b.id === '900001' && tplData ? { ok: true, dataUrl: tplData } : { ok: false, error: 'no file' });
    if (b.action === 'contractMail') {
      mailCall = b;
      if (mailFails) return send({ error: '메일 발송 실패: Invalid from address' });
      return send({ ok: true, to: b.to, from: 'cheddar@dayzcorp.kr' });
    }
    return send({ ok: true, users: [], logs: [] });
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

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
const J = JSON.stringify;
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
const panel = () => evalJs(`(document.querySelector('.s2p')||{}).innerText||''`);
const fill = (label, v) => evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith(${J(label)}));const el=f.querySelector('input,textarea');
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const msg = () => evalJs(`((document.querySelector('.s2p .ms-msg')||{}).innerText||'')`);
const row = (bi, n) => savedData.brands[bi].step2Rows.find(r => r.name === n) || {};
const load = async () => {
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('인플루언서 관리'))`, '앱 로딩');
  await evalJs(`(window.confirm=()=>true,window.alert=()=>{},1)`);
};
const openCh = async n => {
  await click('.step-tab', '인플루언서 관리'); await waitFor(`document.querySelector('.ch-link')`, '컨택현황'); await wait(300);
  await evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});s.click();return 1})()`); await wait(400);
};

// 등록 양식 준비 — 앱 기본 양식을 빈 값으로 만들어 '올린 양식'처럼 쓴다
await load();
const blank = await evalJs(`(async()=>{const b=await window.buildContractDocx('basetune','','','',{});return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(new Blob([b.bytes],{type:b.type}));});})()`);
await fetch(`http://127.0.0.1:${PORT}/api`, { method: 'POST', body: J({ action: '_setTpl', data: blank }) });
savedData.brands[0].contractTemplate = { name: '드래프터_광고계약서.docx', url: '/api/pfile?id=900001', slots: { name: true, fee: true, date: true, phone: true, rrn: true, addr: true } };

await load();
await openCh('에이채널');
console.log('\n[화면] 계약서발송/수집 단계 — 이메일 발송(모두싸인 임시 중단)');
let p = await panel();
chk(['실명 (계약자)', '받는 사람 이메일', '연락처', '주소', '주민등록번호', '모델료', '계약일자', '📧 이메일로 계약서 보내기', '계약서 파일', '계약 완료'].every(s => p.includes(s)), '입력칸·이메일 발송 버튼·계약 완료', p);
chk(!p.includes('모두싸인으로 계약서 보내기') && !p.includes('카카오톡'), '모두싸인·카카오톡 선택은 없음(임시 중단)');
chk(/📄 드래프터_광고(모델)?계약서.docx/.test(p) && p.includes('기본 (등록 양식)'), '계약서 파일 기본 = 등록된 드래프터 양식', (p.match(/📄[^\n]*/) || [''])[0]);
chk(await evalJs(`[...document.querySelectorAll('.s2p input')].some(i=>i.value==='김하늘')`), '앞 단계에서 넣은 실명이 채워져 있음');

console.log('\n[막기] 이메일 없으면 안 보냄');
await click('.s2p button', '이메일로 계약서 보내기'); await wait(300);
chk(/이메일/.test(await msg()) && mailCall === null, '이메일 없으면 안내');
await fill('받는 사람 이메일', 'model@example.com'); await fill('모델료', '80,000'); await fill('주소', '서울특별시 강남구 테헤란로 1');
await click('.s2p button', '이메일로 계약서 보내기'); await wait(300);
chk(/김하늘 님 · 이메일 model@example\.com · 80,000원/.test(await evalJs(`(document.querySelector('.s2p .ms-ask')||{}).innerText||''`)), '첫 클릭은 받는 곳·금액 확인만', await evalJs(`(document.querySelector('.s2p .ms-ask')||{}).innerText||''`));
chk(mailCall === null, '확인 전엔 안 보냄');

console.log('\n[발송]');
await click('.s2p button', '확인 — 보내기');
await waitFor(`/에게 계약서를 메일로 보냈습니다/.test((document.querySelector('.s2p .ms-msg')||{}).innerText||'')`, '발송 안내');
chk(mailCall && mailCall.action === 'contractMail' && mailCall.to === 'model@example.com' && mailCall.brand === 'basetune', '백엔드에 이메일·브랜드 전달', mailCall && { to: mailCall.to, brand: mailCall.brand });
chk(/\.docx$/.test(mailCall.filename || ''), '첨부 파일명 .docx', mailCall.filename);
let xml = '';
try { xml = unzip(Buffer.from(String(mailCall.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { chk(false, '첨부 풀기: ' + e.message); }
chk(xml.includes('김하늘') && xml.includes('80,000') && xml.includes('010-9999-8888') && xml.includes('서울특별시 강남구 테헤란로 1'), '보낸 첨부 = 등록 양식에 실명·모델료·연락처·주소 채움');
await wait(1800);
const r0 = row(0, '에이채널');
chk(!!r0.contractSent && r0.email === 'model@example.com' && r0.rate === '80,000' && r0.address === '서울특별시 강남구 테헤란로 1', '발송 기록·이메일·단가·주소 저장', { s: r0.contractSent, email: r0.email, rate: r0.rate, a: r0.address });
chk(r0.contractDone === '미완료', '계약 완료는 그대로(회신 후 직접)');
chk(!JSON.stringify(savedData).includes('900101'), '주민번호는 저장 안 됨(비워둠)');

console.log('\n[실패] 발송 실패 시 이유 표시 · 데이터는 안 바뀜');
mailFails = true; mailCall = null;
const beforeRow = JSON.stringify(row(0, '에이채널'));
await click('.s2p button', '이메일로 계약서 보내기'); await wait(300);
await click('.s2p button', '확인 — 보내기');
await waitFor(`/메일 발송 실패/.test((document.querySelector('.s2p .ms-msg')||{}).innerText||'')`, '실패 안내');
chk(true, '실패 이유 표시');
chk(JSON.stringify(row(0, '에이채널')) === beforeRow, '실패하면 데이터 안 바뀜');
mailFails = false;

console.log('\n[등록 양식 없는 브랜드 → 앱 내장 양식]');
await click('.brand-tab, button', '그래니'); await wait(800);
await openCh('그래니채널');
p = await panel();
chk(p.includes('기본 (앱 내장 양식)'), '앱 내장 양식 표시');
await fill('받는 사람 이메일', 'sea@example.com');
await click('.s2p button', '이메일로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
await waitFor(`document.querySelector('.s2p .ms-msg')&&/에게 계약서를 메일로 보냈습니다/.test(document.querySelector('.s2p .ms-msg').innerText)`, '이메일 발송 안내(그래니)');
let x2 = ''; try { x2 = unzip(Buffer.from(String(mailCall.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch {}
chk(x2.includes('썸웨어코드') && x2.includes('박바다') && x2.includes('50,000'), '앱 내장 양식으로 값 채워 보냄');

console.log('\n[매니저] 예전 화면(계약 완료만)');
role = 'staff';
await load();
await openCh('에이채널');
p = await panel();
chk(!p.includes('이메일로 계약서 보내기') && p.includes('계약 완료일') && p.includes('계약 완료'), '매니저는 이메일 발송 없이 계약 완료만');

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
