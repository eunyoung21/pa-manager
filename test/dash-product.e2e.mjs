/* 대시보드 제품 탭 + 스트라이프 베개커버 옵션 E2E — node test/dash-product.e2e.mjs
   상세 창 '협찬 제품' 옆 옵션(차렵이불 색상·사이즈 / 압력이불 무게) 저장, 제품 바꾸면 옵션 비움, 출고 상품명·복사에 옵션(2026-10-13) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-dash-prod-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8962, FPORT = 8963;

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
const openCh = (n) => evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`);
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불', '스트라이프 차렵이불'],
    productOptions: { '스트라이프 차렵이불': [{ k: '색상', v: ['아이보리'] }], '해트케 압력이불': [] },
    step2Rows: [
      S2('s1', '압력이', 'press_one', { product: '해트케 압력이불', contactStatus: '진행중', pa: '박민선', dmSent: 'Y', replied: 'Y' }),
      S2('s2', '스트라', 'stripe_one', { product: '스트라이프 차렵이불', contactStatus: '진행중', pa: '박민선', dmSent: 'Y', replied: 'Y' }),
      S2('s3', '스트라2', 'stripe_two', { product: '스트라이프 차렵이불', contactStatus: '진행중', pa: '박민선', dmSent: 'Y', replied: 'Y' }),
    ] },
  { ...EMPTY, id: 'basetune', name: '베이스튠', step2Rows: [S2('b1', '이어폰러', 'ear_one', { contactStatus: '진행중' })] },
], settlements: {} };
const tabs = () => evalJs(`[...document.querySelectorAll('.hk-page .prod-tab')].map(b=>b.textContent)`);
const talkNames = () => evalJs(`[...document.querySelectorAll('.hk-page .talk-grid .todo-name, .hk-page .talk-grid .ch-link, .hk-page .talk-grid [class*=name]')].map(x=>x.textContent)`);
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 로딩');
await click('.brand-tab', '해트케'); await wait(800);
let t = await tabs();
chk(t.length === 3 && t[0].includes('전체 (3)') && t[1].includes('해트케 압력이불 (1)') && t[2].includes('스트라이프 차렵이불 (2)'), '해트케 대시보드에 제품 탭: 전체 3 · 압력이불 1 · 스트라이프 2', t);
const txtAll = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(txtAll.split(String.fromCharCode(10)).includes('압력이') && txtAll.split(String.fromCharCode(10)).includes('스트라'), '전체: 두 제품 사람 모두 보임');
await click('.hk-page .prod-tab', '스트라이프'); await wait(500);
const txtS = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(txtS.includes('스트라') && !txtS.split(String.fromCharCode(10)).includes('압력이'), '스트라이프 탭: 스트라이프 사람만', txtS.slice(0, 300));
await click('.brand-tab', '베이스튠'); await wait(600);
chk((await tabs()).length === 0, '제품 하나인 브랜드(베이스튠)는 제품 탭 없음', await tabs());
await click('.brand-tab', '해트케'); await wait(500);
await click('.step-tab', '인플루언서 관리'); await wait(700);
await openCh('스트라'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
const opts = await evalJs(`[...[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('협찬 제품')).querySelectorAll('select')].map(s=>[...s.options].map(o=>o.textContent).join('|'))`);
chk(opts.some((o) => o.includes('블루 스트라이프') && o.includes('브라운 스트라이프')) && opts.some((o) => o.includes('아이보리')), '스트라이프 차렵이불: 기존 색상 유지 + 스트라이프 베개커버(블루/브라운) 선택칸', opts);
chk(opts.some((o) => o.startsWith('스트라이프 베개커버')), '선택칸 이름이 스트라이프 베개커버', opts);
await click('.s2p button', '제품 추가'); await wait(500);
const setSel = (idx, v) => evalJs('(()=>{const f=[...document.querySelectorAll(".s2p .s2p-fg")].find(x=>x.querySelector("label").textContent.startsWith("협찬 제품"));const s=f.querySelectorAll("select")[' + idx + '];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,' + J(v) + ');s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');
const cnt = await evalJs('[...document.querySelectorAll(".s2p .s2p-fg")].find(x=>x.querySelector("label").textContent.startsWith("협찬 제품")).querySelectorAll("select").length');
await setSel(cnt - 2, '해트케 압력이불'); await wait(1800);
const row = savedData.brands.find((b) => b.id === 'hatke').step2Rows.find((r) => r.id === 's2');
chk(Array.isArray(row.extras) && row.extras.length === 1 && row.extras[0].product === '해트케 압력이불', '＋ 제품 추가: 추가 줄 저장', [cnt, row.extras]);
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
