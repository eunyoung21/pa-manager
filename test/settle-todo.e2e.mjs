/* 대시보드 정산 대기 E2E — node test/settle-todo.e2e.mjs
   광고코드까지 끝난 사람이 관리자 할 일 「💰 정산 대기」에 뜨고, ✓ 입금 → 정산 완료 기록(알바는 버튼 없음) (2026-10-15) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-settle-todo-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8982, FPORT = 8983;

// PA(목 백엔드)
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_finder_url','http://127.0.0.1:${FPORT}');
       localStorage.setItem('pa_mgr_auth', JSON.stringify(window.__AUTH__||(location.search.includes('staff')?{token:'T',username:'안민영',role:'staff',brand:'all',tabs:'claudeS2,step2,dashboard'}:{token:'T',username:'테스터',role:'manager',brand:'all'})));</script>`);
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9381', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9381/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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

const TD = (d => `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)(new Date());
const fin = { date: TD, dmDate: TD, pa: '안민영', contactStatus: '진행중', replied: 'Y', approved: 'Y', dealDone: 'Y', dealDate: TD, shippingDone: '✅ 완료', contractDone: '✅ 완료', finalDone: 'Y', finalDate: TD };
savedData = { paList: ['안민영', '기타'], brands: [
  { ...EMPTY, id: 'basetune', name: '베이스튠',
    claudeStep2Rows: [S2('c1', '정산할사람', 'pay_me', { ...fin, rate: '50,000' }), S2('c2', '진행중사람', 'not_yet', { ...fin, finalDone: 'N', finalDate: '' })],
    shippingRows: [{ id: 'sh1', date: TD, channelName: '진행중사람', recipient: '박진행', phone: '010', address: '서울', status: '처리중' }],
    reviewRows: [{ id: 'r1', date: TD, channelName: '정산할사람', realName: '김정산', pa: '안민영', paCode: 'CODE1', postLink: '', live: 'Y', contractDone: 'Y', checks: {} }] },
], settlements: {} };
const B = () => savedData.brands[0];
const todo = async () => (await evalJs(`[...document.querySelectorAll('.todo-box')].find(b=>b.innerText.includes('관리자 할 일')).innerText`)).replace(/\s+/g, ' ');

console.log('\n[관리자] 관리자 할 일에 정산 대기');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩');
await evalJs(`window.confirm=()=>true;1`);
await click('.step-tab', '대시보드'); await wait(900);
let t = await todo();
chk(t.includes('정산 대기 1') && t.includes('정산할사람') && t.includes('정산 · 50,000'), '정산할사람 · 단가 50,000 표시', t);
chk(!t.includes('진행중사람 안민영 정산'), '광고코드 전 사람은 정산 대기 아님', t);
chk(await evalJs(`(()=>{const s=[...document.querySelectorAll('.todo-box')].find(b=>b.innerText.includes('출고 정보'));const t=[...document.querySelectorAll('.role-header')].find(b=>b.innerText.includes('소통 중'));return !!s&&!!(s.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING)})()`), '출고 정보가 담당자별 소통 중 위에 (2026-10-16)');
await evalJs(`(()=>{const it=[...document.querySelectorAll('.todo-item')].find(x=>x.innerText.includes('정산할사람'));[...it.querySelectorAll('button')].find(b=>b.textContent.includes('입금')).click();return 1})()`); await wait(1500);
const c1 = B().claudeStep2Rows.find((r) => r.id === 'c1');
chk(c1.infSettled === 'Y' || c1.stage === 'done', '✓ 입금 → 정산 완료 기록', { s: c1.stage, i: c1.infSettled });
t = await todo();
chk(!t.includes('정산할사람'), '처리하면 목록에서 사라짐', t);

console.log('\n[더 보기 → 팝업 전체]');
for (let k = 0; k < 7; k++) savedData.brands[0].claudeStep2Rows.push(S2('m' + k, '대기' + k, 'wait_' + k, { ...fin, rate: '30,000' }));
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩 2');
await evalJs(`window.confirm=()=>true;1`);
await click('.step-tab', '대시보드'); await wait(900);
await evalJs(`(()=>{const g=[...document.querySelectorAll('.todo-group')].find(x=>x.innerText.includes('정산 대기'));[...g.querySelectorAll('.todo-item')].find(x=>x.innerText.includes('더 보기')).click();return 1})()`); await wait(500);
const popN = () => evalJs(`(()=>{const m=document.querySelector('.overlay .modal');return m?m.querySelectorAll('.todo-item').length:-1})()`);
chk(await popN() === 7, '팝업에 7명 전부', await popN());
await evalJs(`(()=>{const it=document.querySelector('.overlay .modal .todo-item');[...it.querySelectorAll('button')].find(b=>b.textContent.includes('입금')).click();return 1})()`); await wait(1500);
chk(await popN() === 6, '팝업 안에서 ✓ 입금 → 바로 빠짐(6명)', await popN());
await click('.overlay .modal button', '닫기'); await wait(300);
chk(await popN() === -1, '닫기');

console.log('\n[알바] 버튼 없음');
savedData.brands[0].claudeStep2Rows.find((r) => r.id === 'c1').infSettled = '';
savedData.brands[0].claudeStep2Rows.find((r) => r.id === 'c1').stage = 'adset';
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/?staff` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩(알바)');
const tabs = await evalJs(`[...document.querySelectorAll('.step-tab')].map(b=>b.textContent)`);
if (tabs.some((x) => x.includes('대시보드'))) {
  await click('.step-tab', '대시보드'); await wait(900);
  const hasBtn = await evalJs(`[...document.querySelectorAll('.todo-item')].some(x=>x.innerText.includes('정산할사람')&&[...x.querySelectorAll('button')].some(b=>b.textContent.includes('입금')))`);
  chk(!hasBtn, '알바 화면엔 ✓ 입금 버튼 없음');
} else chk(true, '알바는 대시보드 탭 없음');

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
