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

const HEADER = ['kind', 'brand', 'name', 'channel', 'pa', 'category', 'posts', 'postedAt', 'postUrl', 'status', 'views', 'viewsPrev', 'likes', 'comments', 'followers', 'engRate', 'rate', 'metaOn', 'metaFirstAt',
  'wCost', 'wConv', 'wRev', 'wAtc', 'wDCount', 'wDAmount', 'wkStart', 'wkEnd'];
const P = (o) => HEADER.map((h) => (o[h] === undefined ? (h === 'kind' ? (o.wkEnd ? 'wk' : 'now') : '') : o[h]));
const ROWS = [
  P({ brand: '베이스튠', name: '염지윤', channel: 'yjy', pa: '유송미', status: 'ok', views: 200000, viewsPrev: 100000, postUrl: 'https://www.instagram.com/reel/x/', metaOn: 'Y',
      wCost: 1000000, wConv: 10, wRev: 1500000, wAtc: 50, wDCount: 8, wDAmount: 800000 }),
  P({ brand: '베이스튠', name: '양형석', channel: 'yhs', pa: '유송미', status: 'ok', views: 50000, viewsPrev: 50000, metaOn: 'N',
      wCost: 500000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 0, wDAmount: 0 }),
  P({ brand: '베이스튠', name: '게시전사람', status: 'noPost', wCost: 300000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 0, wDAmount: 0 }),
  P({ brand: '베이스튠', name: '광고없는사람', channel: 'noad', pa: '안민영', status: 'ok', views: 1000 }),
  // 이전 데이터(주차별): 베이스튠 2주(사이에 한 주 빠짐) + 그래니 1주
  P({ brand: '베이스튠', name: '염지윤', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 2000000, wConv: 20, wRev: 2400000, wAtc: 40, wDCount: 15, wDAmount: 1800000 }),
  P({ brand: '베이스튠', name: '양형석', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 1000000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 5, wDAmount: 500000 }),
  P({ brand: '베이스튠', name: '염지윤', wkStart: '2026-10-19', wkEnd: '2026-10-25', wCost: 1000000, wConv: 10, wRev: 1200000, wAtc: 20, wDCount: 8, wDAmount: 1200000 }),
  P({ brand: '그래니살라', name: '그래니전용', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 99999, wConv: 1, wRev: 1, wAtc: 1, wDCount: 1, wDAmount: 1 }),
  P({ brand: '그래니살라', name: '그래니사람', channel: 'gr', pa: '안민영', status: 'ok', views: 9000, wCost: 200000, wConv: 2, wRev: 300000, wAtc: 4, wDCount: 1, wDAmount: 100000 }),
];
const META = { updatedAt: new Date().toISOString(), snapshotDate: '2026-11-13', weeks: { '베이스튠': { start: '2026-11-09', end: '2026-11-15' } } };
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
chk(J(await names()) === J(['염지윤', '양형석', '게시전사람']), '베이스튠: 광고 있는 세 명(게시 링크 없는 사람 포함, 그래니·광고없는 사람 제외), 비용순', await names());
const np = await cells('게시전사람');
chk(np && np[1] === '게시 링크 없음' && np[4] === '300,000', '게시 링크 없는 광고 인원: 비용은 나오고 조회수 칸은 «게시 링크 없음»', np);
const a = await cells('염지윤');
// 비용 1,000,000 · 매출 1,500,000 · 전환 10 → CPA 100,000 · ROAS 150% · 담기당 20,000 · 직접CPA 125,000 · 직접ROAS 80% · 직접전환 8 · 직접값 800,000
chk(a && a[4] === '1,000,000' && a[5] === '1,500,000' && a[6] === '10' && a[7] === '100,000' && a[8] === '150%' && a[9] === '20,000', '염지윤 매체 지표: 비용·매출·전환·CPA·ROAS·담기당비용', a);
chk(a && a[10] === '125,000' && a[11] === '80%' && a[12] === '8' && a[13] === '800,000', '염지윤 직접 지표: 직접CPA 125,000 · 직접ROAS 80% · 전환수 8 · 전환값 800,000', a);
chk(a && a[1] === '200,000' && a[2] === '+100%' && a[3] === 'ON', '조회수 20만 · 지난 수집 대비 +100% · 광고 ON', a);
const b = await cells('양형석');
chk(b && b[7] === '–' && b[10] === '–' && b[11] === '0%' && b[3] === 'OFF', '전환 0건: CPA는 –(0으로 나누지 않음), 직접ROAS 0%, OFF', b);
const t = await page();
chk(t.includes('1,800,000') /* 합계 비용 */ && t.includes('3명') && /직접 ROAS\s+44%/.test(t), '합계: 비용 180만 · 직접ROAS 800,000/1,800,000=44% (게시 링크 없는 사람 포함, 사람당 한 번)', t.slice(0, 300));
// 광고 없는 인원도 보기는 이번 주 화면에서 먼저
await evalJs(`(()=>{const i=document.querySelector('.rpt input[type=checkbox]');i.click();return 1})()`); await wait(300);
chk(J(await names()) .includes('광고없는사람'), '광고 없는 인원도 보기 체크 → 표에 나옴', await names());
// ── 이전 데이터 ──
await click('.rpt-seg button', '이전 데이터'); await wait(400);
const histT = await page();
chk(histT.includes('이전 데이터 (10-19 ~ 11-08)'), '이전 데이터 버튼에 기간 표시(10-19 ~ 11-08)', histT.slice(0, 120));
const weekRows = () => evalJs(`[...document.querySelectorAll('.rpt-pick')].map(tr=>[...tr.children].map(c=>c.innerText))`);
let wr = await weekRows();
chk(wr.length === 3 && wr[0][0] === '전체 합산' && wr[1][0] === '11-02 ~ 11-08' && wr[2][0] === '10-19 ~ 10-25', '주차 표: 전체 합산 + 최신 주부터 2주(그래니 주차는 안 섞임)', wr);
// 전체: 비용 400만, 직접 350만 → 88%, 직접CPA 4,000,000/28=142,857, 전환수 28
chk(wr[0][2] === '4,000,000' && wr[0][3] === '88%' && wr[0][4] === '142,857' && wr[0][5] === '28' && wr[0][6] === '3,500,000', '전체 합산: 비용 400만 · 직접ROAS 88% · 직접CPA 142,857 · 전환 28 · 전환값 350만', wr[0]);
chk(wr[1][1] === '2' && wr[1][3] === '77%' && wr[1][4] === '150,000', '11-02~11-08 주: 2명 · 직접ROAS 77% · 직접CPA 150,000', wr[1]);
const pcell = (n) => evalJs(`(()=>{const t=[...document.querySelectorAll('.rpt-table')].at(-1);const tr=[...t.querySelectorAll('tbody tr')].find(r=>r.children[0].innerText===${J(n)});return tr?[...tr.children].map(c=>c.innerText):null})()`);
const y = await pcell('염지윤');
// 염지윤 전체: 2주 · 비용 300만 · 직접값 300만 → ROAS 100% · CPA 3,000,000/23=130,435 · 전환수 23
chk(y && y[1] === '2' && y[2] === '3,000,000' && y[9] === '100%' && y[8] === '130,435' && y[10] === '23', '염지윤 전체 합산: 2주 · 비용 300만 · 직접ROAS 100% · 직접CPA 130,435', y);
await click('.rpt-pick', '10-19 ~ 10-25'); await wait(300);
const y2 = await pcell('염지윤'), q2 = await pcell('양형석');
chk(y2 && y2[1] === '1' && y2[2] === '1,000,000' && q2 === null, '10-19~10-25 주만 선택하면 그 주 사람만(양형석 없음)', [y2, q2]);
const histT2 = await page();
chk(histT2.includes('빠진 구간') && histT2.includes('10-26~11-01'), '빠진 구간 표시(10-26~11-01)', histT2.slice(-400));
await click('.rpt-seg button', '이번 주'); await wait(300);
chk(J(await names()).includes('염지윤') && !J(await names()).includes('그래니전용'), '이번 주로 돌아오면 이번 주 표(이전 데이터 사람 안 섞임)', await names());
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
