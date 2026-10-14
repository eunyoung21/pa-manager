/* 🤖 자동화 탭 단계 E2E — node test/automation-deal.e2e.mjs
   리스트업 → 승인 → 🤝 협업성사 → 완료 (서로 배타, 2026-10-12): 성사되면 '승인'에서 빠지고 '협업성사'에만 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-automation-deal-e2e');

// 날짜는 오늘 — 9/1 같은 고정 날짜는 DM 후 7일 무응답 자동 거절(2026-10-14)에 걸려 버린다
const TD = (d => `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)(new Date());
const S1 = (id, name, u, x = {}) => ({ id, date: TD, name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: TD, name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8950, FPORT = 8951;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9350', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9350/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
  { ...EMPTY, id: 'hatke', name: '해트케', claudeStep2Rows: [
    S2('a1', '리스트업만', 'u1', { approved: 'N', dmSent: 'Y' }),
    S2('a2', '승인됨', 'u2', { approved: 'Y' }),
    S2('a3', '승인후성사', 'u3', { approved: 'Y', dealDone: 'Y' }),
    S2('a4', '성사만', 'u4', { approved: 'N', dealDone: 'Y' }),
    S2('a5', '완료됨', 'u5', { approved: 'Y', dealDone: 'Y', finalDone: 'Y' }),
    S2('a6', '거절', 'u6', { contactStatus: '거절' }),
  ] },
], settlements: {} };

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩');
await click('.step-tab', '자동화'); await wait(800);
const chips = await evalJs(`[...document.querySelectorAll('.fchip')].map(b=>b.textContent.trim())`);
console.log('\n[칩]', chips.join(' | '));
const order = chips.map((c) => c.replace(/\s*\(\d+\)$/, ''));
chk(order.indexOf('✅ 승인') >= 0 && order.indexOf('🤝 협업성사') === order.indexOf('✅ 승인') + 1 && order.indexOf('🏁 완료') === order.indexOf('🤝 협업성사') + 1, '승인 → 협업성사 → 완료 순서', order);
const names = async (chip) => { await click('.fchip', chip); await wait(500); return evalJs(`[...document.querySelectorAll('tbody tr')].map(t=>t.innerText).join('|')`); };
const has = (txt, ...ns) => ns.every((n) => txt.includes(n));
const not = (txt, ...ns) => ns.every((n) => !txt.includes(n));
let x = await names('리스트업'); chk(has(x, '리스트업만') && not(x, '승인됨', '승인후성사', '성사만', '완료됨'), '리스트업: 승인·성사 전만');
x = await names('승인'); chk(has(x, '승인됨') && not(x, '승인후성사', '성사만', '완료됨', '리스트업만'), '승인: 승인했고 성사 전만(성사되면 빠짐)');
x = await names('협업성사'); chk(has(x, '승인후성사', '성사만') && not(x, '승인됨', '완료됨', '리스트업만'), '협업성사: 성사·완료 전');
x = await names('완료'); chk(has(x, '완료됨') && not(x, '승인후성사', '승인됨'), '완료');
chk(chips.some((c) => c.startsWith('🤝 협업성사 (2)')) && chips.some((c) => c.startsWith('✅ 승인 (1)')) && chips.some((c) => c.startsWith('리스트업 (1)')), '숫자: 리스트업 1 · 승인 1 · 협업성사 2', chips);

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
