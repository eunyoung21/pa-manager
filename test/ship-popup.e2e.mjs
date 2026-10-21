/* 출고 정보 팝업 E2E — node test/ship-popup.e2e.mjs
   대시보드 📦 출고 정보에서 이름을 누르면 그 사람 출고 내용 팝업, ✓ 완료하면 목록에서 빠짐(2026-10-20) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-shippop-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8978, FPORT = 8979;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9377', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9377/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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

savedData = { paList: ['안민영', '기타'], brands: [
  { ...EMPTY, id: 'hatke', name: '해트케',
    claudeStep2Rows: [S2('p1', '끌로에 하우스', 'chloe_house', { ...deal, product: '해트케 압력이불', opt: { 색상: '화이트' }, shippingDone: '✅ 완료', shipDate: TD, realName: '김하나', phone: '010-1234-5678', address: '서울시 강남구 1' })],
    shippingRows: [{ id: 'sh1', requestDate: TD, requester: '안민영', channelName: '끌로에 하우스', recipient: '김하나', phone: '010-1234-5678', address: '서울시 강남구 1', product: '해트케 압력이불', qty: '1', notes: '', tracking: '', status: '처리중', fromContact: 'Y' },
      { id: 'sh2', requestDate: TD, requester: '안민영', channelName: '화이트코지하우스', recipient: '박둘', phone: '010-2222-3333', address: '부산시 해운대구 2', product: '휘핑크림 차렵이불', qty: '2', notes: '10/26 발송', tracking: '', status: '처리중' }] },
], settlements: {} };

console.log('\n[관리자 대시보드] 📦 출고 정보 이름 → 팝업');
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('대시보드'))`, '앱 로딩');
await click('.step-tab', '대시보드'); await wait(800);
await evalJs(`(()=>{const box=[...document.querySelectorAll('.todo-box')].find(b=>b.textContent.includes('출고 정보'));if(!box)throw new Error('출고 정보 없음');[...box.querySelectorAll('.todo-name')].find(x=>x.textContent==='끌로에 하우스').click();return 1})()`);
await waitFor(`document.querySelector('.modal')`, '팝업');
const txt = await evalJs(`document.querySelector('.modal').innerText`);
chk(['김하나', '010-1234-5678', '서울시 강남구 1', '해트케 압력이불 · 화이트 (1)', '안민영'].every((s) => txt.includes(s)), '받는 분·연락처·주소·상품(옵션)·담당 표시', txt);
chk((await evalJs(`(document.querySelector('.step-tab.active')||{}).textContent`)).includes('대시보드'), '탭 그대로 대시보드');
await evalJs(`(()=>{window.__clip='';navigator.clipboard.writeText=t=>{window.__clip=t;return Promise.resolve();};document.querySelector('.modal .row-copy-btn').click();return 1})()`); await wait(200);
const clip = await evalJs(`window.__clip`);
chk(clip === '김하나\t010-1234-5678\t서울시 강남구 1\t해트케 압력이불 · 화이트 (1)', '한 번에 복사 = 받는 분·연락처·주소·상품 (수량)', clip);
await click('.modal button', '✓ 완료'); await wait(1200);
const sh = H().shippingRows.find((r) => r.id === 'sh1');
chk(sh.status === '✅ 완료', '✓ 완료 저장', sh.status);
chk(!(await evalJs(`!!document.querySelector('.modal')`)), '팝업 닫힘');
chk(!(await evalJs(`[...document.querySelectorAll('.todo-box')].some(b=>b.textContent.includes('출고 정보'))`)), '출고 정보 목록에서 빠짐');

console.log('\n[📦 출고 탭] 채널명 누르면 같은 팝업');
await click('.step-tab', '출고'); await wait(800);
await evalJs(`(()=>{const s=[...document.querySelectorAll('.ch-link')].find(x=>x.textContent==='화이트코지하우스');if(!s)throw new Error('채널명 링크 없음');s.click();return 1})()`);
await waitFor(`document.querySelector('.modal')`, '출고 탭 팝업');
const t2 = await evalJs(`document.querySelector('.modal').innerText`);
chk(['화이트코지하우스', '박둘', '010-2222-3333', '부산시 해운대구 2', '휘핑크림 차렵이불 (2)', '10/26 발송'].every((s) => t2.includes(s)), '출고 탭 팝업 내용', t2);
await evalJs(`(()=>{window.__clip='';document.querySelector('.modal .row-copy-btn').click();return 1})()`); await wait(200);
const clip2 = await evalJs(`window.__clip`);
chk(clip2.endsWith('휘핑크림 차렵이불 (2)'), '출고 탭 팝업 복사에 수량 (2)', clip2);
await click('.modal button', '✓ 완료'); await wait(1200);
chk(H().shippingRows.find((r) => r.id === 'sh2').status === '✅ 완료', '출고 탭 팝업 ✓ 완료 저장');
const links0 = await evalJs(`document.querySelectorAll('td[data-label="채널명"] .ch-link').length`);
await evalJs(`(()=>{const e=document.querySelector('td[data-label="채널명"] span[title="채널명 고치기"]');if(!e)throw new Error('✎ 없음');e.click();return 1})()`); await wait(300);
const links1 = await evalJs(`document.querySelectorAll('td[data-label="채널명"] .ch-link').length`);
chk(links0 >= 1 && links1 === links0 - 1, '✎ 누르면 그 줄 채널명이 입력칸으로', { links0, links1 });

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
