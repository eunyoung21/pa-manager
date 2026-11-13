/* 시딩 방식(유가/무가) 사람별 선택 E2E — node test/seeding.e2e.mjs
   상세 창 '협찬 제품' 옆 옵션(차렵이불 색상·사이즈 / 압력이불 무게) 저장, 제품 바꾸면 옵션 비움, 출고 상품명·복사에 옵션(2026-10-13) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-seeding-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', memoReqMig: 'test', pendRejMig2: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8974, FPORT = 8975;

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
const srch = (v) => evalJs(`(()=>{const el=document.querySelector('.srch');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const openCh = async (n) => { await srch(n); await wait(500); return evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`); };
const closeP = async () => { await evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`); await wait(300); };
const base = { pa: '박민선', dmSent: 'Y', replied: 'Y', dealDone: 'Y', contactStatus: '진행중', shippingDone: '✅ 완료', product: '휘핑크림 차렵이불' };
savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['휘핑크림 차렵이불'], productNoContract: { '휘핑크림 차렵이불': true },
    step2Rows: [S2('m1', '무가기본', 'free_default', { ...base }), S2('m2', '유가로바꿈', 'paid_over', { ...base }), S2('m3', '옛제품만', 'legacy_po', { ...base, productOnly: 'Y' })] },
], settlements: {} };
const B2 = () => savedData.brands.find((b) => b.id === 'hatke');
const steps = () => evalJs(`[...document.querySelectorAll('.s2p-tl-label')].map(x=>x.textContent.trim())`);
const sel = () => evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('시딩 방식'));return f.querySelector('select').value})()`);
const pickSeed = (v) => evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('시딩 방식'));const s=f.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${J(v)});s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 로딩');
await click('.brand-tab', '해트케'); await wait(700);
await click('.step-tab', '인플루언서 관리'); await wait(700);
await openCh('무가기본'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
let st = await steps();
chk(!st.some((x) => x.includes('계약서')) && await sel() === '', '무가 제품 기본: 계약서 단계 없음 · 드롭다운 = 제품 기본값', st);
await closeP();
await openCh('옛제품만'); await waitFor(`document.querySelector('.s2p')`, '상세 창 2');
chk(await sel() === '무가', '옛 「제품만 협찬」은 무가로 표시');
await closeP();
await openCh('유가로바꿈'); await waitFor(`document.querySelector('.s2p')`, '상세 창 3');
await pickSeed('유가'); await wait(1800);
const m2 = B2().step2Rows.find((r) => r.id === 'm2');
chk(m2.seeding === '유가' && m2.stage === 'contract' && m2.contractBack === 'Y', '유가로 바꾸면 저장 + 계약서 단계로 되돌림', { s: m2.seeding, st: m2.stage, b: m2.contractBack });
st = await steps();
chk(st.some((x) => x.includes('계약서')), '진행 단계에 계약서 단계가 생김', st);
await pickSeed('무가'); await wait(1800);
chk(B2().step2Rows.find((r) => r.id === 'm2').seeding === '무가', '다시 무가로 바꿈');
st = await steps();
chk(!st.some((x) => x.includes('계약서')), '무가로 바꾸면 계약서 단계가 다시 빠짐', st);
await pickSeed('유가'); await wait(1500);
await closeP();
// 정산·영상검수 반영
B2().step2Rows.find((r) => r.id === 'm2').finalDone = 'Y'; B2().step2Rows.find((r) => r.id === 'm2').contractDone = '✅ 완료'; B2().step2Rows.find((r) => r.id === 'm2').rate = '100,000';
B2().step2Rows.find((r) => r.id === 'm1').finalDone = 'Y'; rev++;
B2().reviewRows = [{ id: 'v1', date: '26.11.12', channelName: '무가기본', realName: '', pa: '박민선', paCode: '', status: '검수중' }, { id: 'v2', date: '26.11.12', channelName: '유가로바꿈', realName: '', pa: '박민선', paCode: '', status: '검수중' }];
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 재로딩');
await click('.brand-tab', '해트케'); await wait(800);
const settleTxt = await evalJs(`(()=>{const b=[...document.querySelectorAll('.todo-box')].find(x=>x.innerText.includes('정산 정보'));return b?b.innerText:''})()`);
chk(settleTxt.includes('유가로바꿈') && !settleTxt.includes('무가기본'), '정산 정보: 유가로 바꾼 사람만(무가 제품 기본인 사람은 제외)', settleTxt.slice(0, 200));
await click('.step-tab', '영상검수'); await wait(900);
const cell = (n, lab) => evalJs(`(()=>{const tr=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${J(n)}));if(!tr) return null;const td=tr.querySelector('td[data-label=${J(lab)}]');return td?td.innerText.trim():null})()`);
const c1 = await cell('무가기본', '계약서'), c2 = await cell('유가로바꿈', '계약서');
chk(c1 === '' && c2 && c2.length > 0, '영상검수: 무가는 계약서 칸 비움, 유가로 바꾼 사람은 계약서 칸 있음', { c1, c2 });
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
