/* 컨택현황 상세 창 '계약서발송/수집' 단계 — 모두싸인 발송 E2E (2026-10-13 다시 켬)
   목 백엔드 + 목 모두싸인 브리지 + 실제 크롬. 확인: 관리자만 ✍️ 버튼 · 등록된 브랜드 양식에 입력값 채운 계약서를 브리지 /send 로
   (첫 클릭은 확인만) · 발송 기록(contractSent)·실명/연락처/주소/단가 저장, 계약완료는 안 건드림 · 주민번호는 저장 안 함 ·
   양식 없는 브랜드는 앱 내장 양식 · 브리지 꺼짐/실패 안내 · 알바는 모두싸인 버튼 없이 계약완료만.
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
let role = 'manager', msFails = false, msDown = false;

const S2 = (id, name, pa, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: 'https://instagram.com/' + id, followers: '1000', pa,
  contactStatus: '진행중', dmSent: 'Y', dmDate: '26.09.02', dealDone: 'Y', dealDate: '26.09.03', finalDone: 'N', rate: '', shipDate: '', expectedPost: '',
  shippingDone: '✅ 완료', shipDate: '26.09.04', contractDone: '미완료', contractUrl: '', memo: '', ...x });
let savedData = { brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('s2_a', '에이채널', '박민선', { realName: '김하늘', phone: '010-9999-8888', address: '서울시 강남구 1' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('g2_a', '그래니채널', '안민영', { realName: '박바다', phone: '010-1111-2222', rate: '50000' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
  { id: 'hattke', name: '해트케', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('h2_a', '해트채널', '안민영', { realName: '최하늘', phone: '010-3333-4444', rate: '70000', contractFile: { name: '옛파일.docx', url: '/api/pfile?id=900099' } })],
    shippingRows: [], reviewRows: [], privacyRows: [],
    contractTemplate: { name: '해트케_계약서.docx', url: '/api/pfile?id=900001', slots: { name: true, fee: true, date: true, phone: true, rrn: true, addr: true } } },
], settlements: {} };
let rev = 1, tplData = '', msCall = null;
// 목 모두싸인 브리지(관리자 PC의 localhost:8791 역할)
const MS_PORT = 8938;
const msServer = http.createServer((req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') return send(204, {});
  if (msDown) { req.socket.destroy(); return; }
  if (req.method === 'GET' && req.url.startsWith('/seals')) return send(200, { ok: true, items: ['드래프터', '썸웨어코드', '신규회사'] });
  let body = ''; req.setEncoding('utf8'); req.on('data', c => body += c);
  req.on('end', () => { msCall = JSON.parse(body || '{}'); send(200, msFails ? { error: '모두싸인 로그인이 풀렸습니다.' } : { ok: true }); });
});
await new Promise(r => msServer.listen(MS_PORT, '127.0.0.1', r));
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';window.MS_BRIDGE='http://127.0.0.1:${MS_PORT}';
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
    if (b.action === 'pfileSave') return send({ ok: true, id: 900002, url: '/api/pfile?id=900002' });
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
  await click('.step-tab', '인플루언서 관리'); await wait(500); await click('button', '협업성사 ('); await waitFor(`document.querySelector('.ch-link')`, '컨택현황'); await wait(300);
  await evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});s.click();return 1})()`); await wait(400);
};

// 등록 양식 준비 — 앱 기본 양식을 빈 값으로 만들어 '올린 양식'처럼 쓴다
await load();
const blank = await evalJs(`(async()=>{const b=await window.buildContractDocx('basetune','','','',{});return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(new Blob([b.bytes],{type:b.type}));});})()`);
await fetch(`http://127.0.0.1:${PORT}/api`, { method: 'POST', body: J({ action: '_setTpl', data: blank }) });
savedData.brands[0].contractTemplate = { name: '드래프터_광고계약서.docx', url: '/api/pfile?id=900001', slots: { name: true, fee: true, date: true, phone: true, rrn: true, addr: true } };
const docText = c => { try { return unzip(Buffer.from(String(c.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { return ''; } };
const msgIs = re => waitFor(`${re}.test((document.querySelector('.s2p .ms-msg')||{}).innerText||'')`, String(re));

await load();
await openCh('에이채널');
console.log('\n[화면] 계약서발송/수집 단계 — 관리자 모두싸인 발송');
let p = await panel();
chk(['실명 (계약자)', '연락처 (카카오톡', '주소', '주민등록번호', '모델료', '계약일자', '✍️ 모두싸인으로 계약서 보내기', '계약서 파일', '계약완료'].every(s => p.includes(s)), '입력칸·모두싸인 버튼·계약완료', p);
chk(/📄 드래프터_광고(모델)?계약서.docx/.test(p) && p.includes('베이스튠 전체 양식'), '계약서 파일 기본 = 베이스튠 전체 양식(드래프터)', (p.match(/📄[^\n]*/) || [''])[0]);
chk(await evalJs(`[...document.querySelectorAll('.s2p input')].some(i=>i.value==='김하늘')`), '앞 단계에서 넣은 실명이 채워져 있음');

