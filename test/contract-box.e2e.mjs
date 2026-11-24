/* 대시보드 「계약서 정보」 상자 E2E — node test/contract-box.e2e.mjs
   제품 발송까지 끝나 계약서를 보내야 하는 사람만 따로 모아 보여주고(정산 정보처럼), 관리자 할 일에서는 빠진다. 2026-11-24 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-contract-box-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8996, FPORT = 8997;

// PA(목 백엔드)
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_finder_url','http://127.0.0.1:${FPORT}');
       localStorage.setItem('pa_mgr_auth', JSON.stringify(${req.url.includes('role=staff')?'{token:"T",username:"minyoung",role:"staff",brand:"all",pa:["안민영"]}':'{token:"T",username:"테스터",role:"manager",brand:"all"}'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', (c) => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'users' || b.action === 'logs') return send({ ok: true, users: [], logs: [] });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    if (b.action === 'shipSheetAppend') { global.__calls = global.__calls || []; global.__calls.push(b); if (global.__sheetMode === 'fail') return send({ ok: false, error: '이번 달 탭이 없어요' }); return send({ ok: true, row: 6 + global.__calls.length, sheet: '출고요청(11월)', ...(global.__serverDate ? { date: global.__serverDate } : {}) }); }
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9374', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9374/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
// 낮 12시(한국 시간) 이후면 출고일자·출고요청일이 다음 날(2026-11-24) — 돌리는 시각에 맞춰 기대값을 계산
const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); if (kst.getHours() >= 12) kst.setDate(kst.getDate() + 1);
const EXPECT = String(kst.getFullYear()).slice(2) + '.' + String(kst.getMonth() + 1).padStart(2, '0') + '.' + String(kst.getDate()).padStart(2, '0');
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const H = () => savedData.brands.find((b) => b.id === 'hatke');
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);

const J2 = JSON.stringify;
const P = (id, name, x) => S2(id, name, name, { dmSent: 'Y', replied: 'Y', approved: 'Y', dealDone: 'Y', pa: '안민영', contactStatus: '진행중', product: '해트케 압력이불', ...x });
savedData = { paList: ['안민영'], brands: [{ ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'],
  step2Rows: [
    P('a', 'need_contract', { shippingDone: '✅ 완료', contractDone: '미완료' }),
    P('b', 'need_ship', { shippingDone: '미완료', contractDone: '미완료' }),
    P('c', 'contract_done', { shippingDone: '✅ 완료', contractDone: '✅ 완료' }) ] }], settlements: {} };
const boxText = (title) => evalJs(`(()=>{const b=[...document.querySelectorAll('.todo-box')].find(x=>x.querySelector('h3')&&x.querySelector('h3').textContent.includes(${J2(title)}));return b?b.innerText:''})()`);
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", '앱 로딩');
await click('.brand-tab', '해트케'); await wait(2000);
let cb = await boxText('계약서 정보');
chk(cb.includes('need_contract') && !cb.includes('need_ship') && !cb.includes('contract_done'), '계약서 정보 상자에는 계약서 보낼 사람만', cb);
chk(cb.includes('(1)'), '상자 제목에 건수(1)', cb.slice(0, 60));
const boss = await boxText('관리자 할 일');
chk(!boss.includes('need_contract') && boss.includes('need_ship'), '관리자 할 일에는 계약서 건이 빠지고 제품발송 건은 그대로', boss);
// → 눌러 계약 완료 → 상자에서 사라짐
await evalJs("window.confirm=()=>true");
await evalJs("(()=>{const b=[...document.querySelectorAll('.todo-box')].find(x=>x.querySelector('h3')&&x.querySelector('h3').textContent.includes('계약서 정보'));b.querySelector('.todo-item button').click();return 1})()"); await wait(2500);
cb = await boxText('계약서 정보');
chk(cb === '', '계약 완료(→) 누르면 상자에서 사라짐', cb);
chk(savedData.brands[0].step2Rows.find((r) => r.id === 'a').contractDone === '✅ 완료', '그 사람은 계약 완료로 저장됨', savedData.brands[0].step2Rows.find((r) => r.id === 'a').contractDone);
console.log(fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과');
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
