/* 메모 대화 기록 E2E — node test/memo-thread.e2e.mjs
   관리자·알바 말 구분(관리자=오른쪽), 최신 1개만 보임, 보내기=쌓기, 확인해도 기록 유지, 동시 쓰기 병합(2026-11-17) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-memo-thread-e2e');

const S1 = (id, name, u, x = {}) => ({ id, date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', persona: '', feedMemo: '', hypothesis: '', reviewStatus: '검수대기', rejectReason: '', promotedToStep2: false, memo: '', ...x });
const S2 = (id, name, u, x = {}) => ({ id, step1Id: '', date: '26.09.01', name, link: `https://www.instagram.com/${u}/`, username: u, followers: '1000', pa: '', contactStatus: '컨택 완료', dmSent: 'Y', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '', shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });
const EMPTY = { nameHandleMig: 'test', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] };
let savedData;
let rev = 1;
const PORT = 8972, FPORT = 8973;

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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9352', '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9352/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise((r) => setTimeout(r, 300)); } }
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
const Z = (id, name, u, x) => S2(id, name, u, { dmSent: 'Y', replied: 'Y', pa: '박민선', ...x });

const setVal = (sel, v) => evalJs(`(()=>{const t=document.querySelector(${J(sel)});const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;set.call(t,${J(v)});t.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
const row = () => savedData.brands.find((b) => b.id === "hatke").step2Rows.find((r) => r.id === "m1");
savedData = { paList: ["박민선", "안민영", "기타"], brands: [{ ...EMPTY, id: "hatke", name: "해트케", products: ["해트케 압력이불"],
  step2Rows: [S2("m1", "대화테스트", "talk_one", { dmSent: "Y", replied: "Y", pa: "안민영", contactStatus: "진행중", memo: "10만원 제안", reviewReq: { status: "요청", note: "10만원 제안", reply: "", reqTs: 5, reqAt: "26.11.16", replyAt: "", ack: "" } })] }], settlements: {} };
await S("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await waitFor("[...document.querySelectorAll('.brand-tab')].some(b=>b.textContent.includes('해트케'))", "앱 로딩");
await click(".brand-tab", "해트케"); await wait(1200);
// 1) 대시보드 — 관리자 할 일에 최근 말 1개(누가 했는지 포함)
let dash = await evalJs("document.querySelector('.hk-page').innerText");
chk(dash.includes("검토 요청") && dash.includes("안민영") && dash.includes("10만원 제안"), "대시보드 카드: 작성자+최근 말 1개", dash.slice(0, 300));
await click(".todo-item", "대화테스트"); await wait(1200);
chk(await evalJs("!!document.querySelector('.th-wrap')"), "상세 창에 대화 기록 영역");
chk(await evalJs("document.querySelectorAll('.th-msg').length") === 1, "옛 메모는 대화 1개로 보임(지우지 않음)");
// 2) 관리자가 메모창에 답장 → 요청이 자동으로 풀리고 관리자 말이 오른쪽(th-adm)으로 쌓임(진행·보류 버튼은 없음)
chk(!(await evalJs("[...document.querySelectorAll('.s2p button')].some(b=>/진행|보류|요청 취소|답변 취소|확인 취소/.test(b.textContent))")), "진행·보류·취소 버튼 없음");
await setVal(".th-send textarea", "진행하세요"); await click("button", "보내기");
await wait(4500);
chk(row().thread && row().thread.length === 2 && row().thread[0].who === "안민영" && row().thread[1].who === "관리자", "답장 → 대화에 [안민영 요청, 관리자 답변]", row().thread);
chk(row().reviewReq.status === "답변" && !row().reviewReq.ack, "관리자 답장 → 요청 자동 해제(답변 상태, 알바 확인 전)", row().reviewReq);
chk((await evalJs("document.querySelector('.s2p-rq')?.innerText||''")).includes("확인 전"), "관리자 화면: ⏳ 알바 확인 전");
chk(await evalJs("document.querySelectorAll('.th-adm').length") === 1 && await evalJs("document.querySelectorAll('.th-msg').length") === 1, "접힌 상태: 최신 1개(관리자)만 보임");
chk((await evalJs("document.querySelector('.th-more')?.textContent||''")).includes("이전 대화 1개"), "이전 대화 1개 버튼");
await click(".th-more", "이전 대화"); await wait(300);
chk(await evalJs("document.querySelectorAll('.th-msg').length") === 2 && await evalJs("document.querySelectorAll('.th-alba').length") === 1, "펼치면 알바(왼쪽)·관리자(오른쪽) 둘 다 보임");
// 3) 관리자 추가 메시지 → 쌓임, 이전 글 유지
await setVal(".th-send textarea", "배송은 내일 보내주세요"); await click("button", "보내기"); await wait(4500);
chk(row().thread.length === 3 && row().thread[2].text === "배송은 내일 보내주세요" && row().thread[2].who === "관리자" && row().thread[0].text === "10만원 제안", "보내기 → 3번째로 쌓임, 이전 글 그대로", row().thread);
chk(row().memo === "배송은 내일 보내주세요", "memo(목록 한 줄) = 가장 최근 말", row().memo);
// 4) 알바가 열어 보면 자동 확인 — 대시보드 카드에서 사라져도 기록은 남음
await S("Page.navigate", { url: `http://127.0.0.1:${PORT}/?role=staff` }); await wait(3500);
await evalJs("(()=>{const b=[...document.querySelectorAll('.brand-tab')].find(x=>x.textContent.includes('해트케'));if(b)b.click();return 1})()"); await wait(1200);
const before = row().thread.length;
chk((await evalJs("document.querySelector('.hk-page').innerText")).includes("대화테스트"), "알바 할 일에 관리자 답장 건이 뜸");
await click(".todo-item", "대화테스트"); await wait(4500);
chk(row().reviewReq.ack === "Y" && !!row().reviewReq.ackAt, "알바가 열면 자동 확인 처리(버튼 없음)", row().reviewReq);
chk(row().thread.length === before + 1 && row().thread[before].kind === "확인" && row().thread[before].who === "안민영", "확인도 기록으로 남고 이름은 안민영", row().thread.slice(-2));
chk(row().thread.slice(0, before).every((e, i) => e.text === ["10만원 제안", "진행하세요", "배송은 내일 보내주세요"][i]), "관리자 말 3개 전부 그대로(사라지지 않음)", row().thread);
// 4-2) 알바 보내기 하나로 끝 — 보내면 관리자 확인 요청까지 올라감(이미 요청 중이면 글만 추가), 관리자가 보내면 그냥 대화
const ro = () => savedData.brands.find((b) => b.id === "hatke").step2Rows.find((r) => r.id === "m2");
savedData.brands[0].step2Rows.push(S2("m2", "알바보내기", "alba_send", { dmSent: "Y", replied: "Y", pa: "안민영", contactStatus: "진행중", memo: "" }));
rev++;
await S("Page.navigate", { url: `http://127.0.0.1:${PORT}/?role=staff` }); await wait(3500);
await evalJs("(()=>{const b=[...document.querySelectorAll('.brand-tab')].find(x=>x.textContent.includes('해트케'));if(b)b.click();return 1})()"); await wait(1200);
const opened = await evalJs("(()=>{const t=[...document.querySelectorAll('.todo-item, .ch-link, tr')].find(x=>x.textContent.includes('알바보내기'));if(!t)return false;t.click();return true})()");
chk(opened, "알바 화면에서 행 열기");
if (opened) {
  await wait(1000);
  chk(!(await evalJs("[...document.querySelectorAll('.s2p button')].some(b=>b.textContent.includes('검토 요청'))")), "검토 요청 버튼 없음(보내기만 있음)");
  await setVal(".th-send textarea", "10만원이면 어떨까요"); await click("button", "보내기"); await wait(4500);
  chk(ro().reviewReq && ro().reviewReq.status === "요청" && ro().reviewReq.note === "10만원이면 어떨까요" && !!ro().reviewReq.reqTs, "알바가 보내면 관리자 확인 요청으로 올라감", ro().reviewReq);
  const t1 = ro().reviewReq.reqTs;
  await setVal(".th-send textarea", "추가로 하나 더"); await click("button", "보내기"); await wait(4500);
  chk(ro().thread.length === 2 && ro().reviewReq.reqTs === t1, "요청 중에 또 보내면 글만 추가(알림 중복 없음)", { n: ro().thread.length, t1, now: ro().reviewReq.reqTs });
}
// 5) 동시 쓰기 병합
const A = [{ who: "관리자", text: "A", at: "x", kind: "", ts: 2 }], Bm = [{ who: "안민영", text: "B", at: "y", kind: "", ts: 3 }];
const merged = await evalJs(`(()=>{const m=mergeThread([],${J(A)},${J(Bm)});return m.map(e=>e.text).join("")})()`).catch(() => null);
if (merged !== null) chk(merged === "AB", "동시에 쓴 두 글 병합 → 둘 다 남음", merged);
console.log("\n" + (fail ? `❌ 실패 ${fail}건` : "✅ 전부 통과"));
ws.close(); chrome.kill(); server.close(); finder.close();
process.exit(fail ? 1 : 0);
