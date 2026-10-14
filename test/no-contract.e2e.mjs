/* 계약서 없는 제품 E2E — node test/no-contract.e2e.mjs
   휘핑크림 차렵이불(제품만 제공·원고료 없음)은 진행 단계·영상검수에서 계약서 단계가 빠진다(2026-10-14) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-no-contract-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
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
const H = () => savedData.brands.find((b) => b.id === 'hatke');
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
const iframeSrc = () => evalJs(`(document.querySelector('iframe[title="리스트업"]')||{}).src||''`);
const go = (to, rows, product) => evalJs(`(()=>{document.querySelector('iframe[title="리스트업"]').contentWindow.postMessage({type:'go',to:${J(to)},rows:${J(rows)},product:${J(product)}},'*');return 1})()`);

const shipped = { dealDone: 'Y', contactStatus: '진행중', shippingDone: '✅ 완료', shipDate: '26.10.10' };
const RV = (id, ch) => ({ id, date: '26.10.10', channelName: ch, realName: '', pa: '', paCode: '', postLink: '', live: 'N', contractDone: 'N', checks: {} });
savedData = { paList: ['박민선', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불', '휘핑크림 차렵이불'],
    step2Rows: [S2('s1', '사랑', 'sarang_haus', { product: '휘핑크림 차렵이불', pa: '박민선', ...shipped }),
      S2('s2', '압력이', 'press_one', { product: '해트케 압력이불', pa: '박민선', ...shipped }),
      S2('s3', '새차렵', 'new_cr', { product: '휘핑크림 차렵이불', pa: '박민선', contactStatus: '진행중' })],
    reviewRows: [RV('r1', '사랑'), RV('r2', '압력이')] },
], settlements: {} };
const srch = (v) => evalJs(`(()=>{const el=document.querySelector('.srch');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const openCh = async (n) => { await srch(n); await wait(400); return evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`); };
const closeP = () => evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`);
const steps = () => evalJs(`[...document.querySelectorAll('.s2p .s2p-tl-label')].map(x=>x.childNodes[0].textContent+(x.classList.contains('current')?'*':''))`);
const panelText = () => evalJs(`document.querySelector('.s2p .s2p-body').innerText`);

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩');
await click('.brand-tab', '해트케'); await wait(400);

console.log('\n[대시보드] 차렵이불은 계약서 할 일로 안 뜸');
await click('.step-tab', '대시보드'); await wait(800);
const todos = await evalJs(`[...document.querySelectorAll('.todo-item')].map(x=>x.innerText.replace(/\s+/g,' '))`);
chk(!todos.some((t) => t.includes('사랑') && t.includes('계약서')), '사랑(차렵이불) — 계약서 단계 아님', todos);
chk(todos.some((t) => t.includes('압력이') && t.includes('계약서')), '압력이(압력이불) — 계약서 단계 그대로', todos);

console.log('\n[인플루언서 관리 · 진행 단계]');
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('사랑'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
let st = await steps();
chk(!st.some((s) => s.startsWith('계약서')) && st.length === 5, '차렵이불: 계약서 단계 없이 5단계', st);
chk(st.includes('광고 코드/입금정보 수집*'), '제품 발송 다음 바로 광고 코드 단계', st);
await closeP(); await wait(300);
await openCh('압력이'); await waitFor(`document.querySelector('.s2p')`, '상세 창 2');
st = await steps();
chk(st.length === 6 && st.includes('계약서발송/수집*'), '압력이불: 계약서 단계 그대로(현재 단계)', st);
await closeP(); await wait(300);
await openCh('새차렵'); await waitFor(`document.querySelector('.s2p')`, '상세 창 3');
const pt = await panelText();
chk(pt.includes('계약서 없는 제품') && !pt.includes('📦 제품만 협찬'), 'DM 단계: 제품만 협찬 버튼 대신 안내 문구', pt.slice(0, 400));
await closeP(); await wait(300);

console.log('\n[영상검수 · 계약서 칸]');
await click('.step-tab', '영상검수'); await wait(800);
const cc = await evalJs(`[...document.querySelectorAll('tbody tr')].map(tr=>{const n=tr.querySelector('td[data-label="채널명"]');const c=tr.querySelector('td[data-label="계약서"]');return [tr.innerText.replace(/\s+/g," "),c?c.innerText.replace(/\s+/g,' ').trim():'']})`);
chk(cc.some(([n, c]) => n.includes('사랑') && c.includes('계약서 없음')), '사랑: 계약서 없음 표시', cc);
chk(cc.some(([n, c]) => n.includes('압력이') && c.includes('미작성')), '압력이: 계약서 토글 그대로', cc);

console.log('\n[⚙ 제품·옵션] 체크 해제하면 계약서 단계 복귀');
await click('.step-tab', '인플루언서 관리'); await wait(600);
await openCh('사랑'); await waitFor(`document.querySelector('.s2p')`, '상세 창 4');
await click('.s2p button', '제품·옵션'); await waitFor(`document.querySelector('.overlay .modal')`, '제품·옵션 창');
const boxes = await evalJs(`[...document.querySelectorAll('.overlay .modal .pc-prod')].map(p=>[p.querySelector('input').value,p.querySelector('input[type=checkbox]').checked])`);
chk(J(boxes) === J([['해트케 압력이불', false], ['휘핑크림 차렵이불', true]]), '기본값: 차렵이불만 계약서 없음 체크', boxes);
await evalJs(`(()=>{const p=[...document.querySelectorAll('.overlay .modal .pc-prod')][1];p.querySelector('input[type=checkbox]').click();return 1})()`); await wait(200);
await click('.overlay .modal .modal-foot button', '저장'); await wait(1500);
chk(J(H().productNoContract) === J({ '해트케 압력이불': false, '휘핑크림 차렵이불': false }), '저장: productNoContract', H().productNoContract);
st = await steps();
chk(st.length === 6 && st.includes('계약서발송/수집*'), '해제 후 계약서 단계 다시 보임', st);

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
