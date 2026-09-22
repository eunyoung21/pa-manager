/* 모두싸인 계약서 발송 E2E — 컨택현황 상세 창 '계약서발송/수집' 단계
   목 백엔드 + 가짜 브리지 + 실제 크롬. 실제 모두싸인엔 안 나간다.
   확인: 관리자만 ✍️ 버튼 · 등록된 브랜드 양식으로 입력값 채운 계약서를 브리지로 보냄(첫 클릭은 확인만) ·
        발송 기록(contractSent)·실명/연락처/주소/단가 저장, 계약 완료는 안 건드림 · 주민번호는 저장 안 함 ·
        양식 없는 브랜드는 안 보냄 · 브리지 꺼져 있으면 안내 · 매니저는 예전 화면.
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

const S2 = (id, name, pa, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: 'https://instagram.com/' + id, followers: '1000', pa,
  contactStatus: '진행중', dmSent: 'Y', dmDate: '26.09.02', dealDone: 'Y', dealDate: '26.09.03', finalDone: 'N', rate: '', shipDate: '', expectedPost: '',
  shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
let savedData = { paList: ['박민선', '안민영'], brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('s2_a', '에이채널', '박민선', { realName: '김하늘', phone: '010-9999-8888', address: '서울시 강남구 1' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [],
    step2Rows: [S2('g2_a', '그래니채널', '안민영', { realName: '박바다', phone: '010-1111-2222', rate: '50000' })],
    shippingRows: [], reviewRows: [], privacyRows: [] },
], settlements: {} };
savedData.brands[0].contractTemplate = { name: '드래프터_광고계약서.docx', url: '/api/pfile?id=900001', slots: { name: true, fee: true, date: true, phone: true, rrn: true, addr: true } };
let rev = 1, tplData = '';
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';window.MS_BRIDGE='http://127.0.0.1:${BPORT}';
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
    if (b.action === 'save') { savedData = b.data; rev++; return send({ ok: true, rev }); }
    if (b.action === '_setTpl') { tplData = b.data; return send({ ok: true }); }
    if (b.action === 'pfileGet') return send(b.id === '900001' && tplData ? { ok: true, dataUrl: tplData } : { ok: false, error: 'no file' });
    return send({ ok: true, users: [], logs: [] });
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ── 가짜 브리지 ── */
const bridgeCalls = [];
let bridge = null;
const startBridge = () => new Promise(r => {
  bridge = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(JSON.stringify(o)); };
    if (req.method === 'OPTIONS') return send({});
    let raw = ''; req.on('data', c => raw += c);
    req.on('end', () => { bridgeCalls.push(JSON.parse(raw)); send({ ok: true }); });
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
  // STEP2 컨택현황은 '인플루언서 관리' 탭으로 합쳐졌다(리스팅 목록과 같은 탭, 다른 칩).
  await click('.step-tab', '인플루언서 관리'); await waitFor(`document.querySelector('.ch-link')`, '컨택현황'); await wait(300);
  await evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});s.click();return 1})()`); await wait(400);
};

// 등록 양식 준비 — 앱 기본 양식을 빈 값으로 만들어 '올린 양식'처럼 쓴다
await load();
const blank = await evalJs(`(async()=>{const b=await window.buildContractDocx('basetune','','','',{});return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(new Blob([b.bytes],{type:b.type}));});})()`);
await fetch(`http://127.0.0.1:${PORT}/api`, { method: 'POST', body: J({ action: '_setTpl', data: blank }) });

