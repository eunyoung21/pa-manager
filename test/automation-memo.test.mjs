/* 자동화 탭(🤖) 메모가 사라지지 않는지 확인 — 2026-08-21 재발방지
   증상: 알바가 자동화 탭에 남긴 메모가 새로고침/2분 폴링마다 지워졌다.
   원인: 로드 정규화(normalizeData)가 claudeStep2Rows 의 memo 를 매번 ''로 비웠다(clearMemo).
   이 테스트는 index.html 을 실제 크롬에 띄워 normalizeData 를 그대로 실행해 메모 보존을 확인한다.
   실행: node test/automation-memo.test.mjs   (index.html 경로 인자 선택) */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const FILE = path.resolve(process.argv[2] || new URL('../index.html', import.meta.url).pathname.replace(/^\//, ''));
const html = fs.readFileSync(FILE, 'utf8');
const PORT = 8791;
const server = http.createServer((_q, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const TMP = path.join(os.tmpdir(), 'pa-memo-test');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof'); fs.rmSync(UD, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9335',
  '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { const j = await (await fetch('http://127.0.0.1:9335/json/version')).json(); return j.webSocketDebuggerUrl; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('크롬 기동 실패');
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const waiters = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId; waiters.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const evalJs = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 오류: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; ; i++) {
  if (await evalJs(`typeof window.normalizeData==='function'`)) break;
  if (i > 120) throw new Error('앱 스크립트 로드 실패');
  await new Promise(r => setTimeout(r, 250));
}

const fixture = {
  brands: [{
    id: 'b1', name: '베이스튠',
    step1Rows: [], step2Rows: [{ id: 's2', name: '일반탭행', memo: '일반탭 메모' }],
    claudeStep1Rows: [],
    claudeStep2Rows: [{ id: 'c1', name: '테스트계정', pa: '안민영', memo: '알바가 남긴 메모', contactStatus: '컨택 전', dmSent: 'N', dealDone: 'N' }],
    shippingRows: [], reviewRows: [], privacyRows: []
  }],
  settlements: {}, paList: []
};
const out = await evalJs(`(()=>{const d=window.normalizeData(${JSON.stringify(fixture)});const b=d.brands[0];
  return {claudeMemo:(b.claudeStep2Rows[0]||{}).memo, step2Memo:(b.step2Rows[0]||{}).memo};})()`);

try { chrome.kill(); } catch {}
server.close();

let bad = 0;
const chk = (cond, label) => { console.log((cond ? '  OK  ' : '  실패 ') + label); if (!cond) bad++; };
chk(out.claudeMemo === '알바가 남긴 메모', `자동화 탭 메모 보존 (받은 값: ${JSON.stringify(out.claudeMemo)})`);
chk(out.step2Memo === '일반탭 메모', `일반 탭 메모 보존 (받은 값: ${JSON.stringify(out.step2Memo)})`);
console.log(bad ? `\n실패 ${bad}건` : '\n통과');
process.exit(bad ? 1 : 0);
