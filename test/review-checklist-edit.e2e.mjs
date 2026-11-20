/* 검수 체크리스트 관리자 편집 E2E — node test/review-checklist-edit.e2e.mjs
   관리자만 ✎편집 · 항목 수정/추가 · 사진 올리기 · 저장 → 담당자 화면에도 보임(2026-11-20) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-checklist-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8988, FPORT = 8989;

// PA(목 백엔드)
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_finder_url','http://127.0.0.1:${FPORT}');
       localStorage.setItem('pa_mgr_auth', JSON.stringify(${req.url.includes('role=staff')?'{token:"T",username:"minyoung",role:"staff",brand:"all",pa:["안민영"],tabs:"review,shipping"}':'{token:"T",username:"테스터",role:"manager",brand:"all"}'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', (c) => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'users' || b.action === 'logs') return send({ ok: true, users: [], logs: [] });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    if (b.action === 'pfileSave') { global.__pf=(global.__pf||[]); global.__pf.push(b.data); return send({ ok: true, url: '/api/pfile?id=' + global.__pf.length }); }
    if (b.action === 'pfileGet') { return send({ ok: true, dataUrl: (global.__pf||[])[Number(b.id)-1] }); }
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9368', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9368/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const PNG = path.join(TMP, 'ck-test.png'); fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const setInp = (sel, idx, v) => evalJs(`(()=>{const t=document.querySelectorAll(${J2(sel)})[${idx}];const P=t.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(P.prototype,'value').set.call(t,${J2(v)});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const btn = (txt) => evalJs(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes(${J2(txt)}))`);
const clickBtn = (txt) => evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${J2(txt)}));if(!b)throw new Error('없음: '+${J2(txt)});b.click();return 1})()`);
const openChecklist = async () => { await clickBtn('영상검수'); await wait(1200);
  await evalJs("(()=>{const h=[...document.querySelectorAll('span')].find(x=>x.textContent.includes('1차 영상 검수 체크리스트'));h.click();return 1})()"); await wait(500); };
savedData = { paList: ['박민선', '안민영', '기타'], brands: [{ ...EMPTY, id: 'hatke', name: '해트케', products: ['해트케 압력이불'] }], settlements: {} };
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", '앱 로딩');
await click('.brand-tab', '해트케'); await wait(1200);
await openChecklist();
let txt = await evalJs("document.querySelector('.ck-card').innerText");
chk(txt.includes('나레이션 오류 여부') && txt.includes('면책문구'), '기본 체크리스트가 그대로 보임');
chk(await btn('✎ 편집'), '관리자에게는 ✎ 편집 버튼이 보임');
// 편집
await clickBtn('✎ 편집'); await wait(500);
await setInp('.ck-t', 0, '나레이션 오류 여부 (수정됨)');
await evalJs("document.querySelectorAll('.ck-add')[0].click()"); await wait(300);
const n = await evalJs("document.querySelectorAll('.ck-edit-item').length");
await setInp('.ck-t', n - 1, '새 항목 테스트'); await setInp('.ck-note', n - 1, '예) 설명 문구');
// 사진
await S('DOM.enable'); const { root } = await S('DOM.getDocument', { depth: -1 });
const { nodeIds } = await S('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.ck-file' });
await S('DOM.setFileInputFiles', { files: [PNG], nodeId: nodeIds[nodeIds.length - 1] });
await waitFor("document.querySelectorAll('.ck-edit-item')[document.querySelectorAll('.ck-edit-item').length-1].querySelector('img')", '사진 올라감');
chk(true, '사진이 올라가 미리보기가 보임');
// 항목이 많아도 스크롤이 됨 — 12칸 더 늘려 본문이 자체 스크롤되고, 맨 아래로 내려도 저장 버튼이 화면 안에 있어야 한다
for (let i = 0; i < 12; i++) await evalJs("document.querySelectorAll('.ck-add')[1].click()");
await wait(500);
const sc = await evalJs("(()=>{const b=document.querySelector('.ck-body');return {over:b.scrollHeight>b.clientHeight+20,ov:getComputedStyle(b).overflowY}})()");
chk(sc.over && sc.ov === 'auto', '항목이 많으면 체크리스트 본문이 스크롤됨', sc);
await evalJs("(()=>{const b=document.querySelector('.ck-body');b.scrollTop=b.scrollHeight;return 1})()"); await wait(300);
chk(await evalJs("(()=>{const r=document.querySelector('.ck-save').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"), '맨 아래까지 내려도 저장 버튼이 화면 안에 보임');
await evalJs("document.querySelector('.ck-save').click()"); await wait(4500);
const ck = savedData.brands[0].reviewChecklist;
chk(ck && ck.common[0].t === '나레이션 오류 여부 (수정됨)', '수정한 내용이 저장됨', ck && ck.common[0]);
const last = ck && ck.common[ck.common.length - 1];
chk(last && last.t === '새 항목 테스트' && last.note === '예) 설명 문구', '추가한 항목이 저장됨', last);
chk(last && last.imgs && last.imgs.length === 1 && /pfile\?id=\d+/.test(last.imgs[0].url), '사진은 첨부 저장소 주소로 저장됨(본문에 base64 안 박힘)', last && last.imgs);
txt = await evalJs("document.querySelector('.ck-card').innerText");
chk(txt.includes('새 항목 테스트') && txt.includes('(수정됨)') && !(await btn('저장')), '저장 후 보기 화면으로 돌아와 반영됨');
await waitFor("document.querySelector('.ck-card img')", '보기 화면 사진');
chk(await evalJs("document.querySelector('.ck-card img').src.startsWith('data:image')"), '보기 화면에서도 사진이 보임');
// 담당자 화면
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/?role=staff` }); await wait(3500);
await evalJs("(()=>{const b=[...document.querySelectorAll('.brand-tab')].find(x=>x.textContent.includes('해트케'));if(b)b.click();return 1})()"); await wait(1200);
await openChecklist();
txt = await evalJs("document.querySelector('.ck-card')?.innerText||''");
chk(txt.includes('새 항목 테스트') && txt.includes('(수정됨)'), '담당자 화면에도 바뀐 내용이 보임', txt.slice(0, 200));
chk(!(await btn('✎ 편집')), '담당자에게는 ✎ 편집 버튼이 없음');
await waitFor("document.querySelector('.ck-card img')", '담당자 사진').catch(() => {});
chk(await evalJs("!!document.querySelector('.ck-card img')"), '담당자 화면에도 사진이 보임');
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
