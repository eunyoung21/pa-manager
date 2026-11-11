/* 게시 링크 E2E — node test/post-link.e2e.mjs
   상세 창 광고코드·광고세팅 단계에서 넣은 게시 링크가 영상검수 게시 링크로(2026-10-26) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-postlink-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', memoReqMig: 'test', pendRejMig2: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
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
       localStorage.setItem('pa_mgr_auth', JSON.stringify(window.__AUTH__||(location.search.includes('staff')?{token:'T',username:'안민영',role:'staff',brand:'all',tabs:'claudeS2,step2,dashboard'}:{token:'T',username:'테스터',role:'manager',brand:'all'})));</script>`);
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9383', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9383/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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

const TD = (d => `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)(new Date());
const deal = { date: TD, dmDate: TD, pa: '안민영', contactStatus: '진행중', replied: 'Y', approved: 'Y', dealDone: 'Y', dealDate: TD };
savedData = { paList: ['안민영', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불', '휘핑크림 차렵이불'],
    claudeStep2Rows: [S2('c1', '안보냄', 'not_shipped', { ...deal, product: '해트케 압력이불' }),
      S2('c2', '보냄', 'shipped_one', { ...deal, product: '휘핑크림 차렵이불', shippingDone: '✅ 완료', shipDate: TD })] },
], settlements: {} };
const C = (id) => H().claudeStep2Rows.find((r) => r.id === id);
const srch = (v) => evalJs(`(()=>{const el=document.querySelector('.srch');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const openCh = async (n) => { await srch(n); await wait(400); return evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent===${J(n)});if(!s)throw new Error('채널명 없음 '+${J(n)});s.click();return 1})()`); };
const closeP = () => evalJs(`(()=>{const b=[...document.querySelectorAll('.s2p button')].find(x=>x.textContent.includes('닫기'));b&&b.click();return 1})()`);
const btns = () => evalJs(`[...document.querySelectorAll('.s2p .s2p-btns button')].map(b=>b.textContent.trim())`);

const RV = (id, ch, x = {}) => ({ id, date: TD, channelName: ch, realName: '', pa: '안민영', paCode: '', postLink: '', live: 'N', contractDone: 'N', ...x });
savedData = { paList: ['안민영', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케',
    claudeStep2Rows: [S2('p1', '코드단계', 'code_stage', { ...deal, shippingDone: '✅ 완료', shipDate: TD, productOnly: 'Y' }),
      S2('p2', '세팅단계', 'set_stage', { ...deal, shippingDone: '✅ 완료', contractDone: '✅ 완료', finalDone: 'Y', rate: '80,000' })],
    reviewRows: [RV('v2', '세팅단계', { paCode: 'adcode-x' })] },
], settlements: {} };
const setLink = (v) => evalJs(`(()=>{const g=[...document.querySelectorAll('.s2p .s2p-fg')].find(x=>x.querySelector('label').textContent==='게시 링크');if(!g)throw new Error('게시 링크 칸 없음');const el=g.querySelector('input');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${J(v)});el.dispatchEvent(new Event('input',{bubbles:true}));el.blur();return 1})()`);
const RVof = (ch) => H().reviewRows.find((r) => r.channelName === ch);

console.log('\n[알바] 광고코드 단계에서 게시 링크');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/?staff` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩');
await click('.step-tab', '자동화'); await wait(700);
await openCh('코드단계'); await waitFor(`document.querySelector('.s2p')`, '상세 창');
await setLink('https://www.instagram.com/reel/AAA/'); await wait(1200);
chk(RVof('코드단계') && RVof('코드단계').postLink === 'https://www.instagram.com/reel/AAA/', '영상검수 행이 생기고 게시 링크 저장', RVof('코드단계'));
await closeP(); await wait(300);

console.log('\n[관리자] 광고세팅 단계에서 게시 링크');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('자동화'))`, '앱 로딩(관리자)');
await click('.step-tab', '자동화'); await wait(700);
await openCh('세팅단계'); await waitFor(`document.querySelector('.s2p')`, '상세 창 2');
await setLink('https://www.instagram.com/reel/BBB/'); await wait(1200);
chk(RVof('세팅단계').postLink === 'https://www.instagram.com/reel/BBB/' && RVof('세팅단계').paCode === 'adcode-x', '기존 영상검수 행에 게시 링크(광고코드 그대로)', RVof('세팅단계'));
await closeP(); await wait(300);
await click('.step-tab', '영상검수'); await wait(800);
chk(await evalJs(`[...document.querySelectorAll('tbody tr')].some(t=>t.innerText.includes('세팅단계')&&t.querySelector('td[data-label="게시 링크"] a'))`), '영상검수 탭 게시 링크 칸에 보임');

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