console.log('\n[막기] 모델료 없으면 안 보냄 · 첫 클릭은 확인만');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300);
chk(/모델료/.test(await msg()) && msCall === null, '모델료 없으면 안내', await msg());
await fill('모델료', '80,000'); await fill('주소', '서울특별시 강남구 테헤란로 1'); await fill('주민등록번호', '900101-1234567');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300);
const ask = await evalJs(`(document.querySelector('.s2p .ms-ask')||{}).innerText||''`);
chk(/김하늘 님 · 카카오톡 010-9999-8888 · 80,000원/.test(ask), '첫 클릭은 받는 곳·금액 확인만', ask);
chk(msCall === null, '확인 전엔 안 보냄');

console.log('\n[발송]');
await click('.s2p button', '확인 — 보내기');
await msgIs(/모두싸인 서명 요청을 보냈습니다/);
chk(msCall && msCall.name === '김하늘' && msCall.method === 'KAKAO' && msCall.to === '010-9999-8888' && msCall.needRrn === false, '브리지에 이름·카카오톡 번호 전달', msCall && { n: msCall.name, to: msCall.to, rrn: msCall.needRrn });
chk(msCall.brand === '베이스튠' && msCall.seal === '드래프터' && msCall.needAddr === false, '라벨용 브랜드명·직인 회사·주소 채움 여부 전달', { b: msCall.brand, s: msCall.seal, a: msCall.needAddr });
chk(/^data:application\/vnd/.test(msCall.data || '') && !!msCall.title, '계약서 파일·제목 전달', msCall.title);
const xml = docText(msCall);
chk(xml.includes('김하늘') && xml.includes('80,000') && xml.includes('010-9999-8888') && xml.includes('서울특별시 강남구 테헤란로 1') && xml.includes('900101-1234567'), '보낸 계약서 = 등록 양식에 값 채움');
await wait(1800);
const r0 = row(0, '에이채널');
chk(!!r0.contractSent && r0.rate === '80,000' && r0.address === '서울특별시 강남구 테헤란로 1', '발송 기록·단가·주소 저장', { s: r0.contractSent, rate: r0.rate, a: r0.address });
chk(r0.contractDone === '미완료', '계약완료는 그대로(서명 후 직접)');
chk(!JSON.stringify(savedData).includes('900101'), '주민번호는 저장 안 됨');

console.log('\n[실패] 브리지 오류·꺼짐 → 이유 표시 · 데이터 안 바뀜');
const beforeRow = JSON.stringify(row(0, '에이채널'));
msFails = true;
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300); await click('.s2p button', '확인 — 보내기');
await msgIs(/모두싸인 발송 실패.*로그인/);
chk(true, '브리지 오류 표시'); msFails = false; msDown = true;
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300); await click('.s2p button', '확인 — 보내기');
await msgIs(/모두싸인 계약서 발송/);
chk(true, '브리지 꺼짐 → 「모두싸인 계약서 발송.bat」 켜라는 안내'); msDown = false;
await wait(1500);
chk(JSON.stringify(row(0, '에이채널')) === beforeRow, '실패하면 데이터 안 바뀜');

