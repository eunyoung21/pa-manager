/* 제품만 제공 영상검수 E2E — node test/review-product-only.e2e.mjs
   무가 시딩(제품만 제공) 건은 영상검수 계약서·정산 칸이 비고 미정산에서 빠진다(2026-10-21) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-revpo-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8980, FPORT = 8981;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9379', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9379/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
    claudeStep2Rows: [S2('a1', '무가씨', 'free_one', { ...deal, productOnly: 'Y', finalDone: 'Y' }), S2('a2', '유가씨', 'paid_one', { ...deal, finalDone: 'Y', rate: '100,000' }), S2('a3', '무가완료', 'free_done', { ...deal, productOnly: 'Y', finalDone: 'Y', infSettled: 'Y', infSettledDate: TD })],
    reviewRows: [RV('v1', '무가씨'), RV('v2', '유가씨'), RV('v3', '무가완료')] },
], settlements: {} };
const cell = (ch, label) => evalJs(`(()=>{const tr=[...document.querySelectorAll("tbody tr")].find(t=>t.innerText.includes(${J(ch)}));if(!tr)throw new Error('행 없음 '+${J(ch)});return tr.querySelector('td[data-label="${label}"]').innerText.trim()})()`);

console.log('\n[관리자 영상검수] 제품만 제공 건');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('영상검수'))`, '앱 로딩');
await click('.step-tab', '영상검수'); await wait(900);
chk((await cell('무가씨', '계약서')) === '', '무가씨 계약서 칸 비움', await cell('무가씨', '계약서'));
chk((await cell('무가씨', '정산')) === '', '무가씨 정산 칸 비움', await cell('무가씨', '정산'));
chk((await cell('유가씨', '계약서')).includes('미작성'), '유가씨 계약서 버튼 그대로', await cell('유가씨', '계약서'));
chk((await cell('유가씨', '정산')).includes('미정산'), '유가씨 정산 그대로', await cell('유가씨', '정산'));
chk((await cell('무가완료', '정산')) === '', '정산완료로 찍힌 제품만 제공 건도 정산 칸 비움', await cell('무가완료', '정산'));
const paidChip = await evalJs(`([...document.querySelectorAll('.fchip')].find(b=>b.textContent.includes('정산완료'))||{}).textContent`);
chk(paidChip.includes('(0)'), '정산완료 칩에서도 빠짐', paidChip);
await evalJs(`(()=>{const s=[...document.querySelectorAll('td[data-label="채널명"] .ch-link')].find(x=>x.textContent==='유가씨');if(!s)throw new Error('영상검수 채널명 링크 없음');s.click();return 1})()`);
await waitFor(`document.querySelector('.s2p')`, '영상검수 → 상세 창');
chk(await evalJs(`document.querySelector('.s2p input').value`) === '유가씨', '영상검수 채널명 → 그 사람 상세 창');
chk((await evalJs(`(document.querySelector('.step-tab.active')||{}).textContent`)).includes('영상검수'), '탭 그대로 영상검수');
await closeP(); await wait(300);
const chip = await evalJs(`([...document.querySelectorAll('.fchip')].find(b=>b.textContent.includes('미정산'))||{}).textContent`);
chk(chip.includes('(1)'), '미정산 칩 = 1(무가씨 제외)', chip);

console.log('\n[관리자 대시보드] 💰 정산 대기에서 제품만 제공 건 제외');
await click('.step-tab', '대시보드'); await wait(900);
const settle = await evalJs(`(()=>{const g=[...document.querySelectorAll('.todo-group')].find(x=>x.innerText.includes('정산 대기'));return g?[...g.querySelectorAll('.todo-name')].map(x=>x.textContent):[]})()`);
chk(settle.includes('유가씨') && !settle.includes('무가씨'), '정산 대기 = 유가씨만', settle);

console.log('\n[관리자 상세 창] 제품만 제공 = 광고세팅만');
await click('.step-tab', '자동화'); await wait(700);
await openCh('무가씨'); await waitFor(`document.querySelector('.s2p')`, '상세 창(무가)');
let tl = await evalJs(`[...document.querySelectorAll('.s2p-tl-label')].map(x=>x.childNodes[0].textContent)`);
let bb = await evalJs(`[...document.querySelectorAll('.s2p button')].map(b=>b.textContent.trim())`);
chk(tl.includes('광고세팅') && tl.includes('광고 코드 수집') && !tl.some((x) => x.includes('입금')), '단계 이름에 입금 없음', tl);
chk(bb.includes('✓ 광고세팅 완료') && !bb.some((x) => x.includes('입금')), '버튼 = ✓ 광고세팅 완료(입금 버튼 없음)', bb);
await click('.s2p button', '✓ 광고세팅 완료'); await wait(1200);
const a1 = H().step2Rows.find((r) => r.name === '무가씨') || H().claudeStep2Rows.find((r) => r.id === 'a1');
chk(a1.infSettled === 'Y', '완료 기록 저장(기존 규칙과 같은 칸)', a1.infSettled);
await closeP(); await wait(300);
await openCh('유가씨'); await waitFor(`document.querySelector('.s2p')`, '상세 창(유가)');
bb = await evalJs(`[...document.querySelectorAll('.s2p button')].map(b=>b.textContent.trim())`);
chk(bb.includes('✓ 광고세팅 및 입금 완료'), '원고료 있는 건은 그대로 광고세팅 및 입금', bb);

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
