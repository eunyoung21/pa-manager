/* 기존 메모 → 검토 요청 1회 변환 E2E — node test/memo-migration.e2e.mjs (슬랙용 reqTs 없음)
   상세 창 '협찬 제품' 옆 옵션(차렵이불 색상·사이즈 / 압력이불 무게) 저장, 제품 바꾸면 옵션 비움, 출고 상품명·복사에 옵션(2026-10-13) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-memo-mig-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8970, FPORT = 8971;

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
const Z = (id, name, u, x) => S2(id, name, u, { dmSent: 'Y', replied: 'Y', pa: '박민선', ...x });
savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'],
    step2Rows: [Z('a1', '메모있음', 'memo_one', { memo: '릴스 고로 30만원', contactStatus: '진행중' }), Z('a2', '메모없음', 'nomemo_one', { memo: '', contactStatus: '진행중' }),
      Z('a3', '거절됨', 'rej_one', { memo: '거절 사유', contactStatus: '거절' }), Z('a4', '정산끝', 'paid_one', { memo: '정산 메모', contactStatus: '진행중', infSettled: 'Y' })],
    claudeStep2Rows: [Z('c1', '자동메모', 'auto_one', { memo: '자동화 메모', contactStatus: '진행중' })] },
  { ...EMPTY, id: 'basetune', name: '베이스튠',
    step1Rows: [S1('p1', '민선대기', 'ms_wait', { pa: '박민선', reviewStatus: '검수대기' }), S1('p2', '안민영대기', 'am_wait', { pa: '안민영', reviewStatus: '검수대기' }),
      S1('p3', '민선승인', 'ms_ok', { pa: '박민선', reviewStatus: '승인' }), S1('p4', '민선진행', 'ms_go', { pa: '박민선', reviewStatus: '검수대기' })],
    step2Rows: [S2('q4', '민선진행', 'ms_go', { step1Id: 'p4', pa: '박민선', contactStatus: '진행중' }), Z('b1', '베이스메모', 'bt_one', { memo: '검수 필요', contactStatus: '진행중', reviewReq: { status: '진행', note: '이미 있음', reqTs: 5 } })] },
], settlements: {} };
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 로딩');
await wait(2500);
const H2 = savedData.brands.find((b) => b.id === 'hatke'), B2 = savedData.brands.find((b) => b.id === 'basetune');
const all = [...H2.step2Rows, ...H2.claudeStep2Rows];
const g = (id) => all.find((r) => r.id === id);
chk(g('a1').reviewReq && g('a1').reviewReq.status === '요청' && g('a1').reviewReq.note === '릴스 고로 30만원', '메모 있는 건 → 검토 요청으로 변환', g('a1').reviewReq);
chk(!g('a1').reviewReq.reqTs, '🔴 reqTs 없음 = 슬랙 알림 대상 아님', g('a1').reviewReq);
chk(!g('a2').reviewReq && !g('a3').reviewReq && !g('a4').reviewReq, '메모 없음·거절·정산완료는 변환 안 함');
chk(g('c1').reviewReq && g('c1').reviewReq.status === '요청', '자동화 행 메모도 변환', g('c1').reviewReq);
chk(B2.step2Rows.find((r) => r.id === 'b1').reviewReq.status === '진행' && B2.step2Rows.find((r) => r.id === 'b1').reviewReq.reqTs === 5, '이미 검토 요청이 있는 건은 그대로');
const s1r = (id) => B2.step1Rows.find((r) => r.id === id);
chk(s1r('p1').reviewStatus === '반려', '박민선 베이스튠 검수 대기 → 반려(거절)', s1r('p1'));
chk(s1r('p2').reviewStatus === '검수대기' && s1r('p3').reviewStatus === '승인' && s1r('p4').reviewStatus === '검수대기', '다른 담당자·승인·이미 컨택 진행 중인 건은 그대로');
chk(!!B2.pendRejMig, '베이스튠 1회 표시(pendRejMig)');
chk(H2.memoReqMig && B2.memoReqMig, '브랜드마다 1회 표시(memoReqMig)');
await click('.brand-tab', '해트케'); await wait(800);
const txt = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(txt.includes('검토 요청') && txt.includes('릴스 고로 30만원'), '대시보드 관리자 할 일에 변환된 메모가 보임', txt.slice(0, 300));
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
