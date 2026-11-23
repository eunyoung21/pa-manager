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
  'wCost', 'wConv', 'wRev', 'wAtc', 'wDCount', 'wDAmount', 'wkStart', 'wkEnd', 'product'];
const P = (o) => HEADER.map((h) => (o[h] === undefined ? (h === 'kind' ? (o.wkEnd ? 'wk' : 'now') : '') : o[h]));
const ROWS = [
  P({ brand: '베이스튠', name: '염지윤', channel: 'yjy', pa: '유송미', status: 'ok', views: 200000, viewsPrev: 100000, postUrl: 'https://www.instagram.com/reel/x/', metaOn: 'Y', metaFirstAt: '2026-11-03',
      wCost: 1000000, wConv: 10, wRev: 1500000, wAtc: 50, wDCount: 8, wDAmount: 800000 }),
  P({ brand: '베이스튠', name: '양형석', channel: 'yhs', pa: '유송미', status: 'ok', views: 50000, viewsPrev: 50000, metaOn: 'N', metaFirstAt: '2026-11-08',
      wCost: 500000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 0, wDAmount: 0 }),
  P({ brand: '베이스튠', name: '게시전사람', status: 'noPost', wCost: 300000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 0, wDAmount: 0 }),
  P({ brand: '베이스튠', name: '광고없는사람', channel: 'noad', pa: '안민영', status: 'ok', views: 1000 }),
  // 이전 데이터(주차별): 베이스튠 2주(사이에 한 주 빠짐) + 그래니 1주
  P({ brand: '베이스튠', name: '염지윤', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 2000000, wConv: 20, wRev: 2400000, wAtc: 40, wDCount: 15, wDAmount: 1800000 }),
  P({ brand: '베이스튠', name: '양형석', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 1000000, wConv: 0, wRev: 0, wAtc: 0, wDCount: 5, wDAmount: 500000 }),
  P({ brand: '베이스튠', name: '염지윤', wkStart: '2026-10-19', wkEnd: '2026-10-25', wCost: 1000000, wConv: 10, wRev: 1200000, wAtc: 20, wDCount: 8, wDAmount: 1200000 }),
  P({ brand: '그래니살라', name: '그래니둘째', channel: 'g2', product: 'B제품', status: 'ok', wCost: 100000, wConv: 1, wRev: 100000, wAtc: 1, wDCount: 1, wDAmount: 100000 }),
  P({ brand: '그래니살라', name: '그래니전용', product: 'B제품', wkStart: '2026-11-02', wkEnd: '2026-11-08', wCost: 99999, wConv: 1, wRev: 1, wAtc: 1, wDCount: 1, wDAmount: 1 }),
  P({ brand: '그래니살라', name: '그래니사람', product: '그래니 올인원', channel: 'gr', pa: '안민영', status: 'ok', views: 9000, wCost: 200000, wConv: 2, wRev: 300000, wAtc: 4, wDCount: 1, wDAmount: 100000 }),
];
const META = { updatedAt: new Date().toISOString(), snapshotDate: '2026-11-13', weeks: { '베이스튠': { start: '2026-11-09', end: '2026-11-15' } },
  insights: { '베이스튠': { weeks: ['2026-11-15', '2026-11-08'], byWeek: {
    '2026-11-15': { start: '2026-11-09', basis: '10-19 ~ 11-15 누적 · 직접ROAS 88%', lines: [{ kind: 'grow', text: '카테고리 육아(3명 · 직접ROAS 140%)이 평균보다 확실히 높아요 — 이 구간 섭외를 늘려 보세요.' }, { kind: 'note', text: '팔로워 구간별 차이가 거의 없어요' }] },
    '2026-11-08': { start: '2026-11-02', basis: '10-19 ~ 11-08 누적 · 직접ROAS 91%', lines: [{ kind: 'cut', text: '조회수 3만 미만 구간은 약해요' }] } } } } };
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
const names = () => evalJs(`[...document.querySelectorAll('.rpt-table tbody tr')].map(tr=>tr.children[0].querySelector('.rpt-nm')?.textContent||'')`);
const cells = (n) => evalJs(`(()=>{const tr=[...document.querySelectorAll('.rpt-table tbody tr')].find(t=>t.children[0].querySelector('.rpt-nm')?.textContent===${J(n)});return tr?[...tr.children].map(c=>c.innerText):null})()`);
const open = async () => { await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await waitFor(`[...document.querySelectorAll('.brand-tab')].length>0`, '앱 로딩'); };