await load();
await openCh('에이채널');
console.log('\n[화면] 계약서발송/수집 단계');
let p = await panel();
chk(['실명 (계약자)', '연락처 (카카오톡', '주소', '주민등록번호', '모델료', '계약일자', '✍️ 모두싸인으로 계약서 보내기', '계약서 파일', '계약 완료'].every(s => p.includes(s)), '입력칸·모두싸인 버튼·계약 완료');
chk(/📄 드래프터_광고계약서\.docx/.test(p) && p.includes('기본 (등록 양식)'), '계약서 파일 기본 = 등록된 드래프터 양식', (p.match(/📄[^\n]*/) || [''])[0]);
chk(!p.includes('계약서 파일 링크'), '링크 입력칸 대신 파일 첨부');
chk(p.includes('김하늘') || (await evalJs(`[...document.querySelectorAll('.s2p input')].some(i=>i.value==='김하늘')`)), '앞 단계에서 넣은 실명이 채워져 있음');

console.log('\n[막기] 모델료 없으면 / 브리지 꺼짐');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300);
chk(/모델료/.test(await msg()) && bridgeCalls.length === 0, '모델료 없으면 안내');
await fill('모델료', '80,000'); await fill('주소', '서울특별시 강남구 테헤란로 1');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(300);
chk(/김하늘 님 · 카카오톡 010-9999-8888 · 80,000원/.test(await evalJs(`(document.querySelector('.s2p .ms-ask')||{}).innerText||''`)), '첫 클릭은 받는 곳·금액 확인만');
await click('.s2p button', '확인 — 보내기');
await waitFor(`document.querySelector('.s2p .ms-msg')`, '실패 안내');
chk(/모두싸인_시작\.bat/.test(await msg()), '브리지 꺼져 있으면 「모두싸인_시작.bat」 안내', await msg());
chk(!row(0, '에이채널').contractSent, '실패하면 발송 기록 안 남음');

