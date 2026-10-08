/* 🔎 인플루언서 찾기 · 제품별 PA 진행 E2E — node test/finder-product.e2e.mjs
   해트케처럼 한 브랜드에 협찬 제품이 여러 개일 때(2026-10-08 사용자 결정 "제품이 다르면 다시 후보로"):
   - 찾기 탭이 리스트업 창에 그 브랜드의 제품 목록을 넘긴다(제품 1개 이하 브랜드는 안 넘김 = 예전 그대로)
   - 찾은 사람을 넣을 때 협찬 제품이 붙고, 같은 브랜드 '다른 제품으로 이미 끝난 사람'은 다시 들어간다
   - 진행 중(어느 제품이든)·제품 안 적힌 옛 행·다른 브랜드 사람은 그대로 막는다
   - 리스팅 → 진행 중으로 승인할 때 제품이 따라간다 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-finder-product-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData = { paList: ['박민선', '안민영', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['A', 'B'],
    step1Rows: [S1('s1_lst', '리스팅반려', 'lst_a', { product: 'A', reviewStatus: '반려' })],
    step2Rows: [
      S2('s2_end', '끝난에이', 'ended_a', { product: 'A', contactStatus: '거절' }),
      S2('s2_act', '진행에이', 'active_a', { product: 'A', contactStatus: '진행중', pa: '안민영' }),
      S2('s2_leg', '옛행', 'legacy_x', { contactStatus: '거절' }),
      S2('s2_done', '완료에이', 'done_a', { product: 'A', dealDone: 'Y', finalDone: 'Y', infSettled: 'Y' }),
    ],
    claudeStep2Rows: [
      S2('c2_sent', '자동보냄', 'auto_a_sent', { product: 'A', contactStatus: '컨택 중' }),
      S2('c2_rej', '자동무응답', 'auto_a_rej', { product: 'A', contactStatus: '거절', endReason: '무응답' }),
    ] },
  { ...EMPTY, id: 'basetune', name: '베이스튠', step2Rows: [S2('b_1', '다른브랜드', 'other_brand', { contactStatus: '거절' })] },
], settlements: {} };
let rev = 1;
const PORT = 8948, FPORT = 8949;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9349', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9349/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('인플루언서 찾기'))`, '앱 로딩');
await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},window.alert=()=>{},1)`);

console.log('\n[제품 하나뿐인 브랜드] 예전 그대로 — 제품 목록을 안 넘긴다');
await click('.brand-tab', '베이스튠'); await wait(400);
await click('.step-tab', '인플루언서 찾기');
await waitFor(`document.querySelector('iframe[title="리스트업"]')`, '찾기 iframe(베이스튠)');
let src = await iframeSrc();
chk(src.includes('brand=') && !src.includes('products='), '베이스튠: products 없음', src);

console.log('\n[해트케] 제품 A·B 를 리스트업 창에 넘긴다');
await click('.brand-tab', '해트케'); await wait(400);
await click('.step-tab', '인플루언서 찾기');
await waitFor(`(document.querySelector('iframe[title="리스트업"]')||{}).src.includes(encodeURIComponent('해트케'))`, '찾기 iframe(해트케)');
src = await iframeSrc();
chk(decodeURIComponent(src).includes('products=["A","B"]'), 'products=["A","B"]', decodeURIComponent(src));
await wait(800);

console.log('\n[제품 B 로 자동화에 추가] 다른 제품으로 끝난 사람은 다시, 진행 중·옛 행·다른 브랜드는 막힘');
const before = H().claudeStep2Rows.length;
await go('auto', ['ended_a', 'active_a', 'legacy_x', 'done_a', 'auto_a_sent', 'auto_a_rej', 'lst_a', 'other_brand', 'fresh_new'].map(R), 'B');
await wait(1800);
const added = H().claudeStep2Rows.slice(before);
const au = added.map((r) => r.username).sort();
chk(J(au) === J(['auto_a_rej', 'done_a', 'ended_a', 'fresh_new', 'lst_a']), '들어간 사람: 거절·완료·무응답·반려(A) + 새 사람', au);
chk(added.every((r) => r.product === 'B'), '전부 협찬 제품 B 가 붙음', added.map((r) => r.product));
chk(!au.includes('active_a') && !au.includes('auto_a_sent'), '제품 A 로 진행 중인 사람(매니저 진행·자동 DM 대기)은 막힘');
chk(!au.includes('legacy_x'), '제품이 안 적힌 옛 행(어느 제품인지 모름)은 막힘');
chk(!au.includes('other_brand'), '다른 브랜드에 있는 사람은 막힘(예전 그대로)');

console.log('\n[같은 제품 B 로 또 추가] 이번엔 전부 이미 있는 사람');
const before2 = H().claudeStep2Rows.length;
await go('auto', ['ended_a', 'fresh_new'].map(R), 'B'); await wait(1500);
chk(H().claudeStep2Rows.length === before2, '같은 제품으로는 다시 안 들어감', H().claudeStep2Rows.length - before2);

console.log('\n[제품 A 리스팅에 추가 → 승인] 진행 중으로 넘어갈 때 제품이 따라감');
await go('listing', [R('fresh_a')], 'A'); await wait(1500);
const s1 = H().step1Rows.find((r) => r.username === 'fresh_a');
chk(s1 && s1.product === 'A' && s1.reviewStatus === '검수대기', '리스팅 행에 제품 A', s1);
await click('.step-tab', '인플루언서 관리'); await wait(500);
await click('.fchip', '리스팅 목록'); await wait(500);
await click('.fchip', '검수대기'); await wait(400);
await evalJs(`(()=>{const tr=[...document.querySelectorAll('tbody tr')].find(t=>t.innerText.includes('fresh_a'));const c=[...tr.querySelectorAll('.cell-val')].find(x=>x.textContent.includes('검수대기'));c.click();return 1})()`);
await wait(200);
await evalJs(`(()=>{const s=document.querySelector('select.cell-sel');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'승인');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await wait(1800);
const s2 = H().step2Rows.find((r) => r.name === 'fresh_a');
chk(s2 && s2.product === 'A', '진행 중(step2) 행에 제품 A 유지', s2 && { product: s2.product, name: s2.name });

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
