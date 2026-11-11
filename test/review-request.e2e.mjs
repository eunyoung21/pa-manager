/* 검토 요청 E2E — node test/review-request.e2e.mjs (메모→요청→대시보드 진행/패스)
   상세 창 '협찬 제품' 옆 옵션(차렵이불 색상·사이즈 / 압력이불 무게) 저장, 제품 바꾸면 옵션 비움, 출고 상품명·복사에 옵션(2026-10-13) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-review-req-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8966, FPORT = 8967;

// PA(목 백엔드)
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_finder_url','http://127.0.0.1:${FPORT}');
       localStorage.setItem('pa_mgr_auth', JSON.stringify(location.search.includes('staff')?{token:'T',username:'박민선',role:'staff',brand:'all',tabs:'claudeS2,step2,dashboard'}:{token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
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
const openCh = (n) => evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`);
savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'],
    step2Rows: [
      S2('s1', '고로', 'goro_one', { memo: '검수 필요 리뷰 : 고로 15만원 이상', contactStatus: '진행중', pa: '박민선', dmSent: 'Y', replied: 'Y' }),
      S2('s2', '또다른', 'other_one', { memo: '단가 12만원', contactStatus: '진행중', pa: '박민선', dmSent: 'Y', replied: 'Y' }),
    ] },
], settlements: {} };
const B = () => savedData.brands.find((b) => b.id === 'hatke');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 로딩');
await click('.brand-tab', '해트케'); await wait(600);
await evalJs(`window.confirm=()=>true; window.prompt=()=> '10만원이면 OK'; 1`);
await click('.step-tab', '인플루언서 관리'); await wait(700);
await openCh('고로'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
await click('.s2p button', '검토 요청'); await wait(1800);
let a = B().step2Rows.find((r) => r.id === 's1').reviewReq || {};
chk(a.status === '요청' && a.note.includes('고로 15만원') && a.reqTs, '검토 요청 저장: 상태 요청 · 메모 내용 · 요청 시각', a);
// 칸을 벗어나면 자동 저장(저장 버튼 없음)
await evalJs(`(()=>{const f=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent.startsWith('팔로워'));const i=f.querySelector('input');i.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'99,999');i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();return 1})()`); await wait(1800);
chk(B().step2Rows.find((r) => r.id === 's1').followers === '99,999', '팔로워 수 칸을 벗어나면 자동 저장', B().step2Rows.find((r) => r.id === 's1').followers);
chk(!(await evalJs(`document.querySelector('.s2p').innerText`)).includes('개인정보 제출') && ![...(await evalJs(`[...document.querySelectorAll('.s2p button')].map(b=>b.textContent.trim())`))].some((x) => x === '저장' || x.includes('삭제')), '저장·개인정보 제출·삭제 버튼 없음');
await click('.s2p button', '닫기'); await wait(300);
await openCh('또다른'); await waitFor(`document.querySelector('.s2p')`, '상세 창2');
await click('.s2p button', '검토 요청'); await wait(1800);
await click('.s2p button', '닫기'); await wait(300);
await click('.step-tab', '대시보드'); await wait(900);
let txt = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(txt.includes('검토 요청') && txt.includes('고로 15만원') && txt.includes('단가 12만원'), '대시보드 관리자 할 일에 🙋 검토 요청 + 메모 내용', txt.slice(0, 400));
const goroItem = `[...document.querySelectorAll('.hk-page .todo-item')].find(x=>x.textContent.includes('고로'))`;
await evalJs(`(()=>{[...${goroItem}.querySelectorAll('button')].find(b=>b.textContent.includes('진행')).click();return 1})()`); await wait(1800);
a = B().step2Rows.find((r) => r.id === 's1').reviewReq;
chk(a.status === '진행' && B().step2Rows.find((r) => r.id === 's1').contactStatus === '진행중', '✓ 진행: 상태 진행 · 거절 아님', a);
const otherItem = `[...document.querySelectorAll('.hk-page .todo-item')].find(x=>x.textContent.includes('또다른'))`;
await evalJs(`(()=>{[...${otherItem}.querySelectorAll('button')].find(b=>b.textContent.includes('패스')).click();return 1})()`); await wait(1800);
const o = B().step2Rows.find((r) => r.id === 's2');
chk(o.contactStatus === '거절' && o.endReason && o.rejectDate && o.reviewReq.status === '패스', '✕ 패스: 바로 거절 처리(거절·종료사유·거절일)', o);
txt = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(!txt.includes('단가 12만원'), '패스한 요청은 대시보드에서 사라짐');
txt = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(txt.includes('담당자 확인 대기') && txt.includes('고로'), '관리자 대시보드에 ⏳ 담당자 확인 대기(진행 답한 건)', txt.slice(0, 300));
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('고로'); await waitFor(`document.querySelector('.s2p')`, '상세 창 3');
let pt = await evalJs(`document.querySelector('.s2p').innerText`);
chk(pt.includes('관리자: 진행') && pt.includes('박민선 확인 대기') && !pt.includes('사장님'), '상세 창: 관리자: 진행 · 박민선 확인 대기', pt.slice(pt.indexOf('관리자') - 20, pt.indexOf('관리자') + 80));
// 담당자가 확인한 상태로 바꿔 다시 불러오기(확인 버튼은 담당자 계정 전용)
const s1 = B().step2Rows.find((r) => r.id === 's1'); s1.reviewReq = { ...s1.reviewReq, ack: 'Y', ackAt: '26.11.11 16:40' }; rev++;
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 재로딩');
await click('.brand-tab', '해트케'); await wait(800);
txt = await evalJs(`document.querySelector('.hk-page').innerText`);
chk(!txt.includes('담당자 확인 대기'), '확인하면 대기 목록에서 사라짐');
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('고로'); await waitFor(`document.querySelector('.s2p')`, '상세 창 4');
pt = await evalJs(`document.querySelector('.s2p').innerText`);
chk(pt.includes('박민선 확인 26.11.11 16:40'), '상세 창: ✓ 박민선 확인 26.11.11 16:40', pt.slice(pt.indexOf('관리자') - 20, pt.indexOf('관리자') + 80));
const s1b = B().step2Rows.find((r) => r.id === 's1'); s1b.reviewReq = { ...s1b.reviewReq, ack: '', ackAt: '' }; rev++;
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))`, '앱 재로딩 2');
await click('.brand-tab', '해트케'); await wait(800);
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('고로'); await waitFor(`document.querySelector('.s2p')`, '상세 창 5');
await click('.s2p button', '답변 취소'); await wait(1800);
chk(B().step2Rows.find((r) => r.id === 's1').reviewReq.status === '요청', '↩ 답변 취소: 다시 검토 요청 상태', B().step2Rows.find((r) => r.id === 's1').reviewReq);
await click('.s2p button', '요청 취소'); await wait(1800);
chk(!B().step2Rows.find((r) => r.id === 's1').reviewReq.status, '↩ 요청 취소: 요청 해제', B().step2Rows.find((r) => r.id === 's1').reviewReq);
// 담당자(알바) 계정으로 확인
const s1c = B().step2Rows.find((r) => r.id === 's1'); s1c.reviewReq = { status: '진행', note: s1c.memo, reply: '', reqTs: 1, reqAt: '26.11.11', replyAt: '26.11.11', ack: '', ackAt: '' }; rev++;
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/?staff` });
await waitFor(`[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))||[...document.querySelectorAll('.step-tab')].length`, '담당자 로딩');
await wait(800);
await evalJs(`(()=>{const b=[...document.querySelectorAll('.brand-tab')].find(x=>x.textContent.includes('해트케')); if(b) b.click(); return 1})()`); await wait(800);
await click('.step-tab', '인플루언서 관리'); await wait(700);
await openCh('고로'); await waitFor(`document.querySelector('.s2p')`, '상세 창 6');
const stTxt = await evalJs(`document.querySelector('.s2p').innerText`);
chk(stTxt.includes('관리자: 진행') && !stTxt.includes('✓ 확인'), '담당자 화면: 관리자: 진행 + 확인 버튼(대신 확인은 없음)', stTxt.slice(stTxt.indexOf('관리자') - 10, stTxt.indexOf('관리자') + 60));
await evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.trim()==='확인'); if(!b) throw new Error('확인 버튼 없음'); b.click(); return 1})()`); await wait(1800);
const ak = B().step2Rows.find((r) => r.id === 's1').reviewReq;
chk(ak.ack === 'Y' && /^\d\d\.\d\d\.\d\d \d\d:\d\d$/.test(ak.ackAt) && !ak.ackBy, '담당자 확인: 확인 시각 저장', ak);
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