console.log('\n[등록 양식 없는 브랜드 → 앱 내장 양식]');
await click('.brand-tab, button', '그래니'); await wait(800);
await openCh('그래니채널');
p = await panel();
chk(p.includes('기본 (앱 내장 양식)'), '앱 내장 양식 표시');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
await msgIs(/모두싸인 서명 요청을 보냈습니다/);
const x2 = docText(msCall);
chk(msCall.brand === '그래니살라' && msCall.seal === '썸웨어코드' && msCall.needAddr === true, '그래니: 직인 썸웨어코드·주소 비어 모델이 입력', { b: msCall.brand, s: msCall.seal, a: msCall.needAddr });
chk(x2.includes('썸웨어코드') && x2.includes('박바다') && x2.includes('50,000') && msCall.needRrn === true, '앱 내장 양식으로 값 채워 보냄·주민번호 비면 모델이 입력');

console.log('\n[직인 회사] 브리지 목록 · 없으면 막기 · 고르면 브랜드에 저장');
await click('.brand-tab, button', '해트케'); await wait(800);
await openCh('해트채널');
const opts = await evalJs(`[...document.querySelectorAll('.s2p .ct-seal option')].map(o=>o.value)`);
chk(opts.includes('신규회사') && opts.includes('드래프터'), '직인 목록 = 브리지가 준 모두싸인 도장', opts);
chk(await evalJs(`document.querySelector('.s2p .ct-seal select').value`) === '', '해트케는 아직 직인 회사 없음');
msCall = null;
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300);
chk(/직인 회사/.test(await msg()) && msCall === null, '직인 회사 없으면 안 보냄', await msg());
chk((await panel()).includes('옛파일.docx'), '이 건에만 붙은 옛 파일 표시');
console.log('\n[계약서 올리기] 발송 창에서 올리면 브랜드 전체 양식 · 바로 발송(다시 안 받아옴)');
await evalJs(`(async()=>{const b=await window.buildContractDocx('basetune','','','',{});const f=new File([b.bytes],'해트케_협찬계약서.docx',{type:b.type});
  const inp=document.querySelector('.s2p .ct-file input[type=file]');const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await msgIs(/전체 계약서로 저장했습니다/);
await wait(1800);
chk(savedData.brands[2].contractTemplate && savedData.brands[2].contractTemplate.name === '해트케_협찬계약서.docx' && /900002/.test(savedData.brands[2].contractTemplate.url), '해트케 브랜드 양식으로 저장', savedData.brands[2].contractTemplate);
chk(!savedData.brands[2].step2Rows[0].contractFile, '이 건의 옛 파일은 떼어냄');
p = await panel();
chk(p.includes('해트케_협찬계약서.docx') && p.includes('해트케 전체 양식'), '화면에 「해트케 전체 양식」', (p.match(/📄[^\n]*\n?[^\n]*/) || [''])[0]);
await evalJs(`(()=>{const el=document.querySelector('.s2p .ct-seal select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'신규회사');el.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await wait(1800);
chk(savedData.brands[2].sealCompany === '신규회사', '고른 직인 회사가 해트케 브랜드에 저장', savedData.brands[2].sealCompany);
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300); await click('.s2p button', '확인 — 보내기');
await msgIs(/모두싸인 서명 요청을 보냈습니다/);
chk(msCall && msCall.seal === '신규회사' && msCall.brand === '해트케' && docText(msCall).includes('최하늘'), '해트케 → 해트케 등록 양식 + 신규회사 직인 + 라벨 해트케', msCall && { s: msCall.seal, b: msCall.brand });

console.log('\n[알바] 모두싸인 버튼 없음');
role = 'staff';
await load();
await openCh('에이채널');
p = await panel();
chk(!p.includes('모두싸인으로 계약서 보내기') && p.includes('계약완료'), '알바는 계약완료만', p);

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
server.close(); msServer.close();
process.exit(fail ? 1 : 0);
