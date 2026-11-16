/* 리포트 탭 E2E — node test/report-tab.e2e.mjs
   목 백엔드가 reportGet 으로 가짜 `_report` 데이터를 준다. 확인: 관리자에게만 탭이 보임 · 브랜드별로 나뉨 ·
   이번 주/누적 전환 · 직접ROAS·CPA 계산 · 합계는 사람당 한 번 · 광고 없는 사람은 기본 숨김 · 아직 배포 전(알 수 없는 요청)이면 안내 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-report-tab-e2e');
const PORT = 8972;

const HEADER = ['brand', 'name', 'channel', 'pa', 'category', 'posts', 'postedAt', 'postUrl', 'status', 'views', 'viewsPrev', 'likes', 'comments', 'followers', 'engRate', 'rate', 'metaOn', 'metaFirstAt',
  'wCost', 'wConv', 'wRev', 'wAtc', 'wDCount', 'wDAmount', 'cCost', 'cConv', 'cRev', 'cAtc', 'cDCount', 'cDAmount', 'cWeeks'];
const P = (o) => HEADER.map((h) => (o[h] === undefined ? '' : o[h]));
const ROWS = [
  P({ brand: '베이스튠', name: '염지윤', channel: 'yjy', pa: '유송미', status: 'ok', views: 200000, viewsPrev: 100000, postUrl: 'https://www.instagram.com/reel/x/', metaOn: 'Y',
      wCost: 1000000, wConv: 10, wRev: 1500000, wAtc: 50, wDCount: 8, wDAmount: 800000, cCost: 3000000, cConv: 20, cRev: 3600000, cAtc: 90, cDCount: 15, cDAmount: 4500000, cWeeks: 2 }),
  P({ brand: '베이스튠', name: '양형석', channel: 'yhs', pa: '유송미', status: 'ok', views: 50000, viewsPrev: 50000, metaOn: 'N',
      wCost: 500000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 0, wDAmount: 0, cCost: 500000, cConv: 0, cRev: 0, cAtc: 0, cDCount: 0, cDAmount: 0, cWeeks: 1 }),
  P({ brand: '베이스튠', name: '광고없는사람', channel: 'noad', pa: '안민영', status: 'ok', views: 1000 }),
  P({ brand: '그래니살라', name: '그래니사람', channel: 'gr', pa: '안민영', status: 'ok', views: 9000, wCost: 200000, wConv: 2, wRev: 300000, wAtc: 4, wDCount: 1, wDAmount: 100000 }),
];
const META = { updatedAt: new Date().toISOString(), snapshotDate: '2026-11-13', weeks: { '베이스튠': { start: '2026-11-09', end: '2026-11-15' } }, ledgerSince: '2026-11-09' };
let ROLE = 'manager', DEPLOYED = true;

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>', `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
      localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'${ROLE}',brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', (c) => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'reportGet') return DEPLOYED ? send({ ok: true, meta: META, header: HEADER, rows: ROWS }) : send({ ok: false, msg: '알 수 없는 요청' });
    if (b.action === 'get') return send({ ok: true, rev: 1, data: { paList: [], brands: [
      { id: 'basetune', name: '베이스튠', step1Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [], claudeStep1Rows: [], claudeStep2Rows: [] },
      { id: 'granny', name: '그래니살라', step1Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [], claudeStep1Rows: [], claudeStep2Rows: [] }], settlements: {} } });
    if (b.action === 'rev') return send({ ok: true, rev: 1 });
    if (b.action === 'save') return send({ ok: true, rev: 2 });
    return send({ ok: true, users: [], logs: [] });
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof'); fs.rmSync(UD, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9361', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9361/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
const page = () => evalJs(`document.querySelector('.rpt')?.innerText||''`);
const names = () => evalJs(`[...document.querySelectorAll('.rpt-table tbody tr')].map(tr=>tr.children[0].innerText.split('\\n')[0])`);
const cells = (n) => evalJs(`(()=>{const tr=[...document.querySelectorAll('.rpt-table tbody tr')].find(t=>t.children[0].innerText.startsWith(${J(n)}));return tr?[...tr.children].map(c=>c.innerText):null})()`);
const open = async () => { await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await waitFor(`[...document.querySelectorAll('.brand-tab')].length>0`, '앱 로딩'); };

await open();
await click('.brand-tab', '베이스튠'); await wait(500);
await click('.step-tab', '리포트'); await waitFor(`document.querySelector('.rpt-table')`, '리포트 표');
chk(J(await names()) === J(['염지윤', '양형석']), '베이스튠: 광고 있는 두 명만(그래니·광고없는 사람 제외), 비용순', await names());
const a = await cells('염지윤');
// 비용 1,000,000 · 매출 1,500,000 · 전환 10 → CPA 100,000 · ROAS 150% · 담기당 20,000 · 직접CPA 125,000 · 직접ROAS 80% · 직접전환 8 · 직접값 800,000
chk(a && a[4] === '1,000,000' && a[5] === '1,500,000' && a[6] === '10' && a[7] === '100,000' && a[8] === '150%' && a[9] === '20,000', '염지윤 매체 지표: 비용·매출·전환·CPA·ROAS·담기당비용', a);
chk(a && a[10] === '125,000' && a[11] === '80%' && a[12] === '8' && a[13] === '800,000', '염지윤 직접 지표: 직접CPA 125,000 · 직접ROAS 80% · 전환수 8 · 전환값 800,000', a);
chk(a && a[1] === '200,000' && a[2] === '+100%' && a[3] === 'ON', '조회수 20만 · 지난 수집 대비 +100% · 광고 ON', a);
const b = await cells('양형석');
chk(b && b[7] === '–' && b[10] === '–' && b[11] === '0%' && b[3] === 'OFF', '전환 0건: CPA는 –(0으로 나누지 않음), 직접ROAS 0%, OFF', b);
const t = await page();
chk(t.includes('1,500,000') /* 합계 비용 */ && t.includes('2명') && /직접 ROAS\s*\n?\s*53%/.test(t), '합계: 비용 150만 · 직접ROAS 800,000/1,500,000=53% (사람당 한 번)', t.slice(0, 300));
await click('.rpt-seg button', '자동 누적'); await wait(300);
const c = await cells('염지윤');
chk(c && c[4] === '3,000,000' && c[11] === '150%', '자동 누적으로 바꾸면 누적값(비용 300만 · 직접ROAS 150%)', c);
await evalJs(`(()=>{const i=document.querySelector('.rpt input[type=checkbox]');i.click();return 1})()`); await wait(300);
chk(J(await names()) .includes('광고없는사람'), '광고 없는 인원도 보기 체크 → 표에 나옴', await names());
await click('.brand-tab', '그래니살라'); await wait(500);
chk(J(await names()) === J(['그래니사람']), '그래니살라 탭: 그래니 사람만', await names());
chk((await page()).includes('그래니살라 리포트'), '제목이 브랜드별');

DEPLOYED = false;
await evalJs(`[...document.querySelectorAll('.rpt button')].find(b=>b.textContent==='새로고침').click()`); await wait(800);
const errTxt = await evalJs(`document.querySelector('.log-page')?.innerText||''`);
chk(errTxt.includes('새 버전 배포'), '백엔드 배포 전이면 안내 문구(Apps Script 새 버전 배포)', errTxt);
DEPLOYED = true;

ROLE = 'staff'; await open(); await wait(600);
const tabTexts = await evalJs(`[...document.querySelectorAll('.step-tab')].map(b=>b.textContent)`);
chk(!tabTexts.some((x) => x.includes('리포트')), '알바(staff) 계정에는 리포트 탭이 안 보임', tabTexts);

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close();
process.exit(fail ? 1 : 0);
