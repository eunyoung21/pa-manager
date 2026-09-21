/* 화면 점검용 스크린샷 — 개발 서버(dev-server.mjs)를 띄운 뒤 실행.
   node dev/shots.mjs [탭키...]   → _local/shots/<탭>.png
   탭키: dashboard step1 step2 claudeS2 shipping review dm settle guide users log */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const OUT = path.join(ROOT, '_local', 'shots');
const URL_ = process.env.URL || 'http://127.0.0.1:8930/';
const W = Number(process.env.W || 1400), H = Number(process.env.H || 900);
const tabs = process.argv.slice(2).length ? process.argv.slice(2) : ['dashboard', 'step1', 'step2', 'claudeS2', 'shipping', 'review', 'settle'];
fs.mkdirSync(OUT, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(os.tmpdir(), 'pa-v2-shots'); fs.rmSync(UD, { recursive: true, force: true });
const PORT = 9366;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
  `--window-size=${W},${H}`, '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); }
  catch { await new Promise(r => setTimeout(r, 300)); }
}
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async expr => (await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
await S('Page.navigate', { url: URL_ });
for (let i = 0; i < 80; i++) { if (await ev("!!document.querySelector('.step-tab')")) break; await sleep(250); }
await sleep(800);
const errs = [];
await S('Runtime.enable');
for (const t of tabs) {
  const label = { dashboard: '대시보드', manage: '인플루언서 관리', panel: '인플루언서 관리', step1: 'STEP1', step2: 'STEP2', claudeS2: '자동화', shipping: '출고', review: '영상검수', dm: 'DM', settle: '정산', guide: '가이드' }[t] || t;
  const ok = await ev(`(()=>{const b=[...document.querySelectorAll('.step-tab')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(b){b.click();return true}
    const m=[...document.querySelectorAll('.step-tab')].find(b=>b.textContent.includes('더보기'));if(m){m.click();}return false})()`);
  if (!ok) { await sleep(200); await ev(`(()=>{const b=[...document.querySelectorAll('.menu-item')].find(b=>b.textContent.includes(${JSON.stringify(label)}));b&&b.click()})()`); }
  await sleep(900);
  if (process.env.PT) { await ev('(()=>{const b=[...document.querySelectorAll(".ptab")].find(x=>x.textContent.includes('+JSON.stringify(process.env.PT)+'));b&&b.click()})()'); await sleep(500); }
  if (process.env.FT) { await ev('(()=>{const b=[...document.querySelectorAll(".filter-tab")].find(x=>x.textContent.includes('+JSON.stringify(process.env.FT)+'));b&&b.click()})()'); await sleep(600); }
  if (process.env.ADD) { await ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('인플루언서 추가'));b&&b.click()})()"); await sleep(700); }
  if (t === 'panel' || process.env.OPEN) { await ev("(()=>{const r=document.querySelector('.hk-table tbody tr');r&&r.click()})()"); await sleep(700); }
  const { result } = await S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${t}${W < 700 ? '-m' : ''}.png`), Buffer.from(result.data, 'base64'));
  console.log('shot', t);
}
const bad = await ev("document.body.innerText.includes('오류')&&document.querySelector('pre')?document.querySelector('pre').innerText.slice(0,300):''");
if (bad) console.log('화면 오류:', bad);
ws.close(); chrome.kill();
