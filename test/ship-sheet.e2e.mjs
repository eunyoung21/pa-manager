/* 출고 정보 → 출고 요청 시트 자동 기입 E2E — node test/ship-sheet.e2e.mjs
   제품 발송 완료 순간 자동 전송 · 요청자 미설정이면 멈춤+안내 · 실패 사유 표시와 다시 올리기 · 중복 전송 없음(2026-11-23) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-ship-sheet-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8992, FPORT = 8993;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9372', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9372/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const calls = () => global.__calls || [];
const H2 = () => savedData.brands[0];
const SR = (id) => (H2().shippingRows || []).find((r) => r.channelName === id);
const P2 = (id, name, u) => S2(id, name, u, { dmSent: 'Y', replied: 'Y', approved: 'Y', dealDone: 'Y', pa: '안민영', contactStatus: '진행중', product: '해트케 압력이불' });
savedData = { paList: ['박민선', '안민영', '기타'], brands: [{ ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'],
  step2Rows: [P2('a', 'ship_a', 'ship_a'), P2('b', 'ship_b', 'ship_b'), P2('c', 'ship_c', 'ship_c')] }], settlements: {} };
const setIn = (ph, v) => evalJs(`(()=>{const t=document.querySelector('input[placeholder=${J2(ph)}]');if(!t)throw new Error('입력칸 없음 '+${J2(ph)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,${J2(v)});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const doShip = async (name, rn) => {
  await click('.todo-item', name); await wait(1500);
  await setIn('홍길동', rn); await setIn('010-0000-0000', '010-1111-2222'); await setIn('우편번호 / 주소 입력', '부산시 해운대구 ' + name);
  await evalJs("[...document.querySelectorAll('button.s2p-final')].find(b=>b.textContent.trim()==='완료').click()"); await wait(4500);
  await evalJs("(()=>{const x=document.querySelector('.drawer-close, .s2p-close, button[title=\"닫기\"]');if(x)x.click();return 1})()"); await wait(300);
};
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", '앱 로딩');
await click('.brand-tab', '해트케'); await wait(1800);
// 1) 요청자 이름이 없으면 보내지 않고 안내
await doShip('ship_a', '김가나');
chk(calls().length === 0, '요청자 성함이 없으면 시트로 안 보냄', calls().length);
chk(SR('ship_a') && /요청자/.test(SR('ship_a').sheetErr || '') && !SR('ship_a').sheetSentAt, '사유가 출고 행에 남음', SR('ship_a'));
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await wait(3500);
await click('.brand-tab', '해트케'); await wait(1800);
let dash = await evalJs("document.querySelector('.hk-page').innerText");
chk(dash.includes('출고 시트 자동 기입이 멈춰') && dash.includes('시트 안 올라감'), '대시보드에 멈춤 안내 + 목록 표시', dash.slice(0, 300));
// 2) 출고 탭에서 요청자(관리자 이름) 설정 — 모든 브랜드에 저장
await evalJs("window.prompt=()=>'이은영'");
await click('button', '출고'); await wait(1500);
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('시트 요청자')).click()"); await wait(4500);
chk(savedData.brands.every((b) => b.shipSheetRequester === '이은영'), '시트 요청자 이름이 모든 브랜드에 저장됨', savedData.brands.map((b) => b.shipSheetRequester));
chk((await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('시트 요청자')).textContent")).includes('이은영'), '버튼에 설정된 이름이 보임');
// 3) 못 보낸 건 → 출고 정보 창에서 [시트에 올리기]
await click('button', '대시보드'); await wait(1500);
await click('.todo-item .todo-name', 'ship_a'); await wait(800);
let pop = await evalJs("document.querySelector('.ship-sheet-line')?.innerText||''");
chk(pop.includes('안 올라감') && pop.includes('시트에 올리기'), '출고 정보 창에 실패 사유 + 올리기 버튼', pop);
await evalJs("document.querySelector('.ship-sheet-btn').click()"); await wait(4500);
chk(calls().length === 1 && calls()[0].requester === '이은영' && calls()[0].reason === '협찬' && calls()[0].recipient === '김가나' && calls()[0].phone === '010-1111-2222', '버튼으로 한 번 전송(요청자·사유·수령자·연락처)', calls());
chk(calls()[0].product === '해트케 압력이불 (1)' && calls()[0].address.includes('ship_a') && !calls()[0].tracking, '상품명(수량)·주소 · 송장 비어 있음', calls()[0]);
chk(!!SR('ship_a').sheetSentAt && SR('ship_a').sheetRow === 7 && !SR('ship_a').sheetErr, '출고 행에 올라간 시각·행 번호 기록', SR('ship_a'));
pop = await evalJs("document.querySelector('.ship-sheet-line')?.innerText||''");
chk(SR('ship_a').status === '✅ 완료' && !!SR('ship_a').shipDate, '시트에 올라가면 상태가 ✅ 완료로 바뀜(출고일 기록)', SR('ship_a'));
chk(!(await evalJs("!!document.querySelector('.ship-sheet-line')")), '완료되면 출고 정보 창은 닫힘');
const shipBox = await evalJs("(()=>{const b=[...document.querySelectorAll('.todo-box')].find(x=>x.textContent.includes('출고 정보'));return b?b.innerText:''})()");
chk(!shipBox.includes('ship_a'), '대시보드 출고 정보 목록에서 빠짐', shipBox);
// 4) 요청자 있을 때는 완료 순간 자동 전송
await doShip('ship_b', '이다라');
chk(calls().length === 2 && calls()[1].recipient === '이다라', '제품 발송 완료 순간 자동으로 시트에 전송', calls().length);
chk(!!SR('ship_b').sheetSentAt && SR('ship_b').status === '✅ 완료', '자동 전송된 행도 기록 + 자동으로 완료 처리', SR('ship_b'));
// 5) 실패(탭 없음 등) → 사유 저장 · 목록 표시 · 나중에 다시 올리기
global.__sheetMode = 'fail';
await doShip('ship_c', '박마바');
chk(calls().length === 3 && !SR('ship_c').sheetSentAt && SR('ship_c').sheetErr === '이번 달 탭이 없어요' && SR('ship_c').status === '처리중', '실패하면 사유 저장·미기록·완료 처리 안 함(처리중 유지)', SR('ship_c'));
chk(SR('ship_b').shipDate === EXPECT && SR('ship_b').requestDate === EXPECT, '출고일자·출고요청일 = 낮 12시 이후면 다음 날(' + EXPECT + ')', [SR('ship_b').shipDate, SR('ship_b').requestDate]);
// 출고 탭 위쪽 알림: 올라간 건 초록 / 못 올라간 건 주황
await click('button', '출고'); await wait(1500);
let notice = await evalJs("document.querySelector('.ship-notice')?.innerText||''");
chk(notice.includes('출고 시트에 정상 기입됐어요') && notice.includes('ship_b'), '출고 탭 위쪽에 정상 기입 알림', notice);
chk(notice.includes('못 올라간 건 1건') && notice.includes('ship_c'), '못 올라간 건은 따로 경고', notice);
// 달력: 출고·영상검수 탭 오른쪽에 달력 패널, 날짜 누르면 그날 건만
chk(await evalJs("!!document.querySelector('.cal-sidebar')"), '출고 탭에 달력 패널');
const rowsBefore = await evalJs("document.querySelectorAll('.ship-t tbody tr:not(.add-row)').length");
await evalJs("document.querySelector('.cal-sidebar .cal-day.has-data')?.click()"); await wait(500);
const rowsDay = await evalJs("document.querySelectorAll('.ship-t tbody tr:not(.add-row)').length");
chk(rowsBefore >= 1 && rowsDay >= 1 && rowsDay <= rowsBefore, '출고 달력 날짜를 누르면 그날 건만 보임', [rowsBefore, rowsDay]);
await evalJs("document.querySelector('.cal-toggle').click()"); await wait(300);
chk(!(await evalJs("!!document.querySelector('.cal-sidebar')")), '달력 접기 버튼', 0);
await evalJs("document.querySelector('.cal-toggle').click()"); await wait(300);
await click('button', '영상검수'); await wait(1500);
chk(await evalJs("!!document.querySelector('.cal-sidebar')"), '영상검수 탭에도 달력 패널');
await click('button', '대시보드'); await wait(1500);
global.__serverDate = '2030-01-02';
global.__sheetMode = 'ok';
await click('.todo-item .todo-name', 'ship_c'); await wait(800);
await evalJs("document.querySelector('.ship-sheet-btn').click()"); await wait(4500);
chk(SR('ship_c').shipDate === '30.01.02' && SR('ship_c').requestDate === '30.01.02', '서버가 쓴 날짜(res.date)를 출고일자·출고요청일로 그대로 사용', [SR('ship_c').shipDate, SR('ship_c').requestDate]);
chk(calls().length === 4 && !!SR('ship_c').sheetSentAt && !SR('ship_c').sheetErr && SR('ship_c').status === '✅ 완료', '다시 올리기 성공 → 기록·사유 지움·완료 처리', SR('ship_c'));
// 6) 이미 올라간 건 다시 보내지 않음(같은 행에 버튼 없음)
await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='닫기')?.click()");
chk(calls().length === 4, '총 4번만 전송(중복 없음)', calls().length);
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
