/* 협찬 제품 옵션 E2E — node test/product-option.e2e.mjs
   상세 창 '협찬 제품' 옆 옵션(차렵이불 색상·사이즈 / 압력이불 무게) 저장, 제품 바꾸면 옵션 비움, 출고 상품명·복사에 옵션(2026-10-13) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-product-option-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8952, FPORT = 8953;

// PA(목 백엔드)
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_finder_url','http://127.0.0.1:${FPORT}');
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', (c) => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'users' || b.action === 'logs') return send({ ok: true, users: [], logs: [] });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    if (b.action === 'save') { savedData = b.data; rev++; return send({ ok: true, rev }); }
    return send({ ok: true });
  });
});
// 가짜 리스트업 창 — PA가 넘겨준 주소를 기억하고, 'go' 를 받으면 리스트업 창처럼 pa-add 를 보낸다
const finder = http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*' };
  if (req.url.startsWith('/api/ping')) { res.writeHead(200, { ...h, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ app: 'listup-window' })); return; }
  res.writeHead(200, { ...h, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><script>
    window.__got=[];
    addEventListener('message',e=>{ if(e.data&&e.data.type==='go') parent.postMessage({type:'pa-add',to:e.data.to,rows:e.data.rows,product:e.data.product},'*');
      if(e.data&&e.data.type==='pa-added') window.__got.push(e.data); });
    parent.postMessage({type:'finder-ready'},'*');
  </script>`);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
await new Promise((r) => finder.listen(FPORT, '127.0.0.1', r));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof'); fs.rmSync(UD, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9351', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9351/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
  throw new Error('크롬 기동 실패');
}
const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let msgId = 0; const waiters = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++msgId; waiters.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const evalJs = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 오류: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr, label, ms = 25000) {
  const t0 = Date.now();
  for (;;) { if (await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return;
    if (Date.now() - t0 > ms) throw new Error('시간초과: ' + label);
    await new Promise((r) => setTimeout(r, 250)); }
}
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const H = () => savedData.brands.find((b) => b.id === 'hatke');
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
const iframeSrc = () => evalJs(`(document.querySelector('iframe[title="리스트업"]')||{}).src||''`);
const go = (to, rows, product) => evalJs(`(()=>{document.querySelector('iframe[title="리스트업"]').contentWindow.postMessage({type:'go',to:${J(to)},rows:${J(rows)},product:${J(product)}},'*');return 1})()`);
const R = (u) => ({ name: u, username: u, link: `https://www.instagram.com/${u}/`, followers: '5,000', memo: '' });


savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불', '휘핑크림 차렵이불'],
    claudeStep2Rows: [S2('c1', '사랑', 'sarang_haus', { product: '휘핑크림 차렵이불', dealDone: 'Y' })],
    step2Rows: [S2('s1', '압력이', 'press_one', { product: '해트케 압력이불', contactStatus: '진행중' })],
    shippingRows: [
      { id: 'sh1', date: '26.10.13', channelName: '사랑', recipient: '김사랑', phone: '010', address: '서울', status: '처리중' },
      { id: 'sh2', date: '26.10.13', channelName: '압력이', recipient: '박압력', phone: '010', address: '부산', status: '처리중', product: '해트케 압력이불' },
    ] },
  { ...EMPTY, id: 'basetune', name: '베이스튠', step2Rows: [S2('b1', '이어폰러', 'ear_one', { contactStatus: '진행중' })] },
], settlements: {} };
const openCh = (n) => evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`);
const optSelects = () => evalJs(`[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('협찬 제품')).querySelectorAll('select').length`);
const pick = (idx, v) => evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('협찬 제품'));const s=f.querySelectorAll('select')[${idx}];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${J(v)});s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩');
await click('.brand-tab', '해트케'); await wait(400);

console.log('\n[자동화 · 차렵이불] 색상·사이즈 고르기');
await click('.step-tab', '자동화'); await wait(600);
await click('.fchip', '협업성사'); await wait(400);
await openCh('사랑'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
chk(await optSelects() === 3, '제품 + 색상 + 사이즈 선택칸 3개', await optSelects());
await pick(1, '얼그레이 크림'); await wait(300); await pick(2, 'Q-K'); await wait(1500);
const c1 = H().claudeStep2Rows.find((r) => r.id === 'c1');
chk(c1.opt && c1.opt['색상'] === '얼그레이 크림' && c1.opt['사이즈'] === 'Q-K', '저장: 색상 얼그레이 크림 · 사이즈 Q-K', c1.opt);

console.log('\n[제품을 바꾸면 옵션 비움]');
await pick(0, '해트케 압력이불'); await wait(1200);
chk(await optSelects() === 2, '압력이불 → 제품 + 무게 2칸', await optSelects());
chk(JSON.stringify(H().claudeStep2Rows.find((r) => r.id === 'c1').opt) === '{}', '다른 제품 옵션이 남지 않음', H().claudeStep2Rows.find((r) => r.id === 'c1').opt);
await pick(0, '휘핑크림 차렵이불'); await wait(800); await pick(1, '블루베리 크림'); await wait(300); await pick(2, 'S-SS'); await wait(1500);
await evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`); await wait(300);

console.log('\n[진행 중 · 압력이불] 무게');
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('압력이'); await waitFor(`document.querySelector('.s2p')`, '상세 창 2');
await pick(1, '5.4kg'); await wait(1500);
chk((H().step2Rows.find((r) => r.id === 's1').opt || {})['무게'] === '5.4kg', '저장: 무게 5.4kg', H().step2Rows.find((r) => r.id === 's1').opt);
await evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`); await wait(300);

console.log('\n[출고] 상품명에 옵션');
await click('.step-tab', '출고'); await wait(800);
const cells = await evalJs(`[...document.querySelectorAll('td[data-label="상품명"]')].map(t=>t.textContent.replace(/\\s+/g,' ').trim())`);
chk(cells.some((t) => t === '휘핑크림 차렵이불 · 블루베리 크림 / S-SS'), '출고 행(제품 칸 비어 있음) → 인플루언서 관리에서 제품·옵션 찾아 표시', cells);
chk(cells.some((t) => t === '해트케 압력이불 · 5.4kg'), '압력이불 · 5.4kg', cells);

// ── 모든 브랜드: ⚙ 제품·옵션에서 직접 추가(2026-10-13) ──
const B = () => savedData.brands.find((b) => b.id === 'basetune');
const setInp = (sel, idx, v) => evalJs(`(()=>{const el=[...document.querySelectorAll(${J(sel)})][${idx}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const modalInputs = () => evalJs(`[...document.querySelectorAll('.overlay .modal input:not([type=checkbox])')].map(i=>i.value+(i.readOnly?'[고정]':''))`);

console.log('\n[베이스튠 · 제품 없던 브랜드] ⚙ 제품·옵션 → 제품·옵션 추가');
await click('.brand-tab', '베이스튠'); await wait(500);
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('이어폰러'); await waitFor(`document.querySelector('.s2p')`, '상세 창(베이스튠)');
chk(await optSelects() === 1, '처음엔 제품 선택칸만', await optSelects());
await click('.s2p button', '제품·옵션'); await waitFor(`document.querySelector('.overlay .modal')`, '제품·옵션 창');
await click('.overlay .modal button', '＋ 제품 추가'); await wait(200);
await setInp('.overlay .modal input:not([type=checkbox])', 0, '골전도 이어폰'); await wait(100);
await click('.overlay .modal button', '＋ 옵션 추가'); await wait(200);
await setInp('.overlay .modal input:not([type=checkbox])', 1, '색상'); await setInp('.overlay .modal input:not([type=checkbox])', 2, '블랙, 화이트,  블랙'); await wait(100);
await click('.overlay .modal .modal-foot button', '저장'); await wait(1500);
chk(JSON.stringify(B().products) === '["골전도 이어폰"]' && JSON.stringify(B().productOptions) === JSON.stringify({ '골전도 이어폰': [{ k: '색상', v: ['블랙', '화이트'] }] }), '저장: 제품 + 옵션(중복 값 정리)', { p: B().products, o: B().productOptions });
await pick(0, '골전도 이어폰'); await wait(800);
chk(await optSelects() === 2, '새 제품 고르면 색상 칸 생김', await optSelects());
await pick(1, '화이트'); await wait(1500);
const b1 = B().step2Rows.find((r) => r.id === 'b1');
chk(b1.product === '골전도 이어폰' && b1.opt && b1.opt['색상'] === '화이트', '행에 제품·옵션 저장', { p: b1.product, o: b1.opt });
await evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`); await wait(300);

console.log('\n[해트케] 기존 옵션 값 추가 · 쓰인 제품 이름은 고정');
await click('.brand-tab', '해트케'); await wait(500);
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('압력이'); await waitFor(`document.querySelector('.s2p')`, '상세 창(해트케)');
await click('.s2p button', '제품·옵션'); await waitFor(`document.querySelector('.overlay .modal')`, '제품·옵션 창(해트케)');
const mi = await modalInputs();
chk(mi.includes('해트케 압력이불[고정]') && mi.includes('3.2kg, 4.5kg, 5.4kg, 6.8kg, 7.7kg'), '기존 제품(고정)·기본 옵션이 그대로 보임', mi);
const wi = mi.indexOf('3.2kg, 4.5kg, 5.4kg, 6.8kg, 7.7kg');
await setInp('.overlay .modal input:not([type=checkbox])', wi, '3.2kg, 4.5kg, 5.4kg, 6.8kg, 7.7kg, 9.0kg'); await wait(100);
await click('.overlay .modal .modal-foot button', '저장'); await wait(1500);
const hw = ((H().productOptions || {})['해트케 압력이불'] || [])[0];
chk(hw && hw.k === '무게' && hw.v.includes('9.0kg') && ((H().productOptions || {})['휘핑크림 차렵이불'] || []).length === 2, '압력이불 무게에 9.0kg 추가 · 차렵이불 옵션 유지', H().productOptions);
chk((H().step2Rows.find((r) => r.id === 's1').opt || {})['무게'] === '5.4kg', '이미 고른 옵션(5.4kg)은 그대로', H().step2Rows.find((r) => r.id === 's1').opt);
const wOpts = await evalJs(`[...[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('협찬 제품')).querySelectorAll('select')[1].options].map(o=>o.value)`);
chk(wOpts.includes('9.0kg'), '상세 창 무게 선택에 9.0kg 바로 나옴', wOpts);

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