await open();
await click('.brand-tab', '베이스튠'); await wait(500);
await click('.step-tab', '리포트'); await waitFor(`document.querySelector('.rpt-table')`, '리포트 표');
// 이번 주 열: 0 이름·채널 · 1 라이브 · 2 세팅일 · 3 비용 · 4 매출 · 5 전환 · 6 CPA · 7 ROAS · 8 담기당 · 9 직접CPA · 10 직접ROAS · 11 직접전환수 · 12 직접전환값
const head = await evalJs(`[...document.querySelectorAll('.rpt-table thead tr:last-child th')].map(t=>t.innerText)`);
chk(head[0].includes('이름') && head[0].includes('채널') && head[1] === '라이브' && !head.includes('조회수') && !head.some((x) => x.includes('대비')) && !head.includes('광고'), '이번 주 표 머리글: 이름·채널 / 라이브 / 세팅일 — 조회수·«대비»·«광고» 열 없음', head);
chk(J(await names()) === J(['양형석', '염지윤', '게시전사람']), '베이스튠: 광고 있는 세 명을 세팅일 최신순으로(양형석 11-08 → 염지윤 11-03 → 세팅일 없는 사람)', await names());
await click('button', '매체 신고값 보기'); await wait(300);
const np = await cells('게시전사람');
chk(np && np[1] === '–' && np[6] === '–' && np[5] === '300,000', '게시 링크·세팅일이 없는 광고 인원도 비용은 나옴', np);
const a = await cells('염지윤');
// 비용 1,000,000 · 매출 1,500,000 · 전환 10 → CPA 100,000 · ROAS 150% · 담기당 20,000 · 직접CPA 125,000 · 직접ROAS 80% · 직접전환 8 · 직접값 800,000
chk(a && a[5] === '1,000,000' && a[7] === '1,500,000' && a[8] === '10' && a[9] === '100,000' && a[10] === '150%' && a[11] === '20,000', '염지윤 매체 지표: 비용·매출·전환·CPA·ROAS·담기당비용', a);
chk(a && a[12] === '125,000' && a[2] === '80%' && a[3] === '8' && a[4] === '800,000', '염지윤 직접 지표: 직접CPA 125,000 · 직접ROAS 80% · 전환수 8 · 전환값 800,000', a);
chk(a && a[0].includes('yjy') && a[1] === 'ON' && a[6] === '11-03', '이름 옆에 채널명(yjy) · 라이브 ON · 세팅일 11-03', a);
const b = await cells('양형석');
chk(b && b[9] === '–' && b[12] === '–' && b[2].startsWith('–') && b[1] === 'OFF' && b[0].includes('yhs'), '전환 0건: CPA는 –(0으로 나누지 않음), 직접ROAS는 –, 라이브 OFF, 채널 yhs', b);
const tipB = await evalJs(`(()=>{const tr=[...document.querySelectorAll('.rpt-table tbody tr')].find(x=>x.children[0].querySelector('.rpt-nm')?.textContent==='양형석');const s=tr.querySelector('.rpt-roas');return s.className+'|'+s.title})()`);
chk(tipB.includes('few') && tipB.includes('판단 보류'), '전환 5건 미만 ROAS는 회색(few) + 마우스를 올리면 이유(판단 보류)', tipB);
const t = await page();
chk(t.includes('1,800,000') /* 합계 비용 */ && t.includes('3명') && /직접 ROAS\s+44%/.test(t), '합계: 비용 180만 · 직접ROAS 800,000/1,800,000=44% (게시 링크 없는 사람 포함, 사람당 한 번)', t.slice(0, 300));
// 광고 없는 인원도 보기는 이번 주 화면에서 먼저
await evalJs(`(()=>{const i=document.querySelector('.rpt input[type=checkbox]');i.click();return 1})()`); await wait(300);
chk(J(await names()) .includes('광고없는사람'), '광고 없는 인원도 보기 체크 → 표에 나옴', await names());
// ── 섭외 확장 제안(누적 인사이트) ──
const insTxt = await evalJs(`document.querySelector('.rpt-ins2')?.innerText||''`);
chk(insTxt.includes('섭외 확장 제안') && insTxt.includes('확장') && insTxt.includes('카테고리 육아') && insTxt.includes('참고'), '섭외 확장 제안: 확장/참고 문장과 근거 기간 표시', insTxt);
chk((await evalJs(`document.querySelector('.rpt-weeks')?.innerText||''`)).includes('11-02~11-08'), '주차 라벨 표시(이번 주 + 지난 주)');
await click('.rpt-weeks button', '11-02~11-08'); await wait(300);
const insTxt2 = await evalJs(`document.querySelector('.rpt-ins2')?.innerText||''`);
chk(insTxt2.includes('조회수 3만 미만 구간은 약해요') && insTxt2.includes('10-19 ~ 11-08 누적') && !insTxt2.includes('카테고리 육아'), '라벨을 누르면 그 주 내용으로 바뀜', insTxt2);
await click('.rpt-weeks button', '이번 주'); await wait(300);
chk((await evalJs(`document.querySelector('.rpt-ins2')?.innerText||''`)).includes('카테고리 육아'), '다시 최근 주 라벨을 누르면 최근 주 내용', '');
// ── 이름을 누르면 올린 영상으로 ──
const linkOf = (n) => evalJs(`(()=>{const tr=[...document.querySelectorAll('.rpt-table tbody tr')].find(t=>t.children[0].innerText.startsWith(${J(n)}));const a=tr&&tr.querySelector('a.rpt-link');return a?a.href+'|'+a.target:null})()`);
chk((await linkOf('염지윤')) === 'https://www.instagram.com/reel/x/|_blank', '이번 주: 이름이 올린 영상 링크(새 탭)', await linkOf('염지윤'));
chk((await linkOf('양형석')) === null, '영상 링크가 없는 사람은 이름이 링크가 아님');
// ── 주차 라벨: 누르면 그 주 인플루언서만 ──
const labels = await evalJs(`[...document.querySelectorAll('.rpt-weeks button')].map(b=>b.innerText)`);
const wopts = await evalJs(`[...document.querySelectorAll('.rpt-wsel option')].map(o=>o.text)`);
chk(labels.length === 3 && labels[0].startsWith('이번 주') && labels[1].includes('11-02~11-08') && labels[2].startsWith('전체 합산') && J(wopts) === J(['이전 주차 ▾', '10-19~10-25']), '라벨: 이번 주 · 지난 주 · 전체 합산 + 이전 주차 드롭다운(오래된 주)', [labels, wopts]);
await click('.rpt-weeks button', '11-02~11-08'); await wait(400);
const histT = await page();
chk(/직접 ROAS\s+77%/.test(histT) && /비용\s+3,000,000/.test(histT) && /그 주 집행\s+2명/.test(histT), '11-02~11-08 라벨: 그 주 합계(2명 · 비용 300만 · 직접ROAS 77%)', histT.slice(0, 300));
const blocks = () => evalJs(`(()=>{const out=[];let cur=null;for(const tr of document.querySelectorAll('.rpt-table tbody tr')){if(tr.classList.contains('rpt-wkrow')){cur={head:tr.innerText,rows:[]};out.push(cur);}else if(cur){cur.rows.push([...tr.children].map(c=>c.innerText));}}return out;})()`);
let bl = await blocks();
chk(bl.length === 1 && bl[0].head.startsWith('11-02 ~ 11-08') && bl[0].rows.length === 2, '그 주 한 블록만 보임(다른 주 사람 안 섞임)', bl.map((x) => x.head));
// 열: 0 이름·채널 · 1 라이브 · 2 비용 · 3 매출 · 4 전환 · 5 CPA · 6 ROAS · 7 담기당 · 8 직접CPA · 9 직접ROAS · 10 직접전환수 · 11 직접전환값
const r0 = bl[0].rows[0], r1 = bl[0].rows[1];
chk(r0 && r0[0].startsWith('염지윤') && r0[0].includes('yjy') && r0[1] === 'ON' && r0[5] === '2,000,000' && r0[2].startsWith('90%') && r0[3] === '15', '그 주 염지윤: 채널 yjy · 라이브 ON(지금 상태) · 비용 200만 · 직접ROAS 90% · 직접CPA 133,333', r0);
chk(r1 && r1[0].startsWith('양형석') && r1[1] === 'OFF' && r1[5] === '1,000,000', '그 주 양형석: 비용순 두 번째 · 라이브 OFF', r1);
chk((await evalJs(`document.querySelector('.rpt-ins2')?.innerText||''`)).includes('조회수 3만 미만 구간은 약해요'), '그 주 라벨을 누르면 확장 제안도 그 주 내용으로 같이 바뀜');
chk((await linkOf('염지윤')) === 'https://www.instagram.com/reel/x/|_blank', '지난 주 표에서도 이름 → 영상 링크', await linkOf('염지윤'));
await evalJs(`(()=>{const s=document.querySelector('.rpt-wsel');s.value=[...s.options].find(o=>o.text==='10-19~10-25').value;s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`); await wait(300);
bl = await blocks();
chk(bl.length === 1 && bl[0].rows.length === 1 && bl[0].rows[0][5] === '1,000,000' && bl[0].rows[0][2].startsWith('120%'), '10-19~10-25 라벨: 염지윤만 · 직접ROAS 120%', bl);
chk((await page()).includes('빠진 구간') && (await page()).includes('10-26~11-01'), '빠진 구간 표시(10-26~11-01)', (await page()).slice(-300));
// ── 전체 합산(사람별) ──
await click('.rpt-weeks button', '전체 합산'); await wait(300);
chk(/직접 ROAS\s+88%/.test(await page()) && /비용\s+4,000,000/.test(await page()) && /기간 내 집행\s+2명/.test(await page()), '전체 합산 합계: 비용 400만 · 직접ROAS 88% (그래니 주차 안 섞임)', (await page()).slice(0, 300));
const pm = await evalJs(`(()=>{const tr=[...document.querySelectorAll('.rpt-table tbody tr')].find(t=>t.children[0].querySelector('.rpt-nm')?.textContent==='염지윤');return tr?[...tr.children].map(c=>c.innerText):null})()`);
chk(pm && pm[6] === '2' && pm[5] === '3,000,000' && pm[2].startsWith('100%') && pm[3] === '23', '전체 합산: 염지윤 2주 · 비용 300만 · 직접ROAS 100% · 직접전환 23', pm);
chk(!(await evalJs(`!!document.querySelector('.rpt-wkrow')`)), '전체 합산에는 주차 머리줄이 없음');
await click('.rpt-weeks button', '이번 주'); await wait(300);
chk(J(await names()).includes('염지윤') && !J(await names()).includes('그래니전용'), '이번 주로 돌아오면 이번 주 표(이전 데이터 사람 안 섞임)', await names());
await click('.brand-tab', '그래니살라'); await wait(500);
chk(J(await names()) === J(['그래니사람', '그래니둘째']), '그래니살라 탭: 그래니 사람만(비용순)', await names());
const gh = await evalJs(`[...document.querySelectorAll('.rpt-table thead tr')].at(-1).innerText`);
chk(gh.includes('제품') && (await evalJs(`document.querySelector('.rpt-table tbody tr').innerText`)).includes('그래니 올인원'), '제품이 적힌 브랜드(그래니)는 제품 칸이 생기고 제품명이 나옴', gh);
// ── 제품별로 눌러서 보기 ──
const chips = await evalJs(`[...document.querySelectorAll('.rpt-prods button')].map(b=>b.innerText)`);
chk(J(chips) === J(['전체 제품', '그래니 올인원', 'B제품', '제품 미상']) || J(chips) === J(['전체 제품', 'B제품', '그래니 올인원', '제품 미상']), '제품 버튼: 전체 + 제품별 + 제품 미상', chips);
await click('.rpt-prods button', 'B제품'); await wait(300);
chk(J(await names()) === J(['그래니둘째']) && /비용\s+100,000/.test(await page()), 'B제품만 누르면 그 제품 사람만 · 합계도 그 제품 기준(비용 10만)', (await page()).slice(0, 300));
await click('.rpt-weeks:not(.rpt-prods) button', '11-02~11-08'); await wait(300);
chk(J(await names()).includes('그래니전용'), 'B제품 + 11-02~11-08 주차: 그 제품의 그 주 사람', await names());
await click('.rpt-prods button', '그래니 올인원'); await wait(300);
chk(!J(await names()).includes('그래니전용'), '다른 제품(올인원)으로 바꾸면 그 주 B제품 사람은 사라짐(주차 라벨은 유지)', await names());
chk((await evalJs(`[...document.querySelectorAll('.rpt-weeks:not(.rpt-prods) button')].length`)) === 3, '제품을 골라도 주차 라벨은 그대로');
await click('.rpt-prods button', '전체 제품'); await wait(300);
await click('.rpt-weeks:not(.rpt-prods) button', '이번 주'); await wait(300);
await click('.brand-tab', '베이스튠'); await wait(500);
chk(!(await evalJs(`[...document.querySelectorAll('.rpt-table thead tr')].at(-1).innerText`)).includes('제품'), '제품이 한 개도 없는 브랜드(베이스튠)는 제품 칸이 숨겨짐');
await click('.brand-tab', '그래니살라'); await wait(500);
chk((await page()).includes('그래니살라 리포트'), '제목이 브랜드별');
chk(!(await page()).includes('섭외 확장 제안'), '인사이트가 없는 브랜드엔 확장 제안 영역이 안 보임');

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
