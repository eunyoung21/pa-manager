/* 승인+답장 E2E — node test/approve-reply.e2e.mjs
   메모 있는 건 승인 → 남길 말이 관리자 답변(thread·reviewReq)으로 남음, 메모 없는 건은 바로 승인(2026-11-20) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-approve-reply-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8982, FPORT = 8983;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9362', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9362/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const R = (id) => savedData.brands[0].claudeStep2Rows.find((r) => r.id === id);
savedData = { paList: ['박민선', '안민영', '기타'], brands: [{ ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'],
  claudeStep2Rows: [
    S2('c1', '메모있음', 'memo_one', { dmSent: 'Y', replied: 'Y', pa: '안민영', contactStatus: '진행중', memo: '단가 15만원 요구해요' }),
    S2('c2', '메모없음', 'memo_none', { dmSent: 'Y', replied: 'Y', pa: '안민영', contactStatus: '진행중', memo: '' })] }], settlements: {} };
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", '앱 로딩');
await click('.brand-tab', '해트케'); await wait(1500);
let dash = await evalJs("document.querySelector('.hk-page').innerText");
chk(dash.includes('승인 대기') && dash.includes('메모있음') && dash.includes('메모없음'), '승인 대기에 두 건 보임', dash.slice(0, 300));
await evalJs("window.__asked=[];window.prompt=(m)=>{window.__asked.push(m);return window.__ans}");
const okBtn = (name) => evalJs(`(()=>{const it=[...document.querySelectorAll('.todo-item')].find(x=>x.textContent.includes(${J2(name)})&&x.textContent.includes('승인'));const b=[...it.querySelectorAll('button')].find(x=>x.textContent.includes('승인'));b.click();return 1})()`);
// 1) 메모 없는 건 — 질문 없이 바로 승인, 관리자 답변 없음
await okBtn('메모없음'); await wait(4500);
chk(R('c2').approved === 'Y' && !R('c2').reviewReq && !R('c2').thread, '메모 없는 건: 바로 승인(질문·답변 없음)', R('c2'));
chk((await evalJs('window.__asked.length')) === 0, '메모 없는 건은 입력창이 안 뜸');
// 2) 메모 있는 건 — 입력 취소(null)면 승인 안 됨
await evalJs('window.__ans=null'); await okBtn('메모있음'); await wait(1500);
chk((await evalJs('window.__asked.length')) === 1 && R('c1').approved !== 'Y', '메모 있는 건: 입력창 뜸, 취소하면 승인 안 됨', R('c1'));
// 3) 남길 말 입력 → 승인 + 관리자 답변
await evalJs("window.__ans='15만원까지 OK'"); await okBtn('메모있음'); await wait(4500);
chk(R('c1').approved === 'Y' && R('c1').reviewReq && R('c1').reviewReq.status === '진행' && R('c1').reviewReq.reply === '15만원까지 OK' && !R('c1').reviewReq.ack, '승인 + 관리자 답변(진행) 저장', R('c1'));
chk(R('c1').thread && R('c1').thread.length === 2 && R('c1').thread[1].who === '관리자' && R('c1').thread[1].text === '승인 — 15만원까지 OK', '대화 기록에 [승인 — 내용] 남음', R('c1').thread);
chk(R('c1').thread[0].text === '단가 15만원 요구해요' && R('c1').memo === '승인 — 15만원까지 OK', '알바 메모는 대화에 남고, 메모 한 줄은 최근 말', R('c1').memo);
await wait(1500); dash = await evalJs("document.querySelector('.hk-page').innerText");
chk(dash.includes('관리자 답변') && dash.includes('15만원까지 OK'), '매니저 할 일에 관리자 답변이 뜸', dash.slice(0, 400));
// 4) 이미 '검토 요청' 중인 건 + 빈 답장 — 그래도 답변 상태가 됨
savedData.brands[0].claudeStep2Rows.push(S2('c3', '요청중', 'req_one', { dmSent: 'Y', replied: 'Y', pa: '안민영', contactStatus: '진행중', memo: '', reviewReq: { status: '요청', note: '문의', reply: '', reqTs: 5, reqAt: '26.11.20', replyAt: '', ack: '' } }));
rev++; await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await wait(3500);
await click('.brand-tab', '해트케'); await wait(1500);
await evalJs("window.__asked=[];window.prompt=(m)=>{window.__asked.push(m);return window.__ans}; window.__ans=''");
await okBtn('요청중'); await wait(4500);
chk(R('c3').approved === 'Y' && R('c3').reviewReq.status === '진행' && R('c3').thread[1].text === '승인', '검토요청 중 건 + 빈 답장 → 승인 + 답변(진행)', R('c3'));
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
