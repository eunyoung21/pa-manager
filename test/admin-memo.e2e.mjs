/* 관리자 메모 노출 E2E — node test/admin-memo.e2e.mjs
   ① 메모 아래 맨 진행은 접어서 메모가 먼저 ② 메모 없는 진행은 그대로 ③ 진행 버튼 없이 남긴 관리자 메모도 담당자 할 일에 뜸 ④ 예전 메모칸 한 단어 복구(2026-11-20) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-admin-memo-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8984, FPORT = 8985;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9364', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9364/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const J2 = JSON.stringify;
const R = (id) => savedData.brands[0].step2Rows.find((r) => r.id === id);
const adm = (text, kind = '', ts = 2, at = '26.11.20 17:21') => ({ who: '관리자', text, at, kind, ts });
const alba = (text, kind = '요청', ts = 1) => ({ who: '안민영', text, at: '26.11.20 11:44', kind, ts });
const P = (id, name, u, x) => S2(id, name, u, { dmSent: 'Y', replied: 'Y', pa: '안민영', contactStatus: '진행중', ...x });
savedData = { paList: ['박민선', '안민영', '기타'], brands: [{ ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'], step2Rows: [
  // a: 메모 → 진행 (화면에는 메모가 먼저 보여야 함)
  P('a', '메모진행', 'u_a', { memo: '진행', reviewReq: { status: '진행', note: '배송 문의', reply: '', reqTs: 1, reqAt: '26.11.20', replyAt: '26.11.20', ack: '' },
    thread: [alba('배송 문의'), adm('11/22 이후 배송 가능, 출고요청 올려주세요'), adm('진행', '답변', 3)] }),
  // b: 메모 없이 진행 (그대로 '진행')
  P('b', '진행만', 'u_b', { memo: '진행', reviewReq: { status: '진행', note: '문의', reply: '', reqTs: 1, reqAt: '26.11.20', replyAt: '26.11.20', ack: '' },
    thread: [alba('문의'), adm('진행', '답변', 3)] }),
  // c: 승인했는데 진행은 안 누르고 관리자 메모만 (아직 요청 상태)
  P('c', '승인메모만', 'u_c', { approved: 'Y', memo: '가능', reviewReq: { status: '요청', note: '2차활용 문의', reply: '', reqTs: 1, reqAt: '26.11.20', replyAt: '', ack: '' },
    thread: [alba('2차활용 문의'), adm('가능')] }),
  // d: 이미 알바가 확인한 건 — 안 떠야 함
  P('d', '확인끝', 'u_d', { memo: '가능', reviewReq: { status: '요청', note: 'x', reply: '', reqTs: 1, reqAt: '26.11.20', replyAt: '', ack: 'Y' },
    thread: [alba('x'), adm('가능'), { who: '안민영', text: '✓ 확인', at: '26.11.20 18:00', kind: '확인', ts: 4 }] }),
  // e: 진행을 눌러야 하는 건 (관리자 메모가 마지막 → 진행 눌러도 '진행' 줄이 안 쌓임)
  P('e', '진행누를건', 'u_e', { memo: '계약서 발송', reviewReq: { status: '요청', note: '문의', reply: '', reqTs: 1, reqAt: '26.11.20', replyAt: '', ack: '' },
    thread: [alba('문의'), adm('계약서 발송')] })] }], settlements: {} };
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", '앱 로딩');
await click('.brand-tab', '해트케'); await wait(2500);
const ansBox = () => evalJs("(()=>{const g=[...document.querySelectorAll('.todo-group')].find(x=>x.textContent.includes('관리자 답변'));return g?g.innerText:''})()");
let box = await ansBox();
// ① a: 메모가 먼저, 진행 글자는 접힘
chk(box.includes('11/22 이후 배송 가능') && !/관리자\s+진행\s*\n/.test(box.split('메모진행')[1]?.split('\n').slice(0, 6).join('\n') || ''), 'a: 관리자 답변 줄에 진짜 메모가 보임', box.slice(0, 400));
// ② b: 메모 없는 진행은 그대로
chk(box.includes('진행만'), 'b: 메모 없는 진행 건도 목록에 있음');
chk((box.split('진행만')[1] || '').includes('진행'), 'b: 메모 없는 진행은 그대로 \'진행\'으로 보임');
// ③ c: 승인 + 관리자 메모만 → 담당자 할 일에 뜸 / d: 확인 끝난 건은 안 뜸
chk(box.includes('승인메모만') && box.includes('가능'), 'c: 진행 안 눌렀어도 관리자 메모가 담당자 할 일에 뜸', box.slice(0, 600));
chk(!box.includes('확인끝'), 'd: 알바가 이미 확인한 건은 안 뜸');
chk(box.includes('진행누를건'), 'e: 관리자 메모만 있는 건 목록에 있음');
// 확인 누르면 c 사라지고 기록 남음
await evalJs(`(()=>{const g=[...document.querySelectorAll('.todo-group')].find(x=>x.textContent.includes('관리자 답변'));const it=[...g.querySelectorAll('.todo-item')].find(x=>x.textContent.includes('승인메모만'));[...it.querySelectorAll('button')].find(b=>b.textContent.includes('확인')).click();return 1})()`); await wait(4500);
chk(R('c').thread[R('c').thread.length - 1].kind === '확인' && R('c').reviewReq.ack === 'Y', 'c: ✓ 확인 → 기록 남고 목록에서 빠짐', R('c').thread);
chk(!(await ansBox()).includes('승인메모만'), 'c: 확인 후 안 보임');
// ④ e: 상세에서 진행 눌러도 '진행' 줄이 안 쌓이고 메모 칸도 그대로
await evalJs(`(()=>{const it=[...document.querySelectorAll('.todo-item')].find(x=>x.textContent.includes('진행누를건')&&[...x.querySelectorAll('button')].some(b=>b.textContent.includes('✓ 진행')));[...it.querySelectorAll('button')].find(b=>b.textContent.includes('✓ 진행')).click();return 1})()`);
await wait(4500);
chk(R('e').reviewReq.status === '진행' && R('e').thread.length === 2 && R('e').memo === '계약서 발송', 'e: 진행 → 상태만 바뀌고 메모·대화에는 \'진행\' 안 쌓임', { st: R('e').reviewReq.status, n: R('e').thread.length, memo: R('e').memo });
// ⑤ 예전 메모칸 한 단어 복구 — a 는 메모 칸이 '진행' 이었다가 메모로, b 는 그대로
chk(R('a').memo === '11/22 이후 배송 가능, 출고요청 올려주세요', 'a: 메모칸 \'진행\' → 관리자 메모로 복구', R('a').memo);
chk(R('b').memo === '진행', 'b: 메모 없는 진행은 메모칸도 그대로', R('b').memo);
chk(R('a').thread.length === 3, 'a: 대화 기록은 지우지 않음(3개)', R('a').thread.length);
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