console.log('\n[발송]');
await startBridge();
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
await waitFor(`/서명 요청을 보냈습니다/.test((document.querySelector('.s2p .ms-msg')||{}).innerText||'')`, '발송 안내');
const c0 = bridgeCalls[0] || {};
chk(c0.name === '김하늘' && c0.method === 'KAKAO' && c0.to === '010-9999-8888' && c0.by === '테스터', '브리지: 실명·카카오톡·번호·보낸 사람', { n: c0.name, m: c0.method, to: c0.to, by: c0.by });
chk(c0.needRrn === true, '주민번호 비우면 모델이 서명할 때 입력');
chk(/광고모델계약서_김하늘/.test(c0.title || ''), '제목 = 계약서 파일명', c0.title);
let xml = '';
try { xml = unzip(Buffer.from(String(c0.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { chk(false, '보낸 파일 풀기: ' + e.message); }
chk(xml.includes('김하늘') && xml.includes('80,000') && xml.includes('010-9999-8888') && xml.includes('서울특별시 강남구 테헤란로 1'), '보낸 파일 = 등록 양식에 실명·모델료·연락처·주소');
await wait(1800);
const r0 = row(0, '에이채널');
chk(!!r0.contractSent && r0.rate === '80,000' && r0.address === '서울특별시 강남구 테헤란로 1', '발송 기록·단가·주소 저장', { s: r0.contractSent, rate: r0.rate, a: r0.address });
chk(r0.contractDone === '미완료', '계약 완료는 그대로(서명 후 직접)');
chk(!JSON.stringify(savedData).includes('900101'), '주민번호는 어디에도 저장 안 됨');

console.log('\n[주민번호 채워 보내기]');
await fill('주민등록번호', '900101-1234567');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
for (let i = 0; i < 40 && bridgeCalls.length < 2; i++) await wait(250);
const c1 = bridgeCalls[1] || {};
chk(c1.needRrn === false, '주민번호 넣으면 모델 입력칸 없음');
let x1 = ''; try { x1 = unzip(Buffer.from(String(c1.data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch {}
chk(x1.includes('900101-1234567'), '주민번호는 계약서에만 들어감');
await wait(1800);
chk(!JSON.stringify(savedData).includes('900101'), '저장 데이터엔 여전히 없음');

console.log('\n[⬇ 값 넣어 내려받기]');
const DL = path.join(TMP, 'dl'); fs.mkdirSync(DL, { recursive: true });
await S('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => {});
await click('.s2p button', '값 넣어 내려받기');
let dl = null; for (let i = 0; i < 40 && !dl; i++) { dl = fs.readdirSync(DL).find(n => n.endsWith('.docx')); await wait(250); }
let xd = ''; try { xd = unzip(fs.readFileSync(path.join(DL, dl)))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch {}
chk(!!dl && xd.includes('김하늘') && xd.includes('80,000'), '입력값 넣은 계약서를 내려받아 확인·수정 가능', dl);

console.log('\n[📎 다른 파일로 → 이 건만]');
const alt = await evalJs(`(async()=>{const b=await window.buildContractDocx('granny','','','',{});return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(new Blob([b.bytes],{type:b.type}));});})()`);
const ALT = path.join(TMP, '수정한_계약서.docx'); fs.writeFileSync(ALT, Buffer.from(alt.split(',')[1], 'base64'));
const { root: { nodeId: rootId } } = await S('DOM.getDocument', { depth: -1 });
const { nodeId: fileId } = await S('DOM.querySelector', { nodeId: rootId, selector: '.s2p .ct-file input[type=file]' });
await S('DOM.setFileInputFiles', { nodeId: fileId, files: [ALT] });
await waitFor(`document.querySelector('.s2p .ct-file').innerText.includes('수정한_계약서.docx')`, '첨부 반영');
chk((await evalJs(`document.querySelector('.s2p .ct-file').innerText`)).includes('이 건만 바꾼 파일'), '파일 이름·이 건만 표시');
await wait(1800);
chk(row(0, '에이채널').contractFile?.name === '수정한_계약서.docx' && savedData.brands[0].contractTemplate?.name === '드래프터_광고계약서.docx', '이 사람 행에만 저장(브랜드 기본 양식은 그대로)');
const nb0 = bridgeCalls.length;
await fill('주민등록번호', '');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
for (let i = 0; i < 40 && bridgeCalls.length === nb0; i++) await wait(250);
let x2 = ''; try { x2 = unzip(Buffer.from(String(bridgeCalls[nb0].data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch {}
chk(x2.includes('썸웨어코드') && x2.includes('김하늘'), '바꾼 파일로 보냄(값도 채움)');
await click('.s2p button', '기본으로'); await wait(1800);
chk(!row(0, '에이채널').contractFile && (await evalJs(`document.querySelector('.s2p .ct-file').innerText`)).includes('드래프터_광고계약서.docx'), '↺ 기본으로 → 등록 양식');

console.log('\n[등록 양식 없는 브랜드 → 앱 내장 양식]');
const nb = bridgeCalls.length;
await click('.brand-tab, button', '그래니'); await wait(800);
await openCh('그래니채널');
chk((await evalJs(`document.querySelector('.s2p .ct-file').innerText`)).includes('기본 (앱 내장 양식)'), '앱 내장 양식 표시');
await click('.s2p button', '모두싸인으로 계약서 보내기'); await wait(200);
await click('.s2p button', '확인 — 보내기');
for (let i = 0; i < 40 && bridgeCalls.length === nb; i++) await wait(250);
let x3 = ''; try { x3 = unzip(Buffer.from(String(bridgeCalls[nb].data).split(',')[1], 'base64'))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch {}
chk(x3.includes('썸웨어코드') && x3.includes('박바다') && x3.includes('50,000'), '앱 내장 양식으로 값 채워 보냄');

console.log('\n[매니저] 예전 화면');
role = 'staff';
await load();
await openCh('에이채널');
p = await panel();
chk(!p.includes('모두싸인') && p.includes('계약 완료일') && p.includes('계약 완료'), '매니저는 모두싸인 버튼 없이 계약 완료만');

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
server.close(); bridge?.close();
process.exit(fail ? 1 : 0);
